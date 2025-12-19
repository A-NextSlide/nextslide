import { useCallback, useEffect } from 'react';
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
  const handleCompletion = useCallback((metadata?: Record<string, any>) => {
    setIsGenerating(false);
    setMessages(prev => {
      const hasCompletion = prev.some(m =>
        m.metadata?.type === 'generation_complete' ||
        (typeof m.message === 'string' && m.message.includes('Your presentation is ready!'))
      );
      if (hasCompletion) return prev;

      const completionMessage: ExtendedChatMessageProps = {
        id: 'generation-complete',
        type: 'ai',
        message: 'Your presentation is ready!',
        timestamp: new Date(),
        feedback: null,
        metadata: { ...metadata, type: 'generation_complete', stage: 'generation_complete', progress: 100 }
      } as any;

      const progressIdx = prev.findIndex(msg => msg.id === 'generation-progress');
      if (progressIdx !== -1) {
        const updated = [...prev];
        updated[progressIdx] = completionMessage;
        return updated;
      }
      return [...prev, completionMessage];
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

      setIsGenerating(false);

      setMessages(prev => {
        const hasCompletion = prev.some(m =>
          m.metadata?.type === 'generation_complete' ||
          (typeof m.message === 'string' && m.message.includes('Your presentation is ready!'))
        );
        if (hasCompletion) return prev;

        const completionMessage: ExtendedChatMessageProps = {
          id: 'generation-complete',
          type: 'ai',
          message: 'Your presentation is ready!',
          timestamp: new Date(),
          feedback: null,
          metadata: { type: 'generation_complete', stage: 'generation_complete', progress: 100, deckId }
        } as any;

        const progressIdx = prev.findIndex(msg => msg.id === 'generation-progress');
        if (progressIdx !== -1) {
          const updated = [...prev];
          updated[progressIdx] = completionMessage;
          return updated;
        }
        return [...prev, completionMessage];
      });
      setCurrentPhase('generation_complete');

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
  }, [processSystemMessage, setCurrentPhase, setIsGenerating, setMessages]);
}
