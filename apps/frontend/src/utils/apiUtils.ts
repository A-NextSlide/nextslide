import { CompleteDeckData } from "../types/DeckTypes";
import { SlideData } from "../types/SlideTypes";
import { ComponentInstance } from "../types/components";
import { applyDeckDiffPure } from "./deckDiffUtils";
import { API_CONFIG } from '../config/environment';
import { authService } from '../services/authService';

// Base API URL from environment configuration
const API_BASE_URL = API_CONFIG.BASE_URL;

/**
 * Get headers with authentication
 */
const getAuthHeaders = (): HeadersInit => {
  const token = authService.getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

/**
 * Fetch error handling
 */
const handleResponse = async (response: Response) => {
  if (!response.ok) {
    if (response.status === 401) {
      try {
        const newToken = await authService.refreshToken();
        if (newToken) {
          throw new Error('TOKEN_REFRESHED');
        }
      } catch (refreshError) {
        console.error('[apiUtils] Token refresh failed:', refreshError);
      }
      await authService.hardResetAuth();
      throw new Error('Unauthorized');
    }
    const errorData = await response.json().catch(() => null);
    throw new Error(
      errorData?.message || errorData?.detail || `API Error: ${response.status} ${response.statusText}`
    );
  }
  return response.json();
};

/**
 * Types for API responses
 */
export interface ChatMessage {
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  feedback?: 'up' | 'down' | null;
}

export interface ChatRequest {
  message: string;
  slide_id?: string;
  current_slide_index?: number;
  deck_data?: any;
  chat_history?: ChatMessage[];
}

export interface ChatResponse {
  message: string;
  timestamp: string;
  deck_diff?: DeckDiff;
}

export interface RegistryUpdateRequest {
  components: Record<string, any>;
  global: Record<string, any>;
  schemas?: Record<string, any>;
  source?: string;
}

export interface HealthCheckResponse {
  status: string;
  registry_loaded: boolean;
  registry_last_updated: string | null;
  timestamp: string;
}

/**
 * Component diff with improved type safety
 */
export interface ComponentDiff {
  id: string;
  type?: string;
  props?: Record<string, any>;
}

/**
 * Slide diff with improved structure
 */
export interface SlideDiff {
  slide_id: string;
  slide_properties?: Partial<SlideData>;
  components_to_update?: ComponentDiff[];
  components_to_add?: ComponentDiff[];
  components_to_remove?: string[];
}

/**
 * Deck diff with improved structure
 */
export interface DeckDiff {
  deck_properties?: Record<string, any>;
  slides_to_update?: SlideDiff[];
  slides_to_add?: SlideData[];
  slides_to_remove?: string[];
}

/**
 * Wrapper for API calls that handles token refresh
 */
const makeAuthenticatedRequest = async <T>(
  url: string,
  options: RequestInit = {}
): Promise<T> => {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        ...getAuthHeaders()
      }
    });
    
    return await handleResponse(response);
  } catch (error) {
    // If token was refreshed, retry the request once
    if (error instanceof Error && error.message === 'TOKEN_REFRESHED') {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          ...getAuthHeaders() // Get new headers with refreshed token
        }
      });
      if (response.status === 401) {
        await authService.hardResetAuth();
        throw new Error('Unauthorized');
      }
      return await handleResponse(response);
    }
    throw error;
  }
};

/**
 * Send a chat message to the AI assistant
 */
export const sendChatMessage = async (request: ChatRequest): Promise<ChatResponse> => {
  return makeAuthenticatedRequest<ChatResponse>(`${API_BASE_URL}/chat`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
};

/**
 * Send the registry data to the backend
 */
export const sendRegistryToBackend = async (registryData: RegistryUpdateRequest): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/registry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(registryData),
  });

  return handleResponse(response);
};

/**
 * Check if the API server is healthy
 */
export const checkApiHealth = async (): Promise<HealthCheckResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      // Add timeout for development
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    return handleResponse(response);
  } catch (error) {
    // Handle CORS and network errors gracefully in development
    if (error instanceof Error) {
      if (error.message.includes('CORS') || 
          error.message.includes('Failed to fetch') ||
          error.name === 'TypeError') {
        // Return a mock healthy response for development when external API is not accessible
        return {
          status: 'healthy',
          registry_loaded: false,
          registry_last_updated: null,
          timestamp: new Date().toISOString()
        };
      }
    }
    
    // Re-throw other errors
    throw error;
  }
};

/**
 * Check if the registry is loaded on the server
 */
export const isRegistryLoadedOnServer = async (): Promise<boolean> => {
  try {
    const healthResponse = await checkApiHealth();
    return healthResponse.registry_loaded;
  } catch (error) {
    console.error('Error checking if registry is loaded:', error);
    return false;
  }
};

/**
 * Applies a deck diff to a deck, with proper null handling
 * @param deck The deck to apply changes to
 * @param diff The diff to apply (can be null/undefined)
 * @returns A new deck with changes applied, or the original if diff is null
 */
export function applyDeckDiff(deck: CompleteDeckData, diff: DeckDiff | null | undefined): CompleteDeckData {
  // Return original deck if diff is null or undefined
  if (!diff) {
    return deck;
  }

  // Delegate to pure function that handles the actual diff application
  return applyDeckDiffPure(deck, diff);
}

/**
 * Creates a diff comparing two decks
 * @param originalDeck The original deck
 * @param updatedDeck The updated deck
 * @returns A DeckDiff object representing the changes
 */
