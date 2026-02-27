import React, { useRef, useEffect, RefObject, useMemo, useState, useCallback, memo } from "react";
import DOMPurify from 'dompurify';
import * as Sentry from '@sentry/react';
import { ComponentInstance } from "../../types/components";
import { useComponentInstance } from "../../context/CustomComponentStateContext";
import { useNavigation } from '../../context/NavigationContext';
import { usePresentationStore } from '@/stores/presentationStore';
import { useActiveSlideSafe } from '../../context/ActiveSlideContext';
import { useEditorStore } from '@/stores/editorStore';
import { useDeckStore } from '@/stores/deckStore';
import { useEditorState } from '@/context/EditorStateContext';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { CustomComponentEditOverlay, DetectedElement, injectEditMode } from '@/components/custom-component-editor';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { compileRenderCode } from './custom/compileRenderCode';
import { DEBUG_CUSTOM_COMPONENT } from './custom/debug';
import { useCustomComponentImageAutoApply } from './custom/useCustomComponentImageAutoApply';
import { useCustomComponentImageProxy } from './custom/useCustomComponentImageProxy';
import { extractFontFamiliesFromHtml, injectIframeFonts } from './custom/iframeFonts';
import { FontLoadingService } from '@/services/FontLoadingService';
import { API_CONFIG } from '@/config/environment';
import { useThumbnailRenderMode } from '@/context/ThumbnailRenderContext';
import { MediaHub } from '@/components/media/MediaHub';

// Browser detection for iOS-specific safety checks
import { BROWSER } from '@/utils/browser';

