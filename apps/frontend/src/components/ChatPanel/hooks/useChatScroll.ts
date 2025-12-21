import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import type { ExtendedChatMessageProps } from '@/components/chat';

interface UseChatScrollOptions {
  messages: ExtendedChatMessageProps[];
  showOldMessages: boolean;
  setShowOldMessages: Dispatch<SetStateAction<boolean>>;
}

// Threshold in pixels - user is considered "at bottom" if within this distance
const SCROLL_THRESHOLD = 100;

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

  // Track if user has intentionally scrolled up - persists until they scroll back to bottom
  const userScrolledUpRef = useRef(false);
  const listenerAttachedRef = useRef(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior });
      userScrolledUpRef.current = false;
    });
  }, []);

  // Attach scroll listener to detect user scrolling up
  // This runs on every render to ensure listener is attached once container exists
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || listenerAttachedRef.current) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      if (distanceFromBottom <= SCROLL_THRESHOLD) {
        // User is at bottom, allow auto-scroll
        userScrolledUpRef.current = false;
      } else {
        // User has scrolled up, disable auto-scroll
        userScrolledUpRef.current = true;
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    listenerAttachedRef.current = true;

    return () => {
      container.removeEventListener('scroll', handleScroll);
      listenerAttachedRef.current = false;
    };
  });

  // Only scroll if user hasn't scrolled up
  const scrollToBottomIfAtBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (userScrolledUpRef.current) {
      return; // User has scrolled up, don't force scroll
    }
    scrollToBottom(behavior);
  }, [scrollToBottom]);

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
      scrollToBottomIfAtBottom(streamingMessage ? 'auto' : 'smooth');
    }

    previousMessageCountRef.current = messages.length;
    lastMessageTypeRef.current = lastMessage?.metadata?.type || null;
  }, [messages.length, lastMessageHash, scrollToBottomIfAtBottom, streamingMessage]);

  useEffect(() => {
    if (!streamingMessage) return;

    scrollToBottomIfAtBottom('auto');
    const interval = setInterval(() => {
      scrollToBottomIfAtBottom('auto');
    }, 150);

    return () => clearInterval(interval);
  }, [scrollToBottomIfAtBottom, streamingMessage, streamingMessageHash]);

  return {
    messagesEndRef,
    scrollContainerRef,
    handleLoadOlderMessages,
    scrollToBottom,
  };
}