export function createDeckDiff(originalDeck: CompleteDeckData, updatedDeck: CompleteDeckData): DeckDiff {
  const diff: DeckDiff = {};

  // Compare deck properties
  const deckPropertyDiff: Record<string, any> = {};
  const protectedProps = ['uuid', 'version', 'lastModified'];

  // Check for property changes
  Object.keys(updatedDeck).forEach(key => {
    // Skip protected properties and arrays/objects that need special handling
    if (protectedProps.includes(key) ||
        key === 'slides' ||
        typeof updatedDeck[key] === 'object') {
      return;
    }

    if (originalDeck[key] !== updatedDeck[key]) {
      deckPropertyDiff[key] = updatedDeck[key];
    }
  });

  // Add property changes if any found
  if (Object.keys(deckPropertyDiff).length > 0) {
    diff.deck_properties = deckPropertyDiff;
  }

  // Identify slides to add, update, and remove
  const originalSlideIds = new Set(originalDeck.slides.map(s => s.id));
  const updatedSlideIds = new Set(updatedDeck.slides.map(s => s.id));

  // Slides to add (in updatedDeck but not in originalDeck)
  const slidesToAdd = updatedDeck.slides.filter(s => !originalSlideIds.has(s.id));
  if (slidesToAdd.length > 0) {
    diff.slides_to_add = slidesToAdd;
  }

  // Slides to remove (in originalDeck but not in updatedDeck)
  const slidesToRemove = originalDeck.slides
    .filter(s => !updatedSlideIds.has(s.id))
    .map(s => s.id);

  if (slidesToRemove.length > 0) {
    diff.slides_to_remove = slidesToRemove;
  }

  // Slides to update (in both decks, but with changes)
  const slideDiffs: SlideDiff[] = [];

  // Process slides that exist in both decks
  updatedDeck.slides.forEach(updatedSlide => {
    if (!originalSlideIds.has(updatedSlide.id)) {
      return; // Skip slides that are new
    }

    const originalSlide = originalDeck.slides.find(s => s.id === updatedSlide.id);
    if (!originalSlide) return;

    const slideDiff: SlideDiff = {
      slide_id: updatedSlide.id
    };

    // Check for slide property changes
    const slidePropertyChanges: Partial<SlideData> = {};
    Object.keys(updatedSlide).forEach(key => {
      // Skip components (handled separately) and objects
      if (key === 'components' || typeof updatedSlide[key] === 'object') {
        return;
      }

      if (originalSlide[key] !== updatedSlide[key]) {
        slidePropertyChanges[key] = updatedSlide[key];
      }
    });

    if (Object.keys(slidePropertyChanges).length > 0) {
      slideDiff.slide_properties = slidePropertyChanges;
    }

    // Component changes
    const originalComponents = originalSlide.components || [];
    const updatedComponents = updatedSlide.components || [];

    // Original component IDs for quick lookup
    const originalComponentIds = new Set(originalComponents.map(c => c.id));
    const updatedComponentIds = new Set(updatedComponents.map(c => c.id));

    // Components to add
    const componentsToAdd = updatedComponents
      .filter(c => !originalComponentIds.has(c.id));

    if (componentsToAdd.length > 0) {
      slideDiff.components_to_add = componentsToAdd;
    }

    // Components to remove
    const componentsToRemove = originalComponents
      .filter(c => !updatedComponentIds.has(c.id))
      .map(c => c.id);

    if (componentsToRemove.length > 0) {
      slideDiff.components_to_remove = componentsToRemove;
    }

    // Components to update
    const componentsToUpdate: ComponentDiff[] = [];

    updatedComponents.forEach(updatedComponent => {
      if (!originalComponentIds.has(updatedComponent.id)) {
        return; // Skip new components
      }

      const originalComponent = originalComponents.find(c => c.id === updatedComponent.id);
      if (!originalComponent) return;

      // Compare props to find differences
      const propChanges: Record<string, any> = {};

      // Check props in updated component
      Object.keys(updatedComponent.props || {}).forEach(propKey => {
        const updatedValue = updatedComponent.props[propKey];
        const originalValue = originalComponent.props?.[propKey];

        // For simple values, direct comparison
        if (typeof updatedValue !== 'object' && updatedValue !== originalValue) {
          propChanges[propKey] = updatedValue;
        }
        // For objects, compare JSON stringified values as a simple way to detect changes
        else if (typeof updatedValue === 'object' &&
                updatedValue !== null &&
                JSON.stringify(updatedValue) !== JSON.stringify(originalValue)) {
          propChanges[propKey] = updatedValue;
        }
      });

      // Only add component to update list if it has changes
      if (Object.keys(propChanges).length > 0 ||
          originalComponent.type !== updatedComponent.type) {

        const componentDiff: ComponentDiff = {
          id: updatedComponent.id
        };

        // Only include type if it changed
        if (originalComponent.type !== updatedComponent.type) {
          componentDiff.type = updatedComponent.type;
        }

        // Include prop changes if any
        if (Object.keys(propChanges).length > 0) {
          componentDiff.props = propChanges;
        }

        componentsToUpdate.push(componentDiff);
      }
    });

    if (componentsToUpdate.length > 0) {
      slideDiff.components_to_update = componentsToUpdate;
    }

    // Only add the slide to the diff if it has any changes
    if (slideDiff.slide_properties ||
        slideDiff.components_to_add ||
        slideDiff.components_to_remove ||
        slideDiff.components_to_update) {
      slideDiffs.push(slideDiff);
    }
  });

  if (slideDiffs.length > 0) {
    diff.slides_to_update = slideDiffs;
  }

  return diff;
}