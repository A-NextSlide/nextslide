import { useEffect, useState } from 'react';
import { ALL_SUGGESTIONS, DEFAULT_SUGGESTION, OUTLINE_SUGGESTIONS, sampleArray } from '@/components/chat';

export function useChatSuggestions(outlineMode: boolean, useOutlineAgent: boolean) {
  const [suggestions, setSuggestions] = useState<{ label: string; prompt: string }[]>([]);

  useEffect(() => {
    if (outlineMode && useOutlineAgent) {
      const sampled = sampleArray(OUTLINE_SUGGESTIONS, 4);
      setSuggestions(sampled.map(s => ({ label: s, prompt: s })));
    } else {
      const sampled = sampleArray(ALL_SUGGESTIONS, 3);
      setSuggestions([DEFAULT_SUGGESTION, ...sampled]);
    }
  }, [outlineMode, useOutlineAgent]);

  return suggestions;
}
