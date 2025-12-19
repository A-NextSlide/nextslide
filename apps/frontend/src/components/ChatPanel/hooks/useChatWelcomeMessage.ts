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

  useEffect(() => {
    if (outlineMode || useOutlineAgent) return;
    if (slideCount <= 0 || welcomeMessageShownRef.current) return;

    welcomeMessageShownRef.current = true;
    const timer = window.setTimeout(() => {
      setMessages(prev => {
        if (prev.length > 0) return prev;
        return [{
          id: 'welcome-message',
          type: 'ai',
          message: getWelcomeMessage(false, isExistingDeck),
          timestamp: new Date(),
          feedback: null,
        }];
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [isExistingDeck, outlineMode, setMessages, slideCount, useOutlineAgent]);
}
