import { useEffect } from 'react';
import { useActiveSlide } from '@/context/ActiveSlideContext';

// Interface for component layout messages
interface ComponentLayoutMessage {
  type: 'component-layout'; // Changed from component-position
  componentId: string;
  slideId: string;
  layout: {
    position: { x: number; y: number };
    size?: { width: number; height: number }; // Optional: for position-only updates if needed
    rotation?: number; // Optional: for position-only updates if needed
  };
  timestamp: number;
  isDragging?: boolean; // Could also mean isResizing or isRotating
}

// Extended WebSocket type for monitoring
interface ExtendedWebSocket extends WebSocket {
  _monitored?: boolean;
}

// Global registry to track component layouts and interaction state
interface RemoteComponentLayout {
  componentId: string;
  slideId: string;
  layout: {
    position: { x: number; y: number };
    size?: { width: number; height: number };
    rotation?: number;
  };
  timestamp: number;
  lastApplied?: number;
  isInteracting?: boolean; // Generic term for dragging, resizing, rotating
}

// Create a global store to track remote component layouts
if (typeof window !== 'undefined' && !window.__remoteComponentLayouts) { // Renamed
  window.__remoteComponentLayouts = new Map<string, RemoteComponentLayout>();
}

// Animation frame handler for smooth layout updates
let animationFrameId: number | null = null;
let lastLayoutUpdateAt: number = 0; // Timestamp of the most recent remote layout message

// Function to update component layouts in the DOM
function updateComponentLayoutsInDOM() { // Renamed
  if (typeof window === 'undefined' || !window.__remoteComponentLayouts) return;

  const layouts = window.__remoteComponentLayouts; // Renamed
  const now = Date.now();
  let hasUpdates = false;
  let anyInteracting = false;
  let interactionEndedFor = new Set<string>(); // Track components that stopped interacting

  layouts.forEach((componentData, componentId) => {
    let componentElement: HTMLElement | null = null;
    componentElement = document.querySelector(`[data-component-id="${componentId}"]`);
    if (!componentElement) componentElement = document.getElementById(componentId);
    if (!componentElement) componentElement = document.querySelector(`.component-wrapper[data-component-id="${componentId}"]`);

    if (componentElement instanceof HTMLElement) {
      try {
        const { position, size, rotation } = componentData.layout;
        const standardWidth = 1920;
        const standardHeight = 1080;

        // Apply position (only if changed to reduce layout thrash)
        if (position) {
          const posX = (position.x / standardWidth) * 100;
          const posY = (position.y / standardHeight) * 100;
          const leftValue = `${posX}%`;
          const topValue = `${posY}%`;
          if (componentElement.style.left !== leftValue) {
            componentElement.style.left = leftValue;
            hasUpdates = true;
          }
          if (componentElement.style.top !== topValue) {
            componentElement.style.top = topValue;
            hasUpdates = true;
          }
          const prevX = componentElement.getAttribute('data-position-x');
          const prevY = componentElement.getAttribute('data-position-y');
          if (prevX !== String(position.x)) componentElement.setAttribute('data-position-x', position.x.toString());
          if (prevY !== String(position.y)) componentElement.setAttribute('data-position-y', position.y.toString());
        }

        // Apply size
        if (size) {
          const elWidth = (size.width / standardWidth) * 100;
          const elHeight = (size.height / standardHeight) * 100;
          const widthValue = `${elWidth}%`;
          const heightValue = `${elHeight}%`;
          if (componentElement.style.width !== widthValue) {
            componentElement.style.width = widthValue;
            hasUpdates = true;
          }
          if (componentElement.style.height !== heightValue) {
            componentElement.style.height = heightValue;
            hasUpdates = true;
          }
          const prevW = componentElement.getAttribute('data-width');
          const prevH = componentElement.getAttribute('data-height');
          if (prevW !== String(size.width)) componentElement.setAttribute('data-width', size.width.toString());
          if (prevH !== String(size.height)) componentElement.setAttribute('data-height', size.height.toString());
        }

        // Apply rotation without disrupting local drag translate CSS variables
        const isLocalDragging = componentElement.getAttribute('data-is-dragging') === 'true' || document.body.classList.contains('dragging-component');
        const rotationDeg = rotation !== undefined ? rotation : 0;
        if (!isLocalDragging) {
          // Preserve existing transforms (e.g., translate via CSS vars), only replace rotate
          let currentTransform = componentElement.style.transform || "";
          // Remove existing rotate transform if present
          currentTransform = currentTransform.replace(/rotate\([^)]+\)/g, '').trim();
          // Append rotation at the end to maintain translate order
          const newTransform = `${currentTransform} rotate(${rotationDeg}deg)`.trim();
          if (componentElement.style.transform !== newTransform) {
            componentElement.style.transform = newTransform;
            hasUpdates = true;
          }
        }
        componentElement.setAttribute('data-rotation', rotationDeg.toString());

        if (componentData.isInteracting) {
          anyInteracting = true;
          componentElement.classList.add('remote-interacting'); // Generic class
        } else if (componentElement.classList.contains('remote-interacting')) {
          interactionEndedFor.add(componentId);
        }

        componentData.lastApplied = now;
        componentElement.setAttribute('data-remote-update-time', now.toString());

      } catch (err) {
        console.error(`[DOM Update] Error applying layout to component ${componentId}:`, err);
      }
    }
  });

  if (interactionEndedFor.size > 0) {
    interactionEndedFor.forEach(componentId => {
      const componentElement = document.querySelector(`[data-component-id="${componentId}"]`);
      if (componentElement instanceof HTMLElement) {
        componentElement.classList.remove('remote-interacting');
        const layoutData = window.__remoteComponentLayouts?.get(componentId);
        if (layoutData) {
          layoutData.isInteracting = false;
        }
      }
    });
  }

  // Continue the RAF loop only while there are recent updates, active interactions,
  // or very recent incoming messages. This prevents a perpetual RAF when idle.
  const recentIncoming = now - lastLayoutUpdateAt < 250;
  const shouldContinue = hasUpdates || anyInteracting || recentIncoming;
  if (shouldContinue) {
    animationFrameId = requestAnimationFrame(updateComponentLayoutsInDOM);
  } else {
    animationFrameId = null;
  }
}

