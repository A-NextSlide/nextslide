import { SlideGenerationService } from './SlideGenerationService';
import { API_ENDPOINTS } from '@/config/apiEndpoints';
import { authService } from '@/services/authService';
import { GenerationProgressTracker } from './GenerationProgressTracker';
import { useDeckStore } from '@/stores/deckStore';
import { useInteractionStore } from '@/stores/interactionStore';

export interface GenerationOptions {
  deckId: string;
  outline?: any;
  prompt?: string;
  slideCount?: number;
  detailLevel?: string;
  auto?: boolean;
  stylePreferences?: any;
  onProgress?: (event: any) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  // Internal flag: skip status reset (used when called from generateFromOutline)
  _skipStatusReset?: boolean;
}

interface GenerationMetadata {
  deckId: string;
  startTime: number;
  requestId: string;
  options: GenerationOptions;
  service?: SlideGenerationService;
  abortController?: AbortController;
  skipStatusReset?: boolean;
}

/**
 * Centralized coordinator for all deck generation requests.
 * Ensures no duplicate generations and provides a single source of truth.
 */
export class GenerationCoordinator extends EventTarget {
  private static instance: GenerationCoordinator;
  private activeGenerations = new Map<string, GenerationMetadata>();
  private generationHistory = new Map<string, number>(); // Track last generation time per deck
  private lastOutlineGeneration: number | null = null; // Track last outline generation globally
  private progressTracker: GenerationProgressTracker;

  private constructor() {
    super();
    this.progressTracker = GenerationProgressTracker.getInstance();
  }

  static getInstance(): GenerationCoordinator {
    if (!GenerationCoordinator.instance) {
      GenerationCoordinator.instance = new GenerationCoordinator();
      // Expose globally for debugging
      if (typeof window !== 'undefined') {
        (window as any).__generationCoordinator = GenerationCoordinator.instance;
      }
    }
    return GenerationCoordinator.instance;
  }

  /**
   * Check if a deck is currently generating
   */
  isGenerating(deckId: string): boolean {
    return this.activeGenerations.has(deckId);
  }

  /**
   * Get all active generations
   */
  getActiveGenerations(): Map<string, GenerationMetadata> {
    return new Map(this.activeGenerations);
  }

  /**
   * Check if generation can start (rate limiting)
   */
  private canStartGeneration(deckId: string): { allowed: boolean; reason?: string } {
    // Check if already generating
    if (this.activeGenerations.has(deckId)) {
      return { allowed: false, reason: 'Generation already in progress for this deck' };
    }

    // Check rate limiting (1 second between attempts for same deck)
    const lastGenTime = this.generationHistory.get(deckId);
    if (lastGenTime) {
      const timeSinceLastGen = Date.now() - lastGenTime;
      if (timeSinceLastGen < 1000) {
        return { allowed: false, reason: 'Please wait a moment before generating again' };
      }
    }

    // Check global concurrent limit
    if (this.activeGenerations.size >= 3) {
      return { allowed: false, reason: 'Maximum concurrent generations reached. Please wait.' };
    }

    return { allowed: true };
  }

