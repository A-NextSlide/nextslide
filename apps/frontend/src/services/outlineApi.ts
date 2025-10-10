/**
 * API client for outline generation endpoints
 */
import { DeckOutline, SlideOutline, TaggedMedia, ColorConfig, NarrativeFlow } from '@/types/SlideTypes';
import { API_CONFIG } from '@/config/environment';
import { API_ENDPOINTS } from '@/config/apiEndpoints';
import { v4 as uuidv4 } from 'uuid';
import { authService } from '@/services/authService';

// Types for API requests/responses
interface OutlineGenerationRequest {
  prompt: string;
  files?: Array<{
    name: string;
    type: string;
    content: string; // base64 encoded
    size: number;
  }>;
  detailLevel?: 'quick' | 'standard' | 'detailed';
  slideCount?: number;
  styleContext?: string;
  fontPreference?: string | null;
  colorPreference?: ColorConfig | null;
  chatCompletionSystemPrompt?: string;
  assistantSystemPrompt?: string;
}

// New two-step API types
interface CreateDeckRequest {
  topic: string;
  target_slide_count?: number;
  depth?: 'auto' | 'quick' | 'standard' | 'deep';
  tone?: string;
  additional_context?: string;
  additional_instructions?: string;
  style_preferences?: {
    visual_style?: string;
    font_style?: string;
    content_density?: string;
    use_ai_palette?: boolean;
    colors?: {
      primary?: string;
      secondary?: string;
      background?: string;
      text?: string;
    };
  };
}

interface OutlineResponse {
  status: 'success';
  outline: {
    title: string;
    topic: string;
    tone: string;
    narrative_arc: string;
    slides: Array<{
      id: string;
      title: string;
      slide_type: string;
      content: string;
      narrative_role: string;
      speaker_notes?: string;
      chart_data?: any;
    }>;
    metadata: {
      depth: string;
      generation_time: string;
      slide_count: number;
    };
  };
}

interface CreateDeckFromOutlineRequest {
  outline: any;
  style_preferences?: {
    visual_style?: string;
    font_style?: string;
    content_density?: string;
    use_ai_palette?: boolean;
    colors?: {
      primary?: string;
      secondary?: string;
      background?: string;
      text?: string;
    };
  };
  async_images?: boolean;
}

// New streaming event interface for two-step process
interface NewStreamEvent {
  type: 'progress' | 'data' | 'error' | 'complete';
  stage: string;
  timestamp: number;
  progress?: number;
  message?: string;
  data?: any;
}

interface OutlineGenerationResponse {
  success: boolean;
  outline?: DeckOutline;
  hasResult?: boolean;
  error?: string | null;
  message?: string;
}

interface ContentEnhancementRequest {
  content: string;
  systemPrompt?: string;
  systemPrompts?: {
    contentEnhancement?: string;
  };
}

interface ContentEnhancementResponse {
  success: boolean;
  result?: {
    enhancedContent?: string;
    extractedData?: any;
    sources?: string;
  };
  // Keep legacy fields for backward compatibility
  enhancedContent?: string;
  extractedData?: any;
  sources?: string[];
  error?: string;
  message?: string;
}

interface MediaInterpretationRequest {
  files: Array<{
    id: string;
    name: string;
    type: string;
    content: string; // base64 encoded
    size: number;
  }>;
  slides: SlideOutline[];
  mediaPrompt?: string;
  systemPrompt?: string;
  systemPrompts?: {
    mediaInterpretation?: string;
  };
}

interface MediaInterpretationResponse {
  success: boolean;
  interpretedMedia: Array<{
    fileId: string;
    filename: string;
    type: 'image' | 'chart' | 'data' | 'pdf' | 'other';
    interpretation: string;
    recommendedSlideId?: string;
    componentType?: 'Image' | 'Chart' | null;
    chartType?: string;
    extractedData?: any;
    brandGuidelineData?: any;
    confidence: number;
  }>;
  error?: string;
}

// Types for streaming progress
export interface ProgressUpdate {
  stage: 'initializing' | 'uploading' | 'analyzing' | 'vision' | 'finalizing' | 'processing' | 'complete' | 'error' | 'planning' | 'generating_slide' | 'researching' | 'extracting_data';
  message: string;
  progress?: number;
  currentStep?: number;
  totalSteps?: number;
  error?: string;
}

// New streaming event types
export interface StreamingEvent {
  type: 'progress' | 'status' | 'outline_structure' | 'slide_start' | 'slide_complete' |
        'files_processed' |
        'outline_complete' | 'deck_ready' | 'deck_created' | 'deck_created_with_warning' |
        'narrative_flow_started' | 'narrative_flow_ready' | 'narrative_flow_pending' |
        'error' | 'images_collected' | 'images_ready_for_selection' | 'data' | 'complete' |
        'deck_creation_started' | 'deck_complete' | 'creating_deck';
  
  // Common fields
  message?: string;
  timestamp?: number;
  
  // For progress events
  stage?: string;
  percent?: number;
  progress?: number; // Alternative progress field
  currentSlide?: number;
  totalSlides?: number;
  