/**
 * Test function to manually trigger a component position update
 */
function testComponentMove(componentId: string, slideId: string) { /* ... needs update for new layout message ... */ }

/**
 * Function to monitor WebSocket traffic by hooking into all active WebSockets
 */
function setupWebSocketMonitoring() { /* ... needs update for new layout message type ... */ }

/**
 * Hook that listens for component position updates via WebSocket
 * and applies them to the components in the current slide
 * 
 * @param enabled - Whether the hook should be active or not
 */
export function useComponentPositionSync(enabled = false) { // Consider renaming to useComponentLayoutSync
  const { updateComponent, slideId: activeSlideId } = useActiveSlide();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // window._testComponentMove = testComponentMove; // Update this test function
      // window._monitorWebSockets = setupWebSocketMonitoring; // Update this monitor
    }
    if (typeof document !== 'undefined' && !document.getElementById('remote-interaction-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'remote-interaction-styles'; // Renamed
      styleEl.textContent = `
        .remote-interacting { /* Renamed */
          transition: left 0.1s ease-out, top 0.1s ease-out, width 0.1s ease-out, height 0.1s ease-out, transform 0.1s ease-out;
          box-shadow: 0 0 0 3px rgba(50, 150, 255, 0.7) !important;
          outline: 2px solid rgba(0, 100, 255, 0.8) !important;
          opacity: 0.95 !important;
          z-index: 9999 !important;
        }
        @keyframes remoteInteractionPulse { /* Renamed */
          0% { box-shadow: 0 0 0 3px rgba(50, 150, 255, 0.7); }
          50% { box-shadow: 0 0 0 5px rgba(50, 150, 255, 0.5); }
          100% { box-shadow: 0 0 0 3px rgba(50, 150, 255, 0.7); }
        }
        .remote-interacting {
          animation: remoteInteractionPulse 0.6s ease-in-out infinite;
        }
      `;
      document.head.appendChild(styleEl);
    }
    return () => {
      // if (typeof window !== 'undefined') { delete window._testComponentMove; delete window._monitorWebSockets; }
      if (typeof document !== 'undefined') {
        const styleEl = document.getElementById('remote-interaction-styles');
        if (styleEl) styleEl.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled || !activeSlideId || !updateComponent) return;

    const handleComponentLayoutMessage = (event: MessageEvent) => { // Renamed
      try {
        let messageData: any = null;
        if (typeof event.data === 'string') {
          if (!event.data.includes('"type":"component-layout"')) return; // Updated type check
          messageData = JSON.parse(event.data);
        } else {
          // Simplified binary handling for brevity - assume text-based JSON for now
          // Production code would need robust binary decoding as before
          const textDecoder = new TextDecoder('utf-8');
          const textData = textDecoder.decode(event.data);
          if (!textData.includes('"type":"component-layout"')) return;
           const jsonStartIndex = textData.indexOf('{');
            if (jsonStartIndex >= 0) {
              const jsonData = textData.substring(jsonStartIndex);
              messageData = JSON.parse(jsonData);
            }
        }

        if (!messageData || messageData.type !== 'component-layout') return; // Updated type check
        if (messageData.slideId !== activeSlideId) return;
        
        // Skip updates if we're in the middle of switching decks
        const currentDeckId = (window as any).__currentDeckId;
        if (currentDeckId && messageData.deckId && messageData.deckId !== currentDeckId) {
          return;
        }

        if (window.__remoteComponentLayouts) { // Renamed
          window.__remoteComponentLayouts.set(messageData.componentId, {
            componentId: messageData.componentId,
            slideId: messageData.slideId,
            layout: messageData.layout, // Store the whole layout object
            timestamp: messageData.timestamp || Date.now(),
            isInteracting: messageData.isDragging !== false // or isResizing, isRotating
          });
          lastLayoutUpdateAt = Date.now();
          if (!animationFrameId) {
            animationFrameId = requestAnimationFrame(updateComponentLayoutsInDOM);
          }
        }

        setTimeout(() => {
          try {
            // Prepare updates for React state
            const reactUpdates: any = { props: { ...messageData.layout } }; // Spread position, size, rotation
            
            updateComponent(messageData.componentId, reactUpdates, true);
          } catch (err) {
            console.error('[useComponentLayoutSync] Error updating component state:', err);
          }
        }, 50);
      } catch (err) {
        console.error('[useComponentLayoutSync] Error processing message:', err);
      }
    };

    const websockets: WebSocket[] = [];
    if (typeof window !== 'undefined' && window._yProviders && Array.isArray(window._yProviders)) {
      window._yProviders.forEach(provider => {
        if (provider && provider.ws && provider.ws.readyState === WebSocket.OPEN) {
          provider.ws.addEventListener('message', handleComponentLayoutMessage);
          websockets.push(provider.ws);
        }
      });
    }
    if (typeof window !== 'undefined' && window._awareness && window._awareness.provider && window._awareness.provider.ws) {
      const ws = window._awareness.provider.ws;
      if (ws.readyState === WebSocket.OPEN && !websockets.includes(ws)) {
        ws.addEventListener('message', handleComponentLayoutMessage);
        websockets.push(ws);
      }
    }
    // if (typeof window !== 'undefined' && !window._wsMonitoringActive) setupWebSocketMonitoring(); // Update monitor

    return () => {
      websockets.forEach(ws => ws.removeEventListener('message', handleComponentLayoutMessage));
      if (animationFrameId) cancelAnimationFrame(animationFrameId); animationFrameId = null;
    };
  }, [enabled, activeSlideId, updateComponent]);

  return null;
}

// Also update global.d.ts to reflect __remoteComponentLayouts and new message/registry types 