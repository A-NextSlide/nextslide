"""
Admin Agent LLM Layer
Handles prompt construction and structured query planning via Claude Sonnet.
"""

import logging
import re
from typing import Any, Dict, List, Optional
from enum import Enum

from pydantic import BaseModel, Field

from agents.ai.clients import get_client, invoke

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-5"


# ---------------------------------------------------------------------------
# Structured output models
# ---------------------------------------------------------------------------
class OperationType(str, Enum):
    select = "select"
    insert = "insert"
    update = "update"
    delete = "delete"
    conversation = "conversation"  # No SQL needed (greetings, clarifications, etc.)


class QueryPlan(BaseModel):
    """Structured output from the LLM describing the planned SQL operation."""
    response_type: str = Field(
        description="Either 'read', 'write', or 'conversation'. "
                    "'read' for SELECT queries, 'write' for INSERT/UPDATE/DELETE, "
                    "'conversation' for non-SQL responses."
    )
    sql: Optional[str] = Field(
        default=None,
        description="The SQL query to execute. Null for conversation responses."
    )
    operation_type: OperationType = Field(
        description="The SQL operation type: select, insert, update, delete, or conversation."
    )
    summary: str = Field(
        description="A plain-English summary of what this query does, written for a non-technical user. "
                    "For writes, describe what will change. For reads, describe what data is being fetched."
    )
    params: Optional[List[Any]] = Field(
        default=None,
        description="Positional parameters for the SQL query ($1, $2, ...). Null if none needed."
    )
    message: Optional[str] = Field(
        default=None,
        description="Conversational response text when response_type is 'conversation'."
    )


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------
def build_system_prompt(schema: Dict[str, Any]) -> str:
    """Build the system prompt with full schema context."""
    # Format schema compactly
    schema_lines = []
    tables = schema.get("tables", {})
    for tname, tinfo in sorted(tables.items()):
        cols = tinfo.get("columns", [])
        col_parts = []
        for c in cols:
            part = f"{c['name']} ({c['type']}"
            if c.get("constraint") == "PRIMARY KEY":
                part += ", PK"
            if c.get("constraint") == "FOREIGN KEY":
                part += ", FK"
            if not c.get("nullable"):
                part += ", NOT NULL"
            part += ")"
            col_parts.append(part)
        est = tinfo.get("row_count_estimate", "?")
        schema_lines.append(f"  {tname} (~{est} rows): {', '.join(col_parts)}")

    schema_text = "\n".join(schema_lines)

    return f"""You are a database assistant for the NextSlide admin dashboard.
You translate natural language questions into PostgreSQL queries against the production database.

DATABASE SCHEMA:
{schema_text}

RULES:
1. Generate valid PostgreSQL syntax. Use $1, $2, ... for parameters.
2. For SELECT queries, set response_type="read" and operation_type="select".
3. For INSERT/UPDATE/DELETE, set response_type="write" and operation_type accordingly.
4. For greetings, clarifications, or questions you can answer without SQL, set response_type="conversation" and provide a message.
5. Always include a plain-English summary of what the query does.
6. NEVER generate DROP, TRUNCATE, ALTER, CREATE, GRANT, or other DDL statements.
7. For DELETE and UPDATE, always include a WHERE clause.
8. Prefer COUNT(*), aggregates, and JOINs when the user asks analytical questions.
9. Use LIMIT 100 by default for unbounded SELECT queries unless the user asks for more.
10. When referencing user IDs, use the uuid type. When referencing deck IDs, use the uuid type.
11. Use ILIKE for text searches to be case-insensitive.
12. For date filtering, use PostgreSQL date functions (NOW(), INTERVAL, DATE_TRUNC, etc.)
13. When the user refers to "users", they mean the public.users table (not auth.users).
14. Always return useful columns - include IDs, names, emails so results are actionable.
15. If the user's request is ambiguous, prefer the safer/read-only interpretation.
16. For write operations, be very precise in your summary about what will change and how many rows might be affected.

ENTITY LINKING:
When results contain user IDs (uuid columns from the users table), note them so the frontend can create clickable links to /admin/users/:id.
When results contain deck UUIDs, note them for links to /admin/decks.

Respond with the structured QueryPlan format."""


# ---------------------------------------------------------------------------
# Query planning
# ---------------------------------------------------------------------------
def plan_query(
    message: str,
    history: List[Dict[str, str]],
    schema: Dict[str, Any],
) -> QueryPlan:
    """Send the user message + history to the LLM and get a structured QueryPlan."""
    system_prompt = build_system_prompt(schema)

    messages = [{"role": "system", "content": system_prompt}]

    # Add conversation history (keep last 20 messages to stay in context window)
    for h in history[-20:]:
        messages.append({"role": h["role"], "content": h["content"]})

    # Add the current user message
    messages.append({"role": "user", "content": message})

    client, model_id = get_client(MODEL)

    result = invoke(
        client,
        model_id,
        messages,
        response_model=QueryPlan,
        max_tokens=2048,
        temperature=0.1,  # Low temperature for deterministic SQL
    )

    return result


# ---------------------------------------------------------------------------
# Entity link detection
# ---------------------------------------------------------------------------
_UUID_PATTERN = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
    re.IGNORECASE,
)


def detect_entity_links(
    columns: List[str], rows: List[Dict[str, Any]]
) -> Dict[str, str]:
    """Detect which columns contain entity IDs that should be linked in the UI.

    Returns a mapping of column_name -> entity_type ('user' or 'deck').
    """
    link_map: Dict[str, str] = {}

    # Heuristic: column names containing 'user_id' or just 'id' in users-related queries
    user_id_patterns = {"user_id", "id", "admin_user_id", "target_user_id", "owner_id", "created_by"}
    deck_id_patterns = {"deck_id", "deck_uuid", "uuid"}

    for col in columns:
        col_lower = col.lower()
        if col_lower in user_id_patterns:
            # Verify at least one value looks like a UUID
            if any(_UUID_PATTERN.match(str(r.get(col, ""))) for r in rows[:5] if r.get(col)):
                link_map[col] = "user"
        elif col_lower in deck_id_patterns:
            if any(_UUID_PATTERN.match(str(r.get(col, ""))) for r in rows[:5] if r.get(col)):
                link_map[col] = "deck"

    return link_map
