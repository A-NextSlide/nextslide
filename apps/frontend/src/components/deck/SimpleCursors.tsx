/**
 * Simple cursor component that directly draws remote users' cursors
 * 
 * This component provides a simplified version of the collaborative cursor
 * functionality that works reliably with both regular and sharded providers.
 * 
 * Now using coordinate normalization for consistent cursor positioning
 * across different browsers and zoom levels.
 */
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useYjs } from '@/yjs/YjsProvider';
import { useShardedYjs } from '@/yjs/ShardedYjsProvider';
import { 
  getRandomBrightColor, 
  updateCursorDirectly, 
  initializeGlobalCursorUtils,
  normalizeCursorCoordinates,
  denormalizeCursorCoordinates
} from '@/yjs/utils/cursorUtils';
import { useEditorSettingsStore } from '@/stores/editorSettingsStore';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';

interface SimpleCursorsProps {
  slideId: string;
  containerRef: React.RefObject<HTMLDivElement>;
  offsetY?: number; // Add optional offset to correct cursor position
  offsetX?: number; // Add optional offset for horizontal adjustment
  zoomLevel?: number; // Add optional zoom level prop
}

interface RemoteCursor {
  id: string;
  color: string;
  name: string;
  position: { x: number; y: number };
  normalizedPosition?: { x: number; y: number };
  isNormalized?: boolean;
  zoomLevel?: number;
}

// Don't duplicate the coordinate utilities - use the global ones from cursorUtils.ts

