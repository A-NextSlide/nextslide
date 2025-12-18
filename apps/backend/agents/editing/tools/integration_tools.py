"""
Integration tools for the orchestrator.

These tools allow the LLM to interact with external integrations like LinkedIn, Apollo, etc.

SCALABLE INTEGRATION PATTERN:
============================
Each integration tool should return a DeckDiff with an observation using this generic format:

    diff.observation = {
        "integration": "integration_name",  # e.g., "linkedin", "figma", "salesforce"
        "type": "data_type",                # "profiles", "files", "designs", or "items"
        "data": [...],                      # Array of items with relevant fields
        "query": "original query",
        "source": "api_name"
    }

The orchestrator will automatically:
1. Collect observations from all integration tools
2. Inject the data into subsequent slide creation/editing tools
3. Format the data appropriately based on type:
   - "profiles": name, title, company, photo_url, linkedin_url, email
   - "files"/"designs": name, url, thumbnail_url, preview_url
   - "items": generic key-value pairs

This allows any integration to feed data into slide creation without hardcoding.
"""

import os
from typing import Dict, List, Optional, Any, Callable
import logging
import asyncio

from models.deck import DeckDiff, DeckDiffBase
from models.registry import ComponentRegistry

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# WEB SEARCH TOOL - Uses Perplexity for real-time data
# ═══════════════════════════════════════════════════════════════════════════════

def web_search(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
    event_cb: Callable = None,
) -> DeckDiff:
    """
    Search the web for current information, facts, and data using Perplexity.

    Use this when user asks to:
    - Improve/update/replace content with real data
    - Add statistics, facts, or current information
    - Research a topic for accurate content

    Args:
        args: Tool arguments
            - query: Search query string
        deck_data: Full deck object (unused)
        current_slide: Currently selected slide (unused)
        registry: Component registry (unused)
        attachments: User-uploaded files (unused)
        event_cb: Callback for streaming events (unused)

    Returns:
        DeckDiff with search results in observation for context injection
    """
    from agents.ai.clients import get_client

    query = args.get("query", "")
    if not query:
        logger.warning("[WebSearch] No query provided")
        diff = DeckDiff(DeckDiffBase())
        diff.observation = {
            "integration": "web_search",
            "type": "research",
            "data": [],
            "query": query,
            "error": "No query provided"
        }
        return diff

    logger.info(f"[WebSearch] Searching for: {query}")

    # Check if Perplexity API key is available
    if not (os.getenv("PPLX_API_KEY") or os.getenv("PERPLEXITY_API_KEY")):
        logger.warning("[WebSearch] Perplexity API key not set")
        diff = DeckDiff(DeckDiffBase())
        diff.observation = {
            "integration": "web_search",
            "type": "research",
            "data": [],
            "query": query,
            "error": "Perplexity API key not configured"
        }
        return diff

    try:
        client, model = get_client("perplexity-sonar", wrap_with_instructor=False)

        # Focused prompt for slide content improvement
        system_prompt = """You are a research assistant helping improve presentation content.
Provide accurate, current information with specific facts, numbers, and statistics.
Focus on concrete data that can be directly used to update slide text.
Keep responses concise and factual - just the key points and data."""

        response = client.chat.completions.create(
            model="sonar",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query}
            ],
            max_tokens=5000,
            extra_body={
                "return_citations": True,
                "search_recency_filter": "month"
            }
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

        logger.info(f"[WebSearch] Research completed: {len(content)} chars, {len(citations)} citations")

        # Return as observation for context injection
        diff = DeckDiff(DeckDiffBase())
        diff.observation = {
            "integration": "web_search",
            "type": "research",
            "data": [{
                "content": content,
                "citations": citations,
                "query": query
            }],
            "query": query,
            "source": "perplexity"
        }
        return diff

    except Exception as e:
        logger.error(f"[WebSearch] Research failed: {e}")
        diff = DeckDiff(DeckDiffBase())
        diff.observation = {
            "integration": "web_search",
            "type": "research",
            "data": [],
            "query": query,
            "error": str(e)
        }
        return diff


# ═══════════════════════════════════════════════════════════════════════════════
# LINKEDIN LOOKUP TOOL
# ═══════════════════════════════════════════════════════════════════════════════


