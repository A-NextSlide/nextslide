import { DeckStatus } from '@/types/DeckTypes';
import { outlineApi } from '@/services/outlineApi';
import { SSEHandler } from './SSEHandler';
import { GenerationStateManager } from './GenerationStateManager';
import { API_ENDPOINTS } from '@/config/apiEndpoints';
import { authService } from '@/services/authService';

export interface GenerationOptions {
  deckId: string;
  outline?: any;
  prompt?: string;
  slideCount?: number;
  detailLevel?: string;
  onProgress?: (event: any) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export class SlideGenerationService {
  private sseHandler: SSEHandler;
  private stateManager: GenerationStateManager;

  constructor() {
    this.sseHandler = new SSEHandler();
    this.stateManager = new GenerationStateManager();
  }

  async startGeneration(options: GenerationOptions): Promise<void> {
    const { deckId, outline, prompt, slideCount = 6, detailLevel = 'standard', onProgress, onError, onComplete } = options;

    try {
      // Determine if we need to generate outline or compose deck
      const endpoint = this.determineEndpoint(outline, prompt);
      const requestBody = this.prepareRequestBody(deckId, outline, prompt, detailLevel, slideCount);

      // Start SSE stream (prefer XHR in browser to avoid fetch buffering/closures)
      const useXHR = typeof window !== 'undefined';
      if (useXHR) {
        await this.connectStreamWithXHR(endpoint, requestBody, {
          onMessage: (event: any) => this.handleStreamEvent(event, onProgress),
          onError: onError,
          onComplete: onComplete
        });
      } else {
        await this.sseHandler.connect(endpoint, requestBody, {
          onMessage: (event) => this.handleStreamEvent(event, onProgress),
          onError: onError,
          onComplete: onComplete
        });
      }
    } catch (error) {
      onError?.(error as Error);
    }
  }

  /**
   * Connect to SSE endpoint using XHR for robust browser streaming
   */
  private async connectStreamWithXHR(
    url: string,
    body: any,
    handlers: { onMessage: (event: any) => void; onError?: (e: Error) => void; onComplete?: () => void }
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Accept', 'text/event-stream');
        xhr.setRequestHeader('Cache-Control', 'no-cache');
        const token = authService.getAuthToken();
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        let buffer = '';
        let lastIndex = 0;

        const processChunk = () => {
          const text = xhr.responseText;
          const newText = text.substring(lastIndex);
          lastIndex = text.length;
          buffer += newText;
          // Split by double newline into event blocks
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() || '';
          for (const block of blocks) {
            const lines = block.split('\n');
            for (const line of lines) {
              if (line.startsWith('data:')) {
                const data = line.slice(5).trim();
                if (!data || data === '""' || data === 'null') continue;
                try {
                  const evt = JSON.parse(data);
                  handlers.onMessage(evt);
                } catch {
                  // Non-JSON message; ignore
                }
              }
            }
          }
        };

        xhr.onprogress = processChunk;
        xhr.onreadystatechange = () => {
          if (xhr.readyState === XMLHttpRequest.DONE) {
            // Process any remaining buffered data
            try { processChunk(); } catch {}
            if (xhr.status >= 200 && xhr.status < 300) {
              handlers.onComplete?.();
            } else {
              const err = new Error(xhr.responseText || `SSE request failed (${xhr.status})`);
              handlers.onError?.(err);
            }
            resolve();
          }
        };
        xhr.onerror = () => {
          handlers.onError?.(new Error('Network error during SSE streaming'));
          resolve();
        };
        xhr.send(JSON.stringify(body));
      } catch (e: any) {
        handlers.onError?.(e instanceof Error ? e : new Error(String(e)));
        resolve();
      }
    });
  }

  private determineEndpoint(outline: any, prompt?: string): string {
    if (!outline && prompt) {
      return API_ENDPOINTS.getFullUrl(API_ENDPOINTS.GENERATE_OUTLINE_STREAM);
    }
    return API_ENDPOINTS.getFullUrl(API_ENDPOINTS.COMPOSE_DECK_STREAM);
  }

  private prepareRequestBody(
    deckId: string, 
    outline: any, 
    prompt?: string, 
    detailLevel?: string, 
    slideCount?: number
  ): any {
    if (!outline && prompt) {
      return {
        prompt,
        detailLevel,
        slideCount
      };
    }
    
    return {
      deck_id: deckId,
      outline,
      async_images: true
    };
  }

  private handleStreamEvent(event: any, onProgress?: (event: any) => void): void {
    // Log raw SSE events
    console.log('[SlideGenerationService] Raw SSE event:', event);
    
    // Pass raw event to onProgress first for slide_completed handling
    if (event.type === 'slide_completed' || event.type === 'slide_generated') {
      onProgress?.(event);
    }
    
    // Process different event types
    const processedEvent = this.stateManager.processEvent(event);
    onProgress?.(processedEvent);
  }

  async stopGeneration(): Promise<void> {
    await this.sseHandler.disconnect();
  }
} 