  /**
   * Start generation for a deck
   */
  async startGeneration(options: GenerationOptions): Promise<void> {
    const { deckId } = options;
    
    if (!deckId) {
      throw new Error('Deck ID is required');
    }

    // If another entry point (e.g., DeckList) already initiated generation in this session, prevent duplicate
    if (typeof window !== 'undefined' && (window as any).__activeGenerationDeckId === deckId) {
      console.log(`[GenerationCoordinator] Duplicate start prevented for ${deckId} (activeGenerationDeckId set)`);
      throw new Error('Generation already in progress for this deck');
    }

    // Check if generation is allowed
    const canStart = this.canStartGeneration(deckId);
    if (!canStart.allowed) {
      console.log(`[GenerationCoordinator] Generation blocked for ${deckId}: ${canStart.reason}`);
      throw new Error(canStart.reason || 'Cannot start generation');
    }

    // Create metadata
    const metadata: GenerationMetadata = {
      deckId,
      startTime: Date.now(),
      requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      options,
      abortController: new AbortController(),
      skipStatusReset: options._skipStatusReset
    };

    // Register generation atomically
    this.activeGenerations.set(deckId, metadata);
    this.generationHistory.set(deckId, Date.now());

    // Set deck status to 'generating' to block saves (prevents 409 conflicts)
    // Skip if called from generateFromOutline (it already set the status)
    if (!options._skipStatusReset) {
      useInteractionStore.getState().setDeckStatus({ state: 'generating' });
      if (typeof window !== 'undefined') {
        (window as any).__deckStatus = 'generating';
      }
    }

    // Log for debugging
    console.log(`[GenerationCoordinator] Starting generation for ${deckId}`, {
      requestId: metadata.requestId,
      activeCount: this.activeGenerations.size
    });

    // Emit start event
    this.dispatchEvent(new CustomEvent('generation:started', {
      detail: { deckId, metadata }
    }));

    // Ensure progress tracker is animating during generation
    try { this.progressTracker.resume(); } catch {}

    // Mark as active in this browser session to coordinate across pages/routes
    if (typeof window !== 'undefined') {
      (window as any).__activeGenerationDeckId = deckId;
    }

    try {
      // Create service instance
      const service = new SlideGenerationService();
      metadata.service = service;

      // Start generation
      await service.startGeneration({
        deckId,
        outline: options.outline,
        prompt: options.prompt,
        slideCount: options.slideCount || 6,
        detailLevel: options.detailLevel || 'standard',
        onProgress: (event) => this.handleProgress(deckId, event, options.onProgress),
        onComplete: () => this.handleComplete(deckId, options.onComplete),
        onError: (error) => this.handleError(deckId, error, options.onError)
      });

    } catch (error) {
      // Handle synchronous errors
      this.handleError(deckId, error as Error, options.onError);
      throw error;
    }
  }

  /**
   * Validate outline to ensure required fields are present
   */
  private validateOutline(outline: any): any {
    if (!outline || !outline.slides) {
      return outline;
    }

    // Fix missing source in extractedData for each slide
    const validatedOutline = {
      ...outline,
      slides: outline.slides.map((slide: any, index: number) => {
        // Promote citations to top-level and ensure they are present in content for generators that don't read citations
        try {
          const fromTop: Array<any> = Array.isArray(slide.citations) ? slide.citations : [];
          const fromExtracted: Array<any> = (slide?.extractedData?.metadata?.citations || []) as any[];
          const fromList: Array<any> = Array.isArray(slide?.extractedDataList)
            ? (slide.extractedDataList as any[]).flatMap(ed => (ed?.metadata?.citations || []) as any[])
            : [];
          const combined = [...fromTop, ...fromExtracted, ...fromList];
          if (combined.length > 0) {
            const dedup: any[] = [];
            const seen = new Set<string>();
            for (const c of combined) {
              const key = (c?.url && String(c.url).trim()) || `label:${String((c?.title || c?.source || '')).trim()}`;
              if (!seen.has(key)) {
                seen.add(key);
                dedup.push({ title: c?.title, source: c?.source, url: c?.url });
              }
            }
            // Build footnotes if not provided
            const existingFootnotes = Array.isArray(slide.footnotes) ? slide.footnotes : [];
            const footnotes = existingFootnotes.length > 0 ? existingFootnotes : dedup.map((c, i) => {
              const labelRaw = (c.title || c.source || '') as string;
              let label = labelRaw && String(labelRaw).trim();
              if (!label) {
                try { label = new URL(String(c.url)).hostname; } catch { label = String(c.url || ''); }
              }
              return { index: i + 1, label, url: c.url };
            });
            slide = { ...slide, citations: dedup, footnotes };

            // If slide content doesn't already include a Sources/References block, append a compact one
            const content: string = slide.content || '';
            const hasBlock = /(\n|^)\s*(Sources|References)\s*:/i.test(content) || /<strong>\s*(Sources|References)\s*<\/strong>/i.test(content);
            if (!hasBlock) {
              const lines = dedup.slice(0, 5).map((c, i) => {
                const labelRaw = (c.title || c.source || '') as string;
                let label = labelRaw && String(labelRaw).trim();
                if (!label) {
                  try { label = new URL(String(c.url)).hostname; } catch { label = String(c.url || ''); }
                }
                return `- [${i + 1}] ${label}${c.url ? ` (${c.url})` : ''}`;
              });
              const sourcesBlock = `\n\nSources:\n${lines.join('\n')}`;
              slide = { ...slide, content: (content ? String(content).trim() : '') + sourcesBlock };
            }
          }
        } catch {}

        if (slide.extractedData && !slide.extractedData.source) {
          // Add default source based on available information
          return {
            ...slide,
            extractedData: {
              ...slide.extractedData,
              source: slide.extractedData.title || 
                      slide.title || 
                      `Slide ${index + 1} Data` || 
                      'User Input Data'
            }
          };
        }
        
        // Ensure data array exists if extractedData is present
        if (slide.extractedData && !slide.extractedData.data) {
          return {
            ...slide,
            extractedData: {
              ...slide.extractedData,
              data: []
            }
          };
        }
        
        return slide;
      })
    };
    
    return validatedOutline;
  }

