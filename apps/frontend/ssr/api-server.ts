/**
 * API Server for Slide Renderer
 * TypeScript implementation of server.js with robust typing and ES modules support
 */

import express from 'express';
import cors from 'cors';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs/promises';
import type { CompleteDeckData } from '../src/types/DeckTypes';

// Get the current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// App configuration
const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 9090;

// Create a WebSocket server for communicating with the browser renderer
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Types
interface SlideRenderResponse {
  slideId: string;
  html: string;
  screenshot: string;
}

interface Renderer {
  ws: WebSocket;
  isAvailable: boolean;
  lastActivity: number;
}

interface PendingRequest {
  deckData: CompleteDeckData;
  slideIndexes: number[];
  results: Record<number, SlideRenderResponse>;
  timestamp: number;
  rendererId: string | null;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timeoutId?: NodeJS.Timeout;
}

// Store active renderers (WebSocket connections to browser)
const renderers = new Map<string, Renderer>();
// Store pending render requests
const pendingRequests = new Map<string, PendingRequest>();

// Connect a renderer
wss.on('connection', (ws: WebSocket) => {
  const rendererId = Date.now().toString();
  
  // Store the renderer
  renderers.set(rendererId, {
    ws,
    isAvailable: true,
    lastActivity: Date.now()
  });
  
  // Handle messages from renderer
  ws.on('message', (messageData: WebSocket.Data) => {
    try {
      const message = messageData.toString();
      const data = JSON.parse(message);
      
      if (data.type === 'renderer-ready') {
        // Process any pending requests if available
        const renderer = renderers.get(rendererId);
        if (renderer) {
          renderer.isAvailable = true;
          renderer.lastActivity = Date.now();
        }
        processPendingRequests();
      } 
      else if (data.type === 'slide-rendered' || data.type === 'deck-rendered') {
        // Find the request this belongs to
        const requestId = data.requestId;
        if (requestId && pendingRequests.has(requestId)) {
          const request = pendingRequests.get(requestId)!;
          
          // Store the result
          if (data.type === 'slide-rendered') {
            request.results[data.slideIndex] = data.renderResponse;
            
            // Check if all slides are rendered
            const allRendered = request.slideIndexes.every(
              index => request.results[index] !== undefined
            );
            
            if (allRendered) {
              // Complete the request
              if (request.resolve) {
                // Clear timeout for successful completion
                if (request.timeoutId) {
                  clearTimeout(request.timeoutId);
                }
                
                request.resolve({
                  success: true,
                  results: request.slideIndexes.map(index => request.results[index])
                });
                pendingRequests.delete(requestId);
                
                // Mark renderer as available
                const renderer = renderers.get(rendererId);
                if (renderer) {
                  renderer.isAvailable = true;
                  renderer.lastActivity = Date.now();
                }
                
                // Process next pending request if any
                processPendingRequests();
              }
            }
          } 
          else if (data.type === 'deck-rendered') {
            // Complete the request with all results
            if (request.resolve) {
              // Clear timeout for successful completion
              if (request.timeoutId) {
                clearTimeout(request.timeoutId);
              }
              
              request.resolve({
                success: true,
                results: data.results
              });
              pendingRequests.delete(requestId);
              
              // Mark renderer as available
              const renderer = renderers.get(rendererId);
              if (renderer) {
                renderer.isAvailable = true;
                renderer.lastActivity = Date.now();
              }
              
              // Process next pending request if any
              processPendingRequests();
            }
          }
        }
      }
      else if (data.type === 'slide-render-error') {
        // Handle error case
        const requestId = data.requestId;
        if (requestId && pendingRequests.has(requestId)) {
          const request = pendingRequests.get(requestId)!;
          if (request.reject) {
            // Clear timeout for error completion
            if (request.timeoutId) {
              clearTimeout(request.timeoutId);
            }
            
            request.reject(new Error(`Render error: ${data.error}`));
            pendingRequests.delete(requestId);
            
            // Mark renderer as available
            const renderer = renderers.get(rendererId);
            if (renderer) {
              renderer.isAvailable = true;
              renderer.lastActivity = Date.now();
            }
            
            // Process next pending request
            processPendingRequests();
          }
        }
      }
    } catch (error) {
      console.error('Error processing message from renderer:', error);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    renderers.delete(rendererId);
    
    // Reject any pending requests assigned to this renderer
    for (const [requestId, request] of pendingRequests.entries()) {
      if (request.rendererId === rendererId && request.reject) {
        request.reject(new Error('Renderer disconnected'));
        pendingRequests.delete(requestId);
      }
    }
  });
  
  // Ping to keep connection alive
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(interval);
    }
  }, 30000);
});

