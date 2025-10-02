import { Type, Static } from "@sinclair/typebox";
import { BaseComponentSchema } from "../base";
import { ComponentDefinition } from '../registry';

export const IconSchema = Type.Intersect([
  Type.Omit(BaseComponentSchema, ['textColor']),
  Type.Object({
    iconLibrary: Type.Union([
      Type.Literal('lucide'),
      Type.Literal('heroicons'),
      Type.Literal('feather'),
      Type.Literal('tabler')
    ], { default: 'lucide' }),
    iconName: Type.String({ default: 'Star' }),
    color: Type.String({ default: '#000000' }),
    strokeWidth: Type.Number({ default: 2, minimum: 0.5, maximum: 4 }),
    filled: Type.Boolean({ default: false })
  }),
]);

export type Icon = Static<typeof IconSchema>;

/**
 * Icon component definition
 */
export const IconDefinition: ComponentDefinition<typeof IconSchema> = {
  type: 'Icon',
  name: 'Icon',
  schema: IconSchema,
  defaultProps: {
    // Base component defaults (excluding textColor)
    position: { x: 500, y: 200 },
    width: 100,
    height: 100,
    opacity: 1,
    rotation: 0,
    zIndex: 1,
    // Icon-specific defaults
    iconLibrary: 'lucide',
    iconName: 'Star',
    color: '#000000',
    strokeWidth: 2,
    filled: false
  },
  category: 'basic'
}; 