import { describe, expect, it } from 'vitest';

import { normalizeReferenceImages } from './referenceImages';

describe('normalizeReferenceImages', () => {
  it('returns undefined for empty or non-array inputs', () => {
    expect(normalizeReferenceImages()).toBeUndefined();
    expect(normalizeReferenceImages([])).toBeUndefined();
    expect(normalizeReferenceImages([''])).toBeUndefined();
  });

  it('adds data URL prefix for raw base64 strings', () => {
    const result = normalizeReferenceImages(['abc123']);
    expect(result).toEqual(['data:image/png;base64,abc123']);
  });

  it('keeps data URLs intact', () => {
    const dataUrl = 'data:image/png;base64,abc123';
    const result = normalizeReferenceImages([dataUrl]);
    expect(result).toEqual([dataUrl]);
  });

  it('keeps http URLs intact', () => {
    const url = 'https://example.com/image.png';
    const result = normalizeReferenceImages([url]);
    expect(result).toEqual([url]);
  });

  it('filters invalid entries and preserves order', () => {
    const result = normalizeReferenceImages([
      '',
      '  ',
      'foo',
      'data:image/png;base64,bar',
      'https://cdn.example.com/ref.png',
    ]);
    expect(result).toEqual([
      'data:image/png;base64,foo',
      'data:image/png;base64,bar',
      'https://cdn.example.com/ref.png',
    ]);
  });
});
