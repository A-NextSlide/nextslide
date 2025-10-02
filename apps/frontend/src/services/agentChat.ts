import { API_CONFIG } from '@/config/environment';

export type AgentEvent =
  | { type: 'assistant.message.delta'; data: { delta: string; messageId?: string } }
  | { type: 'assistant.message.complete'; data: { messageId: string } }
  | { type: 'agent.plan.update'; data: { plan: Array<{ title: string }> } }
  | { type: 'agent.tool.start' | 'agent.tool.finish' | 'agent.tool.error'; data: { tool: string; status: 'start'|'finish'|'error'; detail?: any } }
  | { type: 'deck.edit.proposed'; data: { edit: { id: string; diff: any; summary?: string } } }
  | { type: 'deck.edit.applied'; data: { editId: string; deckRevision?: number } }
  | { type: 'deck.preview.diff'; data: { diff: any; thumbnailUrl?: string } }
  | { type: 'progress.update'; data: { phase?: string; percent?: number } }
  | { type: 'file.request'; data: { prompt: string } }
  | { type: 'error'; data: { code: string; message: string } };

export interface AgentChatHandlers {
  onOpen?: () => void;
  onClose?: (code?: number, reason?: string) => void;
  onEvent?: (evt: AgentEvent) => void;
}

export interface SendMessagePayload {
  role: 'user';
  text: string;
  stream?: boolean;
  selections?: any[];
  // Attachments can be referenced by id, or sent with explicit metadata
  attachments?: Array<{
    attachmentId?: string;
    name?: string;
    // Prefer mimeType; keep type for backward compatibility
    mimeType?: string;
    type?: string;
    size?: number;
    url?: string;
  }>;
  // Optional context hints for the agent (e.g., style copy and insert position)
  context?: Record<string, any>;
}

/**
 * Minimal client for the Agentic Chat backend.
 */
export class AgentChatClient {
  private sessionId: string | null = null;
  private ws: WebSocket | null = null;
  private es: EventSource | null = null;
  private handlers: AgentChatHandlers;
  private authToken?: string;
  private readyPromise: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;
  private resolvedBaseUrl: string | null = null;

  constructor(handlers: AgentChatHandlers = {}, authToken?: string) {
    this.handlers = handlers;
    this.authToken = authToken;
  }

  private getBaseUrl(): string {
    const base = (this.resolvedBaseUrl || API_CONFIG.AGENT_BASE_URL || '').trim();
    return base.replace(/\/$/, '');
  }

  private getApiBase(): string {
    return this.getBaseUrl();
  }

  private markReady() {
    if (this.resolveReady) {
      this.resolveReady();
      this.resolveReady = null;
    }
  }

