import { UIObject, TypeFromSchema } from './schemas';
import { PositionProperty } from './library/size-position-properties';
import { WidthProperty, HeightProperty } from './library/size-position-properties';
import { OpacityProperty } from './library/color-properties';
import { RotationProperty, ZIndexProperty } from './library/size-position-properties';
import { TextColorProperty } from './library/color-properties';

/**
 * Base Component Schema
 * Defines properties common to all component types
 */
export const BaseComponentSchema = UIObject(
  'BaseComponent',
  {
    position: PositionProperty,
    width: WidthProperty,
    height: HeightProperty,
    opacity: OpacityProperty,
    rotation: RotationProperty,
    zIndex: ZIndexProperty,
    textColor: TextColorProperty
}, 'Properties for all components');

/**
 * Type definition for the base component properties
 */
export type BaseComponentProps = TypeFromSchema<typeof BaseComponentSchema>;

/**
 * Default values for base component properties
 */
export const baseComponentDefaults: BaseComponentProps = {
  position: { x: 500, y: 200 }, // Center of 1920x1080 slide
  width: 1000,
  height: 600,
  opacity: 1,
  rotation: 0,
  zIndex: 1,
  textColor: '#000000'
}; 