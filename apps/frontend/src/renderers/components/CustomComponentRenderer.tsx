import React, { useRef, useEffect, RefObject, useMemo, useState, useCallback, memo } from "react";
import { ComponentInstance } from "../../types/components";
import { useComponentInstance } from "../../context/CustomComponentStateContext";
import { useNavigation } from '../../context/NavigationContext';
import { usePresentationStore } from '@/stores/presentationStore';
import { useActiveSlide } from '../../context/ActiveSlideContext';
import { useEditorStore } from '@/stores/editorStore';
import { CustomComponentEditOverlay, DetectedElement, injectEditMode } from '@/components/custom-component-editor';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { compileRenderCode } from './custom/compileRenderCode';
import { DEBUG_CUSTOM_COMPONENT } from './custom/debug';
import { useCustomComponentImageAutoApply } from './custom/useCustomComponentImageAutoApply';
import { useCustomComponentImageProxy } from './custom/useCustomComponentImageProxy';
import { extractFontFamiliesFromHtml, injectIframeFonts } from './custom/iframeFonts';
import { FontLoadingService } from '@/services/FontLoadingService';
import { useThumbnailRenderMode } from '@/context/ThumbnailRenderContext';

// Browser detection for iOS-specific safety checks
import { BROWSER } from '@/utils/browser';

