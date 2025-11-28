import React, { useRef, useEffect, RefObject, useMemo, useState, useCallback } from "react";
import { ComponentInstance } from "../../types/components";
import { useComponentInstance } from "../../context/CustomComponentStateContext";
import { useNavigation } from '../../context/NavigationContext';
import { usePresentationStore } from '@/stores/presentationStore';
import { useActiveSlide } from '../../context/ActiveSlideContext';
import { getContrastTextColor, isLightColor, getColorDistance, ensureChartColorsContrastWithBackground, getThemeAppropriateChartColors } from '@/utils/colorUtils';

// Import visualization and animation libraries for CustomComponents
import * as d3Import from 'd3';
import animeImport from 'animejs';
import roughImport from 'roughjs';
import confettiImport from 'canvas-confetti';
import * as gsapImport from 'gsap';

/**
 * Ensure HTML document has proper blank line after <html> tag.
 * Some browsers/iframes need this to render correctly.
 */
function ensureHtmlNewlines(html: string): string {
  if (!html || typeof html !== 'string') return html;

  // Ensure blank line (two newlines) after <html> tag
  // First normalize: remove any whitespace after <html>, then add proper blank line
  return html.replace(/(<html[^>]*>)\s*\n?\s*/gi, '$1\n\n');
}

// Escape raw newlines that appear inside single/double quoted string literals.
// This prevents accidental split string literals (e.g., 'Calvin\nCycle' becoming two lines)
// and keeps generated code valid for parsing.
function escapeRawNewlinesInStringLiterals(source: string): string {
  const out: string[] = [];
  const modeStack: Array<'normal' | 'single' | 'double' | 'template' | 'templateExpr'> = ['normal'];
  let escapeNext = false;

  const pushMode = (mode: 'normal' | 'single' | 'double' | 'template' | 'templateExpr') => {
    modeStack.push(mode);
  };
  const popMode = () => {
    if (modeStack.length > 1) modeStack.pop();
  };
  const currentMode = () => modeStack[modeStack.length - 1];

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const mode = currentMode();

    if (mode === 'single' || mode === 'double') {
      if (escapeNext) {
        out.push(ch);
        escapeNext = false;
        continue;
      }
      if (ch === '\\') {
        out.push(ch);
        escapeNext = true;
        continue;
      }
      if ((mode === 'single' && ch === '\'') || (mode === 'double' && ch === '"')) {
        out.push(ch);
        popMode();
        continue;
      }
      if (ch === '\r') {
        // Normalize CRLF or lone CR to \n
        if (source[i + 1] === '\n') {
          out.push('\\n');
          i++;
        } else {
          out.push('\\n');
        }
        continue;
      }
      if (ch === '\n') {
        out.push('\\n');
        continue;
      }
      out.push(ch);
      continue;
    }

    if (mode === 'template') {
      if (escapeNext) {
        out.push(ch);
        escapeNext = false;
        continue;
      }
      if (ch === '\\') {
        out.push(ch);
        escapeNext = true;
        continue;
      }
      // Enter expression region
      if (ch === '$' && source[i + 1] === '{') {
        out.push('${');
        i++;
        pushMode('templateExpr');
        continue;
      }
      // End of template literal
      if (ch === '`') {
        out.push(ch);
        popMode();
        continue;
      }
      // Template literal raw content (newlines allowed) - do not transform
      out.push(ch);
      continue;
    }

    if (mode === 'templateExpr') {
      if (escapeNext) {
        out.push(ch);
        escapeNext = false;
        continue;
      }
      if (ch === '\\') {
        out.push(ch);
        escapeNext = true;
        continue;
      }
      // Track nested template expressions
      if (ch === '{') {
        out.push(ch);
        pushMode('templateExpr');
        continue;
      }
      if (ch === '}') {
        out.push(ch);
        popMode();
        continue;
      }
      // Allow starting quoted strings inside the expression
      if (ch === '\'') {
        out.push(ch);
        pushMode('single');
        continue;
      }
      if (ch === '"') {
        out.push(ch);
        pushMode('double');
        continue;
      }
      if (ch === '`') {
        out.push(ch);
        pushMode('template');
        continue;
      }
      out.push(ch);
      continue;
    }

    // mode === 'normal'
    if (escapeNext) {
      out.push(ch);
      escapeNext = false;
      continue;
    }
    if (ch === '\\') {
      out.push(ch);
      escapeNext = true;
      continue;
    }
    if (ch === '\'') {
      out.push(ch);
      pushMode('single');
      continue;
    }
    if (ch === '"') {
      out.push(ch);
      pushMode('double');
      continue;
    }
    if (ch === '`') {
      out.push(ch);
      pushMode('template');
      continue;
    }
    out.push(ch);
  }

  return out.join('');
}

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
 */
