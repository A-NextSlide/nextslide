// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { useInitialConversationalData } from './useInitialConversationalData';
import type { ExtendedChatMessageProps } from '@/components/chat';

vi.mock('@/services/outlineApi', () => ({
  outlineApi: {
    generateThemeFromOutline: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('useInitialConversationalData', () => {
  it('hydrates outline data and narrative for pre-generated slides', async () => {
    const onOutlineAgentToolCall = vi.fn();
    const onOutlineChatGeneratingChange = vi.fn();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    const initialConversationalData = {
      topic: 'Retail trends',
      slideCount: 3,
      detailLevel: 'standard',
      slides: [
        { title: 'Intro', content: 'Overview' },
      ],
      narrative: 'Here is your narrative.',
      slideMode: 'interactive',
      slideScreenshots: [],
      uploadedMedia: [],
    };

    const { result } = renderHook(() => {
      const [messages, setMessages] = useState<ExtendedChatMessageProps[]>([]);
      useInitialConversationalData({
        initialConversationalData,
        deckId: 'deck-1',
        setMessages,
        onOutlineAgentToolCall,
        onOutlineChatGeneratingChange,
      });
      return { messages };
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(onOutlineAgentToolCall).toHaveBeenCalled();
    expect(onOutlineChatGeneratingChange).toHaveBeenCalledWith(false);
    expect(result.current.messages.some(m => m.message === 'Here is your narrative.')).toBe(true);
    expect(dispatchSpy).toHaveBeenCalled();
    dispatchSpy.mockRestore();
  });
});