  // For generic data events
  data?: any;
  
  // For outline_structure event
  title?: string;
  slideCount?: number;
  slideTitles?: string[];
  slideTypes?: string[];
  
  // For slide_complete event
  slideIndex?: number;
  slide?: {
    id: string;
    title: string;
    content: string;
    chartData?: {
      chart_type: 'bar' | 'line' | 'pie';
      data: any[];
      title?: string;
    };
    extractedData?: {
      source: string;
      chartType: string;
      compatibleChartTypes?: string[];
      data: any[];
    };
    taggedMedia?: TaggedMedia[];
  };
  
  // For outline_complete event (Progress: 85%)
  success?: boolean;
  hasResult?: boolean;
  outline?: DeckOutline;
  metadata?: {
    models_used?: {
      planning: string;
      content: string;
      research: string | null;
    };
    detail_level?: string;
    research_enabled?: boolean;
  };
  
  // For deck_ready event (Success: Navigation target)
  deck_id?: string;           // UUID from Supabase
  deck_url?: string;          // '/deck/{deck_id}' or '/editor/{deck_id}'
  
  // For deck_created_with_warning event
  database_error?: string;    // Error details when DB save fails
  database_saved?: boolean;   // Flag indicating if DB save was successful
  
  // For narrative flow events
  notes?: any;                // Narrative flow payload for narrative_flow_ready
  
  // For error events
  error?: string;
  
  // For images_collected event
  images_by_slide?: Array<{
    slide_id: string;
    slide_title: string;
    images: Array<{
      url: string;
      thumbnail: string;
      photographer?: string;
      alt: string;
      id: number | string;
    }>;
  }>;
  total_images?: number;
  narrative_flow?: NarrativeFlow; // Updated to proper type
}

// Update the callback type to support both old and new formats
export type StreamingCallback = (update: ProgressUpdate | StreamingEvent) => void;

/**
 * OutlineAPI class handles all outline-related API calls
 */
export class OutlineAPI {
  private baseUrl: string;
  // Add deduplication map to track pending requests
  private pendingRequests: Map<string, Promise<any>> = new Map();
  
  constructor() {
    // Get base URL from environment or use default
    const env = (import.meta as any).env || process.env;
    this.baseUrl = env?.VITE_API_URL || API_CONFIG.BASE_URL || 'http://localhost:8000';
    
    // Log the API URL being used
    // console.log('[OutlineAPI] Using API URL:', this.baseUrl);
  }
  
  // Generate a unique key for request deduplication
  private generateRequestKey(method: string, data: any): string {
    // For deck creation, create a key based on slide titles and content
    // to avoid issues with changing outline titles
    if (method === 'createDeckFromOutline' && data.outline) {
      const outline = data.outline;
      
      // Create a signature from slide titles and count
      const slideTitles = outline.slides?.map((s: any) => s.title || '').sort().join('|') || '';
      const slideCount = outline.slides?.length || 0;
      
      // Simple hash function for the content
      const contentHash = this.simpleHash(slideTitles);
      
      const key = `${method}:${slideCount}:${contentHash}`;
      return key;
    }
    
    // For other methods, use the full data
    const dataString = JSON.stringify(data, Object.keys(data).sort());
    return `${method}:${dataString}`;
  }

  // Simple hash function for strings
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Generate theme from outline (SSE with JSON fallback)
   */
  async generateThemeFromOutline(
    outline: any,
    deckId?: string,
    onProgress?: (event: StreamingEvent) => void
  ): Promise<{ theme: any; palette?: any }> {
    // Deduplicate in-flight theme requests per outline.id
    try {
      const outlineId = outline?.id || (typeof outline === 'object' ? JSON.stringify({ t: outline?.title, s: (outline?.slides||[]).length }) : 'unknown');
      const requestKey = this.generateRequestKey('generateThemeFromOutline', { outlineId, deckId: deckId || '' });
      const existing = this.pendingRequests.get(requestKey);
      if (existing) {
        return existing as Promise<{ theme: any; palette?: any }>
      }

      const promise = this._generateThemeFromOutlineInternal(outline, deckId, onProgress)
        .finally(() => {
          // Clean up after resolution
          try { this.pendingRequests.delete(requestKey); } catch {}
        });
      this.pendingRequests.set(requestKey, promise);
      return promise;
    } catch {
      // If something goes wrong with dedup keying, still attempt normally
      return this._generateThemeFromOutlineInternal(outline, deckId, onProgress);
    }
  }

