import { Type } from '@sinclair/typebox';
import { UIProperty, UIEnum, UIObject } from '../schemas';

/**
 * Image Effects Properties Library
 * 
 * Advanced image styling properties for creating exceptional designs
 * Includes filters, overlays, blend modes, and animation effects
 */

/**
 * Filter blend modes
 */
export const BLEND_MODE_OPTIONS = {
  normal: 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity'
};

/**
 * Image filter presets
 */
export const FILTER_PRESET_OPTIONS = {
  none: 'none',
  grayscale: 'grayscale',
  sepia: 'sepia',
  vintage: 'vintage',
  noir: 'noir',
  vivid: 'vivid',
  dramatic: 'dramatic',
  cool: 'cool',
  warm: 'warm',
  cyberpunk: 'cyberpunk',
  dreamy: 'dreamy',
  custom: 'custom'
};

/**
 * Animation types for images
 */
export const IMAGE_ANIMATION_OPTIONS = {
  none: 'none',
  'fade-in': 'fade-in',
  'slide-up': 'slide-up',
  'slide-down': 'slide-down',
  'slide-left': 'slide-left',
  'slide-right': 'slide-right',
  'zoom-in': 'zoom-in',
  'zoom-out': 'zoom-out',
  'rotate-in': 'rotate-in',
  'flip-in': 'flip-in',
  parallax: 'parallax',
  'ken-burns': 'ken-burns',
  pulse: 'pulse',
  float: 'float'
};

/**
 * Overlay pattern types
 */
export const OVERLAY_PATTERN_OPTIONS = {
  none: 'none',
  dots: 'dots',
  lines: 'lines',
  grid: 'grid',
  noise: 'noise',
  scanlines: 'scanlines',
  halftone: 'halftone',
  gradient: 'gradient'
};

// Filter Properties
export const FilterPresetProperty = UIEnum("Filter Preset", FILTER_PRESET_OPTIONS, "Pre-defined filter effects", {
  control: 'dropdown',
  label: 'Filter Preset',
});

export const BrightnessProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Brightness',
  description: 'Adjust image brightness',
  controlProps: {
    min: 0,
    max: 200,
    step: 1
  }
});

export const ContrastProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Contrast',
  description: 'Adjust image contrast',
  controlProps: {
    min: 0,
    max: 200,
    step: 1
  }
});

export const SaturationProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Saturation',
  description: 'Adjust color saturation',
  controlProps: {
    min: 0,
    max: 200,
    step: 1
  }
});

export const GrayscaleProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Grayscale',
  description: 'Convert to black and white',
  controlProps: {
    min: 0,
    max: 100,
    step: 1
  }
});

export const SepiaProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Sepia',
  description: 'Apply sepia tone effect',
  controlProps: {
    min: 0,
    max: 100,
    step: 1
  }
});

export const HueRotateProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Hue Rotate',
  description: 'Rotate color hue',
  controlProps: {
    min: 0,
    max: 360,
    step: 1
  }
});

export const BlurProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Blur',
  description: 'Apply blur effect',
  controlProps: {
    min: 0,
    max: 20,
    step: 0.5
  }
});

export const InvertProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Invert',
  description: 'Invert colors',
  controlProps: {
    min: 0,
    max: 100,
    step: 1
  }
});

// Overlay Properties
export const OverlayColorProperty = UIProperty(Type.String(), {
  control: 'input',
  label: 'Overlay Color',
  description: 'Color overlay with transparency (hex format with alpha)',
  controlProps: {
    placeholder: '#000000ff'
  }
});

export const OverlayOpacityProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Overlay Opacity',
  description: 'Overlay transparency level',
  controlProps: {
    min: 0,
    max: 1,
    step: 0.01
  }
});

export const OverlayBlendModeProperty = UIEnum("Overlay Blend Mode", BLEND_MODE_OPTIONS, "How the overlay blends with the image", {
  control: 'dropdown',
  label: 'Overlay Blend Mode',
});

export const OverlayPatternProperty = UIEnum("Overlay Pattern", OVERLAY_PATTERN_OPTIONS, "Pattern to apply over the image", {
  control: 'dropdown',
  label: 'Overlay Pattern',
});

export const OverlayPatternOpacityProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Pattern Opacity',
  description: 'Pattern transparency level',
  controlProps: {
    min: 0,
    max: 1,
    step: 0.01
  }
});

// Gradient Overlay Properties
export const GradientOverlayEnabledProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Enable Gradient Overlay',
  description: 'Apply a gradient overlay to the image'
});

export const GradientStartColorProperty = UIProperty(Type.String(), {
  control: 'input',
  label: 'Gradient Start Color',
  description: 'Starting color of the gradient (hex format)',
  controlProps: {
    placeholder: '#000000'
  }
});

export const GradientEndColorProperty = UIProperty(Type.String(), {
  control: 'input',
  label: 'Gradient End Color',
  description: 'Ending color of the gradient (hex format)',
  controlProps: {
    placeholder: '#ffffff'
  }
});

