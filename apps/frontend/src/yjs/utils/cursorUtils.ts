/**
 * Utility functions for working with collaborative cursors
 */
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';

// Add the global function type to Window interface
declare global {
  interface Window {
    _yProviders?: any[];
    _awareness?: any;
    _getAllAwarenessSources?: () => any[];
    _updateCursorDirectly?: (slideId: string, x: number, y: number) => void;
    _normalizeCursorCoordinates?: (x: number, y: number, containerWidth: number, containerHeight: number, zoomLevel: number) => { x: number, y: number };
    _denormalizeCursorCoordinates?: (normalizedX: number, normalizedY: number, containerWidth: number, containerHeight: number, zoomLevel: number) => { x: number, y: number };
    _shouldBroadcastCursor?: (slideId: string) => boolean;
  }
}

/**
 * Normalize cursor coordinates from screen space to slide space (1920x1080)
 * This function converts mouse position on the slide container to the
 * standardized coordinate system used by slide components.
 * It matches the percentage-based positioning used for components.
 */
export function normalizeCursorCoordinates(
  x: number, 
  y: number, 
  containerWidth: number, 
  containerHeight: number,
  zoomLevel: number = 100 // Not used in normalization, only needed for type compatibility
): { x: number, y: number } {
  // IMPORTANT: Mouse event coordinates (clientX/Y) are already in absolute browser pixels
  // Normalize by converting to percentage of container size, then map to slide coordinates
  
  // Convert directly to the standard slide coordinate system (1920x1080)
  // This is a straight percentage mapping with no zoom adjustment needed
  const slideX = (x / containerWidth) * DEFAULT_SLIDE_WIDTH;
  const slideY = (y / containerHeight) * DEFAULT_SLIDE_HEIGHT;
  
  return {
    x: Math.round(slideX),
    y: Math.round(slideY)
  };
}

/**
 * Denormalize cursor coordinates from slide space (1920x1080) to screen space
 * This is the inverse of normalizeCursorCoordinates - it converts from 
 * standard slide coordinates back to container-specific pixel positions.
 */
export function denormalizeCursorCoordinates(
  normalizedX: number, 
  normalizedY: number, 
  containerWidth: number, 
  containerHeight: number,
  zoomLevel: number = 100 // Default to 100% zoom
): { x: number, y: number } {
  // Clamp normalized values to ensure they're within slide bounds
  const clampedX = Math.max(0, Math.min(DEFAULT_SLIDE_WIDTH, normalizedX));
  const clampedY = Math.max(0, Math.min(DEFAULT_SLIDE_HEIGHT, normalizedY));
  
  // First, convert from normalized slide coordinates (1920x1080) to container coordinates
  // This is a direct percentage-based conversion matching how components are positioned
  const containerX = (clampedX / DEFAULT_SLIDE_WIDTH) * containerWidth;
  const containerY = (clampedY / DEFAULT_SLIDE_HEIGHT) * containerHeight;
  
  // Adjusting for zoom level, since containers may be seen at different zoom levels
  // Important: zoomLevel affects how we should position cursor in the current view
  const zoomFactor = zoomLevel / 100;
  const adjustedX = containerX * zoomFactor;
  const adjustedY = containerY * zoomFactor;
  
  return {
    x: Math.round(adjustedX),
    y: Math.round(adjustedY)
  };
}

/**
 * Generate a random bright color
 * @param seed Optional seed string for deterministic color generation
 * @returns A bright color as a hex or HSL string
 */
