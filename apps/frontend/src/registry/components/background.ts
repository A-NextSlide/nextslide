import { Type } from '@sinclair/typebox';
import { UIObject, UIEnum, TypeFromSchema, UIProperty } from '../schemas';
import { ComponentDefinition } from '../registry';
import {
  PatternTypeProperty,
  PatternColorProperty,
  PatternScaleProperty,
  PatternOpacityProperty
} from '../library/pattern-properties';
import {
  BackgroundImageUrlProperty,
  BackgroundImageSizeProperty,
  BackgroundImageRepeatProperty,
  BackgroundImageOpacityProperty
} from '../library/image-properties';

/**
 * Background types for different styling options
 */
const BACKGROUND_TYPES = {
  color: 'color',
  gradient: 'gradient',
  image: 'image',
  pattern: 'pattern'
};

/**
 * Background Component Schema
 * Used for slide backgrounds with support for colors, gradients, and patterns
 */
export const BackgroundSchema = UIObject(
  'Background',
  {
    // Note: We don't extend from BaseComponentSchema for Background
    // since it's a special component that always fills the entire slide
    
    backgroundType: UIEnum("Background Type", BACKGROUND_TYPES, "The type of background to display", {
      control: 'dropdown',
      label: 'Background Type',
    }),
    
    // Single color property that will use GradientPicker (supports both solid and gradient)
    backgroundColor: UIProperty(Type.String(), {
      control: 'gradientpicker',
      label: 'Background Color',
      description: 'Background color or gradient'
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
    
    // Image background properties
    backgroundImageUrl: Type.Optional(BackgroundImageUrlProperty),
    backgroundImageSize: BackgroundImageSizeProperty,
    backgroundImageRepeat: BackgroundImageRepeatProperty,
    backgroundImageOpacity: BackgroundImageOpacityProperty,
    
    // Pattern background properties
    patternType: Type.Optional(PatternTypeProperty),
    patternColor: PatternColorProperty,
    patternScale: PatternScaleProperty,
    patternOpacity: PatternOpacityProperty
  }
);

/**
 * Background properties type
 */
export type BackgroundProps = TypeFromSchema<typeof BackgroundSchema>;

/**
 * Background component definition
 */
export const BackgroundDefinition: ComponentDefinition<typeof BackgroundSchema> = {
  type: 'Background',
  name: 'Background',
  schema: BackgroundSchema,
  defaultProps: {
    backgroundType: 'color',
    backgroundColor: '#E8F4FDff',
    gradient: null,
    isAnimated: false,
    animationSpeed: 1,
    // Image defaults
    backgroundImageUrl: null,
    backgroundImageSize: 'cover',
    backgroundImageRepeat: 'no-repeat',
    backgroundImageOpacity: 1,
    // Pattern defaults
    patternType: null,
    patternColor: '#ccccccff',
    patternScale: 5,
    patternOpacity: 0.5
  },
  category: 'basic'
}; 