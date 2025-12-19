import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import type { ExtendedChatMessageProps } from '@/components/chat';

interface UseChatScrollOptions {
  messages: ExtendedChatMessageProps[];
  showOldMessages: boolean;
  setShowOldMessages: Dispatch<SetStateAction<boolean>>;
}

export function useChatScroll({
  messages,
  showOldMessages,
  setShowOldMessages,
}: UseChatScrollOptions) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollHeightBeforeLoadRef = useRef<number>(0);

  const previousMessageCountRef = useRef(messages.length);
  const lastMessageTypeRef = useRef<string | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior });
    });
  }, []);

  const handleLoadOlderMessages = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollHeightBeforeLoadRef.current = scrollContainerRef.current.scrollHeight;
    }
    setShowOldMessages(true);
  }, [setShowOldMessages]);

  useEffect(() => {
    if (showOldMessages && scrollContainerRef.current && scrollHeightBeforeLoadRef.current > 0) {
      const newScrollHeight = scrollContainerRef.current.scrollHeight;
      const heightDiff = newScrollHeight - scrollHeightBeforeLoadRef.current;
      if (heightDiff > 0) {
        scrollContainerRef.current.scrollTop = heightDiff;
      }
      scrollHeightBeforeLoadRef.current = 0;
    }
  }, [showOldMessages]);

  const lastMessage = messages[messages.length - 1];
  const lastMessageHash = lastMessage
    ? `${lastMessage.id}-${typeof lastMessage.message === 'string' ? lastMessage.message.length : 0}-${lastMessage.metadata?.isTyping}`
    : '';

  const streamingMessage = useMemo(() => {
    return messages.find(msg =>
      msg.metadata?.isStreamingUpdate === true ||
      msg.metadata?.isTyping === true ||
      (typeof msg.id === 'string' && msg.id.startsWith('ai-stream-'))
    );
  }, [messages]);

  const streamingMessageHash = streamingMessage
    ? `${streamingMessage.id}-${typeof streamingMessage.message === 'string' ? streamingMessage.message.length : 0}`
    : '';

  useEffect(() => {
    const isJustUpdatingImages = messages.length === previousMessageCountRef.current &&
      messages.some(msg => msg.metadata?.type === 'images_collected') &&
      lastMessageTypeRef.current === 'images_collected';

    if (!isJustUpdatingImages) {
      scrollToBottom(streamingMessage ? 'auto' : 'smooth');
    }

    previousMessageCountRef.current = messages.length;
    lastMessageTypeRef.current = lastMessage?.metadata?.type || null;
  }, [messages.length, lastMessageHash, scrollToBottom, streamingMessage]);

  useEffect(() => {
    if (!streamingMessage) return;

    scrollToBottom('auto');
    const interval = setInterval(() => {
      scrollToBottom('auto');
    }, 150);

    return () => clearInterval(interval);
  }, [scrollToBottom, streamingMessage, streamingMessageHash]);

  return {
    messagesEndRef,
    scrollContainerRef,
    handleLoadOlderMessages,
    scrollToBottom,
  };
}
