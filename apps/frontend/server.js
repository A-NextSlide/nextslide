/**
 * Simple WebSocket server for Render deployment (ES Module version)
 */
import http from 'http';
import { WebSocketServer } from 'ws';

// Create HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Yjs WebSocket Server\n');
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Use Render's assigned PORT or fallback to default
const PORT = process.env.PORT || 10000;

// Simple in-memory storage for demo purposes
const connectedClients = new Set();

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('New client connected');
  connectedClients.add(ws);
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to Yjs WebSocket Server',
    timestamp: new Date().toISOString()
  }));
  
  // Handle messages
  ws.on('message', (message) => {
    try {
      console.log(`Received message: ${message}`);
      
      // Broadcast to all clients
      connectedClients.forEach(client => {
        if (client !== ws && client.readyState === 1) { // WebSocket.OPEN = 1
          client.send(message);
        }
      });
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    console.log('Client disconnected');
    connectedClients.delete(ws);
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});