// Simple error boundary with callback support
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: () => void; fallback?: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; onError?: () => void; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('[CustomComponent] Error caught by boundary:', error);
    Sentry.captureException(error);
    // Notify parent component of error
    this.props.onError?.();
  }

  componentDidUpdate(prevProps: { children: React.ReactNode }) {
    // Reset error state when children change (slide navigation, HMR fix, etc.)
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided, otherwise show default error UI
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 6,
          background: 'rgba(211,47,47,0.1)',
          border: '1px solid rgba(211,47,47,0.3)',
          color: 'rgba(211,47,47,0.8)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          Error
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Strip injected edit mode scripts and styles from HTML before saving.
 * This prevents script accumulation when HTML is edited and saved multiple times.
 */
const stripInjectedScripts = (html: string): string => {
  if (!html) return html;
  let result = html;

  // Remove NEXTSLIDE EDIT MODE markers
  result = result.replace(/<!-- NEXTSLIDE EDIT MODE V2 -->/g, '');

  // Remove edit mode styles block (id="ns-edit-mode-styles")
  result = result.replace(/<style[^>]*id=["']ns-edit-mode-styles["'][^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove ns-placeholder-wrapper styles and scripts
  result = result.replace(/<style>\s*\.ns-placeholder-wrapper[\s\S]*?<\/style>\s*<script>[\s\S]*?ns-placeholder-wrapper[\s\S]*?<\/script>/gi, '');

  // Remove ns-image-processing-overlay styles and scripts
  result = result.replace(/<style>\s*\.ns-image-processing-overlay[\s\S]*?<\/style>\s*<script>[\s\S]*?ns-image-processing-overlay[\s\S]*?<\/script>/gi, '');

  // Remove individual <script> blocks that contain our injected markers.
  // CRITICAL: We split by </script> to process each block independently,
  // preventing regex from crossing script boundaries and eating user JS.
  const NS_MARKERS = [
    'ns-custom-component-edit',
    'NEXTSLIDE EDIT MODE',
    'customcomponent:image-click',
    'ns-slide-zoom',
  ];

  const scriptBlockRegex = /<script[^>]*>[\s\S]*?<\/script>/gi;
  result = result.replace(scriptBlockRegex, (block) => {
    for (const marker of NS_MARKERS) {
      if (block.includes(marker)) return '';
    }
    return block;
  });

  // Clean up multiple consecutive newlines
  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
};

/**
 * Simplified custom component renderer
 * CRITICAL FIXES:
 * 1. Stable iframe rendering to prevent flashing
 * 2. Click-through overlay for selection in edit mode
 * 3. Proper content fitting
 *
 * Wrapped in React.memo with custom comparison to prevent unnecessary re-renders.
 */
export const CustomComponentRenderer: React.FC<{
  component: ComponentInstance;
  baseStyles: React.CSSProperties;
  containerRef: RefObject<HTMLDivElement | null>;
  isThumbnail?: boolean;
  isSelected?: boolean;
  isEditing?: boolean;
}> = memo(({ component, baseStyles, containerRef, isThumbnail = false, isSelected = false, isEditing = false }) => {
  const thumbnailMode = useThumbnailRenderMode();

  // Get slide dimensions for proper percentage-to-pixel conversion
  const editorState = useEditorState();
  const slideSize = editorState.slideSize || { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT };

  // Track if rendering has crashed - show fallback instead
  const [hasRenderError, setHasRenderError] = useState(false);

  // THUMBNAIL SAFETY:
  // For thumbnails on iOS in 'lite' mode, render a simple placeholder instead of iframe
  // This is controlled by ThumbnailRenderContext from the parent (MiniSlide/DeckCard)
  const shouldUseLiteMode = isThumbnail && BROWSER.isIOS && thumbnailMode === 'lite';
  const shouldUseStaticHtml = isThumbnail && BROWSER.isIOS; // iOS thumbnails use static HTML

  // Show simple placeholder for thumbnails OR if there was a render error
  if (shouldUseLiteMode || hasRenderError) {
    // Try to extract background color from the component's render code for a better preview
    const renderCode = component.props?.render as string || '';
    let bgColor = 'rgba(0,0,0,0.06)';
    let bgGradient = '';

    // Extract background from CSS in render code
    const bgMatch = renderCode.match(/background(?:-color)?:\s*([^;}\n]+)/i);
    if (bgMatch) {
      const bgValue = bgMatch[1].trim();
      if (bgValue.includes('gradient') || bgValue.includes('linear') || bgValue.includes('radial')) {
        bgGradient = bgValue;
      } else if (bgValue.startsWith('#') || bgValue.startsWith('rgb') || bgValue.startsWith('hsl')) {
        bgColor = bgValue;
      }
    }

    return (
      <div
        data-custom-component="true"
        data-thumbnail={isThumbnail ? "true" : undefined}
        data-error={hasRenderError ? "true" : undefined}
        style={{
          ...baseStyles,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 6,
          background: hasRenderError ? 'rgba(211,47,47,0.1)' : (bgGradient || bgColor),
          border: hasRenderError ? '1px solid rgba(211,47,47,0.3)' : '1px solid rgba(0,0,0,0.08)',
          color: hasRenderError ? 'rgba(211,47,47,0.8)' : 'rgba(255,255,255,0.7)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          pointerEvents: 'none',
          textShadow: '0 1px 2px rgba(0,0,0,0.3)',
        }}
      >
        {hasRenderError ? 'Error' : ''}
      </div>
    );
  }

  const renderCode = component.props.render as string;

  // Debug logging - only when DEBUG_CUSTOM_COMPONENT is enabled
  DEBUG_CUSTOM_COMPONENT && console.log(`🎯 [CustomComponentRenderer] Component ${component.id} rendering with ${renderCode?.length || 0} chars`);

  // Create a robust hash of the render code to detect content changes for iframe remounting
  // This ensures the iframe refreshes when the HTML content changes after edits
  const renderCodeHash = useMemo(() => {
    if (!renderCode) return '0';
    // Use djb2 hash algorithm - fast and reliable for detecting any content change
    let hash = 5381;
    const len = renderCode.length;
    // Sample every 100th character for performance on large documents, but always include key positions
    const sampleInterval = Math.max(1, Math.floor(len / 100));
    for (let i = 0; i < len; i += sampleInterval) {
      hash = ((hash << 5) + hash) ^ renderCode.charCodeAt(i);
    }
    // Always include first, middle, and last chars for extra sensitivity
    hash = ((hash << 5) + hash) ^ (renderCode.charCodeAt(0) || 0);
    hash = ((hash << 5) + hash) ^ (renderCode.charCodeAt(Math.floor(len / 2)) || 0);
    hash = ((hash << 5) + hash) ^ (renderCode.charCodeAt(len - 1) || 0);
    // Convert to unsigned 32-bit and combine with length
    const finalHash = `${len}-${(hash >>> 0).toString(36)}`;
    DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] renderCodeHash computed:', { componentId: component.id, hash: finalHash, len });
    return finalHash;
  }, [renderCode, component.id]);

  // Track renderCode changes - only log when DEBUG enabled
  const prevRenderCodeLenRef = useRef<number>(0);
  useEffect(() => {
    const len = renderCode?.length || 0;
    if (DEBUG_CUSTOM_COMPONENT && prevRenderCodeLenRef.current > 0 && prevRenderCodeLenRef.current !== len) {
      console.log('[CustomComponent] 🔄 RENDER CODE CHANGED:', {
        componentId: component.id,
        prevLen: prevRenderCodeLenRef.current,
        newLen: len,
        hash: renderCodeHash,
        sample: renderCode?.substring(0, 100)
      });
    }
    prevRenderCodeLenRef.current = len;
  }, [renderCode, component.id, renderCodeHash]);

  // Stable component props - memoize to prevent unnecessary re-renders
  const componentProps = useMemo(() => ({
    ...component.props,
    ...(component.props.props || {})
  }), [component.props]);

  const [fontCatalogVersion, setFontCatalogVersion] = useState(0);
  useEffect(() => {
    let active = true;
    FontLoadingService.syncDesignerFonts?.().then(() => {
      if (active) setFontCatalogVersion((v) => v + 1);
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Get deck theme fonts as fallback
  const deckData = useDeckStore((state) => state.deckData);
  const deckThemeFonts = useMemo(() => {
    const theme = deckData?.theme || {};
    const typography = theme.typography || {};
    return {
      // Check all known formats: flat, camelCase, nested backend, nested frontend
      bodyFont: typography.body_font || typography.bodyFont || typography.body_text?.family || typography.paragraph?.fontFamily,
      heroFont: typography.hero_font || typography.heroFont || typography.hero_title?.family || typography.heading?.fontFamily
    };
  }, [deckData?.theme]);

  // Debug: Log when component re-renders with font-related props
  const fontOverrideBody = component.props?.overrideBodyFont;
  const fontOverrideHero = component.props?.overrideHeroFont;
  const resolvedFonts = useMemo(() => {
    const props = component.props || {};
    const nested = (props.props && typeof props.props === 'object') ? props.props as Record<string, any> : {};

    // Font priority order:
    // 1. Explicit slide-level overrides (overrideBodyFont/overrideHeroFont) - highest priority
    // 2. Deck theme fonts - normal priority for global consistency
    // 3. Component body/hero font props - explicit role-specific font
    // 4. Component fontFamily - generic fallback (often hero font, so lowest priority for body)
    const bodyFont =
      props.overrideBodyFont ||      // Slide-specific override (user explicitly set)
      nested.overrideBodyFont ||
      deckThemeFonts.bodyFont ||     // Deck theme (global font)
      props.bodyFont ||              // Component body font (explicit)
      nested.bodyFont ||
      props.fontFamily ||            // Generic fallback (often hero font)
      nested.fontFamily;

    const heroFont =
      props.overrideHeroFont ||      // Slide-specific override
      nested.overrideHeroFont ||
      deckThemeFonts.heroFont ||     // Deck theme (global font)
      props.heroFont ||              // Component hero font (explicit)
      props.headingFont ||
      nested.heroFont ||
      nested.headingFont ||
      props.fontFamily ||            // Generic fallback
      nested.fontFamily;

    return {
      bodyFont: typeof bodyFont === 'string' ? bodyFont : undefined,
      heroFont: typeof heroFont === 'string' ? heroFont : undefined
    };
  }, [component.props, deckThemeFonts]);

  // Keep last successful compiled render to avoid flicker during recompilation
  const compiledRenderRef = useRef<Function | null>(null);
  const { currentSlideIndex } = useNavigation();
  const lastSlideIndexRef = useRef<number>(currentSlideIndex);

  // Get component state
  const { state, updateState, clearState } = useComponentInstance(component.id);

  // Get updateComponent from ActiveSlide context for direct image updates
  // Use safe version — this component renders in thumbnails/presentation without ActiveSlideProvider
  const { updateComponent } = useActiveSlideSafe();

  // Listen for image selection events and update component directly
  // NOTE: Disabled on iOS due to postMessage crash issues
  useEffect(() => {
    if (!isEditing || isThumbnail || BROWSER.isIOS) return;

    const handleImageSelected = (event: CustomEvent) => {
      const { componentId, propName, imageUrl, elementId } = event.detail || {};

      // Only handle events for this component
      if (componentId !== component.id) return;

      DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Received image selection:', { componentId, propName, imageUrl: imageUrl?.substring(0, 60) });

      if (!propName || !imageUrl) {
        DEBUG_CUSTOM_COMPONENT && console.warn('[CustomComponentRenderer] Missing propName or imageUrl');
        return;
      }

      // Send loading state to THIS component's iframe only (not all iframes)
      // This prevents image updates from affecting other custom components on the slide
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({
          target: 'ns-custom-component-edit',
          type: 'update-image-with-placeholder',
          elementId: elementId || propName,
          newSrc: imageUrl
        }, '*');
      }

      // Get current props
      const currentProps = component.props.props || {};
      DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Current props:', Object.keys(currentProps));

      // Update the specific prop
      const updatedProps = {
        ...currentProps,
        [propName]: imageUrl,
      };
      DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Updated props:', Object.keys(updatedProps));

      // Update only the changed prop (delta update to avoid overwriting concurrent changes)
      updateComponent(component.id, {
        props: {
          props: updatedProps,
        }
      });
      DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Component update dispatched');

      // Clear selected element to auto-dismiss picker state
      setSelectedElement(null);
      setShowImageToolbar(false);
    };

    window.addEventListener('customcomponent:image-selected', handleImageSelected as EventListener);
    return () => {
      window.removeEventListener('customcomponent:image-selected', handleImageSelected as EventListener);
    };
  }, [isEditing, isThumbnail, component.id, component.props.props, updateComponent]);

  useCustomComponentImageAutoApply({ component, renderCode, isEditing, isThumbnail, updateComponent });
  useCustomComponentImageProxy({ component, renderCode, isEditing, isThumbnail, updateComponent });

  // Reset state when slide changes
  useEffect(() => {
    if (!isThumbnail && currentSlideIndex !== lastSlideIndexRef.current) {
      clearState();
      // Also clear selected element to prevent stale UI state causing crashes on mobile
      setSelectedElement(null);
      setShowAiChatBubble(false);
      setShowImageToolbar(false);
      lastSlideIndexRef.current = currentSlideIndex;
    }
  }, [currentSlideIndex, isThumbnail, clearState]);

  // Cleanup on unmount - prevents crashes on mobile when component unmounts during slide transitions
  useEffect(() => {
    return () => {
      // Clear any UI state that might cause portal crashes
      setSelectedElement(null);
      setShowAiChatBubble(false);
      setShowImageToolbar(false);
    };
  }, []);

  // Compile render function synchronously to prevent initial flash
  const { compiledRender, compilationError } = useMemo(() => compileRenderCode(renderCode), [renderCode]);

  // Cache last good compiled render to avoid flicker between edits
  useEffect(() => {
    if (compiledRender) {
      compiledRenderRef.current = compiledRender;
    }
  }, [compiledRender]);

  // Check if we're in presentation mode - subscribe to store changes
  const isPresenting = usePresentationStore(state => state.isPresenting);

  // Determine effective edit mode
  // Edit mode = explicitly editing in the editor (not presenting, not thumbnail)
  // View mode = presenting OR viewing without editing (should allow interaction)
  // CRITICAL FIX: Only set effectiveIsEditMode=true when actually editing
  // Previously this was incorrectly true in view mode, blocking clicks
  const effectiveIsEditMode = !isPresenting && !isThumbnail && isEditing;

  // Debug logging for interaction issues - always log for debugging edit mode
  useEffect(() => {
    DEBUG_CUSTOM_COMPONENT && console.log(`[CustomComponent:${component.id.slice(0, 8)}] State:`, {
      effectiveIsEditMode,
      isPresenting,
      isThumbnail,
      isSelected,
      isEditingProp: isEditing,
      hasRenderCode: !!renderCode,
      renderCodeLength: renderCode?.length || 0,
      computedPointerEvents: isSelected || !effectiveIsEditMode ? 'auto' : 'none'
    });
  }, [effectiveIsEditMode, isPresenting, isThumbnail, isSelected, isEditing, component.id, renderCode]);

  // Ref for the content wrapper
  const contentInnerRef = useRef<HTMLDivElement>(null);

  // Ref for the iframe element
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // State for element-level editing
  const [selectedElement, setSelectedElement] = useState<DetectedElement | null>(null);
  const [showImageToolbar, setShowImageToolbar] = useState(false);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [showAiChatBubble, setShowAiChatBubble] = useState(false);
  const [aiChatMessage, setAiChatMessage] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [containerBoundsState, setContainerBoundsState] = useState<DOMRect | null>(null);
  // State for drag-drop file upload in container edit mode
  const [containerDragOver, setContainerDragOver] = useState(false);
  const [containerUploadedFile, setContainerUploadedFile] = useState<{name: string, url: string} | null>(null);
  const containerFileInputRef = useRef<HTMLInputElement>(null);

  // State for image AI edit bubble (calls /api/images/edit directly instead of chat dispatch)
  const [imageAiPrompt, setImageAiPrompt] = useState('');
  const [imageAiProcessing, setImageAiProcessing] = useState(false);
  const [imageFuseAttachments, setImageFuseAttachments] = useState<Array<{ name: string; url?: string; mimeType?: string; size?: number; pending?: boolean }>>([]);
  const [imageDragOver, setImageDragOver] = useState(false);
  const [imageTransparentBg, setImageTransparentBg] = useState(false);
  const [imageObjectFit, setImageObjectFit] = useState('cover');
  const imageAiFuseFileInputRef = useRef<HTMLInputElement>(null);

  // Update container bounds when resizing
  // NOTE: ResizeObserver can crash on iOS Safari, so we skip it there
  useEffect(() => {
    if (BROWSER.isIOS) return; // Skip ResizeObserver on iOS

    const updateBounds = () => {
      try {
        if (contentInnerRef.current) {
          setContainerBoundsState(contentInnerRef.current.getBoundingClientRect());
        }
      } catch (err) {
        // Ignore getBoundingClientRect errors on iOS
      }
    };

    updateBounds();
    let observer: ResizeObserver | null = null;
    try {
      observer = new ResizeObserver(updateBounds);
      if (contentInnerRef.current) {
        observer.observe(contentInnerRef.current);
      }
    } catch (err) {
      // ResizeObserver may not be available or may crash
    }

    return () => {
      try {
        observer?.disconnect();
      } catch (err) {
        // Ignore disconnect errors
      }
    };
  }, []);

  // Listen for image processing events from ImageSlotEditor and notify iframe
  // NOTE: Disabled on iOS due to postMessage crash issues
  useEffect(() => {
    if (BROWSER.isIOS) return; // Skip on iOS

    const handleImageProcessing = (event: CustomEvent<{ componentId: string; propName: string; isProcessing: boolean }>) => {
      const { componentId: targetComponentId, propName, isProcessing } = event.detail;
      if (targetComponentId === component.id) {
        // Send message to iframe to show/hide processing overlay on the specific image
        try {
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({
              type: 'image-processing',
              propName,
              isProcessing
            }, '*');
          }
        } catch (err) {
          // Ignore postMessage errors on iOS
        }
      }
    };

    window.addEventListener('image:processing' as any, handleImageProcessing);
    return () => {
      window.removeEventListener('image:processing' as any, handleImageProcessing);
    };
  }, [component.id]);

  // Container dimensions - use component's SLIDE dimensions (component.props.width/height),
  // NOT componentProps which merges nested props.props that may contain design-level overrides.
  // During resize, component.props.width/height are updated but props.props.width/height stay stale,
  // causing a mismatch between the content wrapper size and the actual component bounds.
  // CRITICAL: Component dimensions may be stored as percentages (0-100) representing % of slide size
  // If the value is small (<=100) and slide is large (>500px), convert from percentage to pixels
  const rawWidth = typeof component.props.width === 'number' ? component.props.width : 400;
  const rawHeight = typeof component.props.height === 'number' ? component.props.height : 200;

  // Helper to detect if a value looks like a percentage vs absolute pixels
  const convertToAbsolute = (value: number, slideAxis: number): number => {
    // If value is small (<=100) and slide is large, treat as percentage
    if (value > 0 && value <= 100 && slideAxis > 500) {
      return (value / 100) * slideAxis;
    }
    // Otherwise treat as absolute pixels
    return value;
  };

  const containerWidth = convertToAbsolute(rawWidth, slideSize.width);
  const containerHeight = convertToAbsolute(rawHeight, slideSize.height);

  // Check if this is an iframe-based component (detected during compilation)
  const isIframeComponent = compiledRender && typeof compiledRender === 'object' && (compiledRender as any).__isIframe;
  const iframeSrcDoc = isIframeComponent ? (compiledRender as any).srcDoc : null;

  // For iframe components: always use the DESIGN dimensions (DEFAULT_SLIDE_WIDTH x
  // DEFAULT_SLIDE_HEIGHT) for the content wrapper, not the current component dimensions.
  // The backend generates all custom component HTML at 1920x1080, and the CSS scale()
  // transform handles mapping to the actual displayed component size. This prevents
  // content reflow when the component is resized — only the scale changes, keeping the
  // iframe viewport constant and the HTML layout stable.
  const effectiveContentWidth = isIframeComponent
    ? DEFAULT_SLIDE_WIDTH
    : containerWidth;
  const effectiveContentHeight = isIframeComponent
    ? DEFAULT_SLIDE_HEIGHT
    : containerHeight;

  // Inject click handlers for placeholder images in edit mode
  const injectImageClickHandlers = (html: string, componentId: string): string => {
    if (!html || !isEditing) return html;

    // Script to inject that handles placeholder image clicks
    const clickHandlerScript = `
<style>
  .ns-placeholder-wrapper {
    position: relative !important;
    display: inline-block !important;
  }
  .ns-placeholder-hint {
    position: absolute !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    color: white !important;
    background: rgba(99, 102, 241, 0.9) !important;
    padding: 8px 16px !important;
    border-radius: 8px !important;
    font-size: 13px !important;
    font-weight: 500 !important;
    pointer-events: none !important;
    text-align: center !important;
    white-space: nowrap !important;
    z-index: 1000 !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important;
  }
  .ns-placeholder-img {
    cursor: pointer !important;
    outline: 3px dashed rgba(99, 102, 241, 0.7) !important;
    outline-offset: -3px !important;
    min-height: 80px !important;
    min-width: 80px !important;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0.05) 100%) !important;
    transition: all 0.2s ease !important;
  }
  .ns-placeholder-img:hover {
    outline-color: rgba(99, 102, 241, 1) !important;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(99, 102, 241, 0.1) 100%) !important;
  }
</style>
<script>
(function() {
  var processedImages = new WeakSet();

  function setupImageClickHandlers() {
    var images = document.querySelectorAll('img');
    images.forEach(function(img, index) {
      if (processedImages.has(img)) return;

      var src = img.getAttribute('src') || '';
      // Check if this is a placeholder or empty src - real URLs start with http or data:
      var isPlaceholder = !src || src === 'placeholder' || src.includes('placeholder') || src === '' ||
                          (!src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('blob:'));

      if (isPlaceholder) {
        processedImages.add(img);

        // Add placeholder styling class
        img.classList.add('ns-placeholder-img');

        // Wrap image in a relative container for proper hint positioning
        var wrapper = document.createElement('div');
        wrapper.className = 'ns-placeholder-wrapper';
        wrapper.style.width = img.style.width || img.getAttribute('width') || '100%';
        wrapper.style.height = img.style.height || img.getAttribute('height') || 'auto';

        // Insert wrapper before img and move img inside
        if (img.parentElement) {
          img.parentElement.insertBefore(wrapper, img);
          wrapper.appendChild(img);

          // Add hint overlay
          var hint = document.createElement('div');
          hint.className = 'ns-placeholder-hint';
          var alt = img.getAttribute('alt') || '';
          hint.innerHTML = '📷 ' + (alt ? 'Select: ' + alt.substring(0, 20) + (alt.length > 20 ? '...' : '') : 'Click to select image');
          wrapper.appendChild(hint);
        }

        // Add click handler to wrapper
        wrapper.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();

          var alt = img.getAttribute('alt') || '';
          var id = img.getAttribute('id') || 'img-' + index;
          var dataProp = img.getAttribute('data-prop') || '';

          // Infer prop name from alt text: "Elon Musk Portrait" -> "elonMuskPortraitImage"
          var propName = dataProp;
          if (!propName && alt) {
            propName = alt.replace(/[^a-zA-Z0-9]/g, ' ').split(' ').filter(Boolean).map(function(w, i) {
              return i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
            }).join('') + 'Image';
          }
          if (!propName) propName = 'image' + index;

          window.parent.postMessage({
            type: 'customcomponent:image-click',
            componentId: '${componentId}',
            imageIndex: index,
            imageId: id,
            imageAlt: alt,
            propName: propName,
            currentSrc: src
          }, '*');
        });
      }
    });
  }

  // Run on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupImageClickHandlers);
  } else {
    setupImageClickHandlers();
  }

  // Re-run for dynamic content
  setTimeout(setupImageClickHandlers, 100);
  setTimeout(setupImageClickHandlers, 300);
  setTimeout(setupImageClickHandlers, 800);
})();
</script>`;

    // DEDUPLICATION: Only inject if not already present
    if (html.includes('NEXTSLIDE EDIT MODE V2')) {
      return html; // Already has click handlers
    }

    // Inject before </body> or at end
    if (html.includes('</body>')) {
      return html.replace('</body>', clickHandlerScript + '\n<!-- NEXTSLIDE EDIT MODE V2 -->\n</body>');
    } else if (html.includes('</html>')) {
      return html.replace('</html>', clickHandlerScript + '\n<!-- NEXTSLIDE EDIT MODE V2 -->\n</html>');
    } else {
      return html + clickHandlerScript + '\n<!-- NEXTSLIDE EDIT MODE V2 -->\n';
    }
  };

  const injectZoomRelay = (html: string, componentId: string): string => {
    if (!html || BROWSER.isIOS || isThumbnail) return html;
    if (html.includes('ns-slide-zoom')) return html;

    const zoomRelayScript = `
<script>
(function() {
  if (window.__nsSlideZoomInstalled) return;
  window.__nsSlideZoomInstalled = true;

  function getFrameRect() {
    try {
      return window.frameElement ? window.frameElement.getBoundingClientRect() : null;
    } catch (e) {
      return null;
    }
  }

  function toParentPoint(evt) {
    var rect = getFrameRect();
    if (!rect) return null;
    var width = window.innerWidth || rect.width || 1;
    var height = window.innerHeight || rect.height || 1;
    var scaleX = rect.width / width;
    var scaleY = rect.height / height;
    return {
      x: rect.left + (evt.clientX * scaleX),
      y: rect.top + (evt.clientY * scaleY)
    };
  }

  function postZoom(payload) {
    try {
      window.parent.postMessage(payload, '*');
    } catch (e) {}
  }

  function handleWheel(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    e.stopPropagation();
    var point = toParentPoint(e);
    postZoom({
      source: 'ns-slide-zoom',
      method: 'wheel',
      componentId: '${componentId}',
      deltaY: e.deltaY,
      deltaMode: e.deltaMode || 0,
      clientX: point ? point.x : null,
      clientY: point ? point.y : null
    });
  }

  function handleGestureStart(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleGestureChange(e) {
    e.preventDefault();
    e.stopPropagation();
    var point = toParentPoint(e);
    postZoom({
      source: 'ns-slide-zoom',
      method: 'gesture',
      componentId: '${componentId}',
      scale: e.scale || 1,
      clientX: point ? point.x : null,
      clientY: point ? point.y : null
    });
  }

  function handleGestureEnd(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
  window.addEventListener('gesturestart', handleGestureStart, { passive: false, capture: true });
  window.addEventListener('gesturechange', handleGestureChange, { passive: false, capture: true });
  window.addEventListener('gestureend', handleGestureEnd, { passive: false, capture: true });
})();
</script>`;

    if (html.includes('</head>')) {
      return html.replace('</head>', zoomRelayScript + '</head>');
    } else if (html.includes('</body>')) {
      return html.replace('</body>', zoomRelayScript + '</body>');
    } else if (html.includes('</html>')) {
      return html.replace('</html>', zoomRelayScript + '</html>');
    }
    return html + zoomRelayScript;
  };

  /**
   * Inject a runtime "safety net" that fixes common interactivity issues
   * in AI-generated HTML. Uses CSS rules (not inline styles) so the edit
   * mode overlay's `body.ns-overlay-mode * { pointer-events:none }` can
   * still take precedence when editing. Also runs a lightweight JS pass
   * to neutralize decorative overlays that sit on top of buttons.
   */
  const injectInteractivityFixes = (html: string): string => {
    if (!html || isThumbnail) return html;
    if (html.includes('ns-interactivity-fix')) return html; // Already injected

    const fixScript = `
<style>
/* === NextSlide Interactivity Safety Net === */
/* 1. Kill user-select:none globally — it breaks click handling in iframes */
*:not(svg *) { user-select: auto !important; -webkit-user-select: auto !important; }

/* 2. Ensure buttons/tabs are clickable UNLESS edit overlay is active */
body:not(.ns-overlay-mode) button,
body:not(.ns-overlay-mode) [onclick],
body:not(.ns-overlay-mode) [role="button"],
body:not(.ns-overlay-mode) [role="tab"],
body:not(.ns-overlay-mode) input,
body:not(.ns-overlay-mode) select,
body:not(.ns-overlay-mode) textarea,
body:not(.ns-overlay-mode) .tab-btn,
body:not(.ns-overlay-mode) .nav-btn,
body:not(.ns-overlay-mode) .accordion-header {
  pointer-events: auto !important;
  position: relative;
}

/* 3. Give ::before/::after on interactive wrappers safe pointer-events */
body:not(.ns-overlay-mode) button::before,
body:not(.ns-overlay-mode) button::after,
body:not(.ns-overlay-mode) .tab-btn::before,
body:not(.ns-overlay-mode) .tab-btn::after,
body:not(.ns-overlay-mode) [role="tab"]::before,
body:not(.ns-overlay-mode) [role="tab"]::after {
  pointer-events: none !important;
}
</style>
<script>
(function() {
  if (window.__nsInteractivityFixInstalled) return;
  window.__nsInteractivityFixInstalled = true;

  var INTERACTIVE_SELECTOR = 'button, [onclick], [role="button"], [role="tab"], input, select, textarea, a[href], .tab-btn, .nav-btn, .accordion-header';

  function fixOverlays() {
    /* Skip when edit overlay is active */
    if (document.body.classList.contains('ns-overlay-mode')) return;

    var interactiveEls = document.querySelectorAll(INTERACTIVE_SELECTOR);
    if (!interactiveEls.length) return;

    /* Collect interactive bounding rects once */
    var btnRects = [];
    interactiveEls.forEach(function(el) {
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) btnRects.push(r);
    });
    if (!btnRects.length) return;

    /* Walk ancestors of every button — unblock pointer-events on the chain */
    interactiveEls.forEach(function(el) {
      var parent = el.parentElement;
      while (parent && parent !== document.body) {
        var cs = window.getComputedStyle(parent);
        if (cs.pointerEvents === 'none') {
          parent.style.pointerEvents = 'auto';
        }
        parent = parent.parentElement;
      }
    });

    /* Find absolutely-positioned decorative elements that overlap buttons */
    document.querySelectorAll('*').forEach(function(el) {
      var cs = window.getComputedStyle(el);
      if (cs.position !== 'absolute' && cs.position !== 'fixed') return;
      if (cs.pointerEvents === 'none') return; /* already safe */

      var tag = el.tagName.toLowerCase();
      if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' ||
          tag === 'textarea' || tag === 'script' || tag === 'style' ||
          tag === 'html' || tag === 'body') return;
      if (el.getAttribute('onclick') || el.getAttribute('role') === 'button' ||
          el.getAttribute('role') === 'tab') return;
      if (el.querySelector(INTERACTIVE_SELECTOR)) return;
      /* Skip content containers */
      if ((el.textContent || '').trim().length > 50 || el.children.length > 2) return;
      if (el.children.length > 0 && el.querySelector('h1, h2, h3, p, ul, ol, table')) return;

      var elRect = el.getBoundingClientRect();
      if (elRect.width === 0 || elRect.height === 0) return;

      for (var i = 0; i < btnRects.length; i++) {
        var br = btnRects[i];
        var overlaps = !(elRect.right < br.left || elRect.left > br.right ||
                        elRect.bottom < br.top || elRect.top > br.bottom);
        if (overlaps) {
          el.style.pointerEvents = 'none';
          break;
        }
      }
    });
  }

  /* Run after DOM is ready and after delays for dynamic content */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      fixOverlays();
      setTimeout(fixOverlays, 200);
    });
  } else {
    fixOverlays();
    setTimeout(fixOverlays, 200);
  }
  setTimeout(fixOverlays, 600);
})();
</script>
<!-- ns-interactivity-fix -->`;

    // Inject CSS in <head> and script before </body> for proper ordering
    let result = html;

    // Extract and inject the <style> block into <head>
    const styleEnd = fixScript.indexOf('</style>') + '</style>'.length;
    const styleBlock = fixScript.substring(0, styleEnd);
    const scriptBlock = fixScript.substring(styleEnd);

    if (result.includes('</head>')) {
      result = result.replace('</head>', styleBlock + '\n</head>');
    } else if (result.includes('<body')) {
      result = result.replace('<body', styleBlock + '\n<body');
    }

    if (result.includes('</body>')) {
      return result.replace('</body>', scriptBlock + '\n</body>');
    } else if (result.includes('</html>')) {
      return result.replace('</html>', scriptBlock + '\n</html>');
    }
    return result + scriptBlock;
  };

  /**
   * Prevent "flash" where images render at intrinsic size before CSS/object-fit
   * has been applied inside iframe-based HTML. We hide images by default and
   * reveal them only after decode/load so the first paint is already correct.
   */
  const injectImageStabilityFixes = (html: string): string => {
    if (!html || isThumbnail) return html;
    if (html.includes('ns-image-stability-fix')) return html; // Already injected

    const stabilityScript = `
<style>
/* === NextSlide Image Stability Fix === */
img {
  visibility: hidden;
}
img.ns-img-ready {
  visibility: visible;
}
</style>
<script>
(function() {
  if (window.__nsImageStabilityInstalled) return;
  window.__nsImageStabilityInstalled = true;

  function reveal(img) {
    if (!img || img.classList.contains('ns-img-ready')) return;
    img.classList.add('ns-img-ready');
  }

  var isMobile = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);

  function handleImage(img) {
    if (!img) return;
    if (img.complete && img.naturalWidth > 0) {
      reveal(img);
      return;
    }
    // On mobile: skip img.decode() — it forces parallel GPU bitmap creation
    // which causes OOM crashes. Use simple load/error events instead.
    if (!isMobile && img.decode) {
      img.decode().then(function() { reveal(img); }).catch(function() { reveal(img); });
    } else {
      img.addEventListener('load', function() { reveal(img); }, { once: true });
      img.addEventListener('error', function() { reveal(img); }, { once: true });
    }
  }

  function scan() {
    var images = document.querySelectorAll('img');
    images.forEach(handleImage);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  // Watch for dynamically inserted images
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      m.addedNodes && m.addedNodes.forEach(function(node) {
        if (!node) return;
        if (node.tagName && node.tagName.toLowerCase() === 'img') {
          handleImage(node);
          return;
        }
        if (node.querySelectorAll) {
          node.querySelectorAll('img').forEach(handleImage);
        }
      });
    });
  });
  observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
})();
</script>
<!-- ns-image-stability-fix -->`;

    if (html.includes('</head>')) {
      return html.replace('</head>', stabilityScript + '\n</head>');
    } else if (html.includes('<body')) {
      return html.replace('<body', stabilityScript + '\n<body');
    } else if (html.includes('</body>')) {
      return html.replace('</body>', stabilityScript + '\n</body>');
    } else if (html.includes('</html>')) {
      return html.replace('</html>', stabilityScript + '\n</html>');
    }
    return html + stabilityScript;
  };

  /**
   * Throttle image loading on mobile to prevent OOM crashes.
   *
   * `loading="lazy"` alone doesn't help because all images are "above the fold"
   * in a fullscreen slide iframe. Instead we:
   * 1. Move every `src` to `data-src` and set a transparent placeholder
   * 2. Inject a script that loads images 2 at a time via an async queue
   * 3. Add `decoding="async"` so decode doesn't block the main thread
   *
   * Called only on mobile view-only mode.
   */
  const injectMobileImageOptimizations = (html: string): string => {
    if (!html) return html;

    // Swap real src → data-src, insert tiny transparent placeholder
    const PLACEHOLDER_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    let result = html.replace(
      /<img\b([^>]*?)src=["'](https?:\/\/[^"']+)["']([^>]*?)>/gi,
      (match, before, realSrc, after) => {
        // Skip if already has data-src (shouldn't happen, but guard)
        if ((before + after).includes('data-src')) return match;
        return `<img ${before}src="${PLACEHOLDER_SRC}" data-src="${realSrc}" decoding="async"${after}>`;
      }
    );

    // Inject throttled loader script
    const loaderScript = `
<script>
(function() {
  if (window.__nsMobileImgLoader) return;
  window.__nsMobileImgLoader = true;

  var MAX_CONCURRENT = 2;
  var active = 0;
  var queue = [];

  function loadNext() {
    while (active < MAX_CONCURRENT && queue.length > 0) {
      var img = queue.shift();
      if (!img || !img.dataset.src) continue;
      active++;
      var src = img.dataset.src;
      img.src = src;
      img.removeAttribute('data-src');
      var done = function() { active--; loadNext(); };
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }
  }

  function enqueueAll() {
    var imgs = document.querySelectorAll('img[data-src]');
    for (var i = 0; i < imgs.length; i++) {
      if (queue.indexOf(imgs[i]) === -1) queue.push(imgs[i]);
    }
    loadNext();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enqueueAll);
  } else {
    enqueueAll();
  }
  /* Catch dynamically inserted images */
  var obs = new MutationObserver(function() { enqueueAll(); });
  obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
})();
</script>`;

    // Inject before </body> or at end
    if (result.includes('</body>')) {
      result = result.replace('</body>', loaderScript + '\n</body>');
    } else if (result.includes('</html>')) {
      result = result.replace('</html>', loaderScript + '\n</html>');
    } else {
      result += loaderScript;
    }

    return result;
  };

  // Inject image props into HTML by replacing placeholder src attributes
  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const injectImageProps = (html: string, props: Record<string, any>): string => {
    if (!html || !props) return html;

    let result = html;

    // Build a list of image URLs from props (for index-based matching)
    const imageUrls: string[] = [];
    const imagePropKeys: string[] = [];
    const imagePropsMap: Record<string, string> = {};

    // Collect all image props (both numbered like Image1 and named like heroImage)
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === 'string' && value.startsWith('http')) {
        imagePropsMap[key.toLowerCase()] = value;
        // Check if this is a numbered image prop (Image1, image2, etc.)
        if (/^image\d+$/i.test(key)) {
          const index = parseInt(key.replace(/image/i, ''), 10) - 1;
          imageUrls[index] = value;
          imagePropKeys[index] = key;
        }
      }
    }

    DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] Image props available:', Object.keys(imagePropsMap));

    // PATTERN 1: Find all img tags with ${propName} in src (AI-generated pattern)
    // Example: <img src="${storeClosingSignImage}" alt="Store closing sign">
    const varSrcRegex = /<img\s+([^>]*?)src=["']\$\{+\s*(\w+)\s*\}+["']([^>]*?)>/gi;

    result = result.replace(varSrcRegex, (match, before, varName, after) => {
      const varNameLower = varName.toLowerCase();
      const hasDataProp = /data-prop=["'][^"']+["']/i.test(before + after);
      const dataPropAttr = hasDataProp ? '' : ` data-prop="${varName}"`;

      // Check multiple variations of the prop name
      const possibleNames = [
        varName,
        varName + 'Image',
        varName.replace(/Image$/i, ''),
        varNameLower,
        varNameLower + 'image',
        varNameLower.replace(/image$/i, ''),
      ];

      for (const name of possibleNames) {
        if (imagePropsMap[name.toLowerCase()]) {
          const newSrc = imagePropsMap[name.toLowerCase()];
          DEBUG_CUSTOM_COMPONENT && console.log(`[CustomComponent] Injecting image from \${${varName}}: ${name} = ${newSrc.substring(0, 50)}...`);
          return `<img ${before}src="${newSrc}"${after}${dataPropAttr}>`;
        }
      }

      return match;
    });

    // PATTERN 2: Find all img tags with placeholder src and replace with prop values
    // Also handles empty src or src without http
    let imageIndex = 0;
    const imgRegex = /<img\s+([^>]*?)src=["']([^"']*)["']([^>]*?)>/gi;

    result = result.replace(imgRegex, (match, before, src, after) => {
      // Skip if already has a valid URL
      if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('//')) {
        imageIndex++;
        return match;
      }

      // This is a placeholder - try to find a matching prop
      const altMatch = (before + after).match(/alt=["']([^"']+)["']/i);
      const dataPropMatch = (before + after).match(/data-prop=["']([^"']+)["']/i);

      let propValue: string | null = null;
      let matchedPropKey = '';
      let matchedBy = '';

      // 1. Try data-prop attribute first
      if (dataPropMatch?.[1] && imagePropsMap[dataPropMatch[1].toLowerCase()]) {
        const key = dataPropMatch[1];
        propValue = imagePropsMap[key.toLowerCase()];
        matchedPropKey = key;
        matchedBy = 'data-prop';
      }

      // 2. Try alt text converted to prop name
      if (!propValue && altMatch) {
        const alt = altMatch[1];
        const altPropName = alt
          .replace(/[^a-zA-Z0-9]/g, ' ')
          .split(' ')
          .filter(Boolean)
          .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join('');

        // Try with and without 'Image' suffix
        const variations = [altPropName, altPropName + 'image', altPropName.replace(/image$/i, '')];
        for (const name of variations) {
          if (imagePropsMap[name.toLowerCase()]) {
            propValue = imagePropsMap[name.toLowerCase()];
            matchedPropKey = name;
            matchedBy = 'alt-text';
            break;
          }
        }
      }

      // 3. Fall back to index-based matching (Image1, Image2, etc.)
      if (!propValue && imageUrls[imageIndex]) {
        propValue = imageUrls[imageIndex];
        matchedPropKey = imagePropKeys[imageIndex] || `image${imageIndex + 1}`;
        matchedBy = 'index';
      }

      imageIndex++;

      if (propValue) {
        const hasDataProp = /data-prop=["'][^"']+["']/i.test(before + after);
        const dataPropAttr = hasDataProp || !matchedPropKey ? '' : ` data-prop="${matchedPropKey}"`;
        DEBUG_CUSTOM_COMPONENT && console.log(`[CustomComponent] Injecting image (${matchedBy}): ${propValue.substring(0, 50)}...`);
        return `<img ${before}src="${propValue}"${after}${dataPropAttr}>`;
      }

      return match;
    });

    // PATTERN 3: Also inject props into JavaScript variable declarations
    // const varName = props.propName || 'placeholder' -> inject actual URL
    for (const [propName, propValue] of Object.entries(props)) {
      if (typeof propValue === 'string' && propValue.startsWith('http')) {
        // Replace occurrences in JS where the prop is referenced
        // Pattern: props.propName || 'placeholder' or props?.propName ?? 'placeholder'
        const jsPattern = new RegExp(
          `(props\\??\\.${escapeRegExp(propName)}\\s*(?:\\|\\||\\?\\?)\\s*)['"\`]placeholder['"\`]`,
          'gi'
        );
        result = result.replace(jsPattern, `$1'${propValue}'`);

        // Also replace: const varName = 'placeholder' style declarations
        // if the varName matches the propName (common in AI-generated code)
        const constPattern = new RegExp(
          `(const\\s+${escapeRegExp(propName)}\\s*=\\s*)['"\`]placeholder['"\`]`,
          'gi'
        );
        result = result.replace(constPattern, `$1'${propValue}'`);
      }
    }

    // PATTERN 4: Replace JS variable assignments that reference props
    // const image1 = props.Image1 || 'placeholder' where Image1 has a URL
    for (const [propName, propValue] of Object.entries(props)) {
      if (typeof propValue === 'string' && propValue.startsWith('http')) {
        // Handle case-insensitive prop matching
        const propNamePattern = new RegExp(
          `(const\\s+\\w+\\s*=\\s*props\\.${escapeRegExp(propName)}\\s*\\|\\|\\s*)['"\`][^'"\`]*['"\`]`,
          'gi'
        );
        result = result.replace(propNamePattern, `$1'${propValue}'`);
      }
    }

    // PATTERN 5: Runtime safeguard — if an image URL is rendered as plain text
    // (common with AI-generated icon slots), replace it with an <img> element.
    const isImageLikeUrl = (value: string): boolean => {
      if (typeof value !== 'string') return false;
      if (value.startsWith('data:image/')) return true;
      if (!/^https?:\/\//i.test(value)) return false;
      if (/\.(png|jpe?g|gif|webp|svg|avif)(?:[?#]|$)/i.test(value)) return true;
      return /\/storage\/v1\/object\/public\//i.test(value);
    };

    const imageLikeUrlsFromProps = Object.values(imagePropsMap).filter((value): value is string => isImageLikeUrl(value));
    const imageLikeUrlsFromHtml = (result.match(/https?:\/\/[^\s"'<>]+/gi) || []).filter(isImageLikeUrl);
    const candidateImageUrls = Array.from(new Set([
      ...imageLikeUrlsFromProps,
      ...imageLikeUrlsFromHtml,
    ]));

    if (candidateImageUrls.length > 0) {
      const existingFixScriptRegex = /<script[^>]*id=["']ns-image-url-text-fix["'][^>]*>[\s\S]*?<\/script>/gi;
      result = result.replace(existingFixScriptRegex, '');

      const safeUrlsJson = JSON.stringify(candidateImageUrls).replace(/<\/script/gi, '<\\/script');
      const urlTextFixScript = `
<script id="ns-image-url-text-fix">
(function() {
  try {
    var urls = ${safeUrlsJson};
    if (!Array.isArray(urls) || urls.length === 0) return;
    var urlSet = Object.create(null);
    for (var i = 0; i < urls.length; i++) {
      urlSet[urls[i]] = true;
    }

    function replaceIfImageUrlText(node) {
      if (!node || !node.tagName) return false;
      var tag = String(node.tagName || '').toLowerCase();
      if (!tag || tag === 'script' || tag === 'style' || tag === 'img') return false;
      if (node.childElementCount > 0) return false;

      var text = (node.textContent || '').trim();
      if (!text || !urlSet[text]) return false;

      var img = document.createElement('img');
      img.src = text;
      img.alt = '';
      img.setAttribute('data-ns-url-fix', 'true');
      img.style.display = 'block';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      img.style.objectFit = 'contain';

      node.textContent = '';
      node.appendChild(img);
      return true;
    }

    function scan(root) {
      var container = (root && root.querySelectorAll) ? root : document;
      replaceIfImageUrlText(container);
      var nodes = container.querySelectorAll ? container.querySelectorAll('*') : [];
      for (var i = 0; i < nodes.length; i++) {
        replaceIfImageUrlText(nodes[i]);
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() { scan(document); }, { once: true });
    } else {
      scan(document);
    }

    var observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];
        if (mutation.type !== 'childList' || !mutation.addedNodes) continue;
        for (var j = 0; j < mutation.addedNodes.length; j++) {
          var node = mutation.addedNodes[j];
          if (!node) continue;
          if (node.nodeType === 1) {
            scan(node);
          } else if (node.nodeType === 3 && node.parentElement) {
            replaceIfImageUrlText(node.parentElement);
          }
        }
      }
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
  } catch (err) {
    console.warn('[CustomComponent] URL text image fix failed:', err);
  }
})();
</script>`;

      if (result.includes('</body>')) {
        result = result.replace('</body>', `${urlTextFixScript}\n</body>`);
      } else if (result.includes('</html>')) {
        result = result.replace('</html>', `${urlTextFixScript}\n</html>`);
      } else {
        result += urlTextFixScript;
      }
    }

    return result;
  };

  // Inject <link rel="preload"> tags into the <head> for every image URL
  // found in the HTML. This lets the browser start downloading images
  // that are initially hidden (e.g. behind tabs / JS state changes) so
  // they're already cached when the user clicks a tab.
  const injectImagePreloadLinks = (html: string): string => {
    if (!html) return html;

    const urls = new Set<string>();

    // Collect image URLs from src attributes
    const srcRegex = /src=["'](https?:\/\/[^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = srcRegex.exec(html)) !== null) {
      urls.add(m[1]);
    }

    // Collect image URLs from CSS background-image
    const bgRegex = /url\(["']?(https?:\/\/[^"')]+)["']?\)/gi;
    while ((m = bgRegex.exec(html)) !== null) {
      urls.add(m[1]);
    }

    // Collect image URLs from JS string literals (data arrays, variable assignments)
    const jsUrlRegex = /["'](https?:\/\/[^"']{20,}\.(?:jpg|jpeg|png|gif|webp|svg|avif)[^"']*)["']/gi;
    while ((m = jsUrlRegex.exec(html)) !== null) {
      urls.add(m[1]);
    }

    // Also catch CDN URLs without file extensions (supabase, pexels, unsplash)
    const cdnUrlRegex = /["'](https?:\/\/(?:[^"']*(?:supabase|nextslide|pexels|unsplash|images\.)[^"']*))["']/gi;
    while ((m = cdnUrlRegex.exec(html)) !== null) {
      urls.add(m[1]);
    }

    if (urls.size === 0) return html;

    // Build preload link tags
    const preloadTags = Array.from(urls)
      .filter(url => !url.includes('placeholder') && !url.includes('tailwindcss') && !url.includes('.js'))
      .map(url => `<link rel="preload" as="image" href="${url}">`)
      .join('\n');

    if (!preloadTags) return html;

    // Insert before </head> if present, otherwise before <body>
    if (html.includes('</head>')) {
      return html.replace('</head>', `${preloadTags}\n</head>`);
    }
    if (html.includes('<body')) {
      return html.replace(/<body/i, `${preloadTags}\n<body`);
    }

    // Fallback: prepend
    return preloadTags + '\n' + html;
  };

  // Create a stable string key from props for proper dependency tracking
  // This ensures useMemo detects when nested props change (e.g., image URLs from backend)
  const propsKey = useMemo(() => {
    try {
      // Stringify all nested props to detect any changes
      return JSON.stringify(component.props.props || {});
    } catch {
      // Fallback to object keys if circular reference
      return Object.keys(component.props.props || {}).join(',');
    }
  }, [component.props.props]);

  // Memoize srcDoc with injected props and click handlers
  const stableIframeSrcDoc = useMemo(() => {
    if (!iframeSrcDoc) return null;

    // CLEANUP: Strip duplicate injected scripts from HTML (can happen from backend accumulation)
    let cleanHtml = iframeSrcDoc;
    // Remove all instances of our injected scripts/markers so we can re-inject cleanly
    cleanHtml = cleanHtml.replace(/<!-- NEXTSLIDE EDIT MODE V2 -->/g, '');
    cleanHtml = cleanHtml.replace(/<!-- ns-interactivity-fix -->/g, '');
    // Remove duplicate processing overlay styles/scripts (keep checking until no more found)
    const processingOverlayRegex = /<style>\s*\.ns-image-processing-overlay[\s\S]*?<\/script>/g;
    const matches = cleanHtml.match(processingOverlayRegex);
    if (matches && matches.length > 1) {
      // Keep only the first occurrence, remove the rest
      let firstRemoved = false;
      cleanHtml = cleanHtml.replace(processingOverlayRegex, (match) => {
        if (!firstRemoved) {
          firstRemoved = true;
          return ''; // Remove the first one too, we'll re-inject fresh
        }
        return '';
      });
    } else if (matches) {
      // Remove the single occurrence so we re-inject fresh
      cleanHtml = cleanHtml.replace(processingOverlayRegex, '');
    }
    // Remove duplicate placeholder scripts
    const placeholderRegex = /<style>\s*\.ns-placeholder-wrapper[\s\S]*?<!-- NEXTSLIDE EDIT MODE V2 -->/g;
    cleanHtml = cleanHtml.replace(placeholderRegex, '');

    // Strip Tailwind CDN script (render-blocking, never needed, breaks thumbnails)
    cleanHtml = cleanHtml.replace(
      /<script[^>]*src=["'][^"']*tailwindcss[^"']*["'][^>]*>\s*<\/script>/gi,
      ''
    );

    // First inject image props from component.props.props (the nested props object)
    // componentProps already spreads these, but we need the actual image URLs
    const imageProps = component.props.props || {};
    DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] Injecting props into HTML:', {
      keys: Object.keys(imageProps),
      values: Object.fromEntries(
        Object.entries(imageProps)
          .filter(([k]) => k.toLowerCase().includes('image'))
          .map(([k, v]) => [k, typeof v === 'string' ? v.substring(0, 60) + '...' : v])
      ),
      hasPlaceholders: cleanHtml.includes('${'),
      propsKey: propsKey.substring(0, 100)
    });
    let html = injectImageProps(cleanHtml, imageProps);

    const extraFonts = extractFontFamiliesFromHtml(html);
    html = injectIframeFonts(html, {
      bodyFont: resolvedFonts.bodyFont,
      heroFont: resolvedFonts.heroFont,
      extraFonts
    });

    // Mobile view-only: skip edit-only scripts and preloading to prevent OOM crashes
    const isMobileViewOnly = BROWSER.isMobile && !isEditing;

    // Add click handlers for edit mode (skip on all mobile, not just iOS)
    if (!BROWSER.isMobile) {
      html = injectImageClickHandlers(html, component.id);
    }

    // Zoom relay — not needed on mobile view-only (presentation handles gestures)
    if (!isMobileViewOnly) {
      html = injectZoomRelay(html, component.id);
    }

    // Image stability (hide-then-reveal) — always needed, but uses load events on mobile
    html = injectImageStabilityFixes(html);

    // Interactivity fixes — skip on mobile view-only (edit-mode pointer-events fix)
    if (!isMobileViewOnly) {
      html = injectInteractivityFixes(html);
    }

    // Inject element-level edit mode when in edit mode (not just when selected)
    // This allows hover effects and double-click to work before selection
    // NOTE: Skip on iOS due to postMessage crash issues
    if (effectiveIsEditMode && !BROWSER.isIOS) {
      DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] INJECTING edit mode script:', {
        componentId: component.id.slice(0, 8),
        isSelected,
        htmlLength: html.length
      });
      html = injectEditMode(html, component.id);
    }

    // Image preloading — skip on mobile view-only (primary crash fix: prevents
    // simultaneous high-res downloads that cause OOM)
    if (!isMobileViewOnly) {
      html = injectImagePreloadLinks(html);
    }

    // Mobile view-only: add lazy loading and async decoding to all images
    if (isMobileViewOnly) {
      html = injectMobileImageOptimizations(html);
    }

    // Mobile presentation: inject CSS zoom to preserve 1920×1080 layout in smaller iframe.
    // PresentationMode reduces slideSize by 0.5× on mobile, so the iframe renders at half
    // resolution (saving ~75% bitmap memory). The zoom makes the content lay out at the
    // original 1920×1080 equivalent, keeping fixed-pixel fonts and positions correct.
    if (BROWSER.isMobile && isPresenting) {
      const zoomScale = 0.5; // Must match PresentationMode.MOBILE_RENDER_SCALE
      const sizeMultiplier = Math.round(100 / zoomScale); // 200%
      const zoomStyle = `<style>/* ns-mobile-zoom */ html { zoom: ${zoomScale} !important; width: ${sizeMultiplier}% !important; height: ${sizeMultiplier}% !important; }</style>`;
      if (html.includes('</head>')) {
        html = html.replace('</head>', zoomStyle + '\n</head>');
      } else if (html.includes('<body')) {
        html = html.replace('<body', zoomStyle + '\n<body');
      } else {
        html = zoomStyle + '\n' + html;
      }
    }

    // Inject image processing overlay handler script (edit-mode only)
    if (isMobileViewOnly) return html;
    const processingOverlayScript = `
<style>
  .ns-image-processing-overlay {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    background: rgba(0, 0, 0, 0.6) !important;
    backdrop-filter: blur(2px) !important;
    z-index: 9999 !important;
    pointer-events: none !important;
  }
  .ns-image-processing-spinner {
    width: 24px !important;
    height: 24px !important;
    border: 3px solid rgba(255, 255, 255, 0.3) !important;
    border-top-color: #FF4301 !important;
    border-radius: 50% !important;
    animation: ns-spin 1s linear infinite !important;
  }
  .ns-image-processing-text {
    margin-top: 8px !important;
    color: white !important;
    font-size: 11px !important;
    font-weight: 500 !important;
    text-shadow: 0 1px 2px rgba(0,0,0,0.5) !important;
  }
  @keyframes ns-spin {
    to { transform: rotate(360deg); }
  }
</style>
<script>
(function() {
  window.addEventListener('message', function(event) {
    if (event.data?.type === 'image-processing') {
      var propName = event.data.propName;
      var isProcessing = event.data.isProcessing;

      // Find all images (including background images) and match by prop/id/alt
      var targets = document.querySelectorAll('img, [data-ns-id][style*="background-image"]');
      targets.forEach(function(el) {
        var isImg = el.tagName && el.tagName.toLowerCase() === 'img';
        var imgWrapper = isImg ? el.parentElement : el;
        // Check if this image's prop name matches (via data attribute or alt text)
        var imgPropName = el.getAttribute('data-prop') ||
                          el.getAttribute('data-ns-id') ||
                          el.id ||
                          el.getAttribute('alt') ||
                          '';
        var normalizedProp = (propName || '').toLowerCase().replace(/\\s+/g, '');
        var normalizedImg = (imgPropName || '').toLowerCase().replace(/\\s+/g, '');
        var matches = normalizedProp &&
                      (normalizedImg.includes(normalizedProp) || normalizedProp.includes(normalizedImg));

        if (matches || targets.length === 1) {
          // Ensure wrapper has position relative for overlay positioning
          if (imgWrapper && imgWrapper.tagName !== 'BODY') {
            var wrapperStyle = window.getComputedStyle(imgWrapper);
            if (wrapperStyle.position === 'static') {
              imgWrapper.style.position = 'relative';
            }

            // Find or create overlay
            var overlayId = 'ns-processing-overlay-' + (el.getAttribute('data-ns-id') || el.id || Math.random().toString(36).substr(2, 9));
            var existingOverlay = document.getElementById(overlayId);

            if (isProcessing && !existingOverlay) {
              var overlay = document.createElement('div');
              overlay.id = overlayId;
              overlay.className = 'ns-image-processing-overlay';
              overlay.innerHTML = '<div class="ns-image-processing-spinner"></div><span class="ns-image-processing-text">Processing...</span>';
              imgWrapper.appendChild(overlay);
            } else if (!isProcessing && existingOverlay) {
              existingOverlay.remove();
            }
          }
        }
      });
    }
  });
})();
</script>`;

    // DEDUPLICATION: Only inject processing overlay if not already present
    if (!html.includes('ns-image-processing-overlay')) {
      if (html.includes('</head>')) {
        html = html.replace('</head>', processingOverlayScript + '</head>');
      } else if (html.includes('<body')) {
        html = html.replace('<body', processingOverlayScript + '<body');
      } else {
        html = processingOverlayScript + html;
      }
    }

    return html;
  }, [iframeSrcDoc, component.id, isEditing, isThumbnail, propsKey, effectiveIsEditMode, isSelected, resolvedFonts.bodyFont, resolvedFonts.heroFont]); // fontCatalogVersion removed - fonts are loaded globally and don't need to invalidate iframe srcDoc

  const baseIframeKey = useMemo(() => {
    return `${component.id}-${renderCodeHash}-${propsKey.length}-${propsKey.slice(-20)}-${resolvedFonts.bodyFont || ''}-${resolvedFonts.heroFont || ''}`;
  }, [component.id, renderCodeHash, propsKey, resolvedFonts.bodyFont, resolvedFonts.heroFont]);

  const isEditingSelection = effectiveIsEditMode && isSelected && isIframeComponent;
  const [pinnedIframe, setPinnedIframe] = useState<{ srcDoc: string | null; key: string } | null>(null);

  useEffect(() => {
    if (!isEditingSelection) {
      setPinnedIframe(null);
      return;
    }
    if (!stableIframeSrcDoc) return;

    // Pin the current srcDoc/key while editing to avoid iframe reload flashes on drag/drop.
    setPinnedIframe(prev => prev ?? { srcDoc: stableIframeSrcDoc, key: baseIframeKey });
  }, [isEditingSelection, stableIframeSrcDoc, baseIframeKey]);

  const iframeKey = pinnedIframe?.key || baseIframeKey;
  const iframeSrcDocToUse = pinnedIframe?.srcDoc || stableIframeSrcDoc;

  // Listen for messages from iframe (placeholder image clicks and edit mode)
  // NOTE: Disabled on iOS due to postMessage crash issues
  useEffect(() => {
    if (!isIframeComponent || !isEditing || BROWSER.isIOS) return;

    const handleMessage = (event: MessageEvent) => {
      // Handle placeholder image clicks (legacy)
      if (event.data?.type === 'customcomponent:image-click' && event.data?.componentId === component.id) {
        DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] Placeholder image clicked:', event.data);

        // Use propName from the iframe message (which was inferred from alt text)
        const propName = event.data.propName || event.data.imageAlt || event.data.imageId || 'image';

        // Convert propName to search query: "elonMuskImage" -> "elon musk"
        const searchQuery = propName
          .replace(/Image$|Img$|Photo$|Picture$/i, '')
          .replace(/([A-Z])/g, ' $1')
          .trim()
          .toLowerCase() || event.data.imageAlt || 'image';

        // Dispatch event to open ImagePicker
        window.dispatchEvent(new CustomEvent('image:select-placeholder', {
          detail: {
            componentId: component.id,
            slideId: component.slideId,
            propName: propName,
            searchQuery: searchQuery,
            topic: searchQuery,
            isCustomComponentProp: true,
            imageIndex: event.data.imageIndex,
          }
        }));
      }

      // Handle element-level edit mode messages
      if (event.data?.source === 'ns-custom-component-edit' && event.data?.componentId === component.id) {
        DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] Edit mode message:', event.data.type, event.data);

        if (event.data.type === 'element-selected') {
          setSelectedElement(event.data.element);
          setShowAiChatBubble(false); // Reset chat bubble
          setAiChatMessage('');

          // For images, dispatch the placeholder image picker event
          if (event.data.element.type === 'image') {
            const imgSrc = event.data.element.src || '';
            const imgAlt = event.data.element.alt || 'image';

            // Dispatch existing image picker event
            window.dispatchEvent(new CustomEvent('image:select-placeholder', {
              detail: {
                componentId: component.id,
                slideId: component.slideId,
                propName: event.data.element.id || 'customImage',
                searchQuery: imgAlt,
                topic: imgAlt,
                isCustomComponentImage: true,
                elementId: event.data.element.id,
              }
            }));
          }
          setShowImageToolbar(false);
        }

        if (event.data.type === 'image-clicked' || event.data.type === 'image-selected') {
          setSelectedElement(event.data.element);
          setShowImageToolbar(true);
          // Capture cursor position from the event if available, otherwise use element center
          if (event.data.cursorX !== undefined && event.data.cursorY !== undefined) {
            const iframeRect = iframeRef.current?.getBoundingClientRect();
            setCursorPosition({
              x: (iframeRect?.left || 0) + event.data.cursorX,
              y: (iframeRect?.top || 0) + event.data.cursorY
            });
          } else {
            // Fallback: position at right edge of element
            const iframeRect = iframeRef.current?.getBoundingClientRect();
            const el = event.data.element;
            setCursorPosition({
              x: (iframeRect?.left || 0) + el.bounds.x + el.bounds.width,
              y: (iframeRect?.top || 0) + el.bounds.y + el.bounds.height / 2
            });
          }
          // Also open image picker for quick replacement
          const imgAlt = event.data.element.alt || 'image';
          window.dispatchEvent(new CustomEvent('image:select-placeholder', {
            detail: {
              componentId: component.id,
              slideId: component.slideId,
              propName: event.data.element.id || 'customImage',
              searchQuery: imgAlt,
              topic: imgAlt,
              isCustomComponentImage: true,
              elementId: event.data.element.id,
              autoDismiss: true,
            }
          }));
        }

        if (event.data.type === 'container-selected') {
          setSelectedElement(event.data.element);
          setShowAiChatBubble(false);
          setAiChatMessage('');
        }

        if (event.data.type === 'element-deselected') {
          setSelectedElement(null);
          setShowImageToolbar(false);
          setShowAiChatBubble(false);
          setAiChatMessage('');
        }

        if (event.data.type === 'text-changed') {
          // Text was edited in iframe - update the component HTML
          const { oldText, newText } = event.data;
          if (oldText && newText && stableIframeSrcDoc) {
            const escapedOld = oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(escapedOld, 'g');
            const updatedHtml = stableIframeSrcDoc.replace(pattern, newText);

            if (updatedHtml !== stableIframeSrcDoc) {
              // Update only the render prop (delta update to avoid overwriting concurrent changes)
              updateComponent(component.id, {
                props: {
                  render: updatedHtml
                }
              });
              DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] Updated HTML with new text');

              // CRITICAL: Immediately persist changes to backend
              // Debounce to avoid too many saves during rapid typing
              setTimeout(() => {
                try {
                  useEditorStore.getState().applyDraftChanges();
                  DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] Persisted text changes to backend');
                } catch (e) {
                  console.error('[CustomComponent] Failed to persist text changes:', e);
                }
              }, 500);
            }
          }
        }

        if (event.data.type === 'edit-mode-ready') {
          DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] Edit mode ready in iframe');
        }

        // Handle image update - update the HTML with the new image URL
        if (event.data.type === 'image-updated' || event.data.type === 'image-loaded') {
          const { elementId, newSrc } = event.data;
          if (elementId && newSrc && stableIframeSrcDoc) {
            // Find the element's old src in the HTML and replace it
            // First, try to find an img tag with this data-ns-id
            const imgPattern = new RegExp(
              `(<[^>]*data-ns-id=["']${elementId}["'][^>]*(?:src=["']))([^"']+)(["'])`,
              'gi'
            );
            let updatedHtml = stableIframeSrcDoc.replace(imgPattern, `$1${newSrc}$3`);

            // If no match with data-ns-id, try matching by the old src directly
            if (updatedHtml === stableIframeSrcDoc && selectedElement?.src) {
              const oldSrc = selectedElement.src;
              if (oldSrc && oldSrc !== newSrc && stableIframeSrcDoc.includes(oldSrc)) {
                updatedHtml = stableIframeSrcDoc.replace(oldSrc, newSrc);
              }
            }

            if (updatedHtml !== stableIframeSrcDoc) {
              // Strip injected scripts before saving
              const cleanHtml = stripInjectedScripts(updatedHtml);

              // Delta update to avoid overwriting concurrent changes
              updateComponent(component.id, {
                props: {
                  render: cleanHtml
                }
              });
              DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] Updated HTML with new image');

              // Persist changes to backend
              setTimeout(() => {
                try {
                  useEditorStore.getState().applyDraftChanges();
                  DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] Persisted image changes to backend');
                } catch (e) {
                  console.error('[CustomComponent] Failed to persist image changes:', e);
                }
              }, 300);
            }
          }
        }

        if (event.data.type === 'component-clicked') {
          // Dispatch a custom event that ComponentRenderer can catch for selection
          const clickEvent = new CustomEvent('customcomponent:request-select', {
            bubbles: true,
            detail: { componentId: component.id }
          });
          containerRef.current?.dispatchEvent(clickEvent);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isIframeComponent, isEditing, component.id, component.slideId, stableIframeSrcDoc, updateComponent, selectedElement]);

  // Render the component content (non-iframe path)
  const content = useMemo(() => {
    // If this is an iframe component, we render it separately (outside useMemo) to prevent flashing
    if (isIframeComponent) {
      return null; // Iframe is rendered separately below
    }

    // Show error only if we have no prior compiled function
    if (compilationError && !compiledRenderRef.current) {
      return (
        <div style={{
          padding: '10px',
          color: '#d32f2f',
          backgroundColor: '#ffebee',
          border: '1px solid #ffcdd2',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'monospace'
        }}>
          <div style={{ fontWeight: 'bold' }}>Error</div>
          <div style={{ marginTop: '5px' }}>{compilationError.message}</div>
        </div>
      );
    }

    // Prefer fresh compiled render; fall back to last good render to avoid flash
    const activeRender = compiledRender ?? compiledRenderRef.current;
    if (!activeRender || typeof activeRender !== 'function') return null;

    try {
      const element = activeRender({
        props: componentProps,
        state,
        updateState,
        id: component.id,
        isThumbnail,
        isEditing: effectiveIsEditMode,
        containerWidth,
        containerHeight
      });

      // Handle HTML string returns (from functions that return HTML)
      if (typeof element === 'string' && element.trim().startsWith('<') && element.includes('>')) {
        return (
          <div
            style={{ width: '100%', height: '100%' }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(element) }}
          />
        );
      }

      // Validate the result. Allow React elements, arrays, strings, null.
      if (
        React.isValidElement(element) ||
        element === null ||
        Array.isArray(element) ||
        typeof element === 'string'
      ) {
        return element as any;
      }

      // Check if it's a DOM element
      if (element instanceof HTMLElement) {
        const htmlString = element.outerHTML;
        return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlString) }} />;
      }

      DEBUG_CUSTOM_COMPONENT && console.warn('[CustomComponent] Invalid element returned:', element);
      return <div>{String(element)}</div>;
    } catch (err) {
      console.error('[CustomComponent] Runtime error:', err);

      let errorMessage = err instanceof Error ? err.message : String(err);

      if (err instanceof ReferenceError) {
        const match = errorMessage.match(/(\w+) is not defined/);
        if (match) {
          const varName = match[1];
          errorMessage = `Variable '${varName}' is not defined. Add: const ${varName} = props.${varName} || defaultValue;`;
        }
      }

      return (
        <div style={{
          padding: '10px',
          color: '#d32f2f',
          backgroundColor: '#ffebee',
          border: '1px solid #ffcdd2',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'monospace'
        }}>
          <div style={{ fontWeight: 'bold' }}>Runtime Error</div>
          <div style={{ marginTop: '5px' }}>{errorMessage}</div>
        </div>
      );
    }
  }, [compilationError, compiledRender, isIframeComponent, componentProps, state, updateState, component.id, isThumbnail, effectiveIsEditMode, containerWidth, containerHeight]);

  // Scaling Logic
  // NOTE: For thumbnails, MiniSlide already handles scaling - don't double-scale
  // NOTE: ResizeObserver can crash on iOS Safari, use fallback there
  const [scale, setScale] = useState(1);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Skip scaling for thumbnails - MiniSlide already scales the entire slide
    if (isThumbnail) {
      setScale(1);
      return;
    }

    const element = rootRef.current;
    if (!element) return;

    // On iOS, just calculate scale once and skip ResizeObserver
    if (BROWSER.isIOS) {
      try {
        // CRITICAL FIX: Use offsetWidth instead of getBoundingClientRect().width
        // getBoundingClientRect returns the size AFTER CSS transforms are applied,
        // which causes double-scaling when PresentationMode already applies transform: scale()
        // offsetWidth returns the layout size BEFORE transforms
        const width = element.offsetWidth;
        if (effectiveContentWidth > 0 && width > 0) {
          const newScale = width / effectiveContentWidth;
          // Avoid tiny scales that could result from measurement issues
          setScale(newScale < 0.1 ? 1 : newScale);
        }
      } catch (err) {
        // Ignore errors on iOS
      }
      return;
    }

    let observer: ResizeObserver | null = null;
    try {
      observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width } = entry.contentRect;
          // Calculate scale based on the ratio of displayed width to effective content width
          // During resize of iframe components, effectiveContentWidth is frozen to prevent
          // iframe viewport changes, so only the scale changes.
          if (effectiveContentWidth > 0) {
            const newScale = width / effectiveContentWidth;
            setScale(newScale);
          }
        }
      });
      observer.observe(element);
    } catch (err) {
      // ResizeObserver may crash, fallback to single calculation
      try {
        const width = element.getBoundingClientRect().width;
        if (effectiveContentWidth > 0 && width > 0) {
          setScale(width / effectiveContentWidth);
        }
      } catch (e) {
        // Ignore
      }
    }

    return () => {
      try {
        observer?.disconnect();
      } catch (err) {
        // Ignore disconnect errors
      }
    };
  }, [effectiveContentWidth, isThumbnail]);

  // Handler for HTML updates from CustomComponentEditOverlay
  const handleHtmlUpdate = useCallback((newHtml: string) => {
    if (!newHtml) return;

    DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] HTML update from overlay, length:', newHtml.length);

    // CRITICAL: Strip injected scripts before saving to prevent accumulation
    const cleanHtml = stripInjectedScripts(newHtml);
    DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] After stripping injected scripts, length:', cleanHtml.length);

    // Update only the render prop (delta update to avoid overwriting concurrent prop changes)
    updateComponent(component.id, {
      props: {
        render: cleanHtml
      }
    });

    // Persist changes
    setTimeout(() => {
      try {
        useEditorStore.getState().applyDraftChanges();
        DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] Persisted HTML changes to backend');
      } catch (e) {
        console.error('[CustomComponent] Failed to persist HTML changes:', e);
      }
    }, 300);
  }, [updateComponent, component.id]);

  // Handler for text editing inside custom component
  const handleTextEdit = useCallback((element: DetectedElement, newText: string) => {
    if (!stableIframeSrcDoc || !element.selector) return;

    DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] Text edit:', { selector: element.selector, newText });

    // Find and replace the text content in the HTML
    let updatedHtml = stableIframeSrcDoc;

    // Create a safe pattern to find the element
    const tagName = element.tagName.toLowerCase();
    const escapedContent = (element.content || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Try to find and replace based on content
    if (escapedContent) {
      // Pattern: find tag with this text content
      const pattern = new RegExp(`(<${tagName}[^>]*>)\\s*${escapedContent}\\s*(</${tagName}>)`, 'gi');
      if (pattern.test(updatedHtml)) {
        updatedHtml = updatedHtml.replace(pattern, `$1${newText}$2`);
      } else {
        // Fallback: just replace the text where it appears
        updatedHtml = updatedHtml.replace(new RegExp(escapedContent, 'g'), newText);
      }
    }

    if (updatedHtml !== stableIframeSrcDoc) {
      // CRITICAL: Strip injected scripts before saving to prevent accumulation
      const cleanHtml = stripInjectedScripts(updatedHtml);

      // Delta update to avoid overwriting concurrent changes
      updateComponent(component.id, {
        props: {
          render: cleanHtml
        }
      });
      DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] Updated HTML with new text (stripped injected scripts)');

      // CRITICAL: Immediately persist changes to backend
      setTimeout(() => {
        try {
          useEditorStore.getState().applyDraftChanges();
          DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] Persisted text edit to backend');
        } catch (e) {
          console.error('[CustomComponent] Failed to persist text edit:', e);
        }
      }, 500);
    }
  }, [stableIframeSrcDoc, updateComponent, component.id]);

  // Handler for image swap inside custom component
  const handleImageSwap = useCallback((element: DetectedElement, newImageUrl: string) => {
    // Use the stored render prop directly, NOT stableIframeSrcDoc (which is the full
    // iframe HTML with injected scripts/styles). Using the iframe HTML would corrupt
    // the component because stripInjectedScripts can't perfectly undo the injections.
    const currentHtml = (component.props.render as string) || '';
    if (!currentHtml || !element.src) return;

    const oldSrc = element.src;

    if (!currentHtml.includes(oldSrc)) {
      console.warn('[CustomComponent] HTML replacement failed - old URL not found in render HTML');
      return;
    }

    const updatedHtml = currentHtml.replace(oldSrc, newImageUrl);
    if (updatedHtml === currentHtml) return;

    // Update the iframe directly so user sees immediate feedback
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'update-image',
        elementId: element.id,
        newSrc: newImageUrl
      }, '*');
    }

    // Update only the render prop (clean source, no injected scripts to strip)
    updateComponent(component.id, {
      props: {
        render: updatedHtml
      }
    });

    // Persist changes to backend
    setTimeout(() => {
      try {
        useEditorStore.getState().applyDraftChanges();
      } catch (e) {
        console.error('[CustomComponent] Failed to persist image changes:', e);
      }
    }, 300);

    setSelectedElement(null);
    setShowImageToolbar(false);
  }, [component.props.render, updateComponent, component.id, iframeRef]);

  // ---- Image AI Edit / Fuse helpers (call API directly, no chat dispatch) ----
  const imageStylePrefs = (deckData?.data?.outline?.stylePreferences) || (deckData?.outline?.stylePreferences) || {};
  const inferImageDeckPurpose = (): 'artistic' | 'educational' | 'business' => {
    try {
      const text = ((deckData?.title || '') + ' ' + (imageStylePrefs?.initialIdea || '')).toLowerCase();
      if (/art|portfolio|creative|illustration|design showcase/.test(text)) return 'artistic';
      if (/school|class|lesson|course|education|tutorial|training|workshop/.test(text)) return 'educational';
      if (/business|sales|report|strategy|marketing|finance|pitch|q[1-4]|quarterly/.test(text)) return 'business';
    } catch {}
    return 'business';
  };

  const buildImageGuidedInstructions = (userInstructions: string) => {
    const purpose = inferImageDeckPurpose();
    const font = imageStylePrefs?.font ? `Primary font: ${imageStylePrefs.font}.` : '';
    const colors = imageStylePrefs?.colors ? `Use deck colors: background ${imageStylePrefs.colors.background || ''}, text ${imageStylePrefs.colors.text || ''}, accent ${imageStylePrefs.colors.accent1 || ''}.` : '';
    const vibe = imageStylePrefs?.vibeContext ? `Visual vibe: ${imageStylePrefs.vibeContext}.` : '';
    const accuracy = (purpose === 'educational' || purpose === 'business')
      ? 'Ensure visuals are factually accurate and appropriate. Avoid invented labels, fake logos, or misleading depictions.'
      : 'Focus on strong composition and clarity.';
    const styleTone = purpose === 'artistic'
      ? 'Make it artistically expressive with tasteful lighting and composition.'
      : purpose === 'educational'
      ? 'Make it clear, didactic, and easy to understand.'
      : 'Make it polished, professional, and presentation-ready.';
    const template = 'Adhere to the slide template feel so the result matches the deck\u2019s look-and-feel.';
    const transparency = imageTransparentBg ? 'If possible, produce a PNG with a transparent background.' : '';
    return [
      userInstructions?.trim() || '',
      styleTone, accuracy, vibe, colors, font, template, transparency,
      'Maintain subject identity consistency across this deck.'
    ].filter(Boolean).join(' ');
  };

  const computeImageSizeHint = () => {
    const w = Number(component.props.width) || 1024;
    const h = Number(component.props.height) || 576;
    const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
    return `${clamp(Math.round(w), 512, 1536)}x${clamp(Math.round(h), 512, 1536)}`;
  };

  const computeImageAspectRatio = (): string => {
    try {
      const w = Math.max(1, Math.round(Number(component.props.width) || 1024));
      const h = Math.max(1, Math.round(Number(component.props.height) || 576));
      const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
      const g = gcd(w, h) || 1;
      return `${Math.round(w / g)}:${Math.round(h / g)}`;
    } catch {
      return '16:9';
    }
  };

  const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const resolveImageParam = async (src: string): Promise<{ imageUrl?: string; imageBase64?: string }> => {
    const s = (src || '').trim();
    if (!s) return {};
    if (s.startsWith('data:')) return { imageBase64: s };
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) && !(s.startsWith('http://') || s.startsWith('https://') || s.startsWith('blob:') || s.startsWith('data:'))) return {};
    if (s.startsWith('blob:')) {
      try { const resp = await fetch(s); const blob = await resp.blob(); return { imageBase64: await blobToDataUrl(blob) }; } catch { return {}; }
    }
    if (s.startsWith('/')) {
      try { const abs = `${window.location.origin}${s}`; const resp = await fetch(abs, { credentials: 'include' }); const blob = await resp.blob(); return { imageBase64: await blobToDataUrl(blob) }; } catch { return {}; }
    }
    if (s.startsWith('http://') || s.startsWith('https://')) {
      try {
        const u = new URL(s);
        const host = (u.hostname || '').toLowerCase();
        if (host.includes('localhost') || host === '127.0.0.1' || host.endsWith('.local')) {
          const resp = await fetch(s, { credentials: 'include' }); const blob = await resp.blob(); return { imageBase64: await blobToDataUrl(blob) };
        }
        return { imageUrl: s };
      } catch { return { imageUrl: s }; }
    }
    return { imageUrl: s };
  };

  const handleImageAiEdit = useCallback(async (element: DetectedElement, instruction: string) => {
    const src = (element.src || '').trim();
    if (!src) return;
    const instructions = buildImageGuidedInstructions(instruction);
    const aspectRatio = computeImageAspectRatio();
    // Dismiss popup immediately, show processing overlay on the image
    setShowAiChatBubble(false);
    setImageAiProcessing(true);
    try {
      const { imageUrl, imageBase64 } = await resolveImageParam(src);
      const payload: any = { instructions, transparentBackground: imageTransparentBg, aspectRatio };
      if (imageBase64) payload.imageBase64 = imageBase64;
      else if (imageUrl) payload.imageUrl = imageUrl;
      const resp = await fetch(`${API_CONFIG.BASE_URL}/images/edit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const text = await resp.text();
      if (!resp.ok) {
        let detail = text;
        try { const parsed = JSON.parse(text); detail = parsed?.error || parsed?.message || text; } catch {}
        throw new Error(detail || 'Edit failed');
      }
      if (!text.trim()) throw new Error('Image edit service returned an empty response.');
      let data: any;
      try { data = JSON.parse(text); } catch { throw new Error('Image edit service returned invalid JSON.'); }
      const url = data.editedUrl || data.url || data.image_url || data.imageUrl || data.image || '';
      if (!url) throw new Error('No URL in response');
      handleImageSwap(element, url);
      setImageAiPrompt('');
    } catch (e: any) {
      console.error('[CustomComponent] Image AI edit failed:', e);
      // Re-open popup on error so user can retry
      setShowAiChatBubble(true);
    } finally {
      setImageAiProcessing(false);
    }
  }, [imageTransparentBg, handleImageSwap]);

  const handleImageAiFuse = useCallback(async (element: DetectedElement) => {
    const imgs: string[] = [];
    const src = (element.src || '').trim();
    if (src) imgs.push(src);
    imageFuseAttachments.forEach(a => { if (a.url) imgs.push(a.url); });
    if (imgs.length < 2) return;
    const prompt = buildImageGuidedInstructions(imageAiPrompt || 'Compose a single cohesive image that blends the inputs naturally.');
    const size = computeImageSizeHint();
    // Dismiss popup immediately, show processing overlay on the image
    setShowAiChatBubble(false);
    setImageAiProcessing(true);
    try {
      const resp = await fetch(`${API_CONFIG.BASE_URL}/images/fuse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, images: imgs, size }) });
      const text = await resp.text();
      if (!resp.ok) {
        let detail = text;
        try { const parsed = JSON.parse(text); detail = parsed?.error || parsed?.message || text; } catch {}
        throw new Error(detail || 'Fusion failed');
      }
      if (!text.trim()) throw new Error('Image fuse service returned an empty response.');
      let data: any;
      try { data = JSON.parse(text); } catch { throw new Error('Image fuse service returned invalid JSON.'); }
      const url = data.url || data.image_url || '';
      if (!url) throw new Error('No URL in response');
      handleImageSwap(element, url);
      setImageAiPrompt('');
      setImageFuseAttachments([]);
    } catch (e: any) {
      console.error('[CustomComponent] Image AI fuse failed:', e);
      setShowAiChatBubble(true);
    } finally {
      setImageAiProcessing(false);
    }
  }, [imageAiPrompt, imageFuseAttachments, imageTransparentBg, handleImageSwap]);

  // Update object-fit CSS on an image element — immediate DOM + persist to HTML
  const handleImageObjectFit = useCallback((element: DetectedElement, fit: string) => {
    if (!element.src) return;
    setImageObjectFit(fit);

    // 1. Immediate visual feedback: update the iframe DOM directly
    try {
      const iframeDoc = iframeRef.current?.contentDocument;
      if (iframeDoc) {
        const imgs = iframeDoc.querySelectorAll('img');
        imgs.forEach(img => {
          if (img.src === element.src || img.getAttribute('src') === element.src) {
            img.style.objectFit = fit;
          }
        });
      }
    } catch {}

    // 2. Persist: update the stored HTML so it survives re-renders
    if (!stableIframeSrcDoc) return;
    let updatedHtml = stableIframeSrcDoc;
    const escapedSrc = element.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match src in both attribute orders (src may appear before or after style)
    const imgRegex = new RegExp(`(<img\\b[^>]*?src=["']${escapedSrc}["'][^>]*?)(\\/?>)`, 'gi');
    let matched = false;
    updatedHtml = updatedHtml.replace(imgRegex, (_match, before, close) => {
      matched = true;
      if (/style\s*=\s*["']/.test(before)) {
        if (/object-fit\s*:/.test(before)) {
          return before.replace(/object-fit\s*:\s*[^;"']+/g, `object-fit: ${fit}`) + close;
        }
        return before.replace(/style\s*=\s*["']/, (m: string) => m + `object-fit: ${fit}; `) + close;
      }
      return `${before} style="object-fit: ${fit}"${close}`;
    });
    // Fallback: try matching with src as getAttribute value (relative URLs)
    if (!matched) {
      try {
        const iframeDoc = iframeRef.current?.contentDocument;
        if (iframeDoc) {
          const imgs = iframeDoc.querySelectorAll('img');
          for (const img of Array.from(imgs)) {
            if (img.src === element.src) {
              const attrSrc = img.getAttribute('src') || '';
              if (attrSrc && attrSrc !== element.src) {
                const escapedAttrSrc = attrSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const fallbackRegex = new RegExp(`(<img\\b[^>]*?src=["']${escapedAttrSrc}["'][^>]*?)(\\/?>)`, 'gi');
                updatedHtml = updatedHtml.replace(fallbackRegex, (_m, before, close) => {
                  matched = true;
                  if (/style\s*=\s*["']/.test(before)) {
                    if (/object-fit\s*:/.test(before)) {
                      return before.replace(/object-fit\s*:\s*[^;"']+/g, `object-fit: ${fit}`) + close;
                    }
                    return before.replace(/style\s*=\s*["']/, (m: string) => m + `object-fit: ${fit}; `) + close;
                  }
                  return `${before} style="object-fit: ${fit}"${close}`;
                });
              }
              break;
            }
          }
        }
      } catch {}
    }
    if (matched) {
      const cleanHtml = stripInjectedScripts(updatedHtml);
      updateComponent(component.id, { props: { render: cleanHtml } });
      setTimeout(() => {
        try { useEditorStore.getState().applyDraftChanges(); } catch {}
      }, 300);
    }
  }, [stableIframeSrcDoc, updateComponent, component.id]);

  const handleImageDropOnPrompt = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setImageDragOver(false);
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/')).slice(0, 3);
    if (files.length === 0) return;
    const pending = files.map(f => ({ name: f.name, size: f.size, mimeType: f.type, pending: true }));
    setImageFuseAttachments(prev => [...prev, ...pending]);
    try {
      const { uploadFile } = await import('@/utils/fileUploadUtils');
      const uploaded = await Promise.all(files.map(async (file) => {
        const url = await uploadFile(file);
        return { name: file.name, size: file.size, mimeType: file.type, url };
      }));
      setImageFuseAttachments(prev => {
        const next = [...prev];
        let replaced = 0;
        for (let i = 0; i < next.length && replaced < uploaded.length; i++) {
          if (next[i].pending) next[i] = uploaded[replaced++];
        }
        return next;
      });
    } catch {
      setImageFuseAttachments(prev => prev.filter(a => !a.pending));
    }
  };

  const handleImagePickFuseFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/')).slice(0, 3);
    if (files.length === 0) return;
    e.target.value = '';
    const pending = files.map(f => ({ name: f.name, size: f.size, mimeType: f.type, pending: true }));
    setImageFuseAttachments(prev => [...prev, ...pending]);
    try {
      const { uploadFile } = await import('@/utils/fileUploadUtils');
      const uploaded = await Promise.all(files.map(async (file) => {
        const url = await uploadFile(file);
        return { name: file.name, size: file.size, mimeType: file.type, url };
      }));
      setImageFuseAttachments(prev => {
        const next = [...prev];
        let replaced = 0;
        for (let i = 0; i < next.length && replaced < uploaded.length; i++) {
          if (next[i].pending) next[i] = uploaded[replaced++];
        }
        return next;
      });
    } catch {
      setImageFuseAttachments(prev => prev.filter(a => !a.pending));
    }
  };

  // Handler for AI-based element editing - dispatches to main chat panel
  const handleElementAiEdit = useCallback((element: DetectedElement, instruction: string) => {
    DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] AI Edit request:', { type: element.type, id: element.id, instruction });

    // Create a descriptive label for the component chip in chat
    // Use the element's label (component name from layers panel) when available
    const componentName = element.label || null;
    let label = componentName || 'Slide Element';
    let friendlyType = componentName || 'element';

    if (!componentName) {
      if (element.type === 'text' && element.content) {
        const preview = element.content.slice(0, 20);
        label = `"${preview}${element.content.length > 20 ? '...' : ''}"`;
        friendlyType = 'text';
      } else if (element.type === 'image') {
        label = element.alt || 'Image';
        friendlyType = 'image';
      } else if (element.type === 'container') {
        const tagLower = (element.tagName || '').toLowerCase();
        if (tagLower === 'section' || tagLower === 'article') friendlyType = 'section';
        else if (tagLower === 'header') friendlyType = 'header';
        else if (tagLower === 'footer') friendlyType = 'footer';
        else if (tagLower === 'nav') friendlyType = 'navigation';
        else if (tagLower === 'aside') friendlyType = 'sidebar';
        else friendlyType = 'container';
        label = friendlyType.charAt(0).toUpperCase() + friendlyType.slice(1);
      }
    }

    // Build the prompt with clear targeting but user-friendly language
    let prompt = '';

    if (element.type === 'text' && element.content) {
      prompt = `Edit this ${friendlyType} on the slide: "${element.content.slice(0, 100)}${element.content.length > 100 ? '...' : ''}"\n\nChange: ${instruction}\n\n[Target: this ${friendlyType} only]`;
    } else if (element.type === 'image') {
      prompt = `Edit this ${friendlyType} on the slide${element.alt ? ` (${element.alt})` : ''}.\n\nChange: ${instruction}\n\n[Target: this ${friendlyType} only]`;
    } else if (element.type === 'container') {
      const contentPreview = element.content ? element.content.slice(0, 80).replace(/\s+/g, ' ').trim() : '';
      prompt = `Edit this ${friendlyType} on the slide${contentPreview ? `: "${contentPreview}..."` : ''}.\n\nChange: ${instruction}\n\n[Target: this ${friendlyType} only]`;
    } else {
      prompt = instruction;
    }

    // Dispatch event to chat panel with the component and prompt
    // autoSend: true means it will automatically send the message (not just prefill)
    window.dispatchEvent(new CustomEvent('chat:prefill_with_component', {
      detail: {
        componentId: component.id,
        slideId: component.slideId,
        label,
        prompt,
        elementType: 'CustomComponent',
        autoSend: true, // Auto-send when user triggers from mini chat
        // Include element details for better targeting
        elementDetails: {
          type: element.type,
          id: element.id,
          tagName: element.tagName,
          content: element.content?.slice(0, 200),
        }
      }
    }));

    // Close the AI edit UI
    setShowAiChatBubble(false);
    setAiChatMessage('');
    setSelectedElement(null);
  }, [component.id, component.slideId]);

  // Handle element selection from overlay
  const handleElementSelect = useCallback((element: DetectedElement | null, cursorX?: number, cursorY?: number) => {
    setSelectedElement(element);
    // Reset shared chat state
    setAiChatMessage('');
    // Reset image AI state
    setImageAiPrompt('');
    setImageAiProcessing(false);
    setImageFuseAttachments([]);
    setImageDragOver(false);

    // Set cursor position for toolbar/panel positioning (used by all element types)
    if (element) {
      if (cursorX !== undefined && cursorY !== undefined) {
        setCursorPosition({ x: cursorX, y: cursorY });
      } else {
        // Fallback to element right edge
        const iframeRect = iframeRef.current?.getBoundingClientRect();
        setCursorPosition({
          x: (iframeRect?.left || 0) + element.bounds.x + element.bounds.width,
          y: (iframeRect?.top || 0) + element.bounds.y + element.bounds.height / 2
        });
      }
    } else {
      setCursorPosition(null);
    }

    if (element?.type === 'image') {
      setShowImageToolbar(true);
      // Auto-expand the AI panel for image elements
      setShowAiChatBubble(true);
      // Detect current object-fit from iframe DOM
      try {
        const iframeDoc = iframeRef.current?.contentDocument;
        if (iframeDoc) {
          const imgs = iframeDoc.querySelectorAll('img');
          for (const img of Array.from(imgs)) {
            if (img.src === element.src || img.getAttribute('src') === element.src) {
              const cs = iframeRef.current?.contentWindow?.getComputedStyle(img);
              setImageObjectFit(cs?.objectFit || 'cover');
              break;
            }
          }
        }
      } catch {
        setImageObjectFit('cover');
      }
    } else {
      setShowImageToolbar(false);
      setShowAiChatBubble(false);
    }
  }, []);

  return (
    <ErrorBoundary onError={() => setHasRenderError(true)}>
      <div
        ref={rootRef}
        data-scroll-guard="true"
        data-interactive-component={!isThumbnail ? "true" : undefined}
        data-custom-component="true"
        style={{
          ...baseStyles,
          overflow: 'hidden',
          position: 'relative',
          boxSizing: 'border-box',
          width: baseStyles.width || '100%', // Revert to 100% to fill the parent slot
          height: baseStyles.height || '100%',
          // Disable pointer events so clicks pass through to the parent ComponentRenderer
          // wrapper for selection (edit mode) or to enter edit mode (view mode via dblclick).
          // Only enable when selected in edit mode so user can interact with iframe content.
          pointerEvents: effectiveIsEditMode && isSelected ? 'auto' : 'none'
        }}
      >
        {/* Content wrapper that applies the scale */}
        {/* For thumbnails: fill parent (MiniSlide handles scaling); for full view: use design dimensions with scale */}
        <div
          ref={contentInnerRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: isThumbnail ? '100%' : `${effectiveContentWidth}px`,
            height: isThumbnail ? '100%' : `${effectiveContentHeight}px`,
            transform: isThumbnail ? 'none' : `scale(${scale})`,
            transformOrigin: 'top left',
            boxSizing: 'border-box',
            // In edit mode: 'none' when unselected (clicks go to ComponentRenderer overlay), 'auto' when selected (interact with iframe)
            // In view mode: 'none' so double-clicks pass through to ComponentRenderer wrapper → enters edit mode
            pointerEvents: effectiveIsEditMode && isSelected ? 'auto' : 'none'
          }}
        >
          {/* IFRAME RENDERING - Simple 100% fill, HTML handles responsive layout */}
          {/* On iOS thumbnails: strip scripts for memory safety, full view keeps scripts */}
          {isIframeComponent && iframeSrcDocToUse && (
            <iframe
              ref={iframeRef}
              key={iframeKey}
              srcDoc={shouldUseStaticHtml
                ? iframeSrcDocToUse.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                : iframeSrcDocToUse
              }
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: 'none',
                backgroundColor: 'transparent',
                display: 'block',
                // 'none' in view mode and when unselected in edit mode so clicks pass to parent
                // 'auto' only when selected in edit mode (interact with iframe content)
                pointerEvents: effectiveIsEditMode && isSelected ? 'auto' : 'none'
              }}
              sandbox={shouldUseStaticHtml ? "allow-same-origin" : "allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"}
              title="Custom Component"
              onLoad={() => {
                // Iframe loaded successfully
              }}
              onError={() => {
                console.error('[CustomComponent] iframe error, showing fallback');
                setHasRenderError(true);
              }}
            />
          )}

          {/* ELEMENT-LEVEL EDIT OVERLAY for selected custom components */}
          {/* Renders interaction layer over the iframe with hit areas, selection, drag/resize, and text editing */}
          {/* NOTE: Disabled on iOS due to iframe/postMessage crash issues */}
          {effectiveIsEditMode && isSelected && isIframeComponent && iframeSrcDocToUse && !BROWSER.isIOS && (
            <CustomComponentEditOverlay
              componentId={component.id}
              slideId={component.slideId}
              isEditing={effectiveIsEditMode}
              isSelected={isSelected}
              srcDoc={iframeSrcDocToUse}
              scale={scale}
              containerWidth={effectiveContentWidth}
              containerHeight={effectiveContentHeight}
              onHtmlUpdate={handleHtmlUpdate}
              onElementSelect={handleElementSelect}
              iframeRef={iframeRef}
            />
          )}

          {/* Non-iframe content */}
          {!isIframeComponent && (
            <div style={{ width: '100%', height: '100%', pointerEvents: effectiveIsEditMode && isSelected ? 'auto' : 'none' }}>
              {content}
            </div>
          )}
        </div>

        {/*
          CLICK-THROUGH OVERLAY for iframe selection in edit mode
          This overlay sits on top of everything and has pointerEvents: none
          so clicks pass through to the parent ComponentRenderer
        */}
        {effectiveIsEditMode && isIframeComponent && !isSelected && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 10,
              // This overlay catches nothing - clicks go through to parent
              pointerEvents: 'none',
              background: 'transparent'
            }}
          />
        )}

        {/* TEXT ELEMENT - AI sparkle button that expands into chat */}
        {/* Safety check: only render portal if document.body exists and not iOS (prevents mobile crash) */}
        {selectedElement && selectedElement.type === 'text' && typeof document !== 'undefined' && document.body && !BROWSER.isIOS && (() => {
          // bounds are already in viewport coordinates (used for fixed positioning)
          const panelWidth = showAiChatBubble ? 300 : 30;

          // Position to the left of the element's bounding box
          let posLeft = selectedElement.bounds.x - panelWidth - 8;
          let posTop = selectedElement.bounds.y;

          // Keep within viewport
          const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
          const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

          if (posLeft < 20) {
            posLeft = selectedElement.bounds.x + selectedElement.bounds.width + 8; // Position to the right instead
          }
          posTop = Math.max(60, Math.min(posTop, windowHeight - 200));

          return createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: posTop,
                left: posLeft,
                zIndex: 9999,
              }}
            >
              {/* Collapsed: Just the AI sparkle button */}
              {!showAiChatBubble ? (
                <motion.button
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAiChatBubble(true);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  title="Edit with AI"
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #FF6B00 0%, #FF4301 100%)',
                    color: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(255, 67, 1, 0.3)',
                  }}
                >
                  {/* AI Sparkle icon */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
                    <path d="M5 19l1 3 1-3M19 16l1 3 1-3" />
                  </svg>
                </motion.button>
              ) : (
                /* Expanded: Chat input box */
                <motion.div
                  initial={{ opacity: 0, width: 36, height: 36 }}
                  animate={{ opacity: 1, width: 300, height: 'auto' }}
                  exit={{ opacity: 0, width: 36, height: 36 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: 'white',
                    borderRadius: '10px',
                    border: '1px solid #e5e5e5',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                    overflow: 'hidden',
                  }}
                >
                  {/* Close button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAiChatBubble(false);
                      setAiChatMessage('');
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      padding: '4px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#999',
                      zIndex: 10,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>

                  {/* Input area */}
                  <div style={{ padding: '12px 12px 8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '2px', height: '16px', backgroundColor: '#FF4301', borderRadius: '1px' }} />
                      <input
                        type="text"
                        value={aiChatMessage}
                        onChange={(e) => setAiChatMessage(e.target.value)}
                        placeholder="Describe your changes..."
                        disabled={isAiProcessing}
                        autoFocus
                        style={{
                          flex: 1,
                          border: 'none',
                          outline: 'none',
                          fontSize: '14px',
                          color: '#333',
                          background: 'transparent',
                        }}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter' && !e.shiftKey && aiChatMessage.trim() && !isAiProcessing && selectedElement) {
                            e.preventDefault();
                            handleElementAiEdit(selectedElement, aiChatMessage.trim());
                          }
                        }}
                      />
                    </div>
                  </div>
                  {/* Bottom bar with suggestions + send */}
                  <div style={{ padding: '6px 12px 10px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ display: 'flex', gap: '4px', flex: 1, overflowX: 'auto' }}>
                      {[
                        { label: 'Make it punchier', prompt: 'Make this text more impactful and attention-grabbing. Use power words, create urgency, and make every word count while keeping the core message.' },
                        { label: 'Executive tone', prompt: 'Rewrite in a polished, executive tone perfect for C-suite presentations. Be concise, confident, and strategic.' },
                        { label: 'Add storytelling', prompt: 'Transform this into engaging narrative copy that connects emotionally and draws the reader in with storytelling techniques.' },
                      ].map(({ label, prompt }) => (
                        <button
                          key={label}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isAiProcessing && selectedElement) {
                              handleElementAiEdit(selectedElement, prompt);
                            }
                          }}
                          disabled={isAiProcessing}
                          style={{
                            padding: '4px 10px',
                            background: '#f5f5f5',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '11px',
                            cursor: isAiProcessing ? 'default' : 'pointer',
                            color: '#666',
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div style={{ width: '1px', height: '18px', backgroundColor: '#e5e5e5' }} />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (aiChatMessage.trim() && !isAiProcessing && selectedElement) {
                          handleElementAiEdit(selectedElement, aiChatMessage.trim());
                        }
                      }}
                      disabled={!aiChatMessage.trim() || isAiProcessing}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        border: 'none',
                        background: (aiChatMessage.trim() && !isAiProcessing) ? '#FF4301' : '#e5e5e5',
                        cursor: (aiChatMessage.trim() && !isAiProcessing) ? 'pointer' : 'default',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                        <polyline points="18 15 12 9 6 15" />
                      </svg>
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>,
          document.body
        );
        })()}

        {/* IMAGE ELEMENT - Processing overlay on the image while AI edit runs */}
        {selectedElement && selectedElement.type === 'image' && imageAiProcessing && !showAiChatBubble && typeof document !== 'undefined' && document.body && !BROWSER.isIOS && (() => {
          return createPortal(
            <div
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: selectedElement.bounds.y,
                left: selectedElement.bounds.x,
                width: selectedElement.bounds.width,
                height: selectedElement.bounds.height,
                zIndex: 9998,
                background: 'rgba(0,0,0,0.55)',
                backdropFilter: 'blur(2px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                borderRadius: '4px',
                pointerEvents: 'none',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
              <span style={{ color: 'white', fontSize: '11px', fontWeight: 600, letterSpacing: '0.02em' }}>Processing...</span>
            </div>,
            document.body
          );
        })()}

        {/* IMAGE ELEMENT - AI edit panel (no collapsed sparkle - always expanded or hidden) */}
        {selectedElement && selectedElement.type === 'image' && showAiChatBubble && !imageAiProcessing && typeof document !== 'undefined' && document.body && !BROWSER.isIOS && (() => {
          const panelWidth = 300;
          let posLeft = selectedElement.bounds.x - panelWidth - 8;
          let posTop = selectedElement.bounds.y;
          const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
          if (posLeft < 20) {
            posLeft = selectedElement.bounds.x + selectedElement.bounds.width + 8;
          }
          posTop = Math.max(60, Math.min(posTop, windowHeight - 200));

          return createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: posTop,
                left: posLeft,
                width: panelWidth,
                zIndex: 9999,
                background: 'white',
                borderRadius: '10px',
                border: '1px solid #e5e5e5',
                boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
                overflow: 'hidden',
              }}
            >
              {/* Close button — deselects the element entirely */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAiChatBubble(false);
                  setImageAiPrompt('');
                  setImageFuseAttachments([]);
                  setSelectedElement(null);
                  setShowImageToolbar(false);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: '6px',
                  right: '6px',
                  padding: '3px',
                  background: 'rgba(0,0,0,0.5)',
                  backdropFilter: 'blur(4px)',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'white',
                  zIndex: 10,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>

              {/* Image preview with Cover overlay on top-right */}
              <MediaHub
                trigger={
                  <div
                    className="group"
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: '96px',
                      overflow: 'hidden',
                      background: '#f5f5f5',
                      cursor: 'pointer',
                      borderTopLeftRadius: '10px',
                      borderTopRightRadius: '10px',
                    }}
                  >
                    {selectedElement.src && (
                      <img
                        src={selectedElement.src}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: (imageObjectFit as any) || 'cover' }}
                      />
                    )}
                    {/* Top bar: label (left) + fit dropdown (right) */}
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 30px 0 6px',
                        zIndex: 2,
                      }}
                    >
                      <div style={{
                        padding: '1px 5px',
                        borderRadius: '3px',
                        background: 'rgba(0,0,0,0.5)',
                        backdropFilter: 'blur(4px)',
                      }}>
                        <span style={{ fontSize: '8px', color: 'white', fontWeight: 500, display: 'block', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {selectedElement.alt || 'Image'}
                        </span>
                      </div>
                      <select
                        value={imageObjectFit}
                        onChange={(e) => {
                          e.stopPropagation();
                          if (selectedElement) handleImageObjectFit(selectedElement, e.target.value);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          padding: '1px 4px',
                          border: 'none',
                          borderRadius: '3px',
                          fontSize: '8px',
                          color: 'white',
                          fontWeight: 500,
                          background: 'rgba(0,0,0,0.5)',
                          backdropFilter: 'blur(4px)',
                          cursor: 'pointer',
                          outline: 'none',
                        }}
                      >
                        <option value="cover">Cover</option>
                        <option value="contain">Contain</option>
                        <option value="fill">Fill</option>
                        <option value="scale-down">Scale Down</option>
                      </select>
                    </div>
                    {/* Browse hover overlay */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(0,0,0,0)',
                        transition: 'background 0.15s ease',
                      }}
                      className="group-hover:!bg-black/35"
                    >
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: 'white',
                          fontSize: '10px',
                          fontWeight: 600,
                          opacity: 0,
                          transition: 'opacity 0.15s ease',
                        }}
                        className="group-hover:!opacity-100"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                        Browse
                      </span>
                    </div>
                  </div>
                }
                defaultSearchTerm={selectedElement.alt || ''}
                autoSearch={!!selectedElement.alt}
                onSelect={(url) => {
                  // Intercept generating/failed placeholders — keep MediaHub open
                  if (url === 'generating://ai-image' || url === 'failed://ai-image') {
                    return;
                  }
                  if (url && typeof url === 'string' && selectedElement) {
                    // Dismiss popup and swap the image URL in the render HTML
                    setShowAiChatBubble(false);
                    handleImageSwap(selectedElement, url);
                  }
                }}
              />

              {/* Input area with drag-drop support */}
              <div
                style={{
                  padding: '8px',
                  border: imageDragOver ? '2px dashed #FF4301' : '2px dashed transparent',
                  borderRadius: '6px',
                  background: imageDragOver ? 'rgba(255, 67, 1, 0.05)' : 'transparent',
                  margin: '6px 8px',
                  transition: 'all 0.15s ease',
                }}
                onDragOver={(e) => { e.preventDefault(); setImageDragOver(true); }}
                onDragLeave={() => setImageDragOver(false)}
                onDrop={handleImageDropOnPrompt}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ width: '2px', height: '16px', backgroundColor: '#FF4301', borderRadius: '1px', marginTop: '3px', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      value={imageAiPrompt}
                      onChange={(e) => setImageAiPrompt(e.target.value)}
                      placeholder={imageDragOver ? 'Drop image to fuse...' : 'Describe your edit...'}
                      disabled={imageAiProcessing}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      style={{
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        fontSize: '12px',
                        color: '#333',
                        background: 'transparent',
                        padding: 0,
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter' && !e.shiftKey && imageAiPrompt.trim() && !imageAiProcessing && selectedElement) {
                          e.preventDefault();
                          handleImageAiEdit(selectedElement, imageAiPrompt.trim());
                        }
                      }}
                    />
                    {/* Fusion attachment chips */}
                    {imageFuseAttachments.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                        {imageFuseAttachments.map((att, i) => (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            padding: '2px 6px', background: '#f0f0f0', borderRadius: '4px', fontSize: '10px', color: '#555',
                          }}>
                            {att.pending ? (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                                <path d="M21 12a9 9 0 11-6.219-8.56" />
                              </svg>
                            ) : null}
                            <span style={{ maxWidth: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setImageFuseAttachments(prev => prev.filter((_, idx) => idx !== i)); }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', lineHeight: 1 }}
                            >
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Suggestion chips */}
              <div style={{ padding: '0 8px 4px', display: 'flex', gap: '4px', overflowX: 'auto' }}>
                {[
                  { label: 'Blur background', prompt: 'Blur the background while keeping the main subject sharp and in focus.' },
                  { label: 'Cinematic look', prompt: 'Apply cinematic color grading with dramatic contrast, rich shadows, and film-like tones.' },
                  { label: 'Clean edges', prompt: 'Clean up and refine the edges of the subject for a polished look.' },
                ].map(({ label, prompt }) => (
                  <button
                    key={label}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!imageAiProcessing && selectedElement) {
                        handleImageAiEdit(selectedElement, prompt);
                      }
                    }}
                    disabled={imageAiProcessing}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      padding: '3px 8px',
                      background: 'transparent',
                      border: '1px solid #e0e0e0',
                      borderRadius: '4px',
                      fontSize: '10px',
                      cursor: imageAiProcessing ? 'default' : 'pointer',
                      color: '#555',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      transition: 'all 0.12s ease',
                    }}
                    onMouseOver={(e) => { if (!imageAiProcessing) { (e.target as HTMLElement).style.background = '#f5f5f5'; (e.target as HTMLElement).style.borderColor = '#ccc'; }}}
                    onMouseOut={(e) => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.borderColor = '#e0e0e0'; }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Action row */}
              <div style={{ padding: '2px 8px 8px 8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                {/* Hidden file input for fusion */}
                <input ref={imageAiFuseFileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleImagePickFuseFiles} />

                {/* Apply edit button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (imageAiPrompt.trim() && selectedElement) {
                      handleImageAiEdit(selectedElement, imageAiPrompt.trim());
                    }
                  }}
                  disabled={!imageAiPrompt.trim()}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    padding: '5px 14px',
                    background: imageAiPrompt.trim() ? '#FF4301' : '#e5e5e5',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: imageAiPrompt.trim() ? 'pointer' : 'default',
                  }}
                >
                  Apply edit
                </button>

                {/* Fuse button (only when attachments exist) */}
                {imageFuseAttachments.filter(a => a.url).length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selectedElement) handleImageAiFuse(selectedElement);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      padding: '5px 14px',
                      background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Fuse
                  </button>
                )}

                <div style={{ flex: 1 }} />

                {/* Add image button */}
                <button
                  onClick={(e) => { e.stopPropagation(); imageAiFuseFileInputRef.current?.click(); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  title="Attach image for fusion"
                  style={{
                    padding: '4px 8px',
                    background: 'transparent',
                    border: '1px solid #e0e0e0',
                    borderRadius: '6px',
                    fontSize: '10.5px',
                    color: '#777',
                    cursor: 'pointer',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
                  Fuse
                </button>
              </div>
            </motion.div>
          </AnimatePresence>,
          document.body
        );
        })()}

        {/* CONTAINER ELEMENT AI EDIT - Sparkle button that expands to chat */}
        {/* Safety check: only render portal if document.body exists and not iOS (prevents mobile crash) */}
        {selectedElement && selectedElement.type === 'container' && typeof document !== 'undefined' && document.body && !BROWSER.isIOS && (() => {
          // bounds are already in viewport coordinates (used for fixed positioning)
          const panelWidth = showAiChatBubble ? 300 : 30;

          // Position to the left of the element's bounding box
          let posLeft = selectedElement.bounds.x - panelWidth - 8;
          let posTop = selectedElement.bounds.y;

          // Keep within viewport
          const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
          const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

          if (posLeft < 20) {
            posLeft = selectedElement.bounds.x + selectedElement.bounds.width + 8; // Position to the right instead
          }
          posTop = Math.max(60, Math.min(posTop, windowHeight - 200));

          return createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: posTop,
                left: posLeft,
                zIndex: 9999,
              }}
            >
              {/* Collapsed state: sparkle button */}
              {!showAiChatBubble && (
                <motion.button
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAiChatBubble(true);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  title="Edit with AI"
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #FF6B00 0%, #FF4301 100%)',
                    color: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(255, 67, 1, 0.3)',
                  }}
                >
                  {/* AI Sparkle icon */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
                    <path d="M5 19l1 3 1-3M19 16l1 3 1-3" />
                  </svg>
                </motion.button>
              )}

              {/* Expanded state: chat panel */}
              {showAiChatBubble && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, width: 36 }}
                  animate={{ opacity: 1, scale: 1, width: 300 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    background: 'white',
                    borderRadius: '10px',
                    border: '1px solid #e5e5e5',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
                    overflow: 'hidden',
                  }}
                >
                  {/* Close button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAiChatBubble(false);
                      setAiChatMessage('');
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      padding: '4px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#999',
                      zIndex: 10,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>

                  {/* Input area with drag-drop support */}
                  <>
                  <div
                    style={{
                      padding: '12px',
                      border: containerDragOver ? '2px dashed #FF4301' : '2px dashed transparent',
                      borderRadius: '8px',
                      background: containerDragOver ? 'rgba(255, 67, 1, 0.05)' : 'transparent',
                      margin: '8px',
                      transition: 'all 0.15s ease',
                    }}
                    onDragOver={(e) => { e.preventDefault(); setContainerDragOver(true); }}
                    onDragLeave={() => setContainerDragOver(false)}
                    onDrop={async (e: React.DragEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContainerDragOver(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file && file.type.startsWith('image/')) {
                        try {
                          const { uploadFile } = await import('@/utils/fileUploadUtils');
                          const url = await uploadFile(file);
                          setContainerUploadedFile({ name: file.name, url });
                        } catch (err) {
                          console.error('Upload failed:', err);
                        }
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{ width: '2px', height: '18px', backgroundColor: '#FF4301', borderRadius: '1px', marginTop: '3px', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <input
                          type="text"
                          value={aiChatMessage}
                          onChange={(e) => setAiChatMessage(e.target.value)}
                          placeholder={containerDragOver ? "Drop image here..." : "Describe your changes..."}
                          disabled={isAiProcessing}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                          style={{
                            width: '100%',
                            border: 'none',
                            outline: 'none',
                            fontSize: '14px',
                            color: '#333',
                            background: 'transparent',
                            padding: 0,
                            fontFamily: 'system-ui, -apple-system, sans-serif',
                          }}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              if ((aiChatMessage.trim() || containerUploadedFile) && !isAiProcessing && selectedElement) {
                                const msg = containerUploadedFile
                                  ? `${aiChatMessage.trim()} [Reference image: ${containerUploadedFile.url}]`
                                  : aiChatMessage.trim();
                                handleElementAiEdit(selectedElement, msg);
                                setContainerUploadedFile(null);
                              }
                            }
                          }}
                        />
                        {/* Uploaded file preview */}
                        {containerUploadedFile && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', padding: '6px 8px', background: '#f5f5f5', borderRadius: '6px' }}>
                            <img src={containerUploadedFile.url} alt="" style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '4px' }} />
                            <span style={{ fontSize: '11px', color: '#666', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{containerUploadedFile.name}</span>
                            <button onClick={() => setContainerUploadedFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom bar */}
                  <div style={{ padding: '4px 12px 10px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* Upload button */}
                    <input ref={containerFileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          const { uploadFile } = await import('@/utils/fileUploadUtils');
                          const url = await uploadFile(file);
                          setContainerUploadedFile({ name: file.name, url });
                        } catch (err) {
                          console.error('Upload failed:', err);
                        }
                      }
                    }} />
                    <button
                      onClick={(e) => { e.stopPropagation(); containerFileInputRef.current?.click(); }}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#999', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Upload image"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                    </button>

                    {/* Suggestions */}
                    <div style={{ display: 'flex', gap: '4px', flex: 1, overflowX: 'auto' }}>
                      {(selectedElement?.tagName?.toLowerCase().includes('img') || selectedElement?.content?.includes('image')
                        ? [
                            { label: 'Cinematic look', prompt: 'Apply cinematic color grading with dramatic contrast, rich shadows, and film-like tones that make this image feel like a movie still.' },
                            { label: 'Remove background', prompt: 'Remove the background from this image completely, keeping only the main subject with clean edges.' },
                            { label: 'Soft glow effect', prompt: 'Add a soft, dreamy glow effect around the image with subtle light bloom and ethereal atmosphere.' },
                          ]
                        : [
                            { label: 'Glassmorphism', prompt: 'Apply modern glassmorphism: frosted glass effect with backdrop blur, subtle transparency, soft white border, and elegant shadow.' },
                            { label: 'Floating 3D card', prompt: 'Create a floating 3D card effect with layered shadows, subtle rotation on hover-ready styling, and premium depth.' },
                            { label: 'Neon glow', prompt: 'Add vibrant neon glow styling with glowing borders, color accent shadows, and cyberpunk-inspired aesthetics.' },
                          ]
                      ).map(({ label, prompt }) => (
                        <button
                          key={label}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isAiProcessing && selectedElement) {
                              handleElementAiEdit(selectedElement, prompt);
                            }
                          }}
                          disabled={isAiProcessing}
                          onMouseDown={(e) => e.stopPropagation()}
                          style={{
                            padding: '5px 12px',
                            background: '#f5f5f5',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '11px',
                            cursor: isAiProcessing ? 'default' : 'pointer',
                            color: '#666',
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div style={{ width: '1px', height: '20px', backgroundColor: '#e5e5e5' }} />

                    {/* Send button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if ((aiChatMessage.trim() || containerUploadedFile) && !isAiProcessing && selectedElement) {
                          const msg = containerUploadedFile
                            ? `${aiChatMessage.trim()} [Reference image: ${containerUploadedFile.url}]`
                            : aiChatMessage.trim();
                          handleElementAiEdit(selectedElement, msg);
                          setContainerUploadedFile(null);
                        }
                      }}
                      disabled={(!aiChatMessage.trim() && !containerUploadedFile) || isAiProcessing}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        border: 'none',
                        background: ((aiChatMessage.trim() || containerUploadedFile) && !isAiProcessing) ? '#FF4301' : '#e5e5e5',
                        color: 'white',
                        cursor: ((aiChatMessage.trim() || containerUploadedFile) && !isAiProcessing) ? 'pointer' : 'default',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="18 15 12 9 6 15" />
                      </svg>
                    </button>
                  </div>
                </>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>,
          document.body
        );
        })()}
      </div>
    </ErrorBoundary>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for CustomComponentRenderer - focus on what actually affects rendering
  if (prevProps.isThumbnail !== nextProps.isThumbnail) return false;
  if (prevProps.isSelected !== nextProps.isSelected) return false;
  if (prevProps.isEditing !== nextProps.isEditing) return false;
  if (prevProps.component.id !== nextProps.component.id) return false;

  // The most important check - render code changes mean we need to re-render
  const prevRender = prevProps.component.props?.render;
  const nextRender = nextProps.component.props?.render;
  if (prevRender !== nextRender) return false;

  // Check position/size changes
  const prevPos = prevProps.component.props?.position;
  const nextPos = nextProps.component.props?.position;
  if (prevPos?.x !== nextPos?.x || prevPos?.y !== nextPos?.y) return false;
  if (prevProps.component.props?.width !== nextProps.component.props?.width) return false;
  if (prevProps.component.props?.height !== nextProps.component.props?.height) return false;

  // Check nested props changes (settings panel edits)
  if (prevProps.component.props?.props !== nextProps.component.props?.props) return false;

  // Skip baseStyles comparison - usually stable
  return true;
});

/**
 * Function wrapper for consistency
 */
export const renderCustomComponent = (
  component: ComponentInstance,
  baseStyles: React.CSSProperties,
  containerRef: RefObject<HTMLDivElement | null>,
  isThumbnail?: boolean,
  isSelected?: boolean,
  isEditing?: boolean
) => {
  return (
    <CustomComponentRenderer
      component={component}
      baseStyles={baseStyles}
      containerRef={containerRef}
      isThumbnail={isThumbnail}
      isSelected={isSelected}
      isEditing={isEditing}
    />
  );
};

// Register the renderer
import { registerRenderer } from '../utils';
import type { RendererFunction } from '../index';

const CustomComponentRendererWrapper: RendererFunction = (props) => {
  return renderCustomComponent(
    props.component,
    props.styles || {},
    props.containerRef,
    props.isThumbnail,
    props.isSelected,
    props.isEditing
  );
};

registerRenderer('CustomComponent', CustomComponentRendererWrapper); 
