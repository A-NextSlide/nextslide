import asyncio
import json
from datetime import datetime
from typing import Any, AsyncGenerator, Dict, List, Optional, Set, Tuple, Union

from setup_logging_optimized import get_logger
from services.firecrawl_agent_service import get_firecrawl_agent_service, ExtractRequest

from .research import research_with_perplexity
from .tools import SEARCH_TOOL, DEEP_EXTRACT_TOOL, get_gemini_search_tool, is_gemini_model, genai_types

logger = get_logger(__name__)

ToolEvent = Union[str, Tuple[str, str]]


async def call_model_with_tools(
    client,
    model: str,
    msgs: List[Dict[str, Any]],
    system_prompt: str,
    max_depth: int = 3,
    extra_context_tasks: Optional[List[asyncio.Task]] = None,
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
                            tools=[get_gemini_search_tool()],
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
                        tools=[SEARCH_TOOL, DEEP_EXTRACT_TOOL],
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

            if use_gemini:
                for i, fc in enumerate(function_calls):
                    args = fc.args if hasattr(fc, "args") else {}
                    if not isinstance(args, dict):
                        args = {}
                    if fc.name == "web_search":
                        query = args.get("query", "")
                        if query:
                            search_tasks.append({"block_id": f"gemini_fc_{i}", "query": query})
                    elif fc.name == "deep_extract":
                        query = args.get("query", "")
                        urls = args.get("urls") or []
                        url = args.get("url")
                        if url:
                            urls = [url] + [u for u in urls if u != url]
                        extract_tasks.append({
                            "block_id": f"gemini_fc_{i}",
                            "query": query,
                            "url": url,
                            "urls": urls,
                            "schema": args.get("schema"),
                            "max_credits": args.get("max_credits"),
                            "include_videos": bool(args.get("include_videos")),
                        })
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
                        # Extract a preview of the actual content found
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
                        # Extract preview of actual content
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
