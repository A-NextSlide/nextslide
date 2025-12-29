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

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior });
      userScrolledUpRef.current = false;
    });
  }, []);

  // Attach scroll listener once when container is available
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      if (distanceFromBottom <= SCROLL_THRESHOLD) {
        userScrolledUpRef.current = false;
      } else {
        userScrolledUpRef.current = true;
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, []); // Empty deps - attach once on mount

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

  // Memoize to avoid recreating on every render
  const lastMessageType = messages[messages.length - 1]?.metadata?.type || null;

  // Check if there's a streaming message - memoized to avoid triggering effects
  const hasStreamingMessage = useMemo(() => {
    return messages.some(msg =>
      msg.metadata?.isStreamingUpdate === true ||
      msg.metadata?.isTyping === true ||
      (typeof msg.id === 'string' && msg.id.startsWith('ai-stream-'))
    );
  }, [messages]);

  // Only scroll when message COUNT changes (new message added), not on every update
  useEffect(() => {
    const messageCount = messages.length;
    if (messageCount === previousMessageCountRef.current) {
      return;
    }

    // Skip scroll for image collection updates
    const isJustUpdatingImages =
      lastMessageType === 'images_collected' &&
      lastMessageTypeRef.current === 'images_collected';

    if (!isJustUpdatingImages) {
      scrollToBottomIfAtBottom(hasStreamingMessage ? 'auto' : 'smooth');
    }

    previousMessageCountRef.current = messageCount;
    lastMessageTypeRef.current = lastMessageType;
  }, [messages.length, scrollToBottomIfAtBottom, hasStreamingMessage, lastMessageType]);

  return {
    messagesEndRef,
    scrollContainerRef,
    handleLoadOlderMessages,
    scrollToBottom,
  };
}
