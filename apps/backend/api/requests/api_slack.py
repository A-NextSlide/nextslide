"""
Slack integration API router.

Endpoints:
  POST /api/slack/commands        -- Handle /nextslide slash command
  POST /api/slack/interactions    -- Handle Block Kit form submissions
  POST /api/slack/events          -- Handle link_shared + url_verification
  GET  /api/slack/oauth/callback  -- OAuth "Add to Slack" callback
  GET  /api/slack/oauth/install   -- Return install URL
  GET  /api/slack/user/status     -- Check if current user has linked Slack (JWT auth)
  POST /api/slack/user/disconnect -- Unlink current user's Slack (JWT auth)
"""

import json
import logging
import os
import re
from typing import Any, Dict, Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse

from api.requests.api_auth import get_auth_header
from services.supabase_auth_service import get_auth_service
from services.slack.slack_auth import verify_slack_signature
from services.slack.slack_service import get_slack_service
from services.slack.slack_block_kit import SlackBlockKit
from services.slack.slack_session_manager import get_session_manager
from services.slack.slack_context_gatherer import SlackContextGatherer
from services.slack.slack_generation_bridge import SlackGenerationBridge
from utils.background_tasks import create_background_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/slack", tags=["Slack Integration"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://nextslide.ai")
API_URL = os.getenv("API_URL", "https://api.nextslide.ai")

_NEXTSLIDE_URL_RE = re.compile(
    r"https?://(?:app\.|www\.)?nextslide\.ai/p/(?P<code>[A-Za-z0-9_-]+)"
)


def _get_env(name: str) -> str:
    val = os.getenv(name)
    if not val:
        raise HTTPException(status_code=500, detail=f"Missing env: {name}")
    return val


# ============================================================================
# 1. Slash command: /nextslide
# ============================================================================

@router.post("/commands")
async def slack_commands(
    request: Request,
    body: bytes = Depends(verify_slack_signature),
):
    """
    Handle the /nextslide slash command.
    Must acknowledge within 3 seconds, then spawn background work.
    """
    from urllib.parse import parse_qs

    form = parse_qs(body.decode("utf-8"))
    team_id = (form.get("team_id") or [""])[0]
    user_id_slack = (form.get("user_id") or [""])[0]
    channel_id = (form.get("channel_id") or [""])[0]
    text = (form.get("text") or [""])[0].strip()
    response_url = (form.get("response_url") or [""])[0]

    if not text:
        return JSONResponse({
            "response_type": "ephemeral",
            "text": "Usage: `/nextslide <topic>` -- e.g. `/nextslide Q3 Sales Report for the board`",
        })

    # Spawn background task
    create_background_task(
        _handle_slash_command(
            team_id=team_id,
            user_id_slack=user_id_slack,
            channel_id=channel_id,
            text=text,
            response_url=response_url,
        ),
        name=f"slack_cmd_{team_id}_{channel_id}",
    )

    # Immediate acknowledgement
    return JSONResponse({
        "response_type": "in_channel",
        "text": f"Creating a deck: *{text}*\nGathering context from this conversation...",
    })


