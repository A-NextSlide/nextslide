import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { processImageUrls } from '@/utils/imageUtils';
// Removed font optimization service
import { GenerationCoordinator } from '@/services/generation/GenerationCoordinator';
import { GenerationStateManager } from '@/services/generation/GenerationStateManager';
import { useDeckStore } from '@/stores/deckStore';
import { useThemeStore } from '@/stores/themeStore';
import { CompleteDeckData } from '@/types/DeckTypes';
import { ComponentInstance } from '@/types/components';
import { DeckStatus } from '@/types/DeckTypes';
import '@/utils/debugImageCache'; // Import debug utilities

// Extend Window interface to include our global image cache
declare global {
  interface Window {
    __slideImageCache?: Record<string, {
      slideId: string;
      slideIndex: number;
      slideTitle: string;
      images: any[];
      topics?: string[];
      images_by_topic?: Record<string, any[]>;
    }>;
    __topicImageCache?: Record<string, any[]>;
  }
}

// Helper function to process and cache available images
function cacheAvailableImages(slideId: string, slideIndex: number, slideData: any) {
  if (!slideData.availableImages || slideData.availableImages.length === 0) {
    return;
  }
  
  // Initialize cache if needed
  if (!window.__slideImageCache) {
    window.__slideImageCache = {};
  }
  
  // Transform availableImages to the format expected by image picker
  const images = slideData.availableImages.map((img: any, index: number) => {
    // Use the actual structure from the guide
    return {
      id: img.id || `img-${Date.now()}-${index}`,
      url: img.url,
      thumbnail: img.thumbnail || img.url, // Use thumbnail if available
      alt: img.alt || img.description || '',
      caption: img.caption || '',
      relevance_score: img.relevance_score || 1,
      source: img.source || 'generation', // google, openai, unsplash, etc.
      photographer: img.photographer,
      photographer_url: img.photographer_url,
      topic: img.topic || img.category || slideData.title?.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'general',
      width: img.width,
      height: img.height,
      // Support for image picker's src structure
      src: {
        thumbnail: img.thumbnail,
        small: img.small || img.thumbnail,
        medium: img.medium || img.url,
        large: img.large || img.url,
        original: img.url
      }
    };
  });
  
  // Group images by topic
  const imagesByTopic: Record<string, any[]> = {};
  images.forEach((img: any) => {
    const topic = img.topic;
    if (!imagesByTopic[topic]) {
      imagesByTopic[topic] = [];
    }
    imagesByTopic[topic].push(img);
  });
  
  // Extract unique topics
  const topics = Object.keys(imagesByTopic).filter(topic => 
    topic !== 'general' || Object.keys(imagesByTopic).length === 1
  );
  
  // Store in cache
  window.__slideImageCache[slideId] = {
    slideId: slideId,
    slideIndex: slideIndex,
    slideTitle: slideData.title || `Slide ${slideIndex + 1}`,
    images: images,
    topics: topics,
    images_by_topic: imagesByTopic
  };
  
  console.log(`[ImageCache] Cached ${images.length} images for slide ${slideId} with topics: ${topics.join(', ')}`);
  
  // Dispatch event to notify image picker
  window.dispatchEvent(new CustomEvent('slide_images_available', {
    detail: {
      slideId: slideId,
      slideIndex: slideIndex,
      images: images
    }
  }));
}

export interface UseSlideGenerationOptions {
  onProgress?: (event: any) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

// Check if a deck has text components with overflow
// Removed overflow checking tied to font optimization

export function useSlideGeneration(deckId: string, options: UseSlideGenerationOptions = {}) {
  const coordinator = useMemo(() => GenerationCoordinator.getInstance(), []);
  const [isGenerating, setIsGenerating] = useState(() => coordinator.isGenerating(deckId));
  
  // Initialize with creating state if we're already generating
  const [deckStatus, setDeckStatus] = useState<DeckStatus | null>(() => {
    if (coordinator.isGenerating(deckId)) {
      return {
        state: 'creating',
        progress: 0,
        message: 'Initializing deck generation...',
        currentSlide: 0,
        totalSlides: 0,
        startedAt: new Date().toISOString()
      };
    }
    return null;
  });
  const [lastSystemMessage, setLastSystemMessage] = useState<any>(null);
  
  // Track processed slides to prevent duplicates
  const processedSlidesRef = useRef<Set<string>>(new Set());
  
  // Track slide progress
  const slidesInProgressRef = useRef<Set<number>>(new Set());
  const completedSlidesRef = useRef<Set<number>>(new Set());
  // Track compact Theme UI state for chat relays
  const themePlanShownRef = useRef(false);
  const themeReadyShownRef = useRef(false);
  const themeToolDedupRef = useRef<Map<string, number>>(new Map());
  const themeEventPostedKeysRef = useRef<Set<string>>(new Set());
  const THEME_DEDUP_WINDOW_MS = 2500;
  
  // Track if we've created placeholder slides
  const placeholdersCreatedRef = useRef(false);
  
  // Track last save time to debounce saves
  const lastSaveTimeRef = useRef(0);
  const SAVE_DEBOUNCE_MS = 2000; // Save every 2 seconds max
  
  const stateManager = useMemo(() => new GenerationStateManager(), []);
  const { toast } = useToast();

  const getStateFromEvent = (event: any): 'creating' | 'generating' | 'completed' | 'error' => {
    // Map backend event types to frontend states
    switch (event.type || event.stage) {
      case 'deck_creation_started':
      case 'deck_created':
      case 'initialization':
        return 'creating';
      case 'deck_complete':
      case 'composition_complete':
        return 'completed';
      case 'error':
      case 'slide_error':
        return 'error';
      default:
        // Any other event means we're generating
        return 'generating';
    }
  };

  // Track last message to prevent duplicates
  const lastMessageRef = useRef<{ message: string; progress: number; timestamp: number }>({ 
    message: '', 
    progress: -1,
    timestamp: 0 
  });
  
  const handleProgress = useCallback((event: any) => {
    // Log ALL events to debug what's being sent
    console.log('[useSlideGeneration] RAW EVENT:', {
      type: event.type,
      stage: event.stage,
      data: event.data,
      hasInnerData: !!(event.data && event.data.data),
      innerType: event.data?.type,
      message: event.message
    });
    
    // --- Compact Theme thinking rows in ChatPanel ---
    // Helper to send a minimal system message to ChatPanel
    const postSystemMessage = (message: string, metadata: any = {}) => {
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('add_system_message', {
            detail: { message, metadata }
          }));
        }
      } catch {}
    };

