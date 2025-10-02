import { Type } from '@sinclair/typebox';
import { UIObject, UIEnum, TypeFromSchema } from '../schemas';
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
  ObjectFitProperty,
  AltTextProperty,
  ImageSourceUrlProperty,
  MediaSourceIdProperty,
  OriginalFilenameProperty,
  AIInterpretationProperty,
  MediaSlideIdProperty
} from '../library/image-properties';
import {
  FilterPresetProperty,
  BrightnessProperty,
  ContrastProperty,
  SaturationProperty,
  GrayscaleProperty,
  SepiaProperty,
  HueRotateProperty,
  BlurProperty,
  InvertProperty,
  OverlayColorProperty,
  OverlayOpacityProperty,
  OverlayBlendModeProperty,
  OverlayPatternProperty,
  OverlayPatternOpacityProperty,
  GradientOverlayEnabledProperty,
  GradientStartColorProperty,
  GradientEndColorProperty,
  GradientDirectionProperty,
  AnimationTypeProperty,
  AnimationDurationProperty,
  AnimationDelayProperty,
  AnimationEasingProperty,
  ScaleProperty,
  RotateProperty,
  SkewXProperty,
  SkewYProperty,
  PerspectiveProperty,
  RotateXProperty,
  RotateYProperty,
  RotateZProperty,
  MaskShapeProperty,
  MaskSizeProperty,
  DuotoneEnabledProperty,
  DuotoneLightColorProperty,
  DuotoneDarkColorProperty,
  GlitchEnabledProperty,
  GlitchIntensityProperty,
  ParallaxEnabledProperty,
  ParallaxSpeedProperty,
  HoverEffectProperty,
  HoverTransitionDurationProperty
} from '../library/image-effects-properties';

/**
 * Image Component Schema
 * Displays images with customizable styling and effects
 * Includes support for media tagging and AI-enhanced interpretation
 */
export const ImageSchema = UIObject(
  'Image',
  {
    ...BaseComponentSchema.properties,
    
    // Basic properties
    src: ImageSourceUrlProperty,
    alt: AltTextProperty,
    objectFit: ObjectFitProperty,
    
    // Cropping (normalized 0..1 from each edge)
    cropRect: Type.Optional(Type.Object({
      left: Type.Number({ minimum: 0, maximum: 1 }),
      top: Type.Number({ minimum: 0, maximum: 1 }),
      right: Type.Number({ minimum: 0, maximum: 1 }),
      bottom: Type.Number({ minimum: 0, maximum: 1 })
    })),
    cropResizesCanvas: Type.Optional(Type.Boolean()),
    cropOriginalFrame: Type.Optional(Type.Object({
      position: Type.Object({
        x: Type.Number(),
        y: Type.Number()
      }),
      width: Type.Number(),
      height: Type.Number()
    })),
    
    // Border and shadow
    borderRadius: BorderRadiusProperty,
    borderWidth: BorderWidthProperty,
    borderColor: createColorProperty(
      'Border Color',
      'Border color with alpha channel support',
      '#000000ff'
    ),
    shadow: ShadowEnableProperty,
    shadowBlur: ShadowBlurProperty,
    shadowColor: ShadowColorProperty,
    shadowOffsetX: ShadowOffsetXProperty,
    shadowOffsetY: ShadowOffsetYProperty,
    shadowSpread: ShadowSpreadProperty,
    
    // Filter effects
    filterPreset: FilterPresetProperty,
    brightness: BrightnessProperty,
    contrast: ContrastProperty,
    saturation: SaturationProperty,
    grayscale: GrayscaleProperty,
    sepia: SepiaProperty,
    hueRotate: HueRotateProperty,
    blur: BlurProperty,
    invert: InvertProperty,
    
    // Overlay effects
    overlayColor: OverlayColorProperty,
    overlayOpacity: OverlayOpacityProperty,
    overlayBlendMode: OverlayBlendModeProperty,
    overlayPattern: OverlayPatternProperty,
    overlayPatternOpacity: OverlayPatternOpacityProperty,
    
    // Gradient overlay
    gradientOverlayEnabled: GradientOverlayEnabledProperty,
    gradientStartColor: GradientStartColorProperty,
    gradientEndColor: GradientEndColorProperty,
    gradientDirection: GradientDirectionProperty,
    
    // Animation
    animationType: AnimationTypeProperty,
    animationDuration: AnimationDurationProperty,
    animationDelay: AnimationDelayProperty,
    animationEasing: AnimationEasingProperty,
    
    // Transform
    scale: ScaleProperty,
    rotate: RotateProperty,
    skewX: SkewXProperty,
    skewY: SkewYProperty,
    
    // 3D Transform
    perspective: PerspectiveProperty,
    rotateX: RotateXProperty,
    rotateY: RotateYProperty,
    rotateZ: RotateZProperty,
    
    // Mask
    maskShape: MaskShapeProperty,
    maskSize: MaskSizeProperty,

    // Optional clip shape used by importers (e.g., Google Slides/OpenXML)
    clipShape: Type.Optional(Type.String()),
    
    // Duotone
    duotoneEnabled: DuotoneEnabledProperty,
    duotoneLightColor: DuotoneLightColorProperty,
    duotoneDarkColor: DuotoneDarkColorProperty,
    
    // Glitch
    glitchEnabled: GlitchEnabledProperty,
    glitchIntensity: GlitchIntensityProperty,
    
    // Parallax
    parallaxEnabled: ParallaxEnabledProperty,
    parallaxSpeed: ParallaxSpeedProperty,
    
    // Hover
    hoverEffect: HoverEffectProperty,
    hoverTransitionDuration: HoverTransitionDurationProperty,
    
    // Media tagging properties
    mediaSourceId: MediaSourceIdProperty,
    originalFilename: OriginalFilenameProperty,
    aiInterpretation: AIInterpretationProperty,
    mediaSlideId: MediaSlideIdProperty
  }
);

