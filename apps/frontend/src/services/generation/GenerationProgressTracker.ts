// GenerationProgressTracker.ts - Unified progress tracking for deck generation
import { EventEmitter } from 'events';

export interface GenerationPhase {
  id: string;
  label: string;
  emoji: string;
  progressRange: [number, number];
  substeps?: { [key: string]: string };
}

export interface ProgressState {
  phase: string;
  progress: number;
  smoothProgress: number; // Interpolated progress for smooth animation
  message: string;
  currentSlide: number | null;
  totalSlides: number | null;
  startTime: number;
  elapsedTime: number;
  estimatedTime: number | null;
  slides: SlideProgress[];
  images: { [slideId: string]: ImageData };
  topicImages?: { [topic: string]: any[] }; // Images grouped by topic
}

export interface SlideProgress {
  id: string;
  index: number;
  title: string;
  status: 'pending' | 'generating' | 'completed' | 'error';
  progress: number;
  hasImages: boolean;
}

export interface ImageData {
  slideId: string;
  slideIndex: number;
  images: any[];
  imagesByTopic: { [topic: string]: any[] };
  status: 'loading' | 'ready' | 'error';
}

export class GenerationProgressTracker extends EventEmitter {
  private static instance: GenerationProgressTracker;
  
  private state: ProgressState;
  private animationFrame: number | null = null;
  private targetProgress: number = 0;
  private progressVelocity: number = 0;
  private lastProgressEmitTs: number = 0;
  private lastEmittedProgress: number = -1;
  private pendingUpdateTimeout: number | null = null;
  private readonly MIN_PROGRESS_EMIT_INTERVAL_MS = 100; // Throttle UI updates to ~10fps
  private readonly MIN_PROGRESS_DELTA = 1; // Only emit if >=1% change
  private readonly DEBUG_PROGRESS: boolean =
    (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_DEBUG_PROGRESS === 'true') ||
    (typeof window !== 'undefined' && (window as any).__DEBUG_PROGRESS === true);
  private isAnimating: boolean = false;
  
  // Phase configuration based on backend documentation
  private phases: { [key: string]: GenerationPhase } = {
    initialization: {
      id: 'initialization',
      label: 'Setting up',
      emoji: '🚀',
      progressRange: [0, 15],
      substeps: {
        'deck_setup': 'Creating deck structure',
        'validation': 'Validating outline',
        'db_creation': 'Saving to database'
      }
    },
    theme_generation: {
      id: 'theme_generation',
      label: 'Creating theme',
      emoji: '🎨',
      progressRange: [15, 30],
      substeps: {
        'colors': 'Selecting color palette',
        'fonts': 'Choosing typography',
        'design': 'Creating design system'
      }
    },
    image_collection: {
      id: 'image_collection',
      label: 'Finding images',
      emoji: '🖼️',
      progressRange: [30, 55],
      substeps: {
        'search': 'Searching image libraries',
        'analysis': 'Analyzing relevance',
        'optimization': 'Optimizing images'
      }
    },
    slide_generation: {
      id: 'slide_generation',
      label: 'Generating slides',
      emoji: '📝',
      progressRange: [55, 95]
    },
    finalization: {
      id: 'finalization',
      label: 'Finalizing',
      emoji: '✨',
      progressRange: [95, 100],
      substeps: {
        'visual_analysis': 'Analyzing visual coherence',
        'final_save': 'Saving final deck'
      }
    }
  };
  
  private constructor() {
    super();
    this.state = this.getInitialState();
    this.startProgressAnimation();
  }
  
  static getInstance(): GenerationProgressTracker {
    if (!GenerationProgressTracker.instance) {
      GenerationProgressTracker.instance = new GenerationProgressTracker();
    }
    return GenerationProgressTracker.instance;
  }
  
