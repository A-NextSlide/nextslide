import { Type } from '@sinclair/typebox';
import { UIObject, UIArray, TypeFromSchema, UIRecord, UIEnum } from '../schemas';
import { BaseComponentSchema, baseComponentDefaults } from '../base';
import { ComponentDefinition } from '../registry';
import {
  FontSizePropertyWithSizeLabel,
  LineHeightProperty,
  LetterSpacingProperty,
  TextAlignProperty,
  FontWeightProperty,
  VerticalAlignProperty,
  FontFamilyProperty,
  FontStyleProperty
} from '../library/text-typography-properties';
import { PaddingProperty } from '../library/size-position-properties';
import { TextColorProperty, BackgroundColorProperty, createColorProperty } from '../library/color-properties';

// Enum for keys allowed in the inline style record
export const InlineStyleKeys = UIEnum('Inline Style Keys', {
  // Only include styles that make sense for inline overrides
  textColor: 'Text Color',
  backgroundColor: 'Background Color',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strike: 'Strikethrough'
}, 'Style properties that can be applied to individual text segments', {
  // Optional: Add UI hints if this enum itself needs a control
});

// Mapping for inline style value types
const InlineStyleValueTypes = {
  textColor: TextColorProperty,
  backgroundColor: BackgroundColorProperty,
  bold: Type.Boolean(),
  italic: Type.Boolean(),
  underline: Type.Boolean(),
  strike: Type.Boolean(),
};


// Union type for allowed inline style values
export const InlineStyleProps = Type.Union(Object.values(InlineStyleValueTypes));

export const TiptapTextBlockSchema = UIObject(
  'TiptapTextBlock',
  {
    ...BaseComponentSchema.properties,

  // Internal content property
  texts: UIArray('Styled Text Segments',
    UIObject('Styled Text Segment', {
      text: Type.String(),
      // Use the refined InlineStyleKeys and InlineStyleProps
      style: UIObject('Inline Text Style', InlineStyleValueTypes)
    }),
    'Internal structured content representation'),

  // Block-level style properties (these remain as they are)
  fontFamily: FontFamilyProperty,

  fontSize: FontSizePropertyWithSizeLabel,

  fontWeight: FontWeightProperty,

  fontStyle: FontStyleProperty,

  textColor: createColorProperty(
    'Text Color',
    'Color of the text',
    '#000000ff'
  ),

  backgroundColor: BackgroundColorProperty,

  letterSpacing: LetterSpacingProperty,

  lineHeight: LineHeightProperty,

  alignment: TextAlignProperty,

  verticalAlignment: VerticalAlignProperty,

  padding: PaddingProperty,

  // Font optimization flag
  fontOptimized: Type.Optional(Type.Boolean({ default: false }))
});

/**
 * Tiptap Text Block properties type
 */
export type TiptapTextBlockProps = TypeFromSchema<typeof TiptapTextBlockSchema>;

/**
 * Tiptap Text Block component definition
 */
export const TiptapTextBlockDefinition: ComponentDefinition<typeof TiptapTextBlockSchema> = {
  type: 'TiptapTextBlock',
  name: 'Text',
  schema: TiptapTextBlockSchema,
  defaultProps: {
    position: baseComponentDefaults.position,
    width: 800,
    height: 130,
    opacity: baseComponentDefaults.opacity,
    rotation: baseComponentDefaults.rotation,
    zIndex: baseComponentDefaults.zIndex,
    textColor: '#000000ff',
    // Proper Tiptap doc format instead of legacy array
    texts: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'New Text',
              style: {}
            }
          ]
        }
      ]
    },
    fontFamily: 'Poppins',
    fontSize: 60,
    fontWeight: 'normal',
    fontStyle: 'normal',
    backgroundColor: '#00000000',
    letterSpacing: 0,
    lineHeight: 1.5,
    alignment: 'left',
    verticalAlignment: 'top',
    padding: 10
  },
  category: 'basic'
}; 