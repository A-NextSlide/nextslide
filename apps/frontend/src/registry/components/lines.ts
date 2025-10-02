import { Type } from '@sinclair/typebox';
import { UIObject, UIEnum, UIProperty, TypeFromSchema } from '../schemas';
import { BaseComponentSchema, baseComponentDefaults } from '../base';
import { ComponentDefinition } from '../registry';
import { 
  BorderWidthProperty
} from '../library/border-shadow-properties';
import {
  createColorProperty
} from '../library/color-properties';

/**
 * Line end shape types
 */
export const LINE_END_SHAPES = {
  none: { type: 'none', label: 'None' },
  arrow: { type: 'arrow', label: 'Arrow' },
  circle: { type: 'circle', label: 'Circle' },
  hollowCircle: { type: 'hollowCircle', label: 'Hollow Circle' },
  square: { type: 'square', label: 'Square' },
  hollowSquare: { type: 'hollowSquare', label: 'Hollow Square' },
  diamond: { type: 'diamond', label: 'Diamond' },
  hollowDiamond: { type: 'hollowDiamond', label: 'Hollow Diamond' }
};

export const LINE_END_SHAPE_VALUES = Object.fromEntries(
  Object.entries(LINE_END_SHAPES).map(([key, value]) => [key, value.type])
);

/**
 * Line connection types
 */
export const LINE_CONNECTION_TYPES = {
  straight: { type: 'straight', label: 'Straight' },
  elbow: { type: 'elbow', label: 'Elbow (90°)' },
  curved: { type: 'curved', label: 'Curved' },
  quadratic: { type: 'quadratic', label: 'Quadratic Bezier' },
  cubic: { type: 'cubic', label: 'Cubic Bezier' }
};

export const LINE_CONNECTION_TYPE_VALUES = Object.fromEntries(
  Object.entries(LINE_CONNECTION_TYPES).map(([key, value]) => [key, value.type])
);

/**
 * Connection point on a component
 */
const ConnectionPoint = Type.Object({
  componentId: Type.Optional(Type.Union([
    Type.String({ description: 'ID of connected component' }),
    Type.Null()
  ])),
  side: Type.Optional(Type.Union([
    Type.Enum({
      top: 'top',
      right: 'right', 
      bottom: 'bottom',
      left: 'left',
      topLeft: 'topLeft',
      topRight: 'topRight',
      bottomLeft: 'bottomLeft',
      bottomRight: 'bottomRight',
      center: 'center'
    }),
    Type.Null()
  ])),
  offset: Type.Optional(Type.Object({
    x: Type.Number({ default: 0 }),
    y: Type.Number({ default: 0 })
  }, { description: 'Offset from connection point' }))
}, { description: 'Connection point details' });

/**
 * Lines Component Schema
 * Creates connectable lines with customizable endpoints
 */
export const LinesSchema = UIObject(
  'Lines',
  {
    // Don't include base component position/width/height - they are calculated from endpoints
    opacity: BaseComponentSchema.properties.opacity,
    rotation: BaseComponentSchema.properties.rotation,
    zIndex: BaseComponentSchema.properties.zIndex,
    
    // Start and end points - can be absolute positions or connected to components
    startPoint: Type.Object({
      x: Type.Number({ default: 100, description: 'X coordinate' }),
      y: Type.Number({ default: 100, description: 'Y coordinate' }),
      connection: Type.Optional(ConnectionPoint)
    }, { 
      title: 'Start Point',
      description: 'Line start position or connection'
    }),
    
    endPoint: Type.Object({
      x: Type.Number({ default: 300, description: 'X coordinate' }),
      y: Type.Number({ default: 300, description: 'Y coordinate' }),
      connection: Type.Optional(ConnectionPoint)
    }, {
      title: 'End Point', 
      description: 'Line end position or connection'
    }),
    
    // Line style
    connectionType: UIEnum('Connection Type', LINE_CONNECTION_TYPE_VALUES, 'How the line connects points', {
      control: 'dropdown'
    }),
    
    // End shapes
    startShape: UIEnum('Start Shape', LINE_END_SHAPE_VALUES, 'Shape at the start of the line', {
      control: 'dropdown'
    }),
    
    endShape: UIEnum('End Shape', LINE_END_SHAPE_VALUES, 'Shape at the end of the line', {
      control: 'dropdown'
    }),
    
    // Styling
    stroke: createColorProperty(
      'Line Color',
      'Color of the line',
      '#000000ff'
    ),
    
    strokeWidth: UIProperty(Type.Number({ default: 4, minimum: 1, maximum: 20 }), {
      control: 'slider',
      label: 'Line Width',
      description: 'Width of the line in pixels',
      controlProps: {
        min: 1,
        max: 20,
        step: 1
      }
    }),
    
    strokeDasharray: Type.Optional(UIProperty(Type.String({ default: 'none' }), {
      control: 'input',
      label: 'Dash Pattern',
      description: 'SVG dash pattern (e.g., "5,5" for dashed)',
      controlProps: {
        placeholder: 'e.g., 5,5'
      }
    })),
    
    // Control points for curved lines
    controlPoints: Type.Optional(Type.Array(
      Type.Object({
        x: Type.Number(),
        y: Type.Number()
      }),
      { description: 'Control points for bezier curves' }
    )),
    

    
    // We'll override position to be the bounding box center
    // The actual line is drawn from startPoint to endPoint
  }
);

/**
 * Lines properties type
 */
export type LinesProps = TypeFromSchema<typeof LinesSchema>;

/**
 * Lines component definition
 */
export const LinesDefinition: ComponentDefinition<typeof LinesSchema> = {
  type: 'Lines',
  name: 'Lines',
  schema: LinesSchema,
  defaultProps: {
    startPoint: { x: 100, y: 200 },
    endPoint: { x: 300, y: 200 },
    connectionType: 'straight',
    startShape: 'none',
    endShape: 'none',
    stroke: '#000000ff',
    strokeWidth: 4,
    strokeDasharray: 'none',
    opacity: 1,
    rotation: 0,
    zIndex: 1
  },
  category: 'basic'
}; 