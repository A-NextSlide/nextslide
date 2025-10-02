/**
 * Minimal Agent Backend for Slide Sorcery
 * - Implements enough of /v1/agent/* for the frontend to work in production
 * - Optionally bridges user messages to an upstream chat API via UPSTREAM_CHAT_URL
 */
import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import fetch from 'node-fetch';

type SessionRecord = {
  id: string;
  deckId: string;
  slideId: string;
  createdAt: string;
  metadata?: Record<string, any>;
};

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = Number(process.env.PORT || 10001);
const UPSTREAM_CHAT_URL = process.env.UPSTREAM_CHAT_URL || '';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// In-memory session store (ephemeral)
const sessions = new Map<string, SessionRecord>();

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Health
app.get('/v1/health', (_req, res) => {
  res.json({ status: 'ok', sessions: sessions.size, upstream: Boolean(UPSTREAM_CHAT_URL) });
});

// Create session
app.post('/v1/agent/sessions', (req, res) => {
  const { deckId, slideId, metadata } = req.body || {};
  if (!deckId || !slideId) {
    return res.status(400).json({ error: 'deckId and slideId are required' });
  }
  const id = generateId('sess');
  const rec: SessionRecord = { id, deckId, slideId, createdAt: new Date().toISOString(), metadata };
  sessions.set(id, rec);
  return res.status(201).json({ session: { id, deckId, slideId } });
});

// SSE fallback (kept idle but open)
app.get('/v1/agent/stream/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  if (!sessions.has(sessionId)) {
    res.status(404).end();
    return;
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(`event: ready\n`);
  res.write(`data: {"ok":true}\n\n`);
  const ping = setInterval(() => {
    try { res.write(': keep-alive\n\n'); } catch {}
  }, 15000);
  req.on('close', () => clearInterval(ping));
});

// WebSocket stream (kept open; can be extended later)
wss.on('connection', (ws, req) => {
  try {
    const url = new URL(req.url || '', 'http://localhost');
    const path = url.pathname || '';
    if (path !== '/v1/agent/stream') {
      ws.close(1008, 'Invalid path');
      return;
    }
    const sessionId = url.searchParams.get('sessionId') || '';
    if (!sessionId || !sessions.has(sessionId)) {
      ws.close(1008, 'Invalid session');
      return;
    }
    // Send a light welcome event
    ws.send(JSON.stringify({ type: 'progress.update', data: { phase: 'ready', percent: 0 } }));
  } catch {
    try { ws.close(); } catch {}
  }
});

// Helper: bridge to upstream /api/chat if configured
async function forwardToUpstream(
  text: string,
  session: SessionRecord,
  extras?: { selections?: any[]; attachments?: any[]; context?: Record<string, any> }
) {
  if (!UPSTREAM_CHAT_URL) return null;
  try {
    const context = (extras && extras.context) || {};
    const selectedSlideId: string = (context as any).slide_id || session.slideId;
    const currentSlideIndex: number =
      typeof (context as any).current_slide_index === 'number' ? (context as any).current_slide_index : 0;
    const deckData: any = (context as any).deck_data || { uuid: session.deckId, slides: [] };
    const selections = extras?.selections || undefined;
    const attachments = extras?.attachments || undefined;
    const payload = {
      message: text,
      slide_id: selectedSlideId,
      current_slide_index: currentSlideIndex,
      deck_data: deckData,
      selections,
      attachments,
      chat_history: [{ role: 'user', content: text, timestamp: new Date().toISOString() }],
    };
    const resp = await fetch(UPSTREAM_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data;
  } catch {
    return null;
  }
}

// Send a user message
app.post('/v1/agent/sessions/:sessionId/messages', async (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const { text, selections, attachments, context } = req.body || {};
  if (typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'text is required' });
  }

  // Try upstream
  const upstream = await forwardToUpstream(text, session, { selections, attachments, context });
  if (upstream && typeof upstream === 'object') {
    return res.status(200).json({
      message: upstream.message || `\u2728 ${text}`,
      timestamp: upstream.timestamp || new Date().toISOString(),
      deck_diff: upstream.deck_diff || undefined,
    });
  }

  // Fallback: echo
  return res.status(200).json({
    message: `\u2728 ${text}`,
    timestamp: new Date().toISOString(),
  });
});

// Apply edit (no-op placeholder)
app.post('/v1/agent/edits/:editId/apply', (_req, res) => {
  res.status(200).json({ ok: true });
});

// Upload complete: echo back attachment
app.post('/v1/uploads/complete', (req, res) => {
  const { metadata } = req.body || {};
  if (!metadata || !metadata.name || !metadata.mimeType || !metadata.size || !metadata.url) {
    return res.status(400).json({ error: 'Invalid metadata' });
  }
  const id = generateId('att');
  res.json({ attachment: { id, mimeType: metadata.mimeType, name: metadata.name, size: metadata.size, url: metadata.url } });
});

// Root
app.get('/', (_req, res) => {
  res.json({ service: 'agent-backend', version: '0.1', ws: '/v1/agent/stream', http: '/v1/agent/sessions' });
});

server.listen(PORT, () => {
  console.log(`[agent] listening on ${PORT} (upstream: ${UPSTREAM_CHAT_URL || 'none'})`);
});


