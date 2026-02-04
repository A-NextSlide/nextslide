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

    table_names = sorted(tables.keys())
    table_list = ", ".join(table_names)

    return f"""You are a powerful database admin agent for the NextSlide admin dashboard.
You translate natural language into PostgreSQL queries and take action on the production database.
You are an expert SQL engineer — use advanced features like CTEs, window functions, subqueries, CASE expressions, array_agg, string_agg, COALESCE, LATERAL joins, and date math whenever they produce better results.

DATABASE SCHEMA:
{schema_text}

CRITICAL — ONLY USE TABLES THAT EXIST:
The ONLY tables in this database are: {table_list}
You MUST NOT reference any table not listed above. There are NO tables for orders, products, purchases, payments, subscriptions, invoices, or any e-commerce concepts.
NextSlide is a presentation/slides app — not an e-commerce platform. If the user asks about a concept that has no matching table, explain what data IS available and suggest an alternative analysis using the actual tables.

CAPABILITIES:
- Read ANY data — complex analytics, cohort analysis, retention, funnels, custom reports
- Insert new records, update existing records (bulk or targeted), all with confirmation
- Delete individual records (one at a time only — system enforces max 1 row per DELETE)
- Run multi-step read operations using CTEs (WITH ... AS)
- ALTER columns, add indexes, modify table structure
- Compute any metric the admin asks for — be creative with SQL

QUERY INTELLIGENCE:
When the admin asks an abstract or high-level question, YOU must figure out which tables and columns to use.
Study the schema carefully. Map business concepts to the right tables:
- "stickiest users" → users who created the most decks, or logged in most recently/frequently
- "churned users" → users who haven't been active in X days (check last sign-in or last deck created)
- "popular decks" → most viewed, most slides, most recent activity
- "growth" → signups over time using created_at with DATE_TRUNC
- "engagement" → decks per user, slides per deck, edit frequency
- "conversion" → users who signed up vs users who created at least 1 deck
- "churn analysis" → compare user signups vs last activity (last deck created or last sign-in). NO orders/purchases tables exist.
Think step by step about what data answers the question, then build the SQL. Use CTEs for complex multi-step analysis.
If the question is truly ambiguous, ask a clarifying question via response_type="conversation".

RULES:
1. Generate valid PostgreSQL syntax. Use $1, $2, ... for parameters.
2. For SELECT/read queries: set response_type="read", operation_type="select".
3. For INSERT/UPDATE/DELETE: set response_type="write", operation_type accordingly. ALL writes require user confirmation.
4. For greetings, clarifications, or conversational responses: set response_type="conversation" with a message.
5. Use CTEs (WITH clauses) for multi-step analytics — they run as a single read query.
6. NEVER generate DROP TABLE, DROP DATABASE, or TRUNCATE.
7. DELETE must always target exactly ONE row by primary key (e.g., WHERE id = $1). Bulk deletes are not allowed.
8. UPDATE and INSERT can target multiple rows — bulk operations are fine.
9. Prefer COUNT(*), aggregates, window functions, and JOINs for analytical questions.
10. Use LIMIT 200 by default for unbounded SELECT queries unless the user asks for more.
11. UUIDs for user IDs and deck IDs. Use the uuid type.
12. Use ILIKE for case-insensitive text searches.
13. Use NOW(), INTERVAL, DATE_TRUNC, EXTRACT for date filtering and grouping.
14. "users" = public.users table (not auth.users).
15. Always return useful columns — IDs, names, emails, timestamps for actionability.
16. For writes, be precise about what changes and how many rows are affected.
17. Use INSERT...RETURNING, UPDATE...RETURNING to show what was changed.

SCRIPT WRITING:
When the user asks you to "write a script", "generate code", "create a script", "write a query", or similar:
- Set response_type="conversation" (no SQL execution needed)
- Put the full script in the `message` field using markdown fenced code blocks (```python, ```sql, etc.)
- For Python scripts, prefer pandas for data manipulation. Include connection setup with placeholder credentials.
- For SQL scripts, write production-ready queries with comments.
- Include brief explanation of what the script does before the code block.

FORMATTING:
- Use **bold** for key numbers and important values in your summary.
- Use bullet points for lists of findings.
- Use tables in your summary when comparing small sets of data.
- Keep summaries concise but informative — the user is a technical admin.

ENTITY LINKING:
When results contain user IDs (uuid columns from the users table), note them so the frontend can create clickable links to /admin/users/:id.
When results contain deck UUIDs (the uuid column from the decks table), note them for links to /deck/:uuid.

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
        max_tokens=4096,
        temperature=0.1,  # Low temperature for deterministic SQL
    )

    return result


def replan_query(
    original_message: str,
    failed_sql: str,
    error: str,
    history: List[Dict[str, str]],
    schema: Dict[str, Any],
) -> QueryPlan:
    """Retry query planning after a failure by feeding the error back to the LLM."""
    system_prompt = build_system_prompt(schema)

    messages = [{"role": "system", "content": system_prompt}]

    for h in history[-20:]:
        messages.append({"role": h["role"], "content": h["content"]})

    messages.append({"role": "user", "content": original_message})
    messages.append({
        "role": "assistant",
        "content": f"I tried this SQL but it failed:\n```sql\n{failed_sql}\n```\nError: {error}",
    })
    messages.append({
        "role": "user",
        "content": "That query failed. Please fix it using ONLY the tables listed in the schema above. "
                   "If the required data doesn't exist in any table, respond with response_type='conversation' "
                   "explaining what data IS available.",
    })

    client, model_id = get_client(MODEL)

    result = invoke(
        client,
        model_id,
        messages,
        response_model=QueryPlan,
        max_tokens=4096,
        temperature=0.1,
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
    columns: List[str], rows: List[Dict[str, Any]], sql: Optional[str] = None
) -> Dict[str, str]:
    """Detect which columns contain entity IDs that should be linked in the UI.

    Returns a mapping of column_name -> entity_type ('user' or 'deck').
    Uses the SQL query to determine table context for ambiguous column names.
    """
    link_map: Dict[str, str] = {}

    # Determine which tables the query references
    sql_upper = (sql or "").upper()
    queries_users = bool(re.search(r"\bUSERS\b", sql_upper))
    queries_decks = bool(re.search(r"\bDECKS\b", sql_upper))

    # Explicit patterns — always map regardless of table context
    explicit_user_cols = {"user_id", "admin_user_id", "target_user_id", "owner_id", "created_by"}
    explicit_deck_cols = {"deck_id", "deck_uuid"}

    for col in columns:
        col_lower = col.lower()

        # Explicit user ID columns (always a user link)
        if col_lower in explicit_user_cols:
            if _has_uuid_value(col, rows):
                link_map[col] = "user"
        # Explicit deck ID columns (always a deck link)
        elif col_lower in explicit_deck_cols:
            if _has_uuid_value(col, rows):
                link_map[col] = "deck"
        # Ambiguous "id" — only user link if primary table is users
        elif col_lower == "id" and queries_users and not queries_decks:
            if _has_uuid_value(col, rows):
                link_map[col] = "user"
        # Ambiguous "uuid" — only deck link if primary table is decks
        elif col_lower == "uuid" and queries_decks:
            if _has_uuid_value(col, rows):
                link_map[col] = "deck"

    return link_map


def _has_uuid_value(col: str, rows: List[Dict[str, Any]]) -> bool:
    """Check if at least one of the first 5 rows has a UUID value in the given column."""
    return any(_UUID_PATTERN.match(str(r.get(col, ""))) for r in rows[:5] if r.get(col))


# ---------------------------------------------------------------------------
# Result analysis
# ---------------------------------------------------------------------------
def analyze_results(
    question: str,
    sql: str,
    columns: List[str],
    rows: List[Dict[str, Any]],
    row_count: int,
    truncated: bool,
    history: List[Dict[str, str]],
) -> Optional[str]:
    """Analyze query results and return a markdown interpretation.

    Returns None if results are too trivial to warrant analysis
    (0 rows, or ≤3 rows with ≤2 columns).
    """
    # Skip trivial results
    if row_count == 0:
        return None
    if row_count <= 3 and len(columns) <= 2:
        return None

    # Truncate rows sent to LLM (max 50)
    sample_rows = rows[:50]
    rows_text = _format_rows_for_prompt(columns, sample_rows)

    truncation_note = ""
    if truncated or row_count > 50:
        truncation_note = f"\n(Showing {len(sample_rows)} of {row_count} total rows)"

    messages = [
        {"role": "system", "content": _ANALYSIS_SYSTEM_PROMPT},
    ]

    # Include recent history for context
    for h in history[-6:]:
        messages.append({"role": h["role"], "content": h["content"]})

    messages.append({
        "role": "user",
        "content": f"""Original question: {question}

