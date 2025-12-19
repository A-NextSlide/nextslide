import { useEffect, useRef } from 'react';
import { ComponentInstance } from '@/types/components';
import { DEBUG_CUSTOM_COMPONENT } from './debug';

type UseCustomComponentImageProxyArgs = {
  component: ComponentInstance;
  renderCode: string;
  isEditing: boolean;
  isThumbnail: boolean;
  updateComponent: (id: string, data: Partial<ComponentInstance>) => void;
};

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

export const useCustomComponentImageProxy = ({
  component,
  renderCode,
  isEditing,
  isThumbnail,
  updateComponent
}: UseCustomComponentImageProxyArgs) => {
  const proxiedUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isThumbnail) return;
    if (!isEditing) return;

    const html = renderCode;
    if (!html || typeof html !== 'string') return;

    const trimmedHtml = html.trim().toLowerCase();
    if (!trimmedHtml.startsWith('<!doctype html') && !trimmedHtml.startsWith('<html')) return;

    const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
    const externalUrls: Array<{ originalUrl: string; decodedUrl: string; fullMatch: string }> = [];
    let match;

    while ((match = imgRegex.exec(html)) !== null) {
      const rawSrc = match[1];
      const src = decodeHtmlEntities(rawSrc);

      const isExternalUrl = src.startsWith('http') &&
        !src.includes('supabase') &&
        !src.includes('nextslide') &&
        !src.includes('localhost') &&
        !proxiedUrlsRef.current.has(src);

      if (isExternalUrl) {
        externalUrls.push({ originalUrl: rawSrc, decodedUrl: src, fullMatch: match[0] });
        proxiedUrlsRef.current.add(src);
        DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Found external URL to proxy:', src.substring(0, 80));
      }
    }

    if (externalUrls.length === 0) return;

    DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] External URLs to proxy:', externalUrls.length);

    const proxyExternalUrls = async () => {
      let currentHtml = component.props.render as string;
      let updated = false;

      for (const { originalUrl, decodedUrl } of externalUrls) {
        try {
          DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Proxying:', decodedUrl.substring(0, 80));

          const proxyResponse = await fetch('/api/media/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: decodedUrl })
          });

          const proxyData = await proxyResponse.json();

          if (proxyResponse.ok && proxyData.success && proxyData.url) {
            const proxiedUrl = proxyData.url;
            DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Proxied to:', proxiedUrl.substring(0, 60));

            if (currentHtml.includes(originalUrl)) {
              currentHtml = currentHtml.split(originalUrl).join(proxiedUrl);
              updated = true;
              DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Replaced original URL in HTML');
            }
            if (currentHtml.includes(decodedUrl)) {
              currentHtml = currentHtml.split(decodedUrl).join(proxiedUrl);
              updated = true;
              DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Replaced decoded URL in HTML');
            }
          } else {
            DEBUG_CUSTOM_COMPONENT && console.warn('[CustomComponentRenderer] Proxy failed for:', decodedUrl.substring(0, 50), proxyData.error);
          }
        } catch (error) {
          console.error('[CustomComponentRenderer] Error proxying URL:', error);
        }
      }

      if (updated) {
        updateComponent(component.id, {
          props: {
            ...component.props,
            render: currentHtml
          }
        });
        DEBUG_CUSTOM_COMPONENT && console.log('[CustomComponentRenderer] Updated component with proxied URLs');
      }
    };

    proxyExternalUrls();
  }, [component.id, renderCode, isThumbnail, isEditing, updateComponent, component.props]);
};
