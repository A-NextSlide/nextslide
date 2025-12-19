import { describe, expect, it } from 'vitest';

import { extractSlideUpdate, mergeComponentsPreservingImages } from './slideUpdates';
import { ComponentInstance } from '@/types/components';

describe('mergeComponentsPreservingImages', () => {
  it('keeps an existing image src when new component is placeholder', () => {
    const existing: ComponentInstance[] = [
      {
        id: 'img-1',
        type: 'Image',
        props: {
          src: 'https://example.com/real.png',
          alt: 'Real image',
          autoApplied: true
        }
      }
    ];
    const incoming: ComponentInstance[] = [
      {
        id: 'img-1',
        type: 'Image',
        props: {
          src: 'placeholder'
        }
      }
    ];

    const merged = mergeComponentsPreservingImages(existing, incoming);
    expect(merged[0].props?.src).toBe('https://example.com/real.png');
  });
});

describe('extractSlideUpdate', () => {
  it('extracts slide data from slide_generated events', () => {
    const evt = {
      type: 'slide_generated',
      slide_index: 2,
      slide_data: { id: 'slide-3', components: [] }
    };

    expect(extractSlideUpdate(evt)).toEqual({
      slideIndex: 2,
      slideData: { id: 'slide-3', components: [] }
    });
  });
});
