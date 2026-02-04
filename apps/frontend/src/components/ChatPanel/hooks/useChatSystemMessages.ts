import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ExtendedChatMessageProps } from '@/components/chat';
import { getWelcomeMessage } from '@/components/chat';
import { deckSyncService } from '@/lib/deckSyncService';

const PROMO_SOCIALS_SHOWN_KEY = 'nextslide_promo_socials_shown';
const PROMO_REFERRAL_SHOWN_KEY = 'nextslide_promo_referral_shown';

interface UseChatSystemMessagesOptions {
  newSystemMessage?: Omit<ExtendedChatMessageProps, 'id' | 'timestamp' | 'type' | 'feedback'> & { message: string };
  setMessages: Dispatch<SetStateAction<ExtendedChatMessageProps[]>>;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
  setCurrentPhase: Dispatch<SetStateAction<string | null>>;
}

// Safety timeout for agent processing (90 seconds)
const AGENT_PROCESSING_TIMEOUT_MS = 90000;

export function useChatSystemMessages({
  newSystemMessage,
  setMessages,
  setIsGenerating,
  setCurrentPhase,
}: UseChatSystemMessagesOptions) {
  // Track if completion was already handled to prevent duplicate processing
  const completionHandledRef = useRef(false);
  // Track the last processed message to prevent duplicate processing
  const lastProcessedMessageRef = useRef<string | null>(null);
  // Safety timeout ref for resetting isGenerating
  const processingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      return;
    }
    completionHandledRef.current = true;

    // Clear safety timeout since we got a proper completion
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }

    // Batch state updates
    setIsGenerating(false);
    setCurrentPhase('generation_complete');

    setMessages(prev => {
      // Check if we already have completion message
      const hasCompletion = prev.some(m =>
        m.metadata?.type === 'generation_complete' ||
        m.id === 'generation-complete'
      );
      if (hasCompletion) {
        // Just remove progress message if completion already exists
        return prev.filter(msg => msg.id !== 'generation-progress');
      }

      // Remove progress message and only clear streaming flags on messages that have them
      const updated = prev
        .filter(msg => msg.id !== 'generation-progress')
        .map(msg => {
          // Only create new object if we need to clear flags
          if (msg.metadata?.isStreamingUpdate || msg.metadata?.isTyping) {
            return {
              ...msg,
              metadata: {
                ...msg.metadata,
                isStreamingUpdate: false,
                isTyping: false,
              }
            };
          }
          return msg;
        });

      const completionMessage: ExtendedChatMessageProps = {
        id: 'generation-complete',
        type: 'ai',
        message: 'Your presentation is ready!',
        timestamp: new Date(),
        feedback: null,
        metadata: { type: 'generation_complete', stage: 'generation_complete', progress: 100, streamed: true }
      } as any;

      return [...updated, completionMessage];
    });
  }, [setCurrentPhase, setIsGenerating, setMessages]);

  const upsertStreamingMessage = useCallback((message: string, metadata?: Record<string, any>) => {
    // Don't process streaming updates if completion was already handled
    if (completionHandledRef.current) {
      return;
    }

    // Set isGenerating to true when we receive streaming updates
    setIsGenerating(true);

    // Start/reset safety timeout - if no completion received within timeout, reset isGenerating
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
    }
    processingTimeoutRef.current = setTimeout(() => {
      console.warn('[ChatSystemMessages] Safety timeout fired - resetting isGenerating');
      setIsGenerating(false);
      processingTimeoutRef.current = null;
    }, AGENT_PROCESSING_TIMEOUT_MS);

    setMessages(prev => {
      // Don't add/update progress message if completion message already exists
      const hasCompletion = prev.some(m =>
        m.metadata?.type === 'generation_complete' ||
        m.id === 'generation-complete'
      );
      if (hasCompletion) {
        // Also remove any existing progress message to be safe
        const filtered = prev.filter(msg => msg.id !== 'generation-progress');
        return filtered.length !== prev.length ? filtered : prev;
      }

      const progressId = 'generation-progress';
      const existingIdx = prev.findIndex(msg => msg.id === progressId);

      // If same message content, skip update to reduce re-renders
      if (existingIdx !== -1 && prev[existingIdx].message === message) {
        return prev;
      }

      const nextMessage: ExtendedChatMessageProps = {
        id: progressId,
        type: 'system',
        message,
        timestamp: existingIdx !== -1 ? prev[existingIdx].timestamp : new Date(),
        feedback: null,
        metadata: { ...metadata, isStreamingUpdate: true },
      } as any;

      if (existingIdx !== -1) {
        const updated = [...prev];
        updated[existingIdx] = nextMessage;
        return updated;
      }
      return [...prev, nextMessage];
    });

    const phase = metadata?.phase || metadata?.stage || null;
    if (phase) {
      setCurrentPhase(String(phase));
    }
  }, [setCurrentPhase, setIsGenerating, setMessages]);

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
    // Create a unique key for this message to prevent duplicate processing
    const messageKey = `${newSystemMessage.message}-${newSystemMessage.metadata?.progress ?? ''}-${newSystemMessage.metadata?.stage ?? ''}-${newSystemMessage.metadata?.type ?? ''}`;
    if (lastProcessedMessageRef.current === messageKey) return;
    lastProcessedMessageRef.current = messageKey;
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

      // Add welcome message after a short delay
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
            metadata: { isTyping: false, streamed: true }
          } as any;

          return [...prev, welcomeMessage];
        });
      }, 800);

      // Add promotional message based on deck count
      setTimeout(async () => {
        try {
          const result = await deckSyncService.getAllDecks(1, 0);
          const deckCount = result.count;

          // 1st deck: Follow socials
          if (deckCount === 1 && !localStorage.getItem(PROMO_SOCIALS_SHOWN_KEY)) {
            localStorage.setItem(PROMO_SOCIALS_SHOWN_KEY, 'true');
            setMessages(prev => {
              if (prev.some(m => m.id === 'promo-socials')) return prev;
              const promoMessage: ExtendedChatMessageProps = {
                id: 'promo-socials',
                type: 'ai',
                message: "Congrats on your first presentation! We'd love to have you in our community — follow us to stay in the loop with tips, updates, and new features.",
                timestamp: new Date(),
                feedback: null,
                metadata: { type: 'promo_socials', streamed: true, forceShow: true }
              } as any;
              return [...prev, promoMessage];
            });
          }

          // 2nd deck: Referral prompt
          if (deckCount === 2 && !localStorage.getItem(PROMO_REFERRAL_SHOWN_KEY)) {
            localStorage.setItem(PROMO_REFERRAL_SHOWN_KEY, 'true');
            setMessages(prev => {
              if (prev.some(m => m.id === 'promo-referral')) return prev;
              const promoMessage: ExtendedChatMessageProps = {
                id: 'promo-referral',
                type: 'ai',
                message: "We hope you're enjoying NextSlide! Know someone who'd love it too? Share your referral link and you'll both earn free credits.",
                timestamp: new Date(),
                feedback: null,
                metadata: { type: 'promo_referral', streamed: true, forceShow: true }
              } as any;
              return [...prev, promoMessage];
            });
          }
        } catch (err) {
          console.error('[ChatSystemMessages] Failed to check deck count for promo:', err);
        }
      }, 2500);
    };

    window.addEventListener('deck_finalized', handleDeckFinalized as EventListener);

    return () => {
      window.removeEventListener('add_system_message', handleAddSystemMessage as EventListener);
      window.removeEventListener('deck_finalized', handleDeckFinalized as EventListener);
      // Cleanup safety timeout on unmount
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
    };
  }, [handleCompletion, processSystemMessage, setCurrentPhase, setIsGenerating, setMessages]);
}
