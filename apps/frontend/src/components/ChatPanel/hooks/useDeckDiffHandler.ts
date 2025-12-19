import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { applyDeckDiffPure } from '@/utils/deckDiffUtils';
import { useDeckStore } from '@/stores/deckStore';
import { useEditorStore } from '@/stores/editorStore';
import type { DeckDiff } from '@/utils/apiUtils';

interface UseDeckDiffHandlerOptions {
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
}

export function useDeckDiffHandler({ setIsGenerating }: UseDeckDiffHandlerOptions) {
  const applyDeckDiffRespectingEditMode = useCallback((deckDiff: DeckDiff, isEditDiff = false) => {
    if (!deckDiff) {
      return;
    }

    try {
      const deckData = (useDeckStore as any).getState().deckData;
      const allCompleted = Array.isArray(deckData?.slides) && deckData.slides.length > 0 && deckData.slides.every((s: any) => s.status === 'completed');
      if (allCompleted && !isEditDiff) {
        setIsGenerating(false);
        return;
      }
    } catch { }

    const isEditing = typeof window !== 'undefined' && (window as any).__isEditMode === true;

    if (isEditing) {
      try {
        const interacting = (typeof window !== 'undefined') && (
          (window as any).__isDragging === true ||
          (window as any).__isDraggingCharts === true ||
          (window as any).__isResizingCharts === true
        );
        if (interacting) {
          return;
        }
      } catch { }
      try {
        const editorStore = useEditorStore.getState();
        const slidesToUpdate = (deckDiff as any).slides_to_update || [];
        const slidesToAdd = (deckDiff as any).slides_to_add || [];
        const slidesToRemove = (deckDiff as any).slides_to_remove || [];

        slidesToUpdate.forEach((slideDiff: any) => {
          const slideId = slideDiff?.slide_id;
          if (!slideId) return;

          (slideDiff.components_to_remove || []).forEach((compId: string) => {
            editorStore.removeDraftComponent(slideId, compId, true);
          });

          if (!isEditDiff) {
            try {
              const hasLocal = typeof editorStore.hasSlideChanged === 'function' && editorStore.hasSlideChanged(slideId);
              if (hasLocal) {
                return;
              }
            } catch { }
          }

          let needsDraftResync = false;
          (slideDiff.components_to_update || []).forEach((compDiff: any) => {
            const draftBefore = editorStore.getDraftComponents(slideId);
            const existsInDraft = draftBefore?.some((c: any) => c.id === compDiff.id);

            if (!existsInDraft) {
              console.warn('[ChatPanel] Component not found in draft, will resync after main deck update', {
                slideId,
                componentId: compDiff.id,
                draftIds: draftBefore?.map((c: any) => c.id) || []
              });
              needsDraftResync = true;
            }

            editorStore.updateDraftComponent(
              slideId,
              compDiff.id,
              {
                ...(compDiff.type ? { type: compDiff.type } : {}),
                props: compDiff.props || {}
              },
              true
            );
          });

          if (needsDraftResync) {
            (slideDiff as any)._needsDraftResync = true;
          }

          (slideDiff.components_to_add || []).forEach((comp: any) => {
            editorStore.addDraftComponent(slideId, comp, true);
          });
        });

        const { deckData, updateDeckData } = (useDeckStore as any).getState();
        const updated = applyDeckDiffPure(deckData, deckDiff as any);
        if (updated !== deckData) {
          updateDeckData(updated, { skipBackend: true });

          const slidesToResync = ((deckDiff as any).slides_to_update || [])
            .filter((s: any) => s._needsDraftResync)
            .map((s: any) => s.slide_id);

          if (slidesToResync.length > 0) {
            setTimeout(() => {
              const freshEditorStore = useEditorStore.getState();
              slidesToResync.forEach((slideId: string) => {
                const freshDeckData = (useDeckStore as any).getState().deckData;
                const slideFromDeck = freshDeckData.slides?.find((s: any) => s.id === slideId);
                if (slideFromDeck?.components) {
                  freshEditorStore.clearDraftComponents(slideId);
                  freshEditorStore.initializeDraftComponents(slideId);
                }
              });
            }, 50);
          }
        }
        return;
      } catch (e) {
        console.warn('[AgentChat] Failed to apply diff to drafts', e);
      }
    }

    try {
      const { deckData, updateDeckData } = (useDeckStore as any).getState();
      const updated = applyDeckDiffPure(deckData, deckDiff as any);
      if (updated !== deckData) {
        updateDeckData(updated, { skipBackend: true });
      }
    } catch (e) {
      console.error('[AgentChat] Failed to apply diff', e);
    }
  }, [setIsGenerating]);

  const applyPreviewSlidesRespectingEditMode = useCallback((previewSlides: any[], isAgentEdit = false) => {
    if (!Array.isArray(previewSlides) || previewSlides.length === 0) return;
    try {
      const deckData = (useDeckStore as any).getState().deckData;
      const allCompleted = Array.isArray(deckData?.slides) && deckData.slides.length > 0 && deckData.slides.every((s: any) => s.status === 'completed');
      if (allCompleted && !isAgentEdit) {
        setIsGenerating(false);
        return;
      }
    } catch { }
    const isEditing = typeof window !== 'undefined' && (window as any).__isEditMode === true;
    if (!isEditing) {
      try {
        const s = (useDeckStore as any).getState();
        const curr = s.deckData;
        const previewSlidesMap = new Map(previewSlides.map((sl: any) => [sl.id, sl]));
        const mergedSlides = curr.slides.map((sl: any) => previewSlidesMap.get(sl.id) || sl);
        previewSlides.forEach((ps: any) => {
          if (!curr.slides.some((sl: any) => sl.id === ps.id)) mergedSlides.push(ps);
        });
        s.updateDeckData({
          slides: mergedSlides,
          lastModified: new Date().toISOString(),
          version: `${curr.version || ''}-preview-${Date.now()}`
        }, { skipBackend: true });
      } catch { }
      return;
    }

    try {
      const interacting = (typeof window !== 'undefined') && (
        (window as any).__isDragging === true ||
        (window as any).__isDraggingCharts === true ||
        (window as any).__isResizingCharts === true
      );
      if (interacting) {
        return;
      }
    } catch { }
    try {
      const editorStore = useEditorStore.getState();
      previewSlides.forEach((previewSlide: any) => {
        const slideId = previewSlide?.id;
        if (!slideId) return;
        if (!isAgentEdit) {
          try {
            const hasLocal = typeof editorStore.hasSlideChanged === 'function' && editorStore.hasSlideChanged(slideId);
            if (hasLocal) {
              return;
            }
          } catch { }
        }
        const previewComponents: any[] = Array.isArray(previewSlide.components) ? previewSlide.components : [];
        const draftComponents: any[] = editorStore.getDraftComponents(slideId) || [];

        const draftById = new Map(draftComponents.map(c => [c.id, c]));
        const previewById = new Map(previewComponents.map(c => [c.id, c]));

        previewComponents.forEach((pc) => {
          const current = draftById.get(pc.id);
          if (!current) {
            editorStore.addDraftComponent(slideId, pc, true);
            return;
          }
          const typeChanged = current.type !== pc.type;
          const propsChanged = JSON.stringify(current.props || {}) !== JSON.stringify(pc.props || {});
          if (typeChanged || propsChanged) {
            editorStore.updateDraftComponent(slideId, pc.id, { type: pc.type, props: pc.props || {} }, true);
          }
        });

        draftComponents.forEach((dc) => {
          if (!previewById.has(dc.id)) {
            editorStore.removeDraftComponent(slideId, dc.id, true);
          }
        });
      });
    } catch (e) {
      console.warn('[AgentChat] Failed to apply preview slides to drafts', e);
    }
  }, [setIsGenerating]);

  return {
    applyDeckDiffRespectingEditMode,
    applyPreviewSlidesRespectingEditMode,
  };
}
