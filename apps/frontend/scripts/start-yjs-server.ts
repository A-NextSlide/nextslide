/**
 * Script to start the Yjs WebSocket server
 *
 * This script launches a simple WebSocket server for Yjs real-time collaboration.
 * Usage: npm run yjs-server
 * 
 * The server handles:
 * - WebSocket connections for Yjs clients
 * - Document synchronization between clients
 * - Automatic error recovery
 */
import '../src/server/WebSocketServer';