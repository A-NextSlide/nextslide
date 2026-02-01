import DOMPurify from 'dompurify';
import { SlideData } from '@/types/SlideTypes';

interface SlideText {
  slideNumber: number;
  title?: string;
  texts: string[];
}

/**
 * Extract all text content from slides for SEO transcript.
 * Walks ComponentInstance[] and extracts from common text props.
 */
export function extractSlideTexts(slides: SlideData[]): SlideText[] {
  return slides.map((slide, index) => {
    const texts: string[] = [];
    let title: string | undefined;

    for (const component of (slide.components || [])) {
      const props = component.props || {};

      // Extract title (first one found)
      if (!title) {
        const titleVal = (props as any).title || (props as any).heading;
        if (typeof titleVal === 'string' && titleVal.trim()) {
          title = titleVal.trim();
        }
      }

      // Extract text from known props
      for (const key of ['text', 'content', 'subtitle', 'body']) {
        const val = (props as any)[key];
        if (typeof val === 'string' && val.trim()) {
          texts.push(val.trim());
        }
      }

      // Handle HTML content (CustomComponent) - strip tags
      const htmlVal = (props as any).html;
      if (typeof htmlVal === 'string' && htmlVal) {
        const stripped = stripHtml(htmlVal);
        if (stripped) texts.push(stripped);
      }

      // Handle bullet points / list items
      const items = (props as any).items || (props as any).bullets || (props as any).listItems;
      if (Array.isArray(items)) {
        for (const item of items) {
          if (typeof item === 'string' && item.trim()) texts.push(item.trim());
          if (typeof item === 'object' && item?.text) texts.push(item.text);
        }
      }
    }

    return { slideNumber: index + 1, title, texts };
  });
}

function stripHtml(html: string): string {
  // Remove style and script blocks entirely
  let clean = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  clean = clean.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  // Remove all HTML tags
  clean = clean.replace(/<[^>]+>/g, ' ');
  // Collapse whitespace
  clean = clean.replace(/\s+/g, ' ').trim();
  // Decode common HTML entities
  const textarea = typeof document !== 'undefined' ? document.createElement('textarea') : null;
  if (textarea) {
    textarea.innerHTML = DOMPurify.sanitize(clean);
    clean = textarea.value;
  }
  return clean;
}

/**
 * Get a plain text summary from all slides (for meta description).
 */
export function getSlideSummary(slides: SlideData[], maxLength: number = 160): string {
  const allTexts = extractSlideTexts(slides);
  const combined = allTexts
    .flatMap(s => [s.title, ...s.texts].filter(Boolean))
    .join(' ');

  if (!combined) return '';
  if (combined.length <= maxLength) return combined;
  return combined.slice(0, maxLength - 3).replace(/\s+\S*$/, '') + '...';
}
