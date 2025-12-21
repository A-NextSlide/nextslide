import { describe, expect, it } from 'vitest';

import { normalizeReferenceImages } from './referenceImages';

describe('normalizeReferenceImages', () => {
  it('returns undefined for empty or non-array inputs', () => {
    expect(normalizeReferenceImages()).toBeUndefined();
    expect(normalizeReferenceImages([])).toBeUndefined();
    expect(normalizeReferenceImages([''])).toBeUndefined();
  });

  it('drops base64 strings', () => {
    const result = normalizeReferenceImages(['abc123']);
    expect(result).toBeUndefined();
  });

  it('drops data URLs', () => {
    const dataUrl = 'data:image/png;base64,abc123';
    const result = normalizeReferenceImages([dataUrl]);
    expect(result).toBeUndefined();
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
    expect(result).toEqual(['https://cdn.example.com/ref.png']);
  });
});
