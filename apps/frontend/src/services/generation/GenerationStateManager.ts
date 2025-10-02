export interface GenerationEvent {
  type: string;
  timestamp?: string;
  data?: {
    progress?: number;
    completed_steps?: number;
    total_steps?: number;
    message?: string;
    phase?: string;
    slide_index?: number;
    slide_title?: string;
    slides_completed?: number;
    slides_total?: number;
    slides_in_progress?: number;
    substep?: string;
    slide_data?: any;
    theme?: any;
    palette?: any;
    error?: string;
    reason?: string;
  };
  // Legacy fields for backward compatibility
  stage?: string;
  progress?: number;
  message?: string;
  slideIndex?: number;
  slideTitle?: string;
  [key: string]: any;
}

export interface ProcessedEvent {
  stage: string;
  progress: number;
  message: string;
  isComplete: boolean;
  isError: boolean;
  slideIndex?: number;
  slideTitle?: string;
  data?: any;
  phase?: string;
  substep?: string;
  // For outline_structure events
  title?: string;
  slideTitles?: string[];
  slidesCompleted?: number;
  slidesTotal?: number;
  slidesInProgress?: Set<number>;
  completedSlides?: Set<number>;
}

/**
 * Manages and processes generation state events with enhanced streaming support
 */
export class GenerationStateManager {
  private currentProgress: number = 0;
  private lastValidProgress: number = 0; // Track last valid progress to avoid NaN
  private totalSlides: number = 0;
  private completedSlides: Set<number> = new Set();
  private slidesInProgress: Set<number> = new Set();
  private currentPhase: string = 'initialization';
  private errors: Map<number, string> = new Map();

  processEvent(event: GenerationEvent): ProcessedEvent {
    // Handle new standardized event structure from backend
    if (event.data && typeof event.data === 'object') {
      return this.processStandardizedEvent(event);
    }
    
    // Handle legacy event structure for backward compatibility
    return this.processLegacyEvent(event);
  }

  private processStandardizedEvent(event: GenerationEvent): ProcessedEvent {
    const { type, data = {} } = event;
    
    
    // Always use backend-provided progress if available and valid
    if (data.progress !== undefined && !isNaN(data.progress)) {
      // Never allow progress to go backwards
      const newProgress = Math.max(this.currentProgress, data.progress);
      if (newProgress !== this.currentProgress) {
      }
      this.currentProgress = newProgress;
      this.lastValidProgress = newProgress; // Store last valid progress
    } else if (isNaN(this.currentProgress)) {
      // If current progress became NaN, restore from last valid
      this.currentProgress = this.lastValidProgress;
    }
    
    // Update phase from backend
    if (data.phase) {
      const oldPhase = this.currentPhase;
      this.currentPhase = data.phase;
      
      // Ensure minimum progress for each phase
      const minProgressForPhase = this.getMinProgressForPhase(data.phase);
      if (this.currentProgress < minProgressForPhase) {
        this.currentProgress = minProgressForPhase;
      }
      
      if (oldPhase !== data.phase) {
      }
    }
    
    // Update total slides if provided
    if (data.slides_total) {
      this.totalSlides = data.slides_total;
    }
    
    let stage = this.currentPhase;
    let message = data.message || '';
    let isComplete = false;
    let isError = false;
    
    // Handle specific event types
    switch (type) {
      case 'deck_creation_started':
        stage = 'initialization';
        message = message || 'Creating deck...';
        // Set totalSlides if available
        if (data.slides_total) {
          this.totalSlides = data.slides_total;
        }
        // Ensure minimum progress for initialization
        if (this.currentProgress < 5) {
          this.currentProgress = 5;
        }
        break;
        
      case 'phase_started':
        stage = data.phase || 'status_update';
        message = message || this.getPhaseMessage(data.phase);
        // Ensure minimum progress for the phase
        const minProgress = this.getMinProgressForPhase(data.phase);
        if (this.currentProgress < minProgress) {
          this.currentProgress = minProgress;
        }
        break;
        
      case 'substep_started':
        stage = this.currentPhase;
        message = message || this.getSubstepMessage(data.substep);
        break;
        
      case 'slide_started':
        stage = 'slide_generation';
        if (data.slide_index !== undefined) {
          this.slidesInProgress.add(data.slide_index);
          message = message || `Generating slide ${data.slide_index + 1}${data.slide_title ? ': ' + data.slide_title : ''}`;
        }
        break;
        
      case 'slide_generated':
      case 'slide_completed':
        stage = 'slide_completed';
        
        if (data.slide_index !== undefined) {
          this.slidesInProgress.delete(data.slide_index);
          this.completedSlides.add(data.slide_index);
          message = message || `Completed slide ${data.slide_index + 1}`;
          
          // Update progress based on slide completion
          if (this.totalSlides > 0) {
            const slideProgress = 55 + Math.floor((this.completedSlides.size / this.totalSlides) * 40);
            this.currentProgress = Math.max(this.currentProgress, slideProgress);
          } else {
            // If totalSlides not set, maintain current progress
            this.currentProgress = Math.max(this.currentProgress, this.lastValidProgress);
          }
        }
        break;
        
      case 'slide_error':
        stage = 'slide_error';
        isError = true;
        if (data.slide_index !== undefined) {
          this.slidesInProgress.delete(data.slide_index);
          this.errors.set(data.slide_index, data.error || 'Unknown error');
          message = `Error on slide ${data.slide_index + 1}: ${data.error}`;
        }
        break;
        
      case 'deck_complete':
      case 'deck_completed':
        stage = 'generation_complete';
        isComplete = true;
        this.currentProgress = 100;
        message = message || 'Your presentation is ready!';
        break;
        
      case 'error':
        stage = 'error';
        isError = true;
        message = data.error || 'An error occurred';
        break;
    }
    
    // Normalize any raw snake_case tokens coming from backend (e.g., "ai_generation")
    message = this.normalizeMessage(message, data.substep, this.currentPhase);

    return {
      stage,
      progress: this.currentProgress,
      message,
      isComplete,
      isError,
      slideIndex: data.slide_index,
      slideTitle: data.slide_title,
      data,
      phase: this.currentPhase,
      substep: data.substep,
      slidesCompleted: this.completedSlides.size,
      slidesTotal: this.totalSlides,
      slidesInProgress: new Set(this.slidesInProgress),
      completedSlides: new Set(this.completedSlides)
    };
  }