// Simple error boundary
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('[CustomComponent] Error caught by boundary:', error);
  }

  render() {
    if (this.state.hasError) {
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
          <div style={{ fontWeight: 'bold' }}>Component Error</div>
          <div style={{ marginTop: '5px' }}>{this.state.error?.message || 'Unknown error'}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  // THUMBNAIL SAFETY:
  // Rendering full CustomComponents inside deck thumbnails can spawn many iframes and heavy scripts,
  // which is especially unstable on mobile and has been causing "shrink then crash" behavior.
  // For thumbnails, render a lightweight placeholder instead of an iframe.
  if (isThumbnail && thumbnailMode !== 'full') {
    return (
      <div
        data-custom-component="true"
        data-thumbnail="true"
        style={{
          ...baseStyles,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 6,
          background: 'rgba(0,0,0,0.06)',
          border: '1px solid rgba(0,0,0,0.08)',
          color: 'rgba(0,0,0,0.55)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          pointerEvents: 'none',
        }}
      >
        Custom
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

  const resolvedFonts = useMemo(() => {
    const props = component.props || {};
    const nested = (props.props && typeof props.props === 'object') ? props.props as Record<string, any> : {};
    const bodyFont = props.fontFamily || props.bodyFont || nested.fontFamily || nested.bodyFont;
    const heroFont = props.heroFont || props.headingFont || nested.heroFont || nested.headingFont;
    return {
      bodyFont: typeof bodyFont === 'string' ? bodyFont : undefined,
      heroFont: typeof heroFont === 'string' ? heroFont : undefined
    };
  }, [component.props]);

  // Keep last successful compiled render to avoid flicker during recompilation
  const compiledRenderRef = useRef<Function | null>(null);
  const { currentSlideIndex } = useNavigation();
  const lastSlideIndexRef = useRef<number>(currentSlideIndex);

  // Get component state
  const { state, updateState, clearState } = useComponentInstance(component.id);

  // Get updateComponent from ActiveSlide context for direct image updates
  const { updateComponent } = useActiveSlide();

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

      // Send loading state to iframe first (show placeholder)
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        iframe.contentWindow?.postMessage({
          target: 'ns-custom-component-edit',
          type: 'update-image-with-placeholder',
          elementId: elementId || propName,
          newSrc: imageUrl
        }, '*');
      });

      // Get current props
      const currentProps = component.props.props || {};
      DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Current props:', Object.keys(currentProps));

      // Update the specific prop
      const updatedProps = {
        ...currentProps,
        [propName]: imageUrl,
      };
      DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Updated props:', Object.keys(updatedProps));

      // Update the component
      updateComponent(component.id, {
        props: {
          ...component.props,
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
  }, [isEditing, isThumbnail, component.id, component.props, updateComponent]);

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

  // Container dimensions for non-iframe rendering
  const containerWidth = typeof componentProps.width === 'number' ? componentProps.width : 400;
  const containerHeight = typeof componentProps.height === 'number' ? componentProps.height : 200;

  // Check if this is an iframe-based component (detected during compilation)
  const isIframeComponent = compiledRender && typeof compiledRender === 'object' && (compiledRender as any).__isIframe;
  const iframeSrcDoc = isIframeComponent ? (compiledRender as any).srcDoc : null;

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

  // Inject image props into HTML by replacing placeholder src attributes
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
          `(props\\??\\.${propName}\\s*(?:\\|\\||\\?\\?)\\s*)['"\`]placeholder['"\`]`,
          'gi'
        );
        result = result.replace(jsPattern, `$1'${propValue}'`);

        // Also replace: const varName = 'placeholder' style declarations
        // if the varName matches the propName (common in AI-generated code)
        const constPattern = new RegExp(
          `(const\\s+${propName}\\s*=\\s*)['"\`]placeholder['"\`]`,
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
          `(const\\s+\\w+\\s*=\\s*props\\.${propName}\\s*\\|\\|\\s*)['"\`][^'"\`]*['"\`]`,
          'gi'
        );
        result = result.replace(propNamePattern, `$1'${propValue}'`);
      }
    }

    return result;
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

    // Then add click handlers for edit mode (skip on iOS due to postMessage issues)
    if (!BROWSER.isIOS) {
      html = injectImageClickHandlers(html, component.id);
    }

    html = injectZoomRelay(html, component.id);

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

    // Inject image processing overlay handler script
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
  }, [iframeSrcDoc, component.id, isEditing, isThumbnail, propsKey, effectiveIsEditMode, isSelected, resolvedFonts.bodyFont, resolvedFonts.heroFont, fontCatalogVersion]); // Use propsKey instead of object reference

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
              // Update the component with the new HTML
              updateComponent(component.id, {
                props: {
                  ...component.props,
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
  }, [isIframeComponent, isEditing, component.id, component.slideId, stableIframeSrcDoc, updateComponent, component.props]);

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
            dangerouslySetInnerHTML={{ __html: element }}
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
        return <div dangerouslySetInnerHTML={{ __html: htmlString }} />;
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
  // NOTE: ResizeObserver can crash on iOS Safari, use fallback there
  const [scale, setScale] = useState(1);
  const rootRef = useRef<HTMLDivElement>(null);

  // Data URL for thumbnail iframes - bypasses iOS Safari srcDoc rendering bugs in scaled containers
  const thumbnailDataUrl = useMemo(() => {
    if (!isThumbnail || !stableIframeSrcDoc || !isIframeComponent) {
      return null;
    }
    
    try {
      // Use data URL which iOS handles better than srcDoc in scaled containers
      return `data:text/html;charset=utf-8,${encodeURIComponent(stableIframeSrcDoc)}`;
    } catch (err) {
      console.error('[CustomComponent] Failed to create data URL:', err);
      return null;
    }
  }, [isThumbnail, stableIframeSrcDoc, isIframeComponent]);

  useEffect(() => {
    // If thumbnail, disable internal scaling (handled by parent MiniSlide)
    if (isThumbnail) {
      setScale(1);
      return;
    }

    const element = rootRef.current;
    if (!element) return;

    // On iOS, just calculate scale once and skip ResizeObserver
    if (BROWSER.isIOS) {
      try {
        const width = element.getBoundingClientRect().width;
        if (containerWidth > 0 && width > 0) {
          setScale(width / containerWidth);
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
          // Calculate scale based on the ratio of current container width to the design width
          // If containerWidth (design width) is 0 or invalid, default to 1 to avoid division by zero
          if (containerWidth > 0) {
            const newScale = width / containerWidth;
            setScale(newScale);
          }
        }
      });
      observer.observe(element);
    } catch (err) {
      // ResizeObserver may crash, fallback to single calculation
      try {
        const width = element.getBoundingClientRect().width;
        if (containerWidth > 0 && width > 0) {
          setScale(width / containerWidth);
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
  }, [containerWidth, isThumbnail]);

  // Handler for HTML updates from CustomComponentEditOverlay
  const handleHtmlUpdate = useCallback((newHtml: string) => {
    if (!newHtml) return;

    DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] HTML update from overlay, length:', newHtml.length);

    // Update the component with new HTML
    updateComponent(component.id, {
      props: {
        ...component.props,
        render: newHtml
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
  }, [updateComponent, component.id, component.props]);

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
      // Update the component with new HTML
      updateComponent(component.id, {
        props: {
          ...component.props,
          render: updatedHtml
        }
      });
      DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] Updated HTML with new text');

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
  }, [stableIframeSrcDoc, updateComponent, component.id, component.props]);

  // Handler for image swap inside custom component
  const handleImageSwap = useCallback((element: DetectedElement, newImageUrl: string) => {
    if (!stableIframeSrcDoc || !element.src) return;

    console.log('[CustomComponent] Image swap:', { oldSrc: element.src?.slice(0, 50), newSrc: newImageUrl?.slice(0, 50) });

    // Replace the old image src with the new one
    let updatedHtml = stableIframeSrcDoc;
    const oldSrc = element.src;

    // Escape special regex characters in the URL
    const escapedOldSrc = oldSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`src=["']${escapedOldSrc}["']`, 'g');

    updatedHtml = updatedHtml.replace(pattern, `src="${newImageUrl}"`);

    if (updatedHtml !== stableIframeSrcDoc) {
      // FIRST: Update the iframe directly so user sees immediate feedback
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({
          target: 'ns-custom-component-edit',
          type: 'update-image',
          elementId: element.id,
          newSrc: newImageUrl
        }, '*');
        console.log('[CustomComponent] Sent update-image to iframe');
      }

      // THEN: Update the component state
      updateComponent(component.id, {
        props: {
          ...component.props,
          render: updatedHtml
        }
      });
      console.log('[CustomComponent] Updated HTML with new image');

      // CRITICAL: Immediately persist changes to backend
      setTimeout(() => {
        try {
          useEditorStore.getState().applyDraftChanges();
          console.log('[CustomComponent] Persisted image changes to backend');
        } catch (e) {
          console.error('[CustomComponent] Failed to persist image changes:', e);
        }
      }, 300);
    } else {
      console.warn('[CustomComponent] HTML replacement failed - old URL not found in HTML');
    }

    setSelectedElement(null);
    setShowImageToolbar(false);
  }, [stableIframeSrcDoc, updateComponent, component.id, component.props, iframeRef]);

  // Handler for AI-based element editing - dispatches to main chat panel
  const handleElementAiEdit = useCallback((element: DetectedElement, instruction: string) => {
    DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] AI Edit request:', { type: element.type, id: element.id, instruction });

    // Create a descriptive label for the component chip in chat
    let label = 'Custom Component';
    if (element.type === 'text' && element.content) {
      const preview = element.content.slice(0, 20);
      label = `Text: "${preview}${element.content.length > 20 ? '...' : ''}"`;
    } else if (element.type === 'image') {
      label = 'Image';
    } else if (element.type === 'container') {
      label = element.tagName || 'Section';
    }

    // Build the prompt with SPECIFIC element targeting info
    let prompt = '';

    if (element.type === 'text' && element.content) {
      prompt = `In this custom HTML component, find and edit ONLY this specific text element: "${element.content.slice(0, 150)}${element.content.length > 150 ? '...' : ''}"\n\nMake this change: ${instruction}\n\nIMPORTANT: Only modify this exact text element, do not change anything else.`;
    } else if (element.type === 'image') {
      prompt = `In this custom HTML component, edit the image${element.alt ? ` with alt text "${element.alt}"` : ''}.\n\nMake this change: ${instruction}\n\nIMPORTANT: Only modify this specific image element.`;
    } else if (element.type === 'container') {
      const contentPreview = element.content ? element.content.slice(0, 100) : '';
      prompt = `In this custom HTML component, find and edit ONLY the ${element.tagName || 'section'} element${contentPreview ? ` that contains: "${contentPreview}..."` : ''}.\n\nMake this change: ${instruction}\n\nIMPORTANT: Only modify this specific ${element.tagName || 'section'} element and its contents, do not change other parts of the component.`;
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

    // Set cursor position for toolbar/panel positioning (used by image and container)
    if (element && (element.type === 'image' || element.type === 'container')) {
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
    } else {
      setShowImageToolbar(false);
    }
    // Reset AI chat state on selection change
    setShowAiChatBubble(false);
    setAiChatMessage('');
  }, []);

  return (
    <ErrorBoundary>
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
          // CRITICAL: In edit mode, disable pointer events so clicks pass through
          // to the parent ComponentRenderer wrapper for selection
          // UNLESS it is selected, then we allow interaction
          pointerEvents: isSelected || !effectiveIsEditMode ? 'auto' : 'none'
        }}
      >
        {/* Content wrapper that applies the scale */}
        <div
          ref={contentInnerRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${containerWidth}px`, // Force design width
            height: `${containerHeight}px`, // Force design height
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            boxSizing: 'border-box',
            pointerEvents: isSelected || !effectiveIsEditMode ? 'auto' : 'none' // Inner content shouldn't block clicks in edit mode (handled by overlay) unless selected
          }}
        >
          {/* IFRAME RENDERING - Simple 100% fill, HTML handles responsive layout */}
          {/* For thumbnails, use data URL to bypass iOS Safari srcDoc rendering bugs in scaled containers */}
          {isIframeComponent && stableIframeSrcDoc && (isThumbnail ? thumbnailDataUrl : true) && (
            <iframe
              ref={iframeRef}
              key={`${component.id}-${renderCodeHash}-${propsKey.length}-${propsKey.slice(-20)}`}
              src={isThumbnail ? thumbnailDataUrl! : undefined}
              srcDoc={isThumbnail ? undefined : stableIframeSrcDoc}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: 'none',
                backgroundColor: 'transparent',
                display: 'block',
                pointerEvents: isThumbnail ? 'none' : 'auto' // Disable interaction for thumbnails
              }}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              title="Custom Component"
              loading={isThumbnail ? 'eager' : undefined}
              scrolling="no"
            />
          )}

          {/* ELEMENT-LEVEL EDIT OVERLAY for selected custom components */}
          {/* Renders interaction layer over the iframe with hit areas, selection, drag/resize, and text editing */}
          {/* NOTE: Disabled on iOS due to iframe/postMessage crash issues */}
          {effectiveIsEditMode && isSelected && isIframeComponent && stableIframeSrcDoc && !BROWSER.isIOS && (
            <CustomComponentEditOverlay
              componentId={component.id}
              slideId={component.slideId}
              isEditing={effectiveIsEditMode}
              isSelected={isSelected}
              srcDoc={stableIframeSrcDoc}
              scale={scale}
              containerWidth={containerWidth}
              containerHeight={containerHeight}
              onHtmlUpdate={handleHtmlUpdate}
              onElementSelect={handleElementSelect}
              iframeRef={iframeRef}
            />
          )}

          {/* Non-iframe content */}
          {!isIframeComponent && (
            <div style={{ width: '100%', height: '100%', pointerEvents: isSelected || !effectiveIsEditMode ? 'auto' : 'none' }}>
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

        {/*
          IMAGE SELECTION BUTTONS for selected CustomComponents with placeholder images
          Shows compact, on-brand buttons positioned in a clean overlay
        */}
        {effectiveIsEditMode && isSelected && isIframeComponent && stableIframeSrcDoc && (() => {
          // Parse HTML to find placeholder images
          const placeholderImages: Array<{ id: string; alt: string; propName: string; searchQuery: string }> = [];
          const imgRegex = /<img[^>]*>/gi;
          let match;
          let index = 0;

          while ((match = imgRegex.exec(stableIframeSrcDoc)) !== null) {
            const imgTag = match[0];
            const srcMatch = imgTag.match(/src=["']([^"']*)["']/i);
            const src = srcMatch?.[1] || '';
            const isPlaceholder = !src || src === 'placeholder' || src.includes('placeholder') ||
              src.startsWith('data:image/svg+xml') || // loading placeholder
              (!src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('blob:') && !src.startsWith('//'));

            if (!isPlaceholder) continue;

            const altMatch = imgTag.match(/alt=["']([^"']+)["']/i);
            const idMatch = imgTag.match(/id=["']([^"']+)["']/i);
            const alt = altMatch?.[1] || '';
            const id = idMatch?.[1] || `img-${index}`;

            const propName = alt
              ? alt.replace(/[^a-zA-Z0-9]/g, ' ').split(' ').filter(Boolean)
                  .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                  .join('') + 'Image'
              : `image${index}`;

            const searchQuery = (alt || propName)
              .replace(/Image$|Img$|Photo$|Picture$/i, '')
              .replace(/([A-Z])/g, ' $1')
              .replace(/[^a-zA-Z0-9\s]/g, '')
              .trim()
              .toLowerCase() || 'image';

            placeholderImages.push({ id, alt, propName, searchQuery });
            index++;
          }

          if (placeholderImages.length === 0) return null;

          // Brand colors
          const brandOrange = '#FF4301';
          const brandOrangeHover = '#E63D00';

          return (
            <div
              data-no-drag="true"
              style={{
                position: 'absolute',
                bottom: '12px',
                right: '12px',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                alignItems: 'flex-end',
                pointerEvents: 'auto',
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {placeholderImages.slice(0, 4).map(({ propName, searchQuery, alt }, idx) => (
                <button
                  key={propName}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponent] Select Image clicked:', { propName, searchQuery });
                    window.dispatchEvent(new CustomEvent('image:select-placeholder', {
                      detail: {
                        componentId: component.id,
                        slideId: component.slideId,
                        propName: propName,
                        searchQuery: searchQuery,
                        topic: searchQuery,
                        isCustomComponentProp: true,
                      }
                    }));
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    color: 'white',
                    background: brandOrange,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(255, 67, 1, 0.3)',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = brandOrangeHover;
                    e.currentTarget.style.transform = 'translateX(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 67, 1, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = brandOrange;
                    e.currentTarget.style.transform = 'translateX(0)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(255, 67, 1, 0.3)';
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21,15 16,10 5,21"/>
                  </svg>
                  {(alt || searchQuery).substring(0, 20)}{(alt || searchQuery).length > 20 ? '…' : ''}
                </button>
              ))}
              {placeholderImages.length > 4 && (
                <span style={{
                  fontSize: '10px',
                  color: 'rgba(255,255,255,0.8)',
                  background: 'rgba(0,0,0,0.6)',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontWeight: 500,
                }}>
                  +{placeholderImages.length - 4} more
                </span>
              )}
            </div>
          );
        })()}

        {/* TEXT ELEMENT - Small floating AI button (doesn't block editing) */}
        {/* Safety check: only render portal if document.body exists and not iOS (prevents mobile crash) */}
        {selectedElement && selectedElement.type === 'text' && typeof document !== 'undefined' && document.body && !BROWSER.isIOS && createPortal(
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              // Position at top-right of component (iframe), not overlapping
              top: Math.max(60, (iframeRef.current?.getBoundingClientRect().top || 0) + 8),
              left: Math.min(
                typeof window !== 'undefined' ? window.innerWidth - 100 : 300, // Don't go off right edge
                (iframeRef.current?.getBoundingClientRect().right || 0) + 8
              ),
              zIndex: 9999,
              display: 'flex',
              gap: '4px',
            }}
          >
            {/* AI button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAiChatBubble(!showAiChatBubble);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title="Edit with AI"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid #e5e5e5',
                background: showAiChatBubble ? '#FF4301' : 'white',
                color: showAiChatBubble ? 'white' : '#FF4301',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3v18M3 12h18M7.5 7.5l9 9M16.5 7.5l-9 9" />
              </svg>
            </button>
            {/* Close button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedElement(null);
                setShowAiChatBubble(false);
                setAiChatMessage('');
                try {
                  iframeRef.current?.contentWindow?.postMessage({
                    target: 'ns-custom-component-edit',
                    type: 'deselect'
                  }, '*');
                } catch (err) {
                  // Ignore postMessage errors during unmount
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid #e5e5e5',
                background: 'white',
                color: '#666',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            {/* AI Chat popup - only shows when AI button is clicked */}
            {showAiChatBubble && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: '40px',
                  left: 0,
                  width: '280px',
                  background: 'white',
                  borderRadius: '12px',
                  border: '1px solid #e5e5e5',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                  overflow: 'hidden',
                }}
              >
                {/* Input area */}
                <div style={{ padding: '12px 12px 8px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '2px', height: '16px', backgroundColor: '#FF4301', borderRadius: '1px' }} />
                    <input
                      type="text"
                      value={aiChatMessage}
                      onChange={(e) => setAiChatMessage(e.target.value)}
                      placeholder="Rewrite or enhance..."
                      disabled={isAiProcessing}
                      autoFocus
                      style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        fontSize: '13px',
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
                    {['Make punchier', 'Add flair', 'Simplify'].map(label => (
                      <button
                        key={label}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isAiProcessing && selectedElement) {
                            handleElementAiEdit(selectedElement, label);
                          }
                        }}
                        disabled={isAiProcessing}
                        style={{
                          padding: '4px 10px',
                          background: '#f5f5f5',
                          border: 'none',
                          borderRadius: '12px',
                          fontSize: '10px',
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
                      width: '26px',
                      height: '26px',
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
          </motion.div>,
          document.body
        )}

        {/* CONTAINER ELEMENT AI EDIT - ChatPanel style */}
        {/* Safety check: only render portal if document.body exists and not iOS (prevents mobile crash) */}
        {selectedElement && selectedElement.type === 'container' && typeof document !== 'undefined' && document.body && !BROWSER.isIOS && (() => {
          // Position at top-right of the selected element, shift left if needed to stay in slide
          const panelWidth = 300;
          const panelHeight = 280;
          const padding = 12;

          // Get element and iframe position in viewport coordinates
          const iframeRect = iframeRef.current?.getBoundingClientRect();
          const elementRight = (iframeRect?.left || 0) + selectedElement.bounds.x + selectedElement.bounds.width;
          const elementTop = (iframeRect?.top || 0) + selectedElement.bounds.y;

          // Use iframe right edge as the boundary (not viewport) to avoid overlapping sidebar
          // Safety check for window access
          const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
          const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
          const maxRight = iframeRect?.right || windowWidth;

          // Position at top-right corner of element
          let panelLeft = elementRight + padding;
          let panelTop = elementTop;

          // If it would go past the slide area, shift left just enough to fit
          if (panelLeft + panelWidth > maxRight) {
            panelLeft = maxRight - panelWidth - padding;
          }

          // Ensure left doesn't go past the left edge of the iframe
          const minLeft = iframeRect?.left || padding;
          if (panelLeft < minLeft) {
            panelLeft = minLeft;
          }

          // Ensure top stays within viewport
          panelTop = Math.max(padding, Math.min(panelTop, windowHeight - panelHeight - padding));

          return createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: panelTop,
                left: panelLeft,
                zIndex: 9999,
                width: `${panelWidth}px`,
              }}
            >
              {/* ChatPanel-style input box */}
              <div
                style={{
                  background: 'white',
                  borderRadius: '16px',
                  border: '1px solid #e5e5e5',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
                  overflow: 'hidden',
                }}
              >
                {/* Close button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedElement(null);
                    setShowAiChatBubble(false);
                    setAiChatMessage('');
                    try {
                      iframeRef.current?.contentWindow?.postMessage({
                        target: 'ns-custom-component-edit',
                        type: 'deselect'
                      }, '*');
                    } catch (err) {
                      // Ignore postMessage errors during unmount
                    }
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    padding: '4px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#999',
                    zIndex: 10,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                        ? ['Remove background', 'Add soft shadow', 'Round corners']
                        : ['Glassmorphism + blur', 'Floating card', 'Gradient mesh bg']
                      ).map(label => (
                        <button
                          key={label}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isAiProcessing && selectedElement) {
                              handleElementAiEdit(selectedElement, label);
                            }
                          }}
                          disabled={isAiProcessing}
                          onMouseDown={(e) => e.stopPropagation()}
                          style={{
                            padding: '4px 10px',
                            background: '#f5f5f5',
                            border: 'none',
                            borderRadius: '12px',
                            fontSize: '10px',
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
              </div>
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
