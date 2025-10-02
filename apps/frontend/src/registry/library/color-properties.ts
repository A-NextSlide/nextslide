import { Type } from '@sinclair/typebox';
import { UIProperty } from '../schemas';

/**
 * Color Properties Library
 * 
 * Helper functions and properties for colors
 */

/**
 * Creates a color property with customizable label, description, and default value
 * Supports both solid colors and gradients
 */
export function createColorProperty(label: string, description: string, defaultValue: string = '#000000ff') {
  return UIProperty(Type.String({
    description: 'Color value - solid hex color with alpha support'
  }), {
    control: 'colorpicker',
    label,
    description: description,
    controlProps: {
      defaultValue
    }
  });
}

/**
 * Creates a gradient-enabled color property using a union type
 * This shows in the type system that both solid colors and gradients are supported
 */
export function createGradientColorProperty(label: string, description: string, defaultValue: string = '#000000ff') {
  const GradientStopSchema = Type.Object({
    color: Type.String(),
    position: Type.Number()
  });

  const LinearGradientSchema = Type.Object({
    type: Type.Literal('linear'),
    angle: Type.Number(),
    stops: Type.Array(GradientStopSchema)
  });

  const RadialGradientSchema = Type.Object({
    type: Type.Literal('radial'),
    stops: Type.Array(GradientStopSchema)
  });

  // Create a union type that accepts either a string or gradient objects
  const ColorOrGradientSchema = Type.Union([
    Type.String({ description: 'Solid hex color' }),
    LinearGradientSchema,
    RadialGradientSchema
  ]);

  // Add UI metadata manually since we can't use UIProperty with unions
  return {
    ...ColorOrGradientSchema,
    _ui_type: 'UIProperty',
    title: label,
    description: description + ' (supports both solid colors and gradients)',
    metadata: {
      control: 'colorpicker',
      controlProps: {
        defaultValue
      }
    }
  };
}

/**
 * Standard text color property
 */
export const TextColorProperty = createColorProperty(
  'Text Color',
  'Color of the text with alpha channel support',
  '#000000ff'
);

/**
 * Standard background color property (transparent by default)
 */
export const BackgroundColorProperty = createColorProperty(
  'Background Color',
  'Background color with alpha channel support',
  '#00000000'
);

/**
 * Opacity property (0-1 slider)
 * Standard implementation used across components
 */
export const OpacityProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Opacity',
  description: 'Transparency level (0-1)',
  controlProps: {
    min: 0,
    max: 1,
    step: 0.01
  }
}); 