async def _handle_slash_command(
    team_id: str,
    user_id_slack: str,
    channel_id: str,
    text: str,
    response_url: str,
):
    """Background handler for /nextslide."""
    print(f"[SLACK] _handle_slash_command started: team={team_id} user={user_id_slack} text={text[:50]}")
    sessions = get_session_manager()
    slack = get_slack_service()

    try:
        # 1. Get workspace
        print(f"[SLACK] Looking up workspace {team_id}...")
        workspace = await sessions.get_workspace(team_id)
        if not workspace:
            print(f"[SLACK] No workspace found for {team_id}")
            await slack.respond_to_url(
                response_url,
                text="This workspace isn't connected to NextSlide. Ask an admin to install the app.",
            )
            return
        print(f"[SLACK] Found workspace: {workspace.team_name}")
        bot_token = workspace.bot_token

        # 2. Account linking
        print(f"[SLACK] Looking up user mapping for {user_id_slack}...")
        mapping = await sessions.get_user_mapping(user_id_slack, team_id)
        if not mapping:
            # Try auto-link by email
            print(f"[SLACK] No mapping found, trying auto-link by email...")
            try:
                user_info = await slack.get_user_info(bot_token, user_id_slack)
                email = user_info.get("profile", {}).get("email")
                print(f"[SLACK] Slack user email: {email}")
                if email:
                    ns_user_id = await sessions.auto_link_by_email(
                        email, user_id_slack, team_id
                    )
                    print(f"[SLACK] Auto-link result: {ns_user_id}")
                    if ns_user_id:
                        mapping = await sessions.get_user_mapping(user_id_slack, team_id)
            except Exception as e:
                print(f"[SLACK] Auto-link failed: {e}")
                logger.debug(f"Auto-link failed: {e}")

        if not mapping:
            await slack.respond_to_url(
                response_url,
                text="Link your NextSlide account first.",
                blocks=SlackBlockKit.account_link_prompt(FRONTEND_URL),
            )
            return

        nextslide_user_id = mapping.nextslide_user_id

        # 3. Create session
        session_id = await sessions.create_session(
            slack_team_id=team_id,
            slack_channel_id=channel_id,
            slack_user_id=user_id_slack,
            slack_response_url=response_url,
            nextslide_user_id=nextslide_user_id,
        )

        # 4. Gather context
        gatherer = SlackContextGatherer()
        context = await gatherer.gather_context(
            bot_token, channel_id, user_text=text
        )

        await sessions.update_session(
            session_id,
            context_data={
                "messages_summary": context.messages_summary,
                "file_count": context.file_count,
                "raw_message_count": context.raw_message_count,
                "reference_images": context.reference_images,
            },
        )

        # 5. Run clarification check
        bridge = SlackGenerationBridge()
        agent_result = await bridge.run_clarification(
            session_id, bot_token, channel_id, None, text, context
        )

        action = (agent_result or {}).get("action", "generate_outline")

        if action == "clarify":
            # Show clarification form
            message = agent_result.get("message", "I need a few more details:")
            fields = (agent_result.get("clarification") or {}).get("fields", [])

            if fields:
                await sessions.update_session(session_id, state="clarifying")
                blocks = SlackBlockKit.clarification_form(session_id, message, fields)
                await slack.respond_to_url(
                    response_url,
                    text=message,
                    blocks=blocks,
                    replace_original=True,
                    response_type="in_channel",
                )
                return

        # 6. Skip to generation
        await sessions.update_session(session_id, state="generating")

        # Determine slide count from agent result or default
        num_slides = 15
        if agent_result and agent_result.get("slide_count"):
            try:
                num_slides = int(agent_result["slide_count"])
            except (ValueError, TypeError):
                pass

        create_background_task(
            bridge.generate_deck(
                session_id=session_id,
                bot_token=bot_token,
                channel_id=channel_id,
                thread_ts=None,
                user_id=nextslide_user_id,
                topic=text,
                context=context,
                num_slides=num_slides,
            ),
            name=f"slack_gen_{session_id}",
        )

    except Exception as e:
        import traceback
        print(f"[SLACK] ERROR in slash command handler: {e}")
        traceback.print_exc()
        logger.error(f"Slash command handler failed: {e}", exc_info=True)
        try:
            await slack.respond_to_url(
                response_url,
                text=f"Something went wrong: {str(e)[:200]}",
            )
        except Exception:
            pass


# ============================================================================
# 2. Interactions (Block Kit form submissions)
# ============================================================================

@router.post("/interactions")
async def slack_interactions(
    request: Request,
    body: bytes = Depends(verify_slack_signature),
):
    """Handle Block Kit button clicks and form submissions."""
    from urllib.parse import parse_qs

    form = parse_qs(body.decode("utf-8"))
    payload_raw = (form.get("payload") or ["{}"])[0]
    payload = json.loads(payload_raw)

    action_type = payload.get("type")

    if action_type == "block_actions":
        actions = payload.get("actions", [])
        if actions:
            action = actions[0]
            action_id = action.get("action_id")

            if action_id == "generate_deck":
                session_id = action.get("value")
                create_background_task(
                    _handle_generate_from_form(session_id, payload),
                    name=f"slack_form_{session_id}",
                )
                return JSONResponse({"text": "Starting generation..."})

            if action_id == "cancel_generation":
                session_id = action.get("value")
                sessions = get_session_manager()
                await sessions.update_session(session_id, state="failed", error_message="Cancelled by user")
                return JSONResponse({"text": "Generation cancelled."})

    # Acknowledge other interactions
    return JSONResponse({})


