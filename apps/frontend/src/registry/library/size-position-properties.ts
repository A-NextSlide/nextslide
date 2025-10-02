import { Type } from '@sinclair/typebox';
import { UIObject, UIProperty } from '../schemas';

/**
 * Size & Position Properties Library
 * 
 * Common size and position property definitions for component schemas
 */

/**
 * Width property
 */
export const WidthProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Width',
  description: 'Width in pixels',
  controlProps: {
    min: 1,
    max: 1920,
    step: 1
  }
});

/**
 * Height property
 */
export const HeightProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Height',
  description: 'Height in pixels',
  controlProps: {
    min: 1,
    max: 1080,
    step: 1
  }
});

export const PositionProperty = UIObject('Position', {
  x: UIProperty(Type.Number(), {
    control: 'slider',
    label: 'X',
    description: 'X position on the slide'
  }),
  y: UIProperty(Type.Number(), {
    control: 'slider',
    label: 'Y',
    description: 'Y position on the slide'
  })
}, 'Position on the slide (x, y coordinates)');


/**
 * Rotation property (0-360 degrees)
 */
export const RotationProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Rotation',
  description: 'Rotation angle in degrees',
  controlProps: {
    min: 0,
    max: 360,
    step: 1
  }
});

/**
 * Z-Index property for stacking order
 */
export const ZIndexProperty = UIProperty(Type.Number(), {
  control: 'input',
  label: 'Z-Index',
  description: 'Stacking order (higher appears in front)'
});

/**
 * Padding property
 */
export const PaddingProperty = UIProperty(Type.Number(), {
  control: 'editable-dropdown',
  label: 'Padding',
  description: 'Spacing between lines of text',
  controlProps: {
    enumValues: ['4', '8', '12', '16', '20', '24', '28'],
    min: 0,
    max: 60,
    step: 4
  }
}); 