  private getInitialState(): ProgressState {
    return {
      phase: 'initialization',
      progress: 0,
      smoothProgress: 0,
      message: 'Initializing...',
      currentSlide: null,
      totalSlides: null,
      startTime: Date.now(),
      elapsedTime: 0,
      estimatedTime: null,
      slides: [],
      images: {}
    };
  }
  
  reset() {
    if (this.DEBUG_PROGRESS) console.log('[GenerationProgressTracker] Resetting progress tracker');
    this.state = this.getInitialState();
    this.state.topicImages = {};
    this.targetProgress = 0;
    this.progressVelocity = 0;
    this.emit('reset');
  }
  
  // Handle backend events
  handleEvent(event: any) {
    if (this.DEBUG_PROGRESS) console.log('[ProgressTracker] Event:', event.type, event);
    
    // Extra debugging for image-related events
    if (this.DEBUG_PROGRESS && event.type && (event.type.includes('image') || event.type.includes('Image'))) {
      console.log('[ProgressTracker] IMAGE EVENT FULL:', event);
    }
    
    switch (event.type) {
      case 'deck_created':
        this.handleDeckCreated(event);
        break;
        
      case 'progress':
        this.handleProgressEvent(event.data || event);
        break;
        
      case 'phase_update':
        this.handlePhaseUpdate(event);
        break;
        
      case 'slide_started':
        this.handleSlideStarted(event);
        break;
        
      case 'slide_progress':
        this.handleSlideProgress(event);
        break;
        
      case 'slide_completed':
        console.log('[ProgressTracker] Handling slide_completed event:', {
          type: event.type,
          slide_index: event.slide_index,
          has_slide: !!event.slide,
          slide_components: event.slide?.components?.length
        });
        this.handleSlideCompleted(event);
        break;
        
      case 'slide_generated':
        console.log('[ProgressTracker] Handling slide_generated event:', event);
        // Treat slide_generated same as slide_completed
        this.handleSlideCompleted(event);
        break;
        
      case 'slide_images_available':
      case 'slide_images_found':
        this.handleSlideImages(event);
        break;
        
      case 'topic_images_found':
        this.handleTopicImages(event);
        break;
        
      // Handle the actual events the backend sends
      case 'images_collection_complete':
      case 'images_ready_for_selection':
        if (this.DEBUG_PROGRESS) console.log('[ProgressTracker] IMAGE EVENT FULL:', event);
        if (this.DEBUG_PROGRESS) console.log('[ProgressTracker] Got image collection event, checking for data:', event);
        // These events might contain the image data
        if (event.data) {
          // Handle multiple data structures for backwards compatibility
          const eventData = event.data;
          
          // Check for images_by_slide structure
          if (eventData.images_by_slide) {
            console.log('[ProgressTracker] Found images_by_slide structure:', eventData.images_by_slide);
            Object.entries(eventData.images_by_slide).forEach(([slideKey, slideData]: [string, any]) => {
              console.log(`[ProgressTracker] Processing slide ${slideKey}:`, slideData);
              
              // Handle different possible structures
              let slideId = slideKey;
              let slideIndex = 0;
              let images: any[] = [];
              let slideTitle = '';
              
              // If slideData is an array, it's the images
              if (Array.isArray(slideData)) {
                images = slideData;
                // Try to extract index from key like "slide_0"
                const indexMatch = slideKey.match(/slide[_-]?(\d+)/i);
                if (indexMatch) {
                  slideIndex = parseInt(indexMatch[1]);
                }
              } 
              // If slideData is an object with images property
              else if (slideData && typeof slideData === 'object') {
                images = slideData.images || slideData.availableImages || [];
                slideIndex = slideData.slide_index !== undefined ? slideData.slide_index : 0;
                slideTitle = slideData.slide_title || slideData.title || '';
                slideId = slideData.slide_id || slideKey;
              }
              
              if (images.length > 0) {
                console.log(`[ProgressTracker] Processing ${images.length} images for slide ${slideId} (index: ${slideIndex})`);
                
                // Cache directly to window.__slideImageCache
                if (!window.__slideImageCache) {
                  window.__slideImageCache = {};
                }
                
                // Process images
                const processedImages = images.map((img: any, index: number) => ({
                  id: img.id || `img-${Date.now()}-${index}`,
                  url: img.url,
                  thumbnail: img.thumbnail || img.url,
                  alt: img.alt || img.description || '',
                  caption: img.caption || '',
                  relevance_score: img.relevance_score || 1,
                  source: img.source || 'generation',
                  photographer: img.photographer,
                  photographer_url: img.photographer_url,
                  topic: img.topic || img.category || slideTitle?.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'general',
                  width: img.width,
                  height: img.height,
                  src: {
                    thumbnail: img.thumbnail,
                    small: img.small || img.thumbnail,
                    medium: img.medium || img.url,
                    large: img.large || img.url,
                    original: img.url
                  }
                }));
                
                // Group by topic
                const imagesByTopic: Record<string, any[]> = {};
                processedImages.forEach((img: any) => {
                  const topic = img.topic;
                  if (!imagesByTopic[topic]) {
                    imagesByTopic[topic] = [];
                  }
                  imagesByTopic[topic].push(img);
                });
                
                // Store in cache
                window.__slideImageCache[slideId] = {
                  slideId: slideId,
                  slideIndex: slideIndex,
                  slideTitle: slideTitle || `Slide ${slideIndex + 1}`,
                  images: processedImages,
                  topics: Object.keys(imagesByTopic),
                  images_by_topic: imagesByTopic
                };
                
                console.log(`[ProgressTracker] Cached ${processedImages.length} images for slide ${slideId} with topics:`, Object.keys(imagesByTopic));
                
                // Also handle through normal flow
                this.handleSlideImages({
                  type: 'slide_images_found',
                  data: {
                    slide_id: slideId,
                    slide_index: slideIndex,
                    images: images,
                    images_by_topic: imagesByTopic
                  }
                });
              }
            });
          }
          
          // Also check for slide_images array structure (newer format)
          if (eventData.slide_images && Array.isArray(eventData.slide_images)) {
            if (this.DEBUG_PROGRESS) console.log('[ProgressTracker] Processing slide_images array:', eventData.slide_images);
            eventData.slide_images.forEach((slideImageData: any) => {
              if (slideImageData.slide_id && slideImageData.images_by_topic) {
                this.handleSlideImages({
                  type: 'slide_images_found',
                  data: slideImageData
                });
              }
            });
          }
          
          // Check if the data itself contains slide image information
          if (eventData.deck_id && eventData.slide_index !== undefined && eventData.images_by_topic) {
            if (this.DEBUG_PROGRESS) console.log('[ProgressTracker] Processing single slide image data');
            this.handleSlideImages({
              type: 'slide_images_found',
              data: eventData
            });
          }
        }
        break;
        
      case 'deck_complete':
        this.handleDeckComplete(event);
        break;
        
      case 'error': {
        const payload = event?.data || event;
        // Treat non-fatal errors as status updates; only emit error for fatal ones
        if (payload?.fatal || payload?.severity === 'fatal' || payload?.code === 'fatal' || payload?.stop_generation === true) {
          this.handleError(payload);
        } else {
          // Non-fatal: update message but keep progression
          this.state.message = payload?.message || this.state.message || 'Working…';
          // Mark slide as error if slide_index is provided
          const slideIdx = typeof payload?.slide_index === 'number' ? payload.slide_index : undefined;
          if (slideIdx !== undefined) {
            // Ensure slides array is large enough
            while (this.state.slides.length <= slideIdx) {
              this.state.slides.push({
                id: '',
                index: this.state.slides.length,
                title: `Slide ${this.state.slides.length + 1}`,
                status: 'pending',
                progress: 0,
                hasImages: false
              });
            }
            const prev = this.state.slides[slideIdx];
            this.state.slides[slideIdx] = {
              ...prev,
              status: 'error',
              progress: prev?.progress ?? 0
            };
            // Broadcast a DOM event for listeners
            try {
              window.dispatchEvent(new CustomEvent('slide_error', {
                detail: {
                  slide_index: slideIdx,
                  message: payload?.message,
                  error: payload?.error
                }
              }));
            } catch {}
          }
          // Do not emit('error') to avoid unhandled emitter errors
        }
        break;
      }
    }
    
    this.updateEstimatedTime();
    // Coalesce update events to avoid re-render storms
    const isPriority = event.type === 'deck_complete' || event.type === 'error' || event.type === 'slide_completed';
    this.queueUpdateEmit(isPriority);
  }