// Process pending render requests if renderers are available
function processPendingRequests(): void {
  // Find available renderer
  let availableRendererId: string | null = null;
  let oldestActivity = Infinity;
  
  for (const [id, renderer] of renderers.entries()) {
    if (renderer.isAvailable) {
      if (renderer.lastActivity < oldestActivity) {
        availableRendererId = id;
        oldestActivity = renderer.lastActivity;
      }
    }
  }
  
  if (!availableRendererId) {
    return;
  }
  
  // Find oldest pending request
  let oldestRequest: PendingRequest | null = null;
  let oldestRequestId: string | null = null;
  let oldestTimestamp = Infinity;
  
  for (const [id, request] of pendingRequests.entries()) {
    if (!request.rendererId && request.timestamp < oldestTimestamp) {
      oldestRequest = request;
      oldestRequestId = id;
      oldestTimestamp = request.timestamp;
    }
  }
  
  if (!oldestRequest || !oldestRequestId) {
    return;
  }
  
  // Assign renderer to request
  oldestRequest.rendererId = availableRendererId;
  pendingRequests.set(oldestRequestId, oldestRequest);
  
  // Mark renderer as busy
  const renderer = renderers.get(availableRendererId);
  if (!renderer) {
    return;
  }
  
  renderer.isAvailable = false;
  
  // Send request to renderer
  if (renderer.ws.readyState === WebSocket.OPEN) {
    // Send the render request with deck data first
    renderer.ws.send(JSON.stringify({
      type: 'render-deck',
      requestId: oldestRequestId,
      deckData: oldestRequest.deckData
    }));
    
    // For single slide rendering
    if (oldestRequest.slideIndexes.length === 1) {
      setTimeout(() => {
        if (renderer.ws.readyState === WebSocket.OPEN) {
          renderer.ws.send(JSON.stringify({
            type: 'render-slide',
            requestId: oldestRequestId,
            slideIndex: oldestRequest.slideIndexes[0]
          }));
        }
      }, 200); // Reduced from 1000ms - Give time for deck to load
    }
    // For multiple slides (including all slides)
    else if (oldestRequest.slideIndexes.length > 1) {
      // Check if this is all slides
      const isAllSlides = oldestRequest.slideIndexes.length === oldestRequest.deckData.slides.length;
      
      setTimeout(() => {
        if (renderer.ws.readyState === WebSocket.OPEN) {
          if (isAllSlides) {
            // Send render-all-slides for better performance
            renderer.ws.send(JSON.stringify({
              type: 'render-all-slides',
              requestId: oldestRequestId
            }));
          } else {
            // Send render-multiple-slides for partial sets
            renderer.ws.send(JSON.stringify({
              type: 'render-multiple-slides',
              requestId: oldestRequestId,
              slideIndexes: oldestRequest.slideIndexes
            }));
          }
        }
      }, 200); // Give time for deck to load
    }
  } else {
    renderers.delete(availableRendererId);
    oldestRequest.rendererId = null;
    
    // Try processing again with a different renderer
    processPendingRequests();
  }
}

// API Routes

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    renderers: renderers.size,
    pendingRequests: pendingRequests.size
  });
});

