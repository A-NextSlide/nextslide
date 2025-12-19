import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { FeedbackType } from '@/components/ChatMessage';
import type { ExtendedChatMessageProps } from '@/components/chat';
import { saveFeedback } from '@/utils/feedbackService';

interface UseChatMessageFeedbackOptions {
  messages: ExtendedChatMessageProps[];
  setMessages: Dispatch<SetStateAction<ExtendedChatMessageProps[]>>;
}

export function useChatMessageFeedback({
  messages,
  setMessages,
}: UseChatMessageFeedbackOptions) {
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const handleMessageFeedback = useCallback((messageId: string, feedback: FeedbackType) => {
    setMessages(prev => prev.map(msg => (
      msg.id === messageId ? { ...msg, feedback } : msg
    )));

    if (!feedback) {
      return;
    }

    const snapshot = messagesRef.current;
    const target = snapshot.find(msg => msg.id === messageId);
    if (!target) {
      return;
    }

    const messageText = typeof target.message === 'string' ? target.message : '';
    const beforeJson = target.metadata?.deckStateBefore;
    const afterJson = target.metadata?.deckStateAfter;
    const metadata = target.metadata || undefined;

    void saveFeedback({
      messageId,
      feedbackType: feedback,
      beforeJson,
      afterJson,
      chatHistory: snapshot,
      messageText,
      metadata,
    });
  }, [setMessages]);

  return { handleMessageFeedback };
}