  private queueUpdateEmit(priority = false) {
    if (priority) {
      if (this.pendingUpdateTimeout) {
        clearTimeout(this.pendingUpdateTimeout);
        this.pendingUpdateTimeout = null;
      }
      this.emit('update', this.state);
      return;
    }
    if (this.pendingUpdateTimeout != null) return;
    this.pendingUpdateTimeout = window.setTimeout(() => {
      this.pendingUpdateTimeout = null;
      this.emit('update', this.state);
    }, this.MIN_PROGRESS_EMIT_INTERVAL_MS);
  }
  
  private handleDeckCreated(event: any) {
    this.state.phase = 'initialization';
    this.setTargetProgress(5);
    this.state.message = 'Deck created, starting generation...';
  }
  
  private handleProgressEvent(data: any) {
    const { phase, progress, message, currentSlide, totalSlides, substep } = data;
    
    if (phase && this.phases[phase]) {
      this.state.phase = phase;
      
      // Calculate progress within phase range
      if (progress !== undefined) {
        this.setTargetProgress(progress);
      }
    }
    
    if (message) {
      this.state.message = this.formatMessage(message, phase, substep);
    }
    
    if (currentSlide !== undefined) {
      this.state.currentSlide = currentSlide;
    }
    
    if (totalSlides !== undefined) {
      this.state.totalSlides = totalSlides;
      this.initializeSlides(totalSlides);
    }
  }
  
