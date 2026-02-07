/**
 * Simple WebSocket server for Render deployment (ES Module version)
 */
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';

// Create HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Yjs WebSocket Server\n');
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Use Render's assigned PORT or fallback to default
const PORT = process.env.PORT || 10000;
const LOG_WS_MESSAGES = process.env.LOG_WS_MESSAGES === '1';

// Room-based client registry (room = deck id from URL path)
const rooms = new Map();

function getRoomId(urlPath) {
  const safePath = typeof urlPath === 'string' ? urlPath : '/';
  const pathname = safePath.split('?')[0] || '/';
  const room = pathname.replace(/^\/+/, '');
  return room || 'default';
}

function ensureRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  return rooms.get(roomId);
}

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  const roomId = getRoomId(req?.url);
  const room = ensureRoom(roomId);
  room.add(ws);
  ws._roomId = roomId;
  console.log(`[ws] connected room=${roomId} peers=${room.size}`);

  // Handle messages
  ws.on('message', (message, isBinary) => {
    try {
      if (LOG_WS_MESSAGES) {
        if (isBinary) {
          const bytes = Buffer.isBuffer(message)
            ? message.length
            : (message?.byteLength ?? 0);
          const firstByte = Buffer.isBuffer(message) && bytes > 0
            ? message[0]
            : undefined;
          console.log(`[ws] message room=${roomId} binary bytes=${bytes} firstByte=${firstByte ?? 'n/a'}`);
        } else {
          const text = Buffer.isBuffer(message) ? message.toString('utf8') : String(message);
          const preview = text.length > 120 ? `${text.slice(0, 120)}...` : text;
          console.log(`[ws] message room=${roomId} text=${preview}`);
        }
      }

      // Broadcast to all other clients in the same room only
      room.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    } catch (err) {
      console.error(`[ws] error handling message room=${roomId}:`, err);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    const currentRoom = ws._roomId || roomId;
    const clients = rooms.get(currentRoom);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        rooms.delete(currentRoom);
      }
    }
    console.log(`[ws] disconnected room=${currentRoom} peers=${clients?.size ?? 0}`);
  });

  ws.on('error', (err) => {
    console.error(`[ws] socket error room=${roomId}:`, err);
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
