// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThemePreviewState } from './useThemePreviewState';

describe('useThemePreviewState', () => {
  it('derives logo and merges tool updates', () => {
    const { result } = renderHook(() => useThemePreviewState({ outline: null, currentPhase: null }));

    act(() => {
      window.dispatchEvent(new CustomEvent('theme_preview_update', {
        detail: {
          theme: { brandInfo: { logoUrl: 'https://example.com/logo.png' } },
          tool: { label: 'theme_scan', status: 'start' },
        }
      }));
    });

    expect(result.current.themePreview?.logo?.url).toBe('https://example.com/logo.png');
    expect(result.current.isThemePreviewOpen).toBe(true);

    act(() => {
      window.dispatchEvent(new CustomEvent('theme_preview_update', {
        detail: { tool: { label: 'theme_scan', status: 'finish' } }
      }));
    });

    const tools = result.current.themePreview?.tools || [];
    const entries = tools.filter(t => t.label === 'theme_scan');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe('finish');
  });
});
