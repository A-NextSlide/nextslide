import os
from supabase import create_client, Client
from dotenv import load_dotenv
from typing import Dict, Any, Optional
import uuid
import logging
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError

# Load environment variables
load_dotenv()

# Get Supabase credentials from environment variables
SUPABASE_URL = os.getenv("SUPABASE_URL")
# Use service key if available, otherwise fall back to anon key
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")

# Create separate clients for different purposes
_service_client = None
_anon_client = None

def get_supabase_client() -> Client:
    """
    Create and return a Supabase client instance.
    This will use the service key if available to bypass RLS.
    
    Returns:
        Client: A configured Supabase client instance
        
    Raises:
        ValueError: If SUPABASE_URL or SUPABASE_KEY environment variables are not set
    """
    global _service_client
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY environment variables must be set")
    
    if _service_client is None:
        _service_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        
    return _service_client

def reset_supabase_client() -> None:
    """
    Reset the cached Supabase client so a fresh connection pool is created on next use.
    Helpful to recover from HTTP/2 stream resets and SSL EOFs.
    """
    global _service_client
    try:
        _service_client = None
        logging.getLogger(__name__).info("Supabase client has been reset")
    except Exception as e:
        logging.getLogger(__name__).warning(f"Failed to reset Supabase client: {e}")

def perform_supabase_operation_with_retry(operation, description: str = "operation", max_attempts: int = 3, timeout_seconds: float = 8.0):
    """
    Execute a blocking Supabase SDK operation with timeout and retries.
    - Runs the callable in a thread to enforce a timeout.
    - Retries on transient transport errors (HTTP/2 stream reset, SSL EOF) and timeouts.

    Args:
        operation: Zero-arg callable that performs the Supabase request synchronously and returns the result
        description: Text description for logging
        max_attempts: Max number of attempts (including the first)
        timeout_seconds: Per-attempt timeout

    Returns:
        The operation's return value

    Raises:
        The last exception if all attempts fail
    """
    logger = logging.getLogger(__name__)
    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(operation)
                return future.result(timeout=timeout_seconds)
        except FutureTimeoutError as e:
            last_error = e
            logger.warning(f"Supabase {description} timed out on attempt {attempt}/{max_attempts}")
            # Reset client before next attempt to drop any bad connections
            reset_supabase_client()
        except Exception as e:
            last_error = e
            message = str(e)
            logger.warning(f"Supabase {description} failed on attempt {attempt}/{max_attempts}: {message}")
            # Reset client on common transient protocol errors
            if any(err in message for err in [
                "StreamReset", "UNEXPECTED_EOF_WHILE_READING", "EOF occurred in violation of protocol",
                "RemoteProtocolError", "ConnectionResetError", "ReadError"
            ]):
                reset_supabase_client()
            # Small backoff
            time.sleep(0.2 * (2 ** (attempt - 1)))
    # Exhausted attempts
    raise last_error

def get_anon_supabase_client() -> Client:
    """
    Create and return a Supabase client with anon key for frontend operations.
    
    Returns:
        Client: A configured Supabase client instance with anon key
    """
    global _anon_client
    
    anon_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
    if not SUPABASE_URL or not anon_key:
        raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY environment variables must be set")
    
    if _anon_client is None:
        _anon_client = create_client(SUPABASE_URL, anon_key)
        
    return _anon_client