  private handlePhaseUpdate(event: any) {
    const { phase, progress, message } = event;
    
    if (phase && this.phases[phase]) {
      this.state.phase = phase;
      
      // Use phase progress range if no explicit progress
      if (progress === undefined) {
        const [min] = this.phases[phase].progressRange;
        this.setTargetProgress(min);
      } else {
        this.setTargetProgress(progress);
      }
      
      this.state.message = message || this.phases[phase].label;
    }
  }
  
  private handleSlideStarted(event: any) {
    const { slide_index, slide_id, title, message, total_slides } = event;
    
    // Initialize slides array if needed
    if (total_slides && this.state.slides.length === 0) {
      this.initializeSlides(total_slides);
    }
    
    if (slide_index !== undefined) {
      // Ensure the slides array is large enough
      while (this.state.slides.length <= slide_index) {
        this.state.slides.push({
          id: '',
          index: this.state.slides.length,
          title: `Slide ${this.state.slides.length + 1}`,
          status: 'pending',
          progress: 0,
          hasImages: false
        });
      }
      
      this.state.slides[slide_index] = {
        id: slide_id,
        index: slide_index,
        title: title || `Slide ${slide_index + 1}`,
        status: 'generating',
        progress: 0,
        hasImages: false
      };
      
      this.state.currentSlide = slide_index + 1;
      this.state.message = message || `Generating slide ${slide_index + 1}: ${title || ''}`;
      
      // Dispatch DOM event for other components to listen
      window.dispatchEvent(new CustomEvent('slide_started', {
        detail: {
          slide_index,
          slide_id,
          title
        }
      }));
    }
  }
  
