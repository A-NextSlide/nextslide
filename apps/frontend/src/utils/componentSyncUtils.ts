/**
 * Send component layout update over WebSocket.
 * This function is intended to be used by various interaction hooks (drag, resize, rotate).
 */
export function sendComponentLayoutUpdate(
  componentId: string,
  slideId: string,
  layout: {
    position: { x: number; y: number };
    size?: { width: number; height: number };
    rotation?: number;
  },
  isInteracting: boolean = true
) {
  if (!componentId || !slideId || !layout) return false;

  let success = false;
  if (typeof window !== 'undefined' && window._yProviders && Array.isArray(window._yProviders)) {
    window._yProviders.forEach(provider => {
      if (provider && provider.ws && provider.ws.readyState === WebSocket.OPEN) {
        try {
          const message = JSON.stringify({
            type: 'component-layout',
            componentId,
            slideId,
            layout,
            timestamp: Date.now(),
            isDragging: isInteracting // isDragging is the current field in the message, isInteracting is the new concept
          });
          provider.ws.send(message);
          success = true;
        } catch (err) {
          console.error(`[componentSyncUtils] Error sending layout update for ${componentId}:`, err);
        }
      }
    });
  }
  return success;
} 