async def _handle_generate_from_form(
    session_id: str,
    payload: Dict[str, Any],
):
    """Collect answers from the clarification form and start generation."""
    sessions = get_session_manager()
    slack = get_slack_service()

    try:
        session = await sessions.get_session(session_id)
        if not session:
            logger.warning(f"Session {session_id} not found")
            return

        team_id = session["slack_team_id"]
        channel_id = session["slack_channel_id"]
        nextslide_user_id = session.get("nextslide_user_id")

        workspace = await sessions.get_workspace(team_id)
        if not workspace:
            return
        bot_token = workspace.bot_token

        # Collect form answers from the Block Kit state
        answers = {}
        state_values = payload.get("state", {}).get("values", {})
        for block_id, block_data in state_values.items():
            for action_id, action_data in block_data.items():
                key = action_id.replace("input_", "")
                atype = action_data.get("type")
                if atype == "static_select":
                    selected = action_data.get("selected_option")
                    answers[key] = selected["value"] if selected else ""
                else:
                    answers[key] = action_data.get("value", "")

        # Update session with clarification answers
        existing_data = session.get("clarification_data") or {}
        existing_data.update(answers)
        await sessions.update_session(session_id, clarification_data=existing_data)

        # Build combined text from original request + answers
        context_data = session.get("context_data") or {}
        original_text = context_data.get("messages_summary", "")

        # Format answers into additional instructions
        answer_parts = []
        for k, v in answers.items():
            if v:
                answer_parts.append(f"- {k}: {v}")
        additional = "\n".join(answer_parts) if answer_parts else None

        # Rebuild context
        from services.slack.slack_context_gatherer import SlackContext
        context = SlackContext(
            messages_summary=context_data.get("messages_summary", ""),
            reference_images=context_data.get("reference_images", []),
            raw_message_count=context_data.get("raw_message_count", 0),
            file_count=context_data.get("file_count", 0),
        )

        # Get topic from first answer or session context
        topic = answers.get("topic", "") or session.get("clarification_data", {}).get("topic", "Presentation")

        # Notify: replacing form with progress
        response_url = payload.get("response_url")
        if response_url:
            await slack.respond_to_url(
                response_url,
                text="Starting deck generation...",
                blocks=SlackBlockKit.generation_progress(0, 15, topic[:50]),
                replace_original=True,
                response_type="in_channel",
            )

        bridge = SlackGenerationBridge()
        await bridge.generate_deck(
            session_id=session_id,
            bot_token=bot_token,
            channel_id=channel_id,
            thread_ts=session.get("slack_thread_ts"),
            user_id=nextslide_user_id,
            topic=topic,
            context=context,
            additional_instructions=additional,
        )

    except Exception as e:
        logger.error(f"Form handler failed for {session_id}: {e}", exc_info=True)


# ============================================================================
# 3. Events (link_shared, url_verification)
# ============================================================================

@router.post("/events")
async def slack_events(
    request: Request,
    body: bytes = Depends(verify_slack_signature),
):
    """Handle Slack Events API: url_verification and link_shared."""
    data = json.loads(body)

    # URL verification challenge (Slack setup)
    if data.get("type") == "url_verification":
        return JSONResponse({"challenge": data.get("challenge", "")})

    event = data.get("event", {})
    event_type = event.get("type")

    if event_type == "link_shared":
        team_id = data.get("team_id")
        create_background_task(
            _handle_link_shared(team_id, event),
            name=f"slack_unfurl_{event.get('message_ts', '')}",
        )

    return JSONResponse({"ok": True})


async def _handle_link_shared(team_id: str, event: Dict[str, Any]):
    """Unfurl nextslide.ai/p/* links."""
    sessions = get_session_manager()
    slack = get_slack_service()

    workspace = await sessions.get_workspace(team_id)
    if not workspace:
        return
    bot_token = workspace.bot_token

    channel = event.get("channel")
    ts = event.get("message_ts")
    links = event.get("links", [])

    unfurls = {}
    for link in links:
        url = link.get("url", "")
        m = _NEXTSLIDE_URL_RE.search(url)
        if not m:
            continue
        code = m.group("code")

        try:
            from services.deck_sharing_service import get_sharing_service
            sharing = get_sharing_service()
            deck_data = sharing.get_deck_by_share_code(code)
            if not deck_data:
                continue

            unfurls[url] = SlackBlockKit.link_unfurl(
                title=deck_data.get("name", "Untitled"),
                slide_count=deck_data.get("slide_count") or 0,
                thumbnail_url=deck_data.get("thumbnail_url"),
            )
        except Exception as e:
            logger.debug(f"Unfurl failed for {url}: {e}")

    if unfurls and channel and ts:
        try:
            await slack.unfurl_link(bot_token, channel, ts, unfurls)
        except Exception as e:
            logger.warning(f"Link unfurl API call failed: {e}")


# ============================================================================
# 4. OAuth
# ============================================================================

