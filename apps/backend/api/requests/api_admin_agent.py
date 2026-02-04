"""
Admin Agent API endpoints.
Chat-based natural language interface to the database for admin users.
"""

import logging
import time
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from api.requests.api_admin import verify_admin_role, log_admin_action
from services.admin_agent_db import (
    discover_schema,
    execute_read_query,
    execute_write_query,
    count_affected_rows,
)
from services.admin_agent_llm import plan_query, replan_query, detect_entity_links, analyze_results

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/agent", tags=["Admin Agent"])

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    session_id: str


class ChatResponse(BaseModel):
    response_type: str  # "data", "confirmation", "conversation", "error"
    summary: str
    # For data responses
    columns: Optional[List[str]] = None
    rows: Optional[List[Dict[str, Any]]] = None
    row_count: Optional[int] = None
    truncated: Optional[bool] = None
    entity_links: Optional[Dict[str, str]] = None
    # For confirmation responses
    action_id: Optional[str] = None
    affected_rows: Optional[int] = None
    operation_type: Optional[str] = None
    # For conversation responses
    message: Optional[str] = None
    # For data analysis
    analysis: Optional[str] = None
    # For errors
    error: Optional[str] = None


class ConfirmRequest(BaseModel):
    session_id: str
    action_id: str


class ConfirmResponse(BaseModel):
    success: bool
    affected_rows: int = 0
    message: str = ""
    error: Optional[str] = None


class CancelRequest(BaseModel):
    session_id: str
    action_id: str


# ---------------------------------------------------------------------------
# In-memory session store (1hr TTL)
# ---------------------------------------------------------------------------
SESSION_TTL = 3600  # 1 hour

_sessions: Dict[str, Dict[str, Any]] = {}


def _get_session(session_id: str) -> Dict[str, Any]:
    now = time.time()
    if session_id not in _sessions:
        _sessions[session_id] = {
            "history": [],
            "pending_actions": {},
            "created_at": now,
            "last_active": now,
        }
    session = _sessions[session_id]
    session["last_active"] = now
    # Cleanup old sessions
    _cleanup_sessions(now)
    return session


def _cleanup_sessions(now: float):
    expired = [sid for sid, s in _sessions.items() if now - s["last_active"] > SESSION_TTL]
    for sid in expired:
        del _sessions[sid]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/chat", response_model=ChatResponse)
