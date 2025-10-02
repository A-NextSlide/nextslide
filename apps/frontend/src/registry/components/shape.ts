import { Type } from '@sinclair/typebox';
import { UIObject, UIEnum, TypeFromSchema, UIProperty, UIArray } from '../schemas';
import { BaseComponentSchema, baseComponentDefaults } from '../base';
import { ComponentDefinition } from '../registry';
import { 
  BorderWidthProperty,
  BorderRadiusProperty,
  ShadowEnableProperty,
  ShadowBlurProperty,
  ShadowColorProperty,
  ShadowOffsetXProperty,
  ShadowOffsetYProperty,
  ShadowSpreadProperty
} from '../library/border-shadow-properties';
import {
  createColorProperty
} from '../library/color-properties';
import {
  FontFamilyProperty,
  FontSizePropertyWithSizeLabel,
  FontWeightProperty,
  FontStyleProperty,
  LetterSpacingProperty,
  LineHeightProperty,
  TextAlignProperty,
  VerticalAlignProperty
} from '../library/text-typography-properties';
import { PaddingProperty } from '../library/size-position-properties';

// Mapping for inline style value types
const InlineStyleValueTypes = {
  textColor: Type.String(),
  backgroundColor: Type.String(),
  bold: Type.Boolean(),
  italic: Type.Boolean(),
  underline: Type.Boolean(),
  strike: Type.Boolean(),
  highlight: Type.Boolean(),
  subscript: Type.Boolean(),
  superscript: Type.Boolean(),
  color: Type.String(),
  link: Type.Boolean(),
  href: Type.String()
};

/**
 * Shape types definition with labels for UI display
 */
export const SHAPE_TYPES = {
  rectangle: { type: 'rectangle', label: 'Rectangle' },
  circle: { type: 'circle', label: 'Circle' },
  ellipse: { type: 'ellipse', label: 'Ellipse' },
  triangle: { type: 'triangle', label: 'Triangle' },
  star: { type: 'star', label: 'Star' },
  hexagon: { type: 'hexagon', label: 'Hexagon' },
  pentagon: { type: 'pentagon', label: 'Pentagon' },
  diamond: { type: 'diamond', label: 'Diamond' },
  arrow: { type: 'arrow', label: 'Arrow' },
  heart: { type: 'heart', label: 'Heart' }
};

/**
 * Simple Shape types for TypeBox enum definition
 * This is derived from the main SHAPE_TYPES object
 */
export const SHAPE_TYPE_VALUES = Object.fromEntries(
  Object.entries(SHAPE_TYPES).map(([key, value]) => [key, value.type])
);

/**
 * Shape Component Schema
 * Creates vector-based shapes for visual elements and design
 */
export const ShapeSchema = UIObject(
  'Shape',
  {
    // Include base properties but exclude textColor since shapes don't have text
    position: BaseComponentSchema.properties.position,
    width: BaseComponentSchema.properties.width,
    height: BaseComponentSchema.properties.height,
    opacity: BaseComponentSchema.properties.opacity,
    rotation: BaseComponentSchema.properties.rotation,
    zIndex: BaseComponentSchema.properties.zIndex,
    
    shapeType: UIEnum("Shape Type", SHAPE_TYPE_VALUES, "The geometric shape to render", {
      control: 'dropdown',
      label: 'Shape Type',
    }),
    
    // Single fill property that uses GradientPicker (supports both solid and gradient)
    fill: UIProperty(Type.String(), {
      control: 'gradientpicker',
      label: 'Fill Color',
      description: 'Shape fill color or gradient'
    }),
    
    // Gradient object property (for storing gradient data)
    gradient: Type.Optional(Type.Object({
      type: Type.Union([Type.Literal('linear'), Type.Literal('radial')]),
      angle: Type.Number(),
      stops: Type.Array(Type.Object({
        color: Type.String(),
        position: Type.Number()
      }))
    })),
    
    // Animation properties for gradients
    isAnimated: UIProperty(Type.Boolean(), {
      control: 'checkbox',
      label: 'Animate Gradient',
      description: 'Enable gradient animation'
    }),
    
    animationSpeed: UIProperty(Type.Number(), {
      control: 'slider',
      label: 'Animation Speed',
      description: 'Speed of gradient animation',
      controlProps: {
        min: 0.1,
        max: 3,
        step: 0.1
      }
    }),
    
    stroke: createColorProperty(
      'Stroke Color',
      'Border color with alpha channel support',
      '#00000000'
    ),
    
    strokeWidth: BorderWidthProperty,
    
    borderRadius: BorderRadiusProperty,
    
    // Shadow properties
    shadow: ShadowEnableProperty,
    shadowBlur: ShadowBlurProperty,
    shadowColor: ShadowColorProperty,
    shadowOffsetX: ShadowOffsetXProperty,
    shadowOffsetY: ShadowOffsetYProperty,
    shadowSpread: ShadowSpreadProperty,
    
    // Text content properties (similar to TiptapTextBlock)
    texts: Type.Optional(UIArray('Styled Text Segments',
      UIObject('Styled Text Segment', {
        text: Type.String(),
        style: UIObject('Inline Text Style', InlineStyleValueTypes)
      }),
      'Internal structured content representation')),
    
    // Text styling properties
    fontFamily: Type.Optional(FontFamilyProperty),
    fontSize: Type.Optional(FontSizePropertyWithSizeLabel),
    fontWeight: Type.Optional(FontWeightProperty),
    fontStyle: Type.Optional(FontStyleProperty),
    textColor: Type.Optional(createColorProperty(
      'Text Color',
      'Color of the text',
      '#000000ff'
    )),
    letterSpacing: Type.Optional(LetterSpacingProperty),
    lineHeight: Type.Optional(LineHeightProperty),
    alignment: Type.Optional(TextAlignProperty),
    verticalAlignment: Type.Optional(VerticalAlignProperty),
    textPadding: Type.Optional(PaddingProperty),
    fontOptimized: Type.Optional(Type.Boolean({ default: false })),
    
    // Control whether shape has text
    hasText: Type.Optional(UIProperty(Type.Boolean(), {
      control: 'checkbox',
      label: 'Enable Text',
      description: 'Allow text content inside the shape'
    }))
  }
);

/**
 * Shape properties type
 */
export type ShapeProps = TypeFromSchema<typeof ShapeSchema>;

/**
 * Shape component definition
 */
export const ShapeDefinition: ComponentDefinition<typeof ShapeSchema> = {
  type: 'Shape',
  name: 'Shape',
  schema: ShapeSchema,
  defaultProps: {
    // Base component defaults (excluding textColor)
    position: { x: 500, y: 200 },
    width: 300,
    height: 200,
    opacity: 1,
    rotation: 0,
    zIndex: 1,
    // Shape-specific defaults
    shapeType: 'rectangle',
    fill: '#4287f5ff',
    gradient: null,
    isAnimated: false,
    animationSpeed: 1,
    stroke: '#000000ff',
    strokeWidth: 0,
    borderRadius: 0,
    // Shadow defaults
    shadow: false,
    shadowBlur: 10,
    shadowColor: '#0000004D',
    shadowOffsetX: 0,
    shadowOffsetY: 4,
    shadowSpread: 0,
    // Text defaults
    hasText: false,
    texts: null,
    fontFamily: 'Poppins',
    fontSize: 36,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textColor: '#000000ff',
    letterSpacing: 0,
    lineHeight: 1.5,
    alignment: 'center',
    verticalAlignment: 'middle',
    textPadding: 10,
    fontOptimized: false
  },
  category: 'basic'
}; 