export function getRandomBrightColor(seed?: string): string {
  if (seed) {
    // Generate deterministic color from seed
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Use hue to create bright color in HSL
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 100%, 50%)`;
  }
  
  // Random bright colors
  const brightColors = [
    '#FF5733', '#33FF57', '#3357FF', '#FF33F5', 
    '#33FFF5', '#F5FF33', '#FF5733', '#33FF96',
    '#9633FF', '#FF9633', '#33FFFF', '#FF33FF'
  ];
  
  return brightColors[Math.floor(Math.random() * brightColors.length)];
}

/**
 * Get all awareness sources from various places in the application
 * This function intensively searches for any available awareness objects to ensure
 * cursor updates can be sent to all possible sources.
 * 
 * @returns Array of awareness objects
 */
export function getAllAwarenessSources(): any[] {
  const sources: any[] = [];
  
  // Get awareness from regular providers
  if (window._yProviders) {
    window._yProviders.forEach(provider => {
      if (provider && provider.awareness) {
        sources.push(provider.awareness);
      }
    });
  } else {
    // Create the global array if it doesn't exist - important for registration
    window._yProviders = [];
  }
  
  // Get direct awareness if available
  if (window._awareness) {
    sources.push(window._awareness);
  }
  
  // Look for YjsDocumentManager instances directly
  if (window._yjsDocManager) {
    try {
      if (window._yjsDocManager.wsProvider && window._yjsDocManager.wsProvider.awareness) {
        sources.push(window._yjsDocManager.wsProvider.awareness);
      }
    } catch (err) {
      // Ignore errors
    }
  }
  
  // Deep search for awareness in document managers
  try {
    // First try to find DocumentShardManagers
    for (const key in window) {
      try {
        const obj = (window as any)[key];
        // Look for DocumentShardManager instances
        if (obj && typeof obj === 'object' && obj.providers && Array.isArray(obj.providers)) {
          obj.providers.forEach((provider: any) => {
            if (provider && provider.wsProvider && provider.wsProvider.awareness) {
              if (!sources.includes(provider.wsProvider.awareness)) {
                sources.push(provider.wsProvider.awareness);
              }
            }
          });
        }
        
        // Look for YjsDocumentManager instances
        if (obj && typeof obj === 'object' && obj.wsProvider && obj.wsProvider.awareness) {
          if (!sources.includes(obj.wsProvider.awareness)) {
            sources.push(obj.wsProvider.awareness);
          }
        }
      } catch (err) {
        // Ignore errors accessing properties
      }
    }
  } catch (err) {
    // Ignore any errors in deep search
  }
  
  // Try to find WebSocket providers in the document
  if (typeof document !== 'undefined') {
    try {
      // First check all components with data-slide-id attribute as they might have providers
      const slideElements = document.querySelectorAll('[data-slide-id]');
      slideElements.forEach(element => {
        try {
          if ((element as any)._provider && (element as any)._provider.awareness) {
            sources.push((element as any)._provider.awareness);
          }
        } catch (err) {
          // Ignore errors accessing properties
        }
      });
      
      // Now search all window objects for WebSocket providers
      for (const key in window) {
        try {
          const obj = (window as any)[key];
          
          // Look for WebSocket providers (have awareness and ws properties)
          if (obj && typeof obj === 'object' && obj.awareness && obj.ws) {
            if (!sources.includes(obj.awareness)) {
              sources.push(obj.awareness);
            }
          }
          
          // Also look for provider objects that might have awareness
          if (obj && typeof obj === 'object' && obj.awareness && !sources.includes(obj.awareness)) {
            sources.push(obj.awareness);
          }
        } catch (err) {
          // Ignore errors when accessing window properties
        }
      }
    } catch (err) {
      // Ignore search errors
    }
  }
  
  // If no sources found, try to create a fake awareness for debugging
  if (sources.length === 0 && window._createDebugAwareness) {
    try {
      const debugAwareness = (window as any)._createDebugAwareness();
      sources.push(debugAwareness);
    } catch (err) {
      // Ignore errors
    }
  }
  
  return sources;
}

/**
 * Update the cursor position in all available awareness sources
 * 
 * This is a global helper that ensures cursor updates are sent to
 * all possible awareness sources, regardless of which provider or
 * awareness object is currently active.
 * 
 * @param slideId - The ID of the slide where the cursor is located
 * @param x - The x coordinate of the cursor
 * @param y - The y coordinate of the cursor
 */
export function updateCursorGlobally(slideId: string, x: number, y: number): void {
  // Check if there are multiple users on this slide before broadcasting
  const shouldBroadcast = shouldBroadcastCursor(slideId);
  
  // If there's only 1 user on this slide, don't broadcast
  if (!shouldBroadcast) {
    return;
  }
  
  // Use the global helper if available
  if (window._updateCursorDirectly) {
    window._updateCursorDirectly(slideId, x, y);
    return;
  }
  
  // Fallback to direct implementation
  updateCursorDirectly(slideId, x, y);
}

/**
 * Check if we should broadcast cursor movements for a specific slide
 * Only broadcast if there are 2 or more users on the same slide
 * 
 * @param slideId - The ID of the slide to check
 * @returns True if cursor movement should be broadcast
 */
export function shouldBroadcastCursor(slideId: string): boolean {
  try {
    // Get all awareness sources
    const awarenessSources = getAllAwarenessSources();
    
    if (awarenessSources.length === 0) {
      return false; // No awareness sources, no need to broadcast
    }
    
    // Combine all users who have cursor data for this slide
    let usersOnSlide = 0;
    
    for (const awareness of awarenessSources) {
      if (!awareness || !awareness.getStates) continue;
      
      try {
        // Get all states from this awareness
        const states = Array.from(awareness.getStates().entries());
        
        // Process each state to find users on this slide
        states.forEach(([clientId, state]) => {
          if (!state || !state.cursor) return;
          
          // Count user if they're on this slide (or if slideId is empty)
          if (state.cursor.slideId === slideId || !state.cursor.slideId) {
            usersOnSlide++;
          }
        });
      } catch (err) {
        // Ignore errors
      }
    }
    
    // Only broadcast if there are at least 2 users on this slide
    return usersOnSlide >= 2;
  } catch (err) {
    console.error("Error checking if cursor broadcast is needed:", err);
    return true; // Default to broadcasting on error
  }
}

/**
 * Direct implementation for updating cursor position in all awareness sources
 */
export function updateCursorDirectly(slideId: string, x: number, y: number): void {
  try {    
    // Get all available awareness objects
    const awarenessSources = getAllAwarenessSources();
    
    if (awarenessSources.length === 0) {
      // Try to find or create the global awareness registry
      if (!window._yProviders) {
        window._yProviders = [];
      }
      return;
    }
    
    // Ensure slideId is not undefined or null
    const safeSlideId = slideId || '';
    
    // Update all awareness objects to ensure cursor data is propagated
    awarenessSources.forEach((awareness) => {
      if (!awareness) return;
      
      try {
        // Get current state and ensure user is set
        const currentState = awareness.getLocalState() || {};
        if (!currentState.user) {
          try {
            // Create a random user to ensure we have something
            const randomId = `user-${Math.floor(Math.random() * 1000000)}`;
            const randomName = `Anonymous`;
            const randomColor = getRandomBrightColor();
            
            awareness.setLocalStateField('user', {
              id: randomId,
              name: randomName,
              color: randomColor,
            });
          } catch (userErr) {
            // Silent error
          }
        }
        
        // Get the client ID
        const clientId = awareness.clientID;
        
        // Convert coordinates to integers
        const intX = Math.round(x);
        const intY = Math.round(y);
        
        // Always update the cursor coordinates, even if outside the container
        // For out-of-bounds, we use the provided coordinates which might be -1, -1
        // This way the cursor will disappear but the user remains visible in the UI
        awareness.setLocalStateField('cursor', {
          slideId: safeSlideId,
          x: intX,
          y: intY,
          t: Date.now() // Timestamp to ensure changes are detected
        });
        
        // Force immediate update broadcast
        awareness.setLocalStateField('lastUpdate', Date.now());
        
        try {
          // Instead of using emit directly, force the awareness to broadcast
          // This uses the internal mechanisms of y-protocols without depending on emit
          if (awareness.clientID === clientId) {
            if (typeof awareness._broadcastUpdateMessage === 'function') {
              // For newer Yjs versions that have this method
              awareness._broadcastUpdateMessage();
            } else if (typeof awareness.emit === 'function') {
              // Just update the timestamp - this will force broadcasting without events
              awareness.setLocalStateField('lastUpdate', Date.now());
            } else {
              // Last resort: manually trigger an update
              // If there's a WebSocket provider, try to force a direct message
              const ws = (awareness as any).ws || (awareness as any)._ws;
              if (ws && ws.readyState === WebSocket.OPEN) {
                // Send cursor message as plain text instead of binary
                try {
                  // Get the user info with fallbacks
                  const userInfo = (awareness as any).getLocalState()?.user || {
                    id: `user-${Math.floor(Math.random() * 1000000)}`,
                    name: 'Anonymous',
                    color: getRandomBrightColor()
                  };
                  
                  // Create the cursor message
                  const message = JSON.stringify({
                    type: 'cursor',
                    clientId: clientId,
                    slideId: safeSlideId,
                    x: intX,
                    y: intY,
                    timestamp: Date.now(),
                    user: userInfo
                  });
                  
                  // Send as text, not binary data
                  ws.send(message);
                } catch (wsErr) {
                  // Silent error
                }
              }
            }
          }
        } catch (err) {
          // Silent error
        }
      } catch (sourceErr) {
        // Silent error
      }
    });
  } catch (err) {
    // Silent error
  }
}

/**
 * Initialize global cursor utility functions
 */
export function initializeGlobalCursorUtils() {
  if (!window._getAllAwarenessSources) {
    window._getAllAwarenessSources = getAllAwarenessSources;
  }
  
  if (!window._updateCursorDirectly) {
    window._updateCursorDirectly = updateCursorDirectly;
  }
  
  if (!window._shouldBroadcastCursor) {
    window._shouldBroadcastCursor = shouldBroadcastCursor;
  }
  
  // Add normalized cursor coordinate utilities to window
  if (!window._normalizeCursorCoordinates) {
    window._normalizeCursorCoordinates = normalizeCursorCoordinates;
  }
  
  if (!window._denormalizeCursorCoordinates) {
    window._denormalizeCursorCoordinates = denormalizeCursorCoordinates;
  }
  
  // Add activity monitor to detect page visibility changes
  if (typeof document !== 'undefined') {
    // Track last activity time
    if (!window._lastCursorActivity) {
      window._lastCursorActivity = Date.now();
    }
    
    // Setup visibility change tracking
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        window._lastCursorActivity = Date.now();
        
        // Trigger cursor reactivation for all active slides
        if (window._forceCursorReactivation) {
          window._forceCursorReactivation();
        }
      }
    });
    
    // Global function to force reactivation of all cursors
    window._forceCursorReactivation = () => {
      try {
        // Update cursor in all awareness sources
        const sources = getAllAwarenessSources();
        if (sources.length === 0) {
          return false;
        }
        
        // Trigger cursor update in each source
        sources.forEach(awareness => {
          try {
            if (awareness.getLocalState()?.cursor?.slideId) {
              const slideId = awareness.getLocalState().cursor.slideId;
              // Force cursor update with same coordinates to trigger awareness broadcast
              updateCursorDirectly(slideId, 
                awareness.getLocalState().cursor.x || 0, 
                awareness.getLocalState().cursor.y || 0);
            }
          } catch (err) {
            // Ignore errors in individual sources
          }
        });
        
        return true;
      } catch (err) {
        return false;
      }
    };
  }
  
  // Add helper for debugging cursor tracking
  if (!window._debugCursor) {
    window._debugCursor = () => {
      const sources = getAllAwarenessSources();
      
      return {
        sources,
        providers: window._yProviders || [],
        awareness: window._awareness
      };
    };
  }
  
  // Add more advanced helper function for detailed cursor debugging
  if (!window._inspectCursors) {
    window._inspectCursors = () => {
      // 1. Get all awareness sources
      const sources = getAllAwarenessSources();
      
      // 2. Inspect each source
      const allCursors: any[] = [];
      
      sources.forEach((awareness, i) => {
        try {
          const states = Array.from(awareness.getStates().entries());
          
          // Extract cursor data
          states.forEach(([clientId, state]) => {
            if (state.cursor) {
              allCursors.push({
                sourceIndex: i,
                clientId,
                user: state.user ? `${state.user.name} (${state.user.id})` : 'Unknown',
                cursor: state.cursor,
                lastUpdate: state.lastUpdate
              });
            }
          });
        } catch (err) {
          // Silent error
        }
      });
      
      // Update a test cursor
      updateCursorDirectly('test-slide', 999, 999);
      
      return {
        sources,
        cursors: allCursors,
        providers: window._yProviders || [],
        awareness: window._awareness
      };
    };
  }
  
  // Create global utility to register document managers
  if (!window._registerYjsDocManager) {
    window._registerYjsDocManager = (docManager: any) => {
      window._yjsDocManager = docManager;
      
      if (docManager?.wsProvider?.awareness) {
        if (!window._awareness) {
          window._awareness = docManager.wsProvider.awareness;
        }
        
        if (!window._yProviders?.includes(docManager.wsProvider)) {
          window._yProviders = window._yProviders || [];
          window._yProviders.push(docManager.wsProvider);
        }
      }
    };
  }
  
  // Make sure a window helper is available to force cursor update
  window._forceCursorUpdate = (slideId: string, x: number, y: number) => {
    updateCursorDirectly(slideId, x, y);
    return "Cursor update forced";
  };
  
  // Add a test function for cursor coordinate transformation
  window._testCursorCoordinates = (testX, testY, containerWidth, containerHeight, zoomLevel = 100) => {
    // Test normalization
    const normalized = normalizeCursorCoordinates(testX, testY, containerWidth, containerHeight, zoomLevel);
    
    // Test denormalization (round trip)
    const denormalized = denormalizeCursorCoordinates(normalized.x, normalized.y, containerWidth, containerHeight, zoomLevel);
    
    // Calculate error
    const errorX = Math.abs(testX - denormalized.x);
    const errorY = Math.abs(testY - denormalized.y);
    
    return {
      input: { x: testX, y: testY, containerWidth, containerHeight, zoomLevel },
      normalized,
      denormalized,
      error: { x: errorX, y: errorY }
    };
  };
}