import { SlideData } from "@/types/SlideTypes";
import { CompleteDeckData } from "@/types/DeckTypes";
import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from 'uuid';
import { authService } from "@/services/authService";
import { API_CONFIG } from "@/config/environment";

/**
 * Service to handle synchronization of deck data with the Supabase decks table
 */
export class DeckSyncService {
  private baseUrl: string;
  
  constructor(apiBaseUrl: string = API_CONFIG.BASE_URL) {
    this.baseUrl = apiBaseUrl;

  }

  /**
   * Get the correct API URL
   */
  private getApiUrl(endpoint: string): string {
    if (import.meta.env.DEV) {
      // In development, use Vite proxy which handles the routing
      // TEMPORARY: Force direct URL to debug proxy issue
      if (endpoint.startsWith('/auth')) {
  
        return `http://localhost:9090${endpoint}`;
      }
      return `/api${endpoint}`;
    }
    
    // In production, backend auth routes don't have /api prefix
    if (endpoint.startsWith('/auth')) {
      // Remove /api from the base URL for auth endpoints
      const baseWithoutApi = this.baseUrl.replace('/api', '');

      return baseWithoutApi + endpoint;
    }
    
    // Other endpoints use full base URL
    return `${this.baseUrl}${endpoint}`;
  }

  /**
   * Retrieves all decks from the backend API with pagination support
   * @param limit Number of decks to fetch (default: 20)
   * @param offset Number of decks to skip (default: 0)
   * @returns Object containing array of decks and pagination info
   */
  async getAllDecks(limit: number = 20, offset: number = 0, filter: string = 'owned'): Promise<{
    decks: CompleteDeckData[];
    count: number;
    has_more: boolean;
  }> {
    try {
      // Add include_first_slide parameter to request thumbnail data
      const url = this.getApiUrl(`/auth/decks?filter=${filter}&limit=${limit}&offset=${offset}&include_first_slide=true`);

      
      // Try to get token asynchronously first for better reliability
      const token = await authService.getAuthTokenAsync();
      if (!token) {
        console.warn('[deckSyncService] No auth token available');
        return { decks: [], count: 0, has_more: false };
      }
      

      
      const doFetch = (bearer: string) => fetch(url, {
        headers: {
          'Authorization': `Bearer ${bearer}`,
          'Content-Type': 'application/json'
        }
      });
      let response = await doFetch(token);
      if (response.status === 401) {
        const newToken = await authService.refreshToken();
        if (newToken) {
          response = await doFetch(newToken);
        }
      }
      
      if (!response.ok) {
        if (response.status === 401) {
          console.warn('[deckSyncService] Unauthorized after refresh – forcing auth reset');
          await authService.hardResetAuth();
          return { decks: [], count: 0, has_more: false };
        }
        throw new Error(`Failed to fetch decks: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Handle the response structure from backend
      const decks = Array.isArray(data) ? data : (data.decks || []);
      
      const formattedDecks = decks.map(deck => this.formatBackendDeck(deck)).filter(Boolean) as CompleteDeckData[];
      
      return {
        decks: formattedDecks,
        count: data.count || formattedDecks.length,
        has_more: data.has_more || false
      };
    } catch (err) {
      console.error('[deckSyncService] Failed to fetch decks:', err);
      return { decks: [], count: 0, has_more: false };
    }
  }

  /**
   * Retrieves a specific deck by its UUID
   * @param deckId The UUID of the deck to retrieve
   * @param full Whether to get full deck data including slides (default: true for backward compatibility)
   * @returns The CompleteDeckData object or null if not found
   */
  async getDeck(deckId: string, full: boolean = true): Promise<CompleteDeckData | null> {
    try {
      // Validate UUID format first
      if (!this.isValidUUID(deckId)) {
        console.error(`[deckSyncService] Invalid UUID format: ${deckId}`);
        return null;
      }

      const endpoint = full ? `/auth/decks/${deckId}/full` : `/auth/decks/${deckId}`;
      const url = this.getApiUrl(endpoint);

      
      const token = await authService.getAuthTokenAsync();
      if (!token) {
        console.error('[deckSyncService] No auth token available');
        return null;
      }
      
      const doFetch = (bearer: string) => fetch(url, {
        headers: {
          'Authorization': `Bearer ${bearer}`,
          'Content-Type': 'application/json'
        }
      });
      let response = await doFetch(token);
      if (response.status === 401) {
        const newToken = await authService.refreshToken();
        if (newToken) {
          response = await doFetch(newToken);
        }
      }
      
      if (!response.ok) {
        if (response.status === 404) {
  
          return null;
        }
        if (response.status === 401) {
          console.warn('[deckSyncService] Unauthorized after refresh – forcing auth reset');
          await authService.hardResetAuth();
          return null;
        }
        throw new Error(`Failed to fetch deck: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Handle response structure - backend returns { deck: ..., access_type: ... }
      const deckData = data.deck || data;
      return this.formatBackendDeck(deckData);
    } catch (err) {
      console.error(`[deckSyncService] Failed to fetch deck ${deckId}:`, err);
      return null;
    }
  }

  /**
   * Gets lightweight deck information without heavy fields
   * Use this for deck lists or previews
   * @param deckId The UUID of the deck to retrieve
   * @returns Lightweight deck data
   */
  async getDeckInfo(deckId: string): Promise<CompleteDeckData | null> {
    return this.getDeck(deckId, false);
  }

  /**
   * Gets full deck data including all slides and components
   * Use this when you need to edit or display the deck
   * @param deckId The UUID of the deck to retrieve
   * @returns Complete deck data
   */
  async getFullDeck(deckId: string): Promise<CompleteDeckData | null> {
    return this.getDeck(deckId, true);
  }

  // Cache to track recent save operations and reduce duplicates
  private saveOperationsCache: Map<string, {timestamp: number, version: string}> = new Map();
  private readonly SAVE_DEBOUNCE_MS = 1000; // 1 second debounce for same-deck saves

  /**
   * Creates a new deck via the API
   * @param deck The CompleteDeckData to create
   * @returns The created deck data or null if the operation failed
   */
  async createDeck(deck: CompleteDeckData): Promise<CompleteDeckData | null> {
    try {
      // Basic validation
      if (!deck) {
        console.error('[deckSyncService] Cannot create null deck');
        return null;
      }
      
      // Format the deck for API
      const formattedDeck = await this.formatDeckForSupabase(deck);
      
      // Ensure we have a valid UUID
      if (!formattedDeck.uuid || !this.isValidUUID(formattedDeck.uuid)) {
        formattedDeck.uuid = uuidv4();
  
      }
      
      const endpoint = this.getApiUrl('/auth/decks');
  
  
      
      const token = await authService.getAuthTokenAsync();

      
      const doFetch = (bearer?: string) => fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(bearer ? { 'Authorization': `Bearer ${bearer}` } : {})
        },
        body: JSON.stringify(formattedDeck)
      });
      let response = await doFetch(token || undefined);
      if (response.status === 401) {
        const newToken = await authService.refreshToken();
        if (newToken) {
          response = await doFetch(newToken);
        }
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorDetail;
        try {
          errorDetail = JSON.parse(errorText);
        } catch {
          errorDetail = errorText;
        }
        console.error(`[deckSyncService] Error creating deck via API: ${response.status}`);
        console.error('[deckSyncService] Error details:', errorDetail);
        if (response.status === 401) {
          console.warn('[deckSyncService] Unauthorized after refresh – forcing auth reset');
          await authService.hardResetAuth();
        }
        console.error('[deckSyncService] Request endpoint:', endpoint);
        console.error('[deckSyncService] Request body that failed:', JSON.stringify(formattedDeck, null, 2));
        return null;
      }
      
      // Parse the response to get the created deck
      const responseData = await response.json();

      
      // The response might just be {uuid: "..."} or might include the full deck
      // If it's just the UUID, we need to fetch the full deck
      if (responseData && responseData.uuid && !responseData.slides) {

        // Wait a moment for the backend to fully process the creation
        await new Promise(resolve => setTimeout(resolve, 100));
        const fullDeck = await this.getDeck(responseData.uuid);
        return fullDeck;
      }
      
      // Return the created deck data
      return responseData;
    } catch (err) {
      console.error('[deckSyncService] Failed to create deck:', err);
      return null;
    }
  }

  /**
   * Saves a complete deck to the Supabase decks table with deduplication and validation
   * @param deck The CompleteDeckData to save
   * @returns The saved deck data or null if the operation failed
   */
  async saveDeck(deck: CompleteDeckData): Promise<CompleteDeckData | null> {
    try {
      // Basic validation - reject null decks
      if (!deck) {
        console.error('[deckSyncService] Cannot save null deck');
        return null;
      }
      
      // Validate slides are present and in correct format
      if (!Array.isArray(deck.slides)) {
        console.error('[deckSyncService] Deck slides must be an array');
        return null;
      }
      
      // Ensure all slides have valid IDs
      const invalidSlides = deck.slides.filter(slide => !slide.id);
      if (invalidSlides.length > 0) {
        console.error(`[deckSyncService] Found ${invalidSlides.length} slides without IDs`);
        return null;
      }
      
      // Format the deck for Supabase - to ensure it matches DB schema
      const formattedDeck = await this.formatDeckForSupabase(deck);
      
      // Check if this is a new deck or an update
      const isNew = !formattedDeck.uuid || !this.isValidUUID(formattedDeck.uuid);
      
      // Generate a UUID if this is a new deck or if uuid is not in valid format
      if (isNew) {
        formattedDeck.uuid = uuidv4();
        formattedDeck.created_at = new Date().toISOString();
      }
      
      // Generate a precise timestamp for this save operation
      const now = new Date();
      const nowIso = now.toISOString();
      // Use the snake_case column that should definitely exist
      (formattedDeck as any).last_modified = nowIso;
      
      // Don't send version field - let the backend handle it
      // Remove version field if it exists
      delete formattedDeck.version;
      
      // Deduplication: Check recent saves for this deck ID
      const deckId = formattedDeck.uuid;
      const cacheEntry = this.saveOperationsCache.get(deckId);
      const nowMs = now.getTime();
      
      if (cacheEntry) {
        // Check timing only, ignore version when load balancing operations
        const timeSinceLastSave = nowMs - cacheEntry.timestamp;
        if (timeSinceLastSave < this.SAVE_DEBOUNCE_MS) {
          // Silent debounce for frequent updates
          
          // Return the deck as-is without fetching to prevent loops
          return deck;
        }
      }
      
      // Update cache entry before proceeding with the save
      this.saveOperationsCache.set(deckId, {
        timestamp: nowMs,
        version: deck.version || '' // Use original deck version for cache tracking
      });
      
      // Prepare endpoint URL
      const endpoint = this.getApiUrl(`/auth/decks/${formattedDeck.uuid}`);
  
      
      const token = await authService.getAuthTokenAsync();
      
      try {
        const doFetch = (bearer?: string) => fetch(endpoint, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(bearer ? { 'Authorization': `Bearer ${bearer}` } : {})
          },
          body: JSON.stringify(formattedDeck)
        });
        let response = await doFetch(token || undefined);
        if (response.status === 401) {
          const newToken = await authService.refreshToken();
          if (newToken) {
            response = await doFetch(newToken);
          }
        }
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[deckSyncService] Error updating deck: ${response.status}`);
          console.error('[deckSyncService] Error details:', errorText);
          if (response.status === 401) {
            console.warn('[deckSyncService] Unauthorized after refresh – forcing auth reset');
            await authService.hardResetAuth();
          }
          return null;
        }
        
        const responseData = await response.json();
  
        
        return {
          ...deck,
          ...responseData,
          lastModified: responseData.last_modified || nowIso,
          version: responseData.version || formattedDeck.version
        };
      } catch (err) {
        console.error('[deckSyncService] Failed to update deck:', err);
        return null;
      }
    } catch (err) {
      console.error('[deckSyncService] Failed to save deck to Supabase:', err);
      return null;
    }
  }

  /**
   * Validates if a string is a proper UUID
   * @param uuid String to validate
   * @returns Boolean indicating if the string is a valid UUID
   */
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Deletes a deck from the backend using the API endpoint
   * @param deckId The UUID of the deck to delete
   * @returns True if the operation succeeded, false otherwise
   */
  async deleteDeck(deckId: string): Promise<boolean> {
    
    try {
      // Validate the UUID format
      if (!this.isValidUUID(deckId)) {
        console.error(`[deckSyncService] Invalid UUID format for deck: ${deckId}`);
        return false;
      }
      
      // Call the DELETE API endpoint
      const url = this.getApiUrl(`/auth/decks/${deckId}`);
      
      const token = await authService.getAuthTokenAsync();
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[deckSyncService] Error deleting deck ${deckId}:`, response.status, errorText);
        
        if (response.status === 401) {
          console.error('[deckSyncService] Unauthorized - user needs to log in');
        } else if (response.status === 403) {
          console.error('[deckSyncService] Forbidden - user does not own this deck');
        } else if (response.status === 404) {
          console.error('[deckSyncService] Not found - deck does not exist');
        }
        
        return false;
      }
      
      const result = await response.json();
      return true;
    } catch (err) {
      console.error(`[deckSyncService] Failed to delete deck ${deckId}:`, err);
      return false;
    }
  }

  /**
   * Creates a new version of a deck
   * @param deckId The UUID of the deck to create a new version of
   * @returns The new version's UUID if successful, null otherwise
   */
  async createNewVersion(deckId: string): Promise<string | null> {
    try {
      // Get the current deck
      const currentDeck = await this.getDeck(deckId);
      if (!currentDeck) {
        console.error(`Deck ${deckId} not found when creating new version`);
        return null;
      }
      
      // Generate a new version UUID
      const newVersionId = uuidv4();
      
      // Update the deck with the new version ID
      const updatedDeck = {
        ...currentDeck,
        version: newVersionId,
        lastModified: new Date().toISOString()
      };
      
      // Save the updated deck
      const savedDeck = await this.saveDeck(updatedDeck);
      
      if (!savedDeck) {
        console.error(`Failed to save new version for deck ${deckId}`);
        return null;
      }
      
      return newVersionId;
    } catch (err) {
      console.error(`Failed to create new version for deck ${deckId}:`, err);
      return null;
    }
  }

  /**
   * Formats a deck from backend API response
   * @param deck The deck data from backend
   * @returns CompleteDeckData object
   */
  private formatBackendDeck(deck: any): CompleteDeckData | null {
    if (!deck) return null;
    
    try {
      // Backend already returns properly formatted data
      const slides = deck.slides || [];
      const suppliedName = (deck.name && typeof deck.name === 'string') ? String(deck.name).trim() : '';
      const outlineTitle = (() => {
        try {
          if (deck.outline && typeof deck.outline === 'object') {
            return String(deck.outline.title || '').trim();
          }
        } catch {}
        return '';
      })();
      const isPlaceholderName = !suppliedName || /untitled/i.test(suppliedName) || suppliedName === 'New Presentation' || suppliedName === 'my-presentation';
      const finalName = isPlaceholderName && outlineTitle ? outlineTitle : (suppliedName || 'New Presentation');

      const formattedDeck: CompleteDeckData = {
        uuid: deck.uuid || deck.id,
        name: finalName,
        slides: slides,
        version: deck.version || '',
        lastModified: deck.updated_at || deck.last_modified || new Date().toISOString(),
        created_at: deck.created_at || new Date().toISOString(),
        updated_at: deck.updated_at || new Date().toISOString(),
        outline: deck.outline,
        user_id: deck.user_id,
        visibility: deck.visibility || 'private',
        description: deck.description,
        tags: deck.tags,
        size: deck.size,
        data: deck.data,
        status: deck.status,
        notes: deck.notes
      };
      
      // Preserve first_slide and slide_count from API response for thumbnail optimization
      if (deck.first_slide) {
        (formattedDeck as any).first_slide = deck.first_slide;
      }
      if (deck.slide_count !== undefined) {
        (formattedDeck as any).slide_count = deck.slide_count;
      }
      
      // Preserve sharing info
      if (deck.is_shared !== undefined) {
        (formattedDeck as any).is_shared = deck.is_shared;
      }
      if (deck.share_type) {
        (formattedDeck as any).share_type = deck.share_type;
      }
      if (deck.shared_by) {
        (formattedDeck as any).shared_by = deck.shared_by;
      }
      
      return formattedDeck;
    } catch (error) {
      console.error('[deckSyncService] Error formatting backend deck:', error);
      return null;
    }
  }

  /**
   * Formats a database record from Supabase into a CompleteDeckData object
   * @param record The database record
   * @returns CompleteDeckData object
   */
  private formatSupabaseToDeck(record: any): CompleteDeckData {
    // Parse slides if they're stored as a string
    let slidesData = record.slides || [];
    if (typeof slidesData === 'string') {
      try {
        slidesData = JSON.parse(slidesData);
      } catch (e) {
        console.error('Failed to parse slides JSON:', e);
        slidesData = [];
      }
    }
    
    // Extract components by converting to JSON and back to get clean objects
    const slides: SlideData[] = slidesData.map((slide: any) => ({
      ...slide,
      components: (slide.components || []).map((comp: any) => ({
        ...comp,
        // Clean up component data
        position: comp.position || { x: 0, y: 0, z: 0 },
        size: comp.size || { width: 200, height: 100 },
        props: comp.props || {},
        styles: comp.styles || {},
        type: comp.type || 'Text',
        id: comp.id || uuidv4(),
        locked: comp.locked || false,
        visible: comp.visible !== false, // Default to true unless explicitly false
      }))
    }));

    // Convert string timestamps to Date objects, then back to ISO strings for consistency
    let lastModified: string;
    try {
      lastModified = record.last_modified 
        ? new Date(record.last_modified).toISOString()
        : new Date().toISOString();
    } catch (e) {
      console.warn('Invalid last_modified timestamp, using current time');
      lastModified = new Date().toISOString();
    }

    // Version handling with validation
    let version: string;
    try {
      version = record.version && typeof record.version === 'string' && record.version.trim()
        ? record.version
        : uuidv4();
    } catch (e) {
      console.warn('Invalid version, generating new one');
      version = uuidv4();
    }
    
    // Validate and ensure we have a proper UUID
    const uuid = record.uuid || record.id;
    if (!uuid) {
      console.error('[formatSupabaseToDeck] Record missing both uuid and id:', record);
      throw new Error('Deck record must have uuid or id');
    }
    

    
    // Construct and return the complete deck data
    const suppliedName = (record.name && typeof record.name === 'string') ? String(record.name).trim() : '';
    const outlineTitle = (() => {
      try {
        const outlineObj = typeof record.outline === 'string' ? JSON.parse(record.outline) : record.outline;
        if (outlineObj && typeof outlineObj === 'object') {
          return String(outlineObj.title || '').trim();
        }
      } catch {}
      return '';
    })();
    const isPlaceholderName = !suppliedName || /untitled/i.test(suppliedName) || suppliedName === 'New Presentation' || suppliedName === 'my-presentation';
    const finalName = isPlaceholderName && outlineTitle ? outlineTitle : (suppliedName || 'New Presentation');

    const deckData: CompleteDeckData = {
      uuid: uuid,
      name: finalName,
      slides: slides,
      version: version,
      lastModified: lastModified,
      created_at: record.created_at || new Date().toISOString(),
      updated_at: record.updated_at || new Date().toISOString(),
      outline: (() => {
        if (typeof record.outline === 'string') {
          try {
            const parsedOutline = JSON.parse(record.outline);
            // Log if narrative flow exists
            if (parsedOutline && parsedOutline.narrativeFlow) {
            }
            return parsedOutline;
          } catch (e) {
            console.error('Failed to parse outline JSON:', e);
            return undefined;
          }
        }
        // Log if narrative flow exists in non-string outline
        if (record.outline && record.outline.narrativeFlow) {
        }
        return record.outline || undefined;
      })(),
      user_id: record.user_id || undefined,
      visibility: record.visibility || 'private',
      description: record.description || undefined,
      tags: (() => {
        if (typeof record.tags === 'string') {
          try { return JSON.parse(record.tags); } catch (e) { return undefined; }
        }
        return record.tags || undefined;
      })(),
      size: (() => {
        if (typeof record.size === 'string') {
          try { return JSON.parse(record.size); } catch (e) { return undefined; }
        }
        return record.size || undefined;
      })(),
      data: (() => {
        if (typeof record.data === 'string') {
          try { return JSON.parse(record.data); } catch (e) { return undefined; }
        }
        return record.data || undefined;
      })(),
      status: (() => {
        if (typeof record.status === 'string') {
          try { return JSON.parse(record.status); } catch (e) { return undefined; }
        }
        return record.status || undefined;
      })(),
      notes: (() => {
        if (typeof record.notes === 'string') {
          try { 
            const parsedNotes = JSON.parse(record.notes);
            return parsedNotes;
          } catch (e) { 
            return undefined; 
          }
        }
        if (record.notes) {
        }
        return record.notes || undefined;
      })()
    };

    // Attach first_slide if provided by the API (for thumbnail rendering)
    if (record.first_slide) {
      (deckData as any).first_slide = record.first_slide;
    }

    // Attach slide_count if provided
    if (record.slide_count !== undefined) {
      (deckData as any).slide_count = record.slide_count;
    }

    return deckData;
  }

  /**
   * Formats a CompleteDeckData object for storage in Supabase
   * @param deck The deck data
   * @returns Object formatted for Supabase
   */
  private async formatDeckForSupabase(deck: CompleteDeckData): Promise<any> {
    // Validate slides before formatting
    if (!Array.isArray(deck.slides)) {
      throw new Error('Slides must be an array');
    }
    
    // Ensure all slides have valid IDs
    for (const slide of deck.slides) {
      if (!slide.id) {
        throw new Error('All slides must have valid IDs');
      }
    }
    
    // Get the current user ID from Supabase
    let userId = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.id) {
        userId = user.id;
      }
    } catch (error) {
      console.warn('[deckSyncService] Could not get current user:', error);
    }
    
    if (!userId) {
      console.warn('[deckSyncService] No authenticated user found - deck will be created without user_id');
    }
    
    // Map TypeScript camelCase to actual database column names using snake_case
    const formattedDeck = {
      uuid: deck.uuid || null,
      name: deck.name || 'Untitled Deck',
      // Keep slides as array - the backend API should handle serialization
      slides: [...deck.slides],
      // Don't include version - let backend handle it
      last_modified: deck.lastModified || new Date().toISOString(),
      // Only include optional fields if they have values
      ...(deck.outline && { 
        outline: {
          ...deck.outline,
          narrativeFlow: deck.outline.narrativeFlow || null
        }
      }),
      ...(deck.data && { data: deck.data }),
      ...(deck.notes && { notes: deck.notes })
      // Don't include user_id - backend sets it from auth token
    };
    
    return formattedDeck;

    /* OPTION FOR FUTURE REFERENCE:
       If you need to store the additional fields, consider:
       1. Adding a 'metadata' jsonb column to your database
       2. Then use a structure like:
       
       return {
         uuid: deck.uuid || null,
         name: deck.name,
         slides: deck.slides,
         version: deck.version,
         lastModified: deck.lastModified,
         metadata: {
           components: deck.components,
           styles: deck.styles,
           dependencies: deck.dependencies,
           backgroundStyles: deck.backgroundStyles,
           elementStyles: deck.elementStyles,
           themeOverrides: deck.themeOverrides
         }
       };
    */
  }
}

// Create a singleton instance for the application to use
export const deckSyncService = new DeckSyncService(); 
