import os
import json
import asyncio
from typing import Dict, Any

from agents.ai.clients import get_client
from agents.config import OUTLINE_AGENT_MODEL
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


async def research_with_perplexity(query: str) -> Dict[str, Any]:
    """
    Use Perplexity Sonar to research a topic. Simple and direct - let the AI do the thinking.
    """
    try:
        # Check if API key is available
        if not (os.getenv("PPLX_API_KEY") or os.getenv("PERPLEXITY_API_KEY")):
            logger.warning("[OutlineAgent] Perplexity API key not set - skipping research")
            return {
                "success": False,
                "content": None,
                "citations": [],
                "error": "PPLX_API_KEY not configured"
            }

        client, model = get_client("perplexity-sonar", wrap_with_instructor=False)

        # Simple prompt - Perplexity is smart, let it figure out what's needed
        system_prompt = """You are a research assistant helping create a presentation.
Provide accurate, current information with specific facts, numbers, and statistics.
Always cite your sources. Focus on what would be useful for presentation slides."""

        # Run Perplexity call with timeout to prevent hanging
        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.chat.completions.create,
                model="sonar",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": query}
                ],
                max_tokens=3000,
                extra_body={
                    "return_citations": True,
                    "search_recency_filter": "month"
                }
            ),
            timeout=60.0  # 60 second timeout per search
        )

        content = response.choices[0].message.content

        # Extract citations
        citations = []
        if hasattr(response, 'citations'):
            for cit in response.citations:
                if isinstance(cit, str):
                    citations.append(cit)
                elif isinstance(cit, dict):
                    citations.append(cit.get('url', str(cit)))

        logger.info(f"[OutlineAgent] Perplexity research completed: {len(content)} chars, {len(citations)} citations")
        logger.info(f"[OutlineAgent] Perplexity content preview: {content[:300]}...")

        return {
            "success": True,
            "content": content,
            "citations": citations,
            "query": query
        }

    except asyncio.TimeoutError:
        # Timeouts are expected with external APIs - log as warning, not error
        # Fixes SLIDE-BACKEND-280: Perplexity timeout was incorrectly logged as error
        logger.warning(f"[OutlineAgent] Perplexity search timed out (60s) for: {query[:50]}...")
        return {
            "success": False,
            "content": None,
            "citations": [],
            "error": "Search timed out after 60 seconds"
        }
    except Exception as e:
        logger.warning(f"[OutlineAgent] Perplexity research failed: {e}")
        return {
            "success": False,
            "content": None,
            "citations": [],
            "error": str(e)
        }
