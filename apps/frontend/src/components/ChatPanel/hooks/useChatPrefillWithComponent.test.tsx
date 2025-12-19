// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef, useState } from 'react';
import { useChatPrefillWithComponent } from './useChatPrefillWithComponent';
import type { SelectedElement } from '../types';

describe('useChatPrefillWithComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('prefills input and selections and auto-sends when requested', () => {
    const sendMessage = vi.fn();

    const { result } = renderHook(() => {
      const [input, setInput] = useState('');
      const [selectedElements, setSelectedElements] = useState<SelectedElement[]>([]);
      const inputRef = useRef<HTMLTextAreaElement>(null);

      useChatPrefillWithComponent({
        setSelectedElements,
        setInput,
        input,
        selectedElements,
        sendMessage,
        inputRef,
      });

      return { input, selectedElements };
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('chat:prefill_with_component', {
        detail: {
          componentId: 'comp-1',
          slideId: 'slide-1',
          label: 'Custom Widget',
          prompt: 'Improve this',
          elementType: 'CustomComponent',
          autoSend: true,
        }
      }));
    });

    expect(result.current.input).toBe('Improve this');
    expect(result.current.selectedElements).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('does not auto-send when autoSend is false', () => {
    const sendMessage = vi.fn();

    const { result } = renderHook(() => {
      const [input, setInput] = useState('');
      const [selectedElements, setSelectedElements] = useState<SelectedElement[]>([]);
      const inputRef = useRef<HTMLTextAreaElement>(null);

      useChatPrefillWithComponent({
        setSelectedElements,
        setInput,
        input,
        selectedElements,
        sendMessage,
        inputRef,
      });

      return { input, selectedElements };
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('chat:prefill_with_component', {
        detail: {
          componentId: 'comp-2',
          prompt: 'Refine this',
          autoSend: false,
        }
      }));
    });

    expect(result.current.input).toBe('Refine this');
    expect(result.current.selectedElements).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
