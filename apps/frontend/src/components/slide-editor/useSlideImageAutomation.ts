import { useEffect, useRef } from 'react';
import { DeckStatus, CompleteDeckData } from '@/types/DeckTypes';
import { SlideImageUpdater } from '@/utils/slideImageUpdater';
import { useDeckStore } from '@/stores/deckStore';
import { API_CONFIG } from '@/config/environment';

type UseSlideImageAutomationArgs = {
  deckData: CompleteDeckData;
  deckStatus: DeckStatus | null;
};

export const useSlideImageAutomation = ({ deckData, deckStatus }: UseSlideImageAutomationArgs) => {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const existingPref = (window as any).__slideGenerationPreferences?.autoSelectImages;
      const outlinePref = deckData.data?.outline?.stylePreferences?.autoSelectImages;

      if (existingPref === undefined && outlinePref !== undefined) {
        (window as any).__slideGenerationPreferences = {
          ...(window as any).__slideGenerationPreferences,
          autoSelectImages: outlinePref
        };
      }
    }
  }, [deckData.data?.outline?.stylePreferences?.autoSelectImages]);

  const applyingImagesRef = useRef(false);
  const lastAppliedSlidesLengthRef = useRef(0);

  useEffect(() => {
    if (applyingImagesRef.current || deckData.slides.length === lastAppliedSlidesLengthRef.current) {
      return;
    }

    if (deckData.slides.length > 0) {
      const autoSelectImages = (window as any).__slideGenerationPreferences?.autoSelectImages !== false;
      if (autoSelectImages) {
        const imageUpdater = SlideImageUpdater.getInstance();

        applyingImagesRef.current = true;
        lastAppliedSlidesLengthRef.current = deckData.slides.length;

        setTimeout(async () => {
          try {
            await imageUpdater.applyAllCachedImages();
          } finally {
            setTimeout(() => {
              applyingImagesRef.current = false;
            }, 2000);
          }
        }, 500);
      }
    }
  }, [deckData.slides.length, deckStatus?.state]);

  useEffect(() => {
    if (deckData.slides.length === 0) return;

    const autoSelectImages = (window as any).__slideGenerationPreferences?.autoSelectImages !== false;
    if (!autoSelectImages) return;

    if (applyingImagesRef.current) return;

    const hasPlaceholderImages = deckData.slides.some(slide =>
      slide.components?.some((c: any) => {
        if (c.type !== 'Image') return false;
        const src = c.props?.src || '';
        return !src || src === 'placeholder' || src === '/placeholder.svg';
      })
    );

    if (!hasPlaceholderImages) return;

    const imageUpdater = SlideImageUpdater.getInstance();

    const timeoutId = setTimeout(async () => {
      applyingImagesRef.current = true;
      try {
        await imageUpdater.applyAllCachedImages();
      } finally {
        setTimeout(() => {
          applyingImagesRef.current = false;
        }, 2000);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [deckData.data?.outline?.stylePreferences?.autoSelectImages, deckData.slides.length]);

  useEffect(() => {
    const handleImagesAvailable = (event: CustomEvent) => {
      console.log('[SlideEditor] slide_images_available event received:', event.detail);

      if (applyingImagesRef.current) {
        console.log('[SlideEditor] Already applying images, skipping to prevent loop');
        return;
      }

      const autoSelectImages = (window as any).__slideGenerationPreferences?.autoSelectImages !== false;
      if (autoSelectImages) {
        console.log('[SlideEditor] Auto-select is ENABLED - ignoring slide_images_available event (using new immediate application system)');
        return;
      }

      console.log('[SlideEditor] Auto-select is DISABLED - these images are for manual selection');
    };

    window.addEventListener('slide_images_available', handleImagesAvailable as EventListener);

    return () => {
      window.removeEventListener('slide_images_available', handleImagesAvailable as EventListener);
    };
  }, []);

  useEffect(() => {
    const generatePromptForSlide = (slideTitle: string): string => {
      try {
        const stylePrefs = (deckData as any)?.data?.outline?.stylePreferences || (deckData as any)?.outline?.stylePreferences || {};
        const parts: string[] = [];
        parts.push(`Create a compelling image for slide: "${slideTitle}"`);
        if (stylePrefs.vibeContext) parts.push(`Visual vibe: ${stylePrefs.vibeContext}`);
        if (stylePrefs.colors) {
          const c = stylePrefs.colors;
          parts.push(`Prefer palette hints: background ${c.background || ''}, text ${c.text || ''}, accent ${c.accent1 || ''}`);
        }
        return parts.filter(Boolean).join('. ');
      } catch {
        return `Create an image for slide: "${slideTitle}"`;
      }
    };

    const handleSlideCompleted = async (e: CustomEvent) => {
      try {
        const autoSelect = (window as any).__slideGenerationPreferences?.autoSelectImages === true;
        if (!autoSelect) return;
        const slideIndex: number | undefined = e.detail?.slideIndex;
        if (typeof slideIndex !== 'number') return;
        const slide = useDeckStore.getState().deckData?.slides?.[slideIndex];
        if (!slide) return;

        const title = slide.title || `Slide ${slideIndex + 1}`;
        const prompt = generatePromptForSlide(title);
        const deckTheme = (deckData as any)?.theme || (deckData as any)?.data?.theme || (deckData as any)?.workspaceTheme || undefined;

        const resp = await fetch(`${API_CONFIG.BASE_URL}/images/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            slideContext: { title, content: '', theme: null },
            style: 'photorealistic',
            aspectRatio: '16:9',
            deckTheme
          })
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const url: string | undefined = data?.url;
        if (!url) return;

        const slideId = slide.id;
        (window as any).__slideImageCache = (window as any).__slideImageCache || {};
        (window as any).__slideImageCache[`slide_index_${slideIndex}`] = {
          slideId,
          slideIndex,
          images: [{ url, alt: title }],
          images_by_topic: {},
          topics: []
        };
        window.dispatchEvent(new CustomEvent('slide_images_available', {
          detail: {
            slideId,
            slideIndex,
            images: [{ url, alt: title }]
          }
        }));
      } catch {
        // Silent fail; user can still pick images manually
      }
    };

    window.addEventListener('slide_completed', handleSlideCompleted as EventListener);
    return () => window.removeEventListener('slide_completed', handleSlideCompleted as EventListener);
  }, [deckData]);
};
