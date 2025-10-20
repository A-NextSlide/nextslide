import { Type } from '@sinclair/typebox';
import { UIObject, UIProperty, UIEnum, TypeFromSchema } from '../schemas';
import { BaseComponentSchema, baseComponentDefaults } from '../base';
import { ComponentDefinition } from '../registry';
import { createColorProperty } from '../library/color-properties';
import { BorderRadiusProperty } from '../library/border-shadow-properties';

/**
 * Diagram theme enum values
 */
const DiagramTheme = {
  DEFAULT: 'default',
  NEUTRAL: 'neutral',
  DARK: 'dark',
  FOREST: 'forest',
  BASE: 'base'
} as const;

/**
 * Diagram Component Schema
 * Renders diagrams using Mermaid.js (flowcharts, sequence diagrams, etc.)
 */
export const DiagramSchema = UIObject(
  'Diagram',
  {
    ...BaseComponentSchema.properties,
    
    mermaid: UIProperty(Type.String(), {
      control: 'textarea',
      label: 'Mermaid Diagram Code',
      description: 'Diagram definition in Mermaid syntax (flowcharts, sequence diagrams, etc.)'
    }),
    
    theme: UIEnum('Theme', DiagramTheme, 'Visual theme for the diagram', {
      control: 'dropdown'
    }),
    
    backgroundColor: createColorProperty(
      'Background Color',
      'Background color behind the diagram',
      '#00000000'
    ),
    
    padding: UIProperty(Type.Number({ minimum: 0, maximum: 100 }), {
      control: 'slider',
      label: 'Padding',
      description: 'Padding around the diagram in pixels',
      controlProps: { min: 0, max: 100, step: 1 }
    }),
    
    borderRadius: BorderRadiusProperty
  }
);

/**
 * Diagram properties type
 */
export type DiagramProps = TypeFromSchema<typeof DiagramSchema>;

/**
 * Diagram component definition
 */
export const DiagramDefinition: ComponentDefinition<typeof DiagramSchema> = {
  type: 'Diagram',
  name: 'Diagram',
  schema: DiagramSchema,
  defaultProps: {
    ...baseComponentDefaults,
    mermaid: 'graph TD\n    A[Start] --> B[Process]\n    B --> C[End]',
    theme: 'default',
    backgroundColor: '#00000000',
    padding: 3,
    borderRadius: 8,
    width: 800,
    height: 400
  },
  category: 'data'
};