  private async _generateThemeFromOutlineInternal(
    outline: any,
    deckId?: string,
    onProgress?: (event: StreamingEvent) => void
  ): Promise<{ theme: any; palette?: any }> {
    const sseUrlBase = API_ENDPOINTS.getFullUrl(API_ENDPOINTS.THEME_FROM_OUTLINE_SSE);
    const jsonUrlBase = API_ENDPOINTS.getFullUrl(API_ENDPOINTS.THEME_FROM_OUTLINE_JSON);

    // Sanitize outline to match backend DeckOutline schema and avoid extra fields causing 422
    const sanitizedOutline: any = {
      id: outline.id,
      title: outline.title,
      slides: Array.isArray(outline.slides)
        ? outline.slides.map((s: any) => ({
            id: s.id,
            title: s.title,
            content: s.content,
            deepResearch: !!s.deepResearch,
          }))
        : [],
      stylePreferences: outline.stylePreferences
        ? {
            initialIdea: outline.stylePreferences.initialIdea,
            vibeContext: outline.stylePreferences.vibeContext,
            font: outline.stylePreferences.font ?? null,
            colors: outline.stylePreferences.colors
              ? {
                  type: outline.stylePreferences.colors.type,
                  name: outline.stylePreferences.colors.name,
                  background: outline.stylePreferences.colors.background,
                  text: outline.stylePreferences.colors.text,
                  accent1: outline.stylePreferences.colors.accent1,
                  accent2: outline.stylePreferences.colors.accent2,
                  accent3: outline.stylePreferences.colors.accent3,
                }
              : null,
            logoUrl: (outline.stylePreferences as any)?.logoUrl,
          }
        : undefined,
      notes: outline.notes,
    };

    const sseUrl = deckId
      ? `${sseUrlBase}?deck_id=${encodeURIComponent(deckId)}&store=true`
      : sseUrlBase;
    const jsonUrl = deckId
      ? `${jsonUrlBase}?deck_id=${encodeURIComponent(deckId)}&store=true`
      : jsonUrlBase;

    try {
      const response = await fetch(sseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...(authService.getAuthToken() ? { 'Authorization': `Bearer ${authService.getAuthToken()}` } : {})
        },
        body: JSON.stringify(sanitizedOutline),
      });

