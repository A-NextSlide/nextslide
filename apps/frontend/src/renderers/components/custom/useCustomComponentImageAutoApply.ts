import { useEffect, useRef } from 'react';
import { ComponentInstance } from '@/types/components';
import { DEBUG_CUSTOM_COMPONENT } from './debug';

type UseCustomComponentImageAutoApplyArgs = {
  component: ComponentInstance;
  renderCode: string;
  isEditing: boolean;
  isThumbnail: boolean;
  updateComponent: (id: string, data: Partial<ComponentInstance>) => void;
};

const BAD_SEARCH_TERMS = [
  'image', 'image0', 'image1', 'image2', 'image3',
  'visualization', 'dataname', 'photo', 'picture',
  'graphic', 'visual', 'background', 'chart', 'icon',
  'placeholder', 'img', 'figure', 'illustration'
];

const extractSearchQueryFromPropName = (propName: string): string => {
  let query = propName
    .replace(/Image$|Photo$|Picture$|Src$|Url$|Img$|Thumbnail$|Avatar$|Icon$/i, '')
    .replace(/^(hero|feature|background|banner|main|primary|secondary)/i, '');

  query = query
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .trim();

  const genericTerms = ['hero', 'feature', 'background', 'banner', 'main', 'primary', 'secondary', 'image', 'photo', ''];
  if (genericTerms.includes(query)) {
    return '';
  }

  return query;
};