    // Emit live preview updates for the ChatPanel Theme panel
    const postThemePreviewUpdate = (detail: any) => {
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('theme_preview_update', { detail }));
        }
      } catch {}
    };

    const handleOutlineCompleteTheme = (outline: any) => {
      try {
        if (!outline) return;
        const sp = outline.stylePreferences || {};
        const colors = sp.colors || {};
        const colorValues: string[] = [];
        const pushIfValid = (value?: string) => {
          if (typeof value === 'string' && value.trim() && !colorValues.includes(value)) {
            colorValues.push(value);
          }
        };
        pushIfValid(colors.accent1);
        pushIfValid(colors.accent2);
        pushIfValid(colors.accent3);
        pushIfValid(colors.background);
        pushIfValid(colors.text);

        if (colorValues.length === 0) return;

        const palette = {
          primary_background: colors.background || colorValues[0] || '#FFFFFF',
          primary_text: colors.text || '#1F2937',
          accent_1: colors.accent1 || colorValues[0] || '#FF4301',
          accent_2: colors.accent2 || colorValues[1] || colors.accent1 || '#F59E0B',
          colors: colorValues.slice(0, 6),
          metadata: sp.logoUrl ? { logo_url: sp.logoUrl } : {}
        } as any;

       const typography = {
         hero_title: { family: sp.font || 'Inter' },
         body_text: { family: sp.font || 'Inter' }
       };

       const themePayload = {
         theme_name: sp.vibeContext ? `${String(sp.vibeContext).replace('.com', '').replace('www.', '').trim().replace(/\b\w/g, (c: string) => c.toUpperCase())} Brand Theme` : 'Brand Theme',
         color_palette: palette,
         typography,
         brandInfo: sp.logoUrl ? { logoUrl: sp.logoUrl } : {},
         visual_style: {}
       };

       const logos = sp.logoUrl ? { url: sp.logoUrl, source: 'style_preferences' as const } : undefined;
       try {
         const store = useThemeStore.getState();
          const outlineId = outline?.id || '';
          const prevTheme = outlineId ? store.getOutlineTheme?.(outlineId) : undefined;
          if (prevTheme?.id) {
            try { store.removeCustomTheme(prevTheme.id); } catch {}
          }
          try { store.setOutlineDeckTheme?.(outlineId, null); } catch {}
        } catch {}
        postThemePreviewUpdate({ theme: themePayload, palette, typography, ...(logos ? { logo: logos } : {}) });
      } catch (err) {
        console.warn('[useSlideGeneration] Failed to derive theme from outline_complete', err);
      }
    };

    // Try to find a logo URL from a theme object or artifact content
    const extractLogoCandidates = (obj: any): { url?: string; light_variant?: string; dark_variant?: string } => {
      const result: { url?: string; light_variant?: string; dark_variant?: string } = {};
      if (!obj) return result;
      const isUrl = (v: any) => typeof v === 'string' && /^(https?:|data:image\/)\S+/i.test(v);
      const prefer = (k: 'url' | 'light_variant' | 'dark_variant', v?: any) => {
        if (!v) return;
        if (k === 'url' && !result.url && isUrl(v)) result.url = String(v);
        if (k === 'light_variant' && !result.light_variant && isUrl(v)) result.light_variant = String(v);
        if (k === 'dark_variant' && !result.dark_variant && isUrl(v)) result.dark_variant = String(v);
      };
      try {
        // Known top-level shapes
        const brandInfo = (obj as any).brandInfo || {};
        const logoInfo = (obj as any).logo_info || {};
        const themeLogo = (obj as any).logo || {};
        const paletteMeta = (obj as any).color_palette?.metadata || (obj as any).palette?.metadata || {};
        // Direct assignments
        prefer('url', themeLogo.url);
        prefer('light_variant', themeLogo.light_variant);
        prefer('dark_variant', themeLogo.dark_variant);
        prefer('url', logoInfo.url);
        prefer('light_variant', logoInfo.light_variant);
        prefer('dark_variant', logoInfo.dark_variant);
        prefer('url', brandInfo.logoUrl || brandInfo.logo_url);
        prefer('light_variant', brandInfo.logo_url_light);
        prefer('dark_variant', brandInfo.logo_url_dark);
        prefer('url', paletteMeta.logo_url);
        prefer('light_variant', paletteMeta.logo_url_light);
        prefer('dark_variant', paletteMeta.logo_url_dark);

        // Other common keys anywhere
        const keys = ['logo', 'logo_url', 'brand_logo', 'brand_logo_url', 'branding', 'brand', 'assets', 'brandAssets', 'logos', 'icons', 'favicon'];
        for (const k of keys) {
          const v = (obj as any)[k];
          if (!v) continue;
          if (isUrl(v)) prefer('url', v);
          if (typeof v === 'object') {
            prefer('url', (v as any).url);
            prefer('url', (v as any).src);
            prefer('light_variant', (v as any).light || (v as any).light_variant || (v as any).lightUrl);
            prefer('dark_variant', (v as any).dark || (v as any).dark_variant || (v as any).darkUrl);
            if (Array.isArray(v)) {
              for (const item of v) {
                prefer('url', (item as any));
                prefer('url', (item as any)?.url);
                prefer('url', (item as any)?.src);
              }
            }
          }
        }

        // Fallback deep scan
        const stack: any[] = [obj];
        let depth = 0;
        while (stack.length && depth < 4) {
          const node = stack.shift();
          depth++;
          if (typeof node === 'object' && node) {
            for (const [, v] of Object.entries(node)) {
              if (isUrl(v)) prefer('url', v);
              if (typeof v === 'object' && v) stack.push(v);
            }
          }
        }
      } catch {}
      return result;
    };

    // Humanize tool names for nicer display
    const humanizeThemeTool = (name: string | undefined): string => {
      if (!name) return 'Tool';
      const lower = String(name).toLowerCase();
      if (lower.includes('analyze_theme_and_style')) return 'Analyze Theme & Style';
      if (lower.includes('select_colors')) return 'Select Colors';
      if (lower.includes('select_fonts')) return 'Select Fonts';
      if (lower.includes('generate_palette')) return 'Generate Palette';
      const parts = String(name).split('.');
      return parts[parts.length - 1] || String(name);
    };

    // Relay a single theme-related event as compact chat rows
    const relayThemeEventToChat = (e: any) => {
      if (!e || !e.type) return;

      // Prefer to show plan right before the first tool starts (keeps it below main loading row)
      const maybeShowPlanBeforeTool = () => {
        // Intentionally no chat row; keep UX inside the Theme & assets panel
        if (!themePlanShownRef.current) {
          themePlanShownRef.current = true;
        }
      };

      // Local tool event dedup (status:name) with short window
      const shouldPostToolEvent = (status: 'start' | 'finish' | 'error', label: string): boolean => {
        const onceKey = `tool:${status}:${label}`;
        if (themeEventPostedKeysRef.current.has(onceKey)) return false;
        themeEventPostedKeysRef.current.add(onceKey);
        // Secondary time-window guard for near-identical bursts
        const key = `${status}:${label}`;
        const now = Date.now();
        const last = themeToolDedupRef.current.get(key) || 0;
        if (now - last < THEME_DEDUP_WINDOW_MS) return false;
        themeToolDedupRef.current.set(key, now);
        if (themeToolDedupRef.current.size > 50) {
          themeToolDedupRef.current.forEach((ts, k) => { if (now - ts > THEME_DEDUP_WINDOW_MS * 3) themeToolDedupRef.current.delete(k); });
        }
        return true;
      };

      const postOnce = (onceKey: string, message: string, metadata: any) => {
        if (themeEventPostedKeysRef.current.has(onceKey)) return;
        themeEventPostedKeysRef.current.add(onceKey);
        postSystemMessage(message, metadata);
      };

      if (e.type === 'tool_call') {
        const label = humanizeThemeTool(e.name);
        maybeShowPlanBeforeTool();
        if (shouldPostToolEvent('start', label)) {
          postThemePreviewUpdate({ tool: { label, status: 'start' } });
        }
        return;
      }
      if (e.type === 'tool_result') {
        const label = humanizeThemeTool(e.name);
        if (shouldPostToolEvent('finish', label)) {
          postThemePreviewUpdate({ tool: { label, status: 'finish' } });
        }
        return;
      }
      if (e.type === 'agent_event' && e.agent === 'ThemeDirector') {
        const phase = String(e.phase || '').toLowerCase();
        if (phase === 'complete' && !themeReadyShownRef.current) {
          themeReadyShownRef.current = true;
          postThemePreviewUpdate({});
          return;
        }
        if (phase === 'error') {
          // Surface error via chat progress, not theme panel
          return;
        }
      }
      if (e.type === 'artifact' && String(e.kind).toLowerCase() === 'theme_json') {
        try {
          const theme = e?.content?.deck_theme || e?.content?.theme || e?.content;
          const palette = theme?.color_palette || e?.content?.palette;
          const typography = theme?.typography;
          const logos = extractLogoCandidates(theme);
          postThemePreviewUpdate({ theme, palette, typography, ...(logos.url ? { logo: { url: logos.url, light_variant: logos.light_variant, dark_variant: logos.dark_variant, source: 'theme' } } : {}) });
        } catch {}
        return;
      }
      if (e.type === 'theme_generated' && !themeReadyShownRef.current) {
        themeReadyShownRef.current = true;
        try {
          const logos = extractLogoCandidates(e.theme || e);
          postThemePreviewUpdate({ theme: e.theme, palette: e.palette, typography: e.theme?.typography, ...(logos.url ? { logo: { url: logos.url, light_variant: logos.light_variant, dark_variant: logos.dark_variant, source: 'theme' } } : {}) });
        } catch {}
        return;
      }
      if (e.type === 'outline_complete') {
        handleOutlineCompleteTheme(e.outline);
        return;
      }
      if (e.type === 'phase_update' && (e.phase === 'theme_generation' || e.stage === 'theme_generation') && !themePlanShownRef.current) {
        themePlanShownRef.current = true;
        return;
      }
    };

    // Detect and relay theme events, preferring wrapped inner event to avoid duplicates
    try {
      const themeTypes = ['agent_event', 'tool_call', 'tool_result', 'artifact', 'theme_generated', 'phase_update'];
      if (event?.data && themeTypes.includes(event.data?.type)) {
        relayThemeEventToChat(event.data);
      } else if (themeTypes.includes(event?.type)) {
        relayThemeEventToChat(event);
      } else if (event?.type === 'outline_complete') {
        handleOutlineCompleteTheme(event?.outline || event?.data?.outline);
      }
    } catch {}

    // Add specific logging for slide_completed events
    if (event.type === 'slide_completed' || event.type === 'slide_generated') {
      console.log('[useSlideGeneration] SLIDE_COMPLETED EVENT:', {
        type: event.type,
        slide_index: event.slide_index,
        has_slide: !!event.slide,
        slide_components: event.slide?.components?.length,
        slide_id: event.slide_id
      });
    }
    
    // Add detailed logging for image_collection events
    if (event.stage === 'image_collection') {
      console.log('[useSlideGeneration] FULL image_collection event:', event);
      // Check if this is a "Images ready for slide X" event
      if (event.message && event.message.includes('Images ready for slide')) {
        // Extract slide number from message
        const slideMatch = event.message.match(/Images ready for slide (\d+)/);
        if (slideMatch) {
          const slideNumber = parseInt(slideMatch[1], 10);
          const slideIndex = slideNumber - 1; // Convert to 0-based index
          
          // Check if we have the image data in the event
          if (event.data && typeof event.data === 'object') {
            // The event data might contain the images directly or wrapped
            const images = event.data.images || event.data.data?.images;
            const slideId = event.data.slide_id || event.data.data?.slide_id;
            
            if (images && images.length > 0 && slideId) {
              // Initialize cache if needed
              if (!window.__slideImageCache) {
                window.__slideImageCache = {};
              }
              
              window.__slideImageCache[slideId] = {
                slideId: slideId,
                slideIndex: slideIndex,
                slideTitle: `Slide ${slideNumber}`,
                images: images
              };
              
              // Dispatch event
              window.dispatchEvent(new CustomEvent('slide_images_available', {
                detail: {
                  slideId: slideId,
                  slideIndex: slideIndex,
                  images: images
                }
              }));
            }
          }
        }
      }
    }
    
    // Check if this is a slide_images_found event from GenerationStateManager
    // These events have stage set by GenerationStateManager but the original event is in data
    if (event.stage === 'image_collection' && event.data && typeof event.data === 'object') {
      const originalEvent = event.data as any;
      
      // Check if this is a wrapped slide_images_found event
      if (originalEvent.type === 'slide_images_found' && originalEvent.data) {
        
        // Process this event same as below
        const imageData = originalEvent.data;
        
        // Initialize caches if needed
        if (!window.__slideImageCache) {
          window.__slideImageCache = {};
        }
        
        // Store all images for the slide
        if (imageData.slide_id && imageData.images_by_topic) {
          // Flatten images from all topics
          const allImages: any[] = [];
          const seenUrls = new Set<string>();
          
          Object.entries(imageData.images_by_topic).forEach(([topic, topicImages]: [string, any]) => {
            if (Array.isArray(topicImages)) {
              topicImages.forEach((img: any) => {
                if (!seenUrls.has(img.url)) {
                  seenUrls.add(img.url);
                  // Add topic info to each image and ensure HTTPS
                  allImages.push(processImageUrls({ ...img, topic }));
                }
              });
            }
          });
          
          // Store in cache
          window.__slideImageCache[imageData.slide_id] = {
            slideId: imageData.slide_id,
            slideIndex: imageData.slide_index,
            slideTitle: imageData.slide_title || `Slide ${imageData.slide_index + 1}`,
            images: allImages,
            topics: imageData.topics || Object.keys(imageData.images_by_topic),
            images_by_topic: imageData.images_by_topic
          };
          
          // Dispatch event for slide container
          window.dispatchEvent(new CustomEvent('slide_images_available', {
            detail: {
              slideId: imageData.slide_id,
              slideIndex: imageData.slide_index,
              slideTitle: imageData.slide_title,
              images: allImages,
              topics: imageData.topics || Object.keys(imageData.images_by_topic),
              images_by_topic: imageData.images_by_topic
            }
          }));
        }
      }
    }
    
        // DIRECT: Check if the event itself is slide_images_found (not wrapped)
    if (event.type === 'slide_images_found' && event.data) {
      
      // Process this event directly
      const slideData = event.data;
      if (!window.__slideImageCache) {
        window.__slideImageCache = {};
      }
      
      if (slideData.images_by_topic && Object.keys(slideData.images_by_topic).length > 0) {
        // Process and store images
        const cacheData = {
          slideId: slideData.slide_id,
          slideIndex: slideData.slide_index,
          slideTitle: slideData.slide_title,
          topics: slideData.topics || [],
          images: [],
          images_by_topic: slideData.images_by_topic
        };
        
        // Flatten images
        const allImages: any[] = [];
        const seenUrls = new Set<string>();
        
        Object.entries(slideData.images_by_topic).forEach(([topic, topicImages]: [string, any]) => {
          if (Array.isArray(topicImages)) {
            topicImages.forEach((img: any) => {
              if (!seenUrls.has(img.url)) {
                seenUrls.add(img.url);
                allImages.push(processImageUrls({
                  ...img,
                  topic: topic
                }));
              }
            });
          }
        });
        
        cacheData.images = allImages;
        
        // Store by multiple keys for better retrieval
        window.__slideImageCache[slideData.slide_id] = cacheData;
        window.__slideImageCache[`slide_index_${slideData.slide_index}`] = cacheData;
        
        // Debug: expose cache status
        (window as any).__debugImageCache = () => {
          console.log('Image Cache Status:', {
            cacheKeys: Object.keys(window.__slideImageCache || {}),
            cacheEntries: Object.entries(window.__slideImageCache || {}).map(([key, value]: [string, any]) => ({
              key,
              slideId: value.slideId,
              imageCount: value.images?.length || 0,
              topics: value.topics
            }))
          });
        };
        
        // Emit a global event to notify that images are available
        window.dispatchEvent(new CustomEvent('slide_images_cached', {
          detail: {
            slideId: slideData.slide_id,
            slideIndex: slideData.slide_index,
            imageCount: allImages.length
          }
        }));
        
        // Dispatch event
        window.dispatchEvent(new CustomEvent('slide_images_available', {
          detail: {
            slideId: slideData.slide_id,
            slideIndex: slideData.slide_index,
            images: allImages
          }
        }));
      }
    }
    
    // NEW: Handle slide_images_found regardless of stage
    // GenerationStateManager puts the original event in event.data
    if (event.data && typeof event.data === 'object' && 'type' in event.data) {
      const innerEvent = event.data as any;
      

      
      // Check for slide_images_found event type
      if (innerEvent.type === 'slide_images_found' && innerEvent.data) {

        
        // Store images in cache directly
        const slideData = innerEvent.data;
        if (!window.__slideImageCache) {
          window.__slideImageCache = {};
        }
        
        if (slideData.images_by_topic && Object.keys(slideData.images_by_topic).length > 0) {
          // Flatten images from all topics  
          const allImages: any[] = [];
          const seenUrls = new Set<string>();
          
          Object.entries(slideData.images_by_topic).forEach(([topic, topicImages]: [string, any]) => {
            if (Array.isArray(topicImages)) {
              topicImages.forEach((img: any) => {
                if (!seenUrls.has(img.url)) {
                  seenUrls.add(img.url);
                  allImages.push(processImageUrls({
                    ...img,
                    topic: topic
                  }));
                }
              });
            }
          });
          
          // Store in cache by both slide_id and slide_index for better retrieval
          const cacheData = {
            slideId: slideData.slide_id,
            slideIndex: slideData.slide_index,
            slideTitle: slideData.slide_title,
            topics: slideData.topics || [],
            images: allImages,
            images_by_topic: slideData.images_by_topic
          };
          
          // Store by slide_id (UUID from backend)
          window.__slideImageCache[slideData.slide_id] = cacheData;
          
          // Also store by slide index for fallback
          window.__slideImageCache[`slide_index_${slideData.slide_index}`] = cacheData;
          

          
          // Dispatch event to notify UI
          window.dispatchEvent(new CustomEvent('slide_images_available', {
            detail: {
              slideId: slideData.slide_id,
              slideIndex: slideData.slide_index,
              images: allImages
            }
          }));
        }
      }
    }
    
    // The GenerationStateManager passes the original backend event as event.data
    // So we need to check event.data for the backend event type
    if (event.data && typeof event.data === 'object') {
      // Handle topic_images_found events
      if (event.data.type === 'topic_images_found' && event.data.data) {
        const topicData = event.data.data;
        
        // Initialize topic cache if needed
        if (!window.__topicImageCache) {
          window.__topicImageCache = {};
        }
        
        // Store images by topic
        if (topicData.topic && topicData.images && topicData.images.length > 0) {
          window.__topicImageCache[topicData.topic] = topicData.images;
          
          // Dispatch event for topic images
          window.dispatchEvent(new CustomEvent('topic_images_available', {
            detail: {
              topic: topicData.topic,
              images: topicData.images,
              image_count: topicData.image_count || topicData.images.length
            }
          }));
        }
      }
      
      // Handle slide_images_found and slide_images_available events - check both direct and wrapped formats
      if (event.data?.type === 'slide_images_found' || 
          event.data?.data?.type === 'slide_images_found' ||
          event.data?.type === 'slide_images_available' ||
          event.data?.data?.type === 'slide_images_available') {
        // The GenerationStateManager passes the inner event as data
        const innerEvent = event.data;
        const imageData = innerEvent.data || innerEvent;
        
        // Initialize caches if needed
        if (!window.__slideImageCache) {
          window.__slideImageCache = {};
        }
        if (!window.__topicImageCache) {
          window.__topicImageCache = {};
        }
        
        // Process images to add topic information
        let processedImages = imageData.images || [];
        
        // If we have images_by_topic, enrich the flat array with topic info
        if (imageData.images_by_topic) {
          // Store images by topic in the topic cache
          Object.entries(imageData.images_by_topic).forEach(([topic, topicImages]: [string, any[]]) => {
            // Add topic field to each image in the topic cache
            const imagesWithTopic = topicImages.map(img => ({ ...img, topic }));
            window.__topicImageCache![topic] = imagesWithTopic;
          });
          
          // Also add topic information to the flat images array
          const imageUrlToTopic = new Map<string, string>();
          Object.entries(imageData.images_by_topic).forEach(([topic, topicImages]: [string, any[]]) => {
            topicImages.forEach((img: any) => {
              if (img.url) {
                imageUrlToTopic.set(img.url, topic);
              }
            });
          });
          
          // Add topic field to each image in the flat array
          processedImages = processedImages.map((img: any) => {
            const topic = imageUrlToTopic.get(img.url);
            return topic ? { ...img, topic } : img;
          });
        }
        
        // Store all images for the slide
        if (processedImages.length > 0 && imageData.slide_id) {
          window.__slideImageCache[imageData.slide_id] = {
            slideId: imageData.slide_id,
            slideIndex: imageData.slide_index,
            slideTitle: imageData.slide_title || `Slide ${imageData.slide_index + 1}`,
            images: processedImages,
            topics: imageData.topics || [],
            images_by_topic: imageData.images_by_topic || {}
          };
          
          // Dispatch event for slide container
          window.dispatchEvent(new CustomEvent('slide_images_available', {
            detail: {
              slideId: imageData.slide_id,
              slideIndex: imageData.slide_index,
              slideTitle: imageData.slide_title,
              images: processedImages,
              topics: imageData.topics || [],
              images_by_topic: imageData.images_by_topic || {}
            }
          }));
        }
      }
      
      // Handle slide_generated events with availableImages
      if (event.data.type === 'slide_generated' && event.data.slide_data?.availableImages) {
        const slideData = event.data.slide_data;
        const slideIndex = event.data.slide_index;
        
        // Initialize cache if needed
        if (!window.__slideImageCache) {
          window.__slideImageCache = {};
        }
        
        // The slide_data contains the generated slide with components
        // We need to get the slide ID from the components
        const slideId = slideData.components?.[0]?.slide_id;
        
        if (slideId && slideData.availableImages && slideData.availableImages.length > 0) {
          window.__slideImageCache[slideId] = {
            slideId: slideId,
            slideIndex: slideIndex,
            slideTitle: slideData.title || `Slide ${slideIndex + 1}`,
            images: slideData.availableImages
          };
          
          // Dispatch event
          window.dispatchEvent(new CustomEvent('slide_images_available', {
            detail: {
              slideId: slideId,
              slideIndex: slideIndex,
              images: slideData.availableImages
            }
          }));
        }
      }
    }
    
    // Phase ranges from the guide
    const PHASE_RANGES = {
      initialization: { start: 0, end: 15 },
      theme_generation: { start: 15, end: 30 },
      image_collection: { start: 30, end: 55 },
      slide_generation: { start: 55, end: 95 },
      finalization: { start: 95, end: 100 }
    };
    
    // Extract progress directly from backend events (source of truth)
    // Default to previous progress if this event doesn't include a progress number
    let progress = typeof deckStatus?.progress === 'number' ? deckStatus.progress : 0;
    let message = deckStatus?.message || '';
    let currentSlide = deckStatus?.currentSlide;
    let totalSlides = deckStatus?.totalSlides;
    let phase = event.phase || event.data?.phase || event.stage;

    if (event.type === 'progress' && event.data) {
      const p = event.data.progress;
      if (typeof p === 'number' && Number.isFinite(p)) {
        // clamp 0-100
        progress = Math.max(0, Math.min(100, p));
      }
      if (event.data.message) message = event.data.message;
      if (event.data.currentSlide !== undefined) currentSlide = event.data.currentSlide;
      if (event.data.totalSlides !== undefined) totalSlides = event.data.totalSlides;
      if (event.data.slideProgress) {
        if (event.data.slideProgress.current !== undefined) currentSlide = event.data.slideProgress.current;
        if (event.data.slideProgress.total !== undefined) totalSlides = event.data.slideProgress.total;
      }
    } else if (event.type === 'phase_update') {
      if (typeof event.progress === 'number' && Number.isFinite(event.progress)) {
        progress = Math.max(0, Math.min(100, event.progress));
      }
      if (event.message) message = event.message;
    } else {
      // Other events may carry progress/message
      const p = (typeof event.progress === 'number' ? event.progress : (typeof event.data?.progress === 'number' ? event.data.progress : undefined));
      if (typeof p === 'number' && Number.isFinite(p)) {
        progress = Math.max(0, Math.min(100, p));
      }
      if (event.message) message = event.message;
      else if (event.data?.message) message = event.data.message;
      // Slide counters when available
      if (event.slideIndex !== undefined) currentSlide = event.slideIndex + 1;
      if (event.slide_index !== undefined) currentSlide = event.slide_index + 1;
      if (event.slidesTotal !== undefined) totalSlides = event.slidesTotal;
      if (event.total_slides !== undefined) totalSlides = event.total_slides;
      if (event.data?.total_slides !== undefined) totalSlides = event.data.total_slides;
    }

    // Normalize certain backend messages that indicate the work already finished
    try {
      const lowerMessage = String(message || '').toLowerCase();
      if (
        lowerMessage.includes('already completed') ||
        lowerMessage.includes('already complete') ||
        lowerMessage.includes('already processed')
      ) {
        progress = 100;
        // If phase isn't set, treat as finalization
        phase = phase || 'finalization';
      }
    } catch {}

    // Completion events force progress to 100
    if (
      event.type === 'deck_complete' ||
      event.type === 'composition_complete' ||
      event.type === 'deck_completed' ||
      event.type === 'deck_rendered' ||
      event.type === 'complete'
    ) {
      progress = 100;
    }
    
    // Update deck status
    const newStatus: DeckStatus = {
      state: getStateFromEvent(event),
      progress: progress,
      message: message,
      currentSlide: currentSlide,
      totalSlides: totalSlides,
      startedAt: deckStatus?.startedAt || new Date().toISOString()
    };
    
    setDeckStatus(newStatus);
    
    // Create progress message based on backend event type
    let displayMessage = message;
    
    // Determine phase from event type if not explicitly provided
    if (!phase) {
      if (event.type === 'deck_creation_started' || event.type === 'deck_created') {
        phase = 'initialization';
      } else if (event.type === 'theme_generated' || event.type === 'theme_generation') {
        phase = 'theme_generation';
      } else if (event.type === 'images_ready_for_selection' || event.type === 'image_search_started' || event.type === 'image_collection') {
        phase = 'image_collection';
      } else if (event.type === 'slide_started' || event.type === 'slide_generated' || event.type === 'slide_completed') {
        phase = 'slide_generation';
      } else if (event.type === 'deck_complete' || event.type === 'composition_complete') {
        phase = 'finalization';
      }
    }
    
    // Do not artificially bump progress between phases; backend percentages are authoritative
    
    // Format message based on event type
    if (event.type === 'deck_creation_started') {
      displayMessage = `Creating deck: ${event.title || 'Untitled'}`;
      // Reset slide tracking for new generation
      slidesInProgressRef.current.clear();
      completedSlidesRef.current.clear();
    } else if (event.type === 'phase_update' || (event.type === 'progress' && event.data?.phase)) {
      const phase = event.phase || event.data?.phase;
      const phaseMessages = {
        'initialization': 'Initializing deck creation',
        'theme_generation': 'Creating design theme',
        'image_collection': 'Searching for images',
        'slide_generation': 'Generating slides',
        'finalization': 'Finalizing deck'
      };
      displayMessage = phaseMessages[phase] || message;
    } else if (event.type === 'slide_started') {
      displayMessage = `Generating slide ${event.slide_index + 1}: ${event.title || ''}`;
      // Track slide as in progress
      if (event.slide_index !== undefined) {
        slidesInProgressRef.current.add(event.slide_index);
      }
    } else if (event.type === 'slide_generated' || event.type === 'slide_completed') {
      displayMessage = `Generated slide ${event.slide_index + 1}`;
      // Track slide as completed
      if (event.slide_index !== undefined) {
        slidesInProgressRef.current.delete(event.slide_index);
        completedSlidesRef.current.add(event.slide_index);
      }
    }
    
    // Filter out nonsensical messages
    if (displayMessage.includes('Generated 0 of')) {
      // Skip messages that say 0 slides generated
      return;
    }
    
    // Create system message with appropriate metadata
    const messageMetadata: any = {
      stage: event.stage || event.type,
      progress: progress,
      type: event.type || event.stage,
      currentSlide: currentSlide,
      totalSlides: totalSlides,
      phase: phase || event.phase || event.data?.phase,  // Use the phase we determined
      substep: event.substep || event.data?.substep,
      errors: event.data?.errors,
      isStreamingUpdate: true,  // ALWAYS true for generation events
      completedSlides: completedSlidesRef.current,
      slidesInProgress: slidesInProgressRef.current
    };
    
    // Check for completion events or when progress is 100%
    const msgLower = String(displayMessage || '').toLowerCase();
    if (
        event.type === 'deck_complete' || 
        event.type === 'composition_complete' ||
        event.type === 'deck_completed' ||
        event.type === 'deck_rendered' ||
        event.type === 'complete' ||
        progress === 100 ||
        msgLower.includes('already completed') ||
        msgLower.includes('already complete') ||
        msgLower.includes('already processed')) {
      const deckData = useDeckStore.getState().deckData;
      const isFontOptimized = deckData.data?.fontOptimized === true;
      

      
      // Force proper completion message when progress is 100%
      if (progress === 100) {
        displayMessage = 'Your presentation is ready!';
        messageMetadata.type = 'generation_complete';
        messageMetadata.stage = 'generation_complete';
      }

    }
    
    // Prevent sending duplicate messages
    const now = Date.now();
    const isDuplicate = lastMessageRef.current.message === displayMessage && 
                       lastMessageRef.current.progress === progress &&
                       (now - lastMessageRef.current.timestamp) < 500; // Within 500ms
    
    if (!isDuplicate) {
      // Set the system message with formatted display text
      setLastSystemMessage({
        message: displayMessage,
        metadata: messageMetadata
      });
      
      // Update last message reference
      lastMessageRef.current = {
        message: displayMessage,
        progress: progress,
        timestamp: now
      };
    } else {
    }

    // Handle specific events
    // For outline_structure events, we need to check if the original event data is preserved
    // The GenerationStateManager processes events and may not preserve all original properties
    if (event.stage === 'outline_structure') {
      // The slideTitles and title might be in event.data or in the original event structure
      // Check multiple possible locations
      const slideTitles = event.data?.slideTitles || event.slideTitles;
      const outlineTitle = event.data?.title || event.title;
      
      if (!slideTitles) {
        return;
      }
      
      // Create placeholders only if we don't have the right number of slides
      const currentDeckData = useDeckStore.getState().deckData;
      
      // If we already have the correct number of slides, just update titles
      if (currentDeckData.slides.length === slideTitles.length) {
        const updatedSlides = currentDeckData.slides.map((slide: any, index: number) => ({
          ...slide,
          title: (slideTitles[index] && String(slideTitles[index]).trim()) || slide.title || `Slide ${index + 1}`,
          // Only mark as pending if it doesn't have real content
          status: slide.components && slide.components.some((c: any) => 
            c.type !== 'Background' && !c.id?.toLowerCase().includes('background')
          ) ? 'completed' : 'pending'
        }));
        
        useDeckStore.getState().updateDeckData({
          ...currentDeckData,
          slides: updatedSlides,
          name: outlineTitle || currentDeckData.name
        });
        return;
      }
      
      // Only create placeholders once
      if (placeholdersCreatedRef.current) {
        return;
      }
      
      placeholdersCreatedRef.current = true;
      
      // If we already have some slides, preserve them and only add missing ones
      let slidesWithTitles;
      const existingSlides = currentDeckData.slides || [];
      
      if (existingSlides.length > 0) {
        // Update existing slides and add new ones if needed
        slidesWithTitles = slideTitles.map((title: string, index: number) => {
          if (index < existingSlides.length) {
            // Update existing slide, preserve its ID and components
            return {
              ...existingSlides[index],
              title: (title && String(title).trim()) || `Slide ${index + 1}`,
              status: existingSlides[index].components?.some((c: any) => 
                c.type !== 'Background' && !c.id?.toLowerCase().includes('background')
              ) ? 'completed' : 'pending' as const,
              isGenerating: true
            };
          } else {
            // Create new slide for missing indices with consistent ID format
            return {
              id: `${deckId}-slide-${index}`,
              title: (title && String(title).trim()) || `Slide ${index + 1}`,
              components: [],
              order: index,
              deckId: deckId,
              status: 'pending' as const,
              isGenerating: true,
              content: ''
            };
          }
        });
      } else {
        // No existing slides, create all new with consistent ID format
        slidesWithTitles = slideTitles.map((title: string, index: number) => ({
          id: `${deckId}-slide-${index}`,
          title: (title && String(title).trim()) || `Slide ${index + 1}`,
          components: [],
          order: index,
          deckId: deckId,
          status: 'pending' as const,
          isGenerating: true,
          content: ''
        }));
      }
      
      console.log('[useSlideGeneration] Updated/created placeholder slides:', {
        count: slidesWithTitles.length,
        existingCount: existingSlides.length,
        titles: slidesWithTitles.map(s => s.title)
      });
      
      // Use the outline title if available, otherwise keep the current deck name
      const deckName = outlineTitle || currentDeckData.name;
      
      useDeckStore.getState().updateDeckData({
        ...currentDeckData,
        slides: slidesWithTitles,
        name: deckName
      });
    }
    
    // Handle slide_generated event type (for slides without the slide_completed stage)
    if (event.stage === 'slide_completed' || 
        (event.data && (event.data.type === 'slide_generated' || event.data.type === 'slide_complete')) ||
        event.type === 'slide_completed' || event.type === 'slide_generated') {
      
      console.log('[useSlideGeneration] Processing slide event:', {
        eventType: event.type,
        stage: event.stage,
        hasSlideData: !!(event.slide || event.data?.slide),
        slideIndex: event.slide_index || event.slideIndex || event.data?.slide_index
      });
      
      let slideIndex = event.slideIndex;
      let slideData = event.data?.slide;
      
      // Handle different event formats
      if (event.data?.type === 'slide_generated') {
        slideIndex = event.data.slide_index;
        slideData = event.data.slide_data;
      } else if (event.type === 'slide_completed' || event.type === 'slide_generated') {
        // Handle direct SSE event format from backend
        slideIndex = event.slide_index;
        slideData = event.slide;
      }
      
      // Track slide as completed
      if (slideIndex !== undefined) {
        slidesInProgressRef.current.delete(slideIndex);
        completedSlidesRef.current.add(slideIndex);
      }
      
      // Only process if we have actual slide data
      // SSE events might have empty slide_completed without data
      if (!slideData && event.stage === 'slide_completed' && !event.data) {
        // Don't update slides with empty data
        return;
      }
      
      if (slideData && slideIndex !== undefined) {
        // Create a unique key for this slide event
        const slideEventKey = `${slideIndex}_${slideData.id || slideIndex}_${JSON.stringify(slideData).length}`;
        
        // Check if we've already processed this slide
        if (processedSlidesRef.current.has(slideEventKey)) {
          console.log(`[SlideGeneration] Skipping duplicate slide ${slideIndex}`);
          return;
        }
        
        // Mark this slide as processed
        processedSlidesRef.current.add(slideEventKey);
        
        console.log(`[SlideGeneration] Processing slide_completed event for slide ${slideIndex}`, {
          hasComponents: !!slideData.components,
          componentCount: slideData.components?.length,
          theme: !!slideData.theme,
          palette: !!slideData.palette
        });
        
        const currentDeckData = useDeckStore.getState().deckData;
        const updatedSlides = [...currentDeckData.slides];
        
        // Ensure slide exists in array
        while (updatedSlides.length <= slideIndex) {
          updatedSlides.push({
            id: `slide-${Date.now()}-${updatedSlides.length}`,
            title: `Slide ${updatedSlides.length + 1}`,
            components: [],
            order: updatedSlides.length,
            deckId: deckId,
            status: 'pending' as const
          });
        }
        
        // Update the slide with the generated data but KEEP the original ID
        const originalId = updatedSlides[slideIndex].id;
        updatedSlides[slideIndex] = {
          ...updatedSlides[slideIndex],
          ...slideData,
          id: originalId, // ALWAYS keep the original ID to prevent re-renders
          components: slideData.components || [],
          theme: (slideData as any).theme || (updatedSlides[slideIndex] as any).theme,
          palette: (slideData as any).palette || (updatedSlides[slideIndex] as any).palette,
          status: 'completed' as const,
          isGenerating: false, // Clear the generating flag when slide completes
          order: slideIndex
        };
        
        console.log(`[SlideGeneration] Updating deck with completed slide ${slideIndex}`);
        
        // Save immediately when slide completes - use direct save without skipBackend
        useDeckStore.getState().updateDeckData({
          ...currentDeckData,
          slides: updatedSlides
        });
        
        // Cache available images if present
        // IMPORTANT: Use the originalId for consistency with what's stored in the deck
        const slideId = originalId; // Use the ID that's actually stored in the deck
        cacheAvailableImages(slideId, slideIndex, slideData);

        // Immediately announce per-slide completion so font optimization can run slide-by-slide
        try {
          const resolvedIndex = slideIndex ?? updatedSlides.findIndex(s => s.id === slideId);
          if (resolvedIndex !== -1 && slideId) {
            console.warn(`[SlideGeneration] Dispatching slide_completed for slide ${slideIndex + 1} with ID: ${slideId}`);
            window.dispatchEvent(new CustomEvent('slide_completed', {
              detail: {
                slideId,
                slide_id: slideId,
                slideIndex: resolvedIndex,
                slide_index: resolvedIndex,
                order: resolvedIndex,
                slide: updatedSlides[resolvedIndex],
                timestamp: Date.now()
              }
            }));
          }
        } catch {}
        
        // Notify external progress listeners for this event, then exit to avoid duplicate handling
        options.onProgress?.(event);
        return;
        // Removed per-slide auto optimization. Optimization will run once after deck generation completes
      }
    }
    
    // Original slide completion handler (keep for backward compatibility)
    else if (event.stage === 'slide_completed' && event.data?.slide && event.slideIndex !== undefined) {
      
      // Use the same logic as above...
      const currentDeckData = useDeckStore.getState().deckData;
      const updatedSlides = [...currentDeckData.slides];
      
      if (updatedSlides[event.slideIndex]) {
        updatedSlides[event.slideIndex] = {
          ...updatedSlides[event.slideIndex],
          ...event.data.slide,
          status: 'completed' as const,
          isGenerating: false, // Clear the generating flag when slide completes
          order: event.slideIndex
        };
        
        // Save with debouncing to avoid too many saves
        const now = Date.now();
        if (now - lastSaveTimeRef.current > SAVE_DEBOUNCE_MS) {
          useDeckStore.getState().updateDeckData({
            ...currentDeckData,
            slides: updatedSlides
          });
          lastSaveTimeRef.current = now;
        } else {
          // Update locally first, schedule save
          useDeckStore.getState().updateDeckData({
            ...currentDeckData,
            slides: updatedSlides
          });
          
          // No need for delayed save - the store handles this
        }
        
        // Trigger auto-optimize for completed slide
        const completedSlideId = updatedSlides[event.slideIndex].id;
        
        // DISABLED: Individual slide optimization - now done all at once when deck generation completes
        /*
        // Create a unique optimization flag for this slide
        const optimizationFlag = `slide_${completedSlideId}_optimizing`;
        
        // Check if already optimizing this slide
        if ((window as any)[optimizationFlag]) {
          return;
        }
        
        // Mark as optimizing
        (window as any)[optimizationFlag] = true;
        
        // Wait for DOM updates and then optimize
        setTimeout(async () => {
          try {
            // Wait for optimizeAndSave to be available
            let attempts = 0;
            while (attempts < 20 && (!window || !(window as any).optimizeAndSave)) {
              await new Promise(resolve => setTimeout(resolve, 100));
              attempts++;
            }
            
            if (typeof window !== 'undefined' && (window as any).optimizeAndSave) {
              
              // Run optimization with loading UI
              await (window as any).optimizeAndSave(completedSlideId, { showLoading: true });
              
              
              // Force a refresh to ensure UI updates with saved changes
              const postOptimizeDeckData = useDeckStore.getState().deckData;
              
              // Add a timestamp to force re-render of components
              const refreshedDeckData = {
                ...postOptimizeDeckData,
                slides: postOptimizeDeckData.slides.map(s => 
                  s.id === completedSlideId 
                    ? { ...s, lastOptimized: Date.now() }
                    : s
                )
              };
              
              useDeckStore.getState().updateDeckData(refreshedDeckData, { skipBackend: true });
              
            } else {
              console.error(`[AutoOptimize] optimizeAndSave not available for slide ${completedSlideId}`);
            }
          } catch (error) {
            console.error(`[AutoOptimize] Error optimizing slide ${completedSlideId}:`, error);
          } finally {
            // Clear the optimization flag
            delete (window as any)[optimizationFlag];
          }
        }, 1000); // Wait 1 second for DOM to update
        */
        // Prevent fall-through to other handlers for the same event
        options.onProgress?.(event);
        return;
      }
    }

    // Also check for images in any event data structure (fallback)
    if (event.data && typeof event.data === 'object') {
      const eventData = event.data as any;
      
      // Check for images_by_topic in various places
      if (eventData.images_by_topic || eventData.data?.images_by_topic) {
        const imageData = eventData.images_by_topic ? eventData : eventData.data;
        

        
        // Initialize cache if needed
        if (!window.__slideImageCache) {
          window.__slideImageCache = {};
        }
        
        if (imageData.slide_id && imageData.images_by_topic) {
          const allImages: any[] = [];
          const seenUrls = new Set<string>();
          
          Object.entries(imageData.images_by_topic).forEach(([topic, topicImages]: [string, any]) => {
            if (Array.isArray(topicImages)) {
              topicImages.forEach((img: any) => {
                if (!seenUrls.has(img.url)) {
                  seenUrls.add(img.url);
                  allImages.push(processImageUrls({
                    ...img,
                    topic: topic
                  }));
                }
              });
            }
          });
          
          if (allImages.length > 0) {
            window.__slideImageCache[imageData.slide_id] = {
              slideId: imageData.slide_id,
              slideIndex: imageData.slide_index,
              slideTitle: imageData.slide_title || imageData.slide_data?.title,
              topics: imageData.topics || [],
              images: allImages,
              images_by_topic: imageData.images_by_topic
            };
            

            
            // Dispatch event
            window.dispatchEvent(new CustomEvent('slide_images_available', {
              detail: {
                slideId: imageData.slide_id,
                slideIndex: imageData.slide_index,
                images: allImages
              }
            }));
          }
        }
      }
    }

    // Handle images collection
    if (event.stage === 'image_collection' && event.data?.images_by_slide) {
      
      // Store images in cache for each slide
      if (event.data.images_by_slide && Array.isArray(event.data.images_by_slide)) {
        // Initialize cache if needed
        if (!window.__slideImageCache) {
          window.__slideImageCache = {};
        }
        
        // Process each slide's images
        event.data.images_by_slide.forEach((slideData: any) => {
          if (slideData.slide_id && slideData.images_by_topic) {
            // Flatten images from all topics
            const allImages: any[] = [];
            const seenUrls = new Set<string>();
            
            Object.entries(slideData.images_by_topic).forEach(([topic, topicImages]: [string, any]) => {
              if (Array.isArray(topicImages)) {
                topicImages.forEach((img: any) => {
                  if (!seenUrls.has(img.url)) {
                    seenUrls.add(img.url);
                    // Add topic info to each image
                    allImages.push({ ...img, topic });
                  }
                });
              }
            });
            
            // Store in cache
            window.__slideImageCache[slideData.slide_id] = {
              slideId: slideData.slide_id,
              slideIndex: slideData.slide_index,
              slideTitle: slideData.slide_title || `Slide ${slideData.slide_index + 1}`,
              images: allImages,
              topics: slideData.topics || Object.keys(slideData.images_by_topic),
              images_by_topic: slideData.images_by_topic
            };
            
            console.log(`[ImageCollection] Cached ${allImages.length} images for slide ${slideData.slide_id}`);
          }
        });
      }
      
      // Dispatch event for image picker
      window.dispatchEvent(new CustomEvent('images_ready_for_selection', {
        detail: {
          deck_id: deckId,
          deck_uuid: deckId
        }
      }));
    }
    
    // Handle deck_complete event from backend OR when progress reaches 100%
    if (event.type === 'deck_complete' || 
        event.type === 'composition_complete' ||
        (progress === 100 && (event.stage === 'finalization' || event.stage === 'generation_complete'))) {
      
      // Update status to completed
      setDeckStatus({
        state: 'completed',
        progress: 100,
        message: 'Your presentation is ready!',
        currentSlide: totalSlides,
        totalSlides: totalSlides,
        startedAt: deckStatus?.startedAt || new Date().toISOString()
      });
      
      // Set a proper completion message if not already set above
      if (!displayMessage.includes('Your presentation is ready!')) {
        setLastSystemMessage({
          message: 'Your presentation is ready!',
          metadata: {
            ...messageMetadata,
            type: 'generation_complete',
            stage: 'generation_complete',
            progress: 100,
            // Font optimization prompts removed
          }
        });
      }
      
      // Save the final deck state to backend
      console.log('[useSlideGeneration] Saving completed deck to backend');
      const finalDeckData = useDeckStore.getState().deckData;
      if (finalDeckData && finalDeckData.uuid) {
        // Force a save to backend
        useDeckStore.getState().updateDeckData(finalDeckData);
        console.log('[useSlideGeneration] Deck saved to backend with', finalDeckData.slides.length, 'slides');
      }
      
      // Call the onComplete callback
      options.onComplete?.();
      
      // Dispatch event that deck generation is complete
      console.log('[useSlideGeneration] Dispatching deck_generation_complete event');
      window.dispatchEvent(new CustomEvent('deck_generation_complete', {
        detail: {
          deckId: event.deck_uuid || event.deck_id || useDeckStore.getState().deckData.uuid,
          timestamp: Date.now()
        }
      }));
    }

    // Handle topic_images_found event (images found for a search topic)
    if (event.type === 'topic_images_found' && event.data) {
      const { topic, images_count, images } = event.data;
      console.log(`[TopicImages] Found ${images_count} images for topic: ${topic}`);
      
      // Cache topic images globally for reuse
      if (!window.__topicImageCache) {
        window.__topicImageCache = {};
      }
      
      if (images && images.length > 0) {
        window.__topicImageCache[topic] = images;
      }
    }
    
    // Handle slide_images_found event (images assigned to a specific slide)
    if (event.type === 'slide_images_found' && event.data) {
      const { slide_id, slide_index, images_count, slide_title, images } = event.data;
      console.log(`[SlideImages] Slide "${slide_title}" has ${images_count} images`);
      
      if (images && images.length > 0 && slide_id) {
        // Initialize cache if needed
        if (!window.__slideImageCache) {
          window.__slideImageCache = {};
        }
        
        // Transform images to the format expected by image picker
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
          topic: img.topic || img.category || 'general',
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
        
        // Group images by topic
        const imagesByTopic: Record<string, any[]> = {};
        processedImages.forEach((img: any) => {
          const topic = img.topic;
          if (!imagesByTopic[topic]) {
            imagesByTopic[topic] = [];
          }
          imagesByTopic[topic].push(img);
        });
        
        // Store in cache
        window.__slideImageCache[slide_id] = {
          slideId: slide_id,
          slideIndex: slide_index || 0,
          slideTitle: slide_title || `Slide ${(slide_index || 0) + 1}`,
          images: processedImages,
          topics: Object.keys(imagesByTopic),
          images_by_topic: imagesByTopic
        };
        
        console.log(`[SlideImages] Cached ${processedImages.length} images for slide ${slide_id}`);
        
        // Dispatch event to notify UI
        window.dispatchEvent(new CustomEvent('slide_images_available', {
          detail: {
            slideId: slide_id,
            slideIndex: slide_index,
            images: processedImages
          }
        }));
      }
    }
    
    // Handle direct slide_completed event type
    if (event.type === 'slide_completed' && event.slide) {
      const slideIndex = event.slide_index;
      const slideData = event.slide;
      
      // Track slide as completed
      if (slideIndex !== undefined) {
        slidesInProgressRef.current.delete(slideIndex);
        completedSlidesRef.current.add(slideIndex);
      }
      
      console.log('[SlideGeneration] slide_completed event received:', {
        slideIndex: slideIndex,
        slideId: slideData?.id,
        hasAvailableImages: !!slideData?.availableImages,
        availableImagesCount: slideData?.availableImages?.length || 0,
        components: slideData?.components?.length || 0,
        fullData: slideData
      });
      
      if (slideData && slideIndex !== undefined) {
        // Update the slide in the deck store
        const currentDeckData = useDeckStore.getState().deckData;
        const updatedSlides = [...currentDeckData.slides];
        
        // Ensure we have enough slide slots
        while (updatedSlides.length <= slideIndex) {
          updatedSlides.push({
            id: `slide-${updatedSlides.length}`,
            deckId: currentDeckData.id,
            title: '',
            components: [],
            order: updatedSlides.length,
            status: 'pending'
          });
        }
        
        // Update the specific slide - KEEP the original ID to prevent issues
        const originalId = updatedSlides[slideIndex].id;
        updatedSlides[slideIndex] = {
          ...updatedSlides[slideIndex],
          ...slideData,
          id: originalId, // ALWAYS keep the original ID
          components: slideData.components || [],
          availableImages: slideData.availableImages || [],
          status: 'completed' as const,
          isGenerating: false, // Clear the generating flag when slide completes
          theme: (slideData as any).theme,
          palette: (slideData as any).palette
        };
        
        useDeckStore.getState().updateDeckData({
          slides: updatedSlides
        });
        
        // Cache available images for the image picker - use originalId for consistency
        const slideId = originalId;
        cacheAvailableImages(slideId, slideIndex, slideData);
        
        // Avoid duplicate handling in subsequent branches
        options.onProgress?.(event);
        return;
      }
    }
    
    // Handle slide_generated event from backend
    if (event.type === 'slide_generated' && event.slide_data) {
      console.log('[SlideGeneration] slide_generated event received:', {
        slideIndex: event.slide_index,
        slideId: event.slide_data.id,
        hasAvailableImages: !!event.slide_data.availableImages,
        availableImagesCount: event.slide_data.availableImages?.length || 0,
        components: event.slide_data.components?.length || 0,
        fullData: event.slide_data
      });
      
      // Update the slide in the deck store
      const currentDeckData = useDeckStore.getState().deckData;
      const updatedSlides = [...currentDeckData.slides];
      
      // Ensure we have enough slide slots
      while (updatedSlides.length <= event.slide_index) {
        updatedSlides.push({
          id: `slide-${updatedSlides.length}`,
          deckId: currentDeckData.id,
          title: '',
          components: [],
          order: updatedSlides.length,
          status: 'pending'
        });
      }
      
      // Update the specific slide - KEEP the original ID to prevent issues
      const originalId = updatedSlides[event.slide_index].id;
      updatedSlides[event.slide_index] = {
        ...updatedSlides[event.slide_index],
        ...event.slide_data,
        id: originalId, // ALWAYS keep the original ID
        components: event.slide_data.components || [],
        availableImages: event.slide_data.availableImages || [],
        status: 'completed' as const,
        isGenerating: false, // Clear the generating flag when slide completes
        theme: (event.slide_data as any).theme,
        palette: (event.slide_data as any).palette
      };
      
      // Save immediately for direct slide_completed events
      useDeckStore.getState().updateDeckData({
        slides: updatedSlides
      });
      
      // Cache available images for the image picker - use originalId for consistency
      const slideId = originalId;
      cacheAvailableImages(slideId, event.slide_index, event.slide_data);

      // Avoid duplicate slide_completed DOM events; rely on centralized tracker dispatch
      
      // Avoid duplicate handling in subsequent branches
      options.onProgress?.(event);
      return;
    }
    
    // Handle images_collection_complete event
    if (event.type === 'images_collection_complete' && event.data) {
      console.log('[SlideGeneration] images_collection_complete event:', event.data);
      
      // Check if we have images_by_slide structure
      if (event.data.images_by_slide) {
        Object.entries(event.data.images_by_slide).forEach(([slideId, imageData]: [string, any]) => {
          console.log(`[SlideGeneration] Caching images for slide ${slideId}:`, imageData);
          
          if (imageData.images && imageData.images.length > 0) {
            const slideIndex = imageData.slide_index || 0;
            const slideTitle = imageData.slide_title || `Slide ${slideIndex + 1}`;
            
            // Use our existing cache function with the right data structure
            cacheAvailableImages(slideId, slideIndex, {
              id: slideId,
              title: slideTitle,
              availableImages: imageData.images
            });
          }
        });
      }
      
      // Check if we have slide_images structure
      if (event.data.slide_images) {
        Object.entries(event.data.slide_images).forEach(([slideId, images]: [string, any]) => {
          console.log(`[SlideGeneration] Processing slide_images for ${slideId}:`, images);
          
          if (Array.isArray(images) && images.length > 0) {
            // Find slide from deck data
            const deckData = useDeckStore.getState().deckData;
            const slideIndex = deckData.slides.findIndex((s: any) => s.id === slideId);
            const slide = deckData.slides[slideIndex];
            
            // Use our existing cache function
            cacheAvailableImages(slideId, slideIndex >= 0 ? slideIndex : 0, {
              id: slideId,
              title: slide?.title || `Slide ${slideIndex + 1}`,
              availableImages: images
            });
          }
        });
      }

      // Post a single compact carousel row to ChatPanel after collection completes
      try {
        const slidesForCarousel: Array<{ slide_id: string; slide_title: string; images: any[] }> = [];
        let totalImages = 0;
        if (event.data.images_by_slide && Array.isArray(event.data.images_by_slide)) {
          event.data.images_by_slide.forEach((s: any) => {
            const images: any[] = [];
            if (s.images_by_topic) {
              Object.values(s.images_by_topic).forEach((arr: any) => {
                if (Array.isArray(arr)) {
                  arr.forEach((img: any) => images.push({
                    url: img.url,
                    thumbnail: img.thumbnail || img.url,
                    alt: img.alt || img.caption || '',
                    id: img.id || img.url
                  }));
                }
              });
            } else if (Array.isArray(s.images)) {
              s.images.forEach((img: any) => images.push({
                url: img.url,
                thumbnail: img.thumbnail || img.url,
                alt: img.alt || img.caption || '',
                id: img.id || img.url
              }));
            }
            totalImages += images.length;
            slidesForCarousel.push({
              slide_id: s.slide_id,
              slide_title: s.slide_title || `Slide ${(s.slide_index || 0) + 1}`,
              images
            });
          });
        } else if (event.data.slide_images && typeof event.data.slide_images === 'object') {
          Object.entries(event.data.slide_images).forEach(([sid, arr]: [string, any]) => {
            const images = Array.isArray(arr) ? arr.map((img: any) => ({
              url: img.url,
              thumbnail: img.thumbnail || img.url,
              alt: img.alt || img.caption || '',
              id: img.id || img.url
            })) : [];
            totalImages += images.length;
            // Attempt to find a title/index from cache; fallback to generic
            const cached = (window as any).__slideImageCache?.[sid];
            const title = cached?.slideTitle || `Slide ${(cached?.slideIndex || 0) + 1}`;
            slidesForCarousel.push({ slide_id: sid, slide_title: title, images });
          });
        }
        if (slidesForCarousel.length > 0) {
          postSystemMessage('Collecting images…', {
            type: 'images_collected',
            images_by_slide: slidesForCarousel,
            total_images: totalImages,
            isLoading: false,
            showDuration: 0
          });
        }
      } catch {}
    }
    
    // Handle images_ready_for_selection event  
    if (event.type === 'images_ready_for_selection' && event.data) {
      console.log('[SlideGeneration] images_ready_for_selection event:', event.data);
      
      // Process the same way as images_collection_complete
      if (event.data.images_by_slide) {
        Object.entries(event.data.images_by_slide).forEach(([slideId, imageData]: [string, any]) => {
          if (imageData.images && imageData.images.length > 0) {
            const slideIndex = imageData.slide_index || 0;
            const slideTitle = imageData.slide_title || `Slide ${slideIndex + 1}`;
            
            cacheAvailableImages(slideId, slideIndex, {
              id: slideId,
              title: slideTitle,
              availableImages: imageData.images
            });
          }
        });
      }
    }

    // Call user's progress handler
    options.onProgress?.(event);
  }, [deckId, options]);

  const handleComplete = useCallback(() => {
    setIsGenerating(false);
    // Clear processed slides for next generation
    processedSlidesRef.current.clear();
    // Clear the active generation ID
    (window as any).__activeGenerationId = null;
    options.onComplete?.();
  }, [options]);

  const handleError = useCallback((error: Error) => {
    setIsGenerating(false);
    // Clear processed slides on error
    processedSlidesRef.current.clear();
    // Clear the active generation ID
    (window as any).__activeGenerationId = null;
    toast({
      title: 'Generation Error',
      description: error.message,
      variant: 'destructive',
      duration: 5000,
    });
    options.onError?.(error);
  }, [options, toast]);

  const startGeneration = useCallback(async (generationOptions: any = {}) => {
    if (!deckId) {
      toast({
        title: 'Error',
        description: 'No deck ID available',
        variant: 'destructive'
      });
      return;
    }
    
    // Reset slide tracking but check if we should keep placeholders
    const currentDeckData = useDeckStore.getState().deckData;
    const hasExistingSlides = currentDeckData.slides && currentDeckData.slides.length > 0;
    
    // Check if deck already has generated content - don't start generation
    const hasGeneratedContent = currentDeckData.slides?.some((slide: any) => 
      slide.components && slide.components.length > 0
    );
    
    if (hasGeneratedContent) {
      console.log('[useSlideGeneration] Deck already has generated content, skipping generation start');
      // Set status to completed if not already
      setDeckStatus({
        state: 'completed',
        progress: 100,
        message: 'Your presentation is ready!',
        currentSlide: currentDeckData.slides.length,
        totalSlides: currentDeckData.slides.length,
        startedAt: new Date().toISOString()
      });
      return;
    }
    
    slidesInProgressRef.current.clear();
    completedSlidesRef.current.clear();
    themePlanShownRef.current = false;
    themeReadyShownRef.current = false;
    themeToolDedupRef.current.clear();
    themeEventPostedKeysRef.current.clear();
    // Only reset placeholders if we don't have existing slides
    if (!hasExistingSlides) {
      placeholdersCreatedRef.current = false;
    }
    lastSaveTimeRef.current = 0;

    try {
      // currentDeckData already retrieved above
      const outline = (currentDeckData as any).outline || generationOptions.outline;
      
      // Start generation through coordinator - it handles all duplicate checks
      await coordinator.startGeneration({
        deckId,
        outline,
        prompt: generationOptions.prompt || (currentDeckData as any).prompt || currentDeckData.name,
        slideCount: generationOptions.slideCount || 6,
        detailLevel: generationOptions.detailLevel || 'standard',
        auto: generationOptions.auto,
        onProgress: handleProgress,
        onComplete: handleComplete,
        onError: handleError
      });
      
      // Show toast only if not auto-generated
      if (!generationOptions.auto) {
        toast({
          title: 'Generation Started',
          description: 'Your slides are being generated...',
          duration: 5000,
        });
      }
    } catch (error: any) {
      // Only show error if it's not a duplicate generation
      if (!error.message?.includes('already in progress')) {
        toast({
          title: 'Failed to start generation',
          description: error.message || 'An error occurred',
          variant: 'destructive'
        });
      }
    }
  }, [deckId, coordinator, handleProgress, handleComplete, handleError, toast]);

  const stopGeneration = useCallback(async () => {
    if (!deckId) return;
    
    try {
      await coordinator.stopGeneration(deckId);
      toast({
        title: 'Generation stopped',
        description: 'Slide generation has been cancelled',
        duration: 3000
      });
    } catch (error) {
      console.error('[useSlideGeneration] Error stopping generation:', error);
    }
  }, [deckId, coordinator, toast]);
  
  // Subscribe to coordinator events
  useEffect(() => {
    const handleStart = (e: CustomEvent) => {
      if (e.detail.deckId === deckId) {
        setIsGenerating(true);
        processedSlidesRef.current.clear();
      }
    };

    const handleComplete = (e: CustomEvent) => {
      if (e.detail.deckId === deckId) {
        setIsGenerating(false);
      }
    };

    const handleError = (e: CustomEvent) => {
      if (e.detail.deckId === deckId) {
        setIsGenerating(false);
      }
    };

    const handleCancelled = (e: CustomEvent) => {
      if (e.detail.deckId === deckId) {
        setIsGenerating(false);
      }
    };

    coordinator.addEventListener('generation:started', handleStart as EventListener);
    coordinator.addEventListener('generation:completed', handleComplete as EventListener);
    coordinator.addEventListener('generation:failed', handleError as EventListener);
    coordinator.addEventListener('generation:cancelled', handleCancelled as EventListener);

    return () => {
      coordinator.removeEventListener('generation:started', handleStart as EventListener);
      coordinator.removeEventListener('generation:completed', handleComplete as EventListener);
      coordinator.removeEventListener('generation:failed', handleError as EventListener);
      coordinator.removeEventListener('generation:cancelled', handleCancelled as EventListener);
    };
  }, [coordinator, deckId]);
  
  // Expose handleProgress to window for testing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__handleSlideGeneration = handleProgress;
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).__handleSlideGeneration;
      }
    };
  }, [handleProgress]);

  // Listen to coordinator progress bus so events from other entry points (e.g., DeckList) are reflected
  useEffect(() => {
    const onProgressEvent = (e: Event) => {
      try {
        const ce = e as CustomEvent;
        const eventDeckId = ce.detail?.deckId;
        const evt = ce.detail?.event || ce.detail; // support both shapes
        // If this hook is bound to a specific deck, filter by deckId when available
        if (!deckId || !eventDeckId || eventDeckId === deckId) {
          handleProgress(evt);
        }
      } catch {}
    };
    coordinator.addEventListener('generation:progress', onProgressEvent as EventListener);
    return () => {
      coordinator.removeEventListener('generation:progress', onProgressEvent as EventListener);
    };
  }, [coordinator, deckId, handleProgress]);

  return {
    isGenerating,
    deckStatus,
    lastSystemMessage,
    startGeneration,
    stopGeneration,
    handleGenerationProgress: handleProgress
  };
} 