export const CustomComponentRenderer: React.FC<{
  component: ComponentInstance;
  baseStyles: React.CSSProperties;
  containerRef: RefObject<HTMLDivElement | null>;
  isThumbnail?: boolean;
  isSelected?: boolean;
  isEditing?: boolean;
}> = ({ component, baseStyles, containerRef, isThumbnail = false, isSelected = false, isEditing = false }) => {
  const renderCode = component.props.render as string;

  // Stable component props - memoize to prevent unnecessary re-renders
  const componentProps = useMemo(() => ({
    ...component.props,
    ...(component.props.props || {})
  }), [component.props]);

  // Keep last successful compiled render to avoid flicker during recompilation
  const compiledRenderRef = useRef<Function | null>(null);
  const { currentSlideIndex } = useNavigation();
  const lastSlideIndexRef = useRef<number>(currentSlideIndex);

  // Get component state
  const { state, updateState, clearState } = useComponentInstance(component.id);

  // Get updateComponent from ActiveSlide context for direct image updates
  const { updateComponent } = useActiveSlide();

  // Listen for image selection events and update component directly
  useEffect(() => {
    if (!isEditing || isThumbnail) return;

    const handleImageSelected = (event: CustomEvent) => {
      const { componentId, propName, imageUrl } = event.detail || {};

      // Only handle events for this component
      if (componentId !== component.id) return;

      console.log('[CustomComponentRenderer] Received image selection:', { componentId, propName, imageUrl: imageUrl?.substring(0, 60) });

      if (!propName || !imageUrl) {
        console.warn('[CustomComponentRenderer] Missing propName or imageUrl');
        return;
      }

      // Get current props
      const currentProps = component.props.props || {};
      console.log('[CustomComponentRenderer] Current props:', Object.keys(currentProps));

      // Update the specific prop
      const updatedProps = {
        ...currentProps,
        [propName]: imageUrl,
      };
      console.log('[CustomComponentRenderer] Updated props:', Object.keys(updatedProps));

      // Update the component
      updateComponent(component.id, {
        props: {
          ...component.props,
          props: updatedProps,
        }
      });
      console.log('[CustomComponentRenderer] Component update dispatched');
    };

    window.addEventListener('customcomponent:image-selected', handleImageSelected as EventListener);
    return () => {
      window.removeEventListener('customcomponent:image-selected', handleImageSelected as EventListener);
    };
  }, [isEditing, isThumbnail, component.id, component.props, updateComponent]);

  // Track if we've already auto-applied images for this component
  const autoAppliedRef = useRef<Set<string>>(new Set());

  // Auto-apply images for placeholder images when component first renders
  useEffect(() => {
    if (isThumbnail) return;

    const html = renderCode;
    if (!html || typeof html !== 'string') return;

    // Only process full HTML documents (iframe mode)
    const trimmedHtml = html.trim().toLowerCase();
    if (!trimmedHtml.startsWith('<!doctype html') && !trimmedHtml.startsWith('<html')) return;

    // Bad/generic search terms that won't give good results
    const BAD_SEARCH_TERMS = [
      'image', 'image0', 'image1', 'image2', 'image3',
      'visualization', 'dataname', 'photo', 'picture',
      'graphic', 'visual', 'background', 'chart', 'icon',
      'placeholder', 'img', 'figure', 'illustration'
    ];

    // Extract search query from prop name (e.g., "elonMuskImage" -> "elon musk")
    const extractSearchQueryFromPropName = (propName: string): string => {
      // Remove common image suffixes
      let query = propName
        .replace(/Image$|Photo$|Picture$|Src$|Url$|Img$|Thumbnail$|Avatar$|Icon$/i, '')
        .replace(/^(hero|feature|background|banner|main|primary|secondary)/i, '');

      // Convert camelCase to spaces: "elonMusk" -> "elon Musk" -> "elon musk"
      query = query
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .toLowerCase()
        .trim();

      // If too generic, return empty to trigger fallback
      const genericTerms = ['hero', 'feature', 'background', 'banner', 'main', 'primary', 'secondary', 'image', 'photo', ''];
      if (genericTerms.includes(query)) {
        return '';
      }

      return query;
    };

    // CRITICAL: Parse JavaScript to extract image prop names (e.g., props.elonMuskImage)
    // This is where the AI puts the actual search terms, NOT in alt attributes
    const extractImagePropsFromJS = (htmlContent: string): Map<string, string> => {
      const propNameToSearchQuery = new Map<string, string>();

      // Pattern 1: const varName = props.propName || 'placeholder'
      const propPattern1 = /(?:const|let|var)\s+(\w+)\s*=\s*props\??\.(\w*[Ii]mage\w*|\w*[Pp]hoto\w*|\w*[Ll]ogo\w*|\w*[Ii]con\w*|\w*[Aa]vatar\w*|\w*[Bb]anner\w*|\w*[Hh]eadshot\w*)\s*(?:\|\||&&|\?\?)/gi;
      let match;

      while ((match = propPattern1.exec(htmlContent)) !== null) {
        const propName = match[2];
        const searchQuery = extractSearchQueryFromPropName(propName);
        if (searchQuery && searchQuery.length > 2) {
          propNameToSearchQuery.set(propName, searchQuery);
          console.log('[CustomComponentRenderer] Found image prop from JS:', propName, '->', searchQuery);
        }
      }

      // Pattern 2: props.propNameImage (direct access in template)
      const propPattern2 = /\$\{+\s*(?:props\??\.)?(\w*[Ii]mage\w*|\w*[Pp]hoto\w*|\w*[Ll]ogo\w*|\w*[Ii]con\w*|\w*[Aa]vatar\w*|\w*[Bb]anner\w*|\w*[Hh]eadshot\w*)\s*\}+/gi;

      while ((match = propPattern2.exec(htmlContent)) !== null) {
        const propName = match[1];
        if (!propNameToSearchQuery.has(propName)) {
          const searchQuery = extractSearchQueryFromPropName(propName);
          if (searchQuery && searchQuery.length > 2) {
            propNameToSearchQuery.set(propName, searchQuery);
            console.log('[CustomComponentRenderer] Found image prop from template:', propName, '->', searchQuery);
          }
        }
      }

      // Pattern 3: src="${propName}" where propName looks like an image prop
      const propPattern3 = /src=["']\$\{+\s*(\w*[Ii]mage\w*|\w*[Pp]hoto\w*|\w*[Ll]ogo\w*|\w*[Aa]vatar\w*)\s*\}+["']/gi;

      while ((match = propPattern3.exec(htmlContent)) !== null) {
        const propName = match[1];
        if (!propNameToSearchQuery.has(propName)) {
          const searchQuery = extractSearchQueryFromPropName(propName);
          if (searchQuery && searchQuery.length > 2) {
            propNameToSearchQuery.set(propName, searchQuery);
            console.log('[CustomComponentRenderer] Found image prop from src template:', propName, '->', searchQuery);
          }
        }
      }

      return propNameToSearchQuery;
    };

    // Get slide context for fallback search terms
    const getSlideContext = () => {
      try {
        // Try to get slide title from the DOM or store
        const slideContainer = document.querySelector('.slide-container[data-slide-id]');
        const slideTitle = slideContainer?.getAttribute('data-slide-title') || '';

        // Also try to extract title from the HTML itself
        const titleMatch = html.match(/<(?:h1|h2|h3)[^>]*>([^<]+)</i);
        const htmlTitle = titleMatch ? titleMatch[1].trim() : '';

        return slideTitle || htmlTitle || 'professional business';
      } catch {
        return 'professional business';
      }
    };

    // FIRST: Extract image props from JavaScript (these have the actual descriptive names)
    const imagePropSearchQueries = extractImagePropsFromJS(html);
    console.log('[CustomComponentRenderer] Extracted image props:', Array.from(imagePropSearchQueries.entries()));

    // Check for placeholder images in the HTML
    const imgRegex = /<img[^>]*>/gi;
    const placeholders: Array<{ alt: string; searchQuery: string; propName?: string }> = [];
    let match;
    let imgIndex = 0;

    while ((match = imgRegex.exec(html)) !== null) {
      const imgTag = match[0];
      const srcMatch = imgTag.match(/src=["']([^"']*)["']/i);
      const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);
      const src = srcMatch?.[1] || '';
      const alt = altMatch?.[1] || '';

      // Check if this is a placeholder
      const isPlaceholder = !src || src === 'placeholder' || src.includes('placeholder') ||
        (!src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('blob:') && !src.startsWith('//'));

      if (isPlaceholder) {
        // Create a unique key for this placeholder
        const placeholderKey = `${component.id}-${alt || imgIndex}`;

        // Skip if we've already auto-applied for this placeholder
        if (autoAppliedRef.current.has(placeholderKey)) {
          imgIndex++;
          continue;
        }

        // PRIORITY 1: Use search query from JS prop names (most descriptive)
        // Try to match this img to a prop by checking if src contains a variable reference
        let searchQuery = '';
        let matchedPropName = '';

        // Check if src references a prop variable (e.g., src="${elonMuskImage}")
        const srcPropMatch = src.match(/\$\{+\s*(\w+)\s*\}+/);
        if (srcPropMatch) {
          const varName = srcPropMatch[1];
          // Find matching prop from our extracted props
          for (const [propName, query] of imagePropSearchQueries.entries()) {
            if (propName.toLowerCase() === varName.toLowerCase() ||
                propName.toLowerCase().includes(varName.toLowerCase()) ||
                varName.toLowerCase().includes(propName.toLowerCase().replace('image', ''))) {
              searchQuery = query;
              matchedPropName = propName;
              console.log('[CustomComponentRenderer] Matched img to prop:', varName, '->', propName, '->', searchQuery);
              break;
            }
          }
        }

        // If no match from src variable, try to find any unused prop that matches alt text
        if (!searchQuery && imagePropSearchQueries.size > 0) {
          for (const [propName, query] of imagePropSearchQueries.entries()) {
            // Check if alt contains parts of the prop name
            const altLower = alt.toLowerCase();
            const propLower = propName.toLowerCase().replace('image', '').replace('photo', '');
            if (altLower.includes(propLower) || propLower.includes(altLower.split(' ')[0])) {
              searchQuery = query;
              matchedPropName = propName;
              console.log('[CustomComponentRenderer] Matched img alt to prop:', alt, '->', propName, '->', searchQuery);
              break;
            }
          }
        }

        // PRIORITY 2: Use alt text if it's descriptive
        if (!searchQuery) {
          searchQuery = alt
            .replace(/[^a-zA-Z0-9\s]/g, ' ')
            .trim()
            .toLowerCase();
        }

        // Check if the search query is bad/generic
        const isBadSearchTerm = !searchQuery ||
          searchQuery.length < 3 ||
          BAD_SEARCH_TERMS.some(bad => searchQuery === bad || searchQuery.startsWith(bad + ' ') || searchQuery.match(new RegExp(`^${bad}\\d*$`)));

        if (isBadSearchTerm) {
          // PRIORITY 3: Use any remaining image prop that hasn't been used
          if (imagePropSearchQueries.size > 0) {
            const unusedProps = Array.from(imagePropSearchQueries.entries())
              .filter(([prop]) => !placeholders.some(p => p.propName === prop));
            if (unusedProps.length > 0) {
              const [propName, query] = unusedProps[imgIndex % unusedProps.length] || unusedProps[0];
              searchQuery = query;
              matchedPropName = propName;
              console.log('[CustomComponentRenderer] Using unused prop for generic img:', propName, '->', searchQuery);
            }
          }

          // PRIORITY 4: Use slide context as last resort
          if (!searchQuery || BAD_SEARCH_TERMS.includes(searchQuery)) {
            const slideContext = getSlideContext();
            searchQuery = `${slideContext} professional photo`;
            console.log('[CustomComponentRenderer] Bad alt text detected, using slide context:', { original: alt, fallback: searchQuery });
          }
        }

        placeholders.push({ alt: alt || 'image', searchQuery, propName: matchedPropName || undefined });
        autoAppliedRef.current.add(placeholderKey);
        imgIndex++;
      }
    }

    if (placeholders.length === 0) return;

    console.log('[CustomComponentRenderer] Found placeholder images to auto-apply:', placeholders);

    // Auto-fetch and apply images for each placeholder
    const autoApplyImages = async () => {
      // Track all props that need to be updated
      const propsToUpdate: Record<string, string> = {};
      let currentHtml = component.props.render as string;
      let anyReplaced = false;

      for (const { alt, searchQuery, propName } of placeholders) {
        try {
          console.log('[CustomComponentRenderer] Auto-searching for:', searchQuery, 'propName:', propName);

          // Search for images using the media search API
          const response = await fetch('/api/media/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: searchQuery,
              type: 'images',
              limit: 1 // Only need one image
            })
          });

          if (!response.ok) {
            console.warn('[CustomComponentRenderer] Image search failed for:', searchQuery);
            continue;
          }

          const data = await response.json();
          const images = data.results || data.images || [];

          if (images.length === 0) {
            console.warn('[CustomComponentRenderer] No images found for:', searchQuery);
            continue;
          }

          // Get the first image URL
          let imageUrl = images[0].url || images[0].src?.large || images[0].src?.medium || images[0].src?.original;

          if (!imageUrl) {
            console.warn('[CustomComponentRenderer] No valid URL in image result');
            continue;
          }

          console.log('[CustomComponentRenderer] Found image for', searchQuery, ':', imageUrl.substring(0, 60));

          // Proxy external images through our backend for reliability
          if (imageUrl.startsWith('http') && !imageUrl.includes('supabase') && !imageUrl.includes('nextslide')) {
            try {
              const proxyResponse = await fetch('/api/media/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: imageUrl })
              });

              const proxyData = await proxyResponse.json();
              if (proxyResponse.ok && proxyData.success && proxyData.url) {
                imageUrl = proxyData.url;
                console.log('[CustomComponentRenderer] Proxied URL:', imageUrl.substring(0, 60));
              }
            } catch (proxyError) {
              console.warn('[CustomComponentRenderer] Proxy failed, using original URL');
            }
          }

          // CRITICAL: If we have a prop name, store it for updating component props
          // This is the key fix - we need to update props so iframe JS can access them
          if (propName) {
            propsToUpdate[propName] = imageUrl;
            console.log('[CustomComponentRenderer] Will update prop:', propName, '=', imageUrl.substring(0, 50));
          }

          // Also update the HTML to replace placeholder src values
          const altLower = alt.toLowerCase();
          let replaced = false;

          currentHtml = currentHtml.replace(/<img([^>]*)>/gi, (imgMatch, attrs) => {
            if (replaced) return imgMatch;

            const imgAltMatch = attrs.match(/alt=["']([^"']*)["']/i);
            const imgAlt = imgAltMatch ? imgAltMatch[1].toLowerCase() : '';
            const imgSrcMatch = attrs.match(/src=["']([^"']*)["']/i);
            const imgSrc = imgSrcMatch ? imgSrcMatch[1] : '';

            // Check if this is the placeholder we're looking for by:
            // 1. Matching alt text
            // 2. Or matching src that contains ${propName} pattern
            // 3. Or matching src that equals 'placeholder' or is empty
            const srcContainsProp = propName && imgSrc.includes(`\${${propName}}`);
            const srcContainsAnyVar = imgSrc.match(/\$\{+\s*\w+\s*\}+/);
            const isPlaceholderSrc = !imgSrc || imgSrc === 'placeholder' || imgSrc.includes('placeholder');

            const isThisPlaceholder = (imgAlt === altLower || srcContainsProp) &&
              (isPlaceholderSrc || srcContainsAnyVar ||
               (!imgSrc.startsWith('http') && !imgSrc.startsWith('data:') && !imgSrc.startsWith('blob:')));

            if (isThisPlaceholder) {
              replaced = true;
              anyReplaced = true;
              if (attrs.includes('src=')) {
                const newAttrs = attrs.replace(/src=["'][^"']*["']/i, `src="${imageUrl}"`);
                console.log('[CustomComponentRenderer] Auto-replaced image src for:', alt || propName);
                return `<img${newAttrs}>`;
              } else {
                return `<img src="${imageUrl}"${attrs}>`;
              }
            }
            return imgMatch;
          });

        } catch (error) {
          console.error('[CustomComponentRenderer] Error auto-applying image:', error);
        }
      }

      // Update component with both new HTML AND new props
      if (anyReplaced || Object.keys(propsToUpdate).length > 0) {
        const currentProps = component.props.props || {};
        const updatedProps = { ...currentProps, ...propsToUpdate };

        console.log('[CustomComponentRenderer] Updating component with props:', Object.keys(propsToUpdate));

        updateComponent(component.id, {
          props: {
            ...component.props,
            render: currentHtml,
            props: updatedProps, // This is CRITICAL - iframe reads from props.props
          }
        });
        console.log('[CustomComponentRenderer] Auto-applied images, updated props:', Object.keys(propsToUpdate));
      }
    };

    // Run auto-apply after a short delay to avoid blocking render
    const timeoutId = setTimeout(autoApplyImages, 500);

    return () => clearTimeout(timeoutId);
  }, [component.id, renderCode, isThumbnail, updateComponent, component.props]);

  // Track proxied URLs to avoid re-processing
  const proxiedUrlsRef = useRef<Set<string>>(new Set());

  // Helper to decode HTML entities in URLs
  const decodeHtmlEntities = (str: string): string => {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/');
  };

  // Proxy any external image URLs in the HTML (handles cases where AI embeds direct URLs)
  useEffect(() => {
    if (isThumbnail) return;

    const html = renderCode;
    if (!html || typeof html !== 'string') return;

    // Only process full HTML documents (iframe mode)
    const trimmedHtml = html.trim().toLowerCase();
    if (!trimmedHtml.startsWith('<!doctype html') && !trimmedHtml.startsWith('<html')) return;

    // Find external image URLs that need proxying
    const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
    const externalUrls: Array<{ originalUrl: string; decodedUrl: string; fullMatch: string }> = [];
    let match;

    while ((match = imgRegex.exec(html)) !== null) {
      const rawSrc = match[1];
      // CRITICAL: Decode HTML entities to get the actual URL
      const src = decodeHtmlEntities(rawSrc);

      // Check if this is an external URL that needs proxying
      const isExternalUrl = src.startsWith('http') &&
        !src.includes('supabase') &&
        !src.includes('nextslide') &&
        !src.includes('localhost') &&
        !proxiedUrlsRef.current.has(src);

      if (isExternalUrl) {
        externalUrls.push({ originalUrl: rawSrc, decodedUrl: src, fullMatch: match[0] });
        proxiedUrlsRef.current.add(src); // Mark as being processed
        console.log('[CustomComponentRenderer] Found external URL to proxy:', src.substring(0, 80));
      }
    }

    if (externalUrls.length === 0) return;

    console.log('[CustomComponentRenderer] External URLs to proxy:', externalUrls.length);

    // Proxy all external URLs
    const proxyExternalUrls = async () => {
      let currentHtml = component.props.render as string;
      let updated = false;

      for (const { originalUrl, decodedUrl } of externalUrls) {
        try {
          console.log('[CustomComponentRenderer] Proxying:', decodedUrl.substring(0, 80));

          const proxyResponse = await fetch('/api/media/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: decodedUrl }) // Use decoded URL for API call
          });

          const proxyData = await proxyResponse.json();

          if (proxyResponse.ok && proxyData.success && proxyData.url) {
            const proxiedUrl = proxyData.url;
            console.log('[CustomComponentRenderer] Proxied to:', proxiedUrl.substring(0, 60));

            // Replace BOTH the original (with &amp;) and decoded (with &) versions
            // First try exact match with original
            if (currentHtml.includes(originalUrl)) {
              currentHtml = currentHtml.split(originalUrl).join(proxiedUrl);
              updated = true;
              console.log('[CustomComponentRenderer] Replaced original URL in HTML');
            }
            // Also try with decoded URL (in case HTML was already decoded somewhere)
            if (currentHtml.includes(decodedUrl)) {
              currentHtml = currentHtml.split(decodedUrl).join(proxiedUrl);
              updated = true;
              console.log('[CustomComponentRenderer] Replaced decoded URL in HTML');
            }
          } else {
            console.warn('[CustomComponentRenderer] Proxy failed for:', decodedUrl.substring(0, 50), proxyData.error);
          }
        } catch (error) {
          console.error('[CustomComponentRenderer] Error proxying URL:', error);
        }
      }

      if (updated) {
        // Update the component with proxied URLs
        updateComponent(component.id, {
          props: {
            ...component.props,
            render: currentHtml,
          }
        });
        console.log('[CustomComponentRenderer] Updated component with proxied URLs');
      }
    };

    // Run proxy immediately (not delayed) to avoid CORS issues on first render
    proxyExternalUrls();
  }, [component.id, renderCode, isThumbnail, updateComponent, component.props]);

  // Reset state when slide changes
  useEffect(() => {
    if (!isThumbnail && currentSlideIndex !== lastSlideIndexRef.current) {
      clearState();
      lastSlideIndexRef.current = currentSlideIndex;
    }
  }, [currentSlideIndex, isThumbnail, clearState]);

  // Compile render function synchronously to prevent initial flash
  const { compiledRender, compilationError } = useMemo(() => {
    if (!renderCode) {
      return { compiledRender: null, compilationError: new Error('No render function provided') };
    }

    // CRITICAL: Unescape the code FIRST before any detection
    // The stored code may have escaped newlines (\n as literal backslash-n)
    let code = renderCode as string;
    if (code.includes('\\n') || code.includes('\\t') || code.includes('\\"') || code.includes("\\'")) {
      code = code
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\');
    }

    // ADAPTIVE FORMAT DETECTION: Handle multiple formats from AI
    const trimmedCode = code.trim();

    // 0. IFRAME MODE: Check for Full HTML Document
    // This allows "do whatever we want" - Tailwind, CDNs, full isolation
    if (trimmedCode.toLowerCase().startsWith('<!doctype html') || trimmedCode.toLowerCase().startsWith('<html')) {
      // Ensure proper newlines in HTML (fixes iframe rendering issues)
      const formattedHtml = ensureHtmlNewlines(code);

      // Return the base HTML - prop injection happens separately in stableIframeSrcDoc
      return {
        compiledRender: { __isIframe: true, srcDoc: formattedHtml, needsPropInjection: true } as any,
        compilationError: null
      };
    }

    // 0b. IFRAME MODE for render functions that return HTML strings
    // Much cleaner than React.createElement - AI generates readable HTML/CSS
    if (trimmedCode.startsWith('function render(') || trimmedCode.startsWith('function render (')) {
      console.log('[CustomComponent] Detected render function, executing in IFRAME sandbox');

      const iframeFunctionRenderer = function ({ props, state, id, isThumbnail, containerWidth, containerHeight }: any) {
        // Safely serialize props, filtering out functions and circular refs
        const safeStringify = (obj: any): string => {
          try {
            return JSON.stringify(obj, (key, value) => {
              if (typeof value === 'function') return undefined;
              return value;
            }) || '{}';
          } catch {
            return '{}';
          }
        };

        // Build HTML document that executes the render function
        // The render function returns an HTML string, not React elements
        const htmlDoc = [
          '<!DOCTYPE html>',
          '<html>',
          '<head>',
          '  <meta charset="UTF-8">',
          '  <style>',
          '    * { margin: 0; padding: 0; box-sizing: border-box; }',
          '    html, body { width: 100%; height: 100%; overflow: hidden; }',
          '    body { font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }',
          '  </style>',
          '  <link rel="preconnect" href="https://fonts.googleapis.com">',
          '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
          '  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Poppins:wght@100..900&family=Playfair+Display:wght@400..900&family=Space+Grotesk:wght@300..700&display=swap" rel="stylesheet">',
          '</head>',
          '<body>',
          '  <script>',
          '    (function() {',
          '      try {',
          '        // Props passed from parent',
          '        var props = ' + safeStringify(props || {}) + ';',
          '        var state = ' + safeStringify(state || {}) + ';',
          '        var id = ' + JSON.stringify(id || '') + ';',
          '        var isThumbnail = ' + JSON.stringify(!!isThumbnail) + ';',
          '        var containerWidth = ' + JSON.stringify(containerWidth || 800) + ';',
          '        var containerHeight = ' + JSON.stringify(containerHeight || 600) + ';',
          '        var updateState = function() {};',
          '',
          '        // Component render function (returns HTML string)',
          '        ' + code,
          '',
          '        // Call render and inject HTML',
          '        var html = render({ props, state, updateState, id, isThumbnail, containerWidth, containerHeight });',
          '        document.body.innerHTML = html;',
          '      } catch (err) {',
          '        document.body.innerHTML = \'<div style="color: #dc2626; padding: 20px; font-family: monospace; background: #fef2f2; height: 100%; box-sizing: border-box;">\' +',
          '          \'<strong>Error:</strong> \' + (err.message || err) + \'</div>\';',
          '        console.error("[iframe] Render error:", err);',
          '      }',
          '    })();',
          '  </script>',
          '</body>',
          '</html>'
        ].join('\n');

        return React.createElement('iframe', {
          srcDoc: htmlDoc,
          style: { width: '100%', height: '100%', border: 'none', backgroundColor: 'transparent' },
          sandbox: "allow-scripts allow-same-origin",
          title: "Custom Component"
        });
      };

      return { compiledRender: iframeFunctionRenderer as Function, compilationError: null };
    }

    // 1. Check if it's raw HTML fragment (starts with <tag or just contains HTML)
    if (trimmedCode.startsWith('<') && trimmedCode.includes('>') && !trimmedCode.includes('function render')) {
      // Check for template variables like {icon}, {category}, etc.
      const hasTemplateVars = /\{[a-zA-Z_][a-zA-Z0-9_]*\}/g.test(trimmedCode);

      if (hasTemplateVars) {
        console.warn('[CustomComponent] Detected HTML with template variables - INVALID!', {
          preview: trimmedCode.substring(0, 200),
          variables: trimmedCode.match(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g)
        });
        return {
          compiledRender: null,
          compilationError: new Error('HTML contains template variables like {icon}, {category}. Must use function format with props instead.')
        };
      }

      console.log('[CustomComponent] Detected raw HTML format, converting to React');
      // Return a function that renders the HTML using dangerouslySetInnerHTML
      const htmlRenderer = function ({ props }: any) {
        return React.createElement('div', {
          style: {
            width: '100%',
            height: '100%'
          },
          dangerouslySetInnerHTML: { __html: code }
        });
      };
      return { compiledRender: htmlRenderer as Function, compilationError: null };
    }

    // 2. Allow providing a render function directly instead of a string
    if (typeof renderCode === 'function') {
      const originalRender = renderCode as Function;
      const wrapped = function wrappedRender() {
        try {
          // @ts-ignore
          return originalRender.apply(this, arguments);
        } catch (err: any) {
          // If React is not defined in the function scope, define it globally and retry once
          if (err instanceof ReferenceError && typeof err.message === 'string' && /React is not defined/.test(err.message)) {
            try {
              // @ts-ignore
              const g = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});
              // @ts-ignore
              if (!g.React) g.React = React;
            } catch (_) { /* noop */ }
            try {
              // @ts-ignore
              return originalRender.apply(this, arguments);
            } catch (err2) {
              throw err2;
            }
          }
          throw err;
        }
      } as unknown as Function;
      return { compiledRender: wrapped, compilationError: null };
    }

    // Use already-unescaped code from above
    let unescapedCode = code;

    // Harden: ensure raw newlines inside quoted string literals are converted to \n
    unescapedCode = escapeRawNewlinesInStringLiterals(unescapedCode);

    // FIX BRACKET MISMATCHES: AI sometimes generates extra closing parens/braces
    // Detect and auto-fix before compilation to prevent SyntaxError
    try {
      let parenDepth = 0;
      let braceDepth = 0;
      let inString = false;
      let stringChar: string | null = null;
      let escapeNext = false;

      for (let i = 0; i < unescapedCode.length; i++) {
        const ch = unescapedCode[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        if (ch === '\\') {
          escapeNext = true;
          continue;
        }
        if (ch === '"' || ch === "'") {
          if (!inString) {
            inString = true;
            stringChar = ch;
          } else if (ch === stringChar) {
            inString = false;
            stringChar = null;
          }
          continue;
        }

        if (inString) continue;

        if (ch === '(') {
          parenDepth++;
        } else if (ch === ')') {
          parenDepth--;
          if (parenDepth < 0) {
            // Extra closing paren - remove it
            console.warn('[CustomComponent] Removing extra closing paren at position', i);
            unescapedCode = unescapedCode.slice(0, i) + unescapedCode.slice(i + 1);
            i--; // Re-check from same position
            parenDepth = 0;
          }
        } else if (ch === '{') {
          braceDepth++;
        } else if (ch === '}') {
          braceDepth--;
          if (braceDepth < 0) {
            // Extra closing brace - remove it
            console.warn('[CustomComponent] Removing extra closing brace at position', i);
            unescapedCode = unescapedCode.slice(0, i) + unescapedCode.slice(i + 1);
            i--;
            braceDepth = 0;
          }
        }
      }

      // Add missing closing brackets at the end if needed
      if (parenDepth > 0) {
        console.warn('[CustomComponent] Adding', parenDepth, 'missing closing parens');
        unescapedCode += ')'.repeat(parenDepth);
      }
      if (braceDepth > 0) {
        console.warn('[CustomComponent] Adding', braceDepth, 'missing closing braces');
        unescapedCode += '}'.repeat(braceDepth);
      }
    } catch (err) {
      console.warn('[CustomComponent] Bracket fix failed:', err);
    }

    // Note: Do NOT escape backticks. User code may legitimately use template literals,
    // and since we inject via string interpolation, backticks inside the injected
    // code do not interfere with this wrapper template.

    // Sanitize: remove duplicate top-level const/let/var declarations of the same identifier
    (function () {
      try {
        const lines = unescapedCode.split('\n');
        const seen = new Set();
        const decl = /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/;
        const result = [] as string[];
        for (const line of lines) {
          const m = line.match(decl);
          if (m) {
            const name = m[1];
            if (seen.has(name)) {
              // Skip duplicate declaration line
              continue;
            }
            seen.add(name);
          }
          result.push(line);
        }
        unescapedCode = result.join('\n');
      } catch (_) { /* noop */ }
    })();

    // Sanitize: convert React.createElement('style', {...}, 'multiline css') to dangerouslySetInnerHTML with escaped newlines
    try {
      unescapedCode = unescapedCode.replace(/React\.createElement\(\s*['"]style['"]\s*,\s*\{([\s\S]*?)\}\s*,\s*(['"])([\s\S]*?)\2\s*\)/g,
        function (_match, attrs, _quote, css) {
          try {
            const escaped = css
              .replace(/\\/g, '\\\\')
              .replace(/'/g, "\\'")
              .replace(/\r?\n/g, '\\n');
            const attrsTrim = attrs.trim();
            const attrsWithComma = attrsTrim ? attrsTrim + ', ' : '';
            return "React.createElement('style', { " + attrsWithComma + "dangerouslySetInnerHTML: { __html: '" + escaped + "' } })";
          } catch (_) {
            return _match;
          }
        }
      );
    } catch (_) { /* noop */ }

    // Remove brittle spread-conditional normalization (it could corrupt user code). Kept intentionally no-op.

    // Normalize the render function signature to a canonical form to avoid malformed params.
    // 1. Handle function render(context) pattern - convert to destructured format
    try {
      // Check if it's the context pattern with var props = context.props extraction
      if (/function\s+render\s*\(\s*context\s*\)/.test(unescapedCode)) {
        // Remove the context parameter and var props extraction line
        unescapedCode = unescapedCode.replace(
          /function\s+render\s*\(\s*context\s*\)/,
          'function render({ props, state, updateState, id, isThumbnail, containerWidth, containerHeight })'
        );
        // Remove the var props = context.props; line if it exists
        unescapedCode = unescapedCode.replace(
          /\s*(var|let|const)\s+props\s*=\s*context\.props\s*;/g,
          ''
        );
      }
    } catch (_) { /* noop */ }

    // 2. Repair malformed parameter blocks that accidentally contain code (e.g., "function render({ const padding = 24; props }){ ... }")
    //    Strategy: detect the render signature, extract everything between the first '(' and matching ')'.
    //    If the parameter block contains semicolons, 'const', 'let', 'var', or assignment operators that are not part of an object pattern,
    //    move those lines into a prelude inserted at the top of the function body, and clean the parameter list to the canonical shape.
    try {
      const renderSigPattern = /function\s+render\s*\(([^)]*)\)\s*\{/m;
      const sigMatch = unescapedCode.match(renderSigPattern);
      if (sigMatch) {
        const rawParams = sigMatch[1] || '';
        const suspicious = /\b(const|let|var)\b|;|=/.test(rawParams) && !/\{\s*props\s*(?:,[^}]*)?\}/.test(rawParams);
        if (suspicious) {
          // Extract any code-ish fragments to move into body prelude
          const preludeLines: string[] = [];
          // Grab things like "const x = ...;", "let x=...;", "var x=...;", and plain assignments "x = ...;"
          const declRegex = /(const|let|var)\s+[^;]+;?/g;
          let m: RegExpExecArray | null;
          while ((m = declRegex.exec(rawParams)) !== null) {
            preludeLines.push(m[0].trim().replace(/^(?:const|let)\s+/, 'var ').replace(/;+$/, ';'));
          }
          // Also capture bare assignments separated by semicolons
          rawParams.split(';').forEach(seg => {
            const s = seg.trim();
            if (!s) return;
            if (!/^(const|let|var)\b/.test(s) && /\w\s*=/.test(s)) {
              preludeLines.push(s.replace(/;+$/, '') + ';');
            }
          });

          // Replace the entire signature with canonical signature
          unescapedCode = unescapedCode.replace(renderSigPattern, (_all) => {
            return 'function render({ props, state, updateState, id, isThumbnail, containerWidth, containerHeight }) {';
          });

          // Insert prelude at the start of the function body right after opening brace
          if (preludeLines.length > 0) {
            unescapedCode = unescapedCode.replace(/function\s+render\s*\(\{[\s\S]*?\}\)\s*\{/, (hdr) => {
              const prelude = '\n  ' + preludeLines.join('\n  ') + '\n';
              return hdr + prelude;
            });
          }
        }
      }
    } catch (_) { /* noop */ }

    // 3. Accept trailing parameters after the destructured object (e.g., ", instanceId", ", containerWidth, containerHeight").
    try {
      unescapedCode = unescapedCode.replace(
        /function\s+render\s*\(\{[\s\S]*?\}\s*(?:,[^)]*)?\)/,
        'function render({ props, state, updateState, id, isThumbnail, containerWidth, containerHeight })'
      );
    } catch (_) { /* noop */ }

    try {
      if (code.includes('import ') || code.includes('require(')) {
        throw new Error('Imports are not allowed in custom components');
      }

      const funcBody = `
        'use strict';
        function processReactElement(element) {
          if (!element || typeof element !== 'object') return element;
          if (typeof element === 'string' && element.includes('\\n')) {
            const lines = element.split('\\n');
            return lines.reduce((acc, line, index) => {
              if (index > 0) acc.push(React.createElement('br', { key: 'br-' + index }));
              if (line) acc.push(line);
              return acc;
            }, []);
          }
          if (React.isValidElement(element)) {
            var props = element.props || {};
            var children = props.children;
            var style = props.style;

            // CRITICAL FIX: Preserve ALL props including event handlers (onClick, onChange, etc.)
            // Previously was stripping out important handlers by only copying specific props
            var otherProps = {};
            for (var key in props) {
              if (key !== 'children' && key !== 'style' && Object.prototype.hasOwnProperty.call(props, key)) {
                otherProps[key] = props[key];
              }
            }

            var newStyle = style;
            if (children && typeof children === 'string' && children.includes('\\n')) {
              newStyle = Object.assign({}, style || {}, { whiteSpace: 'pre-line' });
            }

            // CRITICAL FIX: Only process children if they're strings with newlines
            // Don't recursively clone React elements as it breaks event handlers and refs
            var processedChildren = children;
            if (children) {
              if (Array.isArray(children)) {
                // Map array children but only process strings
                processedChildren = children.map(function (child) {
                  return (typeof child === 'string' && child.includes('\\n')) ? processReactElement(child) : child;
                });
              } else if (typeof children === 'string' && children.includes('\\n') && !(newStyle && newStyle.whiteSpace)) {
                var lines = children.split('\\n');
                processedChildren = lines.reduce(function (acc, line, index) {
                  if (index > 0) acc.push(React.createElement('br', { key: 'br-' + index }));
                  if (line) acc.push(line);
                  return acc;
                }, []);
              }
              // Don't recursively process React elements - preserve them as-is
            }

            // Only clone if we actually modified the style or children
            if (newStyle !== style || processedChildren !== children) {
              return React.cloneElement(element, Object.assign({}, otherProps, { style: newStyle }), processedChildren);
            }
            return element;
          }
          if (Array.isArray(element)) return element.map((item) => processReactElement(item));
          return element;
        }
        try {
          ${unescapedCode}
          if (typeof render !== 'function') {
            throw new Error('Component must define a "render" function');
          }
          const originalRender = render;
          return function wrappedRender() {
            // Attempt call and auto-fill undefined variables up to a few retries
            var lastError = null;
            // Provide sane defaults for common variable names
            var __defaultVarValues = { barHeight: 24, spacing: 12, topMargin: 0, rayCount: 12, itemHeight: 56, itemSpacing: 12, iconSize: 48 };
            for (var __attempt = 0; __attempt < 5; __attempt++) {
              try {
                const result = originalRender.apply(this, arguments);
                return processReactElement(result);
              } catch (err) {
                lastError = err;
                if (err instanceof ReferenceError) {
                  const msg = String(err && err.message ? err.message : '');
                  const m = msg.match(/(\\w+) is not defined/);
                  if (m) {
                    const varName = m[1];
                    // Pull candidate from props if available, else use known defaults, else 0
                    const args0 = (arguments && arguments[0]) || {};
                    const p = (args0.props || {});
                    var value = (p && Object.prototype.hasOwnProperty.call(p, varName)) ? p[varName] : undefined;
                    if (typeof value === 'undefined') value = (__defaultVarValues[varName] !== undefined) ? __defaultVarValues[varName] : 0;
                    try {
                      var g = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : {});
                      if (!(varName in g)) {
                        try { Object.defineProperty(g, varName, { value: value, writable: true, configurable: true }); }
                        catch (_) { g[varName] = value; }
                      }
                    } catch (_) { /* ignore */ }
                    // retry after defining
                    continue;
                  }
                }
                // Non-reference error or no var name; stop retrying
                break;
              }
            }
            if (lastError) throw lastError;
            return null;
          };
        } catch (err) {
          if (err instanceof ReferenceError) {
            const match = err.message.match(/(\\w+) is not defined/);
            if (match) {
              const varName = match[1];
              throw new Error(\`Variable '\${varName}' is not defined. Define it as: const \${varName} = props.\${varName} || defaultValue;\`);
            }
          }
          throw err;
        }
      `;
      // Inject visualization libraries into the sandbox for advanced CustomComponents
      // Security: These libraries are sandboxed within the Function() scope and have no access to parent context
      const compiledFunc = new Function(
        'React',
        'getContrastTextColor',
        'isLightColor',
        'getColorDistance',
        'ensureChartColorsContrastWithBackground',
        'getThemeAppropriateChartColors',
        'd3',        // D3.js for advanced data visualizations
        'anime',     // Anime.js for smooth animations
        'rough',     // Rough.js for hand-drawn aesthetics
        'confetti',  // Canvas-confetti for celebration effects
        'gsap',      // GSAP for professional animations
        funcBody
      );
      const fn = compiledFunc(
        React,
        getContrastTextColor,
        isLightColor,
        getColorDistance,
        ensureChartColorsContrastWithBackground,
        getThemeAppropriateChartColors,
        d3Import,
        animeImport,
        roughImport,
        confettiImport,
        gsapImport
      );
      return { compiledRender: fn, compilationError: null };
    } catch (err) {
      console.error('[CustomComponent] Compilation error:', err);
      console.error('[CustomComponent] Render code:', renderCode.substring(0, 200));
      let errorMessage = (err && err.message) ? err.message : String(err);
      if (typeof errorMessage === 'string' && errorMessage.includes('Invalid or unexpected token')) {
        const lines = unescapedCode.split('\n');
        const errorMatch = errorMessage.match(/at.*:(\d+):(\d+)/);
        if (errorMatch) {
          const lineNum = parseInt(errorMatch[1], 10) - 3;
          if (!Number.isNaN(lineNum) && lineNum >= 0 && lineNum < lines.length) {
            errorMessage = `Syntax error near line ${lineNum + 1}: "${lines[lineNum].trim()}"`;
          }
        } else {
          errorMessage = 'Syntax error in component code. Check for missing quotes, brackets, or invalid JavaScript.';
        }
      }
      return { compiledRender: null, compilationError: new Error(errorMessage) };
    }
  }, [renderCode]);

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

  // Debug logging for interaction issues
  useEffect(() => {
    if (component.props.debug || component.id.includes('custom')) {
      console.log(`[CustomComponent:${component.id}] Interaction Debug:`, {
        effectiveIsEditMode,
        isPresenting,
        isThumbnail,
        isSelected,
        isEditingProp: isEditing,
        baseStylesPointerEvents: baseStyles.pointerEvents,
        computedPointerEvents: isSelected || !effectiveIsEditMode ? 'auto' : 'none'
      });
    }
  }, [effectiveIsEditMode, isPresenting, isThumbnail, isSelected, isEditing, baseStyles.pointerEvents, component.id, component.props.debug]);

  // Ref for the content wrapper
  const contentInnerRef = useRef<HTMLDivElement>(null);

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

    // Inject before </body> or at end
    if (html.includes('</body>')) {
      return html.replace('</body>', clickHandlerScript + '</body>');
    } else if (html.includes('</html>')) {
      return html.replace('</html>', clickHandlerScript + '</html>');
    } else {
      return html + clickHandlerScript;
    }
  };

  // Inject image props into HTML by replacing placeholder src attributes
  const injectImageProps = (html: string, props: Record<string, any>): string => {
    if (!html || !props) return html;

    let result = html;

    // PATTERN 1: Find all img tags with ${propName} in src (AI-generated pattern)
    // Example: <img src="${storeClosingSignImage}" alt="Store closing sign">
    const varSrcRegex = /<img\s+([^>]*?)src=["']\$\{+\s*(\w+)\s*\}+["']([^>]*?)>/gi;

    result = result.replace(varSrcRegex, (match, before, varName, after) => {
      // Check if we have this prop (exact match or with Image suffix)
      const propName = props[varName] ? varName :
                       props[varName + 'Image'] ? varName + 'Image' :
                       props[varName.replace(/Image$/, '')] ? varName.replace(/Image$/, '') : null;

      if (propName && props[propName] && props[propName] !== 'placeholder' && props[propName].startsWith('http')) {
        const newSrc = props[propName];
        console.log(`[CustomComponent] Injecting image from \${${varName}}: ${propName} = ${newSrc.substring(0, 50)}...`);
        return `<img ${before}src="${newSrc}"${after}>`;
      }

      return match;
    });

    // PATTERN 2: Find all img tags with placeholder src and replace with prop values
    // Pattern: <img ... src="placeholder" ... alt="Some Alt Text" ...>
    const imgRegex = /<img\s+([^>]*?)src=["'](?:placeholder|)["']([^>]*?)>/gi;

    result = result.replace(imgRegex, (match, before, after) => {
      // Extract alt attribute to find matching prop
      const altMatch = (before + after).match(/alt=["']([^"']+)["']/i);
      const dataProplMatch = (before + after).match(/data-prop=["']([^"']+)["']/i);

      let propName = dataProplMatch?.[1];

      if (!propName && altMatch) {
        const alt = altMatch[1];
        // Convert alt to camelCase prop name: "Elon Musk Portrait" -> "elonMuskPortraitImage"
        propName = alt
          .replace(/[^a-zA-Z0-9]/g, ' ')
          .split(' ')
          .filter(Boolean)
          .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join('') + 'Image';
      }

      // Check if we have this prop
      if (propName && props[propName] && props[propName] !== 'placeholder' && props[propName].startsWith('http')) {
        const newSrc = props[propName];
        console.log(`[CustomComponent] Injecting image prop: ${propName} = ${newSrc.substring(0, 50)}...`);
        return `<img ${before}src="${newSrc}"${after}>`;
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
      }
    }

    return result;
  };

  // Memoize srcDoc with injected props and click handlers
  const stableIframeSrcDoc = useMemo(() => {
    if (!iframeSrcDoc) return null;

    // First inject image props from component.props.props (the nested props object)
    // componentProps already spreads these, but we need the actual image URLs
    const imageProps = component.props.props || {};
    console.log('[CustomComponent] Injecting props into HTML:', Object.keys(imageProps));
    let html = injectImageProps(iframeSrcDoc, imageProps);

    // Then add click handlers for edit mode
    html = injectImageClickHandlers(html, component.id);

    return html;
  }, [iframeSrcDoc, component.id, isEditing, component.props.props]);

  // Listen for messages from iframe (placeholder image clicks)
  useEffect(() => {
    if (!isIframeComponent || !isEditing) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'customcomponent:image-click' && event.data?.componentId === component.id) {
        console.log('[CustomComponent] Placeholder image clicked:', event.data);

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
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isIframeComponent, isEditing, component.id, component.slideId]);

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

      console.warn('[CustomComponent] Invalid element returned:', element);
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
  const [scale, setScale] = useState(1);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
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
    return () => observer.disconnect();
  }, [containerWidth]);

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
          {isIframeComponent && stableIframeSrcDoc && (
            <iframe
              key={component.id}
              srcDoc={stableIframeSrcDoc}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: 'none',
                backgroundColor: 'transparent',
                display: 'block',
                pointerEvents: isSelected || !effectiveIsEditMode ? 'auto' : 'none' // Allow interaction in view mode or when selected
              }}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              title="Custom Component"
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
                    console.log('[CustomComponent] Select Image clicked:', { propName, searchQuery });
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
      </div>
    </ErrorBoundary>
  );
};

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