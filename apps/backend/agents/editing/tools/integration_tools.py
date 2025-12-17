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

from typing import Dict, List, Optional, Any, Callable
import logging
import asyncio

from models.deck import DeckDiff, DeckDiffBase
from models.registry import ComponentRegistry

logger = logging.getLogger(__name__)


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

    # STEP 1: Web search to find LinkedIn URLs and photos
    logger.info(f"[LinkedIn Tool] Step 1: Web search for LinkedIn URLs and photos")
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

    # Extract LinkedIn URLs from photo results
    linkedin_urls_found = set()
    photo_by_linkedin_url = {}

    for photo in photos:
        page_url = photo.get("page_url", "")
        photo_url = photo.get("url", "")
        photo_alt = photo.get("alt", "")

        if page_url and "linkedin.com" in page_url:
            # Extract username from LinkedIn URL
            post_match = re.search(r'linkedin\.com/posts/([a-zA-Z0-9-]+)_', page_url)
            profile_match = re.search(r'linkedin\.com/in/([a-zA-Z0-9-]+)', page_url)

            if post_match:
                username = post_match.group(1)
                linkedin_url = f"https://www.linkedin.com/in/{username}"
                linkedin_urls_found.add(linkedin_url)
                if linkedin_url not in photo_by_linkedin_url:
                    photo_by_linkedin_url[linkedin_url] = {"url": photo_url, "alt": photo_alt}
            elif profile_match:
                username = profile_match.group(1)
                linkedin_url = f"https://www.linkedin.com/in/{username}"
                linkedin_urls_found.add(linkedin_url)
                if linkedin_url not in photo_by_linkedin_url:
                    photo_by_linkedin_url[linkedin_url] = {"url": photo_url, "alt": photo_alt}

    logger.info(f"[LinkedIn Tool] Found {len(linkedin_urls_found)} unique LinkedIn URLs")

    # STEP 2: Use Apollo people/match to enrich profiles with full data
    formatted_profiles = []
    apollo = get_apollo_service()

    logger.info(f"[LinkedIn Tool] Apollo configured: {apollo.is_configured() if apollo else 'NO APOLLO'}")
    logger.info(f"[LinkedIn Tool] LinkedIn URLs found: {len(linkedin_urls_found)}")

    if apollo and apollo.is_configured() and linkedin_urls_found:
        logger.info(f"[LinkedIn Tool] Step 2: Enriching {len(linkedin_urls_found)} profiles via Apollo")

        # Helper to check if names match - STRICT: require BOTH first AND last name to match
        def names_match(searched_name: str, found_name: str) -> bool:
            if not searched_name or not found_name:
                return False
            searched_parts = [p.lower() for p in searched_name.split() if p]
            found_parts = [p.lower() for p in found_name.split() if p]

            # Need at least 2 name parts to do proper matching
            if len(searched_parts) < 2 or len(found_parts) < 2:
                # If single name, require exact match
                return searched_parts == found_parts

            # STRICT: Both first AND last name must match
            # First name = first part, Last name = last part
            searched_first = searched_parts[0]
            searched_last = searched_parts[-1]
            found_first = found_parts[0]
            found_last = found_parts[-1]

            # Both first and last name must match
            first_match = searched_first == found_first
            last_match = searched_last == found_last

            if first_match and last_match:
                return True

            # Log why it didn't match for debugging
            if not first_match and not last_match:
                logger.debug(f"[LinkedIn Tool] Name mismatch: '{searched_name}' vs '{found_name}' (neither first nor last match)")
            elif not first_match:
                logger.debug(f"[LinkedIn Tool] First name mismatch: '{searched_first}' vs '{found_first}'")
            elif not last_match:
                logger.debug(f"[LinkedIn Tool] Last name mismatch: '{searched_last}' vs '{found_last}'")

            return False

        for linkedin_url in list(linkedin_urls_found)[:5]:  # Limit to 5 enrichments
            try:
                logger.info(f"[LinkedIn Tool] Enriching URL: {linkedin_url}")
                person = apollo.enrich_person(linkedin_url=linkedin_url)
                if person:
                    logger.info(f"[LinkedIn Tool] Apollo returned: name={person.name}, title={person.title}, company={person.company}, photo={person.photo_url[:80] if person.photo_url else 'NONE'}...")
                    # CRITICAL: Check if this is the right person by NAME match
                    # Web search often returns profiles of random people
                    if person.name and not names_match(name, person.name):
                        logger.warning(f"[LinkedIn Tool] SKIPPING wrong person: searched for '{name}', found '{person.name}'")
                        continue

                    # ALWAYS prefer Apollo photo_url - it's from the actual LinkedIn profile
                    # Web search photos are unreliable (often wrong person's photos)
                    apollo_photo = person.photo_url
                    if apollo_photo:
                        photo_url = apollo_photo
                        logger.info(f"[LinkedIn Tool] Using Apollo photo for {person.name}: {apollo_photo[:80]}...")
                    else:
                        # Only fall back to web search if Apollo has NO photo at all
                        web_photo = photo_by_linkedin_url.get(linkedin_url, {})
                        photo_url = web_photo.get("url")
                        logger.warning(f"[LinkedIn Tool] Apollo has no photo for {person.name}, using web search fallback")

                    # Check confidence by company match
                    confidence = "low"
                    if company:
                        if person.company and company.lower() in person.company.lower():
                            confidence = "high"
                        elif person.title and company.lower() in person.title.lower():
                            confidence = "high"

                    profile_data = {
                        "id": f"profile-apollo-{person.name.replace(' ', '-').lower()}" if person.name else f"profile-{linkedin_url}",
                        "name": person.name or name,
                        "title": person.title,
                        "company": person.company,
                        "headline": f"{person.title} at {person.company}" if person.title and person.company else person.title or person.company,
                        "location": f"{person.city}, {person.state}" if person.city else None,
                        "linkedin_url": person.linkedin_url or linkedin_url,
                        "photo_url": photo_url,
                        "email": person.email,
                        "source": "apollo",
                        "confidence": confidence,
                    }
                    formatted_profiles.append(profile_data)
                    logger.info(f"[LinkedIn Tool] Enriched: {person.name} - {person.title} at {person.company}")
            except Exception as e:
                logger.warning(f"[LinkedIn Tool] Failed to enrich {linkedin_url}: {e}")

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
