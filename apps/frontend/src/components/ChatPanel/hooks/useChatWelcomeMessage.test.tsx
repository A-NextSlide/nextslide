// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { useChatWelcomeMessage } from './useChatWelcomeMessage';
import type { ExtendedChatMessageProps } from '@/components/chat';
import { getWelcomeMessage } from '@/components/chat';

describe('useChatWelcomeMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds a welcome message once slides load', () => {
    const { result } = renderHook(() => {
      const [messages, setMessages] = useState<ExtendedChatMessageProps[]>([]);
      useChatWelcomeMessage({
        outlineMode: false,
        useOutlineAgent: false,
        slideCount: 3,
        isExistingDeck: false,
        setMessages,
      });
      return { messages };
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.message).toBe(getWelcomeMessage(false, false));
  });
});
