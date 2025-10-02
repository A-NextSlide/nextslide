import { Type } from '@sinclair/typebox';
import { UIObject, UIProperty, TypeFromSchema } from '../schemas';
import { BaseComponentSchema, baseComponentDefaults } from '../base';
import { ComponentDefinition } from '../registry';
import { 
  BorderRadiusProperty, 
  BorderWidthProperty,
  ShadowEnableProperty,
  ShadowBlurProperty,
  ShadowColorProperty,
  ShadowOffsetXProperty,
  ShadowOffsetYProperty,
  ShadowSpreadProperty
} from '../library/border-shadow-properties';
import {
  createColorProperty
} from '../library/color-properties';
import {
  ObjectFitProperty
} from '../library/image-properties';
import {
  AutoplayProperty,
  ControlsProperty,
  LoopProperty,
  MutedProperty,
  PosterUrlProperty,
  VideoSourceUrlProperty
} from '../library/video-properties';

/**
 * Video Component Schema
 * Embeds video content with playback controls and styling options
 */
export const VideoSchema = UIObject(
  'Video',
  {
    ...BaseComponentSchema.properties,
    
  src: VideoSourceUrlProperty,
  
  // Video playback controls
  autoplay: AutoplayProperty,
  controls: ControlsProperty,
  loop: LoopProperty,
  muted: MutedProperty,
  poster: PosterUrlProperty,
  
  objectFit: ObjectFitProperty,
  
  // Styling properties
  borderRadius: BorderRadiusProperty,
  
  borderWidth: BorderWidthProperty,
  
  borderColor: createColorProperty(
    'Border Color',
    'Border color with alpha channel support',
    '#000000ff'
  ),
  
  // Shadow properties
  shadow: ShadowEnableProperty,
  shadowBlur: ShadowBlurProperty,
  shadowColor: ShadowColorProperty,
  shadowOffsetX: ShadowOffsetXProperty,
  shadowOffsetY: ShadowOffsetYProperty,
  shadowSpread: ShadowSpreadProperty
});

/**
 * Video properties type
 */
export type VideoProps = TypeFromSchema<typeof VideoSchema>;

/**
 * Video component definition
 */
export const VideoDefinition: ComponentDefinition<typeof VideoSchema> = {
  type: 'Video',
  name: 'Video',
  schema: VideoSchema,
  defaultProps: {
    ...baseComponentDefaults,
    src: '',
    autoplay: false,
    controls: true,
    loop: false,
    muted: false,
    poster: '',
    objectFit: 'contain',
    borderRadius: 0,
    borderWidth: 0,
    borderColor: '#000000ff',
    shadow: false,
    shadowBlur: 10,
    shadowColor: '#0000004D', // With 30% opacity
    shadowOffsetX: 0,
    shadowOffsetY: 4,
    shadowSpread: 0,
    width: 640, // 16:9 aspect ratio video width
    height: 360 // 16:9 aspect ratio video height
  },
  category: 'media'
}; 