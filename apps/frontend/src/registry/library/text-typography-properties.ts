import { Type } from '@sinclair/typebox';
import { UIProperty, UIEnum } from '../schemas';
import { ALL_FONT_NAMES, FONT_CATEGORIES, COMMON_FONTS } from '../library/fonts';

/**
 * Text & Typography Properties Library
 * 
 * Common text and typography property definitions for component schemas
 */

/**
 * Font weight options
 */
export const FONT_WEIGHTS = {
  normal: 'normal',
  bold: 'bold',
  '100': '100',
  '200': '200',
  '300': '300',
  '400': '400',
  '500': '500',
  '600': '600',
  '700': '700',
  '800': '800',
  '900': '900'
};

/**
 * Font weight property
 */
export const FontWeightProperty = UIEnum('Font Weight', FONT_WEIGHTS, 'The thickness of the text', {label: 'Font Weight', control: 'dropdown'});

/**
 * Font style options
 */
export const FONT_STYLES = {
  normal: 'normal',
  italic: 'italic'
};

/**
 * Font style property
 */
export const FontStyleProperty = UIEnum('Font Style', FONT_STYLES, 'The style of the text', {label: 'Font Style', control: 'dropdown'});

/**
 * Text alignment options
 */
export const TEXT_ALIGNMENTS = {
  left: 'left',
  center: 'center',
  right: 'right',
  justify: 'justify'
};

/**
 * Text alignment property
 */
export const TextAlignProperty = UIEnum("Text Alignment", TEXT_ALIGNMENTS, 'Horizontal alignment of the text', {label: 'Text Alignment', control: 'dropdown'}, );

/**
 * Vertical alignment options
 */
export const VERTICAL_ALIGNMENTS = {
  top: 'top',
  middle: 'middle',
  bottom: 'bottom'
};

/**
 * Vertical alignment property
 */
export const VerticalAlignProperty = UIEnum("Vertical Alignment", VERTICAL_ALIGNMENTS, 'Vertical alignment of the text', {label: 'Vertical Alignment', control: 'dropdown'});

/**
 * Font family property
 */
export const FontFamilyProperty = UIEnum(
  'Font Family',
  Object.fromEntries(ALL_FONT_NAMES.map(font => [font, font])),
  'The typeface to use for this text',
  {
    control: 'grouped-dropdown',
    controlProps: {
      enumGroups: (() => {
        // Deduplicate fonts globally and assign each font to the highest-priority category
        const priorityOrder = [
          'Awwwards Picks',
          'Designer',
          'Designer Local',
          'System & Web Safe',
          'Premium',
          'Sans-Serif',
          'Serif',
          'Design',
          'Contemporary',
          'Variable',
          'Monospace',
          'Elegant',
          'Bold',
          'Modern',
          'Unique',
          'Editorial',
          'Geometric',
          'Tech & Startup',
          'Luxury',
          'Retro',
          'Pixel & Retro Display',
          'Branding'
        ];
        const seen = new Set<string>();
        const result: Record<string, string[]> = {};
        priorityOrder.forEach(category => {
          const fonts = FONT_CATEGORIES[category] || [];
          for (const def of fonts) {
            if (!seen.has(def.name)) {
              seen.add(def.name);
              if (!result[category]) result[category] = [];
              result[category].push(def.name);
            }
          }
        });
        return result;
      })(),
      default: 'Poppins'
    }
  }
);

/**
 * Font size property
 */
export const FontSizeProperty = UIProperty(Type.Number(), {
  control: 'editable-dropdown',
  label: 'Font Size',
  description: 'The size of the text in pixels',
  controlProps: {
    enumValues: ['18', '24', '36', '48', '60', '72', '96', '120'],
    min: 8,
    max: 200
  }
});

/**
 * Font size property with "Size" label (matching original)
 */
export const FontSizePropertyWithSizeLabel = UIProperty(Type.Number(), {
  control: 'editable-dropdown',
  label: 'Size',
  description: 'The size of the text in pixels',
  controlProps: {
    enumValues: ['18', '24', '36', '48', '60', '72', '96', '120', '144'],
    min: 8,
    max: 200
  }
});

/**
 * Line height property
 */
export const LineHeightProperty = UIProperty(Type.Number(), {
  control: 'editable-dropdown',
  label: 'Line Height',
  description: 'Spacing between lines of text',
  controlProps: {
    enumValues: ['1', '1.2', '1.5', '1.8', '2', '2.5'],
    min: 0.5,
    max: 3,
    step: 0.1
  }
});

/**
 * Letter spacing property
 */
export const LetterSpacingProperty = UIProperty(Type.Number(), {
  control: 'editable-dropdown',
  label: 'Letter Spacing',
  description: 'Spacing between characters',
  controlProps: {
    enumValues: ['0', '0.5', '1', '1.5', '2', '2.5', '3'],
    min: -5,
    max: 20,
    step: 0.5
  }
}); 