  private handleSlideProgress(event: any) {
    const { slide_index, progress, substep, message } = event.data || event;
    
    if (slide_index !== undefined && this.state.slides[slide_index]) {
      this.state.slides[slide_index].progress = progress || 0;
      
      if (message) {
        this.state.message = message;
      }
    }
  }
  
  private handleSlideCompleted(event: any) {
    const { slide_index, slide_id, slide } = event;
    
    if (slide_index !== undefined) {
      // Ensure the slides array is large enough
      while (this.state.slides.length <= slide_index) {
        this.state.slides.push({
          id: '',
          index: this.state.slides.length,
          title: `Slide ${this.state.slides.length + 1}`,
          status: 'pending',
          progress: 0,
          hasImages: false
        });
      }
      
      this.state.slides[slide_index] = {
        ...this.state.slides[slide_index],
        status: 'completed',
        progress: 100,
        ...(slide ? { title: slide.title } : {})
      };
      
      // Check if we have cached images for this slide
      if (slide_id && this.state.images[slide_id]) {
        this.state.slides[slide_index].hasImages = true;
      }
      
      // Update progress based on completed slides
      const completedCount = this.state.slides.filter(s => s.status === 'completed').length;
      const slideProgress = 55 + (completedCount / this.state.totalSlides) * 40;
      this.setTargetProgress(slideProgress);
      
      // Dispatch DOM event for other components to listen
      window.dispatchEvent(new CustomEvent('slide_completed', {
        detail: {
          slide_index,
          slide_id,
          slide_data: slide
        }
      }));
    }
    
    this.updateOverallProgress();
  }
  
  private handleSlideImages(event: any) {
    const data = event.data || event;
    const { slide_id, slide_index, images, images_by_topic } = data;
    
    if (slide_id) {
      this.state.images[slide_id] = {
        slideId: slide_id,
        slideIndex: slide_index,
        images: images || [],
        imagesByTopic: images_by_topic || {},
        status: 'ready'
      };
      
      // Update slide status
      if (slide_index !== undefined && this.state.slides[slide_index]) {
        this.state.slides[slide_index].hasImages = true;
      }
      
      // Dispatch to global cache for ImagePicker
      this.cacheImagesGlobally(slide_id, data);
      
      this.emit('imagesAvailable', { slideId: slide_id, data: this.state.images[slide_id] });
    }
  }
  
  private handleTopicImages(event: any) {
    const data = event.data || event;
    const { topic, images_count, images } = data;
    
    console.log(`[ProgressTracker] Topic images found: ${images_count} for topic "${topic}"`);
    
    // Store topic images for potential reuse
    if (!this.state.topicImages) {
      this.state.topicImages = {};
    }
    
    if (topic && images && images.length > 0) {
      this.state.topicImages[topic] = images;
      
      // Also cache globally for the image picker
      if (!window.__topicImageCache) {
        window.__topicImageCache = {};
      }
      window.__topicImageCache[topic] = images;
    }
  }
  
  private handleDeckComplete(event: any) {
    this.setTargetProgress(100);
    this.state.phase = 'finalization';
    this.state.message = 'Your presentation is ready!';
    
    // Mark all slides as completed
    this.state.slides.forEach(slide => {
      slide.status = 'completed';
      slide.progress = 100;
    });
    
    // Dispatch DOM event for other components to listen
    window.dispatchEvent(new CustomEvent('deck_complete', {
      detail: event
    }));
  }
  
  private handleError(event: any) {
    this.state.message = event?.message || 'An error occurred';
    // Safely emit 'error' only if there are listeners to avoid unhandled error crashes
    try {
      if (this.listenerCount && this.listenerCount('error') > 0) {
        this.emit('error', event);
      } else {
        console.warn('[GenerationProgressTracker] Error event with no listeners:', event);
      }
    } catch (emitErr) {
      console.error('[GenerationProgressTracker] Unexpected error while emitting:', emitErr);
    }
  }
  
