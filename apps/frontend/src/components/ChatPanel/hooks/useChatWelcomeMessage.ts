import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ExtendedChatMessageProps } from '@/components/chat';
import { getWelcomeMessage } from '@/components/chat';

interface UseChatWelcomeMessageOptions {
  outlineMode: boolean;
  useOutlineAgent: boolean;
  slideCount: number;
  isExistingDeck: boolean;
  setMessages: Dispatch<SetStateAction<ExtendedChatMessageProps[]>>;
}

export function useChatWelcomeMessage({
  outlineMode,
  useOutlineAgent,
  slideCount,
  isExistingDeck,
  setMessages,
}: UseChatWelcomeMessageOptions) {
  const welcomeMessageShownRef = useRef(false);
  // Capture initial isExistingDeck value to avoid reacting to generation completion
  const initialIsExistingDeckRef = useRef(isExistingDeck);

  useEffect(() => {
    if (outlineMode || useOutlineAgent) return;
    if (slideCount <= 0 || welcomeMessageShownRef.current) return;

    // Only run for decks that were existing at mount time, not decks that just finished generating
    const wasExistingAtMount = initialIsExistingDeckRef.current;

    // For new decks (not existing at mount), don't show any welcome message here.
    // The post-generation welcome will be handled by useChatSystemMessages after deck_finalized.
    if (!wasExistingAtMount) return;

    welcomeMessageShownRef.current = true;
    const timer = window.setTimeout(() => {
      setMessages(prev => {
        // Filter out any progress/generating messages
        const cleaned = prev.filter(m =>
          m.id !== 'generation-progress' &&
          !m.metadata?.isStreamingUpdate
        );

        // Check if there's already a welcome or meaningful message
        const hasWelcome = cleaned.some(m =>
          m.id === 'welcome-message' ||
          m.id === 'post-generation-welcome'
        );
        if (hasWelcome) return cleaned;

        return [...cleaned, {
          id: 'welcome-message',
          type: 'ai',
          message: getWelcomeMessage(false, true),
          timestamp: new Date(),
          feedback: null,
          metadata: { streamed: true },
        }];
      });
    }, 300);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlineMode, setMessages, slideCount, useOutlineAgent]);
  // Note: intentionally NOT including isExistingDeck - we use the initial value only
}
