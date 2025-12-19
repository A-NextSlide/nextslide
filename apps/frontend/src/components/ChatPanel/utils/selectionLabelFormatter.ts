import { useDeckStore } from '@/stores/deckStore';

export function formatSelectionLabel(rawLabel: string): string {
  try {
    const label = String(rawLabel || '').trim();
    if (!label) return 'selection';

    const deckData = (useDeckStore as any).getState().deckData;
    const rawSlides = Array.isArray(deckData?.slides) ? deckData.slides : [];
    const slidesArr = [...rawSlides].sort((a: any, b: any) => (a?.order ?? 0) - (b?.order ?? 0));

    const formatSlide = (slideIndex: number) => {
      const s = slidesArr[slideIndex];
      const slideNumber = slideIndex + 1;
      const hasTitle = typeof s?.title === 'string' && s.title.trim().length > 0;
      return hasTitle ? `Slide ${slideNumber} — ${s.title.trim()}` : `Slide ${slideNumber}`;
    };

    const slideIdMatch = label.match(/\bslide-(\d+)\b/i);
    if (slideIdMatch) {
      const slideId = slideIdMatch[0].toLowerCase();
      const slideIndex = slidesArr.findIndex((s: any) => s?.id?.toLowerCase() === slideId);
      if (slideIndex >= 0) {
        return formatSlide(slideIndex);
      }
    }

    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig;
    const matches = label.match(uuidRegex) || [];

    for (const id of matches) {
      const slideIndex = slidesArr.findIndex((s: any) => s?.id === id);
      if (slideIndex >= 0) {
        return formatSlide(slideIndex);
      }
    }

    for (const id of matches) {
      let found: any = null;
      let slideIndex = -1;
      for (let i = 0; i < slidesArr.length; i++) {
        const comps = Array.isArray(slidesArr[i]?.components) ? slidesArr[i].components : [];
        const comp = comps.find((c: any) => c?.id === id);
        if (comp) {
          found = comp;
          slideIndex = i;
          break;
        }
      }
      if (found) {
        const typeMap: Record<string, string> = {
          TiptapTextBlock: 'Text',
          TextBlock: 'Text',
          Shape: 'Shape',
          ShapeWithText: 'Shape',
          Image: 'Image',
          Logo: 'Logo',
          Icon: 'Icon',
          Chart: 'Chart',
          Table: 'Table',
          Video: 'Video',
        };
        const typeName = typeMap[found.type] || found.type || 'Element';
        return `${typeName} on ${formatSlide(slideIndex)}`;
      }
    }

    for (let i = 0; i < slidesArr.length; i++) {
      const s = slidesArr[i];
      if (s?.id) {
        const idRegex = new RegExp(`\\b${s.id.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i');
        if (idRegex.test(label)) {
          return formatSlide(i);
        }
      }
    }

    const cleaned = label
      .replace(uuidRegex, '')
      .replace(/\s*@\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length > 0 && cleaned.length <= 100) return cleaned;
    return 'selection';
  } catch {
    return 'selection';
  }
}

export function humanizeSystemPhrases(inputText: string): string {
  try {
    const text = String(inputText ?? '');
    if (!text) return text;
    return text.replace(/Using selection:\s*([^\n]+)/g, (_m, raw) => {
      const friendly = formatSelectionLabel(String(raw || ''));
      return `Using selection: ${friendly}`;
    });
  } catch {
    return String(inputText ?? '');
  }
}