async def _search_profile_photos_fallback(name: str, company: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Fallback: Search for professional profile photos using web search.
    Used when Apollo's paid API is not available.

    IMPORTANT: Use quotes around name for exact matching to avoid finding wrong people.
    """
    try:
        from services.serpapi_service import SerpAPIService

        serp = SerpAPIService()
        if not serp.is_available:
            logger.warning("[LinkedIn Tool] SerpAPI not available for fallback search")
            return []

        # Build search query with EXACT name matching using quotes
        # This prevents finding random people with similar names or at same company
        if company:
            # Search for exact name + company on LinkedIn profiles
            query = f'"{name}" "{company}" linkedin profile'
        else:
            # Search for exact name on LinkedIn profiles
            query = f'"{name}" linkedin profile photo'

        logger.info(f"[LinkedIn Tool] Searching for: {query}")

        # Search for professional photos
        results = await serp.search_images(
            query=query,
            per_page=10,  # Get more results since exact matching may filter some out
            orientation="square"  # Professional photos are often square
        )

        photos = results.get("photos", [])
        logger.info(f"[LinkedIn Tool] Found {len(photos)} photos")

        return photos

    except Exception as e:
        logger.error(f"[LinkedIn Tool] Fallback search error: {e}")
        return []


def linkedin_lookup(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
    event_cb: Callable = None,
) -> DeckDiff:
    """
    Look up LinkedIn profiles using a two-step approach:
    1. Web search to find LinkedIn URLs and photos
    2. Apollo people/match to get full profile data (name, title, company)

    Args:
        args: Tool arguments
            - name: Person's name to search for
            - company: Company name (optional, helps narrow search)
            - title: Job title (optional, helps narrow search)
        deck_data: Full deck object (unused)
        current_slide: Currently selected slide (unused)
        registry: Component registry (unused)
        attachments: User-uploaded files (unused)
        event_cb: Callback for streaming events

    Returns:
        DeckDiff with profile observation for context injection
    """
    from services.apollo_service import get_apollo_service
    import re

    name = args.get("name")
    company = args.get("company")
    title = args.get("title")

    # Build query string for logging/display
    query_parts = []
    if name:
        query_parts.append(name)
    if company:
        query_parts.append(f"at {company}")
    if title:
        query_parts.append(f"({title})")
    query_str = " ".join(query_parts) or "unknown"

    logger.info(f"[LinkedIn Tool] Searching for: {query_str}")

    # Emit loading state
    if event_cb:
        try:
            event_cb("assistant.linkedin_profiles", {
                "type": "linkedin_profiles",
                "query": query_str,
                "profiles": [],
                "isLoading": True
            })
        except Exception as e:
            logger.warning(f"[LinkedIn Tool] Failed to emit loading state: {e}")

    # STEP 1: Try Apollo direct search first (uses search → enrich by ID for full data)
    apollo = get_apollo_service()
    formatted_profiles = []
    photo_by_linkedin_url = {}

    logger.info(f"[LinkedIn Tool] Apollo configured: {apollo.is_configured() if apollo else 'NO APOLLO'}")

    if apollo and apollo.is_configured():
        logger.info(f"[LinkedIn Tool] Step 1: Apollo direct search for {name}")
        try:
            # This uses search → enrich by ID, which returns full data including employment_history
            apollo_results = apollo.search_linkedin_profiles(name=name, company=company, title=title)
            logger.info(f"[LinkedIn Tool] Apollo search returned {len(apollo_results)} results")

            for person in apollo_results[:5]:  # Limit to 5
                if not person.name:
                    continue

                # Helper to detect LinkedIn placeholder/default images
                def is_placeholder_photo(url: str) -> bool:
                    if not url:
                        return True
                    placeholder_patterns = [
                        "static.licdn.com/aero-v1/sc/h/",
                        "static.licdn.com/sc/h/",
                        "static-exp1.licdn.com/sc/h/",
                    ]
                    return any(pattern in url for pattern in placeholder_patterns)

                photo_url = person.photo_url if not is_placeholder_photo(person.photo_url) else None

                # Check confidence by company match
                confidence = "low"
                if company:
                    if person.company and company.lower() in person.company.lower():
                        confidence = "high"
                    elif person.title and company.lower() in person.title.lower():
                        confidence = "high"

                # Format employment history
                employment_history = []
                if person.employment_history:
                    for job in person.employment_history:
                        job_entry = {
                            "title": job.title,
                            "company": job.organization_name,
                            "start_date": job.start_date,
                            "end_date": job.end_date,
                            "current": job.current,
                        }
                        if job.description:
                            job_entry["description"] = job.description
                        employment_history.append(job_entry)
                    logger.info(f"[LinkedIn Tool] Found {len(employment_history)} employment history entries for {person.name}")

                profile_data = {
                    "id": f"profile-apollo-{person.name.replace(' ', '-').lower()}" if person.name else "profile-unknown",
                    "name": person.name,
                    "title": person.title,
                    "company": person.company,
                    "headline": f"{person.title} at {person.company}" if person.title and person.company else person.title or person.company,
                    "location": f"{person.city}, {person.state}" if person.city else None,
                    "linkedin_url": person.linkedin_url,
                    "photo_url": photo_url,  # May be None if placeholder
                    "email": person.email,
                    "phone": person.phone,
                    "employment_history": employment_history if employment_history else None,
                    "source": "apollo",
                    "confidence": confidence,
                }

                # Track LinkedIn URL for photo fallback
                if person.linkedin_url:
                    photo_by_linkedin_url[person.linkedin_url] = {"url": None, "alt": ""}

                formatted_profiles.append(profile_data)
                logger.info(f"[LinkedIn Tool] Added profile: {person.name} - {person.title} at {person.company}")

        except Exception as e:
            logger.error(f"[LinkedIn Tool] Apollo search failed: {e}")
            import traceback
            logger.error(traceback.format_exc())

    # STEP 2: Web search for photos (supplement missing photos from Apollo)
    logger.info(f"[LinkedIn Tool] Step 2: Web search for profile photos")
    try:
        try:
            loop = asyncio.get_running_loop()
            import concurrent.futures
            future = asyncio.run_coroutine_threadsafe(_search_profile_photos_fallback(name, company), loop)
            photos = future.result(timeout=30)
        except RuntimeError:
            photos = asyncio.run(_search_profile_photos_fallback(name, company))
    except Exception as e:
        logger.error(f"[LinkedIn Tool] Web search error: {e}")
        photos = []

    logger.info(f"[LinkedIn Tool] Web search found {len(photos)} photos")

    # Build photo lookup from web search
    import re
    for photo in photos:
        page_url = photo.get("page_url", "")
        photo_url = photo.get("url", "")
        photo_alt = photo.get("alt", "")

        if page_url and "linkedin.com" in page_url:
            post_match = re.search(r'linkedin\.com/posts/([a-zA-Z0-9-]+)_', page_url)
            profile_match = re.search(r'linkedin\.com/in/([a-zA-Z0-9-]+)', page_url)

            linkedin_url = None
            if post_match:
                linkedin_url = f"https://www.linkedin.com/in/{post_match.group(1)}"
            elif profile_match:
                linkedin_url = f"https://www.linkedin.com/in/{profile_match.group(1)}"

            if linkedin_url and linkedin_url not in photo_by_linkedin_url:
                photo_by_linkedin_url[linkedin_url] = {"url": photo_url, "alt": photo_alt}

    # Fill in missing photos from web search
    for profile in formatted_profiles:
        if not profile.get("photo_url") and profile.get("linkedin_url"):
            # Try to find photo from web search
            linkedin_url = profile["linkedin_url"]
            # Normalize URL for matching
            normalized = linkedin_url.replace("http://", "https://").rstrip("/")
            for url, photo_data in photo_by_linkedin_url.items():
                if url.replace("http://", "https://").rstrip("/") == normalized and photo_data.get("url"):
                    profile["photo_url"] = photo_data["url"]
                    logger.info(f"[LinkedIn Tool] Added web search photo for {profile['name']}")
                    break

    # If Apollo enrichment found profiles, check if we have any good matches
    if formatted_profiles:
        # Sort by confidence (high first) for better UX
        formatted_profiles.sort(key=lambda p: 0 if p.get("confidence") == "high" else 1)

        # Check if we have any high-confidence matches
        high_confidence_profiles = [p for p in formatted_profiles if p.get("confidence") == "high"]

        if high_confidence_profiles:
            # We have good matches - show the modal for user selection
            logger.info(f"[LinkedIn Tool] Returning {len(formatted_profiles)} profiles ({len(high_confidence_profiles)} high confidence) for user selection")

            # Emit profiles event to frontend
            if event_cb:
                event_cb("assistant.linkedin_profiles", {
                    "type": "linkedin_profiles",
                    "query": query_str,
                    "profiles": formatted_profiles,
                    "isLoading": False
                })

            # Return DeckDiff with observation
            diff = DeckDiff(DeckDiffBase())
            diff.observation = {
                "integration": "linkedin",
                "type": "profiles",
                "data": formatted_profiles,
                "query": query_str,
                "source": "apollo"
            }
            return diff
        else:
            # No high-confidence matches - DON'T show modal, respond in chat instead
            logger.warning(f"[LinkedIn Tool] No high-confidence matches for '{query_str}' - returning empty to let agent respond in chat")

            # Emit a "no good matches" event so frontend can show a message
            if event_cb:
                event_cb("assistant.linkedin_profiles", {
                    "type": "linkedin_profiles",
                    "query": query_str,
                    "profiles": [],  # Empty - don't show wrong people
                    "isLoading": False,
                    "error": f"No reliable matches found for '{query_str}'. The search found some profiles but none were confident matches."
                })

            # Return empty DeckDiff with observation about the failed search
            diff = DeckDiff(DeckDiffBase())
            diff.observation = {
                "integration": "linkedin",
                "type": "profiles",
                "data": [],  # Empty - no good matches
                "query": query_str,
                "source": "apollo",
                "no_confident_match": True,
                "message": f"I searched for '{query_str}' but couldn't find a confident match. Try being more specific with the company name."
            }
            return diff

    # If Apollo enrichment didn't work, create profiles from web search photos
    # We already have photos from step 1, just need to format them
    if photos:
        logger.info(f"[LinkedIn Tool] Apollo enrichment failed, using web search photos as fallback")

        for i, photo in enumerate(photos[:5]):
            photo_url = photo.get("url")
            if not photo_url:
                continue

            page_url = photo.get("page_url", "")
            photo_alt = photo.get("alt", "")
            photo_source = photo.get("photographer", "")

            # Extract LinkedIn URL if available
            linkedin_url = None
            if page_url and "linkedin.com" in page_url:
                post_match = re.search(r'linkedin\.com/posts/([a-zA-Z0-9-]+)_', page_url)
                profile_match = re.search(r'linkedin\.com/in/([a-zA-Z0-9-]+)', page_url)
                if post_match:
                    linkedin_url = f"https://www.linkedin.com/in/{post_match.group(1)}"
                elif profile_match:
                    linkedin_url = f"https://www.linkedin.com/in/{profile_match.group(1)}"

            # Determine confidence based on company match
            confidence = "low"
            extracted_company = None
            if company and photo_alt and company.lower() in photo_alt.lower():
                confidence = "high"
                extracted_company = company

            # Build a proper headline (not post content!)
            # Only show title/company if we have real data
            if title and extracted_company:
                headline = f"{title} at {extracted_company}"
            elif title:
                headline = title
            elif extracted_company:
                headline = f"at {extracted_company}"
            else:
                headline = "LinkedIn Profile"  # Clean fallback, not post content

            profile_data = {
                "id": f"profile-web-{i}-{name.replace(' ', '-').lower()}",
                "name": name,
                "title": title,  # Use searched title if provided
                "company": extracted_company,
                "headline": headline,
                "location": None,
                "linkedin_url": linkedin_url,
                "photo_url": photo_url,
                "email": None,
                "source": "web_search",
                "photo_context": photo_source or "Web search",
                "is_photo_option": True,
                "confidence": confidence,
            }
            formatted_profiles.append(profile_data)

        if formatted_profiles:
            # Check if we have any high-confidence matches from web search
            high_confidence_profiles = [p for p in formatted_profiles if p.get("confidence") == "high"]

            if high_confidence_profiles:
                logger.info(f"[LinkedIn Tool] Created {len(formatted_profiles)} profile options from web search ({len(high_confidence_profiles)} high confidence)")

                if event_cb:
                    event_cb("assistant.linkedin_profiles", {
                        "type": "linkedin_profiles",
                        "query": query_str,
                        "profiles": formatted_profiles,
                        "isLoading": False,
                        "note": "Profiles created from web search (Apollo enrichment unavailable)"
                    })

                diff = DeckDiff(DeckDiffBase())
                diff.observation = {
                    "integration": "linkedin",
                    "type": "profiles",
                    "data": formatted_profiles,
                    "query": query_str,
                    "source": "web_search"
                }
                return diff
            else:
                # No high-confidence matches from web search either
                logger.warning(f"[LinkedIn Tool] No high-confidence web search matches for '{query_str}'")

                if event_cb:
                    event_cb("assistant.linkedin_profiles", {
                        "type": "linkedin_profiles",
                        "query": query_str,
                        "profiles": [],
                        "isLoading": False,
                        "error": f"No reliable matches found for '{query_str}'."
                    })

                diff = DeckDiff(DeckDiffBase())
                diff.observation = {
                    "integration": "linkedin",
                    "type": "profiles",
                    "data": [],
                    "query": query_str,
                    "source": "web_search",
                    "no_confident_match": True,
                    "message": f"I searched for '{query_str}' but couldn't find a confident match."
                }
                return diff

    # No results from any source
    logger.warning(f"[LinkedIn Tool] No profiles found for: {query_str}")
    if event_cb:
        event_cb("assistant.linkedin_profiles", {
            "type": "linkedin_profiles",
            "query": query_str,
            "profiles": [],
            "isLoading": False,
            "error": "No profiles found"
        })

    return DeckDiff(DeckDiffBase())
