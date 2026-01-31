"""
Admin Agent Database Layer
Provides schema discovery and safe SQL execution for the admin data agent.
Uses asyncpg for direct PostgreSQL access with safety guardrails.
"""

import os
import re
import logging
import asyncio
from typing import Any, Dict, List, Optional, Tuple

import asyncpg

from services.database_config import get_database_connection_string

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Connection pool (module-level singleton)
# ---------------------------------------------------------------------------
_pool: Optional[asyncpg.Pool] = None
_pool_lock = asyncio.Lock()


async def _get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None or _pool._closed:
        async with _pool_lock:
            if _pool is None or _pool._closed:
                dsn = get_database_connection_string()
                _pool = await asyncpg.create_pool(
                    dsn,
                    min_size=1,
                    max_size=5,
                    command_timeout=30,
                    statement_cache_size=0,
                )
                logger.info("[AdminAgent] asyncpg pool created")
    return _pool


# ---------------------------------------------------------------------------
# Schema discovery
# ---------------------------------------------------------------------------
_schema_cache: Optional[Dict[str, Any]] = None


async def discover_schema(force_refresh: bool = False) -> Dict[str, Any]:
    """Query information_schema for all user tables, columns, types, and constraints."""
    global _schema_cache
    if _schema_cache is not None and not force_refresh:
        return _schema_cache

    pool = await _get_pool()
    async with pool.acquire() as conn:
        # Get all user tables (exclude pg_ and information_schema)
        rows = await conn.fetch("""
            SELECT
                c.table_name,
                c.column_name,
                c.data_type,
                c.is_nullable,
                c.column_default,
                c.character_maximum_length,
                tc.constraint_type
            FROM information_schema.columns c
            LEFT JOIN information_schema.key_column_usage kcu
                ON c.table_name = kcu.table_name
                AND c.column_name = kcu.column_name
                AND c.table_schema = kcu.table_schema
            LEFT JOIN information_schema.table_constraints tc
                ON kcu.constraint_name = tc.constraint_name
                AND kcu.table_schema = tc.table_schema
            WHERE c.table_schema = 'public'
            ORDER BY c.table_name, c.ordinal_position
        """)

        tables: Dict[str, Dict] = {}
        for row in rows:
            tname = row["table_name"]
            if tname not in tables:
                tables[tname] = {"columns": []}
            tables[tname]["columns"].append({
                "name": row["column_name"],
                "type": row["data_type"],
                "nullable": row["is_nullable"] == "YES",
                "default": row["column_default"],
                "max_length": row["character_maximum_length"],
                "constraint": row["constraint_type"],
            })

        # Get row counts (approximate via pg_stat for speed)
        for tname in list(tables.keys()):
            try:
                count_row = await conn.fetchrow(
                    "SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = $1",
                    tname,
                )
                tables[tname]["row_count_estimate"] = int(count_row["estimate"]) if count_row else 0
            except Exception:
                tables[tname]["row_count_estimate"] = -1

        _schema_cache = {"tables": tables}
        logger.info(f"[AdminAgent] Discovered schema: {len(tables)} tables")
        return _schema_cache


# ---------------------------------------------------------------------------
# SQL safety
# ---------------------------------------------------------------------------
_BLOCKED_KEYWORDS = re.compile(
    r"\b(DROP\s+TABLE|DROP\s+DATABASE|DROP\s+SCHEMA|TRUNCATE|GRANT|REVOKE)\b",
    re.IGNORECASE,
)


def validate_sql(sql: str, operation_type: str) -> Tuple[bool, str]:
    """Validate SQL for safety. Returns (is_valid, error_message)."""
    stripped = sql.strip().rstrip(";")

    # Block multiple statements
    # Naive check: look for semicolons not inside string literals
    if ";" in stripped:
        return False, "Multiple statements are not allowed"

    # Block dangerous DDL/admin commands
    if _BLOCKED_KEYWORDS.search(stripped):
        return False, "Statement contains blocked keywords (DDL/admin commands are not allowed)"

    # For DELETE/UPDATE, require a WHERE clause
    if operation_type in ("delete", "update"):
        if not re.search(r"\bWHERE\b", stripped, re.IGNORECASE):
            return False, f"{operation_type.upper()} without WHERE clause is not allowed"

    return True, ""


# ---------------------------------------------------------------------------
# Query execution
# ---------------------------------------------------------------------------
MAX_READ_ROWS = 1000
READ_TIMEOUT = 30  # seconds
WRITE_TIMEOUT = 60  # seconds


async def execute_read_query(
    sql: str, params: Optional[List[Any]] = None
) -> Dict[str, Any]:
    """Execute a read-only query with safety limits."""
    is_valid, err = validate_sql(sql, "select")
    if not is_valid:
        return {"error": err, "columns": [], "rows": [], "row_count": 0}

    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction(readonly=True):
            try:
                # Apply row limit
                limited_sql = sql.rstrip(";").strip()
                # Only add LIMIT if there isn't one already
                if not re.search(r"\bLIMIT\b", limited_sql, re.IGNORECASE):
                    limited_sql += f" LIMIT {MAX_READ_ROWS}"

                if params:
                    records = await asyncio.wait_for(
                        conn.fetch(limited_sql, *params),
                        timeout=READ_TIMEOUT,
                    )
                else:
                    records = await asyncio.wait_for(
                        conn.fetch(limited_sql),
                        timeout=READ_TIMEOUT,
                    )

                if not records:
                    return {"columns": [], "rows": [], "row_count": 0}

                columns = list(records[0].keys())
                rows = [_serialize_row(dict(r)) for r in records]
                return {
                    "columns": columns,
                    "rows": rows,
                    "row_count": len(rows),
                    "truncated": len(rows) >= MAX_READ_ROWS,
                }
            except asyncio.TimeoutError:
                return {"error": "Query timed out (30s limit)", "columns": [], "rows": [], "row_count": 0}
            except Exception as e:
                logger.error(f"[AdminAgent] Read query error: {e}")
                return {"error": str(e), "columns": [], "rows": [], "row_count": 0}


