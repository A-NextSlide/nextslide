import { useDeckStore } from '@/stores/deckStore';

type OutlinePlaceholderArgs = {
  event: any;
  deckId: string;
  isGenerating: boolean;
  placeholdersCreatedRef: { current: boolean };
};

export const handleOutlineStructureEvent = ({
  event,
  deckId,
  isGenerating,
  placeholdersCreatedRef
}: OutlinePlaceholderArgs): boolean => {
  if (event?.stage !== 'outline_structure') return false;

  // Only create placeholders during slide generation (not outline-only mode).
  if (!isGenerating) {
    console.log('[useSlideGeneration] Skipping placeholder creation - not in slide generation mode');
    return true;
  }

  const slideTitles = event.data?.slideTitles || event.slideTitles;
  const outlineTitle = event.data?.title || event.title;
  if (!slideTitles) return true;

  const currentDeckData = useDeckStore.getState().deckData;

  if (currentDeckData.slides.length === slideTitles.length) {
    const updatedSlides = currentDeckData.slides.map((slide: any, index: number) => ({
      ...slide,
      title: (slideTitles[index] && String(slideTitles[index]).trim()) || slide.title || `Slide ${index + 1}`,
      status: slide.components && slide.components.some((c: any) =>
        c.type !== 'Background' && !c.id?.toLowerCase().includes('background')
      ) ? 'completed' : 'pending'
    }));

    useDeckStore.getState().updateDeckData({
      ...currentDeckData,
      slides: updatedSlides,
      name: outlineTitle || currentDeckData.name
    });
    return true;
  }

  if (placeholdersCreatedRef.current) {
    return true;
  }

  placeholdersCreatedRef.current = true;

  const existingSlides = currentDeckData.slides || [];
  let slidesWithTitles;

  if (existingSlides.length > 0) {
    slidesWithTitles = slideTitles.map((title: string, index: number) => {
      if (index < existingSlides.length) {
        return {
          ...existingSlides[index],
          title: (title && String(title).trim()) || `Slide ${index + 1}`,
          status: existingSlides[index].components?.some((c: any) =>
            c.type !== 'Background' && !c.id?.toLowerCase().includes('background')
          ) ? 'completed' : 'pending' as const,
          isGenerating: true
        };
      }
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
    });
  } else {
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
    titles: slidesWithTitles.map((s: any) => s.title)
  });

  useDeckStore.getState().updateDeckData({
    ...currentDeckData,
    slides: slidesWithTitles,
    name: outlineTitle || currentDeckData.name
  });

  return true;
};
