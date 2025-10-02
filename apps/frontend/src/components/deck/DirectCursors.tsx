/**
 * DirectCursors component - Creates and manages its own direct cursor tracking
 * 
 * This is a fallback implementation for when the Yjs infrastructure isn't properly
 * initialized, ensuring that cursors between browsers still work.
 */

import React, { useEffect, useState, useRef } from 'react';
import { 
  getRandomBrightColor, 
  normalizeCursorCoordinates, 
  denormalizeCursorCoordinates 
} from '@/yjs/utils/cursorUtils';
import { useEditorSettingsStore } from '@/stores/editorSettingsStore';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';

interface DirectCursorsProps {
  slideId: string;
  containerRef: React.RefObject<HTMLDivElement>;
  offsetY?: number; // Add optional offset to correct cursor position
  offsetX?: number; // Add optional offset for horizontal adjustment
  zoomLevel?: number; // Add optional zoom level prop
}

interface CursorInfo {
  id: string;
  color: string;
  name: string;
  x: number;
  y: number;
  normalizedX?: number; // Normalized to slide coordinates (0-1920)
  normalizedY?: number; // Normalized to slide coordinates (0-1080)
  timestamp: number;
  isNormalized?: boolean;
  zoomLevel?: number;    // Zoom level at which cursor was captured
}

// Create a BroadcastChannel for direct cursor sharing between browser tabs/windows
let cursorChannel: BroadcastChannel | null = null;
try {
  cursorChannel = new BroadcastChannel('cursor-sharing');
} catch (err) {
  // Silently fail if BroadcastChannel is not supported
}

