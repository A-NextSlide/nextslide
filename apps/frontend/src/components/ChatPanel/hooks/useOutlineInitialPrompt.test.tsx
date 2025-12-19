// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { useOutlineInitialPrompt } from './useOutlineInitialPrompt';
import type { ExtendedChatMessageProps } from '@/components/chat';

describe('useOutlineInitialPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the initial prompt through the outline agent', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const onInitialPromptProcessed = vi.fn();

    const { result } = renderHook(() => {
      const [messages, setMessages] = useState<ExtendedChatMessageProps[]>([]);
      useOutlineInitialPrompt({
        initialPromptFromURL: {
          prompt: 'Build a pitch deck',
          autoImages: true,
          autoSlides: true,
          presentationMode: false,
        },
        outlineAgent: { sendMessage, isProcessing: false },
        outline: {
          title: 'Pitch',
          slides: [{ title: 'Intro', subtitle: '', type: 'title', content: '' }],
        },
        setMessages,
        onOutlineUpdate: undefined,
        onOutlineAgentToolCall: undefined,
        onInitialPromptProcessed,
      });
      return { messages };
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.message).toContain('**Topic:** Build a pitch deck');
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(onInitialPromptProcessed).toHaveBeenCalledTimes(1);
  });
});