  private initializeSlides(count: number) {
    if (this.state.slides.length === 0) {
      this.state.slides = Array.from({ length: count }, (_, i) => ({
        id: '',
        index: i,
        title: `Slide ${i + 1}`,
        status: 'pending',
        progress: 0,
        hasImages: false
      }));
    }
  }
  
  private updateOverallProgress() {
    if (this.state.slides.length === 0) return;
    
    const completedSlides = this.state.slides.filter(s => s.status === 'completed').length;
    const slideProgress = (completedSlides / this.state.slides.length) * 40; // Slides are 40% of total
    
    // Calculate minimum progress based on phase
    const phaseProgress = this.phases.slide_generation.progressRange[0];
    
    this.setTargetProgress(Math.max(phaseProgress + slideProgress, this.targetProgress));
  }
  
  private formatMessage(message: string, phase?: string, substep?: string): string {
    // Normalize raw backend tokens (e.g., ai_generation)
    const normalized = this.normalizeTokens(message, substep, phase);
    // Add emoji if not already present
    if (phase && this.phases[phase] && !normalized.match(/^[🚀🎨🖼️📝✨]/)) {
      return `${this.phases[phase].emoji} ${normalized}`;
    }
    return normalized;
  }
  
  private setTargetProgress(progress: number) {
    // If we're in slide generation phase, calculate based on slide completion
    if (this.state.phase === 'slide_generation' && this.state.totalSlides > 0) {
      const completedSlides = this.state.slides.filter(s => s.status === 'completed').length;
      const slideProgress = 55 + (completedSlides / this.state.totalSlides) * 40;
      this.targetProgress = Math.max(this.targetProgress, Math.min(95, slideProgress));
    } else {
      // For other phases, ensure we respect phase boundaries
      const phase = this.phases[this.state.phase];
      if (phase) {
        const [min, max] = phase.progressRange;
        // If progress is 0-100, map it to phase range
        if (progress <= 100) {
          const phaseProgress = min + (progress / 100) * (max - min);
          this.targetProgress = Math.max(this.targetProgress, Math.min(max, phaseProgress));
        } else {
          // Direct progress value
          this.targetProgress = Math.max(this.targetProgress, Math.min(100, progress));
        }
      } else {
        this.targetProgress = Math.max(this.targetProgress, Math.min(100, progress));
      }
    }
  }

  // Replace raw backend keys like "ai_generation" with friendly labels
  private normalizeTokens(message: string, substep?: string, phase?: string): string {
    if (!message) return message;
    try {
      // If message equals the substep token, prefer a friendly label
      if (substep && (message === substep || message.toLowerCase() === substep.toLowerCase())) {
        const substepMap: Record<string, string> = {
          ai_generation: 'AI Generation',
          rag_lookup: 'RAG Lookup',
          theme_creation: 'Theme Creation',
          palette_generation: 'Palette Generation',
          preparing_context: 'Preparing Context',
          saving: 'Saving'
        };
        return substepMap[substep] || message;
      }
      const tokenMap: Record<string, string> = {
        ai_generation: 'AI Generation',
        rag_lookup: 'RAG Lookup',
        theme_creation: 'Theme Creation',
        palette_generation: 'Palette Generation',
        preparing_context: 'Preparing Context',
        saving: 'Saving',
        image_collection: 'Image Collection',
        slide_generation: 'Slide Generation',
        theme_generation: 'Theme Generation',
        initialization: 'Initialization',
        finalization: 'Finalization'
      };
      let normalized = message;
      for (const [token, label] of Object.entries(tokenMap)) {
        const re = new RegExp(`\\b${token}\\b`, 'gi');
        normalized = normalized.replace(re, label);
      }
      return normalized;
    } catch {
      return message;
    }
  }
  