// Generate a unique ID for this browser instance
const BROWSER_ID = `browser-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
// Generate a fixed color for this browser
const BROWSER_COLOR = getRandomBrightColor(BROWSER_ID);
const BROWSER_NAME = `Browser ${BROWSER_ID.substring(BROWSER_ID.length - 4)}`;

// Use the shared utility functions for cursor coordinate transformation

// Store identity in window for debugging (silently)
if (typeof window !== 'undefined') {
  window._directCursorInfo = {
    id: BROWSER_ID,
    color: BROWSER_COLOR,
    name: BROWSER_NAME
  };
}

const DirectCursors: React.FC<DirectCursorsProps> = ({ 
  slideId, 
  containerRef,
  offsetY = 0,
  offsetX = 0,
  zoomLevel: propZoomLevel
}) => {
  // Track all cursors from other browsers
  const [remoteCursors, setRemoteCursors] = useState<Record<string, CursorInfo>>({});
  
  // Track last cursor update time to throttle updates (16ms = ~60 updates/sec)
  const lastUpdateRef = useRef<number>(0);
  const THROTTLE_INTERVAL = 16; // ~60 updates per second for very smooth movement
  
  // Keep track of our active status
  const isActiveRef = useRef<boolean>(true);
  
  // Get current zoom level from editor settings store or use prop
  const storeZoomLevel = useEditorSettingsStore(state => state.zoomLevel);
  const zoomLevel = propZoomLevel || storeZoomLevel;
  
  // Initialize and cleanup
  useEffect(() => {    
    // Validate container reference to ensure we're tracking the right element
    if (containerRef.current) {
      // Verify this is the proper slide container with aspect ratio
      if (!containerRef.current.dataset.slideId) {
        // Silently handle missing data attribute
      }
    }
    
    // Register cleanup
    return () => {
      isActiveRef.current = false;
    };
  }, [slideId, containerRef]);
  
  // Set up BroadcastChannel communication
  useEffect(() => {
    if (!cursorChannel) {
      return;
    }
    
    // Listen for cursor updates from other browsers
    const handleMessage = (e: MessageEvent) => {
      try {
        // Handle both string and object data format
        let data = e.data;
        
        // Try to parse string data (from WebSocket)
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch (parseErr) {
            return;
          }
        }
        
        // WebSocket messages from SimpleCursors will have type 'cursor' instead of 'cursor-update'
        // Normalize the message format
        if (data.type === 'cursor') {
          // Convert to DirectCursors format
          data = {
            type: 'cursor-update',
            browserId: data.clientId || data.user?.id || `remote-${Math.random()}`,
            slideId: data.slideId,
            x: data.x,
            y: data.y,
            color: data.user?.color || getRandomBrightColor(),
            name: data.user?.name || 'Remote User',
            timestamp: data.timestamp || Date.now()
          };
        }
        
        // Ignore our own messages
        if (data.browserId === BROWSER_ID) return;
        
        // Process cursor update
        if (data.type === 'cursor-update') {
          // Only process if the slideId matches (or is empty)
          if (!data.slideId || data.slideId === slideId) {            
            setRemoteCursors(prev => ({
              ...prev,
              [data.browserId]: {
                id: data.browserId,
                color: data.color,
                name: data.name,
                x: data.x,
                y: data.y,
                timestamp: data.timestamp
              }
            }));
          }
        } else if (data.type === 'cursor-leave') {
          // Remove cursor when a browser reports the cursor has left
          setRemoteCursors(prev => {
            const newCursors = { ...prev };
            if (newCursors[data.browserId]) {
              delete newCursors[data.browserId];
              return newCursors;
            }
            return prev;
          });
        } else if (data.type === 'browser-connected') {
          // Immediately send our current cursor position to the new browser
          if (cursorChannel && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            cursorChannel.postMessage({
              type: 'cursor-update',
              browserId: BROWSER_ID,
              slideId,
              x: Math.round(rect.width / 2),  // Default to center
              y: Math.round(rect.height / 2), // Default to center
              color: BROWSER_COLOR,
              name: BROWSER_NAME,
              timestamp: Date.now()
            });
          }
        }
      } catch (err) {
        // Silent error
      }
    };
    
    cursorChannel.addEventListener('message', handleMessage);
    
    // Send an introduction message
    cursorChannel.postMessage({
      type: 'browser-connected',
      browserId: BROWSER_ID,
      name: BROWSER_NAME,
      color: BROWSER_COLOR,
      timestamp: Date.now()
    });
    
    // Set up periodic heartbeat to ensure all browsers know about each other
    const heartbeatInterval = setInterval(() => {
      if (!isActiveRef.current || !cursorChannel) return;
      
      // Send a heartbeat with our ID
      cursorChannel.postMessage({
        type: 'heartbeat',
        browserId: BROWSER_ID,
        name: BROWSER_NAME,
        color: BROWSER_COLOR,
        timestamp: Date.now()
      });
    }, 5000);
    
    // Clean up
    return () => {
      cursorChannel?.removeEventListener('message', handleMessage);
      clearInterval(heartbeatInterval);
      
      // Notify other browsers that we're leaving
      cursorChannel?.postMessage({
        type: 'cursor-leave',
        browserId: BROWSER_ID,
        timestamp: Date.now()
      });
    };
  }, [slideId, containerRef]);
  
  // Listen for direct WebSocket cursor messages
  useEffect(() => {
    const handleDirectWebSocketMessage = (event: CustomEvent) => {
      try {
        const data = event.detail;
        
        // Check that we have valid cursor data
        if (!data || data.type !== 'cursor') {
          return;
        }
        
        // Extract slide ID with fallback
        const cursorSlideId = data.slideId || '';
        
        // Accept cursors with no slide ID (show on all slides) or matching this slide's ID
        if (cursorSlideId === '' || cursorSlideId === slideId) {
          // Generate a STABLE ID for this remote cursor to avoid duplication
          // Use clientId if available as primary identifier
          let browserId;
          if (data.clientId) {
            // Use the actual client ID directly
            browserId = data.clientId;
          } else if (data.user?.id) {
            // Use the user ID with a prefix for stability
            browserId = `user-${data.user.id}`;
          } else {
            // Last resort - use network address if available or random
            browserId = `remote-${Math.floor(Math.random() * 1000000)}`;
          }
          
          // Don't show our own cursor
          if (browserId !== BROWSER_ID) {
            // Extract and validate coordinates
            const x = typeof data.x === 'number' ? data.x : 0;
            const y = typeof data.y === 'number' ? data.y : 0;
            
            // Extract user information with fallbacks
            // For color and name, we only set them on the FIRST appearance
            // to avoid flickering due to randomized values
            
            setRemoteCursors(prev => {
              // Check if we already have this cursor
              const existingCursor = prev[browserId];
              
              // If this cursor is already in our state, just update position and timestamp
              if (existingCursor) {
                return {
                  ...prev,
                  [browserId]: {
                    ...existingCursor,
                    x,
                    y,
                    timestamp: data.timestamp || Date.now()
                  }
                };
              } 
              // Otherwise create a new cursor entry
              else {
                const color = data.user?.color || getRandomBrightColor(browserId);
                const name = data.user?.name || 'Remote User';
                
                return {
                  ...prev,
                  [browserId]: {
                    id: browserId,
                    color,
                    name,
                    x,
                    y,
                    timestamp: data.timestamp || Date.now()
                  }
                };
              }
            });
          }
        }
      } catch (err) {
        // Silent error
      }
    };
    
    // Add event listener for custom event from WebSocket
    document.addEventListener('ws-cursor-message', handleDirectWebSocketMessage as EventListener);
    
    return () => {
      document.removeEventListener('ws-cursor-message', handleDirectWebSocketMessage as EventListener);
    };
  }, [slideId]);

  // Add a handler to reactivate cursor on window focus or mouse activity after being idle
  useEffect(() => {
    if (!containerRef.current || !slideId || !cursorChannel) return;
    
    const handleWindowFocus = () => {
      // Send a reactivation message
      cursorChannel.postMessage({
        type: 'browser-connected',
        browserId: BROWSER_ID,
        name: BROWSER_NAME,
        color: BROWSER_COLOR,
        timestamp: Date.now()
      });
    };
    
    // Add event listeners
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleWindowFocus();
      }
    });
    
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('visibilitychange', handleWindowFocus);
    };
  }, [slideId, cursorChannel]);

  // Handle mouse movement
  useEffect(() => {
    if (!containerRef.current || !cursorChannel) return;
    
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
    
    // Handler for cursor movement
    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      
      // Throttle updates to reduce network traffic
      if (now - lastUpdateRef.current < THROTTLE_INTERVAL) return;
      lastUpdateRef.current = now;
      
      // Get position relative to the slide container with offset corrections
      const rect = slideContainer.getBoundingClientRect();
      const rawX = e.clientX - rect.left + offsetX;
      const rawY = e.clientY - rect.top + offsetY;
      
      // Only update if mouse is within the container and slide is valid
      if (rawX >= 0 && rawY >= 0 && rawX <= rect.width && rawY <= rect.height && slideId) {
        // Get the data-slide-width and data-slide-height from the container if available
        // These attributes contain the actual slide dimensions we should use
        const slideWidth = parseInt(slideContainer.dataset.slideWidth || '', 10) || DEFAULT_SLIDE_WIDTH;
        const slideHeight = parseInt(slideContainer.dataset.slideHeight || '', 10) || DEFAULT_SLIDE_HEIGHT;
        
        // Convert raw pixel coordinates to normalized slide coordinates (1920x1080)
        // This uses the shared utility to ensure consistency across code
        const normalized = normalizeCursorCoordinates(
          rawX, 
          rawY, 
          rect.width, 
          rect.height
          // No zoom parameter - mouse coordinates are already in absolute browser pixels
        );
        
        // Update our own cursor state to ensure it shows up in inspectCursors()
        // Store the normalized position (relative to slide dimensions)
        window._directCursorPosition = {
          slideId,
          x: normalized.x,
          y: normalized.y,
          timestamp: now,
          zoomLevel: zoomLevel // Store zoom level for debugging
        };
        
        // Check if there are multiple users on this slide before broadcasting
        const shouldBroadcast = window._shouldBroadcastCursor ? 
                              window._shouldBroadcastCursor(slideId) : 
                              (activeCursors.length > 0); // Fall back to checking active cursors if function not available
                              
        if (shouldBroadcast) {
          // Broadcast normalized cursor position with proper additional information
          cursorChannel!.postMessage({
            type: 'cursor-update',
            browserId: BROWSER_ID,
            slideId,
            x: normalized.x,
            y: normalized.y,
            isNormalized: true, // Flag to indicate this is a normalized position (in slide space)
            containerSize: { width: rect.width, height: rect.height }, // Send container dimensions for debugging
            zoomLevel: zoomLevel, // Include the zoom level for debugging/analysis
            color: BROWSER_COLOR,
            name: BROWSER_NAME,
            timestamp: now
          });
        }
      }
    };
    
    // Handle mouse leave
    const handleMouseLeave = () => {
      // Update our own cursor state
      if (window._directCursorPosition) {
        window._directCursorPosition.x = -1;
        window._directCursorPosition.y = -1;
        window._directCursorPosition.timestamp = Date.now();
      }
      
      // Broadcast cursor leaving
      cursorChannel!.postMessage({
        type: 'cursor-leave',
        browserId: BROWSER_ID,
        timestamp: Date.now()
      });
    };
    
    // Add event listeners to the actual slide container
    slideContainer.addEventListener('mousemove', handleMouseMove);
    slideContainer.addEventListener('mouseleave', handleMouseLeave);
    
    // Clean up
    return () => {
      if (slideContainer) {
        slideContainer.removeEventListener('mousemove', handleMouseMove);
        slideContainer.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, [slideId, containerRef]);
  
  // Clean up stale cursors (older than 5 seconds)
  useEffect(() => {
    const CURSOR_TIMEOUT = 30000; // 30 seconds (much more lenient for inactive tabs)
    const CLEANUP_INTERVAL = 2000; // Check every 2 seconds
    
    const interval = setInterval(() => {
      const now = Date.now();
      setRemoteCursors(prev => {
        const newCursors = { ...prev };
        let hasChanges = false;
        
        // Remove cursors older than timeout period
        Object.entries(newCursors).forEach(([id, cursor]) => {
          if (now - cursor.timestamp > CURSOR_TIMEOUT) {
            console.debug(`DirectCursors: Removing stale cursor for ${cursor.name} (${id})`);
            delete newCursors[id];
            hasChanges = true;
          }
        });
        
        return hasChanges ? newCursors : prev;
      });
    }, CLEANUP_INTERVAL);
    
    return () => clearInterval(interval);
  }, []);
  
  // Add necessary debug utilities without excessive logging
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Add WebSocket connection test function
      window.wsConnectionTest = async () => {
        const wsUrl = 'wss://slide-websocket.onrender.com/shared-test-document';
        
        const testWs = new WebSocket(wsUrl);
        testWs.onopen = () => {};
        testWs.onerror = (err) => {};
        
        // Process both binary and text messages
        testWs.onmessage = (msg) => {
          // Handle string data
          if (typeof msg.data === 'string') {
            try {
              if (msg.data.includes('"type":"cursor"')) {
                const data = JSON.parse(msg.data);
                
                // Dispatch the cursor event so DirectCursors can show it
                const customEvent = new CustomEvent('ws-cursor-message', { 
                  detail: data
                });
                document.dispatchEvent(customEvent);
              }
            } catch (e) {
              // Silent error
            }
          }
          // Handle binary data
          else if (msg.data instanceof Blob || msg.data instanceof ArrayBuffer) {
            const blobData = msg.data instanceof Blob ? msg.data : new Blob([msg.data]);
            
            // Convert blob to text to check if it's a cursor message
            blobData.text().then(text => {
              try {
                // Sometimes the binary data is actually JSON
                if (text.includes('"type":"cursor"')) {
                  // Extract JSON part if it's mixed with binary prefix
                  let jsonText = text;
                  const jsonStart = text.indexOf('{');
                  if (jsonStart > 0) {
                    jsonText = text.substring(jsonStart);
                  }
                  
                  const data = JSON.parse(jsonText);
                  
                  // Dispatch the cursor event so DirectCursors can show it
                  const customEvent = new CustomEvent('ws-cursor-message', { 
                    detail: data
                  });
                  document.dispatchEvent(customEvent);
                }
              } catch (e) {
                // Silent error
              }
            }).catch(err => {
              // Silent error
            });
          }
        };

        // Try sending a test message when connected
        testWs.addEventListener('open', () => {
          // Create a cursor message with a random position
          const randomX = Math.floor(Math.random() * 800);
          const randomY = Math.floor(Math.random() * 600);
          const testId = 'test-' + Date.now();
          
          const testMsg = JSON.stringify({
            type: 'cursor',
            clientId: 'test-websocket-' + testId,
            slideId: slideId,
            x: randomX,
            y: randomY,
            timestamp: Date.now(),
            user: {
              id: 'test-user-' + testId,
              name: 'Test WebSocket',
              color: '#ff5500'
            }
          });
          
          testWs.send(testMsg);
          
          // Send a second test cursor after a delay
          setTimeout(() => {
            if (testWs.readyState === WebSocket.OPEN) {
              const secondMsg = JSON.stringify({
                type: 'cursor',
                clientId: 'second-test-' + testId,
                slideId: slideId,
                x: randomX + 100,
                y: randomY + 100,
                timestamp: Date.now(),
                user: {
                  id: 'second-test-' + testId,
                  name: 'Second Test',
                  color: '#00bbff'
                }
              });
              
              testWs.send(secondMsg);
            }
          }, 2000);
        });
        
        return "WebSocket test started";
      };
      
      // Add a global function for direct testing of cursor messaging
      window._sendTestCursor = (slideIdToUse) => {
        const testCursorData = {
          type: 'cursor',
          clientId: `test-${Date.now()}`,
          slideId: slideIdToUse || slideId,
          x: Math.floor(Math.random() * 800), 
          y: Math.floor(Math.random() * 600),
          timestamp: Date.now(),
          user: {
            id: `test-${Math.floor(Math.random() * 1000)}`,
            name: 'Test User',
            color: getRandomBrightColor()
          }
        };
        
        // Dispatch the event to test local reception
        const customEvent = new CustomEvent('ws-cursor-message', { 
          detail: testCursorData
        });
        document.dispatchEvent(customEvent);
        
        return "Test cursor dispatched locally";
      };
      
      // Add a global function to manually add a test cursor
      window._addTestCursor = (id, x, y) => {
        setRemoteCursors(prev => ({
          ...prev,
          [id]: {
            id: id,
            color: getRandomBrightColor(id),
            name: `Test ${id}`,
            x: x || 960, // Center X (default 1920/2)
            y: y || 540, // Center Y (default 1080/2)
            timestamp: Date.now(),
            isNormalized: true,
            zoomLevel: zoomLevel
          }
        }));
        return "Test cursor added!";
      };
      
      // Add WebSocket listener for debugging
      if (window._webSocketDebugAdded !== true) {
        window._webSocketDebugAdded = true;
        
        // Use a safer approach - track WebSockets and add event listeners
        // Instead of patching the prototype
        window._trackWebSocket = (ws) => {
          // Don't add multiple listeners to the same socket
          if (!ws || (ws as any)._cursorTracking) return "Already tracking";
          (ws as any)._cursorTracking = true;
          
          // Add direct event listener to this specific WebSocket instance
          ws.addEventListener('message', (event) => {
            try {
              // Handle string data
              if (typeof event.data === 'string' && event.data.includes('"type":"cursor"')) {
                try {
                  const data = JSON.parse(event.data);
                  if (data.type === 'cursor') {
                    // Dispatch custom event to be caught by DirectCursors components
                    const customEvent = new CustomEvent('ws-cursor-message', { 
                      detail: data
                    });
                    document.dispatchEvent(customEvent);
                  }
                } catch (e) {
                  // Ignore parse errors
                }
              }
              // Handle binary data - which might contain cursor info
              else if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
                const blobData = event.data instanceof Blob ? event.data : new Blob([event.data]);
                
                // Convert blob to text to check if it's a cursor message
                blobData.text().then(text => {
                  try {
                    // Look for cursor data in binary message
                    if (text.includes('"type":"cursor"')) {
                      // Try to extract the JSON part if it's mixed with binary data
                      let jsonText = text;
                      // Find the start of the JSON object
                      const jsonStart = text.indexOf('{');
                      if (jsonStart > 0) {
                        jsonText = text.substring(jsonStart);
                      }
                      
                      const data = JSON.parse(jsonText);
                      if (data.type === 'cursor') {
                        // Dispatch custom event to be caught by DirectCursors components
                        const customEvent = new CustomEvent('ws-cursor-message', { 
                          detail: data
                        });
                        document.dispatchEvent(customEvent);
                      }
                    }
                  } catch (e) {
                    // Ignore parse errors for binary data
                  }
                }).catch(err => {
                  // Ignore errors reading binary data
                });
              }
            } catch (err) {
              // Silent error handling to avoid breaking WebSocket communication
            }
          });
          
          return "WebSocket cursor tracking added";
        };
        
        // Find and track existing WebSockets
        setTimeout(() => {
          if (window._yProviders) {
            window._yProviders.forEach(provider => {
              if (provider && provider.ws) {
                try {
                  window._trackWebSocket(provider.ws);
                } catch (err) {
                  // Silent error
                }
              }
            });
          }
        }, 1000);
      }
    }
    
    // Create a global debugging helper
    if (typeof window !== 'undefined') {
      window._inspectDirectCursors = () => {
        return {
          browserInfo: window._directCursorInfo,
          cursorPosition: window._directCursorPosition,
          remoteCursors
        };
      };
    }
  }, [slideId, remoteCursors]);
  
  // Don't render anything if there's no container
  if (!containerRef.current) return null;
  
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
  
  // Convert cursors object to array
  const activeCursors = Object.values(remoteCursors);
  
  // Get slide dimensions from the container data attributes if available
  const slideWidth = parseInt(slideContainer.dataset.slideWidth || '', 10) || DEFAULT_SLIDE_WIDTH;
  const slideHeight = parseInt(slideContainer.dataset.slideHeight || '', 10) || DEFAULT_SLIDE_HEIGHT;
  
  // Get container dimensions for denormalizing coordinates
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
      data-testid="direct-cursors-container"
      data-slide-id={slideId}
    >
      {activeCursors.map(cursor => {
        // Use the denormalization utility to properly convert from slide coordinates to screen coordinates
        // The cursor position contains normalized coordinates (in slide space 1920x1080)
        // We need to convert those back to screen coordinates considering the container size and zoom
        const { x: adjustedX, y: adjustedY } = denormalizeCursorCoordinates(
          cursor.x,
          cursor.y, 
          containerRect.width, 
          containerRect.height,
          zoomLevel // Apply zoom during rendering (denormalization)
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
            data-testid={`direct-cursor-${cursor.id}`}
            data-normalized-x={cursor.x}
            data-normalized-y={cursor.y}
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
      )})}
    </div>
  );
};

// Add global typings
declare global {
  interface Window {
    _directCursorInfo?: {
      id: string;
      color: string;
      name: string;
    };
    _directCursorPosition?: {
      slideId: string;
      x: number;
      y: number;
      timestamp: number;
      zoomLevel?: number;
    };
    _inspectDirectCursors?: () => any;
  }
}

export default DirectCursors;