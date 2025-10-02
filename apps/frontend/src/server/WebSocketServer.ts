/**
 * Simple and efficient WebSocket server for Yjs collaboration
 */
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';

// Core data stores
const docs = new Map<string, Y.Doc>();
const rooms = new Map<string, Set<WebSocket>>();

// Create HTTP server with simple health check
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Yjs WebSocket Server\n');
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Convert message to Uint8Array safely
function toUint8Array(message: any): Uint8Array | null {
  if (message instanceof Uint8Array) {
    return message;
  } else if (message instanceof ArrayBuffer) {
    return new Uint8Array(message);
  } else if (Buffer.isBuffer(message)) {
    return new Uint8Array(message.buffer, message.byteOffset, message.byteLength);
  } else if (typeof message === 'object' && 'data' in message) {
    return toUint8Array(message.data);
  }
  return null;
}

// Broadcast message to all clients in a room except sender
function broadcast(room: Set<WebSocket> | undefined, sender: WebSocket, message: Uint8Array | string): void {
  if (!room) return;
  
  room.forEach(client => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (err) {
        console.error('Error broadcasting message to client:', err);
      }
    }
  });
}

// Extract room name from URL - always use standardized room name for consistency
function getRoomName(): string {
  return 'shared-test-document';
}

// Check for common encoding issues in a binary update
function detectEncodingIssues(update: Uint8Array): boolean {
  // If updating awareness (cursor positions), don't check for issues
  const isAwarenessUpdate = update.length > 4 && update[0] === 1;
  if (isAwarenessUpdate) {
    return false; // Don't reject awareness updates
  }
  
  // Check for problematic start sequences
  if (update.length > 1 && update[0] === 0 && (update[1] !== 0 && update[1] !== 2)) {
    return true;
  }
  
  // Check for very small updates (less than 10 bytes)
  if (update.length < 10 && update.length > 0 && update[0] !== 0) {
    return true;
  }
  
  // Check for invalid array lengths
  // Yjs uses array length prefixing - check if the declared length exceeds actual length
  try {
    if (update.length > 8) {
      // Look at positions where length might be encoded
      for (let i = 0; i < 8; i++) {
        // Check for large values that would exceed buffer size
        if (update[i] > 200 && i + update[i] > update.length) {
          return true;
        }
      }
    }
  } catch (e) {
    return true;
  }
  
  // Check for text content that might be malformed
  try {
    // Peek at the array to see if it contains text
    const str = new TextDecoder().decode(update.slice(0, Math.min(100, update.length)));
    
    // Look for common JSON fragments that appear corrupted
    if (str.includes('{"id":"er') || 
        str.includes('"er":{"id"') || 
        (str.includes('{') && !str.includes('}')) ||
        str.includes('undefined') ||
        str.includes('NaN')) {
      return true;
    }
  } catch (e) {
    // Not text data or error in decoding, which is fine
  }
  
  return false;
}

// Create a state vector from a document for efficient syncing
function encodeStateVector(doc: Y.Doc): Uint8Array {
  return Y.encodeStateVector(doc);
}

