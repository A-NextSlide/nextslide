import { useDeckStore } from '@/stores/deckStore';
import { ComponentInstance } from '@/types/components';

const isPlaceholderSrc = (src?: string): boolean => {
  if (!src) return true;
  const value = String(src);
  if (!value) return true;
  if (value === 'placeholder') return true;
  if (value.includes('placeholder')) return true;
  return false;
};

const shouldPreserveImage = (existingComp?: ComponentInstance, newComp?: ComponentInstance): boolean => {
  if (!existingComp || !newComp) return false;
  if (existingComp.type !== 'Image' || newComp.type !== 'Image') return false;

  const existingSrc = existingComp.props?.src;
  const newSrc = newComp.props?.src;

  const hasRealImage =
    !!existingSrc &&
    !isPlaceholderSrc(existingSrc) &&
    (existingComp.props?.autoApplied || (existingComp.props as any)?.userSetSrc);

  const newIsPlaceholder = !newSrc || isPlaceholderSrc(newSrc);

  return hasRealImage && newIsPlaceholder;
};

const coerceNumber = (value: any): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/px$/i, '');
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const normalizeComponentGeometry = (component: any): any => {
  const props = component?.props && typeof component.props === 'object' ? { ...component.props } : {};

  const rawPosition = props.position || component?.position;
  const posX = coerceNumber(rawPosition?.x) ?? coerceNumber(props.x) ?? coerceNumber(component?.x);
  const posY = coerceNumber(rawPosition?.y) ?? coerceNumber(props.y) ?? coerceNumber(component?.y);
  if (posX !== undefined || posY !== undefined) {
    props.position = { x: posX ?? 0, y: posY ?? 0 };
  }

  const rawSize = props.size || component?.size;
  let width = coerceNumber(props.width);
  let height = coerceNumber(props.height);
  if (width === undefined && rawSize && typeof rawSize === 'object') {
    width = coerceNumber(rawSize.width);
  }
  if (height === undefined && rawSize && typeof rawSize === 'object') {
    height = coerceNumber(rawSize.height);
  }
  if (width === undefined) width = coerceNumber(component?.width);
  if (height === undefined) height = coerceNumber(component?.height);

  if (width !== undefined) props.width = width;
  if (height !== undefined) props.height = height;
  if (!props.size && width !== undefined && height !== undefined) {
    props.size = { width, height };
  }

  return {
    ...component,
    props,
    position: component?.position || props.position,
    size: component?.size || props.size
  };
};

export const mergeComponentsPreservingImages = (
  existingComponents: ComponentInstance[],
  newComponents: ComponentInstance[]
): ComponentInstance[] => {
  return newComponents.map((newComp, idx) => {
    const existingComp = existingComponents[idx];
    if (shouldPreserveImage(existingComp, newComp)) {
      return {
        ...newComp,
        props: {
          ...newComp.props,
          src: existingComp.props?.src,
          alt: existingComp.props?.alt,
          autoApplied: existingComp.props?.autoApplied,
          userSetSrc: (existingComp.props as any)?.userSetSrc
        }
      } as ComponentInstance;
    }
    return newComp;
  });
};

const buildFallbackSlide = (deckId: string | undefined, index: number) => {
  const id = deckId ? `${deckId}-slide-${index}` : `slide-${Date.now()}-${index}`;
  return {
    id,
    title: `Slide ${index + 1}`,
    components: [],
    order: index,
    deckId,
    status: 'pending' as const,
    isGenerating: true,
    content: ''
  };
};

export const applySlideDataToDeck = (options: {
  deckId?: string;
  slideIndex?: number;
  slideData?: any;
}): { slideId: string; updatedSlide: any } | null => {
  const { deckId, slideIndex, slideData } = options;
  if (slideIndex === undefined || slideIndex === null || !slideData) return null;

  const { deckData, updateDeckData } = useDeckStore.getState();
  const updatedSlides = [...(deckData.slides || [])];

  while (updatedSlides.length <= slideIndex) {
    updatedSlides.push(buildFallbackSlide(deckId, updatedSlides.length));
  }

  const originalId = updatedSlides[slideIndex]?.id;
  const existingComponents = updatedSlides[slideIndex]?.components || [];
  const newComponents = (slideData.components || []).map(normalizeComponentGeometry);
  const mergedComponents = mergeComponentsPreservingImages(existingComponents, newComponents);

  updatedSlides[slideIndex] = {
    ...updatedSlides[slideIndex],
    ...slideData,
    id: originalId,
    components: mergedComponents,
    theme: slideData.theme || (updatedSlides[slideIndex] as any).theme,
    palette: slideData.palette || (updatedSlides[slideIndex] as any).palette,
    status: 'completed' as const,
    isGenerating: false,
    order: slideIndex
  };

  updateDeckData({ slides: updatedSlides });

  return { slideId: originalId, updatedSlide: updatedSlides[slideIndex] };
};

export const extractSlideUpdate = (event: any): { slideIndex: number; slideData: any } | null => {
  if (!event) return null;

  // Direct slide events from backend
  if ((event.type === 'slide_generated' || event.type === 'slide_completed') && event.slide_data) {
    return { slideIndex: event.slide_index, slideData: event.slide_data };
  }

  if ((event.type === 'slide_generated' || event.type === 'slide_completed') && event.slide) {
    return { slideIndex: event.slide_index, slideData: event.slide };
  }

  // Wrapped slide events from GenerationStateManager
  if (event.data?.type === 'slide_generated' && event.data.slide_data) {
    return { slideIndex: event.data.slide_index, slideData: event.data.slide_data };
  }

  if (event.data?.type === 'slide_complete' && event.data.slide) {
    return { slideIndex: event.data.slide_index, slideData: event.data.slide };
  }

  // Legacy processed event shape
  if (event.stage === 'slide_completed' && event.data?.slide) {
    const idx = event.slideIndex ?? event.data.slide_index ?? event.data.slideIndex;
    if (idx !== undefined) {
      return { slideIndex: idx, slideData: event.data.slide };
    }
  }

  return null;
};
