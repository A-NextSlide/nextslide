/**
 * ReactBits Component TypeBox Definition
 */

import { Type } from '@sinclair/typebox';
import { ComponentDefinition } from '../registry';
import { BaseComponentSchema } from '../base';
import { UIProperty, UIObject } from '../schemas';

/**
 * ReactBits Component Schema
 * This is a meta-component that wraps ReactBits animated components
 */
export const ReactBitsSchema = Type.Composite([
  BaseComponentSchema,
  UIObject(
    'ReactBits Properties',
    {
      reactBitsId: UIProperty(
        Type.String(),
        {
          control: 'input',
          label: 'Component ID',
          description: 'The ReactBits component identifier',
        }
      ),
    },
    'Properties specific to ReactBits components'
  ),
]);

/**
 * ReactBits Component Definition
 */
export const ReactBitsDefinition: ComponentDefinition = {
  type: 'ReactBits',
  name: 'ReactBits Component',
  category: 'advanced',
  schema: ReactBitsSchema,
  defaultProps: {
    position: { x: 100, y: 100 },
    width: 400,
    height: 300,
    opacity: 1,
    rotation: 0,
    zIndex: 1,
    reactBitsId: '',
  },
  renderer: 'ReactBits',
};
