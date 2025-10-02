import { Type } from '@sinclair/typebox';
import { UIObject, UIArray, TypeFromSchema, UIProperty } from '../schemas';
import { BaseComponentSchema } from '../base';
import { ComponentDefinition } from '../registry';

/**
 * Group Component Schema
 * Container for grouping multiple components together
 */
export const GroupSchema = UIObject(
  'Group',
  {
    // Include base properties
    position: BaseComponentSchema.properties.position,
    width: BaseComponentSchema.properties.width,
    height: BaseComponentSchema.properties.height,
    opacity: BaseComponentSchema.properties.opacity,
    rotation: BaseComponentSchema.properties.rotation,
    zIndex: BaseComponentSchema.properties.zIndex,
    
    // Group-specific properties
    children: UIArray(
      'Child Components',
      Type.String(),
      'IDs of child components in this group'
    ),
    
    locked: UIProperty(Type.Boolean(), {
      control: 'checkbox',
      label: 'Lock Group',
      description: 'Prevent ungrouping'
    })
  }
);

/**
 * Group properties type
 */
export type GroupProps = TypeFromSchema<typeof GroupSchema>;

/**
 * Group component definition
 */
export const GroupDefinition: ComponentDefinition<typeof GroupSchema> = {
  type: 'Group',
  name: 'Group',
  schema: GroupSchema,
  defaultProps: {
    position: { x: 0, y: 0 },
    width: 200,
    height: 200,
    opacity: 1,
    rotation: 0,
    zIndex: 1,
    children: [],
    locked: false
  },
  category: 'layout'
}; 