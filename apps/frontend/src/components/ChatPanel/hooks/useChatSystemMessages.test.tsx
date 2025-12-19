// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { useChatSystemMessages } from './useChatSystemMessages';
import type { ExtendedChatMessageProps } from '@/components/chat';

describe('useChatSystemMessages', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('replaces progress message when generation completes', () => {
    const { result } = renderHook(() => {
      const [messages, setMessages] = useState<ExtendedChatMessageProps[]>([{
        id: 'generation-progress',
        type: 'ai',
        message: 'Working...',
        timestamp: new Date(),
        feedback: null,
        metadata: { type: 'progress' },
      }]);
      const [isGenerating, setIsGenerating] = useState(true);
      const [currentPhase, setCurrentPhase] = useState<string | null>(null);

      useChatSystemMessages({ setMessages, setIsGenerating, setCurrentPhase });
      return { messages, isGenerating, currentPhase };
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('add_system_message', {
        detail: { message: 'Done', metadata: { type: 'generation_complete', progress: 100 } }
      }));
    });

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.currentPhase).toBe('generation_complete');
    const completion = result.current.messages.find(m => m.id === 'generation-complete');
    expect(completion?.message).toBe('Your presentation is ready!');
  });

  it('adds completion and welcome messages on deck_finalized', () => {
    const { result } = renderHook(() => {
      const [messages, setMessages] = useState<ExtendedChatMessageProps[]>([]);
      const [, setIsGenerating] = useState(true);
      const [currentPhase, setCurrentPhase] = useState<string | null>(null);

      useChatSystemMessages({ setMessages, setIsGenerating, setCurrentPhase });
      return { messages, currentPhase };
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('deck_finalized', {
        detail: { deckId: 'deck-123' }
      }));
    });

    expect(result.current.currentPhase).toBe('generation_complete');
    expect(result.current.messages.some(m => m.id === 'generation-complete')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(result.current.messages.some(m => m.id === 'post-generation-welcome')).toBe(true);
  });

  it('upserts streaming system messages from props', () => {
    const { result, rerender } = renderHook(({ newSystemMessage }) => {
      const [messages, setMessages] = useState<ExtendedChatMessageProps[]>([]);
      const [, setIsGenerating] = useState(false);
      const [currentPhase, setCurrentPhase] = useState<string | null>(null);

      useChatSystemMessages({
        newSystemMessage,
        setMessages,
        setIsGenerating,
        setCurrentPhase,
      });
      return { messages, currentPhase };
    }, {
      initialProps: { newSystemMessage: null as any },
    });

    rerender({
      newSystemMessage: {
        message: 'Generating...',
        metadata: { isStreamingUpdate: true, progress: 10, phase: 'generation' },
      },
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.id).toBe('generation-progress');
    expect(result.current.messages[0]?.message).toBe('Generating...');
    expect(result.current.currentPhase).toBe('generation');

    rerender({
      newSystemMessage: {
        message: 'Almost done...',
        metadata: { isStreamingUpdate: true, progress: 90, phase: 'generation' },
      },
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.message).toBe('Almost done...');
  });
});