  /**
   * Start generation from outline (used by DeckList)
   */
  async generateFromOutline(
    outline: any,
    stylePreferences?: any,
    onProgress?: (event: any) => void,
    options?: { confirmOverage?: boolean }
  ): Promise<{ deckId: string; deckUrl: string }> {
    // Check global rate limit for outline generation (skip for overage confirmation retries)
    if (!options?.confirmOverage) {
      const lastOutlineGen = this.lastOutlineGeneration;
      if (lastOutlineGen) {
        const timeSinceLastGen = Date.now() - lastOutlineGen;
        if (timeSinceLastGen < 5000) { // 5 seconds between outline generations
          throw new Error('Please wait a moment before generating another presentation');
        }
      }
    }

    // Update last generation time
    this.lastOutlineGeneration = Date.now();

    // Set deck status to 'generating' early to block saves (prevents 409 conflicts)
    useInteractionStore.getState().setDeckStatus({ state: 'generating' });
    if (typeof window !== 'undefined') {
      (window as any).__deckStatus = 'generating';
    }

    // Helper to reset status on error
    const resetStatus = () => {
      useInteractionStore.getState().setDeckStatus({ state: 'idle' });
      if (typeof window !== 'undefined') {
        (window as any).__deckStatus = 'idle';
      }
    };

    try {
    // Reset progress tracker for new generation
    this.progressTracker.reset();

    // Validate outline before sending
    const validatedOutline = this.validateOutline(outline);
    console.log('[GenerationCoordinator] Validated outline:', validatedOutline);

    // Create deck via API first
    const response = await fetch(API_ENDPOINTS.getFullUrl('/deck/create-from-outline'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...(authService.getAuthToken() ? { 'Authorization': `Bearer ${authService.getAuthToken()}` } : {})
      },
      body: JSON.stringify({
        outline: validatedOutline,
        style_preferences: stylePreferences,
        async_images: true,  // Images load in background - backend doesn't support sync mode
        // Include the deck name from outline title
        deck_name: validatedOutline.title || 'New Presentation',
        // Pass overage confirmation for Pro users who confirmed
        confirm_overage: options?.confirmOverage || false
      })
    });

    if (!response.ok) {
      if (response.status === 429) {
        // Rate limit error - provide helpful message
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) : 60;
        throw new Error(`Rate limit exceeded. Please wait ${waitTime} seconds before trying again.`);
      }
      throw new Error(`Failed to create deck: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    let deckId = '';
    let deckUrl = '';
    const decoder = new TextDecoder();
    let buffer = '';

    // Process streaming response
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const payload = line.slice(6).trim();
            if (!payload || payload === '""' || payload === 'null') {
              continue; // ignore empty payloads
            }
            const data = JSON.parse(payload);

            // Log slide events for debugging
            if (data.type === 'slide_completed' || data.type === 'slide_generated') {
              console.log('[GenerationCoordinator] Slide event:', {
                type: data.type,
                slide_index: data.slide_index,
                has_slide: !!data.slide,
                components: data.slide?.components?.length
              });
            }

            // Capture deck ID immediately
            if (data.deck_id && !deckId) {
              deckId = data.deck_id;
              deckUrl = data.deck_url || `/deck/${deckId}`;

              // Log for debugging
              console.log('[GenerationCoordinator] Deck created with ID:', deckId);

              // Store locked_slide_info for freemium gating if present
              if (data.locked_slide_info) {
                console.log('[GenerationCoordinator] Setting locked_slide_info:', data.locked_slide_info);
                const { updateDeckData } = useDeckStore.getState();
                updateDeckData({ locked_slide_info: data.locked_slide_info } as any);
              }
            }

            // Send event to progress tracker after critical IDs are captured.
            // Tracker failures should not prevent stream state from progressing.
            try {
              this.progressTracker.handleEvent(data);
            } catch (trackerError) {
              console.error('[GenerationCoordinator] Progress tracker failed for event:', data?.type, trackerError);
            }

            // Forward progress events to coordinator bus and optional callback
            // Use known deckId or fallback to event-provided ids
            this.handleProgress(deckId || data.deck_id || data.deck_uuid || '', data, onProgress);

            // Handle completion - only return on final completion events
            // DO NOT return on slides_generation_complete as backend still needs to finalize
            // and release the deck lock (otherwise frontend saves get 409 errors)
            if (data.type === 'deck_complete' || data.type === 'complete' || data.type === 'composition_complete') {
              console.log('[GenerationCoordinator] Generation completed:', data.type);

              // Small delay before enabling saves to ensure backend lock is fully released
              // Backend releases lock before sending completion event, but this is a safety buffer
              await new Promise(resolve => setTimeout(resolve, 150));

              // CRITICAL: Perform frontend finalization before allowing saves
              await this.finalizeDeck(deckId);

              // Reset deck status to allow saves
              useInteractionStore.getState().setDeckStatus({ state: 'completed' });
              if (typeof window !== 'undefined') {
                (window as any).__deckStatus = 'idle';
                // Timestamp so edit-mode entry can skip loadDeck shortly after generation
                (window as any).__generationCompletedTs = Date.now();

                // Dispatch deck_finalized event for components to react
                window.dispatchEvent(new CustomEvent('deck_finalized', {
                  detail: { deckId, deckUrl }
                }));

                // CRITICAL: Dispatch completion event to ChatPanel directly
                // The normal event flow may not propagate correctly, so dispatch directly
                window.dispatchEvent(new CustomEvent('add_system_message', {
                  detail: {
                    message: 'Your presentation is ready!',
                    metadata: {
                      type: 'generation_complete',
                      stage: 'generation_complete',
                      phase: 'generation_complete',
                      progress: 100,
                      isStreamingUpdate: false,
                      streamed: true,
                      deckId
                    }
                  }
                }));
                console.log('[GenerationCoordinator] Dispatched completion message to ChatPanel');
              }
              return { deckId, deckUrl };
            }

            // slides_generation_complete means slides are done but finalization is still in progress
            if (data.type === 'slides_generation_complete') {
              console.log('[GenerationCoordinator] Slides generated, waiting for finalization...');
              // Continue reading the stream - don't return yet
            }

            // Handle errors (treat non-fatal errors as informational)
            if (data.type === 'error') {
              const errorPayload: any = (data as any).data ?? data;
              const errorCode = errorPayload?.error || data?.error;
              const isValidation = typeof errorPayload?.message === 'string' && errorPayload.message.includes('validation error');
              const isFatal = Boolean(errorPayload?.fatal || errorPayload?.severity === 'fatal' || errorPayload?.code === 'fatal' || errorPayload?.stop_generation === true);

              // Handle insufficient credits error - this is fatal
              if (errorCode === 'INSUFFICIENT_CREDITS' || errorPayload?.error === 'INSUFFICIENT_CREDITS') {
                console.error('[GenerationCoordinator] Insufficient credits error:', errorPayload);
                const remaining = errorPayload?.remaining ?? 0;
                const required = errorPayload?.required ?? 0;
                const plan = errorPayload?.plan ?? 'free';
                const canUseOverage = errorPayload?.can_use_overage ?? false;
                const error = new Error(`INSUFFICIENT_CREDITS:${JSON.stringify({ remaining, required, plan, canUseOverage })}`);
                throw error;
              }

              // Handle billing error - this is fatal
              if (errorCode === 'BILLING_ERROR' || errorPayload?.error === 'BILLING_ERROR') {
                console.error('[GenerationCoordinator] Billing error:', errorPayload);
                throw new Error('BILLING_ERROR:Could not verify credit balance');
              }

              if (isValidation) {
                console.error('[GenerationCoordinator] Validation error:', errorPayload.message);
                throw new Error(`Validation Error: ${errorPayload.message}`);
              }

              if (isFatal) {
                console.error('[GenerationCoordinator] Fatal generation error:', errorPayload?.message || errorPayload);
                throw new Error(errorPayload?.message || 'Generation failed');
              }

              // Non-fatal error: forward to tracker/callbacks and continue stream
              console.warn('[GenerationCoordinator] Non-fatal generation error:', errorPayload);
              this.progressTracker.handleEvent(data);
              this.handleProgress(deckId || errorPayload.deck_id || errorPayload.deck_uuid || '', data, onProgress);
              continue;
            }
          } catch (e) {
            // Re-throw intentional errors (INSUFFICIENT_CREDITS, BILLING_ERROR, etc.)
            if (e instanceof Error && (
              e.message.startsWith('INSUFFICIENT_CREDITS:') ||
              e.message.startsWith('BILLING_ERROR:') ||
              e.message.startsWith('Validation Error:') ||
              e.message === 'Generation failed'
            )) {
              throw e;
            }
            // Ignore benign parse errors from keep-alive/comments; only log real JSON issues
            if (line.startsWith('data: ') && line.slice(6).trim().length > 0) {
              console.error('[GenerationCoordinator] Error parsing SSE data:', e);
            }
          }
        }
      }
    }

    if (!deckId) {
      throw new Error('No deck ID received from server');
    }

    // Skip deck name update - backend doesn't have a PUT endpoint for this
    // The deck name is already set during creation
    if (validatedOutline.title && deckId) {
      console.log('[GenerationCoordinator] Deck created with name:', validatedOutline.title);

      // Update the deck name in the store to match the outline title
      const { updateDeckData } = useDeckStore.getState();
      updateDeckData({ name: validatedOutline.title });
    }

    return { deckId, deckUrl };
    } catch (error) {
      // Reset status on any error to allow saves again
      resetStatus();
      throw error;
    }
  }

  /**
   * Stop generation for a deck
   */
  async stopGeneration(deckId: string): Promise<void> {
    const metadata = this.activeGenerations.get(deckId);
    if (!metadata) {
      console.log(`[GenerationCoordinator] No active generation found for ${deckId}`);
      return;
    }

    console.log(`[GenerationCoordinator] Stopping generation for ${deckId}`);

    // Abort the request
    metadata.abortController?.abort();

    // Stop the service
    if (metadata.service) {
      await metadata.service.stopGeneration();
    }

    // Clean up
    this.activeGenerations.delete(deckId);

    // Reset deck status to allow saves again
    useInteractionStore.getState().setDeckStatus({ state: 'idle' });
    if (typeof window !== 'undefined') {
      (window as any).__deckStatus = 'idle';
    }

    // Emit cancelled event
    this.dispatchEvent(new CustomEvent('generation:cancelled', {
      detail: { deckId, metadata }
    }));
  }

  /**
   * Handle progress events
   */
  private handleProgress(deckId: string, event: any, callback?: (event: any) => void): void {
    // Update metadata with latest progress
    const metadata = this.activeGenerations.get(deckId);
    if (metadata) {
      metadata.options.onProgress = callback;
    }

    // Emit progress event
    this.dispatchEvent(new CustomEvent('generation:progress', {
      detail: { deckId, event }
    }));

    // Call user callback
    callback?.(event);
  }

  /**
   * Handle completion
   */
  private handleComplete(deckId: string, callback?: () => void): void {
    const metadata = this.activeGenerations.get(deckId);
    if (!metadata) return;

    const duration = Date.now() - metadata.startTime;
    
    console.log(`[GenerationCoordinator] Generation completed for ${deckId}`, {
      requestId: metadata.requestId,
      duration: `${duration}ms`
    });

    // Clean up
    this.activeGenerations.delete(deckId);

    // Clear active flag if it matches this deck
    if (typeof window !== 'undefined' && (window as any)?.__activeGenerationDeckId === deckId) {
      try { delete (window as any).__activeGenerationDeckId; } catch {}
    }

    // Reset deck status to allow saves again
    // Skip if called from generateFromOutline (it handles status reset itself)
    if (!metadata.skipStatusReset) {
      useInteractionStore.getState().setDeckStatus({ state: 'idle' });
      if (typeof window !== 'undefined') {
        (window as any).__deckStatus = 'idle';
        (window as any).__generationCompletedTs = Date.now();
      }
    }

    // Emit complete event
    this.dispatchEvent(new CustomEvent('generation:completed', {
      detail: { deckId, metadata, duration }
    }));

    // Pause progress tracker when idle (only if not skipping - generateFromOutline will do it)
    if (!metadata.skipStatusReset) {
      try { this.progressTracker.pause(); } catch {}
    }

    // Call user callback
    callback?.();
  }

  /**
   * Handle errors
   */
  private handleError(deckId: string, error: Error, callback?: (error: Error) => void): void {
    const metadata = this.activeGenerations.get(deckId);
    if (!metadata) return;

    console.error(`[GenerationCoordinator] Generation failed for ${deckId}:`, error);

    // Clean up
    this.activeGenerations.delete(deckId);

    // Clear active flag if it matches this deck
    if (typeof window !== 'undefined' && (window as any)?.__activeGenerationDeckId === deckId) {
      try { delete (window as any).__activeGenerationDeckId; } catch {}
    }

    // Reset deck status to allow saves again (even on error)
    // Skip if called from generateFromOutline (it handles status reset itself)
    if (!metadata.skipStatusReset) {
      useInteractionStore.getState().setDeckStatus({ state: 'idle' });
      if (typeof window !== 'undefined') {
        (window as any).__deckStatus = 'idle';
      }
    }

    // Emit error event
    this.dispatchEvent(new CustomEvent('generation:failed', {
      detail: { deckId, metadata, error }
    }));

    // Pause progress tracker on failure as well (only if not skipping)
    if (!metadata.skipStatusReset) {
      try { this.progressTracker.pause(); } catch {}
    }

    // Call user callback
    callback?.(error);
  }

  /**
   * Finalize deck after generation completes
   * This marks all slides as completed and triggers a save
   */
  private async finalizeDeck(deckId: string): Promise<void> {
    console.log(`[GenerationCoordinator] Starting finalization for deck ${deckId}`);

    try {
      const store = useDeckStore.getState();
      const deckData = store.deckData;

      if (!deckData || !deckData.slides || deckData.slides.length === 0) {
        console.warn('[GenerationCoordinator] No slides found in deck during finalization');
        return;
      }

      // Mark all slides as completed
      const finalizedSlides = deckData.slides.map(slide => ({
        ...slide,
        status: 'completed' as const
      }));

      // Update local state with all slides marked as completed
      store.updateDeckData(
        {
          slides: finalizedSlides,
          status: {
            state: 'completed',
            progress: 100,
            phase: 'complete'
          }
        },
        { skipBackend: true }
      );

      console.log(`[GenerationCoordinator] Marked ${finalizedSlides.length} slides as completed`);

      // Small delay before saving to ensure backend lock is fully released
      await new Promise(resolve => setTimeout(resolve, 100));

      // Now trigger a save to the backend with the finalized state
      // This is safe because the backend has released the lock
      try {
        const { deckSyncService } = await import('@/lib/deckSyncService');
        const updatedDeckData = useDeckStore.getState().deckData;

        await deckSyncService.saveDeck(updatedDeckData);
        console.log(`[GenerationCoordinator] Successfully saved finalized deck ${deckId}`);
      } catch (saveError) {
        console.error(`[GenerationCoordinator] Error saving finalized deck:`, saveError);
        // Don't throw - the deck is still usable locally
      }

      // Pause progress tracker as generation is complete
      try { this.progressTracker.pause(); } catch {}

      console.log(`[GenerationCoordinator] Finalization complete for deck ${deckId}`);

    } catch (error) {
      console.error(`[GenerationCoordinator] Finalization failed for deck ${deckId}:`, error);
      // Don't throw - allow the completion flow to continue
    }
  }

  /**
   * Clean up all active generations (for app cleanup)
   */
  async cleanup(): Promise<void> {
    console.log('[GenerationCoordinator] Cleaning up all active generations');

    const promises = Array.from(this.activeGenerations.keys()).map(deckId =>
      this.stopGeneration(deckId).catch(e =>
        console.error(`[GenerationCoordinator] Error stopping generation for ${deckId}:`, e)
      )
    );

    await Promise.all(promises);
    this.activeGenerations.clear();
    this.generationHistory.clear();
  }
}