@router.get("/oauth/install")
async def slack_oauth_install(
    token: Optional[str] = Depends(get_auth_header),
):
    """Return the Slack OAuth install URL."""
    client_id = _get_env("SLACK_CLIENT_ID")
    scopes = (
        "commands,chat:write,chat:write.public,links:read,links:write,"
        "channels:history,groups:history,im:history,mpim:history,"
        "files:read,users:read,users:read.email"
    )
    redirect_uri = f"{API_URL}/api/slack/oauth/callback"

    # Encode user_id in state if authenticated
    import base64
    state_data = {}
    if token:
        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token)
        if user:
            state_data["user_id"] = user["id"]

    state = base64.urlsafe_b64encode(json.dumps(state_data).encode()).decode()

    params = urlencode({
        "client_id": client_id,
        "scope": scopes,
        "redirect_uri": redirect_uri,
        "state": state,
    })
    return JSONResponse({"url": f"https://slack.com/oauth/v2/authorize?{params}"})


@router.get("/oauth/callback")
async def slack_oauth_callback(
    code: str = Query(...),
    state: str = Query(""),
):
    """Handle Slack OAuth callback -- exchanges code for bot token."""
    import base64

    client_id = _get_env("SLACK_CLIENT_ID")
    client_secret = _get_env("SLACK_CLIENT_SECRET")
    redirect_uri = f"{API_URL}/api/slack/oauth/callback"

    slack = get_slack_service()
    sessions = get_session_manager()

    try:
        resp = await slack.oauth_v2_access(
            client_id, client_secret, code, redirect_uri
        )
    except Exception as e:
        logger.error(f"Slack OAuth exchange failed: {e}")
        return HTMLResponse(
            _oauth_result_page(success=False, error=str(e)),
            status_code=200,
        )

    team = resp.get("team", {})
    team_id = team.get("id", "")
    team_name = team.get("name", "")
    bot_token = resp.get("access_token", "")
    bot_user_id = resp.get("bot_user_id", "")
    scopes = (resp.get("scope") or "").split(",")

    # Decode installer user from state
    installer_user_id = None
    try:
        if state:
            state_data = json.loads(base64.urlsafe_b64decode(state).decode())
            installer_user_id = state_data.get("user_id")
    except Exception:
        pass

    # Store workspace
    await sessions.upsert_workspace(
        team_id=team_id,
        team_name=team_name,
        bot_token=bot_token,
        bot_user_id=bot_user_id,
        installer_user_id=installer_user_id,
        scopes=scopes,
    )

    # Auto-link installer if we know their user_id
    if installer_user_id:
        # Get the Slack user ID of the person who authorized
        authed_user = resp.get("authed_user", {})
        slack_user_id = authed_user.get("id")
        if slack_user_id:
            await sessions.upsert_user_mapping(
                slack_user_id=slack_user_id,
                slack_team_id=team_id,
                nextslide_user_id=installer_user_id,
            )

    return HTMLResponse(
        _oauth_result_page(success=True, team_name=team_name),
        status_code=200,
    )


def _oauth_result_page(
    success: bool,
    team_name: str = "",
    error: str = "",
) -> str:
    """Render an HTML page that closes the popup and signals the parent window."""
    if success:
        msg = f"Connected to {team_name}!"
        color = "#22c55e"
    else:
        msg = f"Connection failed: {error}"
        color = "#ef4444"

    return f"""<!DOCTYPE html>
<html>
<head><title>NextSlide + Slack</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fafafa;">
  <div style="text-align:center;">
    <div style="font-size:48px;">{'✓' if success else '✗'}</div>
    <h2 style="color:{color};">{msg}</h2>
    <p style="color:#666;">You can close this window.</p>
  </div>
  <script>
    if (window.opener) {{
      window.opener.postMessage({{ type: 'slack-oauth-result', success: {'true' if success else 'false'} }}, '*');
    }}
    setTimeout(function() {{ window.close(); }}, 2000);
  </script>
</body>
</html>"""


# ============================================================================
# 5. User-facing endpoints (JWT auth, NOT Slack signature)
# ============================================================================

@router.get("/user/status")
async def slack_user_status(
    token: Optional[str] = Depends(get_auth_header),
):
    """Check if the current user has a linked Slack workspace."""
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        return JSONResponse({"connected": False})

    user_id = user["id"]
    sessions = get_session_manager()

    workspace = await sessions.get_workspace_for_user(user_id)
    if workspace:
        return JSONResponse({
            "connected": True,
            "team_name": workspace.team_name,
            "team_id": workspace.team_id,
        })

    return JSONResponse({"connected": False})


@router.post("/user/disconnect")
async def slack_user_disconnect(
    token: Optional[str] = Depends(get_auth_header),
):
    """Unlink the current user's Slack connection."""
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    user_id = user["id"]
    sessions = get_session_manager()
    await sessions.delete_mapping_by_nextslide_user(user_id)

    return JSONResponse({"success": True})
