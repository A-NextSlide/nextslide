/**
 * Separate server-side cursor tracking system
 * This completely bypasses the Yjs awareness protocol
 */
import { WebSocket } from 'ws';

// Store cursor positions by room and client
const cursorPositions = new Map<string, Map<string, {
  x: number;
  y: number;
  slideId: string;
  name: string;
  color: string;
}>>();

/**
 * Handle a cursor update message from a client
 */
export function handleCursorMessage(
  message: string,
  roomName: string,
  ws: WebSocket,
  roomClients: Set<WebSocket>
): boolean {
  try {
    // Validate it's a cursor message
    if (!message.includes('"type":"cursor"')) {
      return false;
    }
    
    // Parse the message
    const data = JSON.parse(message);
    
    if (data.type !== 'cursor') {
      return false;
    }
    
    // Extract cursor data
    const { clientId, x, y, slideId, name, color } = data;
    
    // Store the cursor position
    if (!cursorPositions.has(roomName)) {
      cursorPositions.set(roomName, new Map());
    }
    
    const roomCursors = cursorPositions.get(roomName)!;
    roomCursors.set(clientId, { 
      x: Math.floor(x || 0),
      y: Math.floor(y || 0),
      slideId: String(slideId || ''),
      name: String(name || 'Anonymous'),
      color: String(color || '#ff0000')
    });
    
    // Broadcast to other clients
    roomClients.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (err) {
          console.error('Error sending cursor update to client');
        }
      }
    });
    
    return true;
  } catch (err) {
    console.error('Error processing cursor message');
    return false;
  }
}

/**
 * Remove a client's cursor when they disconnect
 */
export function removeCursor(clientId: string, roomName: string): void {
  const roomCursors = cursorPositions.get(roomName);
  if (roomCursors) {
    roomCursors.delete(clientId);
    
    // Clean up empty rooms
    if (roomCursors.size === 0) {
      cursorPositions.delete(roomName);
    }
  }
}

/**
 * Get all cursors for a room
 */
export function getRoomCursors(roomName: string): Array<{
  clientId: string;
  x: number;
  y: number;
  slideId: string;
  name: string;
  color: string;
}> {
  const roomCursors = cursorPositions.get(roomName);
  if (!roomCursors) {
    return [];
  }
  
  return Array.from(roomCursors.entries()).map(([clientId, data]) => ({
    clientId,
    ...data
  }));
}