async def agent_chat(
    body: ChatRequest,
    request: Request,
    admin: Dict[str, Any] = Depends(verify_admin_role),
):
    """Main chat endpoint. Accepts a natural language message and returns data or a confirmation card."""
    session = _get_session(body.session_id)

    try:
        # 1. Discover schema (cached, auto-refreshes every 10 minutes)
        schema = await discover_schema()

        # 2. Plan the query via LLM
        plan = plan_query(
            message=body.message,
            history=session["history"],
            schema=schema,
        )

        # 3. Add to history
        session["history"].append({"role": "user", "content": body.message})

        # 4. Handle based on response type
        if plan.response_type == "conversation":
            reply_text = plan.message or plan.summary
            session["history"].append({"role": "assistant", "content": reply_text})
            return ChatResponse(
                response_type="conversation",
                summary=plan.summary,
                message=reply_text,
            )

        if plan.response_type == "read":
            if not plan.sql:
                return ChatResponse(
                    response_type="error",
                    summary="No SQL generated",
                    error="The model did not generate a query for your request.",
                )

            result = await execute_read_query(plan.sql, plan.params)

            # Auto-retry on query errors (e.g., missing table, bad column)
            if result.get("error"):
                error_msg = result["error"]
                logger.info(f"[AdminAgent] Query failed, retrying: {error_msg}")
                try:
                    plan = replan_query(
                        original_message=body.message,
                        failed_sql=plan.sql,
                        error=error_msg,
                        history=session["history"],
                        schema=schema,
                    )
                    # If LLM switched to conversation (table doesn't exist), return that
                    if plan.response_type == "conversation":
                        reply_text = plan.message or plan.summary
                        session["history"].append({"role": "assistant", "content": reply_text})
                        return ChatResponse(
                            response_type="conversation",
                            summary=plan.summary,
                            message=reply_text,
                        )
                    if plan.sql:
                        result = await execute_read_query(plan.sql, plan.params)
                except Exception as e:
                    logger.warning(f"[AdminAgent] Retry also failed: {e}")

            if result.get("error"):
                session["history"].append({"role": "assistant", "content": f"Error: {result['error']}"})
                return ChatResponse(
                    response_type="error",
                    summary="Query failed",
                    error=result["error"],
                )

            # Detect entity links for clickable IDs in the frontend
            links = detect_entity_links(
                result.get("columns", []),
                result.get("rows", []),
                sql=plan.sql,
            )

            # Analyze results (non-fatal — raw table still renders on failure)
            analysis = None
            try:
                analysis = analyze_results(
                    question=body.message,
                    sql=plan.sql,
                    columns=result.get("columns", []),
                    rows=result.get("rows", []),
                    row_count=result.get("row_count", 0),
                    truncated=result.get("truncated", False),
                    history=session["history"],
                )
            except Exception as e:
                logger.warning(f"[AdminAgent] Analysis failed (non-fatal): {e}")

            session["history"].append({
                "role": "assistant",
                "content": f"{plan.summary} (returned {result.get('row_count', 0)} rows)",
            })

            await log_admin_action(
                admin_user_id=admin["id"],
                action="agent_read_query",
                request=request,
                details={"query_summary": plan.summary, "row_count": result.get("row_count", 0)},
            )

            return ChatResponse(
                response_type="data",
                summary=plan.summary,
                columns=result.get("columns", []),
                rows=result.get("rows", []),
                row_count=result.get("row_count", 0),
                truncated=result.get("truncated", False),
                entity_links=links,
                analysis=analysis,
            )

        if plan.response_type == "write":
            if not plan.sql:
                return ChatResponse(
                    response_type="error",
                    summary="No SQL generated",
                    error="The model did not generate a query for your request.",
                )

            # Count affected rows before confirming
            affected = await count_affected_rows(plan.sql, plan.params)

            # Store pending action
            action_id = str(uuid.uuid4())
            session["pending_actions"][action_id] = {
                "sql": plan.sql,
                "params": plan.params,
                "summary": plan.summary,
                "operation_type": plan.operation_type,
                "affected_rows": affected,
                "created_at": time.time(),
            }

            affected_text = f" ({affected} rows)" if affected >= 0 else ""
            session["history"].append({
                "role": "assistant",
                "content": f"Pending confirmation: {plan.summary}{affected_text}",
            })

            return ChatResponse(
                response_type="confirmation",
                summary=plan.summary,
                action_id=action_id,
                affected_rows=affected if affected >= 0 else None,
                operation_type=plan.operation_type.value if plan.operation_type else None,
            )

        # Fallback
        return ChatResponse(
            response_type="error",
            summary="Unknown response type",
            error=f"Unexpected response_type from model: {plan.response_type}",
        )

    except Exception as e:
        logger.error(f"[AdminAgent] Chat error: {e}", exc_info=True)
        return ChatResponse(
            response_type="error",
            summary="Internal error",
            error=str(e),
        )


@router.post("/confirm", response_model=ConfirmResponse)
async def agent_confirm(
    body: ConfirmRequest,
    request: Request,
    admin: Dict[str, Any] = Depends(verify_admin_role),
):
    """Execute a confirmed write action."""
    session = _get_session(body.session_id)
    action = session["pending_actions"].pop(body.action_id, None)

    if not action:
        raise HTTPException(status_code=404, detail="Action not found or already executed")

    result = await execute_write_query(action["sql"], action["params"])

    if result.get("error"):
        session["history"].append({
            "role": "assistant",
            "content": f"Write failed: {result['error']}",
        })
        return ConfirmResponse(
            success=False,
            affected_rows=0,
            message="Write operation failed",
            error=result["error"],
        )

    affected = result.get("affected_rows", 0)
    session["history"].append({
        "role": "assistant",
        "content": f"Executed: {action['summary']} ({affected} rows affected)",
    })

    await log_admin_action(
        admin_user_id=admin["id"],
        action=f"agent_write_{action['operation_type']}",
        request=request,
        details={
            "query_summary": action["summary"],
            "affected_rows": affected,
        },
    )

    return ConfirmResponse(
        success=True,
        affected_rows=affected,
        message=f"Successfully executed. {affected} row(s) affected.",
    )


@router.post("/cancel")
async def agent_cancel(
    body: CancelRequest,
    admin: Dict[str, Any] = Depends(verify_admin_role),
):
    """Cancel a pending write action."""
    session = _get_session(body.session_id)
    action = session["pending_actions"].pop(body.action_id, None)

    if not action:
        raise HTTPException(status_code=404, detail="Action not found or already cancelled")

    session["history"].append({
        "role": "assistant",
        "content": f"Cancelled: {action['summary']}",
    })

    return {"success": True, "message": "Action cancelled"}


@router.get("/schema")
async def agent_schema(
    admin: Dict[str, Any] = Depends(verify_admin_role),
):
    """Return the discovered database schema."""
    schema = await discover_schema()
    return schema