// Create a diff between two states for efficient updates 
function encodeStateAsUpdate(doc: Y.Doc, encodedStateVector?: Uint8Array): Uint8Array {
  if (encodedStateVector) {
    return Y.encodeStateAsUpdate(doc, encodedStateVector);
  }
  return Y.encodeStateAsUpdate(doc);
}

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  ws.binaryType = 'arraybuffer';
  
  // Use standardized room name
  const roomName = getRoomName();
  console.log(`New connection to room: ${roomName}`);
  
  // Get or create document for this room
  if (!docs.has(roomName)) {
    docs.set(roomName, new Y.Doc());
  }
  const doc = docs.get(roomName)!;
  
  // Add client to room
  if (!rooms.has(roomName)) {
    rooms.set(roomName, new Set());
  }
  rooms.get(roomName)!.add(ws);
  
  // Store room information in the connection
  (ws as any).doc = doc;
  (ws as any).roomName = roomName;
  
  // Send current document state to new client
  const state = encodeStateAsUpdate(doc);
  console.log(`Sending initial state of size: ${state.byteLength} bytes to new client`);
  ws.send(state);
  
  // Handle incoming messages
  ws.on('message', (message: any) => {
    try {
      const msgLength = Buffer.isBuffer(message) ? message.length : 
                     (message instanceof ArrayBuffer ? message.byteLength : 
                     (message instanceof Uint8Array ? message.byteLength : 'unknown'));
    
      console.log(`Received message of length: ${msgLength} bytes from client`);
      
      // Check if it's a string message (cursor update)
      if (typeof message === 'string' || (message instanceof Buffer && message.toString().startsWith('{'))) {
        try {
          let jsonString = typeof message === 'string' ? message : message.toString();
          
          // Try to parse as JSON
          const data = JSON.parse(jsonString);
          
          // Handle cursor message
          if (data.type === 'cursor') {
            console.log(`Received cursor message for slide ${data.slideId} from client ${data.clientId}`);
            const roomClients = rooms.get(roomName);
            if (roomClients) {
              // Important: Make sure we're forwarding as a string, not binary data
              let stringMessage = typeof message === 'string' ? message : jsonString;
              
              // Log number of clients we'll broadcast to
              console.log(`Broadcasting cursor to ${roomClients.size - 1} other clients`);
              
              // Add a timestamp if it doesn't exist to ensure freshness
              if (!data.timestamp) {
                data.timestamp = Date.now();
                stringMessage = JSON.stringify(data);
              }
              
              // Forward the cursor message to all other clients in the room
              roomClients.forEach(client => {
                // Don't send back to the original sender
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(stringMessage);
                }
              });
            }
          }
          
          // Handle component position message
          if (data.type === 'component-position') {
            console.log(`Received component position message for component ${data.componentId} in slide ${data.slideId}`);
            const roomClients = rooms.get(roomName);
            if (roomClients) {
              // Important: Make sure we're forwarding as a string, not binary data
              let stringMessage = typeof message === 'string' ? message : jsonString;
              
              // Log number of clients we'll broadcast to
              console.log(`Broadcasting component position to ${roomClients.size - 1} other clients`);
              
              // Add a timestamp if it doesn't exist to ensure freshness
              if (!data.timestamp) {
                data.timestamp = Date.now();
                stringMessage = JSON.stringify(data);
              }
              
              // Forward the component position message to all other clients in the room
              roomClients.forEach(client => {
                // Don't send back to the original sender
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(stringMessage);
                }
              });
            }
          }
        } catch (jsonErr) {
          console.error('Error parsing JSON message:', jsonErr);
          // Not a valid JSON message, continue with binary handling
        }
      }
    
      // Convert message to Uint8Array for binary updates
      const update = toUint8Array(message);
      if (!update) return;
    
      // Check for sync request (special message format)
      if (update.length === 4 && update[0] === 0 && update[1] === 0 && update[2] === 1 && update[3] === 0) {
        // Send full state for sync
        const fullState = encodeStateAsUpdate(doc);
        ws.send(fullState);
        console.log("Sent full state in response to sync request");
        return;
      }
    
      // Basic validation to reject obviously malformed messages
      if (update.length <= 2) {
        console.log("Update too small, likely malformed");
        const fullState = encodeStateAsUpdate(doc);
        ws.send(fullState);
        return;
      }
    
      // Detect potential issues with the update
      if (detectEncodingIssues(update)) {
        console.log("Detected potential encoding issues, sending full state instead");
        const fullState = encodeStateAsUpdate(doc);
        ws.send(fullState);
        return;
      }
      
      // Special case for awareness messages (like cursor updates)
      const isAwarenessUpdate = update.length > 4 && update[0] === 1;
      
      // Create a backup of the document state before applying the update (for non-awareness updates)
      const beforeState = isAwarenessUpdate ? null : Y.encodeStateAsUpdate(doc);
      
      try {
        // Handle awareness updates differently to avoid errors
        if (isAwarenessUpdate) {
          // Fast path for awareness updates
          const roomClients = rooms.get(roomName);
          if (roomClients) {
            roomClients.forEach(client => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(update);
              }
            });
          }
        } 
        // Special handler for direct cursor messages (JSON format with binary prefix)
        else if (update.length > 10) {
          try {
            // Check if it might be a cursor message (has a binary prefix followed by JSON)
            // Look for possible JSON start after binary prefix
            const jsonStartIndex = update.findIndex((byte, i) => byte === 123 && i > 0); // 123 is '{'
            
            if (jsonStartIndex > 0) {
              // Try to extract and parse JSON part
              const jsonPart = update.slice(jsonStartIndex);
              const jsonString = new TextDecoder().decode(jsonPart);
              
              if (jsonString.includes('"type":"cursor"') || 
                  jsonString.includes('"cursor":')) {
                console.log(`Detected cursor message with binary prefix, forwarding directly`);
                
                // It's a cursor message - broadcast directly
                const roomClients = rooms.get(roomName);
                if (roomClients) {
                  roomClients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                      try {
                        client.send(update);
                      } catch (err) {
                        console.error('Error broadcasting cursor update to client:', err);
                      }
                    }
                  });
                }
                
                // Skip normal document update path
                return;
              }
            }
          } catch (err) {
            // Silent error - if we can't parse it as a cursor message, continue with normal handling
          }
        } else {
          // Apply regular document update
          Y.applyUpdate(doc, update);
          
          // Broadcast the update immediately to all clients
          const roomClients = rooms.get(roomName);
          if (roomClients) {
            roomClients.forEach(client => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                try {
                  client.send(update);
                } catch (err) {
                  console.error('Error broadcasting update to client:', err);
                }
              }
            });
          }
        }
      } catch (applyErr) {
        console.error('Error applying update:', applyErr);
        
        // If it's an awareness update, we can safely ignore errors
        if (isAwarenessUpdate) {
          console.log('Ignoring error in awareness update');
          return;
        }
        
        // For regular updates, try to restore previous state
        try {
          if (!beforeState) {
            console.error('No backup state available for restore');
            return;
          }
          
          // Reset document to previous state
          const tempDoc = new Y.Doc();
          Y.applyUpdate(tempDoc, beforeState);
          
          // Clear the current doc and apply the clean state
          doc.transact(() => {
            // Clear all previous data
            for (const [key, value] of doc.share.entries()) {
              if (value instanceof Y.Array) {
                value.delete(0, value.length);
              } else if (value instanceof Y.Map) {
                value.clear();
              }
            }
          });
          
          // Apply the clean backup state
          Y.applyUpdate(doc, beforeState);
          console.log('Restored document to previous state');
        } catch (restoreErr) {
          console.error('Failed to restore document state:', restoreErr);
          
          // If restoration fails, create a new clean document
          docs.set(roomName, new Y.Doc());
          (ws as any).doc = docs.get(roomName)!;
        }
        
        // Send full state to client for recovery
        const fullState = encodeStateAsUpdate(docs.get(roomName)!);
        ws.send(fullState);
        console.log('Sent full state to client to recover from failed update');
      }
    } catch (err) {
      console.error('Unhandled error in message processing:', err);
      
      // Send a clean state in case of any error
      try {
        const fullState = encodeStateAsUpdate(doc);
        ws.send(fullState);
      } catch (sendErr) {
        console.error('Failed to send recovery state:', sendErr);
      }
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    console.log(`Connection closed from room: ${roomName}`);
    const room = rooms.get(roomName);
    if (room) {
      room.delete(ws);
      // Clean up room if empty
      if (room.size === 0) {
        rooms.delete(roomName);
        docs.delete(roomName);
      }
    }
  });
  
  // Handle connection errors
  ws.on('error', () => {
    ws.close();
  });
});

// Start the server
const PORT = process.env.YJS_PORT ? parseInt(process.env.YJS_PORT, 10) : 1234;
server.listen(PORT, () => {
  console.log(`Yjs WebSocket server running on port ${PORT}`);
  console.log(`Room standardization: All clients will be connected to 'shared-test-document' room`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  wss.close();
  server.close(() => {
    process.exit(0);
  });
});