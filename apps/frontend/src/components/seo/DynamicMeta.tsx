import { useEffect, useRef } from 'react';

interface DynamicMetaProps {
  title: string;
  description: string;
  image?: string;
  url?: string;
  type?: string;
}

/**
 * DynamicMeta - Updates document head meta tags for SEO and social sharing.
 *
 * Since NextSlide is a Vite SPA, meta tags must be set dynamically
 * when route components mount. For crawler/bot support, the backend
 * serves a pre-rendered HTML page with OG tags at /api/public/meta/{code}.
 *
 * This component handles the browser-side updates for:
 * - document.title
 * - Standard meta description
 * - Open Graph tags (og:title, og:description, og:image, og:url, og:type)
 * - Twitter Card tags
 * - Schema.org JSON-LD (PresentationDigitalDocument)
 *
 * All tags are cleaned up on unmount.
 */
export default function DynamicMeta({ title, description, image, url, type = 'article' }: DynamicMetaProps) {
  const prevTitleRef = useRef<string>(document.title);
  const addedTagsRef = useRef<HTMLElement[]>([]);

  useEffect(() => {
    // Store previous title so we can restore it on unmount
    prevTitleRef.current = document.title;

    // Set document title
    document.title = title;

    // Helper: create or update a meta tag
    const setMeta = (attribute: string, key: string, content: string) => {
      let tag = document.querySelector(`meta[${attribute}="${key}"]`) as HTMLMetaElement | null;
      if (tag) {
        tag.setAttribute('content', content);
      } else {
        tag = document.createElement('meta');
        tag.setAttribute(attribute, key);
        tag.setAttribute('content', content);
        document.head.appendChild(tag);
        addedTagsRef.current.push(tag);
      }
    };

    // Standard meta description
    setMeta('name', 'description', description);

    // Open Graph tags
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', type);

    if (url) {
      setMeta('property', 'og:url', url);
    }
    if (image) {
      setMeta('property', 'og:image', image);
      setMeta('property', 'og:image:width', '1200');
      setMeta('property', 'og:image:height', '630');
    }

    setMeta('property', 'og:site_name', 'NextSlide');

    // Twitter Card tags
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    if (image) {
      setMeta('name', 'twitter:image', image);
    }

    // oEmbed discovery link (enables rich embeds in Notion, Medium, WordPress, Slack)
    if (url) {
      const oembedHref = `https://api.nextslide.ai/api/oembed?url=${encodeURIComponent(url)}&format=json`;
      let oembedLink = document.querySelector('link[type="application/json+oembed"]') as HTMLLinkElement | null;
      if (oembedLink) {
        oembedLink.setAttribute('href', oembedHref);
        oembedLink.setAttribute('title', title);
      } else {
        oembedLink = document.createElement('link');
        oembedLink.setAttribute('rel', 'alternate');
        oembedLink.setAttribute('type', 'application/json+oembed');
        oembedLink.setAttribute('href', oembedHref);
        oembedLink.setAttribute('title', title);
        document.head.appendChild(oembedLink);
        addedTagsRef.current.push(oembedLink);
      }
    }

    // Schema.org JSON-LD for PresentationDigitalDocument
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'PresentationDigitalDocument',
      name: title,
      description,
      ...(url ? { url } : {}),
      ...(image ? { thumbnailUrl: image } : {}),
      provider: {
        '@type': 'Organization',
        name: 'NextSlide',
        url: 'https://nextslide.ai',
      },
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(script);
    addedTagsRef.current.push(script);

    // Cleanup on unmount
    return () => {
      document.title = prevTitleRef.current;

      // Remove tags we added (only those we actually created)
      for (const tag of addedTagsRef.current) {
        try {
          tag.parentNode?.removeChild(tag);
        } catch {
          // Silently ignore if already removed
        }
      }
      addedTagsRef.current = [];
    };
  }, [title, description, image, url, type]);

  // This component renders nothing
  return null;
}
