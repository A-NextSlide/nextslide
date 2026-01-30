import asyncio
import json
import uuid
from datetime import datetime
from typing import Any, AsyncGenerator, Dict, List, Optional, Set, Tuple, Union

from setup_logging_optimized import get_logger
from services.firecrawl_agent_service import get_firecrawl_agent_service, ExtractRequest

from .research import research_with_perplexity
from .tools import (
    SEARCH_TOOL, DEEP_EXTRACT_TOOL, OUTLINE_TOOLS, RESEARCH_TOOLS, OUTLINE_TOOL_NAMES,
    get_gemini_search_tool, get_gemini_outline_tools,
    is_gemini_model, genai_types,
)

logger = get_logger(__name__)

ToolEvent = Union[str, Tuple[str, ...]]


# ── Outline tool executors ─────────────────────────────────────────────────────

async def _execute_update_theme(args: Dict[str, Any]) -> Dict[str, Any]:
    """Execute the update_theme tool via the shared theme executor."""
    from .theme_executor import execute_theme_update
    return await execute_theme_update(theme_args=args)


def _execute_update_slides(args: Dict[str, Any], current_outline: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Apply targeted changes to specific slides."""
    if not current_outline:
        return {"success": False, "message": "No current outline to update", "slides": []}

    slides = list(current_outline.get("slides") or [])
    changes = args.get("changes") or []
    applied: List[str] = []

    for change in changes:
        idx = change.get("slide_index")
        if idx is None or idx < 0 or idx >= len(slides):
            continue
        slide = slides[idx]
        if "title" in change:
            slide["title"] = change["title"]
        if "content" in change:
            slide["content"] = change["content"]
        if "speaker_notes" in change:
            slide["speaker_notes"] = change["speaker_notes"]
        if "key_points" in change:
            slide["key_points"] = change["key_points"]
        applied.append(f"slide {idx}")

    return {
        "success": True,
        "message": f"Updated {', '.join(applied)}" if applied else "No changes applied",
        "slides": slides,
    }


def _execute_add_slide(args: Dict[str, Any], current_outline: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Insert a new slide into the outline."""
    if not current_outline:
        return {"success": False, "message": "No current outline", "slides": []}

    slides = list(current_outline.get("slides") or [])
    new_slide = {
        "id": str(uuid.uuid4()),
        "title": args.get("title", "New Slide"),
        "content": args.get("content", ""),
        "key_points": args.get("key_points", []),
        "slide_type": "content",
        "narrative_role": "supporting",
        "speaker_notes": "",
        "deepResearch": False,
        "taggedMedia": [],
    }

    after_index = args.get("after_index")
    if after_index is not None and 0 <= after_index < len(slides):
        slides.insert(after_index + 1, new_slide)
    else:
        slides.append(new_slide)

    return {
        "success": True,
        "message": f"Added slide '{new_slide['title']}'",
        "slides": slides,
    }


def _execute_remove_slide(args: Dict[str, Any], current_outline: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Remove a slide by index."""
    if not current_outline:
        return {"success": False, "message": "No current outline", "slides": []}

    slides = list(current_outline.get("slides") or [])
    idx = args.get("slide_index")
    if idx is not None and 0 <= idx < len(slides):
        removed = slides.pop(idx)
        return {
            "success": True,
            "message": f"Removed slide '{removed.get('title', idx)}'",
            "slides": slides,
        }
    return {"success": False, "message": "Invalid slide index", "slides": slides}


def _execute_reorder_slide(args: Dict[str, Any], current_outline: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Move a slide from one position to another."""
    if not current_outline:
        return {"success": False, "message": "No current outline", "slides": []}

    slides = list(current_outline.get("slides") or [])
    from_idx = args.get("from_index")
    to_idx = args.get("to_index")
    if (from_idx is not None and to_idx is not None
            and 0 <= from_idx < len(slides) and 0 <= to_idx < len(slides)):
        slide = slides.pop(from_idx)
        slides.insert(to_idx, slide)
        return {
            "success": True,
            "message": f"Moved slide from {from_idx} to {to_idx}",
            "slides": slides,
        }
    return {"success": False, "message": "Invalid indices", "slides": slides}


async def _execute_scrape_media(args: Dict[str, Any]) -> Dict[str, Any]:
    """Scrape media from a URL."""
    url = args.get("url")
    media_filter = args.get("media_filter", "all")
    if not url:
        return {"success": False, "message": "No URL provided"}

    try:
        from .media import scrape_media_from_url
        result = await scrape_media_from_url(url, media_filter)
        if result.get("success"):
            return {
                "success": True,
                "message": f"Scraped media from {url}",
                "scraped_media": {
                    "gifs": result.get("gifs", []),
                    "images": result.get("images", []),
                    "videos": result.get("videos", []),
                    "all_media": result.get("all_media", []),
                    "filtered_media": result.get("filtered_media", []),
                    "source_url": url,
                    "markdown": result.get("markdown", ""),
                },
            }
        return {"success": False, "message": result.get("error", "Scrape failed")}
    except Exception as e:
        return {"success": False, "message": f"Scrape error: {str(e)}"}


# ── Main tool loop ─────────────────────────────────────────────────────────────

async def call_model_with_tools(
    client,
    model: str,
    msgs: List[Dict[str, Any]],
    system_prompt: str,
    max_depth: int = 3,
    extra_context_tasks: Optional[List[asyncio.Task]] = None,
    outline_tools: bool = False,
    current_outline: Optional[Dict[str, Any]] = None,
) -> AsyncGenerator[ToolEvent, None]:
    consumed_context_tasks: Set[int] = set()

    async def _get_extra_context(wait: bool = False) -> str:
        if not extra_context_tasks:
            return ""

        contexts: List[str] = []
        for task in extra_context_tasks:
            if task is None:
                continue
            task_id = id(task)
            if task_id in consumed_context_tasks:
                continue
            if not task.done():
                if not wait:
                    continue
                try:
                    result = await task
                except Exception as exc:
                    logger.warning("[OutlineAgent] Background context task failed: %s", exc)
                    consumed_context_tasks.add(task_id)
                    continue
            else:
                try:
                    result = task.result()
                except Exception as exc:
                    logger.warning("[OutlineAgent] Background context task failed: %s", exc)
                    consumed_context_tasks.add(task_id)
                    continue

            consumed_context_tasks.add(task_id)
            context = _normalize_context(result)
            if context:
                contexts.append(context)

        return "\n\n".join(contexts)

    def _normalize_context(result: Any) -> str:
        if isinstance(result, str):
            return result
        if hasattr(result, "scraped_context"):
            return getattr(result, "scraped_context", "") or ""
        if isinstance(result, dict):
            if result.get("scraped_context"):
                return result["scraped_context"]
            content = result.get("content")
            if content:
                if len(content) > 2500:
                    content = content[:2500] + "\n\n[Truncated for brevity - use key facts above]"
                citations = result.get("citations") or []
                if citations:
                    content = content + "\n\nSources:\n" + "\n".join(citations[:5])
                return "\n\n[RESEARCH PREFETCH]\n" + content + "\n[END RESEARCH PREFETCH]\n"
        return ""

    async def _call(msgs: List[Dict[str, Any]], depth: int) -> AsyncGenerator[ToolEvent, None]:
        if depth >= max_depth:
            yield f"data: {json.dumps({'type': 'status', 'status': 'compiling', 'message': 'Compiling research into outline...'})}\n\n"
            yield ("text", "I've gathered research. Synthesizing now.")

            synthesis_msgs: List[Dict[str, Any]] = []
            for i, msg in enumerate(msgs):
                if i == len(msgs) - 1 and msg.get("role") == "user":
                    existing_content = msg.get("content")
                    if isinstance(existing_content, list):
                        new_content = existing_content + [{
                            "type": "text",
                            "text": (
                                "\n\n---\nSynthesize the research into a generate_outline JSON. "
                                "Output JSON only with slides at the top level; include key_points "
                                "and content for each slide."
                            )
                        }]
                        synthesis_msgs.append({"role": "user", "content": new_content})
                    else:
                        synthesis_msgs.append({
                            "role": "user",
                            "content": (
                                (existing_content or "")
                                + "\n\n---\nSynthesize the research into a generate_outline JSON. "
                                "Output JSON only with slides at the top level; include key_points "
                                "and content for each slide."
                            ),
                        })
                else:
                    synthesis_msgs.append(msg)

            current_date = datetime.now().strftime("%B %d, %Y")
            current_year = datetime.now().strftime("%Y")
            synthesis_system = (
                f"Today's date is {current_date}. Current year: {current_year}. "
                "Synthesize the research into a generate_outline JSON with slides at the top level. "
                "Include key_points and content per slide. Output JSON only."
            )

            try:
                use_gemini = is_gemini_model(model)
                if use_gemini:
                    gemini_synthesis_contents = []
                    for msg in synthesis_msgs:
                        role = "user" if msg.get("role") == "user" else "model"
                        content = msg.get("content")
                        if isinstance(content, str):
                            gemini_synthesis_contents.append({"role": role, "parts": [{"text": content}]})
                        elif isinstance(content, list):
                            text_parts = [
                                {"text": item.get("text", "") if isinstance(item, dict) else str(item)}
                                for item in content
                            ]
                            if text_parts:
                                gemini_synthesis_contents.append({"role": role, "parts": text_parts})

                    final_response = await asyncio.wait_for(
                        asyncio.to_thread(
                            client.models.generate_content,
                            model=model,
                            contents=gemini_synthesis_contents,
                            config=genai_types.GenerateContentConfig(
                                system_instruction=synthesis_system,
                                max_output_tokens=8192,
                                temperature=0.7,
                            ),
                        ),
                        timeout=90.0,
                    )

                    synthesis_text = ""
                    if final_response.candidates:
                        candidate = final_response.candidates[0]
                        if candidate.content and candidate.content.parts:
                            for part in candidate.content.parts:
                                if getattr(part, "text", None):
                                    synthesis_text += part.text

                    if synthesis_text:
                        yield ("text", synthesis_text)
                else:
                    final_response = await asyncio.wait_for(
                        asyncio.to_thread(
                            client.messages.create,
                            model=model,
                            max_tokens=8192,
                            system=synthesis_system,
                            messages=synthesis_msgs,
                            temperature=0.7,
                        ),
                        timeout=90.0,
                    )
                    for block in final_response.content:
                        if getattr(block, "text", None):
                            yield ("text", block.text)
            except asyncio.TimeoutError:
                logger.error("[OutlineAgent] Final synthesis timed out")
                yield ("text", "I'm taking too long to synthesize. Please try with a simpler request.")
            except Exception as exc:
                logger.error("[OutlineAgent] Final synthesis failed: %s", exc)
            return

        current_date = datetime.now().strftime("%B %d, %Y")
        current_year = datetime.now().strftime("%Y")
        system_with_date = (
            f"Date: {current_date}. Current year: {current_year}. "
            "Use the current year in web searches.\n\n"
            f"{system_prompt}"
        )

        use_gemini = is_gemini_model(model)

        extra_context = await _get_extra_context(wait=False)
        if extra_context:
            msgs = msgs + [{"role": "user", "content": extra_context}]

        # Select tool set based on outline_tools flag
        if use_gemini:
            gemini_tool = get_gemini_outline_tools() if outline_tools else get_gemini_search_tool()
        anthropic_tools = OUTLINE_TOOLS if outline_tools else RESEARCH_TOOLS

        try:
            if use_gemini:
                gemini_contents = []
                for msg in msgs:
                    role = "user" if msg.get("role") == "user" else "model"
                    content = msg.get("content")
                    if isinstance(content, str):
                        gemini_contents.append({"role": role, "parts": [{"text": content}]})
                    elif isinstance(content, list):
                        text_parts = []
                        for item in content:
                            if isinstance(item, dict):
                                if item.get("type") == "text":
                                    text_parts.append({"text": item.get("text", "")})
                                elif item.get("type") == "tool_result":
                                    text_parts.append({"text": f"[Search Result]: {item.get('content', '')}"})
                            elif isinstance(item, str):
                                text_parts.append({"text": item})
                        if text_parts:
                            gemini_contents.append({"role": role, "parts": text_parts})

                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        client.models.generate_content,
                        model=model,
                        contents=gemini_contents,
                        config=genai_types.GenerateContentConfig(
                            system_instruction=system_with_date,
                            max_output_tokens=8192,
                            temperature=0.7,
                            tools=[gemini_tool],
                        ),
                    ),
                    timeout=120.0,
                )
            else:
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        client.messages.create,
                        model=model,
                        max_tokens=8192,
                        system=system_with_date,
                        messages=msgs,
                        tools=anthropic_tools,
                        temperature=0.7,
                    ),
                    timeout=120.0,
                )
        except asyncio.TimeoutError:
            logger.error("[OutlineAgent] API call timed out at depth=%s", depth)
            yield ("text", "I'm taking too long to process. Let me give you what I have so far.")
            return
        except Exception as exc:
            logger.error("[OutlineAgent] API call failed at depth=%s: %s", depth, exc)
            yield ("text", "I encountered an issue while researching. Let me work with what I have so far.")
            return

        if use_gemini:
            stop_reason = "end_turn"
            text_content = ""
            function_calls = []
            if response.candidates:
                candidate = response.candidates[0]
                if candidate.content and candidate.content.parts:
                    for part in candidate.content.parts:
                        if getattr(part, "text", None):
                            text_content += part.text
                        elif getattr(part, "function_call", None):
                            stop_reason = "tool_use"
                            function_calls.append(part.function_call)
        else:
            stop_reason = response.stop_reason

        if stop_reason == "max_tokens" or (use_gemini and response.candidates and response.candidates[0].finish_reason == "MAX_TOKENS"):
            if use_gemini:
                if text_content:
                    yield ("text", text_content)
            else:
                for block in response.content:
                    if getattr(block, "text", None):
                        yield ("text", block.text)
            yield f"data: {json.dumps({'type': 'error', 'message': 'Response was truncated. Try asking for fewer slides or less detail.'})}\n\n"
            return

        if stop_reason == "tool_use":
            tool_results = []
            if use_gemini:
                if text_content:
                    yield ("text", text_content)
            else:
                for block in response.content:
                    if getattr(block, "text", None):
                        yield ("text", block.text)

            search_tasks = []
            extract_tasks = []
            theme_tasks = []
            slide_tasks = []
            media_tasks = []

            if use_gemini:
                for i, fc in enumerate(function_calls):
                    args = fc.args if hasattr(fc, "args") else {}
                    if not isinstance(args, dict):
                        args = {}
                    block_id = f"gemini_fc_{i}"

                    if fc.name == "web_search":
                        query = args.get("query", "")
                        if query:
                            search_tasks.append({"block_id": block_id, "query": query})
                    elif fc.name == "deep_extract":
                        query = args.get("query", "")
                        urls = args.get("urls") or []
                        url = args.get("url")
                        if url:
                            urls = [url] + [u for u in urls if u != url]
                        extract_tasks.append({
                            "block_id": block_id,
                            "query": query,
                            "url": url,
                            "urls": urls,
                            "schema": args.get("schema"),
                            "max_credits": args.get("max_credits"),
                            "include_videos": bool(args.get("include_videos")),
                        })
                    elif fc.name == "update_theme":
                        theme_tasks.append({"block_id": block_id, "args": args})
                    elif fc.name in ("update_slides", "add_slide", "remove_slide", "reorder_slide"):
                        slide_tasks.append({"block_id": block_id, "name": fc.name, "args": args})
                    elif fc.name == "scrape_media":
                        media_tasks.append({"block_id": block_id, "args": args})
            else:
                for block in response.content:
                    if block.type != "tool_use":
                        continue
                    if block.name == "web_search":
                        query = block.input.get("query", "")
                        if query:
                            search_tasks.append({"block_id": block.id, "query": query})
                    elif block.name == "deep_extract":
                        query = block.input.get("query", "")
                        url = block.input.get("url")
                        urls = block.input.get("urls") or []
                        if url:
                            urls = [url] + [u for u in urls if u != url]
                        extract_tasks.append({
                            "block_id": block.id,
                            "query": query,
                            "url": url,
                            "urls": urls,
                            "schema": block.input.get("schema"),
                            "max_credits": block.input.get("max_credits"),
                            "include_videos": bool(block.input.get("include_videos")),
                        })
                    elif block.name == "update_theme":
                        theme_tasks.append({"block_id": block.id, "args": block.input})
                    elif block.name in ("update_slides", "add_slide", "remove_slide", "reorder_slide"):
                        slide_tasks.append({"block_id": block.id, "name": block.name, "args": block.input})
                    elif block.name == "scrape_media":
                        media_tasks.append({"block_id": block.id, "args": block.input})

            # ── Execute research tools (web_search, deep_extract) ──────────
            if search_tasks:
                for task in search_tasks:
                    query_preview = task['query'][:80] + '...' if len(task['query']) > 80 else task['query']
                    yield f"data: {json.dumps({'type': 'status', 'status': 'researching', 'message': f'Searching: {query_preview}', 'query': task['query']})}\n\n"

                async def search_with_id(task):
                    result = await research_with_perplexity(task["query"])
                    return {"block_id": task["block_id"], "query": task["query"], "result": result}

                search_results = await asyncio.gather(*[search_with_id(t) for t in search_tasks])

                for sr in search_results:
                    if sr["result"]["success"]:
                        tool_result = sr["result"]["content"]
                        if len(tool_result) > 2500:
                            tool_result = tool_result[:2500] + "\n\n[Truncated for brevity - use key facts above]"
                        content_preview = tool_result[:120].replace('\n', ' ').strip()
                        if len(tool_result) > 120:
                            content_preview += '...'
                        citations = sr['result'].get('citations', [])[:5]
                        cite_count = len(citations)
                        yield f"data: {json.dumps({'type': 'status', 'status': 'research_complete', 'message': f'Found {cite_count} sources: {content_preview}', 'query': sr['query']})}\n\n"
                        yield f"data: {json.dumps({'type': 'research', 'content': tool_result, 'citations': citations, 'query': sr['query']})}\n\n"
                    else:
                        error_msg = sr['result'].get('error', 'Unknown error')
                        tool_result = f"Search failed: {error_msg}"
                        yield f"data: {json.dumps({'type': 'status', 'status': 'research_failed', 'message': f'Search failed: {error_msg}', 'query': sr['query']})}\n\n"

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": sr["block_id"],
                        "content": tool_result,
                    })

            if extract_tasks:
                for task in extract_tasks:
                    url = task.get('url') or (task.get('urls', [None])[0] if task.get('urls') else None)
                    query = task.get('query') or ''
                    extract_target = url or query or 'content'
                    if len(extract_target) > 60:
                        extract_target = extract_target[:60] + '...'
                    yield f"data: {json.dumps({'type': 'status', 'status': 'extracting', 'message': f'Extracting from {extract_target}', 'query': task.get('query') or task.get('url') or ''})}\n\n"

                svc = get_firecrawl_agent_service()

                async def extract_with_id(task):
                    query = (task.get("query") or "").strip()
                    url = task.get("url")
                    urls = task.get("urls") or None
                    if not query:
                        query = f"Extract key information from {url or (urls[0] if urls else 'the site')}"
                    req = ExtractRequest(
                        query=query,
                        url=url,
                        urls=urls,
                        schema=task.get("schema"),
                        max_credits=task.get("max_credits") or 60,
                        include_videos=bool(task.get("include_videos")),
                        max_chars=2500,
                    )
                    result = await svc.extract(req)
                    return {"block_id": task["block_id"], "query": query, "url": url, "result": result}

                extract_results = await asyncio.gather(*[extract_with_id(t) for t in extract_tasks])

                for er in extract_results:
                    res = er["result"]
                    if res.success:
                        tool_result = res.text
                        if res.citations:
                            tool_result = (tool_result + "\n\nSources:\n" + "\n".join(res.citations[:5])).strip()
                        if len(tool_result) > 2500:
                            tool_result = tool_result[:2500] + "\n\n[Truncated for brevity - use key facts above]"
                        content_preview = tool_result[:100].replace('\n', ' ').strip()
                        if len(tool_result) > 100:
                            content_preview += '...'
                        source_info = er.get('url') or er['query']
                        if len(source_info) > 40:
                            source_info = source_info[:40] + '...'
                        yield f"data: {json.dumps({'type': 'status', 'status': 'extracted', 'message': f'Extracted from {source_info}: {content_preview}', 'query': er['query']})}\n\n"
                    else:
                        error_msg = res.error or 'Unknown error'
                        tool_result = f"Extraction failed: {error_msg}"
                        yield f"data: {json.dumps({'type': 'status', 'status': 'extract_failed', 'message': f'Extraction failed: {error_msg}', 'query': er['query']})}\n\n"

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": er["block_id"],
                        "content": tool_result,
                    })

            # ── Execute outline tools (theme, slides, media) ───────────────
            if theme_tasks:
                for task in theme_tasks:
                    yield f"data: {json.dumps({'type': 'status', 'status': 'updating_theme'})}\n\n"
                    logger.info("[OutlineAgent] Executing update_theme tool: %s", task["args"])
                    result = await _execute_update_theme(task["args"])
                    # Pass original args so streaming.py can emit them as theme_changes
                    result["_original_args"] = task["args"]
                    yield ("tool_result", "update_theme", result)
                    # Include selected colors in tool result so model can review search_query results
                    tool_result_content = {"success": result.get("success", True), "message": result.get("message", "")}
                    selected_colors = (result.get("style_preferences") or {}).get("colors")
                    if selected_colors:
                        tool_result_content["selected_colors"] = selected_colors
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": task["block_id"],
                        "content": json.dumps(tool_result_content),
                    })

            if slide_tasks:
                for task in slide_tasks:
                    tool_name = task["name"]
                    yield f"data: {json.dumps({'type': 'status', 'status': 'updating_slides'})}\n\n"
                    logger.info("[OutlineAgent] Executing %s tool: %s", tool_name, task["args"])

                    if tool_name == "update_slides":
                        result = _execute_update_slides(task["args"], current_outline)
                    elif tool_name == "add_slide":
                        result = _execute_add_slide(task["args"], current_outline)
                    elif tool_name == "remove_slide":
                        result = _execute_remove_slide(task["args"], current_outline)
                    elif tool_name == "reorder_slide":
                        result = _execute_reorder_slide(task["args"], current_outline)
                    else:
                        result = {"success": False, "message": f"Unknown tool: {tool_name}", "slides": []}

                    yield ("tool_result", tool_name, result)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": task["block_id"],
                        "content": json.dumps({"success": result.get("success", True), "message": result.get("message", "")}),
                    })

            if media_tasks:
                for task in media_tasks:
                    yield f"data: {json.dumps({'type': 'status', 'status': 'scraping_media'})}\n\n"
                    logger.info("[OutlineAgent] Executing scrape_media tool: %s", task["args"])
                    result = await _execute_scrape_media(task["args"])
                    yield ("tool_result", "scrape_media", result)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": task["block_id"],
                        "content": json.dumps({"success": result.get("success", True), "message": result.get("message", "")}),
                    })

            # If only outline tools were executed (no research), don't recurse —
            # UNLESS theme used search_query, in which case the model should
            # review the selected colors and can override with direct hex values.
            theme_used_search = any(
                (task.get("args") or {}).get("colors", {}).get("search_query")
                for task in theme_tasks
            )
            has_research_tools = bool(search_tasks or extract_tasks)
            if not has_research_tools and (theme_tasks or slide_tasks or media_tasks):
                if theme_used_search:
                    logger.info("[OutlineAgent] Theme used search_query; allowing model to review colors")
                else:
                    logger.info("[OutlineAgent] Outline-only tools executed; skipping model recursion")
                    return

            if tool_results:
                extra_context = await _get_extra_context(wait=False)
                if use_gemini:
                    assistant_text = text_content if text_content else "I'll gather that information."
                    results_blocks = []
                    for sr in search_tasks:
                        results_blocks.append(f"[Search Result for '{sr.get('query', 'query')}']:")
                    for er in extract_tasks:
                        label = er.get("query") or er.get("url") or "site"
                        results_blocks.append(f"[Extract Result for '{label}']:")
                    for tt in theme_tasks:
                        results_blocks.append("[Theme Update Result]:")
                    for st in slide_tasks:
                        results_blocks.append(f"[{st['name']} Result]:")
                    for mt in media_tasks:
                        results_blocks.append("[Scrape Media Result]:")
                    results_blocks = [b for b in results_blocks if b]
                    results_content = [tr.get("content", "") for tr in tool_results]
                    results_text = "\n\n".join(
                        [f"{label}\n{content}" for label, content in zip(results_blocks, results_content)]
                    ) if results_blocks else "\n\n".join(results_content)
                    if extra_context:
                        results_text = results_text + "\n\n" + extra_context

                    new_msgs = msgs + [
                        {"role": "assistant", "content": assistant_text},
                        {"role": "user", "content": f"Here are the results:\n\n{results_text}"},
                    ]
                else:
                    assistant_content = []
                    for block in response.content:
                        if block.type == "text":
                            assistant_content.append({"type": "text", "text": block.text})
                        elif block.type == "tool_use":
                            assistant_content.append({
                                "type": "tool_use",
                                "id": block.id,
                                "name": block.name,
                                "input": block.input,
                            })

                    new_msgs = msgs + [
                        {"role": "assistant", "content": assistant_content},
                        {"role": "user", "content": tool_results},
                    ]
                    if extra_context:
                        new_msgs.append({"role": "user", "content": extra_context})

                async for event in _call(new_msgs, depth + 1):
                    yield event
                return

        if use_gemini:
            if text_content:
                yield ("text", text_content)
        else:
            for block in response.content:
                if getattr(block, "text", None):
                    yield ("text", block.text)

    async for event in _call(msgs, 0):
        yield event