const extractImagePropsFromJS = (htmlContent: string): Map<string, string> => {
  const propNameToSearchQuery = new Map<string, string>();

  const propPattern1 = /(?:const|let|var)\s+(\w+)\s*=\s*props\??\.(\w*[Ii]mage\w*|\w*[Pp]hoto\w*|\w*[Ll]ogo\w*|\w*[Ii]con\w*|\w*[Aa]vatar\w*|\w*[Bb]anner\w*|\w*[Hh]eadshot\w*)\s*(?:\|\||&&|\?\?)/gi;
  let match;

  while ((match = propPattern1.exec(htmlContent)) !== null) {
    const propName = match[2];
    const searchQuery = extractSearchQueryFromPropName(propName);
    if (searchQuery && searchQuery.length > 2) {
      propNameToSearchQuery.set(propName, searchQuery);
      DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Found image prop from JS:', propName, '->', searchQuery);
    }
  }

  const propPattern2 = /\$\{+\s*(?:props\??\.)?(\w*[Ii]mage\w*|\w*[Pp]hoto\w*|\w*[Ll]ogo\w*|\w*[Ii]con\w*|\w*[Aa]vatar\w*|\w*[Bb]anner\w*|\w*[Hh]eadshot\w*)\s*\}+/gi;

  while ((match = propPattern2.exec(htmlContent)) !== null) {
    const propName = match[1];
    if (!propNameToSearchQuery.has(propName)) {
      const searchQuery = extractSearchQueryFromPropName(propName);
      if (searchQuery && searchQuery.length > 2) {
        propNameToSearchQuery.set(propName, searchQuery);
        DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Found image prop from template:', propName, '->', searchQuery);
      }
    }
  }

  const propPattern3 = /src=["']\$\{+\s*(\w*[Ii]mage\w*|\w*[Pp]hoto\w*|\w*[Ll]ogo\w*|\w*[Aa]vatar\w*)\s*\}+["']/gi;

  while ((match = propPattern3.exec(htmlContent)) !== null) {
    const propName = match[1];
    if (!propNameToSearchQuery.has(propName)) {
      const searchQuery = extractSearchQueryFromPropName(propName);
      if (searchQuery && searchQuery.length > 2) {
        propNameToSearchQuery.set(propName, searchQuery);
        DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Found image prop from src template:', propName, '->', searchQuery);
      }
    }
  }

  return propNameToSearchQuery;
};

const getSlideContext = (html: string) => {
  try {
    const slideContainer = document.querySelector('.slide-container[data-slide-id]');
    const slideTitle = slideContainer?.getAttribute('data-slide-title') || '';

    const titleMatch = html.match(/<(?:h1|h2|h3)[^>]*>([^<]+)</i);
    const htmlTitle = titleMatch ? titleMatch[1].trim() : '';

    return slideTitle || htmlTitle || 'professional business';
  } catch {
    return 'professional business';
  }
};

export const useCustomComponentImageAutoApply = ({
  component,
  renderCode,
  isEditing,
  isThumbnail,
  updateComponent
}: UseCustomComponentImageAutoApplyArgs) => {
  const autoAppliedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isThumbnail) return;
    if (!isEditing) return;

    const html = renderCode;
    if (!html || typeof html !== 'string') return;

    const trimmedHtml = html.trim().toLowerCase();
    if (!trimmedHtml.startsWith('<!doctype html') && !trimmedHtml.startsWith('<html')) return;

    const imagePropSearchQueries = extractImagePropsFromJS(html);
    DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Extracted image props:', Array.from(imagePropSearchQueries.entries()));

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

      const isPlaceholder = !src || src === 'placeholder' || src.includes('placeholder') ||
        (!src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('blob:') && !src.startsWith('//'));

      if (isPlaceholder) {
        const placeholderKey = `${component.id}-${alt || imgIndex}`;

        if (autoAppliedRef.current.has(placeholderKey)) {
          imgIndex++;
          continue;
        }

        let searchQuery = '';
        let matchedPropName = '';

        const srcPropMatch = src.match(/\$\{+\s*(\w+)\s*\}+/);
        if (srcPropMatch) {
          const varName = srcPropMatch[1];
          for (const [propName, query] of imagePropSearchQueries.entries()) {
            if (propName.toLowerCase() === varName.toLowerCase() ||
                propName.toLowerCase().includes(varName.toLowerCase()) ||
                varName.toLowerCase().includes(propName.toLowerCase().replace('image', ''))) {
              searchQuery = query;
              matchedPropName = propName;
              DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Matched img to prop:', varName, '->', propName, '->', searchQuery);
              break;
            }
          }
        }

        if (!searchQuery && imagePropSearchQueries.size > 0) {
          for (const [propName, query] of imagePropSearchQueries.entries()) {
            const altLower = alt.toLowerCase();
            const propLower = propName.toLowerCase().replace('image', '').replace('photo', '');
            if (altLower.includes(propLower) || propLower.includes(altLower.split(' ')[0])) {
              searchQuery = query;
              matchedPropName = propName;
              DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Matched img alt to prop:', alt, '->', propName, '->', searchQuery);
              break;
            }
          }
        }

        if (!searchQuery) {
          searchQuery = alt
            .replace(/[^a-zA-Z0-9\s]/g, ' ')
            .trim()
            .toLowerCase();
        }

        const isBadSearchTerm = !searchQuery ||
          searchQuery.length < 3 ||
          BAD_SEARCH_TERMS.some(bad => searchQuery === bad || searchQuery.startsWith(bad + ' ') || searchQuery.match(new RegExp(`^${bad}\\d*$`)));

        if (isBadSearchTerm) {
          if (imagePropSearchQueries.size > 0) {
            const unusedProps = Array.from(imagePropSearchQueries.entries())
              .filter(([prop]) => !placeholders.some(p => p.propName === prop));
            if (unusedProps.length > 0) {
              const [propName, query] = unusedProps[imgIndex % unusedProps.length] || unusedProps[0];
              searchQuery = query;
              matchedPropName = propName;
              DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Using unused prop for generic img:', propName, '->', searchQuery);
            }
          }

          if (!searchQuery || BAD_SEARCH_TERMS.includes(searchQuery)) {
            const slideContext = getSlideContext(html);
            searchQuery = `${slideContext} professional photo`;
            DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Bad alt text detected, using slide context:', { original: alt, fallback: searchQuery });
          }
        }

        placeholders.push({ alt: alt || 'image', searchQuery, propName: matchedPropName || undefined });
        autoAppliedRef.current.add(placeholderKey);
        imgIndex++;
      }
    }

    if (placeholders.length === 0) return;

    DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Found placeholder images to auto-apply:', placeholders);

    const autoApplyImages = async () => {
      const propsToUpdate: Record<string, string> = {};
      let currentHtml = component.props.render as string;
      let anyReplaced = false;

      for (const { alt, searchQuery, propName } of placeholders) {
        try {
          DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Auto-searching for:', searchQuery, 'propName:', propName);

          const response = await fetch('/api/media/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: searchQuery,
              type: 'images',
              limit: 1
            })
          });

          if (!response.ok) {
            DEBUG_CUSTOM_COMPONENT && console.warn('[CustomComponentRenderer] Image search failed for:', searchQuery);
            continue;
          }

          const data = await response.json();
          const images = data.results || data.images || [];

          if (images.length === 0) {
            DEBUG_CUSTOM_COMPONENT && console.warn('[CustomComponentRenderer] No images found for:', searchQuery);
            continue;
          }

          let imageUrl = images[0].url || images[0].src?.large || images[0].src?.medium || images[0].src?.original;

          if (!imageUrl) {
            DEBUG_CUSTOM_COMPONENT && console.warn('[CustomComponentRenderer] No valid URL in image result');
            continue;
          }

          DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Found image for', searchQuery, ':', imageUrl.substring(0, 60));

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
                DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Proxied URL:', imageUrl.substring(0, 60));
              }
            } catch {
              DEBUG_CUSTOM_COMPONENT && console.warn('[CustomComponentRenderer] Proxy failed, using original URL');
            }
          }

          if (propName) {
            propsToUpdate[propName] = imageUrl;
            DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Will update prop:', propName, '=', imageUrl.substring(0, 50));
          }

          const altLower = alt.toLowerCase();
          let replaced = false;

          currentHtml = currentHtml.replace(/<img([^>]*)>/gi, (imgMatch, attrs) => {
            if (replaced) return imgMatch;

            const imgAltMatch = attrs.match(/alt=["']([^"']*)["']/i);
            const imgAlt = imgAltMatch ? imgAltMatch[1].toLowerCase() : '';
            const imgSrcMatch = attrs.match(/src=["']([^"']*)["']/i);
            const imgSrc = imgSrcMatch ? imgSrcMatch[1] : '';

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
                DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Auto-replaced image src for:', alt || propName);
                return `<img${newAttrs}>`;
              }
              return `<img src="${imageUrl}"${attrs}>`;
            }
            return imgMatch;
          });
        } catch (error) {
          console.error('[CustomComponentRenderer] Error auto-applying image:', error);
        }
      }

      if (anyReplaced || Object.keys(propsToUpdate).length > 0) {
        const currentProps = component.props.props || {};
        const updatedProps = { ...currentProps, ...propsToUpdate };

        DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Updating component with props:', Object.keys(propsToUpdate));

        updateComponent(component.id, {
          props: {
            ...component.props,
            render: currentHtml,
            props: updatedProps
          }
        });
        DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Auto-applied images, updated props:', Object.keys(propsToUpdate));
      }
    };

    const timeoutId = setTimeout(autoApplyImages, 500);

    return () => clearTimeout(timeoutId);
  }, [component.id, renderCode, isThumbnail, isEditing, updateComponent, component.props]);
};