export const GradientDirectionProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Gradient Direction',
  description: 'Direction of the gradient in degrees',
  controlProps: {
    min: 0,
    max: 360,
    step: 1
  }
});

// Animation Properties
export const AnimationTypeProperty = UIEnum("Animation Type", IMAGE_ANIMATION_OPTIONS, "Animation effect for the image", {
  control: 'dropdown',
  label: 'Animation Type',
});

export const AnimationDurationProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Animation Duration',
  description: 'Duration of animation in seconds',
  controlProps: {
    min: 0.1,
    max: 5,
    step: 0.1
  }
});

export const AnimationDelayProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Animation Delay',
  description: 'Delay before animation starts in seconds',
  controlProps: {
    min: 0,
    max: 3,
    step: 0.1
  }
});

export const AnimationEasingProperty = UIEnum("Animation Easing", {
  linear: 'linear',
  'ease-in': 'ease-in',
  'ease-out': 'ease-out',
  'ease-in-out': 'ease-in-out',
  'cubic-bezier': 'cubic-bezier'
}, "Animation timing function", {
  control: 'dropdown',
  label: 'Animation Easing',
});

// Transform Properties
export const ScaleProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Scale',
  description: 'Scale the image',
  controlProps: {
    min: 0.5,
    max: 2,
    step: 0.01
  }
});

export const RotateProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Rotate',
  description: 'Rotate the image in degrees',
  controlProps: {
    min: -180,
    max: 180,
    step: 1
  }
});

export const SkewXProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Skew X',
  description: 'Skew horizontally in degrees',
  controlProps: {
    min: -45,
    max: 45,
    step: 1
  }
});

export const SkewYProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Skew Y',
  description: 'Skew vertically in degrees',
  controlProps: {
    min: -45,
    max: 45,
    step: 1
  }
});

// 3D Transform Properties
export const PerspectiveProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Perspective',
  description: '3D perspective distance',
  controlProps: {
    min: 0,
    max: 2000,
    step: 50
  }
});

export const RotateXProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Rotate X',
  description: '3D rotation around X axis',
  controlProps: {
    min: -180,
    max: 180,
    step: 1
  }
});

export const RotateYProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Rotate Y',
  description: '3D rotation around Y axis',
  controlProps: {
    min: -180,
    max: 180,
    step: 1
  }
});

export const RotateZProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Rotate Z',
  description: '3D rotation around Z axis',
  controlProps: {
    min: -180,
    max: 180,
    step: 1
  }
});

// Mask Properties
export const MaskShapeProperty = UIEnum("Mask Shape", {
  none: 'none',
  circle: 'circle',
  ellipse: 'ellipse',
  triangle: 'triangle',
  diamond: 'diamond',
  hexagon: 'hexagon',
  star: 'star',
  heart: 'heart',
  custom: 'custom'
}, "Shape mask for the image", {
  control: 'dropdown',
  label: 'Mask Shape',
});

export const MaskSizeProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Mask Size',
  description: 'Size of the mask shape',
  controlProps: {
    min: 50,
    max: 150,
    step: 1
  }
});

// Duotone Effect Properties
export const DuotoneEnabledProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Enable Duotone',
  description: 'Apply duotone color effect'
});

export const DuotoneLightColorProperty = UIProperty(Type.String(), {
  control: 'input',
  label: 'Duotone Light Color',
  description: 'Light tone color (hex format)',
  controlProps: {
    placeholder: '#ffffff'
  }
});

export const DuotoneDarkColorProperty = UIProperty(Type.String(), {
  control: 'input',
  label: 'Duotone Dark Color',
  description: 'Dark tone color (hex format)',
  controlProps: {
    placeholder: '#000000'
  }
});

// Glitch Effect Properties
export const GlitchEnabledProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Enable Glitch Effect',
  description: 'Apply digital glitch effect'
});

export const GlitchIntensityProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Glitch Intensity',
  description: 'Intensity of glitch effect',
  controlProps: {
    min: 0,
    max: 100,
    step: 1
  }
});

// Parallax Properties
export const ParallaxEnabledProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Enable Parallax',
  description: 'Enable parallax scrolling effect'
});

export const ParallaxSpeedProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Parallax Speed',
  description: 'Speed of parallax movement',
  controlProps: {
    min: -2,
    max: 2,
    step: 0.1
  }
});

// Hover Effects
export const HoverEffectProperty = UIEnum("Hover Effect", {
  none: 'none',
  'zoom-in': 'zoom-in',
  'zoom-out': 'zoom-out',
  rotate: 'rotate',
  'brightness-up': 'brightness-up',
  'brightness-down': 'brightness-down',
  'blur-in': 'blur-in',
  'blur-out': 'blur-out',
  'grayscale-in': 'grayscale-in',
  'grayscale-out': 'grayscale-out',
  'slide-caption': 'slide-caption'
}, "Effect on hover", {
  control: 'dropdown',
  label: 'Hover Effect',
});

export const HoverTransitionDurationProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Hover Transition Duration',
  description: 'Duration of hover transition in seconds',
  controlProps: {
    min: 0.1,
    max: 2,
    step: 0.1
  }
}); 