  private updateEstimatedTime() {
    const elapsed = Date.now() - this.state.startTime;
    this.state.elapsedTime = elapsed;
    
    if (this.state.progress > 10 && this.state.progress < 95) {
      const rate = this.state.progress / elapsed;
      const remaining = (100 - this.state.progress) / rate;
      this.state.estimatedTime = remaining;
    }
  }
  
  private cacheImagesGlobally(slideId: string, data: any) {
    // Initialize global cache
    if (!window.__slideImageCache) {
      window.__slideImageCache = {};
    }
    
    // Process and cache images
    const processedImages = this.processImages(data);
    
    window.__slideImageCache[slideId] = {
      slideId: slideId,
      slideIndex: data.slide_index,
      slideTitle: data.slide_title || `Slide ${data.slide_index + 1}`,
      images: processedImages.images,
      images_by_topic: processedImages.imagesByTopic,
      topics: data.topics || Object.keys(processedImages.imagesByTopic)
    };
    
    // Also cache by slide index for easier lookup
    if (data.slide_index !== undefined) {
      window.__slideImageCache[`slide_index_${data.slide_index}`] = window.__slideImageCache[slideId];
    }
    
    // Dispatch custom event for components
    window.dispatchEvent(new CustomEvent('slide_images_available', {
      detail: {
        slideId: slideId,
        slideIndex: data.slide_index,
        images: processedImages.images
      }
    }));
  }
  
  private processImages(data: any) {
    const images: any[] = [];
    const imagesByTopic: { [topic: string]: any[] } = {};
    const seenUrls = new Set<string>();
    
    // Process images_by_topic if available
    if (data.images_by_topic) {
      Object.entries(data.images_by_topic).forEach(([topic, topicImages]: [string, any]) => {
        if (Array.isArray(topicImages)) {
          imagesByTopic[topic] = [];
          topicImages.forEach((img: any) => {
            if (!seenUrls.has(img.url)) {
              seenUrls.add(img.url);
              const processedImg = { ...img, topic };
              images.push(processedImg);
              imagesByTopic[topic].push(processedImg);
            }
          });
        }
      });
    }
    
    // Add any additional images from flat array
    if (data.images && Array.isArray(data.images)) {
      data.images.forEach((img: any) => {
        if (!seenUrls.has(img.url)) {
          seenUrls.add(img.url);
          images.push(img);
        }
      });
    }
    
    return { images, imagesByTopic };
  }
  
  // Smooth progress animation
  private startProgressAnimation() {
    const animate = () => {
      // Smooth interpolation towards target
      const diff = this.targetProgress - this.state.smoothProgress;
      const acceleration = diff * 0.1; // Acceleration based on distance
      this.progressVelocity = this.progressVelocity * 0.9 + acceleration; // Damping
      
      // Update smooth progress
      this.state.smoothProgress += this.progressVelocity;
      this.state.progress = Math.round(this.state.smoothProgress);
      
      // Throttled progressUpdate emit to reduce UI churn
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const shouldEmit =
        (now - this.lastProgressEmitTs) >= this.MIN_PROGRESS_EMIT_INTERVAL_MS ||
        Math.abs(this.state.progress - this.lastEmittedProgress) >= this.MIN_PROGRESS_DELTA;
      if (shouldEmit) {
        this.emit('progressUpdate', this.state);
        this.lastProgressEmitTs = now;
        this.lastEmittedProgress = this.state.progress;
      }
      
      if (this.isAnimating) {
        this.animationFrame = requestAnimationFrame(animate);
      }
    };
    
    if (!this.isAnimating) {
      this.isAnimating = true;
      this.animationFrame = requestAnimationFrame(animate);
    }
  }

  // Public controls to pause/resume animation when idle
  pause() {
    this.isAnimating = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }
  resume() {
    if (!this.isAnimating) {
      this.startProgressAnimation();
    }
  }
  
  destroy() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    this.removeAllListeners();
  }
  
  getState(): ProgressState {
    return { ...this.state };
  }
}