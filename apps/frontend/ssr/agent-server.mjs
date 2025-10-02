// Minimal Agent Backend (ESM JS) for production
import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = Number(process.env.PORT || 10001);
const UPSTREAM_CHAT_URL = process.env.UPSTREAM_CHAT_URL || '';

const corsOptions = {
  origin: [
    'https://nextslide.ai',
    'https://www.nextslide.ai',
    /\.nextslide\.ai$/,
    /\.onrender\.com$/,
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
};

app.use(cors(corsOptions));
// Express 5 + path-to-regexp v8: use a RegExp for catch‑all preflight
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// In-memory session store (ephemeral)
const sessions = new Map();
const sessionSockets = new Map(); // sessionId -> Set<WebSocket>

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Health
app.get('/v1/health', (_req, res) => {
  res.json({ status: 'ok', sessions: sessions.size, upstream: Boolean(UPSTREAM_CHAT_URL) });
});

// Create session
app.post('/v1/agent/sessions', (req, res) => {
  try {
    const { deckId, slideId, metadata } = req.body || {};
    if (!deckId || !slideId) {
      return res.status(400).json({ error: 'deckId and slideId are required' });
    }
    const id = generateId('sess');
    sessions.set(id, { id, deckId, slideId, createdAt: new Date().toISOString(), metadata });
    return res.status(201).json({ session: { id, deckId, slideId } });
  } catch (e) {
    return res.status(500).json({ error: 'internal_error' });
  }
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

// WebSocket stream
wss.on('connection', (ws, req) => {
  try {
    const url = new URL(req.url || '', 'http://localhost');
    if (url.pathname !== '/v1/agent/stream') {
      ws.close(1008, 'Invalid path');
      return;
    }
    const sessionId = url.searchParams.get('sessionId') || '';
    if (!sessionId || !sessions.has(sessionId)) {
      ws.close(1008, 'Invalid session');
      return;
    }
    // Track socket per session
    if (!sessionSockets.has(sessionId)) sessionSockets.set(sessionId, new Set());
    sessionSockets.get(sessionId).add(ws);

    ws.send(JSON.stringify({ type: 'progress.update', data: { phase: 'ready', percent: 0 } }));

    ws.on('close', () => {
      try {
        const set = sessionSockets.get(sessionId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) sessionSockets.delete(sessionId);
        }
      } catch {}
    });
  } catch {
    try { ws.close(); } catch {}
  }
});

async function forwardToUpstream(text, session, extras) {
  if (!UPSTREAM_CHAT_URL) return null;
  try {
    const context = (extras && extras.context) || {};
    const selectedSlideId = context.slide_id || session.slideId;
    const currentSlideIndex = typeof context.current_slide_index === 'number' ? context.current_slide_index : 0;
    const deckData = context.deck_data || { uuid: session.deckId, slides: [] };
    const selections = extras && extras.selections ? extras.selections : undefined;
    const attachments = extras && extras.attachments ? extras.attachments : undefined;
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
  const upstream = await forwardToUpstream(text, session, { selections, attachments, context });

  // Emit minimal agentic event timeline over WS if connected
  const sockets = sessionSockets.get(sessionId);
  const broadcast = (payload) => {
    if (sockets) {
      for (const ws of sockets) {
        try { ws.send(JSON.stringify(payload)); } catch {}
      }
    }
  };

  // Plan update
  broadcast({ type: 'agent.plan.update', data: { plan: [
    { title: 'Analyze selection and context' },
    { title: 'Propose a change' },
    { title: 'Preview diff' }
  ] } });

  // Tool start/finish
  broadcast({ type: 'agent.tool.start', data: { tool: 'analyze_selection', status: 'start' } });
  setTimeout(() => {
    broadcast({ type: 'agent.tool.finish', data: { tool: 'analyze_selection', status: 'finish' } });
  }, 150);

  // Progress
  broadcast({ type: 'progress.update', data: { phase: 'planning', percent: 10 } });

  // Proposed edit (diff kept minimal to avoid client errors). If upstream diff exists, prefer it.
  const editId = generateId('edit');
  const diff = upstream && upstream.deck_diff ? upstream.deck_diff : { slides_to_update: [] };
  const summary = upstream && upstream.message ? upstream.message : `Proposed: ${text.slice(0, 64)}`;
  setTimeout(() => {
    broadcast({ type: 'deck.edit.proposed', data: { edit: { id: editId, diff, summary } } });
  }, 250);

  // Assistant streaming tokens (minimal)
  const msgId = generateId('msg');
  const reply = upstream && upstream.message ? upstream.message : `\u2728 ${text}`;
  const tokens = reply.split(/(\s+)/).filter(Boolean);
  let i = 0;
  const stream = setInterval(() => {
    if (i >= tokens.length) {
      clearInterval(stream);
      broadcast({ type: 'assistant.message.complete', data: { messageId: msgId } });
      return;
    }
    broadcast({ type: 'assistant.message.delta', data: { delta: tokens[i], messageId: msgId } });
    i += 1;
  }, 20);

  // HTTP response
  return res.status(200).json({ message: reply, timestamp: new Date().toISOString(), messageId: msgId });
});

// Apply edit (no-op)
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


