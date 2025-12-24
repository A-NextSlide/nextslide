import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ExtendedChatMessageProps } from '@/components/chat';
import { getWelcomeMessage } from '@/components/chat';

interface UseChatSystemMessagesOptions {
  newSystemMessage?: Omit<ExtendedChatMessageProps, 'id' | 'timestamp' | 'type' | 'feedback'> & { message: string };
  setMessages: Dispatch<SetStateAction<ExtendedChatMessageProps[]>>;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
  setCurrentPhase: Dispatch<SetStateAction<string | null>>;
}

export function useChatSystemMessages({
  newSystemMessage,
  setMessages,
  setIsGenerating,
  setCurrentPhase,
}: UseChatSystemMessagesOptions) {
  // Track if completion was already handled to prevent duplicate processing
  const completionHandledRef = useRef(false);
  const isFreshGenerationSignal = (message: string, metadata?: Record<string, any>): boolean => {
    const phase = String(metadata?.phase || metadata?.stage || '').toLowerCase();
    const state = String(metadata?.state || '').toLowerCase();
    const progress = typeof metadata?.progress === 'number' ? metadata.progress : null;

    if (state === 'pending' || state === 'creating' || state === 'generating') return true;
    if (phase === 'initialization' || phase === 'theme_generation' || phase === 'layout_design' || phase === 'image_collection' || phase === 'slide_generation') return true;
    if (progress !== null && progress < 5) return true;
    if (message && /(preparing|initializing|starting|creating)\b/i.test(message)) return true;
    return false;
  };

  const handleCompletion = useCallback((metadata?: Record<string, any>) => {
    // Prevent duplicate completion handling from multiple events
    if (completionHandledRef.current) {
      // Already handled - just return without any state updates to prevent re-renders
      return;
    }
    completionHandledRef.current = true;

    setIsGenerating(false);
    setMessages(prev => {
      // Always remove the progress message first
      let updated = prev.filter(msg => msg.id !== 'generation-progress');

      const hasCompletion = updated.some(m =>
        m.metadata?.type === 'generation_complete' ||
        (typeof m.message === 'string' && m.message.includes('Your presentation is ready!'))
      );

      // If already have completion message, just return without progress message
      if (hasCompletion) return updated;

      const completionMetadata = { ...metadata };
      delete completionMetadata.isStreamingUpdate;
      delete completionMetadata.isTyping;
      delete completionMetadata.thinkingPhase;

      const completionMessage: ExtendedChatMessageProps = {
        id: 'generation-complete',
        type: 'ai',
        message: 'Your presentation is ready!',
        timestamp: new Date(),
        feedback: null,
        metadata: { ...completionMetadata, type: 'generation_complete', stage: 'generation_complete', progress: 100 }
      } as any;

      return [...updated, completionMessage];
    });
    setCurrentPhase('generation_complete');
  }, [setCurrentPhase, setIsGenerating, setMessages]);

  const upsertStreamingMessage = useCallback((message: string, metadata?: Record<string, any>) => {
    setMessages(prev => {
      const progressId = 'generation-progress';
      const nextMessage: ExtendedChatMessageProps = {
        id: progressId,
        type: 'system',
        message,
        timestamp: new Date(),
        feedback: null,
        metadata: { ...metadata, isStreamingUpdate: true },
      } as any;

      const progressIdx = prev.findIndex(msg => msg.id === progressId);
      if (progressIdx !== -1) {
        const updated = [...prev];
        updated[progressIdx] = { ...updated[progressIdx], ...nextMessage };
        return updated;
      }
      return [...prev, nextMessage];
    });

    try {
      const phase = metadata?.phase || metadata?.stage || null;
      if (phase) {
        setCurrentPhase(String(phase));
      }
    } catch { }
  }, [setCurrentPhase, setMessages]);

  const appendSystemMessage = useCallback((message: string, metadata?: Record<string, any>) => {
    const newMessage: ExtendedChatMessageProps = {
      id: `system-${Date.now()}`,
      type: 'system',
      message,
      timestamp: new Date(),
      metadata,
      feedback: null
    };

    setMessages(prev => [...prev, newMessage]);

    try {
      const phase = metadata?.phase || metadata?.stage || null;
      const isStreaming = metadata?.isStreamingUpdate === true;
      if (isStreaming && phase) {
        setCurrentPhase(String(phase));
      }
    } catch { }
  }, [setCurrentPhase, setMessages]);

  const processSystemMessage = useCallback((message: string, metadata?: Record<string, any>) => {
    const isCompletion = metadata?.type === 'generation_complete' ||
      metadata?.stage === 'generation_complete' ||
      metadata?.progress === 100;

    if (isCompletion) {
      handleCompletion(metadata);
      return;
    }

    if (metadata?.isStreamingUpdate) {
      if (completionHandledRef.current) {
        if (isFreshGenerationSignal(message, metadata)) {
          completionHandledRef.current = false;
        } else {
          return;
        }
      }
      upsertStreamingMessage(message, metadata);
      return;
    }

    appendSystemMessage(message, metadata);
  }, [appendSystemMessage, handleCompletion, upsertStreamingMessage]);

  useEffect(() => {
    if (!newSystemMessage) return;
    processSystemMessage(newSystemMessage.message, newSystemMessage.metadata);
  }, [newSystemMessage, processSystemMessage]);

  useEffect(() => {
    const handleAddSystemMessage = (event: CustomEvent) => {
      const { message, metadata } = event.detail;

      processSystemMessage(message, metadata);
    };

    window.addEventListener('add_system_message', handleAddSystemMessage as EventListener);

    const handleDeckFinalized = (event: CustomEvent) => {
      const { deckId } = event.detail || {};
      console.log('[ChatPanel] Received deck_finalized event:', deckId);

      // Use the same completion handler to prevent duplicate processing
      handleCompletion({ deckId });

      // Add welcome message after a delay (only if not already present)
      setTimeout(() => {
        setMessages(prev => {
          const hasWelcome = prev.some(m => m.id === 'post-generation-welcome');
          if (hasWelcome) return prev;

          const welcomeMessage: ExtendedChatMessageProps = {
            id: 'post-generation-welcome',
            type: 'ai',
            message: getWelcomeMessage(false, true),
            timestamp: new Date(),
            feedback: null,
            metadata: { isTyping: false }
          } as any;

          return [...prev, welcomeMessage];
        });
      }, 800);
    };

    window.addEventListener('deck_finalized', handleDeckFinalized as EventListener);

    return () => {
      window.removeEventListener('add_system_message', handleAddSystemMessage as EventListener);
      window.removeEventListener('deck_finalized', handleDeckFinalized as EventListener);
    };
  }, [handleCompletion, processSystemMessage, setCurrentPhase, setIsGenerating, setMessages]);
}