  private processLegacyEvent(event: GenerationEvent): ProcessedEvent {
    let stage = event.stage || 'status_update';
    let progress = event.progress || this.currentProgress;
    let message = event.message || '';
    let isComplete = false;
    let isError = false;
    let slideIndex = event.slideIndex;
    let slideTitle = event.slideTitle;
    
    // Check if this is a raw backend event wrapped in data
    if (event.type === 'data' && event.data) {
      const innerEvent = event.data as any;
      
      // Handle wrapped events
      if (innerEvent.type === 'slide_images_found') {
        stage = 'image_collection';
        progress = event.progress || this.currentProgress;
        const slideData = innerEvent.data || {};
        message = innerEvent.message || `Found images for slide ${(slideData.slide_index ?? 0) + 1}`;
        slideIndex = slideData.slide_index;
        
        
        // Return with the original event data preserved
        return {
          stage,
          progress: this.currentProgress,
          message,
          isComplete,
          isError,
          slideIndex,
          slideTitle,
          data: innerEvent // Pass the entire inner event
        };
      } else if (innerEvent.type === 'slide_generated') {
        stage = 'slide_completed';
        slideIndex = innerEvent.slide_index;
        slideTitle = innerEvent.slide_data?.title;
        
        if (slideIndex !== undefined) {
          this.completedSlides.add(slideIndex);
        }
        
        const completedCount = this.completedSlides.size;
        progress = 55 + Math.floor((completedCount / this.totalSlides) * 40);
        message = innerEvent.message || `✅ Completed slide ${(slideIndex ?? 0) + 1}${slideTitle ? ': ' + slideTitle : ''}`;
        
        // Return with the original event data preserved
        return {
          stage,
          progress: this.currentProgress,
          message,
          isComplete,
          isError,
          slideIndex,
          slideTitle,
          data: innerEvent // Pass the entire inner event
        };
      }
    }

    switch (event.type) {
      case 'outline_structure':
        stage = 'outline_structure';
        
        
        // Set totalSlides from outline structure
        if (event.slideTitles && Array.isArray(event.slideTitles)) {
          this.totalSlides = event.slideTitles.length;
        }
        message = message || 'Outline created';
        // Preserve the original event in data so title and slideTitles are accessible
        if (!event.data) {
          event.data = {
            title: event.title,
            slideTitles: event.slideTitles,
            slideCount: event.slideCount,
            slideTypes: event.slideTypes
          };
        }
        break;

      case 'theme_and_style_generated':
      case 'style_analysis_complete':
        stage = 'design_system_ready';
        progress = event.progress || 28;  // Updated for new theme generation range
        message = event.message || '📐 Design system ready';
        break;

      case 'images_search_started':
        stage = 'image_collection';
        progress = event.progress || 35;  // Updated for new image collection range
        message = event.message || '🔍 Searching for images...';
        break;

      case 'topic_images_found':
        stage = 'image_collection';
        const eventData = event.data as any;
        const topic = eventData?.topic || 'Unknown';
        const count = eventData?.image_count || eventData?.count || 0;
        message = `Found ${count} images for "${topic}"`;
        break;

      case 'slide_started':
        stage = 'slide_started';
        slideIndex = event.data?.slide_index ?? event.slide_index;
        slideTitle = event.data?.slide_title ?? event.slide_title;
        progress = this.currentProgress || 55;  // Updated for new slide generation range
        message = event.message || `⏳ Generating slide ${(slideIndex ?? 0) + 1}: ${slideTitle || 'Untitled'}`;
        break;

      case 'slide_complete':
      case 'slide_completed':
      case 'slide_generated':
        stage = 'slide_completed';
        slideIndex = event.data?.slide_index ?? event.slideIndex;
        slideTitle = event.data?.slide_title ?? event.slide_title;
        
        if (slideIndex !== undefined) {
          this.completedSlides.add(slideIndex);
        }
        
        const completedCount = this.completedSlides.size;
        progress = 55 + Math.floor((completedCount / this.totalSlides) * 40); // 55-95% range
        message = event.message || `✅ Completed slide ${(slideIndex ?? 0) + 1}${slideTitle ? ': ' + slideTitle : ''}`;
        break;
        
      case 'slide_images_found':
        // Handle images found event
        stage = 'image_collection'; 
        
        const slideImagesData = event.data as any;
        
        progress = event.progress || this.currentProgress;
        message = event.message || `Found images for slide ${(event.data?.slide_index ?? 0) + 1}`;
        break;

      case 'deck_complete':
      case 'complete':
      case 'deck_rendered':
      case 'outline_complete':
        isComplete = true;
        stage = 'generation_complete';
        progress = 100;
        message = 'Your presentation is ready!';
        break;

      case 'error':
      case 'warning':
        isError = event.type === 'error';
        stage = event.type;
        message = event.message || 'An error occurred';
        break;

      case 'status_update':
        stage = 'status_update';
        if (event.progress !== undefined) {
          progress = event.progress;
        }
        
        // Check for parallel generation
        if (event.message?.includes('Generating all slides in parallel')) {
                stage = 'slide_generation';
      const completedSlides = this.completedSlides.size;
      progress = 55 + Math.floor((completedSlides / this.totalSlides) * 40);
      message = `Generating all ${this.totalSlides} slides in parallel...`;
        }
        break;

      default:
        // Handle plain text messages based on content
        if (typeof event.message === 'string') {
          message = event.message;
          const processed = this.processPlainTextMessage(message);
          stage = processed.stage;
          progress = processed.progress || progress;
          isComplete = processed.isComplete;
          isError = processed.isError;
          
          if (processed.slideIndex !== undefined) {
            slideIndex = processed.slideIndex;
          }
        }
        break;
    }
    
    // Normalize any raw snake_case tokens coming from backend (legacy paths)
    const legacySubstep = (event.data as any)?.substep;
    message = this.normalizeMessage(message, legacySubstep, stage);

    // Update current progress
    this.currentProgress = Math.max(progress, this.currentProgress);

    // For outline_structure events, preserve the title and slideTitles
    let eventData = event.data;
    if (stage === 'outline_structure' && event.type === 'outline_structure') {
      eventData = {
        ...eventData,
        title: event.title,
        slideTitles: event.slideTitles,
        slideCount: event.slideCount,
        slideTypes: event.slideTypes
      };
    }
    
    return {
      stage,
      progress: this.currentProgress,
      message,
      isComplete,
      isError,
      slideIndex,
      slideTitle,
      data: eventData,
      // Also preserve title and slideTitles at the top level for backward compatibility
      title: event.title,
      slideTitles: event.slideTitles
    };
  }