/**
 * Image properties type
 */
export type ImageProps = TypeFromSchema<typeof ImageSchema>;

/**
 * Image component definition
 */
export const ImageDefinition: ComponentDefinition<typeof ImageSchema> = {
  type: 'Image',
  name: 'Image',
  schema: ImageSchema,
  defaultProps: {
    ...baseComponentDefaults,
    src: '',
    alt: '',
    objectFit: 'cover',
    // Cropping defaults
    cropRect: { left: 0, top: 0, right: 0, bottom: 0 },
    cropResizesCanvas: false,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: '#000000ff',
    shadow: false,
    shadowBlur: 10,
    shadowColor: '#0000004D',
    shadowOffsetX: 0,
    shadowOffsetY: 4,
    shadowSpread: 0,
    width: 500,
    height: 300,
    
    // Filter defaults
    filterPreset: 'none',
    brightness: 100,
    contrast: 100,
    saturation: 100,
    grayscale: 0,
    sepia: 0,
    hueRotate: 0,
    blur: 0,
    invert: 0,
    
    // Overlay defaults
    overlayColor: '#00000000',
    overlayOpacity: 0,
    overlayBlendMode: 'normal',
    overlayPattern: 'none',
    overlayPatternOpacity: 0.5,
    
    // Gradient overlay defaults
    gradientOverlayEnabled: false,
    gradientStartColor: '#000000',
    gradientEndColor: '#ffffff',
    gradientDirection: 0,
    
    // Animation defaults
    animationType: 'none',
    animationDuration: 1,
    animationDelay: 0,
    animationEasing: 'ease-in-out',
    
    // Transform defaults
    scale: 1,
    rotate: 0,
    skewX: 0,
    skewY: 0,
    
    // 3D Transform defaults
    perspective: 0,
    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,
    
    // Mask defaults
    maskShape: 'none',
    maskSize: 100,
    clipShape: undefined,
    
    // Duotone defaults
    duotoneEnabled: false,
    duotoneLightColor: '#ffffff',
    duotoneDarkColor: '#000000',
    
    // Glitch defaults
    glitchEnabled: false,
    glitchIntensity: 50,
    
    // Parallax defaults
    parallaxEnabled: false,
    parallaxSpeed: 0.5,
    
    // Hover defaults
    hoverEffect: 'none',
    hoverTransitionDuration: 0.3,
    
    // Media tagging defaults
    mediaSourceId: '',
    originalFilename: '',
    aiInterpretation: '',
    mediaSlideId: ''
  },
  category: 'media'
}; 