import { Dispatch, SetStateAction, useCallback, useEffect, useRef } from 'react';
import { useSlideGeneration, UseSlideGenerationOptions } from '@/hooks/useSlideGeneration';
import { GenerationCoordinator } from '@/services/generation/GenerationCoordinator';
import { useDeckStore } from '@/stores/deckStore';
import { DeckStatus, CompleteDeckData } from '@/types/DeckTypes';
import { ProcessedEvent } from '@/services/generation';
import { TestOutlineService } from '@/services/generation/TestOutlineService';
import type { ChatPanelProps } from '../ChatPanel';

type UseSlideGenerationFlowArgs = {
  deckId?: string;
  isNewDeck: boolean;
  deckStatus: DeckStatus | null;
  setDeckStatus: Dispatch<SetStateAction<DeckStatus | null>>;
  setLastSystemMessageForChat: Dispatch<SetStateAction<ChatPanelProps['newSystemMessage']>>;
  searchParams: URLSearchParams;
  setSearchParams: (params: URLSearchParams, options?: { replace?: boolean }) => void;
  deckData: CompleteDeckData;
  fetchLatestDeck: () => Promise<void>;
};

export const useSlideGenerationFlow = ({
  deckId,
  isNewDeck,
  deckStatus,
  setDeckStatus,
  setLastSystemMessageForChat,
  searchParams,
  setSearchParams,
  deckData,
  fetchLatestDeck
}: UseSlideGenerationFlowArgs) => {
  const updateDeckData = useDeckStore(state => state.updateDeckData);
  const fetchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentMessageRef = useRef<string>('');
  const hasAttemptedAutoStartRef = useRef(false);

  const generationCallbacks: UseSlideGenerationOptions = {
    onProgress: (event: ProcessedEvent) => {
      if (event.stage === 'outline_structure' && !event.data?.slideTitles) {
        const currentDeckData = useDeckStore.getState().deckData;
        if (TestOutlineService.isTestDeck(currentDeckData)) {
          const effectiveDeckId = deckId || currentDeckData.uuid;
          if (effectiveDeckId) {
            const testOutline = TestOutlineService.createPikachuOutline(effectiveDeckId, currentDeckData);
            updateDeckData({ outline: testOutline });
          }
        }
      }

      const isSlideGenPhase = event.phase === 'slide_generation' || event.stage === 'slide_generation';
      if (!fetchIntervalRef.current && isSlideGenPhase) {
        fetchIntervalRef.current = setInterval(async () => {
          try {
            await fetchLatestDeck();
          } catch (error) {
            console.error('[SlideGeneration] Error fetching latest deck:', error);
          }
        }, 3000);
      }
    },
    onComplete: () => {
      if (fetchIntervalRef.current) {
        clearInterval(fetchIntervalRef.current);
        fetchIntervalRef.current = null;
      }
      fetchLatestDeck();
    },
    onError: () => {
      if (fetchIntervalRef.current) {
        clearInterval(fetchIntervalRef.current);
        fetchIntervalRef.current = null;
      }
    }
  };

  const { deckStatus: generationStatus, lastSystemMessage: generationMessage, startGeneration } = useSlideGeneration(deckId || '', generationCallbacks);

  useEffect(() => {
    return () => {
      if (fetchIntervalRef.current) {
        clearInterval(fetchIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const differs = (a: DeckStatus | null, b: DeckStatus | null) => {
      if (!a && !b) return false;
      if (!a || !b) return true;
      return (
        a.state !== b.state ||
        a.progress !== b.progress ||
        a.currentSlide !== b.currentSlide ||
        a.totalSlides !== b.totalSlides ||
        a.message !== b.message
      );
    };

    if (generationStatus && differs(generationStatus, deckStatus)) {
      setDeckStatus(generationStatus);

      if (generationStatus.state === 'generating' ||
          generationStatus.state === 'creating' ||
          generationStatus.state === 'pending') {
        setLastSystemMessageForChat({
          message: generationStatus.message || 'Generating your presentation...',
          metadata: {
            type: 'generation_status',
            state: generationStatus.state,
            progress: generationStatus.progress,
            currentSlide: generationStatus.currentSlide,
            totalSlides: generationStatus.totalSlides,
            isStreamingUpdate: true
          }
        });
      }

      if (generationStatus.state === 'completed' && searchParams.get('new') === 'true') {
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.delete('new');
        setSearchParams(newSearchParams, { replace: true });
      }
    }
  }, [generationStatus, deckStatus, searchParams, setSearchParams, setDeckStatus, setLastSystemMessageForChat]);

  useEffect(() => {
    if (generationMessage) {
      const messageKey = `${generationMessage.message ?? ''}-${generationMessage.metadata?.progress ?? ''}-${generationMessage.metadata?.stage ?? ''}`;
      if (lastSentMessageRef.current !== messageKey) {
        setLastSystemMessageForChat(generationMessage);
        lastSentMessageRef.current = messageKey;
      }
    }
  }, [generationMessage, setLastSystemMessageForChat]);

  useEffect(() => {
    hasAttemptedAutoStartRef.current = false;
  }, [deckId]);

  const handleStartGeneration = useCallback(async () => {
    await startGeneration({ auto: true });
  }, [startGeneration]);

  useEffect(() => {
    if (!deckId || !deckStatus || !isNewDeck || hasAttemptedAutoStartRef.current) {
      return;
    }

    const markAttempted = () => {
      hasAttemptedAutoStartRef.current = true;
    };

    if (deckStatus.state === 'completed' || deckStatus.progress === 100) {
      markAttempted();
      return;
    }

    const hasGeneratedContent = deckData.slides?.some(slide =>
      slide.components && slide.components.length > 0
    );
    if (hasGeneratedContent) {
      markAttempted();
      return;
    }

    if (typeof window !== 'undefined' && (window as any).__activeGenerationDeckId === deckId) {
      markAttempted();
      return;
    }

    const coordinator = GenerationCoordinator.getInstance();
    if (coordinator.isGenerating(deckId)) {
      markAttempted();
      return;
    }

    if (deckStatus.state === 'pending') {
      const hasOutline = Boolean(deckData?.data?.outline || deckData?.outline);
      if (!hasOutline) {
        return;
      }

      markAttempted();
      setTimeout(() => {
        handleStartGeneration();
      }, 100);
    }
  }, [
    deckId,
    deckStatus?.state,
    deckStatus?.progress,
    isNewDeck,
    handleStartGeneration,
    deckData.slides?.length,
    deckData.data?.outline,
    deckData.outline
  ]);
};
