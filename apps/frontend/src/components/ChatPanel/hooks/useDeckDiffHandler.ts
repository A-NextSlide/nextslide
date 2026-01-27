import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { applyDeckDiffPure } from '@/utils/deckDiffUtils';
import { useDeckStore } from '@/stores/deckStore';
import { useEditorStore } from '@/stores/editorStore';
import type { DeckDiff } from '@/utils/apiUtils';

interface UseDeckDiffHandlerOptions {
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
}

export function useDeckDiffHandler({ setIsGenerating }: UseDeckDiffHandlerOptions) {
  const pendingDiffRef = useRef<{ diff: DeckDiff; isEditDiff: boolean } | null>(null);
  const pendingPreviewRef = useRef<{ slides: any[]; isAgentEdit: boolean } | null>(null);
  const pendingTimerRef = useRef<number | null>(null);
  const pendingSinceRef = useRef<number | null>(null);

  const isUserInteracting = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return (
      (window as any).__isDragging === true ||
      (window as any).__isDraggingCharts === true ||
      (window as any).__isResizingCharts === true ||
      (window as any).__isDraggingSlide === true ||
      (window as any).__isSlideOperationInProgress === true
    );
  }, []);

  const applyDeckDiffNow = useCallback((deckDiff: DeckDiff, isEditDiff = false) => {
    if (!deckDiff) {
      return;
    }

    // DEBUG: Log the incoming diff structure to trace font prop handling
    try {
      const slidesToUpdate = (deckDiff as any).slides_to_update || [];
      slidesToUpdate.forEach((slideDiff: any) => {
        const compUpdates = slideDiff.components_to_update || [];
        compUpdates.forEach((compDiff: any) => {
          const allProps = compDiff.props || {};
          const fontKeys = Object.keys(allProps).filter(k => k.toLowerCase().includes('font'));
          if (fontKeys.length > 0) {
            console.log('[DeckDiffHandler] 🔑 INCOMING diff has font props:', {
              slideId: slideDiff.slide_id,
              componentId: compDiff.id?.slice(0, 12),
              fontProps: fontKeys.map(k => `${k}=${allProps[k]}`),
              isEditDiff,
            });
          }
        });
      });
    } catch (e) {
      console.warn('[DeckDiffHandler] DEBUG log failed:', e);
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
    console.log('[DeckDiffHandler] isEditing:', isEditing, 'isEditDiff:', isEditDiff);

    // CRITICAL: For agent edits, we should update drafts even if __isEditMode is false
    // because the user might be viewing in the editor context but the flag isn't set correctly
    const shouldUpdateDrafts = isEditing || isEditDiff;

    if (shouldUpdateDrafts) {
      console.log('[DeckDiffHandler] 🔧 DRAFT UPDATE BRANCH - processing diff (isEditing:', isEditing, 'isEditDiff:', isEditDiff, ')');
      try {
        const editorStore = useEditorStore.getState();
        const slidesToUpdate = (deckDiff as any).slides_to_update || [];
        const slidesToAdd = (deckDiff as any).slides_to_add || [];
        const slidesToRemove = (deckDiff as any).slides_to_remove || [];
        console.log('[DeckDiffHandler] slidesToUpdate count:', slidesToUpdate.length);

        slidesToUpdate.forEach((slideDiff: any) => {
          const slideId = slideDiff?.slide_id;
          if (!slideId) return;
          const compUpdates = slideDiff.components_to_update || [];
          console.log('[DeckDiffHandler] Processing slide:', slideId, 'components_to_update:', compUpdates.length);

          // DEBUG: Log all component updates with their props
          compUpdates.forEach((cu: any, idx: number) => {
            const propKeys = Object.keys(cu.props || {});
            console.log(`[DeckDiffHandler] Component update ${idx}:`, {
              id: cu.id?.slice(0, 12),
              type: cu.type,
              propCount: propKeys.length,
              propKeys: propKeys.slice(0, 10).join(', '),
              hasFontProps: propKeys.some((k: string) => k.toLowerCase().includes('font'))
            });
          });

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

            // Debug: Log font-related props being applied
            const fontProps = Object.keys(compDiff.props || {}).filter(k => k.toLowerCase().includes('font'));
            if (fontProps.length > 0) {
              console.log('[DeckDiff] Applying font props to component:', {
                componentId: compDiff.id?.slice(0, 12),
                fontProps: fontProps.map(k => `${k}=${(compDiff.props || {})[k]}`)
              });
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

            // DEBUG: Verify the update was applied
            const draftAfter = editorStore.getDraftComponents(slideId);
            const updatedComp = draftAfter?.find((c: any) => c.id === compDiff.id);
            const fontPropsAfter = Object.keys(updatedComp?.props || {}).filter(k => k.toLowerCase().includes('font'));
            if (fontPropsAfter.length > 0) {
              console.log('[DeckDiffHandler] ✅ VERIFIED font props in draft after update:', {
                componentId: compDiff.id?.slice(0, 12),
                fontProps: fontPropsAfter.map(k => `${k}=${updatedComp?.props?.[k]}`)
              });
            }
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

        const addedSlideIds = (slidesToAdd || [])
          .map((slide: any) => (typeof slide === 'string' ? slide : slide?.id))
          .filter(Boolean);
        const removedSlideIds = (slidesToRemove || [])
          .map((slide: any) => (typeof slide === 'string' ? slide : slide?.id))
          .filter(Boolean);

        addedSlideIds.forEach((slideId: string) => {
          editorStore.clearDraftComponents(slideId);
          editorStore.initializeDraftComponents(slideId);
        });

        removedSlideIds.forEach((slideId: string) => {
          editorStore.clearDraftComponents(slideId);
        });

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

  const applyPreviewSlidesNow = useCallback((previewSlides: any[], isAgentEdit = false) => {
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

    // For agent edits, we should update drafts even if __isEditMode is false
    const shouldUpdateDrafts = isEditing || isAgentEdit;

    if (!shouldUpdateDrafts) {
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
      const editorStore = useEditorStore.getState();
      const deckStore = useDeckStore.getState();
      const currentSlides = deckStore.deckData?.slides || [];
      const missingSlides = previewSlides.filter((ps: any) => !currentSlides.some((sl: any) => sl.id === ps.id));

      if (missingSlides.length > 0) {
        deckStore.updateDeckData({
          slides: [...currentSlides, ...missingSlides],
          lastModified: new Date().toISOString(),
          version: `${deckStore.deckData?.version || ''}-preview-${Date.now()}`
        }, { skipBackend: true });
      }

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

  const schedulePendingApply = useCallback(() => {
    if (pendingTimerRef.current) return;
    pendingTimerRef.current = window.setTimeout(() => {
      pendingTimerRef.current = null;

      if (!pendingDiffRef.current && !pendingPreviewRef.current) {
        pendingSinceRef.current = null;
        return;
      }

      const stillInteracting = isUserInteracting();
      if (stillInteracting) {
        if (!pendingSinceRef.current) pendingSinceRef.current = Date.now();
        if (Date.now() - pendingSinceRef.current < 4000) {
          schedulePendingApply();
          return;
        }
      }

      pendingSinceRef.current = null;
      const pendingDiff = pendingDiffRef.current;
      const pendingPreview = pendingPreviewRef.current;
      pendingDiffRef.current = null;
      pendingPreviewRef.current = null;

      if (pendingDiff) {
        applyDeckDiffNow(pendingDiff.diff, pendingDiff.isEditDiff);
      }
      if (pendingPreview) {
        applyPreviewSlidesNow(pendingPreview.slides, pendingPreview.isAgentEdit);
      }
    }, 200);
  }, [applyDeckDiffNow, applyPreviewSlidesNow, isUserInteracting]);

  const applyDeckDiffRespectingEditMode = useCallback((deckDiff: DeckDiff, isEditDiff = false) => {
    if (!deckDiff) {
      return;
    }

    if (isUserInteracting()) {
      pendingDiffRef.current = { diff: deckDiff, isEditDiff };
      if (!pendingSinceRef.current) pendingSinceRef.current = Date.now();
      schedulePendingApply();
      return;
    }

    applyDeckDiffNow(deckDiff, isEditDiff);
  }, [applyDeckDiffNow, isUserInteracting, schedulePendingApply]);

  const applyPreviewSlidesRespectingEditMode = useCallback((previewSlides: any[], isAgentEdit = false) => {
    if (!Array.isArray(previewSlides) || previewSlides.length === 0) return;

    if (isUserInteracting()) {
      pendingPreviewRef.current = { slides: previewSlides, isAgentEdit };
      if (!pendingSinceRef.current) pendingSinceRef.current = Date.now();
      schedulePendingApply();
      return;
    }

    applyPreviewSlidesNow(previewSlides, isAgentEdit);
  }, [applyPreviewSlidesNow, isUserInteracting, schedulePendingApply]);

  return {
    applyDeckDiffRespectingEditMode,
    applyPreviewSlidesRespectingEditMode,
  };
}
