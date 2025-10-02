import { Type } from '@sinclair/typebox';
import { UIObject, UIEnum, UIProperty, TypeFromSchema } from '../schemas';
import { BaseComponentSchema, baseComponentDefaults } from '../base';
import { ComponentDefinition } from '../registry';
import { createColorProperty } from '../library/color-properties';

/**
 * WavyLines Component Schema
 * Renders an SVG field of evenly spaced sine/contour lines for decorative backgrounds.
 */
export const WavyLinesSchema = UIObject(
  'WavyLines',
  {
    // Base layout/visibility props
    position: BaseComponentSchema.properties.position,
    width: BaseComponentSchema.properties.width,
    height: BaseComponentSchema.properties.height,
    opacity: BaseComponentSchema.properties.opacity,
    rotation: BaseComponentSchema.properties.rotation,
    zIndex: BaseComponentSchema.properties.zIndex,

    // Look and feel
    variant: UIEnum(
      'Variant',
      { sine: 'sine', mesh: 'mesh', contours: 'contours' },
      'Line field style',
      { control: 'dropdown', label: 'Variant' }
    ),

    lineColor: createColorProperty('Line Color', 'Stroke color for the lines', '#c32428cc'),

    strokeWidth: UIProperty(Type.Number({ default: 2, minimum: 0.5, maximum: 12 }), {
      control: 'slider',
      label: 'Stroke Width',
      controlProps: { min: 0.5, max: 12, step: 0.5 }
    }),

    linesCount: UIProperty(Type.Number({ default: 36, minimum: 1, maximum: 200 }), {
      control: 'slider',
      label: 'Lines',
      controlProps: { min: 1, max: 200, step: 1 }
    }),

    spacing: UIProperty(Type.Number({ default: 26, minimum: 2, maximum: 200 }), {
      control: 'slider',
      label: 'Spacing',
      description: 'Vertical distance between adjacent lines (px)',
      controlProps: { min: 2, max: 200, step: 1 }
    }),

    amplitude: UIProperty(Type.Number({ default: 120, minimum: 0, maximum: 600 }), {
      control: 'slider',
      label: 'Amplitude',
      description: 'Wave height (px)',
      controlProps: { min: 0, max: 600, step: 1 }
    }),

    frequency: UIProperty(Type.Number({ default: 1.2, minimum: 0.05, maximum: 8 }), {
      control: 'slider',
      label: 'Frequency',
      description: 'Number of wave cycles across width',
      controlProps: { min: 0.05, max: 8, step: 0.05 }
    }),

    phase: UIProperty(Type.Number({ default: 0 }), {
      control: 'slider',
      label: 'Phase',
      description: 'Phase offset in radians',
      controlProps: { min: -Math.PI * 4, max: Math.PI * 4, step: 0.1 }
    }),

    phaseIncrement: UIProperty(Type.Number({ default: 0.12 }), {
      control: 'slider',
      label: 'Per-line Phase Offset',
      description: 'Extra phase added for each subsequent line',
      controlProps: { min: -2, max: 2, step: 0.01 }
    }),

    baseY: UIProperty(Type.Number({ default: 720 }), {
      control: 'slider',
      label: 'Base Y',
      description: 'Vertical center of the field (px)',
      controlProps: { min: 0, max: 1080, step: 1 }
    }),

    blendMode: UIEnum(
      'Blend Mode',
      { normal: 'normal', screen: 'screen', lighten: 'lighten', overlay: 'overlay', softlight: 'soft-light', multiply: 'multiply' },
      'CSS mix-blend-mode for the lines',
      { control: 'dropdown', label: 'Blend Mode' }
    ),
  }
);

export type WavyLinesProps = TypeFromSchema<typeof WavyLinesSchema>;

export const WavyLinesDefinition: ComponentDefinition<typeof WavyLinesSchema> = {
  type: 'WavyLines',
  name: 'Wavy Lines',
  schema: WavyLinesSchema,
  defaultProps: {
    ...baseComponentDefaults,
    position: { x: 0, y: 0 },
    width: 1920,
    height: 1080,
    opacity: 0.45,
    rotation: 0,
    zIndex: 1,
    variant: 'sine',
    lineColor: '#c32428cc',
    strokeWidth: 2,
    linesCount: 36,
    spacing: 26,
    amplitude: 120,
    frequency: 1.2,
    phase: 0,
    phaseIncrement: 0.12,
    baseY: 720,
    blendMode: 'screen'
  },
  category: 'basic'
};


