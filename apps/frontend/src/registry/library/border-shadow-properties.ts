import { Type } from '@sinclair/typebox';
import { UIProperty } from '../schemas';

/**
 * Border & Shadow Properties Library
 * 
 * Common border and shadow property definitions for component schemas
 */

/**
 * Border radius property
 */
export const BorderRadiusProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Border Radius',
  description: 'Rounded corner radius in pixels',
  controlProps: {
    min: 0,
    max: 100,
    step: 1
  }
});

/**
 * Border width property
 */
export const BorderWidthProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Border Width',
  description: 'Border thickness in pixels',
  controlProps: {
    min: 0,
    max: 20,
    step: 1
  }
});

/**
 * Shadow enable property
 */
export const ShadowEnableProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Enable Shadow',
  description: 'Toggles drop shadow effect'
});

/**
 * Shadow blur property
 */
export const ShadowBlurProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Shadow Blur',
  description: 'Blur radius of the shadow in pixels',
  controlProps: {
    min: 0,
    max: 50,
    step: 1
  }
});

/**
 * Shadow color property
 */
export const ShadowColorProperty = UIProperty(Type.String(), {
  control: 'colorpicker',
  label: 'Shadow Color',
  description: 'Color of the shadow with transparency'
});

/**
 * Shadow X offset property
 */
export const ShadowOffsetXProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Shadow X Offset',
  description: 'Horizontal offset of shadow in pixels',
  controlProps: {
    min: -50,
    max: 50,
    step: 1
  }
});

/**
 * Shadow Y offset property
 */
export const ShadowOffsetYProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Shadow Y Offset',
  description: 'Vertical offset of shadow in pixels',
  controlProps: {
    min: -50,
    max: 50,
    step: 1
  }
});

/**
 * Shadow spread property
 */
export const ShadowSpreadProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Shadow Spread',
  description: 'Expansion distance of shadow in pixels',
  controlProps: {
    min: -50,
    max: 50,
    step: 1
  }
}); 