// Batch Google Slides thumbnails endpoint
app.post('/api/google/slides/thumbnails:batch', (req, res) => {
  (async () => {
    try {
      const { items, size, mime } = req.body || {};
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Request must include non-empty items array' });
      }

      // If an upstream API is configured, simply forward the request for best compatibility
      const upstreamBase = process.env.UPSTREAM_API_BASE_URL || process.env.VITE_API_URL || 'http://localhost:3001/api';
      if (upstreamBase) {
        try {
          const forward = await (globalThis as any).fetch(`${upstreamBase.replace(/\/$/, '')}/google/slides/thumbnails:batch`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(req.header('authorization') ? { 'authorization': req.header('authorization') as string } : {})
            },
            body: JSON.stringify({ items, size, mime })
          });
          const text = await forward.text();
          const contentType = forward.headers.get('content-type') || '';
          res.status(forward.status);
          if (contentType) {
            res.set('content-type', contentType);
          }
          if (contentType.includes('application/json')) {
            return res.send(text);
          }
          try {
            // If upstream didn't set JSON content-type but body is JSON, respond as JSON
            const parsed = JSON.parse(text);
            return res.json(parsed);
          } catch {
            return res.send(text);
          }
        } catch (e: any) {
          // Fall through to local concurrency implementation on forwarding failure
          console.warn('Upstream thumbnails:batch forwarding failed, using local implementation:', e?.message || e);
        }
      }

      // Cap maximum batch size to avoid overload
      const MAX_ITEMS = 200;
      const cappedItems = items.slice(0, MAX_ITEMS);

      // Defaults (favor lower size by default per request)
      const thumbnailSize: 'SMALL' | 'MEDIUM' | 'LARGE' = (size === 'LARGE' || size === 'MEDIUM' || size === 'SMALL') ? size : 'SMALL';
      const mimeType: 'PNG' | 'JPEG' = (mime === 'PNG' || mime === 'JPEG') ? mime : 'PNG';

      // Concurrency limiter
      const CONCURRENCY = 8;
      let active = 0;
      const queue: Array<() => void> = [];
      const runWithLimit = async <T>(task: () => Promise<T>): Promise<T> => {
        if (active >= CONCURRENCY) {
          await new Promise<void>(resolve => queue.push(resolve));
        }
        active++;
        try {
          return await task();
        } finally {
          active--;
          const next = queue.shift();
          if (next) next();
        }
      };

      // Build base origin to call existing single-thumbnail endpoint (proxy or upstream should route it)
      const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
      const host = req.get('host');
      const origin = `${protocol}://${host}`;

      const authHeader = req.header('authorization');
      const forwardHeaders: Record<string, string> = { 'content-type': 'application/json' };
      if (authHeader) forwardHeaders['authorization'] = authHeader;

      // Execute all requests with capped concurrency
      const results = await Promise.all(cappedItems.map((item: any, index: number) => runWithLimit(async () => {
        const { presentationId, pageId } = item || {};
        if (!presentationId || !pageId) {
          return { index, presentationId, pageId, status: 'error', error: 'Missing presentationId or pageId' };
        }

        const qs = new URLSearchParams({ size: thumbnailSize, mime: mimeType }).toString();
        const url = `${origin}/api/google/slides/${encodeURIComponent(presentationId)}/pages/${encodeURIComponent(pageId)}/thumbnail?${qs}`;

        try {
          const response = await (globalThis as any).fetch(url, { method: 'GET', headers: forwardHeaders });
          if (!response.ok) {
            const text = await response.text().catch(() => '');
            return { index, presentationId, pageId, status: 'error', error: `Upstream ${response.status}: ${text || response.statusText}` };
          }
          const data = await response.json();
          // Expecting { width, height, contentUrl }
          return { index, presentationId, pageId, status: 'ok', ...data };
        } catch (e: any) {
          return { index, presentationId, pageId, status: 'error', error: e?.message || 'Fetch failed' };
        }
      })));

      // Preserve original order
      results.sort((a: any, b: any) => a.index - b.index);
      res.json({ results });
    } catch (error: any) {
      console.error('Error in thumbnails:batch:', error);
      res.status(500).json({ error: error?.message || 'Internal server error' });
    }
  })();
});

// Image Edit endpoint (proxy to upstream if available)
app.post('/api/images/edit', (req, res) => {
  (async () => {
    try {
      const upstreamBase = process.env.UPSTREAM_API_BASE_URL || process.env.VITE_API_URL || 'http://localhost:3001/api';
      if (upstreamBase) {
        try {
          const forward = await (globalThis as any).fetch(`${upstreamBase.replace(/\/$/, '')}/images/edit`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(req.header('authorization') ? { 'authorization': req.header('authorization') as string } : {})
            },
            body: JSON.stringify(req.body || {})
          });
          const text = await forward.text();
          const contentType = forward.headers.get('content-type') || '';
          res.status(forward.status);
          if (contentType) {
            res.set('content-type', contentType);
          }
          if (contentType.includes('application/json')) {
            return res.send(text);
          }
          try {
            const parsed = JSON.parse(text);
            return res.json(parsed);
          } catch {
            return res.send(text);
          }
        } catch (e: any) {
          console.warn('Upstream /images/edit forwarding failed:', e?.message || e);
        }
      }
      // Return a mock successful response when upstream isn't available.
      // Accept both the new JSON schema and some legacy keys for compatibility.
      const body = req.body || {};
      const {
        instructions,
        imageUrl,
        imageBase64,
        transparentBackground,
        aspectRatio
      } = body;
      // Legacy fallbacks
      const legacyUrl = body.url || body.image;
      const legacyTransparency = body.transparency;

      const resolvedUrl = imageUrl || legacyUrl;
      const hasImage = Boolean(resolvedUrl || imageBase64);
      if (!hasImage) {
        return res.status(400).json({
          error: 'Ensure you POST JSON (not multipart) with camelCase keys',
          example: {
            instructions: 'remove background',
            imageUrl: 'https://your-storage/public/image.png',
            transparentBackground: true,
            aspectRatio: '16:9'
          }
        });
      }

      // Echo back an editedUrl (mock). If a data URI was supplied, just echo it.
      const edited = resolvedUrl || imageBase64;
      return res.json({
        success: true,
        editedUrl: edited,
        provider: process.env.IMAGE_PROVIDER || 'mock',
        transparentBackground: transparentBackground ?? legacyTransparency ?? false,
        aspectRatio: aspectRatio || undefined,
        instructions: instructions || undefined,
        message: 'Mock response - image edit service not available'
      });
    } catch (error: any) {
      console.error('Error in /api/images/edit:', error);
      res.status(500).json({ error: error?.message || 'Internal server error' });
    }
  })();
});

