"""Intelligent research decision based on prompt analysis."""

import json
from datetime import datetime, timezone
from typing import Tuple, List, Optional

from agents.ai.clients import get_client, invoke
from agents.config import GEMINI_3_FLASH
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

RESEARCH_DECISION_PROMPT = """You are analyzing a presentation prompt to decide if web research is needed.

Today's date: {today_date}

RESEARCH IS NEEDED FOR:
- Future events, dates, releases, conferences, predictions after today's date
- Current/recent statistics, market data, metrics, numbers that change over time
- Recent news, trends, developments, announcements
- Specific company/product information that may have updated recently
- Comparisons requiring up-to-date data (market share, rankings, benchmarks)
- Any factual claims about things that happened recently or will happen
- Sports scores, stock prices, current events, election results
- Technology specs, pricing, or availability that changes frequently
- Scientific findings, research papers, studies from recent years

RESEARCH IS NOT NEEDED FOR:
- General concepts, frameworks, methodologies, or educational content
- Historical information that doesn't change (events before 2023)
- Opinion pieces, strategy frameworks, or thought leadership without data requirements
- Internal company presentations using only provided context/files
- Evergreen topics like "how to give a good presentation" or "leadership principles"
- Timeless advice, tips, or best practices
- Content where the user has provided all necessary data in their prompt or files

Prompt to analyze:
{prompt}

Style context (if any):
{style_context}

Respond with ONLY valid JSON, no markdown:
{{"needs_research": true/false, "reason": "brief 1-sentence explanation", "research_queries": ["specific query 1", "specific query 2"]}}

If research is not needed, return empty research_queries array.
If research is needed, provide 1-3 specific search queries that would gather the most relevant, current information.
"""


async def should_research(
    prompt: str,
    style_context: Optional[str] = None,
) -> Tuple[bool, List[str], str]:
    """
    Analyze prompt to decide if research is needed using LLM.

    Args:
        prompt: The user's presentation prompt
        style_context: Optional additional context

    Returns:
        Tuple of (needs_research: bool, research_queries: list[str], reason: str)
    """
    try:
        today_date = datetime.now(timezone.utc).strftime('%Y-%m-%d (%A)')

        decision_prompt = RESEARCH_DECISION_PROMPT.format(
            today_date=today_date,
            prompt=prompt,
            style_context=style_context or "None provided"
        )

        client, model = get_client(GEMINI_3_FLASH)

        response = invoke(
            client,
            model,
            [{"role": "user", "content": decision_prompt}],
            response_model=None,
            max_tokens=500,
            temperature=0.1,
        )

        # Parse JSON response
        try:
            # Clean up response - remove markdown code blocks if present
            cleaned = response.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("```")[1]
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:]
            cleaned = cleaned.strip()

            result = json.loads(cleaned)
            needs_research = result.get("needs_research", False)
            research_queries = result.get("research_queries", [])
            reason = result.get("reason", "")

            logger.info(f"[RESEARCH DECISION] needs_research={needs_research}, reason='{reason}'")
            if research_queries:
                logger.info(f"[RESEARCH DECISION] queries: {research_queries}")

            return needs_research, research_queries, reason

        except json.JSONDecodeError as e:
            logger.warning(f"[RESEARCH DECISION] Failed to parse JSON: {e}, response: {response[:200]}")
            # Default to research for safety if we can't parse
            return True, [], "Failed to parse decision, defaulting to research"

    except Exception as e:
        logger.error(f"[RESEARCH DECISION] Error in research decision: {e}")
        # Default to research for safety
        return True, [], f"Error in decision: {str(e)}"


def get_current_date_context() -> str:
    """Get formatted current date for injection into prompts."""
    now = datetime.now(timezone.utc)
    return f"Today's date (UTC): {now.strftime('%Y-%m-%d')} ({now.strftime('%A, %B %d, %Y')})"
