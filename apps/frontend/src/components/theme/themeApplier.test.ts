import { describe, expect, it } from 'vitest';

import { buildThemeSlideUpdates } from './themeApplier';
import { Theme } from '@/types/themes';
import { SlideData } from '@/types/SlideTypes';
import { ComponentInstance } from '@/types/components';

const baseTheme: Theme = {
  name: 'Test Theme',
  page: { backgroundColor: '#ffffff' },
  typography: {
    paragraph: {
      fontFamily: 'Inter',
      color: '#111111',
      fontSize: '16px',
      fontWeight: 400
    },
    heading: {
      fontFamily: 'Inter',
      color: '#111111',
      fontWeight: 700
    }
  },
  accent1: '#ff5500',
  accent2: '#00aa88'
};

const makeSlide = (components: ComponentInstance[]): SlideData => ({
  id: 'slide-1',
  deckId: 'deck-1',
  order: 0,
  components,
  status: 'completed'
});

describe('buildThemeSlideUpdates', () => {
  it('returns empty when theme is missing required fields', () => {
    const theme = { ...baseTheme, page: { backgroundColor: '' } } as Theme;
    const updates = buildThemeSlideUpdates({
      theme,
      slides: [],
      slideIds: []
    });
    expect(updates).toEqual([]);
  });

  it('applies theme values to supported component types', () => {
    const components: ComponentInstance[] = [
      {
        id: 'bg',
        type: 'Background',
        props: { backgroundColor: '#000000', backgroundType: 'color', color: '#000000' }
      },
      {
        id: 'text',
        type: 'TiptapTextBlock',
        props: { fontFamily: 'Old', textColor: '#222222' }
      },
      {
        id: 'icon',
        type: 'Icon',
        props: { color: '#333333' }
      },
      {
        id: 'custom',
        type: 'CustomComponent',
        props: { render: '<!DOCTYPE html><html></html>', props: {} }
      }
    ];
    const slide = makeSlide(components);

    const updates = buildThemeSlideUpdates({
      theme: baseTheme,
      slides: [slide],
      slideIds: ['slide-1']
    });

    expect(updates).toHaveLength(1);
    const updated = updates[0].components;
    const bg = updated.find(comp => comp.type === 'Background') as ComponentInstance;
    const text = updated.find(comp => comp.type === 'TiptapTextBlock') as ComponentInstance;
    const icon = updated.find(comp => comp.type === 'Icon') as ComponentInstance;
    const custom = updated.find(comp => comp.type === 'CustomComponent') as ComponentInstance;

    expect(bg.props?.backgroundColor).toBe(baseTheme.page.backgroundColor);
    expect(text.props?.fontFamily).toBe(baseTheme.typography.paragraph.fontFamily);
    expect(text.props?.textColor).toBe(baseTheme.typography.paragraph.color);
    expect(icon.props?.color).toBe(baseTheme.accent1);
    expect(custom.props?.fontFamily).toBe(baseTheme.typography.paragraph.fontFamily);
    expect(custom.props?.heroFont).toBe(baseTheme.typography.heading?.fontFamily);
    expect((custom.props?.props as Record<string, any>)?.textColor).toBe(baseTheme.typography.paragraph.color);
  });

  it('adds a background component when missing', () => {
    const slide = makeSlide([
      {
        id: 'text',
        type: 'TiptapTextBlock',
        props: { fontFamily: 'Old', textColor: '#222222' }
      }
    ]);

    const updates = buildThemeSlideUpdates({
      theme: baseTheme,
      slides: [slide],
      slideIds: ['slide-1']
    });

    expect(updates).toHaveLength(1);
    expect(updates[0].components[0].type).toBe('Background');
  });
});