  private getReady(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = new Promise<void>((resolve) => {
        this.resolveReady = resolve;
      });
    }
    return this.readyPromise;
  }

  async createSession(deckId: string, slideId: string, metadata?: Record<string, any>): Promise<string> {
    const base = (API_CONFIG.AGENT_BASE_URL || '').replace(/\/$/, '');
    if (!base) throw new Error('AGENT_BASE_URL not configured');
    // Only call the canonical Python agent endpoint path. Allow a single trailing-slash retry.
    const urlNoSlash = `${base}/v1/agent/sessions`;
    const requestInit: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      },
      body: JSON.stringify({ deckId, slideId, metadata: metadata || { agentProfile: 'authoring' } }),
    };
    const res = await fetch(urlNoSlash, requestInit);
    if (!res.ok) throw new Error(`createSession failed: ${res.status}`);
    const json = await res.json();
    this.sessionId = json.session?.id ?? null;
    this.resolvedBaseUrl = base;
    return this.sessionId!;
  }

  openWebSocket(): void {
    if (!this.sessionId) throw new Error('openWebSocket called before createSession');
    // Compose WS URL by replacing http(s) with ws(s)
    const base = this.getApiBase();
    const wsBase = base.replace(/^http/, 'ws');
    const q = new URLSearchParams({ sessionId: this.sessionId });
    if (this.authToken) q.set('token', this.authToken);
    const url = `${wsBase}/v1/agent/stream?${q.toString()}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      try { console.log('[AgentChatClient] WS open', { url }); } catch {}
      this.handlers.onOpen?.();
      this.markReady();
    };
    ws.onclose = (e) => {
      try { console.log('[AgentChatClient] WS close', { code: e.code, reason: e.reason }); } catch {}
      this.handlers.onClose?.(e.code, e.reason);
      // Fallback to SSE if WS closes unexpectedly
      if (!this.es) this.openSSE();
    };
    ws.onerror = () => {
      try { console.warn('[AgentChatClient] WS error'); } catch {}
      this.handlers.onEvent?.({ type: 'error', data: { code: 'WS_ERROR', message: 'WebSocket error' } });
      // Fallback to SSE if WS errors
      if (!this.es) this.openSSE();
    };
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg && msg.type) {
          try { console.log('[AgentChatClient] WS message', { type: msg.type }); } catch {}
          this.handlers.onEvent?.({ type: msg.type, data: msg.data });
        }
      } catch (e) {
        this.handlers.onEvent?.({ type: 'error', data: { code: 'PARSE', message: 'Failed to parse WS message' } });
      }
    };
  }

  private openSSE() {
    if (!this.sessionId) return;
    const base = this.getApiBase();
    const q = new URLSearchParams();
    if (this.authToken) q.set('token', this.authToken);
    const url = `${base}/v1/agent/stream/${this.sessionId}${q.size ? `?${q.toString()}` : ''}`;
    try {
      const es = new EventSource(url);
      this.es = es;
      try { console.log('[AgentChatClient] SSE open', { url }); } catch {}
      // Resolve readiness on SSE open as well
      es.onopen = () => {
        this.markReady();
      };
      es.onmessage = (e) => {
        if (!e.data) return;
        try {
          const msg = JSON.parse(e.data);
          if (msg && msg.type) {
            try { console.log('[AgentChatClient] SSE message', { type: msg.type }); } catch {}
            this.handlers.onEvent?.({ type: msg.type, data: msg.data });
          }
        } catch {}
      };
      es.onerror = () => {
        try { es.close(); } catch {}
        this.es = null;
        // attempt reconnect
        setTimeout(() => this.openSSE(), 2000);
      };
    } catch {}
  }

  // Ensure at least one stream is open before sending messages
  async connectAndWait(): Promise<void> {
    // If neither WS nor SSE is open, open WS and wait
    const wsOpen = this.ws && this.ws.readyState === WebSocket.OPEN;
    const sseOpen = !!this.es; // EventSource has no readyState; onopen will resolve
    if (!wsOpen && !sseOpen) {
      this.openWebSocket();
    }
    await this.getReady();
  }

  sendWsCommand(command: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(command));
    }
  }

  async sendMessage(payload: SendMessagePayload): Promise<{ messageId?: string }> {
    if (!this.sessionId) throw new Error('sendMessage called before createSession');
    const url = `${this.getApiBase()}/v1/agent/sessions/${this.sessionId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`sendMessage failed: ${res.status}`);
    return res.json();
  }

  /**
   * Register a completed file upload with the backend so it can be referenced as an attachment.
   * Returns the created attachment record (including id and url).
   */
  async registerUploadComplete(metadata: {
    sessionId: string;
    name: string;
    mimeType: string;
    size: number;
    url: string;
  }): Promise<{ attachment: { id: string; mimeType: string; name: string; size: number; url: string } }> {
    const base = this.getApiBase();
    const url = `${base}/v1/uploads/complete`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      },
      body: JSON.stringify({ metadata }),
    });
    if (!res.ok) throw new Error(`registerUploadComplete failed: ${res.status}`);
    return res.json();
  }

  async applyEdit(editId: string): Promise<void> {
    if (!this.sessionId) throw new Error('applyEdit called before createSession');
    // Prefer WS command; fallback to HTTP
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendWsCommand({ type: 'client.apply_edit', editId });
      return;
    }
    const url = `${this.getApiBase()}/v1/agent/edits/${editId}/apply`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`applyEdit failed: ${res.status}`);
  }

  disconnect() {
    if (this.ws) try { this.ws.close(); } catch {}
    this.ws = null;
    if (this.es) try { this.es.close(); } catch {}
    this.es = null;
  }
}

export default AgentChatClient;
