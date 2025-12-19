import { describe, expect, it } from 'vitest';
import { injectIframeFonts } from './iframeFonts';

const baseHtml = '<!DOCTYPE html><html><head></head><body><h1>Title</h1></body></html>';

describe('injectIframeFonts', () => {
  it('returns original HTML when no fonts provided', () => {
    expect(injectIframeFonts(baseHtml, {})).toBe(baseHtml);
  });

  it('injects font marker and CSS variables', () => {
    const result = injectIframeFonts(baseHtml, { bodyFont: 'Inter', heroFont: 'Bebas Neue' });
    expect(result).toContain('NEXTSLIDE FONTS');
    expect(result).toContain('--ns-body-font');
    expect(result).toContain('--ns-hero-font');
    expect(result).toContain('Inter');
    expect(result).toContain('Bebas Neue');
  });

  it('replaces existing injection to avoid duplicates', () => {
    const first = injectIframeFonts(baseHtml, { bodyFont: 'Inter', heroFont: 'Inter' });
    const second = injectIframeFonts(first, { bodyFont: 'Inter', heroFont: 'Inter' });
    const markerCount = (second.match(/NEXTSLIDE FONTS/g) || []).length;
    expect(markerCount).toBe(2); // start + end markers only
  });
});