async def execute_write_query(
    sql: str, params: Optional[List[Any]] = None
) -> Dict[str, Any]:
    """Execute a write query (INSERT/UPDATE/DELETE).

    DELETEs are wrapped in a transaction and rolled back if more than 1 row is affected.
    """
    op = sql.strip().split()[0].lower() if sql.strip() else ""
    is_valid, err = validate_sql(sql, op)
    if not is_valid:
        return {"error": err, "affected_rows": 0}

    is_delete = op == "delete"
    pool = await _get_pool()
    async with pool.acquire() as conn:
        try:
            clean_sql = sql.rstrip(";").strip()

            if is_delete:
                # DELETE: run inside transaction, rollback if > 1 row affected
                async with conn.transaction():
                    if params:
                        result = await asyncio.wait_for(
                            conn.execute(clean_sql, *params),
                            timeout=WRITE_TIMEOUT,
                        )
                    else:
                        result = await asyncio.wait_for(
                            conn.execute(clean_sql),
                            timeout=WRITE_TIMEOUT,
                        )
                    affected = _parse_affected(result)
                    if affected > 1:
                        raise _DeleteTooManyError(affected)
                    return {"affected_rows": affected, "status": result}
            else:
                # INSERT / UPDATE — execute directly
                if params:
                    result = await asyncio.wait_for(
                        conn.execute(clean_sql, *params),
                        timeout=WRITE_TIMEOUT,
                    )
                else:
                    result = await asyncio.wait_for(
                        conn.execute(clean_sql),
                        timeout=WRITE_TIMEOUT,
                    )
                affected = _parse_affected(result)
                return {"affected_rows": affected, "status": result}

        except _DeleteTooManyError as e:
            return {
                "error": f"DELETE aborted — would affect {e.count} rows. Only single-row deletes are allowed. Transaction was rolled back.",
                "affected_rows": 0,
            }
        except asyncio.TimeoutError:
            return {"error": "Write query timed out (60s limit)", "affected_rows": 0}
        except Exception as e:
            logger.error(f"[AdminAgent] Write query error: {e}")
            return {"error": str(e), "affected_rows": 0}


class _DeleteTooManyError(Exception):
    """Raised when a DELETE would affect more than 1 row."""
    def __init__(self, count: int):
        self.count = count


def _parse_affected(result: str) -> int:
    """Parse affected row count from asyncpg result string (e.g. 'DELETE 3')."""
    if result and " " in result:
        try:
            return int(result.split()[-1])
        except ValueError:
            pass
    return 0


async def count_affected_rows(sql: str, params: Optional[List[Any]] = None) -> int:
    """Run a COUNT query derived from a write query to preview affected rows."""
    stripped = sql.strip().rstrip(";")
    upper = stripped.upper()

    # Build a SELECT COUNT(*) from the WHERE clause
    count_sql = None
    if upper.startswith("DELETE"):
        match = re.search(r"\bFROM\b(.+)", stripped, re.IGNORECASE | re.DOTALL)
        if match:
            count_sql = f"SELECT COUNT(*) FROM {match.group(1)}"
    elif upper.startswith("UPDATE"):
        # Extract table name and WHERE clause
        match = re.match(r"UPDATE\s+(\S+)\s+SET\b.+?(WHERE\b.+)", stripped, re.IGNORECASE | re.DOTALL)
        if match:
            count_sql = f"SELECT COUNT(*) FROM {match.group(1)} {match.group(2)}"

    if not count_sql:
        return -1  # Can't determine

    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction(readonly=True):
            try:
                if params:
                    row = await conn.fetchrow(count_sql, *params)
                else:
                    row = await conn.fetchrow(count_sql)
                return row[0] if row else 0
            except Exception as e:
                logger.warning(f"[AdminAgent] Count query failed: {e}")
                return -1


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _serialize_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """Convert asyncpg record values to JSON-safe types."""
    from datetime import datetime, date
    from decimal import Decimal
    from uuid import UUID
    import json

    out = {}
    for k, v in row.items():
        if v is None:
            out[k] = None
        elif isinstance(v, (datetime, date)):
            out[k] = v.isoformat()
        elif isinstance(v, Decimal):
            out[k] = float(v)
        elif isinstance(v, UUID):
            out[k] = str(v)
        elif isinstance(v, (list, dict)):
            # JSONB or arrays - serialize safely
            try:
                json.dumps(v)
                out[k] = v
            except (TypeError, ValueError):
                out[k] = str(v)
        elif isinstance(v, bytes):
            out[k] = v.hex()
        else:
            out[k] = v
    return out
