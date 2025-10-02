// Fixed duplicate generation bug - 2025-07-24T01:38:00.000Z
// DEPRECATED: Use GenerationCoordinator instead for all new generation flows
import { DeckOutline } from '@/types/SlideTypes';
import { authService } from './authService';
import { API_CONFIG } from '@/config/environment';
import { useDeckStore } from '@/stores/deckStore';
import { v4 as uuidv4 } from 'uuid';

interface DeckGenerationOptions {
  outline: DeckOutline;
  stylePreferences?: any;
  onProgress?: (event: any) => void;
  signal?: AbortSignal;
}

interface GenerationResult {
  deckId: string;
  deckUrl: string;
}

// Global state outside class to persist across any potential re-instantiation
const GLOBAL_GENERATION_STATE = {
  activeGenerations: new Map<string, { requestId: string; startTime: number }>(),
  maxConcurrentGenerations: 3, // Allow up to 3 parallel deck generations
  lastGenerationTime: 0
};

/**
 * @deprecated Use GenerationCoordinator instead for better duplicate prevention and centralized state management
 */
class DeckGenerationService {
  private activeRequests = new Map<string, string>();
  private globalGenerations = new Map<string, string>();
  public static instance: DeckGenerationService;
  private lastGenerationTime = 0;

  /**
   * Check if a generation request is valid and not a duplicate
   */
  validateRequest(outline: DeckOutline | null): { isValid: boolean; error?: string } {
    if (!outline) {
      return { isValid: false, error: "No outline data available to generate a presentation." };
    }

    const outlineSignature = this.getOutlineSignature(outline);
    
    // Check if this exact outline is already being processed
    if (this.globalGenerations.has(outlineSignature)) {
      return { isValid: false, error: "This outline is already being generated." };
    }

    return { isValid: true };
  }

  /**
   * Generate a unique signature for an outline to prevent duplicates
   */
  private getOutlineSignature(outline: DeckOutline): string {
    // Create a more detailed signature that includes slide content
    const signature = {
      title: outline.title,
      slideCount: outline.slides.length,
      slideIds: outline.slides.map(s => s.id).sort(), // Sort to ensure consistent order
      slideTitles: outline.slides.map(s => s.title).sort(),
      // Include first 100 chars of each slide content to detect content changes
      slideContentHashes: outline.slides.map(s => 
        s.content ? s.content.substring(0, 100) : 'empty'
      ).sort()
    };
    return JSON.stringify(signature);
  }

  /**
   * Convert File/Blob to Base64 string
   */
  private async fileToBase64(file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  }

  /**
   * Process tagged media to convert File/Blob content to base64
   */
  private async processTaggedMedia(media: any): Promise<any> {
    let content = media.content;
    if (media.content instanceof File || media.content instanceof Blob) {
      content = await this.fileToBase64(media.content);
    }
    
    return {
      ...media,
      content
    };
  }

  /**
   * Convert outline to API format
   */
  async prepareOutlineForAPI(outline: DeckOutline, stylePreferences?: any): Promise<any> {
    const processedSlides = await Promise.all(outline.slides.map(async slide => {
      let processedTaggedMedia = [];
      if (slide.taggedMedia && slide.taggedMedia.length > 0) {
        processedTaggedMedia = await Promise.all(
          slide.taggedMedia.map(media => this.processTaggedMedia(media))
        );
      }
      
      // For manual mode, include chart data from slide
      const chartData = (outline as any).isManualMode && slide.chartData ? {
        chart_type: slide.chartType,
        data: slide.chartData.data,
        title: slide.chartData.title || slide.title
      } : slide.extractedData ? {
        chart_type: slide.extractedData.chartType,
        data: slide.extractedData.data,
        title: slide.title
      } : undefined;
      
      return {
        id: slide.id,
        title: slide.title,
        slide_type: 'content',
        content: slide.content,
        narrative_role: 'supporting',
        speaker_notes: '',
        chart_data: chartData,
        taggedMedia: processedTaggedMedia,
        // Mark as manual content to preserve exactly
        is_manual_content: (outline as any).isManualMode || false
      };
    }));

    // Collect all tagged media for uploadedMedia field
    const allMedia = [];
    for (const slide of outline.slides) {
      if (slide.taggedMedia && slide.taggedMedia.length > 0) {
        for (const media of slide.taggedMedia) {
          const processedMedia = await this.processTaggedMedia(media);
          allMedia.push(processedMedia);
        }
      }
    }

    return {
      ...outline,
      id: outline.id || uuidv4(),
      title: outline.title,
      topic: outline.title,
      tone: 'professional',
      narrative_arc: 'Standard presentation flow',
      slides: processedSlides,
      metadata: {
        depth: 'standard',
        generation_time: new Date().toISOString(),
        slide_count: outline.slides.length,
        is_manual_mode: (outline as any).isManualMode || false
      },
      narrative_flow: outline.narrativeFlow || null,
      uploadedMedia: allMedia.length > 0 ? allMedia : null,
      is_manual_mode: (outline as any).isManualMode || false
    };
  }