// Collaborators endpoints (temporary stub implementation)
app.get('/api/decks/:deckId/collaborators', (req, res) => {
  // Return empty collaborators list to prevent frontend errors
  res.json([]);
});

app.post('/api/decks/:deckId/collaborators', (req, res) => {
  const { email, permissions } = req.body;
  // Return a mock successful response
  res.json({
    share_link: {
      id: `mock-${Date.now()}`,
      short_code: `MOCK${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      deck_id: req.params.deckId,
      permissions: permissions || ['view', 'edit'],
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    user: {
      user_id: `mock-user-${Date.now()}`,
      email: email,
      role: 'editor'
    },
    success: true
  });
});

// Comments endpoints (temporary stub implementation)
app.get('/api/decks/:deckId/comments', (req, res) => {
  // Return empty comments list to prevent frontend errors
  res.json({ threads: [] });
});

app.post('/api/decks/:deckId/comments', (req, res) => {
  const { body, slide_id, thread_id, anchor, mentions } = req.body;
  // Return a mock comment response
  const commentId = `comment-${Date.now()}`;
  const threadIdToUse = thread_id || commentId;
  
  res.json({
    thread: {
      id: threadIdToUse,
      deck_id: req.params.deckId,
      slide_id: slide_id,
      status: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      comments: [{
        id: commentId,
        thread_id: threadIdToUse,
        deck_id: req.params.deckId,
        slide_id: slide_id,
        body: body,
        author_id: 'mock-user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]
    },
    comment: {
      id: commentId,
      thread_id: threadIdToUse,
      deck_id: req.params.deckId,
      slide_id: slide_id,
      body: body,
      author_id: 'mock-user',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  });
});

// Image Fuse endpoint (proxy to upstream if available)
app.post('/api/images/fuse', (req, res) => {
  (async () => {
    try {
      const upstreamBase = process.env.UPSTREAM_API_BASE_URL || process.env.VITE_API_URL || 'http://localhost:3001/api';
      if (upstreamBase) {
        try {
          const forward = await (globalThis as any).fetch(`${upstreamBase.replace(/\/$/, '')}/images/fuse`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(req.header('authorization') ? { 'authorization': req.header('authorization') as string } : {})
            },
            body: JSON.stringify(req.body || {})
          });
          const text = await forward.text();
          const contentType = forward.headers.get('content-type') || '';
          res.status(forward.status);
          if (contentType) {
            res.set('content-type', contentType);
          }
          if (contentType.includes('application/json')) {
            return res.send(text);
          }
          try {
            const parsed = JSON.parse(text);
            return res.json(parsed);
          } catch {
            return res.send(text);
          }
        } catch (e: any) {
          console.warn('Upstream /images/fuse forwarding failed:', e?.message || e);
        }
      }
      return res.status(501).json({ error: 'Image fuse not implemented on this server' });
    } catch (error: any) {
      console.error('Error in /api/images/fuse:', error);
      res.status(500).json({ error: error?.message || 'Internal server error' });
    }
  })();
});

// Simple HTML page to explain the API
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Slide Renderer API</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #333; }
          pre { background: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto; }
          .info { background: #e8f4ff; padding: 10px; border-radius: 5px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <h1>Slide Renderer API</h1>
        <div class="info">
          <p><strong>Status:</strong> Server is running</p>
          <p><strong>Renderers connected:</strong> ${renderers.size}</p>
          <p><strong>Pending requests:</strong> ${pendingRequests.size}</p>
        </div>
        <h2>Available Endpoints:</h2>
        <ul>
          <li><code>GET /health</code> - Health check</li>
          <li><code>GET /</code> - HTML documentation</li>
          <li><code>POST /api/render</code> - Render a full deck</li>
          <li><code>POST /api/render/:slideIndex</code> - Render a single slide</li>
        </ul>
        <h2>Usage Example:</h2>
        <pre>
fetch('/api/render', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    deckData: {
      // Your deck data here
    }
  })
})
.then(response => response.json())
.then(result => console.log(result))
        </pre>
      </body>
    </html>
  `);
});

// Render a deck
app.post('/api/render', (req, res) => {
  (async () => {
    try {
      const { deckData, slideIndexes } = req.body;
      
      if (!deckData) {
        return res.status(400).json({ error: 'Missing deckData in request body' });
      }
      
      // Validate deck data
      if (!deckData.slides || !Array.isArray(deckData.slides)) {
        return res.status(400).json({ error: 'Invalid deck data: slides array is required' });
      }
      
      // Create a promise that will be resolved when rendering is complete
      const renderResult = await createRenderRequest(deckData, slideIndexes);
      res.json(renderResult);
    } catch (error: any) {
      console.error('Error rendering deck:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  })();
});

// Render a single slide
app.post('/api/render/:slideIndex', (req, res) => {
  (async () => {
    try {
      const { deckData } = req.body;
      const slideIndex = parseInt(req.params.slideIndex, 10);
      
      if (!deckData) {
        return res.status(400).json({ error: 'Missing deckData in request body' });
      }
      
      if (isNaN(slideIndex) || slideIndex < 0) {
        return res.status(400).json({ error: 'Invalid slideIndex parameter' });
      }
      
      // Validate deck data has the requested slide
      if (!deckData.slides || !Array.isArray(deckData.slides) || !deckData.slides[slideIndex]) {
        return res.status(400).json({ error: `Slide at index ${slideIndex} does not exist` });
      }
      
      // Create a promise that will be resolved when rendering is complete
      const renderResult = await createRenderRequest(deckData, [slideIndex]);
      
      // Return only the specific slide result
      if (renderResult.success && renderResult.results && renderResult.results[0]) {
        res.json({ 
          success: true, 
          result: renderResult.results[0] 
        });
      } else {
        res.status(500).json({ error: 'Failed to render slide' });
      }
    } catch (error: any) {
      console.error('Error rendering slide:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  })();
});

// Create a render request and return a promise
function createRenderRequest(deckData: CompleteDeckData, slideIndexes?: number[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Use specific slides or all slides
    const slides = slideIndexes || [...Array(deckData.slides.length).keys()];
    
    // Create request object
    pendingRequests.set(requestId, {
      deckData,
      slideIndexes: slides,
      results: {},
      timestamp: Date.now(),
      rendererId: null,
      resolve,
      reject
    });
    
    // Check if we actually have renderers available
    if (renderers.size === 0) {
      reject(new Error('No renderers connected to the server. Please ensure the renderer page is open in a browser.'));
      pendingRequests.delete(requestId);
      return;
    }
    
    const timeoutDuration = Math.max(30000, slides.length * 5000); // Base 30s or 5s per slide, whichever is greater
    
    const timeoutId = setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        const request = pendingRequests.get(requestId)!;
        if (request.reject) {
          request.reject(new Error(`Render request timed out after ${timeoutDuration/1000} seconds`));
          pendingRequests.delete(requestId);
          
          // Free up the renderer if it's still assigned
          if (request.rendererId && renderers.has(request.rendererId)) {
            const renderer = renderers.get(request.rendererId)!;
            renderer.isAvailable = true;
            
            // Notify the renderer that the request was canceled
            try {
              if (renderer.ws.readyState === WebSocket.OPEN) {
                renderer.ws.send(JSON.stringify({
                  type: 'render-canceled',
                  requestId
                }))
              }
            } catch (e) {
              // Ignore notification errors
            }
          }
        }
      }
    }, timeoutDuration);
    
    // Store the timeout ID so we can clear it if the request completes successfully
    const request = pendingRequests.get(requestId)!;
    request.timeoutId = timeoutId;
    pendingRequests.set(requestId, request);
    
    // Process request
    processPendingRequests();
  });
}

// Start the server
server.listen(port, () => {
  console.log(`Slide renderer API server running on port ${port}`);
  console.log(`Available endpoints:`);
  console.log(`- GET /health - Health check`);
  console.log(`- GET / - HTML documentation`);
  console.log(`- POST /api/render - Render a full deck`);
  console.log(`- POST /api/render/:slideIndex - Render a single slide`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default server; 