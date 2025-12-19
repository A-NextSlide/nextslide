// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { useOutlineChatSync } from './useOutlineChatSync';
import type { ExtendedChatMessageProps } from '@/components/chat';

describe('useOutlineChatSync', () => {
  it('renders initial prompt from style preferences and syncs slide target', async () => {
    const outline = {
      stylePreferences: {
        initialIdea: 'AI Trends',
        vibeContext: 'Minimal',
        autoSelectImages: true,
      },
      slides: [],
    };

    const { result } = renderHook(() => {
      const [messages, setMessages] = useState<ExtendedChatMessageProps[]>([]);
      const [isGenerating, setIsGenerating] = useState(false);
      const [outlineSlideTarget, setOutlineSlideTarget] = useState<number | 'all'>('all');

      useOutlineChatSync({
        outlineMode: true,
        useOutlineAgent: true,
        outline,
        outlineMessages: undefined,
        isGenerating,
        setIsGenerating,
        onOutlineChatGeneratingChange: undefined,
        outlineCurrentSlideIndex: 2,
        setOutlineSlideTarget,
        messagesLength: messages.length,
        setMessages,
      });

      return { messages, outlineSlideTarget };
    });

    await act(async () => {});

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.message).toContain('**Topic:** AI Trends');
    expect(result.current.outlineSlideTarget).toBe(2);
  });

  it('syncs outline messages and stops generating when slides are populated', async () => {
    const outlineMessages: ExtendedChatMessageProps[] = [
      { id: 'm1', type: 'ai', message: 'Outline ready', timestamp: new Date(), feedback: null },
    ];

    const outline = {
      slides: [{ content: 'Slide content' }],
    };

    const { result } = renderHook(() => {
      const [messages, setMessages] = useState<ExtendedChatMessageProps[]>([]);
      const [isGenerating, setIsGenerating] = useState(true);
      const [outlineSlideTarget, setOutlineSlideTarget] = useState<number | 'all'>('all');

      useOutlineChatSync({
        outlineMode: true,
        useOutlineAgent: false,
        outline,
        outlineMessages,
        isGenerating,
        setIsGenerating,
        onOutlineChatGeneratingChange: undefined,
        outlineCurrentSlideIndex: undefined,
        setOutlineSlideTarget,
        messagesLength: messages.length,
        setMessages,
      });

      return { messages, isGenerating, outlineSlideTarget };
    });

    await act(async () => {});

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.id).toBe('m1');
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.outlineSlideTarget).toBe('all');
  });
});