  /**
   * Process a stream event
   */
  private processStreamEvent(event: any, deckState: { deckId: string; deckUrl: string }) {
    
    switch (event.type) {
      case 'deck_created':
        if (event.deck_uuid || event.deck_id) {
          deckState.deckId = event.deck_uuid || event.deck_id;
          deckState.deckUrl = event.deck_url || `/deck/${deckState.deckId}`;
        }
        break;
        
      case 'data':
        if (event.stage === 'deck_init' && event.data?.deck_id) {
          deckState.deckId = event.data.deck_id;
        }
        break;
        
      case 'complete':
        if (event.data?.deck_id) {
          deckState.deckId = event.data.deck_id;
        }
        if (event.data?.deck_url) {
          deckState.deckUrl = event.data.deck_url;
        }
        break;
        
      case 'error':
        console.error('[DeckGenerationService] Error event:', event.message || event.error);
        throw new Error(event.message || event.error || 'Deck creation failed');
        
      case 'images_ready_for_selection':
        if (event.data) {
          window.dispatchEvent(new CustomEvent('images_ready_for_selection', {
            detail: {
              deck_uuid: event.data.deck_uuid,
              deck_id: event.data.deck_id,
              total_images_available: event.data.total_images_available,
              slides_with_images: event.data.slides_with_images
            }
          }));
        }
        break;
        
      case 'heartbeat':
        // Handle heartbeat events from backend to prevent timeout
        // The heartbeat resets the timeout by continuing the stream reading
        break;
        
      default:
    }
  }

