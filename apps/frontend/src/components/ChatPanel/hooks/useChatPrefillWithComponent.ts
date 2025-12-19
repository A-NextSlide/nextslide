import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction, RefObject } from 'react';
import type { SelectedElement } from '../types';

interface PrefillPayload {
  prompt: string;
  componentId: string;
  slideId: string | null;
  label: string;
  elementType: string;
}

interface UseChatPrefillWithComponentOptions {
  setSelectedElements: Dispatch<SetStateAction<SelectedElement[]>>;
  setInput: Dispatch<SetStateAction<string>>;
  input: string;
  selectedElements: SelectedElement[];
  sendMessage: () => void;
  inputRef: RefObject<HTMLTextAreaElement>;
}

export function useChatPrefillWithComponent({
  setSelectedElements,
  setInput,
  input,
  selectedElements,
  sendMessage,
  inputRef,
}: UseChatPrefillWithComponentOptions) {
  const pendingAutoSendRef = useRef<PrefillPayload | null>(null);

  useEffect(() => {
    const handlePrefillWithComponent = (event: CustomEvent) => {
      const { componentId, slideId, label, prompt, elementType, autoSend } = event.detail || {};

      if (!componentId) return;

      setSelectedElements(prev => {
        if (prev.some(s => s.elementId === componentId)) return prev;

        return [...prev, {
          elementId: componentId,
          elementType: elementType || 'CustomComponent',
          slideId: slideId || null,
          label: label || 'Custom Component',
          overlaps: [],
          bounds: null
        }];
      });

      if (prompt) {
        setInput(prompt);
      }

      if (autoSend && prompt) {
        pendingAutoSendRef.current = {
          prompt,
          componentId,
          slideId: slideId || null,
          label: label || 'Custom Component',
          elementType: elementType || 'CustomComponent'
        };
      } else {
        setTimeout(() => {
          inputRef.current?.focus();
        }, 50);
      }
    };

    window.addEventListener('chat:prefill_with_component', handlePrefillWithComponent as EventListener);

    return () => {
      window.removeEventListener('chat:prefill_with_component', handlePrefillWithComponent as EventListener);
    };
  }, [inputRef, setInput, setSelectedElements]);

  useEffect(() => {
    if (pendingAutoSendRef.current && input && selectedElements.length > 0) {
      const pending = pendingAutoSendRef.current;
      const hasSelection = selectedElements.some(s => s.elementId === pending.componentId);
      if (hasSelection && input === pending.prompt) {
        pendingAutoSendRef.current = null;
        setTimeout(() => {
          sendMessage();
        }, 100);
      }
    }
  }, [input, selectedElements, sendMessage]);
}
