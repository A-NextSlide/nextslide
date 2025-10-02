import { Type } from '@sinclair/typebox';
import { UIProperty, UIEnum, UIObject } from '../schemas';
import { createColorProperty, OpacityProperty } from './color-properties';

/**
 * Pattern Properties Library
 * 
 * Common pattern property definitions for component schemas
 */

/**
 * Pattern type options
 */
export const PATTERN_TYPES = {
  dots: 'dots',
  lines: 'lines',
  checkered: 'checkered',
  grid: 'grid'
};

/**
 * Pattern type property
 */
export const PatternTypeProperty = UIEnum(
  'Pattern Type',
  PATTERN_TYPES,
  'Type of pattern to display',
  {
    control: 'dropdown',
    label: 'Pattern Type',
  }
);

/**
 * Pattern color property
 */
export const PatternColorProperty = createColorProperty('Pattern Color', 'Color of the pattern elements', '#ccccccff');

/**
 * Pattern scale property
 */
export const PatternScaleProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Pattern Scale',
  description: 'Size of the pattern elements',
  controlProps: {
    min: 1,
    max: 20,
    step: 1
  }
});

/**
 * Pattern opacity property
 */
export const PatternOpacityProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Pattern Opacity',
  description: 'Transparency level of the pattern',
  controlProps: {
    min: 0,
    max: 1,
    step: 0.01
  }
}); 