  /**
   * Process the response stream
   */
  private async processStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    onProgress?: (event: any) => void
  ): Promise<GenerationResult> {
    const decoder = new TextDecoder();
    let buffer = '';
    const deckState = { deckId: '', deckUrl: '' };
    let streamComplete = false;
    let lastEventTime = Date.now();
    // Extend overall inactivity timeout to accommodate longer theme/deck generation
    const STREAM_TIMEOUT = 10 * 60 * 1000; // 10 minutes

    try {
      while (true) {
        // Add timeout to read operation with increased timeout
        const READ_TIMEOUT = 120000; // 120 seconds per read
        const readPromise = reader.read();
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Stream read timeout')), READ_TIMEOUT);
        });
        
        const { done, value } = await Promise.race([readPromise, timeoutPromise]);
        
        // Check for overall timeout
        if (Date.now() - lastEventTime > STREAM_TIMEOUT) {
          console.error('[DeckGenerationService] Stream timeout - no events for 2 minutes');
          throw new Error('Stream timeout - deck generation took too long');
        }
        
        if (done) {
          streamComplete = true;
          break;
        }
        
        lastEventTime = Date.now();
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            
            if (data === '[DONE]') {
              streamComplete = true;
              break;
            }
            
            if (data === '') {
              continue;
            }
            
            try {
              const event = JSON.parse(data);
              
              if (onProgress) {
                onProgress(event);
              }
              
              this.processStreamEvent(event, deckState);
              
              // Check for completion event
              if (event.type === 'complete' || event.type === 'stream_complete') {
                streamComplete = true;
              }
            } catch (parseError) {
            }
          }
        }
        
        if (streamComplete) {
          break;
        }
      }
    } catch (error) {
      console.error('[DeckGenerationService] Error reading stream:', error);
      throw error;
    } finally {
      // Ensure reader is properly closed
      try {
        await reader.cancel();
      } catch (e) {
        // Ignore cancellation errors
      }
    }


    if (!deckState.deckId) {
      throw new Error('Deck creation completed but no deck ID received');
    }

    return { deckId: deckState.deckId, deckUrl: deckState.deckUrl };
  }

  /**
   * Generate a deck from an outline
   */
  async generateDeck(options: DeckGenerationOptions): Promise<GenerationResult> {
    const { outline, stylePreferences, onProgress, signal } = options;
    
    // Log the call with timestamp and stack trace - FIXED DUPLICATE BUG
    
    // Check if we've reached the concurrent generation limit
    if (GLOBAL_GENERATION_STATE.activeGenerations.size >= GLOBAL_GENERATION_STATE.maxConcurrentGenerations) {
      throw new Error(`Maximum concurrent generations (${GLOBAL_GENERATION_STATE.maxConcurrentGenerations}) reached. Please wait for a deck to complete.`);
    }
    
    // Check time-based rate limiting (minimum 1 second between generation starts)
    const now = Date.now();
    const timeSinceLastGeneration = now - this.lastGenerationTime;
    if (timeSinceLastGeneration < 1000) {
      throw new Error('Please wait a moment before generating another deck.');
    }
    
    // Validate request
    const validation = this.validateRequest(outline);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const outlineSignature = this.getOutlineSignature(outline);
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    
    // Check if this specific outline is already being generated
    if (this.globalGenerations.has(outlineSignature) || GLOBAL_GENERATION_STATE.activeGenerations.has(outlineSignature)) {
      throw new Error('This outline is already being generated.');
    }
    
    // Mark this specific outline as generating
    this.globalGenerations.set(outlineSignature, requestId);
    this.lastGenerationTime = Date.now();
    GLOBAL_GENERATION_STATE.activeGenerations.set(outlineSignature, { requestId, startTime: now });
    GLOBAL_GENERATION_STATE.lastGenerationTime = Date.now();
    
    try {
      // Log tagged media before processing
      outline.slides.forEach((slide, index) => {
        if (slide.taggedMedia && slide.taggedMedia.length > 0) {
        }
      });
      
      // Prepare the outline for API
      const outlineForAPI = await this.prepareOutlineForAPI(outline, stylePreferences);
      
      // Log tagged media after processing
      outlineForAPI.slides.forEach((slide: any, index: number) => {
        if (slide.taggedMedia && slide.taggedMedia.length > 0) {
        }
      });
      
      const requestBody = {
        outline: outlineForAPI,
        style_preferences: {
          visual_style: 'modern',
          font_style: outline.stylePreferences?.font || stylePreferences?.font || 'modern',
          content_density: 'normal',
          use_ai_palette: true,
          colors: outline.stylePreferences?.colors || stylePreferences?.colors
        },
        async_images: true
      };
      
      
      // Make the API request
      const response = await fetch(`${API_CONFIG.BASE_URL}/deck/create-from-outline`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(authService.getAuthToken() ? { 'Authorization': `Bearer ${authService.getAuthToken()}` } : {})
        },
        body: JSON.stringify(requestBody),
        signal
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        
        // Handle 401 with token refresh
        if (response.status === 401) {
          
          const newToken = await authService.refreshToken();
          if (newToken) {
            // Retry with new token
            const retryResponse = await fetch(`${API_CONFIG.BASE_URL}/deck/create-from-outline`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${newToken}`
              },
              body: JSON.stringify(requestBody),
              signal
            });
            
            if (!retryResponse.ok) {
              const retryErrorText = await retryResponse.text();
              throw new Error(`Deck creation failed after token refresh: ${retryResponse.status} - ${retryErrorText}`);
            }
            
            return this.processStream(retryResponse.body!.getReader(), onProgress);
          } else {
            throw new Error('Session expired. Please refresh the page and try again.');
          }
        }
        
        throw new Error(`Deck creation failed: ${response.status} - ${errorText}`);
      }
      
      if (!response.body) {
        throw new Error('No response body available for streaming');
      }
      
      // Process the stream
      return await this.processStream(response.body.getReader(), onProgress);
      
    } finally {
      // Clean up this specific outline from active generations
      this.globalGenerations.delete(outlineSignature);
      GLOBAL_GENERATION_STATE.activeGenerations.delete(outlineSignature);
    }
  }

  /**
   * Reset the deck store
   */
  resetDeckStore() {
    const deckStoreState = useDeckStore.getState();
    if (deckStoreState.resetStore) {
      deckStoreState.resetStore();
    }
  }

  /**
   * Get the current number of active deck generations
   */
  getActiveGenerationCount(): number {
    return GLOBAL_GENERATION_STATE.activeGenerations.size;
  }

  /**
   * Get the maximum concurrent generations allowed
   */
  getMaxConcurrentGenerations(): number {
    return GLOBAL_GENERATION_STATE.maxConcurrentGenerations;
  }

  /**
   * Set the maximum concurrent generations allowed
   */
  setMaxConcurrentGenerations(max: number): void {
    if (max > 0 && max <= 10) { // Reasonable limits
      GLOBAL_GENERATION_STATE.maxConcurrentGenerations = max;
    }
  }
}

// Ensure singleton instance with global window reference
if (typeof window !== 'undefined') {
  // Store on window to ensure true singleton across all module instances
  if (!(window as any).__deckGenerationService) {
    (window as any).__deckGenerationService = new DeckGenerationService();
  } else {
  }
  DeckGenerationService.instance = (window as any).__deckGenerationService;
} else {
  // Fallback for non-browser environments
  if (!DeckGenerationService.instance) {
    DeckGenerationService.instance = new DeckGenerationService();
  }
}

export const deckGenerationService = DeckGenerationService.instance; 