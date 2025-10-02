import { authService } from '@/services/authService';

/**
 * Server-Sent Events handler for managing streaming connections
 */
export interface SSEOptions {
  onMessage: (event: any) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

export class SSEHandler {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private decoder = new TextDecoder();
  private buffer = '';
  private abortController: AbortController | null = null;
  private maxRetries = 1; // Allow one retry with refreshed token

  async connect(url: string, body: any, options: SSEOptions, retryCount = 0): Promise<void> {
    try {
      this.abortController = new AbortController();
      
      const token = authService.getAuthToken();
      
      const response = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        // Handle 401 errors by attempting token refresh
        if (response.status === 401 && retryCount < this.maxRetries) {
          
          try {
            const newToken = await authService.refreshToken();
            if (newToken) {
              // Retry the connection with the new token
              return this.connect(url, body, options, retryCount + 1);
            }
          } catch (refreshError) {
            console.error('[SSEHandler] Token refresh failed:', refreshError);
          }
        }
        
        const errorMessage = await this.parseErrorResponse(response);
        throw new Error(errorMessage);
      }

      if (!response.body) {
        throw new Error('No response body available for streaming');
      }

      this.reader = response.body.getReader();
      await this.readStream(options);
    } catch (error) {
      if (error.name !== 'AbortError') {
        // Don't trigger hard logouts on authentication errors
        // Let the auth context handle it gracefully
        if (error instanceof Error && error.message.includes('401')) {
          console.error('[SSEHandler] Authentication error during SSE connection:', error.message);
          // Wrap the error to make it clear it's an auth issue but don't force logout
          options.onError?.(new Error('Session expired. Please refresh the page and try again.'));
        } else {
          options.onError?.(error as Error);
        }
      }
    }
  }

  private async readStream(options: SSEOptions): Promise<void> {
    if (!this.reader) return;

    try {
      while (true) {
        const { done, value } = await this.reader.read();
        
        if (done) {
          options.onComplete?.();
          break;
        }

        const chunk = this.decoder.decode(value, { stream: true });
        this.buffer += chunk;
        
        const events = this.parseEvents();
        for (const event of events) {
          options.onMessage(event);
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        options.onError?.(error as Error);
      }
    } finally {
      this.cleanup();
    }
  }

  private parseEvents(): any[] {
    const events: any[] = [];
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const message = line.slice(6);
        
        // Try to parse as JSON first
        if (message.startsWith('{')) {
          try {
            const parsed = JSON.parse(message);
            
            // Log slide events specifically
            if (parsed.type === 'slide_completed' || parsed.type === 'slide_generated') {
              console.log('[SSEHandler] Slide event received:', {
                type: parsed.type,
                slide_index: parsed.slide_index,
                has_slide_data: !!parsed.slide,
                components: parsed.slide?.components?.length
              });
            }
            
            events.push(parsed);
          } catch {
            // If not JSON, treat as plain text
            events.push({ type: 'message', message });
          }
        } else {
          // Plain text message
          events.push({ type: 'message', message });
        }
      }
    }

    return events;
  }

  private async parseErrorResponse(response: Response): Promise<string> {
    let errorMessage = 'Failed to start generation';
    
    try {
      const errorData = await response.json();
      
      if (errorData.detail) {
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail
            .map((err: any) => typeof err === 'string' ? err : err.msg || err.message || JSON.stringify(err))
            .join(', ');
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        } else {
          errorMessage = JSON.stringify(errorData.detail);
        }
      } else if (errorData.message) {
        errorMessage = errorData.message;
      } else if (errorData.error) {
        errorMessage = errorData.error;
      }
    } catch {
      const errorText = await response.text();
      if (errorText) {
        errorMessage = errorText;
      }
    }

    return `${errorMessage} (${response.status})`;
  }

  async disconnect(): Promise<void> {
    this.abortController?.abort();
    this.cleanup();
  }

  private cleanup(): void {
    this.reader?.cancel();
    this.reader = null;
    this.buffer = '';
    this.abortController = null;
  }
} 