const SimpleCursors: React.FC<SimpleCursorsProps> = ({ 
  slideId, 
  containerRef,
  offsetY = 0,
  offsetX = 0,
  zoomLevel: propZoomLevel
}) => {
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);
  
  // Get users from both providers
  const yjsProvider = useYjs();
  const shardedYjs = useShardedYjs();
  
  // Get current zoom level from editor settings store or use prop
  const storeZoomLevel = useEditorSettingsStore(state => state.zoomLevel);
  const zoomLevel = propZoomLevel || storeZoomLevel;
  
  // Initialize global cursor utilities on mount
  useEffect(() => {
    // Initialize the global cursor utilities
    initializeGlobalCursorUtils();
    
    // Store awareness objects in global access for direct access
    if (yjsProvider.docManager?.wsProvider?.awareness && !window._awareness) {
      window._awareness = yjsProvider.docManager.wsProvider.awareness;
    }
    
    // Add all available providers to global list
    if (yjsProvider.docManager?.wsProvider && 
        window._yProviders && 
        !window._yProviders.includes(yjsProvider.docManager.wsProvider)) {
      window._yProviders.push(yjsProvider.docManager.wsProvider);
    }
  }, [yjsProvider.docManager]);
  
  // Merge users from both providers
  const allUsers = useMemo(() => {
    // Store the first provider's awareness in the global variable for direct access
    if (yjsProvider.docManager?.wsProvider?.awareness && !window._awareness) {
      window._awareness = yjsProvider.docManager.wsProvider.awareness;
    }
    
    const mergedUsers = [...yjsProvider.users, ...shardedYjs.users];
    
    // De-duplicate by client ID first
    return mergedUsers.filter((user, index, self) => {
      return index === self.findIndex(u => 
        u.id === user.id
      );
    });
  }, [yjsProvider.users, shardedYjs.users, yjsProvider.docManager]);
  
  // Add a handler to reactivate cursor on window focus or mouse activity after being idle
  useEffect(() => {
    if (!containerRef.current || !slideId) return;
    
    const handleWindowFocus = () => {
      // Force a cursor update when the window gets focus again
      if (window._forceCursorUpdate) {
        // Use a slight delay to ensure DOM is ready
        setTimeout(() => {
          // Just update with a dummy position to trigger reactivation
          // The real position will be updated on the next mouse move
          window._forceCursorUpdate(slideId, 0, 0);
        }, 500);
      }
    };
    
    // Add event listeners
    window.addEventListener('focus', handleWindowFocus);
    
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [slideId]);
  
  // Add mouse event handler to container for direct cursor updates
  useEffect(() => {
    if (!containerRef.current || !slideId) return;
    
    // Find the actual slide-container that maintains aspect ratio
    // This is needed because sometimes we might be passed a wrapper div
    const findSlideContainer = () => {
      let element = containerRef.current;
      
      // If the current element doesn't have data-slide-id, try to find it
      if (element && !element.dataset.slideId) {
        // Look for a child with data-slide-id
        const slideContainer = element.querySelector('.slide-container[data-slide-id]');
        if (slideContainer) {
          return slideContainer as HTMLElement;
        }
      }
      
      // Either the current element has data-slide-id or we couldn't find a better one
      return element;
    };
    
    // Get the actual slide container element
    const slideContainer = findSlideContainer();
    if (!slideContainer) {
      return;
    }
    
    // Track last update time to throttle updates
    let lastUpdateTime = 0;
    const THROTTLE_MS = 16; // ~60 updates per second for very smooth movement
    
    const handleMouseMove = (e: MouseEvent) => {
      const rect = slideContainer.getBoundingClientRect();
      if (!rect || !slideId) {
        return;
      }
      
      // Throttle updates to reduce network traffic
      const now = Date.now();
      if (now - lastUpdateTime < THROTTLE_MS) {
        return;
      }
      lastUpdateTime = now;
      
      // Calculate position relative to container with offset corrections
      const rawX = e.clientX - rect.left + offsetX;
      const rawY = e.clientY - rect.top + offsetY;
      
      // Only update if mouse is within the container and we have a valid slideId
      if (rawX >= 0 && rawY >= 0 && rawX <= rect.width && rawY <= rect.height && slideId.length > 0) {
        // Get the data-slide-width and data-slide-height from the container if available
        // These attributes contain the actual slide dimensions we should use
        const slideWidth = parseInt(slideContainer.dataset.slideWidth || '', 10) || DEFAULT_SLIDE_WIDTH;
        const slideHeight = parseInt(slideContainer.dataset.slideHeight || '', 10) || DEFAULT_SLIDE_HEIGHT;
        
        // Convert raw pixel coordinates to normalized slide coordinates (1920x1080)
        // Note: We don't need to apply zoom correction during normalization
        const normalized = normalizeCursorCoordinates(
          rawX, 
          rawY, 
          rect.width, 
          rect.height
          // No zoom parameter - mouse coordinates are already in absolute browser pixels
        );
        
        try {
          // Create a consistent user object that doesn't change between updates
          // This is crucial for avoiding the creation of new cursors
          let user = (window as any)._cachedUserInfo;
          
          // If no cached user info, create and cache one
          if (!user) {
            // First try to get user from providers
            const selfUser = yjsProvider.users.find(u => u.self) || 
                            shardedYjs.users.find(u => u.self);
            
            if (selfUser) {
              user = {
                id: selfUser.id,
                clientId: selfUser.clientId,
                name: selfUser.name,
                color: selfUser.color
              };
            } else {
              // Create a stable random ID that won't change during the session
              const sessionId = (window as any)._sessionId || 
                              `user-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
              (window as any)._sessionId = sessionId;
              
              user = {
                id: sessionId,
                clientId: sessionId,
                name: 'Anonymous',
                color: getRandomBrightColor(sessionId)
              };
            }
            
            // Cache this user info
            (window as any)._cachedUserInfo = user;
          }
          
          // Use the consistent client ID for all cursor updates
          const clientId = user.clientId || user.id;
          
          // Check if there are multiple users on this slide before broadcasting
          const shouldBroadcast = window._shouldBroadcastCursor ? 
                                window._shouldBroadcastCursor(slideId) : 
                                (cursors.length > 0); // Fall back to checking current cursors if function not available
          
          if (shouldBroadcast) {
            let yjsAwarenessUpdated = false;
            // Use global cursor update function to ensure data is broadcast to all awareness sources
            // Sending normalized coordinates (in slide space, 1920x1080)
            if (window._updateCursorDirectly) {
              window._updateCursorDirectly(slideId, normalized.x, normalized.y);
              yjsAwarenessUpdated = true; // Assume it updated if the function exists and was called
            } else {
              // Fallback direct implementation
              updateCursorDirectly(slideId, normalized.x, normalized.y);
              yjsAwarenessUpdated = true; // Assume it updated
            }
            
            // As an extra backup, send a direct WebSocket message for cursors
            // ONLY if Yjs awareness update didn't happen or we want to be absolutely sure
            // For now, let's always send as a backup, but this is a place for future optimization.
            // if (!yjsAwarenessUpdated) { // Potential optimization: only send if Yjs failed
            try {
              // Find any available WebSocket connection
              const providers = window._yProviders || [];
              for (const provider of providers) {
                if (provider?.ws?.readyState === WebSocket.OPEN) {
                  // Create a cursor message with consistent user info
                  // Send normalized coordinates (in slide space) for better cross-browser compatibility
                  const message = JSON.stringify({
                    type: 'cursor',
                    clientId: clientId,
                    slideId: slideId,
                    x: normalized.x,
                    y: normalized.y,
                    isNormalized: true, // Flag indicating these are normalized coordinates (in slide space)
                    containerSize: { width: rect.width, height: rect.height }, // For debugging
                    zoomLevel: zoomLevel, // Include zoom level for reference
                    timestamp: Date.now(),
                    user: {
                      id: user.id,
                      name: user.name,
                      color: user.color
                    }
                  });
                  
                  // Send message directly to the WebSocket as a string
                  provider.ws.send(message);
                  break; // Only need to send on one connection
                }
              }
            } catch (err) {
              // Silent error - the primary update method should still work
            }
          }
        } catch (err) {
          // Silent error
        }
      }
    };
    
    const handleMouseLeave = () => {
      if (!slideId) return;
      
      try {
        // Get the cached user info to ensure consistency
        const user = (window as any)._cachedUserInfo;
        const clientId = user?.clientId || user?.id || (window as any)._sessionId;
        
        // Mark cursor as outside slide but maintain identity
        if (window._updateCursorDirectly) {
          window._updateCursorDirectly(slideId, -1, -1);
        } else {
          updateCursorDirectly(slideId, -1, -1);
        }
        
        // Also send a direct message if possible
        if (clientId) {
          try {
            // Find any available WebSocket connection
            const providers = window._yProviders || [];
            for (const provider of providers) {
              if (provider?.ws?.readyState === WebSocket.OPEN) {
                // Create a cursor message with the same ID but off-screen
                const message = JSON.stringify({
                  type: 'cursor',
                  clientId: clientId,
                  slideId: slideId,
                  x: -1,
                  y: -1,
                  isNormalized: true,
                  timestamp: Date.now(),
                  user: user
                });
                
                // Send message directly to the WebSocket as a string
                provider.ws.send(message);
                break;
              }
            }
          } catch (err) {
            // Silent error
          }
        }
      } catch (err) {
        // Silent error
      }
    };
    
    // Add event listeners to the actual slide container
    slideContainer.addEventListener('mousemove', handleMouseMove);
    slideContainer.addEventListener('mouseleave', handleMouseLeave);
    
    // Clean up
    return () => {
      slideContainer?.removeEventListener('mousemove', handleMouseMove);
      slideContainer?.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [slideId, containerRef, zoomLevel]);
  
  // Process users to display cursors
  useEffect(() => {
    if (!slideId || allUsers.length === 0) {
      setCursors([]);
      return;
    }
    
    // Get all awareness states from all possible sources
    const awarenessSources = window._getAllAwarenessSources?.() || [];
    
    // Check awareness states directly to ensure we don't miss any
    let allCursorData: any[] = [];
    
    try {
      // Process awareness data from all sources
      awarenessSources.forEach(awareness => {
        if (!awareness || !awareness.getStates) return;
        
        // Get all states from this awareness
        const states = Array.from(awareness.getStates().entries());
        
        // Process each state to extract cursor data
        states.forEach(([clientId, state]) => {
          if (!state || !state.user || !state.cursor) return;
          
          // Add to cursor data
          allCursorData.push({
            id: state.user.id || `unknown-${clientId}`,
            name: state.user.name || 'Unknown User',
            color: state.user.color || getRandomBrightColor(),
            cursor: state.cursor,
            clientId: clientId,
            isNormalized: true // Assume cursor positions are now normalized
          });
        });
      });
      
      // Process all users to find cursors
      const cursorUsers = [...allUsers, ...allCursorData];
      
      // Remove duplicates
      const uniqueUsers = cursorUsers.filter((user, index, self) => 
        index === self.findIndex(u => 
          (u.clientId && user.clientId && u.clientId === user.clientId) ||
          (u.id === user.id)
        )
      );
      
      // Filter users with cursor data
      const realCursors = uniqueUsers
        .filter(user => {
          // Must have valid cursor data
          if (!user.cursor) return false;
          
          // Check for valid coordinates
          const hasCursorCoords = (
            typeof user.cursor.x === 'number' && 
            typeof user.cursor.y === 'number'
          );
          
          return hasCursorCoords;
        })
        .map(user => {
          // Generate a unique cursor ID that uses clientId if available
          const cursorId = user.clientId 
            ? `cursor-${user.clientId}` 
            : `cursor-${user.id}-${Math.random().toString(36).substring(2, 6)}`;
          
          // Extract normalized cursor position
          const normalizedX = Number(user.cursor?.x) || 0;
          const normalizedY = Number(user.cursor?.y) || 0;
          
          return {
            id: cursorId,
            color: user.color || getRandomBrightColor(),
            name: user.name || 'User',
            // Store both the normalized position and the screen position
            position: {
              x: normalizedX,  // We'll denormalize this for rendering
              y: normalizedY   // We'll denormalize this for rendering
            },
            normalizedPosition: {
              x: normalizedX,
              y: normalizedY
            },
            isNormalized: true, // Mark these coordinates as normalized
            zoomLevel: user.cursor.zoomLevel || zoomLevel // Use the original zoom level or current
          };
        });
      
      // Update the cursor state
      setCursors(realCursors);
    } catch (err) {
      // In case of errors, clear cursors
      setCursors([]);
    }
  }, [allUsers, slideId, zoomLevel]);
  
  // Don't render if no container reference
  if (!containerRef.current) {
    return null;
  }
  
  // Find the actual slide-container with fixed aspect ratio
  const findSlideContainer = () => {
    let element = containerRef.current;
    
    // If the current element doesn't have data-slide-id, try to find it
    if (element && !element.dataset.slideId) {
      // Look for a child with data-slide-id
      const slideContainer = element.querySelector('.slide-container[data-slide-id]');
      if (slideContainer) {
        return slideContainer as HTMLElement;
      }
    }
    
    // Either the current element has data-slide-id or we couldn't find a better one
    return element;
  };
  
  // Get the actual slide container element where we'll render cursors
  const slideContainer = findSlideContainer();
  if (!slideContainer) {
    return null;
  }
  
  // Get slide dimensions from the container data attributes if available
  const slideWidth = parseInt(slideContainer.dataset.slideWidth || '', 10) || DEFAULT_SLIDE_WIDTH;
  const slideHeight = parseInt(slideContainer.dataset.slideHeight || '', 10) || DEFAULT_SLIDE_HEIGHT;
  
  // Get container dimensions for rendering coordinates
  const containerRect = slideContainer.getBoundingClientRect();
  
  return (
    <div 
      className="pointer-events-none absolute inset-0 overflow-visible"
      aria-hidden="true"
      style={{
        zIndex: 9999,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none'
      }}
      data-testid="simple-cursors-container"
      data-slide-id={slideId}
    >
      {cursors.map(cursor => {
        // Use the denormalization utility to properly convert from slide coordinates to screen coordinates
        // The cursor.position contains normalized coordinates (in slide space 1920x1080)
        // We need to convert those back to screen coordinates considering the container size and zoom
        const { x: adjustedX, y: adjustedY } = denormalizeCursorCoordinates(
          cursor.position.x,
          cursor.position.y, 
          containerRect.width, 
          containerRect.height,
          zoomLevel // Zoom is applied during rendering, not during normalization
        );
        
        return (
          <div
            key={cursor.id}
            className="absolute"
            style={{
              transform: `translate(${adjustedX}px, ${adjustedY + offsetY}px)`,
              zIndex: 10000, // Ensure each cursor has its own high z-index
              position: 'absolute',
              transition: 'transform 0.05s ease-out', // Faster, more responsive animation
              willChange: 'transform' // Optimize for animations
            }}
            data-testid={`remote-cursor-${cursor.id}`}
            data-normalized-x={cursor.position.x}
            data-normalized-y={cursor.position.y}
            data-screen-x={adjustedX}
            data-screen-y={adjustedY}
          >
            {/* Cursor pointer shape - clean and smooth */}
            <svg
              width="22" 
              height="32" 
              viewBox="0 0 16 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              style={{ 
                color: cursor.color,
                filter: 'drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.2))'
              }}
            >
              <path
                d="M 0.75 0.5 L 0.75 15.5 C 4 11 5 10 11 10 L 0.75 0.5 Z"
                fill={cursor.color}
                stroke="#333333"
                strokeWidth="1"
              />
            </svg>
            
            {/* User label - with background color and white text */}
            <div
              className="ml-1 rounded-md px-2 py-0.5 text-xs font-medium text-white"
              style={{ 
                backgroundColor: cursor.color,
                position: 'absolute',
                left: '22px',
                top: '0px',
                opacity: 0.9,
                boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                maxWidth: '100px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {cursor.name}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SimpleCursors;