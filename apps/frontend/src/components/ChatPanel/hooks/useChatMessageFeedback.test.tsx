// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { useChatMessageFeedback } from './useChatMessageFeedback';
import type { ExtendedChatMessageProps } from '@/components/chat';
import { saveFeedback } from '@/utils/feedbackService';

vi.mock('@/utils/feedbackService', () => ({
  saveFeedback: vi.fn().mockResolvedValue({ success: true }),
}));

describe('useChatMessageFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates feedback and persists for AI messages', () => {
    const initialMessages: ExtendedChatMessageProps[] = [
      {
        id: 'ai-1',
        type: 'ai',
        message: 'Hello',
        timestamp: new Date(),
        feedback: null,
        metadata: {
          deckStateBefore: { before: true },
          deckStateAfter: { after: true },
        },
      },
    ];

    const { result } = renderHook(() => {
      const [messages, setMessages] = useState<ExtendedChatMessageProps[]>(initialMessages);
      const { handleMessageFeedback } = useChatMessageFeedback({ messages, setMessages });
      return { messages, handleMessageFeedback };
    });

    act(() => {
      result.current.handleMessageFeedback('ai-1', 'positive');
    });

    expect(result.current.messages[0]?.feedback).toBe('positive');
    expect(saveFeedback).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'ai-1',
      feedbackType: 'positive',
      beforeJson: { before: true },
      afterJson: { after: true },
      messageText: 'Hello',
    }));
  });

  it('skips persistence when feedback is cleared', () => {
    const initialMessages: ExtendedChatMessageProps[] = [
      {
        id: 'ai-2',
        type: 'ai',
        message: 'Hi',
        timestamp: new Date(),
        feedback: null,
      },
    ];

    const { result } = renderHook(() => {
      const [messages, setMessages] = useState<ExtendedChatMessageProps[]>(initialMessages);
      const { handleMessageFeedback } = useChatMessageFeedback({ messages, setMessages });
      return { messages, handleMessageFeedback };
    });

    act(() => {
      result.current.handleMessageFeedback('ai-2', null);
    });

    expect(saveFeedback).not.toHaveBeenCalled();
  });
});
