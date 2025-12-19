// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useChatSuggestions } from './useChatSuggestions';
import { DEFAULT_SUGGESTION, OUTLINE_SUGGESTIONS } from '@/components/chat';

describe('useChatSuggestions', () => {
  it('returns default suggestion first in edit mode', async () => {
    const { result } = renderHook(() => useChatSuggestions(false, false));
    await waitFor(() => result.current.length > 0);

    expect(result.current).toHaveLength(4);
    expect(result.current[0]).toEqual(DEFAULT_SUGGESTION);
  });

  it('returns outline suggestions in outline mode', async () => {
    const { result } = renderHook(() => useChatSuggestions(true, true));
    await waitFor(() => result.current.length > 0);

    expect(result.current).toHaveLength(4);
    result.current.forEach((suggestion) => {
      expect(OUTLINE_SUGGESTIONS).toContain(suggestion.prompt);
    });
  });
});
