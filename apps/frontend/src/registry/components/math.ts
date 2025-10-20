import { Type } from '@sinclair/typebox';
import { UIObject, UIProperty, TypeFromSchema } from '../schemas';
import { BaseComponentSchema, baseComponentDefaults } from '../base';
import { ComponentDefinition } from '../registry';
import { createColorProperty } from '../library/color-properties';
import { BorderRadiusProperty } from '../library/border-shadow-properties';

/**
 * Math Component Schema
 * Renders mathematical equations and formulas using LaTeX/KaTeX
 */
export const MathSchema = UIObject(
  'Math',
  {
    ...BaseComponentSchema.properties,
    
    latex: UIProperty(Type.String(), {
      control: 'textarea',
      label: 'LaTeX Expression',
      description: 'Mathematical expression in LaTeX format'
    }),
    
    displayMode: UIProperty(Type.Boolean(), {
      control: 'checkbox',
      label: 'Display Mode',
      description: 'Display as block-level math (centered, larger) vs inline math'
    }),
    
    fontSize: UIProperty(Type.Number({ minimum: 8, maximum: 200 }), {
      control: 'slider',
      label: 'Font Size',
      description: 'Font size in pixels for the rendered math',
      controlProps: { min: 8, max: 200, step: 1 }
    }),
    
    color: createColorProperty(
      'Color',
      'Color of the mathematical expression',
      '#000000ff'
    ),
    
    backgroundColor: createColorProperty(
      'Background Color',
      'Background color behind the math expression',
      '#00000000'
    ),
    
    padding: UIProperty(Type.Number({ minimum: 0, maximum: 100 }), {
      control: 'slider',
      label: 'Padding',
      description: 'Padding around the math expression in pixels',
      controlProps: { min: 0, max: 100, step: 1 }
    }),
    
    borderRadius: BorderRadiusProperty
  }
);

/**
 * Math properties type
 */
export type MathProps = TypeFromSchema<typeof MathSchema>;

/**
 * Math component definition
 */
export const MathDefinition: ComponentDefinition<typeof MathSchema> = {
  type: 'Math',
  name: 'Math',
  schema: MathSchema,
  defaultProps: {
    ...baseComponentDefaults,
    latex: 'f(x) = x^2',
    displayMode: true,
    fontSize: 32,
    color: '#000000ff',
    backgroundColor: '#00000000',
    padding: 3,
    borderRadius: 8,
    width: 800,
    height: 200
  },
  category: 'data'
};

