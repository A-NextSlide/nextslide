import { toast } from 'sonner';
import { CompleteDeckData } from '@/types/DeckTypes';

// Force console output for WebSocket debugging
const wsLog = (...args: any[]) => {
  const originalLog = (window.console as any).log;
  if (originalLog) {
    originalLog.call(window.console, '[WS]', ...args);
  }
};

export interface RenderResponse {
  slideId: string;
  html: string;
  screenshot: string;
}

export interface WebSocketHandlers {
  onDeckReceived: (deckData: CompleteDeckData, requestId: string) => void;
  onRenderSlide: (slideIndex: number, requestId: string, options?: { debug?: boolean }) => void;
  onRenderAllSlides: (requestId: string) => void;
  onRenderMultipleSlides: (slideIndexes: number[], requestId: string) => void;
  onRenderCanceled: (requestId: string) => void;
}

export class RendererWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private handlers: WebSocketHandlers;
  private wsUrl: string;

  constructor(handlers: WebSocketHandlers, hostname: string = window.location.hostname) {
    this.handlers = handlers;
    // Use port from environment variable or default to 3334
    const wsPort = import.meta.env.VITE_WS_PORT || '3334';
    this.wsUrl = `ws://${hostname}:${wsPort}`;
    wsLog('WebSocket URL:', this.wsUrl);
  }

  connect() {
    wsLog('Attempting to connect...');
    
    // If already connected, reuse the connection
    if (this.ws?.readyState === WebSocket.OPEN) {
      wsLog('Already connected, reusing connection');
      return;
    }
    
    // Close existing connection if it exists
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        wsLog('Error closing existing connection:', e);
      }
    }
    
    // Create new connection
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;
    
    ws.onopen = () => {
      wsLog('WebSocket opened, sending renderer-ready');
      
      // Inform the server that the renderer is ready
      ws.send(JSON.stringify({ type: 'renderer-ready' }));
      
      toast.success('Connected to rendering server');
      
      // Clear any reconnect timeouts
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      
      // Set up ping interval
      this.setupPingInterval();
    };
    
    ws.onclose = (event) => {
      wsLog('WebSocket closed:', event.code, event.reason);
      toast.error('Disconnected from rendering server');
      
      // Try to reconnect after a delay
      if (!this.reconnectTimeout) {
        this.reconnectTimeout = setTimeout(() => {
          this.connect();
          this.reconnectTimeout = null;
        }, 3000);
      }
    };
    
    ws.onerror = (error) => {
      wsLog('WebSocket error:', error);
      toast.error('WebSocket connection error');
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        wsLog('Received message:', message.type, message);
        
        // Process messages based on type
        switch (message.type) {
          case 'render-deck':
            this.handlers.onDeckReceived(message.deckData, message.requestId);
            break;
            
          case 'render-slide':
            this.handlers.onRenderSlide(message.slideIndex, message.requestId, message.options);
            break;
            
          case 'render-all-slides':
            this.handlers.onRenderAllSlides(message.requestId);
            break;
            
          case 'render-multiple-slides':
            this.handlers.onRenderMultipleSlides(message.slideIndexes, message.requestId);
            break;
            
          case 'cancel-render':
          case 'render-canceled':
            this.handlers.onRenderCanceled(message.requestId);
            break;
            
          case 'ping':
            // Respond to ping with pong
            if (this.ws?.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({ type: 'pong' }));
            }
            break;
        }
      } catch (error) {
        wsLog('Error processing message:', error);
      }
    };
  }

  private setupPingInterval() {
    // Clear any existing interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    // Set up a new ping interval
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ 
            type: 'ping', 
            timestamp: Date.now() 
          }));
        } catch (e) {
          // Ignore send errors
        }
      }
    }, 30000); // Ping every 30 seconds
  }

  sendSlideRendered(requestId: string, slideIndex: number, slideId: string, renderResponse: RenderResponse) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'slide-rendered',
        requestId,
        slideIndex,
        slideId,
        renderResponse,
      }));
    }
  }

  sendDeckRendered(requestId: string, results: RenderResponse[]) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'deck-rendered',
        requestId,
        results,
      }));
    }
  }

  sendRenderError(requestId: string, slideIndex: number, error: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'slide-render-error',
        requestId,
        slideIndex,
        error,
      }));
    }
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect() {
    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    // Clear reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Close WebSocket connection
    if (this.ws) {
      try {
        this.ws.close();
        this.ws = null;
      } catch (e) {
        // Ignore close errors
      }
    }
  }
} 