SQL executed:
```sql
{sql}
```

Results ({row_count} rows, {len(columns)} columns):{truncation_note}
{rows_text}

Analyze these results for the admin.""",
    })

    client, model_id = get_client(MODEL)

    result = invoke(
        client,
        model_id,
        messages,
        response_model=None,  # Freeform markdown
        max_tokens=1024,
        temperature=0.3,
    )

    if result and isinstance(result, str) and result.strip():
        return result.strip()
    return None


_ANALYSIS_SYSTEM_PROMPT = """You are a data analyst interpreting database query results for an admin dashboard.

Your job is to provide a concise, insightful analysis — NOT to reproduce the raw data.

GUIDELINES:
- Interpret like a data scientist: identify patterns, trends, outliers, and key findings
- Use **bold** for key numbers and important values
- Use bullet points for distinct findings
- Be concise: 3-8 sentences for simple results, a few short paragraphs for complex ones
- Do NOT reproduce the raw data in a table — the user already has the full table below your analysis
- Do NOT start with "Here are the results" or similar — jump straight into the insights
- If there's a clear trend (growth, decline, seasonality), call it out with specific numbers
- If there are outliers or anomalies, highlight them
- For user/deck data, summarize the distribution rather than listing individuals
- Compare to implied benchmarks when possible (e.g., "averaging X per user")"""


def _format_rows_for_prompt(columns: List[str], rows: List[Dict[str, Any]]) -> str:
    """Format rows as a compact text table for the LLM prompt."""
    if not rows:
        return "(no rows)"

    header = " | ".join(columns)
    separator = " | ".join("---" for _ in columns)
    lines = [header, separator]

    for row in rows:
        values = []
        for col in columns:
            val = row.get(col, "")
            val_str = str(val) if val is not None else "NULL"
            # Truncate long values
            if len(val_str) > 80:
                val_str = val_str[:77] + "..."
            values.append(val_str)
        lines.append(" | ".join(values))

    return "\n".join(lines)