def upload_deck(deck_data: Dict[str, Any], deck_uuid: str, user_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Upload a deck to Supabase.
    
    Args:
        deck_data: Dictionary containing deck data with the following structure:
            {
                "name": str,
                "slides": List[Dict],
                "size": Dict[str, int],
                "status": Dict[str, Any],  # Optional status object
                "outline": Dict[str, Any],  # Optional outline object
                "theme": Dict[str, Any],  # Optional theme/style data
                "style_spec": Dict[str, Any]  # Optional style specification
            }
        deck_uuid: The UUID to use for the deck
        user_id: Optional user ID to associate with the deck
    
    Returns:
        Dict containing the uploaded deck data including the UUID
    """
    logger = logging.getLogger(__name__)
    
    supabase = get_supabase_client()
    
    try:
        logger.info(f"🔄 Uploading deck {deck_uuid} - {len(deck_data.get('slides', []))} slides, status: {deck_data.get('status', {}).get('state', 'unknown')}, user: {user_id or 'anonymous'}")
        
        # Debug: Log the actual slide data being uploaded
        for i, slide in enumerate(deck_data.get('slides', [])[:3]):  # First 3 slides
            components_count = len(slide.get('components', []))
            visual_fixes = slide.get('_visual_fixes_saved', False)
            logger.debug(f"  Slide {i+1}: {components_count} components, visual_fixes={visual_fixes}")
        
        # Build data field for JSONB 'data' column
        # 1) Start from provided deck_data['data'] if present (caller may have merged slide_themes, etc.)
        # 2) Overlay root-level theme/style_spec so callers can pass either shape
        # 3) If existing record has data, shallow-merge to preserve keys we didn't send
        provided_data = deck_data.get("data") if isinstance(deck_data.get("data"), dict) else {}
        data_field = dict(provided_data)
        if "theme" in deck_data:
            data_field["theme"] = deck_data["theme"]
            logger.info(f"Found theme data to save: {len(str(deck_data['theme']))} chars")
        if "style_spec" in deck_data:
            data_field["style_spec"] = deck_data["style_spec"]
            logger.info(f"Found style_spec data to save: {len(str(deck_data['style_spec']))} chars")

        # Prepare the deck data for upload (partial fields only)
        deck_record = {"uuid": deck_uuid}
        if deck_data.get("name") is not None:
            deck_record["name"] = deck_data.get("name")
        if deck_data.get("slides") is not None:
            deck_record["slides"] = deck_data.get("slides")
        if deck_data.get("size") is not None:
            deck_record["size"] = deck_data.get("size")
        if deck_data.get("status") is not None:
            deck_record["status"] = deck_data.get("status")
        if deck_data.get("outline") is not None:
            deck_record["outline"] = deck_data.get("outline")
        # IMPORTANT: Only include notes when present to avoid wiping existing notes with NULL
        if data_field:
            deck_record["data"] = data_field
        if deck_data.get("version") is not None:
            deck_record["version"] = deck_data.get("version")
        if deck_data.get("last_modified") is not None:
            deck_record["last_modified"] = deck_data.get("last_modified")
        # Conditionally include notes to prevent nulling out existing notes during upserts
        if deck_data.get("notes") is not None:
            deck_record["notes"] = deck_data.get("notes")
        
        # Add user_id if provided
        if user_id:
            deck_record["user_id"] = user_id
            logger.info(f"Associating deck {deck_uuid} with user {user_id}")
        
        # Check if deck already exists before upserting
        existing = perform_supabase_operation_with_retry(
            lambda: supabase.table("decks").select("uuid,name,created_at").eq("uuid", deck_uuid).execute(),
            description=f"check existing deck {deck_uuid}",
            max_attempts=3,
            timeout_seconds=8.0
        )
        if existing.data:
            logger.warning(f"⚠️ DUPLICATE DECK CREATION DETECTED! Deck {deck_uuid} already exists (created at {existing.data[0].get('created_at')})")
            logger.warning(f"   Existing: '{existing.data[0].get('name')}' | New: '{deck_data.get('name')}'")
            # Shallow-merge existing data into data_field to preserve keys when we update only some
            try:
                existing_full = perform_supabase_operation_with_retry(
                    lambda: supabase.table("decks").select("data").eq("uuid", deck_uuid).single().execute(),
                    description=f"get existing data for deck {deck_uuid}",
                    max_attempts=3,
                    timeout_seconds=8.0
                )
                if existing_full.data and isinstance(existing_full.data.get("data"), dict):
                    existing_data = existing_full.data.get("data") or {}
                    if data_field:
                        merged = dict(existing_data)
                        merged.update(data_field)
                        data_field = merged
            except Exception as _merge_err:
                logger.debug(f"Skipping data merge due to error: {_merge_err}")

        # Log final intent for data column
        if data_field:
            try:
                logger.info(f"Saving theme/style data to data field: {list(data_field.keys())}")
            except Exception:
                logger.info("Saving theme/style data to data field (keys not listed)")
        else:
            logger.info("No theme/style data found to save in data field")
        
        # Use upsert to handle both insert and update cases
        # This prevents timing issues when the frontend expects immediate availability
        response = perform_supabase_operation_with_retry(
            lambda: supabase.table("decks").upsert(
                deck_record,
                on_conflict="uuid"
            ).execute(),
            description=f"upsert deck {deck_uuid}",
            max_attempts=3,
            timeout_seconds=15.0
        )
        
        if not response.data:
            logger.error(f"❌ Failed to upload deck {deck_uuid}")
            raise Exception("Failed to upload deck to Supabase")
        
        logger.info(f"✅ Successfully uploaded deck {deck_uuid} for user {user_id or 'anonymous'}")
        return response.data[0]
    except Exception as e:
        logger.error(f"Error uploading deck: {e}")
        raise

def upload_deck_force(deck_data: Dict[str, Any], deck_uuid: str) -> Dict[str, Any]:
    """
    Force upload a deck to Supabase, overwriting any existing data.
    
    Args:
        deck_data: Dictionary containing deck data with the following structure:
            {
                "name": str,
                "slides": List[Dict],
                "size": Dict[str, int],
                "status": Dict[str, Any],  # Optional status object
                "outline": Dict[str, Any],  # Optional outline object
                "theme": Dict[str, Any],  # Optional theme/style data
                "style_spec": Dict[str, Any]  # Optional style specification
            }
        deck_uuid: The UUID to use for the deck
    
    Returns:
        Dict containing the uploaded deck data including the UUID
    """
    supabase = get_supabase_client()
    
    # Extract theme and style data for the data column
    data_field = {}
    if "theme" in deck_data:
        data_field["theme"] = deck_data["theme"]
    if "style_spec" in deck_data:
        data_field["style_spec"] = deck_data["style_spec"]
    
    # Prepare the deck data for upload
    deck_record = {
        "uuid": deck_uuid,
        "name": deck_data.get("name"),
        "slides": deck_data.get("slides"),
        "size": deck_data.get("size"),
        "status": deck_data.get("status"),  # Add status field
        "outline": deck_data.get("outline"),  # Add outline field
        # IMPORTANT: Only include notes when present to avoid wiping existing notes with NULL
        # "notes" will be conditionally added below if not None
        "data": data_field if data_field else None,  # Store theme/style in data column
        "version": str(uuid.uuid4()),  # Generate a new version UUID
        "last_modified": None  # Will be set by the database default
    }
    # Conditionally include notes to prevent nulling out existing notes during upserts
    if deck_data.get("notes") is not None:
        deck_record["notes"] = deck_data.get("notes")
    
    # Use upsert with ignoreDuplicates=False to force overwrite
    response = supabase.table("decks").upsert(
        deck_record,
        on_conflict="uuid",  # Use uuid as the conflict resolution column
        ignore_duplicates=False  # Force overwrite existing data
    ).execute()
    
    if not response.data:
        raise Exception("Failed to force upload deck to Supabase")
    
    return response.data[0]

def get_deck(deck_uuid: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve a deck from Supabase by UUID.
    
    Args:
        deck_uuid: The UUID of the deck to retrieve
    
    Returns:
        Dict containing the deck data if found, None otherwise
    """
    logger = logging.getLogger(__name__)
    supabase = get_supabase_client()
    
    from utils.supabase import perform_supabase_operation_with_retry as _retry  # local alias to avoid circular imports
    response = _retry(
        lambda: supabase.table("decks").select("*").eq("uuid", deck_uuid).execute(),
        description=f"get deck {deck_uuid}",
        max_attempts=3,
        timeout_seconds=8.0
    )
    
    if response.data and len(response.data) > 0:
        deck = response.data[0]
        
        # Log deck retrieval details
        slide_count = len(deck.get('slides', []))
        logger.info(f"📥 Retrieved deck {deck_uuid}: {slide_count} slides")
        
        # Check visual fixes status
        visual_fixed_count = 0
        for i, slide in enumerate(deck.get('slides', [])[:5]):  # First 5 slides
            has_fixes = slide.get('_visual_fixes_saved', False)
            component_count = len(slide.get('components', []))
            if has_fixes:
                visual_fixed_count += 1
            logger.debug(f"  Slide {i+1}: {component_count} components, visual_fixes={has_fixes}")
        
        if visual_fixed_count > 0:
            logger.info(f"  ✅ {visual_fixed_count} slides have visual fixes applied")
        
        # Extract theme and style_spec from data field to root level for compatibility
        if 'data' in deck and isinstance(deck['data'], dict):
            if 'theme' in deck['data']:
                deck['theme'] = deck['data']['theme']
            if 'style_spec' in deck['data']:
                deck['style_spec'] = deck['data']['style_spec']
        
        return deck
    
    logger.warning(f"❌ Deck {deck_uuid} not found in database")
    return None 

def get_deck_theme(deck_uuid: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve theme data from a deck by UUID.
    
    Args:
        deck_uuid: The UUID of the deck
    
    Returns:
        Dict containing the theme data if found, None otherwise
    """
    supabase = get_supabase_client()
    
    try:
        response = supabase.table("decks").select("data").eq("uuid", deck_uuid).execute()
        
        if response.data and len(response.data) > 0:
            deck_data = response.data[0]
            data_field = deck_data.get('data', {})
            
            # Extract theme from data field
            if isinstance(data_field, dict):
                return data_field.get('theme')
            
        return None
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Error retrieving deck theme: {e}")
        return None

def update_deck_notes(deck_uuid: str, notes: Dict[str, Any]) -> bool:
    """
    Update the notes field of a deck (for narrative flow).
    
    Args:
        deck_uuid: The UUID of the deck to update
        notes: The narrative flow data to save
    
    Returns:
        True if successful, False otherwise
    """
    logger = logging.getLogger(__name__)
    supabase = get_supabase_client()
    
    try:
        logger.info(f"📝 Updating notes for deck {deck_uuid}")
        logger.info(f"📝 Notes data type: {type(notes)}, size: {len(str(notes))}")
        
        # Update only the notes field
        response = perform_supabase_operation_with_retry(
            lambda: supabase.table("decks").update({
                "notes": notes
            }).eq("uuid", deck_uuid).execute(),
            description=f"update notes for deck {deck_uuid}",
            max_attempts=3,
            timeout_seconds=8.0
        )
        
        if response.data:
            logger.info(f"✅ Successfully updated notes for deck {deck_uuid}")
            logger.info(f"✅ Response data: {response.data[0].get('uuid') if response.data else 'No data'}")
            
            # Verify the update
            verify_response = perform_supabase_operation_with_retry(
                lambda: supabase.table("decks").select("uuid,notes").eq("uuid", deck_uuid).execute(),
                description=f"verify notes update for deck {deck_uuid}",
                max_attempts=3,
                timeout_seconds=8.0
            )
            if verify_response.data:
                saved_notes = verify_response.data[0].get('notes')
                logger.info(f"✅ Verification: Notes field is {'present' if saved_notes else 'NULL'}")
            
            return True
        else:
            logger.error(f"❌ Failed to update notes for deck {deck_uuid}")
            logger.error(f"❌ Response: {response}")
            return False
            
    except Exception as e:
        logger.error(f"Error updating deck notes: {e}")
        return False 