  // Replace raw backend keys like "ai_generation" with friendly labels in messages
  private normalizeMessage(message: string, substep?: string, phase?: string): string {
    if (!message) return message;
    try {
      // If message equals the substep token, prefer the verbose substep message
      if (substep && (message === substep || message.toLowerCase() === substep.toLowerCase())) {
        return this.getSubstepMessage(substep);
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

  private processPlainTextMessage(message: string): {
    stage: string;
    progress?: number;
    isComplete: boolean;
    isError: boolean;
    slideIndex?: number;
  } {
    let stage = 'status_update';
    let progress: number | undefined;
    let isComplete = false;
    let isError = false;
    let slideIndex: number | undefined;

    if (message.includes('Generating all slides in parallel')) {
      stage = 'slide_generation';
      const completedSlides = this.completedSlides.size;
      progress = 55 + Math.floor((completedSlides / this.totalSlides) * 40);
    } else if (message.includes('🎨 Found palette')) {
      stage = 'palette_found';
      progress = 20;  // Adjusted for new theme generation range
    } else if (message.includes('📐 Design system ready')) {
      stage = 'design_system_ready';
      progress = 28;  // Adjusted for new theme generation range
    } else if (message.includes('⏳ Generating slide')) {
      stage = 'slide_started';
      const match = message.match(/Generating slide (\d+): (.+)/);
      if (match) {
        slideIndex = parseInt(match[1]) - 1;
      }
    } else if (message.includes('✅ Completed slide')) {
      stage = 'slide_completed';
      const match = message.match(/Completed slide (\d+)/);
      if (match) {
        slideIndex = parseInt(match[1]) - 1;
        if (slideIndex !== undefined) {
          this.completedSlides.add(slideIndex);
        }
      }
      const completedCount = this.completedSlides.size;
      progress = 55 + Math.floor((completedCount / this.totalSlides) * 40);
    } else if (message.includes('🎉 Deck generation complete')) {
      stage = 'generation_complete';
      progress = 100;
      isComplete = true;
    } else if (message.includes('❌ Error:')) {
      stage = 'error';
      isError = true;
    }

    return { stage, progress, isComplete, isError, slideIndex };
  }

  private getPhaseMessage(phase?: string): string {
    switch (phase) {
      case 'initialization':
        return '🚀 Initializing deck creation...';
      case 'theme_generation':
        return '🎨 Creating theme and design system...';
      case 'image_collection':
        return '🖼️ Processing media assets...';
      case 'slide_generation':
        return '📊 Generating slides...';
      case 'finalization':
        return '✨ Finalizing your presentation...';
      default:
        return 'Processing...';
    }
  }

  private getSubstepMessage(substep?: string): string {
    switch (substep) {
      case 'theme_creation':
        return 'Creating visual theme...';
      case 'palette_generation':
        return 'Generating color palette...';
      case 'preparing_context':
        return 'Preparing slide context...';
      case 'rag_lookup':
        return 'Finding best design patterns...';
      case 'ai_generation':
        return 'Generating slide content...';
      case 'saving':
        return 'Saving slide...';
      default:
        return 'Processing...';
    }
  }

  private getSlideSubstepMessage(substep?: string, slideIndex?: number): string {
    const slideNum = slideIndex !== undefined ? slideIndex + 1 : '?';
    switch (substep) {
      case 'preparing_context':
        return `Preparing context for slide ${slideNum}...`;
      case 'rag_lookup':
        return `Finding design patterns for slide ${slideNum}...`;
      case 'ai_generation':
        return `Generating content for slide ${slideNum}...`;
      case 'saving':
        return `Saving slide ${slideNum}...`;
      default:
        return `Processing slide ${slideNum}...`;
    }
  }

  private getMinProgressForPhase(phase?: string): number {
    switch (phase) {
      case 'initialization':
        return 0;
      case 'theme_generation':
        return 15;  // Changed from 5
      case 'image_collection':
        return 30;  // Changed from 10
      case 'slide_generation':
        return 55;  // Changed from 15
      case 'finalization':
        return 95;  // Unchanged
      default:
        return this.currentProgress; // Don't change if phase unknown
    }
  }

  reset(): void {
    this.currentProgress = 0;
    this.totalSlides = 0;
    this.completedSlides.clear();
    this.slidesInProgress.clear();
    this.currentPhase = 'initialization';
    this.errors.clear();
  }
} 