      if (!response.ok) throw new Error(`Theme SSE failed: ${response.status}`);
      if (!response.body) throw new Error('No response body for theme SSE');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalTheme: any = null;
      let finalPalette: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';
        for (const block of blocks) {
          const lines = block.split('\n');
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          }
          if (dataLines.length === 0) continue;
          const dataStr = dataLines.join('\n');
          if (!dataStr || dataStr === '[DONE]') continue;
          try {
            const evt = JSON.parse(dataStr);
            onProgress?.(evt as StreamingEvent);
            if (evt.type === 'theme_generated') {
              finalTheme = evt.theme;
              finalPalette = evt.palette;
            }
          } catch {}
        }
      }
      if (finalTheme) return { theme: finalTheme, palette: finalPalette };
      throw new Error('Theme SSE completed without final theme');
    } catch (e) {
      const resp = await fetch(jsonUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authService.getAuthToken() ? { 'Authorization': `Bearer ${authService.getAuthToken()}` } : {})
        },
        body: JSON.stringify(sanitizedOutline),
      });
      if (!resp.ok) throw new Error(`Theme generation failed: ${resp.status}`);
      const data = await resp.json();
      if (!data?.success || !data?.theme) throw new Error('Theme generation failed');
      return { theme: data.theme, palette: data.palette };
    }
  }
  
  /**
   * Convert File to base64 string
   */
  private fileToBase64(file: File): Promise<string> {
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
   * Generate outline with the given parameters
   */
  async generateOutline(
    prompt: string,
    files: File[] = [],
    options: {
      detailLevel?: 'quick' | 'standard' | 'detailed';
      styleContext?: string;
      fontPreference?: string | null;
      colorPreference?: ColorConfig | null;
    } = {}
  ): Promise<DeckOutline> {
    if (!prompt.trim() && files.length === 0) {
      throw new Error('Please provide a description of your presentation idea or upload relevant files.');
    }

    try {
      const formData = new FormData();
      
      // Determine which base prompt to use
      const hasFiles = files && files.length > 0;
      
      // For testing: use minimal prompts if there's an issue
      const useMinimalPrompts = false; // Set to true to test with minimal prompts
      
      const chatCompletionSystemPrompt = useMinimalPrompts 
        ? "You are a helpful assistant that creates presentation outlines."
        : hasFiles 
          ? "" // Backend will provide the appropriate prompt
          : "";
      
      const assistantSystemPrompt = useMinimalPrompts
        ? "Create a presentation outline with a title and slides."
        : "";
      
      // Convert files to base64
      const filesData = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          type: file.type,
          content: await this.fileToBase64(file),
          size: file.size
        }))
      );
      
      const request: OutlineGenerationRequest = {
        prompt,
        files: filesData.length > 0 ? filesData : undefined,
        detailLevel: options.detailLevel || 'standard',
        styleContext: options.styleContext,
        fontPreference: options.fontPreference,
        colorPreference: options.colorPreference,
        chatCompletionSystemPrompt,
        assistantSystemPrompt
      };
      
      // Add form data for the request
      for (const key in request) {
        if (request[key] instanceof Array) {
          request[key].forEach((item, index) => {
            formData.append(`${key}[${index}]`, item);
          });
        } else if (typeof request[key] === 'object' && request[key] !== null) {
          for (const subKey in request[key]) {
            formData.append(`${key}[${subKey}]`, request[key][subKey]);
          }
        } else {
          formData.append(key, request[key]);
        }
      }
      
      const response = await fetch(API_ENDPOINTS.getFullUrl(API_ENDPOINTS.GENERATE_OUTLINE), {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Outline generation failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const responseData: OutlineGenerationResponse = await response.json();
      
      // Check for both 'outline' and 'result' fields for compatibility
      const outline = responseData.outline || (responseData as any).result;
      
      if (!responseData.success || !outline) {
        throw new Error(responseData.error || 'Outline generation failed');
      }
      
      return outline;
      
    } catch (fetchError) {
      if (fetchError instanceof TypeError) {
        throw new Error('Network error - Check if API server is running at: ' + this.baseUrl);
      }
      throw fetchError;
    }
  }
  
  /**
   * Enhance content with web search
   */
  async enhanceContent(content: string): Promise<ContentEnhancementResponse> {
    const request: ContentEnhancementRequest = {
      content,
      systemPrompts: {
        contentEnhancement: "" // Backend will provide the appropriate prompt
      }
    };
    
    // Add enhancePrompt field that backend expects
    const requestWithEnhancePrompt = {
      ...request,
      enhancePrompt: "" // Backend will provide the appropriate prompt
    };
    
    const response = await fetch(API_ENDPOINTS.getFullUrl(API_ENDPOINTS.ENHANCE_CONTENT), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestWithEnhancePrompt),
    });
    
    if (!response.ok) {
      throw new Error(`Content enhancement failed: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  /**
   * Interpret media files
   */
  async interpretMedia(
    files: Array<{ id: string; file: File }>,
    slides: SlideOutline[]
  ): Promise<TaggedMedia[]> {
    // Convert files to base64
    const filesData = await Promise.all(
      files.map(async ({ id, file }) => ({
        id,
        name: file.name,
        type: file.type,
        content: await this.fileToBase64(file),
        size: file.size
      }))
    );
    
    const request: MediaInterpretationRequest = {
      files: filesData,
      slides,
      mediaPrompt: "", // Backend will provide the appropriate prompt
      systemPrompts: {
        mediaInterpretation: "" // Backend will provide the appropriate prompt
      }
    };
    
    const response = await fetch(API_ENDPOINTS.getFullUrl(API_ENDPOINTS.INTERPRET_MEDIA), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    
    if (!response.ok) {
      throw new Error(`Media interpretation failed: ${response.statusText}`);
    }
    
    const result: MediaInterpretationResponse = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Media interpretation failed');
    }
    
    // Convert response to TaggedMedia format
    return result.interpretedMedia.map(media => ({
      id: media.fileId,
      filename: media.filename,
      type: media.type,
      interpretation: media.interpretation,
      slideId: media.recommendedSlideId || '',
      status: 'processed' as const,
      metadata: {
        componentType: media.componentType,
        chartType: media.chartType,
        extractedData: media.extractedData,
        confidence: media.confidence
      }
    }));
  }

  /**
   * NEW: Generate outline only (Step 1 of two-step process)
   */
  async generateOutline2Step(
    topic: string,
    options: {
      target_slide_count?: number;
      depth?: 'auto' | 'quick' | 'standard' | 'deep';
      tone?: string;
      additional_context?: string;
      additional_instructions?: string;
      style_preferences?: {
        visual_style?: string;
        font_style?: string;
        content_density?: string;
        use_ai_palette?: boolean;
        colors?: {
          primary?: string;
          secondary?: string;
          background?: string;
          text?: string;
        };
      };
    } = {}
  ): Promise<OutlineResponse['outline']> {
    if (!topic.trim()) {
      throw new Error('Please provide a presentation topic.');
    }

    try {
      const request: CreateDeckRequest = {
        topic,
        target_slide_count: options.target_slide_count || 10,
        depth: options.depth || 'auto',
        tone: options.tone || 'professional',
        additional_context: options.additional_context,
        additional_instructions: options.additional_instructions,
        style_preferences: options.style_preferences
      };
      
      const response = await fetch(`${this.baseUrl}/generate-outline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authService.getAuthToken() ? { 'Authorization': `Bearer ${authService.getAuthToken()}` } : {})
        },
        body: JSON.stringify(request),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Outline generation failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const result: OutlineResponse = await response.json();
      
      if (result.status !== 'success' || !result.outline) {
        throw new Error('Outline generation failed');
      }
      
      return result.outline;
      
    } catch (fetchError) {
      if (fetchError instanceof TypeError) {
        throw new Error('Network error - Check if API server is running at: ' + this.baseUrl);
      }
      throw fetchError;
    }
  }

  /**
   * NEW: Create deck from outline with streaming (Step 2 of two-step process)
   */
  async createDeckFromOutline(
    outline: any,
    stylePreferences?: any,
    onProgress?: (event: StreamingEvent) => void,
    autoApplyImages?: boolean
  ): Promise<{ deck_id: string; deck_url?: string }> {
    // Generate a unique key for this request
    const requestKey = this.generateRequestKey('createDeckFromOutline', { outline, stylePreferences });
    
    // Check if this request is already in progress
    const pendingRequest = this.pendingRequests.get(requestKey);
    if (pendingRequest) {
      return pendingRequest;
    }
    
    // Create the promise for this request
    const requestPromise = (async () => {
      try {
        // Log the outline to verify taggedMedia is present
        if (outline?.slides) {
          outline.slides.forEach((slide: any, index: number) => {
            if (slide.taggedMedia && slide.taggedMedia.length > 0) {
              slide.taggedMedia.forEach((media: any, mediaIndex: number) => {
              });
            }
          });
        }
        
        const request: CreateDeckFromOutlineRequest = {
          outline,
          style_preferences: stylePreferences,
          async_images: autoApplyImages !== undefined ? !autoApplyImages : true  // If autoApplyImages is true, async_images should be false (and vice versa)
        };
        
        // For now, use the streaming approach directly since EventSource endpoint doesn't exist yet
        return await this.createDeckWithStreaming(request, onProgress);
        
      } catch (error) {
        if (error instanceof TypeError) {
          throw new Error('Network error - Check if API server is running at: ' + this.baseUrl);
        }
        throw error;
      } finally {
        // Clean up the pending request
        this.pendingRequests.delete(requestKey);
      }
    })();
    
    // Store the pending request
    this.pendingRequests.set(requestKey, requestPromise);
    
    return requestPromise;
  }

  /**
   * Create deck using EventSource (preferred method)
   */
  private async createDeckWithEventSource(
    request: CreateDeckFromOutlineRequest,
    onProgress?: (event: StreamingEvent) => void
  ): Promise<{ deck_id: string; deck_url?: string }> {
    // Create an EventSource for SSE
    return new Promise((resolve, reject) => {
      let deckId = '';
      let deckUrl = '';
      let eventSource: EventSource | null = null;
      
      // First, initiate the deck creation with POST
      fetch(`${this.baseUrl}/create-deck-from-outline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authService.getAuthToken() ? { 'Authorization': `Bearer ${authService.getAuthToken()}` } : {})
        },
        body: JSON.stringify(request),
      }).then(response => {
        if (!response.ok) {
          throw new Error(`Deck creation failed: ${response.status} ${response.statusText}`);
        }
        
        // Get the session ID or stream ID from response headers if available
        const streamId = response.headers.get('X-Stream-ID') || '';
        
        // Create EventSource for SSE events
        const eventSourceUrl = streamId 
          ? `${this.baseUrl}/create-deck-from-outline/events?stream_id=${streamId}`
          : `${this.baseUrl}/create-deck-from-outline/events`;
          
        eventSource = new EventSource(eventSourceUrl);
        
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // IMPORTANT: Capture deck_id from ANY event that has it
            if (data.deck_id && !deckId) {
              deckId = data.deck_id;
            }
            
            // Convert to StreamingEvent format for callback
            const streamingEvent: StreamingEvent = {
              type: data.type as any,
              message: data.message,
              stage: data.stage,
              progress: data.progress,
              data: data
            };
            
            if (onProgress) {
              onProgress(streamingEvent);
            }
            
            // Handle different event types
            switch (data.type) {
              case 'deck_creation_started':
                // Deck creation started - has deck_id
                break;
                
              case 'deck_created':
                // Deck saved to database successfully
                break;
                
              case 'deck_created_with_warning':
                // Database save failed but composition continues
                break;
                
              case 'deck_complete':
                // Deck composition complete
                if (data.deck_id) {
                  deckId = data.deck_id;
                }
                if (data.deck_url) {
                  deckUrl = data.deck_url;
                }
                eventSource.close();
                resolve({ deck_id: deckId, deck_url: deckUrl });
                break;
                
              case 'error':
                // Error during composition
                const errorMessage = data.error || data.message || 'Deck creation failed';
                eventSource.close();
                
                // If we have a deck_id, we can still return it for partial recovery
                if (deckId) {
                  resolve({ deck_id: deckId, deck_url: deckUrl });
                } else {
                  reject(new Error(errorMessage));
                }
                break;
            }
          } catch (parseError) {
          }
        };
        
        eventSource.onerror = (error) => {
          eventSource?.close();
          
          // If we already have a deck_id, resolve with it
          if (deckId) {
            resolve({ deck_id: deckId, deck_url: deckUrl });
          } else {
            reject(new Error('Connection error during deck creation'));
          }
        };
        
      }).catch(fetchError => {
        if (eventSource) {
          eventSource.close();
        }
        reject(fetchError);
      });
    });
  }

  /**
   * Create deck using streaming (fallback method)
   */
  private async createDeckWithStreaming(
    request: CreateDeckFromOutlineRequest,
    onProgress?: (event: StreamingEvent) => void
  ): Promise<{ deck_id: string; deck_url?: string }> {
    // Use the correct endpoint
    const endpoint = API_ENDPOINTS.getFullUrl(API_ENDPOINTS.COMPOSE_DECK_STREAM);
    
    // Generate a proper UUID for deck_id if not provided
    const deck_id = request.outline?.deck_id || request.outline?.id || uuidv4();
    
    // Construct the request body to match expected format
    const requestBody = {
      deck_id: deck_id,
      outline: request.outline,
      force_restart: false,
      async_images: request.async_images !== undefined ? request.async_images : true
    };
    
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authService.getAuthToken() ? { 'Authorization': `Bearer ${authService.getAuthToken()}` } : {})
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Deck creation failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    if (!response.body) {
      throw new Error('No response body available for streaming');
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let deckId = '';
    let deckUrl = '';
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          
          if (data === '' || data === '[DONE]') {
            continue;
          }
          
          try {
            const event = JSON.parse(data) as StreamingEvent;
            
            if (onProgress) {
              onProgress(event);
            }
            
            // Handle different event types
            switch (event.type) {
              case 'data':
                if (event.stage === 'deck_init' && event.data?.deck_id) {
                  deckId = event.data.deck_id;
                }
                break;
                
              case 'complete':
                if (event.data?.deck_id) {
                  deckId = event.data.deck_id;
                }
                if (event.data?.deck_url) {
                  deckUrl = event.data.deck_url;
                }
                return { deck_id: deckId, deck_url: deckUrl };
                
              case 'error':
                throw new Error(event.message || 'Deck creation failed');
            }
          } catch (parseError) {
            // Parse errors handled silently
          }
        }
      }
    }
    
    if (!deckId) {
      throw new Error('Deck creation completed but no deck ID received');
    }
    
    return { deck_id: deckId, deck_url: deckUrl };
  }

  /**
   * Generate outline with streaming progress updates using SSE
   */
  async generateOutlineStream(
    prompt: string,
    files: File[] = [],
    options: {
      detailLevel?: 'quick' | 'standard' | 'detailed';
      slideCount?: number;
      styleContext?: string;
      fontPreference?: string | null;
      colorPreference?: ColorConfig | null;
      enableResearch?: boolean;
    } = {},
    onProgress?: StreamingCallback
  ): Promise<DeckOutline> {
    if (!prompt.trim() && files.length === 0) {
      throw new Error('Please provide a description of your presentation idea or upload relevant files.');
    }

    try {
      // Determine which base prompt to use
      const hasFiles = files && files.length > 0;
      
      const useMinimalPrompts = false;
      
      const chatCompletionSystemPrompt = useMinimalPrompts 
        ? "You are a helpful assistant that creates presentation outlines."
        : hasFiles 
          ? "" // Backend will provide the appropriate prompt
          : "";
      
      const assistantSystemPrompt = useMinimalPrompts
        ? "Create a presentation outline with a title and slides."
        : "";
      
      // Convert files to base64
      const filesData = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          type: file.type,
          content: await this.fileToBase64(file),
          size: file.size
        }))
      );
      
      // Build request while omitting null/undefined/empty values to satisfy strict validators
      const request: any = {
        prompt: prompt && prompt.trim().length > 0 ? prompt : undefined,
        detailLevel: options.detailLevel || 'standard',
        slideCount: typeof options.slideCount === 'number' ? options.slideCount : undefined,
        styleContext: options.styleContext && options.styleContext.trim().length > 0 ? options.styleContext : undefined,
        enableResearch: typeof options.enableResearch === 'boolean' ? options.enableResearch : undefined,
      };
      if (filesData.length > 0) request.files = filesData;
      if (options.fontPreference != null && options.fontPreference !== '') request.fontPreference = options.fontPreference;
      if (options.colorPreference != null) request.colorPreference = options.colorPreference;
      if (chatCompletionSystemPrompt && chatCompletionSystemPrompt.trim().length > 0) request.chatCompletionSystemPrompt = chatCompletionSystemPrompt;
      if (assistantSystemPrompt && assistantSystemPrompt.trim().length > 0) request.assistantSystemPrompt = assistantSystemPrompt;
      
      
      const endpointUrl = API_ENDPOINTS.getFullUrl(API_ENDPOINTS.GENERATE_OUTLINE_STREAM);
      console.warn('[outlineApi] Using streaming endpoint:', endpointUrl);
      console.warn('[outlineApi] Starting stream at:', new Date().toISOString());

      // Monitor connection with periodic logs
      const connectionMonitor = setInterval(() => {
        console.warn('[outlineApi] Connection still active at:', new Date().toISOString());
      }, 1000);

      // Prefer XHR for SSE in browser to avoid fetch wrappers/extensions buffering the stream
      const useXHR = typeof window !== 'undefined';

      if (useXHR) {
        console.warn('[outlineApi] Using XHR for SSE, onProgress callback:', !!onProgress);
        try {
          const result = await this.generateOutlineStreamWithXHR(endpointUrl, request, onProgress);
          clearInterval(connectionMonitor);
          console.warn('[outlineApi] Stream completed successfully at:', new Date().toISOString());
          return result;
        } catch (error) {
          clearInterval(connectionMonitor);
          console.error('[outlineApi] Stream failed at:', new Date().toISOString(), error);
          throw error;
        }
      }

      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...(authService.getAuthToken() ? { 'Authorization': `Bearer ${authService.getAuthToken()}` } : {})
        },
        body: JSON.stringify(request),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Streaming outline generation failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      if (!response.body) {
        throw new Error('No response body available for streaming');
      }
      
      const readStream = async (): Promise<DeckOutline> => {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let completeOutline: DeckOutline | null = null;
        // Use a map by slideIndex to support out-of-order slide_complete events
        const progressiveSlidesByIndex: Map<number, SlideOutline> = new Map();
        let outlineMetadata: any = null;
        let totalExpectedSlides = 0;

        const connectionStart = Date.now();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              const _connectionDurationMs = Date.now() - connectionStart;
              break;
            }

            buffer += decoder.decode(value, { stream: true });

            // Split by double newline to get complete SSE events
            const events = buffer.split('\n\n');
            buffer = events.pop() || '';

            for (const eventBlock of events) {
              const lines = eventBlock.split('\n');
              const dataLines: string[] = [];
              for (const line of lines) {
                if (line.startsWith('data:')) {
                  dataLines.push(line.slice(5).trim());
                }
              }

              if (dataLines.length === 0) continue;
              const dataStr = dataLines.join('\n');
              if (!dataStr || dataStr === '[DONE]') continue;

              try {
                const event = JSON.parse(dataStr);

                // Emit progress update to callback immediately
                onProgress?.(event as StreamingEvent);

                // Process key event types for local progressive construction
                if (event.type === 'outline_structure') {
                  outlineMetadata = {
                    id: event.data?.id || uuidv4(),
                    title: event.title || 'Untitled Presentation',
                    topic: event.data?.topic || '',
                    tone: event.data?.tone || 'professional',
                    narrative_arc: event.data?.narrative_arc || 'informative'
                  };
                  totalExpectedSlides = event.slideCount || 0;
                } else if (event.type === 'slide_complete') {
                  if (event.slide && typeof event.slideIndex === 'number') {
                    progressiveSlidesByIndex.set(event.slideIndex, event.slide);
                  }
                } else if (event.type === 'outline_complete') {
                  if (event.outline) {
                    completeOutline = event.outline;
                    if (event.narrative_flow) {
                      (completeOutline as any).narrativeFlow = event.narrative_flow;
                    }
                  }
                  if (event.narrative_flow) {
                    outlineMetadata = {
                      ...outlineMetadata,
                      narrativeFlow: event.narrative_flow
                    };
                    try { onProgress?.({ type: 'status', message: 'narrative_flow_ready' } as any); } catch {}
                  }
                }
              } catch {
                // Ignore non-JSON or keep-alive lines
              }
            }
          }
        } catch (error) {
          throw new Error(`Stream reading failed: ${error}`);
        }

        // Return complete outline if we got one, otherwise construct from progressive data
        if (completeOutline) {
          return completeOutline;
        } else if (outlineMetadata && progressiveSlidesByIndex.size > 0) {
          // Build slides array in index order
          const orderedSlides: SlideOutline[] = [];
          const maxIndex = Math.max(...Array.from(progressiveSlidesByIndex.keys()));
          for (let i = 0; i <= maxIndex; i++) {
            const slide = progressiveSlidesByIndex.get(i);
            if (slide) orderedSlides.push(slide);
          }

          return {
            ...outlineMetadata,
            slides: orderedSlides,
            metadata: {
              depth: 'concise',
              generation_time: new Date().toISOString(),
              slide_count: orderedSlides.length || totalExpectedSlides
            }
          } as DeckOutline;
        } else {
          throw new Error('Failed to generate outline - no data received');
        }
      };
      
      return await readStream();
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network error - Check if API server is running at: ' + this.baseUrl);
      }
      throw error;
    }
  }

  private generateOutlineStreamWithXHR(
    url: string,
    requestBody: any,
    onProgress?: StreamingCallback
  ): Promise<DeckOutline> {
    console.warn('[outlineApi] generateOutlineStreamWithXHR called with onProgress:', !!onProgress);
    return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        const startTime = Date.now();
        let lastEventTime = Date.now();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Accept', 'text/event-stream');
        const token = authService.getAuthToken?.();
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        let buffer = '';
        let lastIndex = 0;
        let completeOutline: DeckOutline | null = null;
        const progressiveSlidesByIndex: Map<number, SlideOutline> = new Map();
        let outlineMetadata: any = null;
        let totalExpectedSlides = 0;

        const processChunk = (chunk: string) => {
          console.warn('[outlineApi] processChunk called, onProgress in scope:', !!onProgress);
          buffer += chunk;
          // Process full SSE event blocks split by double newline
          let idx: number;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);

            const lines = block.split('\n');
            const dataLines: string[] = [];
            for (const line of lines) {
              if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
            }
            if (dataLines.length === 0) continue;
            const dataStr = dataLines.join('\n');
            if (!dataStr || dataStr === '[DONE]') continue;

            try {
              const event = JSON.parse(dataStr);
              console.warn('[outlineApi] Received SSE event:', event.type, event);
              console.warn('[outlineApi] About to call onProgress, callback exists:', !!onProgress);
              
              // Always mirror research/theming events to a global buffer for the Thinking UI
              try {
                const t = (event as any)?.type;
                if (t && (t.startsWith?.('research_') || ['agent_event', 'tool_call', 'tool_result', 'artifact'].includes(t))) {
                  const w: any = (typeof window !== 'undefined') ? window : undefined;
                  if (w) {
                    const buf = Array.isArray(w.__DEBUG_RESEARCH_EVENTS__) ? w.__DEBUG_RESEARCH_EVENTS__ : [];
                    buf.push(event);
                    w.__DEBUG_RESEARCH_EVENTS__ = buf;
                  }
                }
              } catch {}

              if (onProgress) {
                console.warn('[outlineApi] Calling onProgress callback now...');
                try {
                  onProgress(event as StreamingEvent);
                  console.warn('[outlineApi] onProgress callback completed');
                } catch (error) {
                  console.error('[outlineApi] Error in onProgress callback:', error);
                }
              } else {
                console.warn('[outlineApi] WARNING: No onProgress callback provided!');
              }

              if (event.type === 'outline_structure') {
                outlineMetadata = {
                  id: event.data?.id || uuidv4(),
                  title: event.title || 'Untitled Presentation',
                  topic: event.data?.topic || '',
                  tone: event.data?.tone || 'professional',
                  narrative_arc: event.data?.narrative_arc || 'informative'
                };
                totalExpectedSlides = event.slideCount || 0;
              } else if (event.type === 'slide_complete') {
                if (event.slide && typeof event.slideIndex === 'number') {
                  progressiveSlidesByIndex.set(event.slideIndex, event.slide);
                }
              } else if (event.type === 'outline_complete') {
                if (event.outline) {
                  completeOutline = event.outline;
                  if (event.narrative_flow) {
                    (completeOutline as any).narrativeFlow = event.narrative_flow;
                  }
                }
                if (event.narrative_flow) {
                  outlineMetadata = { ...outlineMetadata, narrativeFlow: event.narrative_flow };
                  try { onProgress?.({ type: 'status', message: 'narrative_flow_ready' } as any); } catch {}
                }
              }
            } catch (error) {
              console.error('[outlineApi] Error processing SSE event:', error);
              console.error('[outlineApi] Event data that failed:', dataStr);
            }
          }
        };

        xhr.onprogress = () => {
          lastEventTime = Date.now(); // Update last event time
          const chunk = xhr.responseText.slice(lastIndex);
          lastIndex = xhr.responseText.length;
          if (chunk) {
            console.warn('[outlineApi] Received chunk at:', new Date().toISOString(), 'Size:', chunk.length);
            processChunk(chunk);
          }
        };

        xhr.onreadystatechange = () => {
          if (xhr.readyState === XMLHttpRequest.DONE) {
            // Process any remaining buffer
            const chunk = xhr.responseText.slice(lastIndex);
            if (chunk) processChunk(chunk);

            // Resolve with complete or progressive outline
            if (completeOutline) {
              resolve(completeOutline);
              return;
            }
            if (outlineMetadata && progressiveSlidesByIndex.size > 0) {
              const orderedSlides: SlideOutline[] = [];
              const maxIndex = Math.max(...Array.from(progressiveSlidesByIndex.keys()));
              for (let i = 0; i <= maxIndex; i++) {
                const slide = progressiveSlidesByIndex.get(i);
                if (slide) orderedSlides.push(slide);
              }
              resolve({
                ...outlineMetadata,
                slides: orderedSlides,
                metadata: {
                  depth: 'concise',
                  generation_time: new Date().toISOString(),
                  slide_count: orderedSlides.length || totalExpectedSlides
                }
              } as DeckOutline);
              return;
            }
            reject(new Error('Failed to generate outline - no data received'));
          }
        };

        xhr.onerror = (event) => {
          const elapsedTime = Date.now() - startTime;
          console.error('[outlineApi] XHR error after', elapsedTime, 'ms:', event);
          
          if (elapsedTime < 6000) { // Less than 6 seconds suggests a proxy timeout
            reject(new Error('Connection terminated by proxy timeout. Please restart your dev server after updating vite.config.ts'));
          } else {
            reject(new Error('Network error - Check if API server is running at: ' + this.baseUrl));
          }
        };
        
        xhr.onabort = () => {
          const elapsedTime = Date.now() - startTime;
          console.error('[outlineApi] XHR aborted after', elapsedTime, 'ms');
          reject(new Error('Request aborted'));
        };
        
        xhr.ontimeout = () => {
          const elapsedTime = Date.now() - startTime;
          console.error('[outlineApi] XHR timeout after', elapsedTime, 'ms');
          reject(new Error('Request timeout'));
        };

        xhr.send(JSON.stringify(requestBody));
      } catch (e) {
        reject(e);
      }
    });
  }
}

// Create singleton instance
export const outlineApi = new OutlineAPI(); 
