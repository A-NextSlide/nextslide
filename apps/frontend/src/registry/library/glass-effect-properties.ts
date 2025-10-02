import { Type } from '@sinclair/typebox';
import { UIProperty, UIEnum } from '../schemas';

/**
 * Glass Effect Properties Library
 * 
 * Properties for creating modern glassmorphism effects on components
 * Includes blur, transparency, borders, and reflections
 */

/**
 * Glass preset styles
 */
export const GLASS_PRESET_OPTIONS = {
  none: 'none',
  subtle: 'subtle',
  frosted: 'frosted',
  crystal: 'crystal',
  aurora: 'aurora',
  neon: 'neon',
  holographic: 'holographic',
  custom: 'custom'
};

/**
 * Glass tint colors
 */
export const GLASS_TINT_OPTIONS = {
  none: 'none',
  white: 'white',
  black: 'black',
  blue: 'blue',
  purple: 'purple',
  pink: 'pink',
  green: 'green',
  orange: 'orange',
  rainbow: 'rainbow'
};

// Main glass toggle
export const GlassEffectEnabledProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Enable Glass Effect',
  description: 'Apply glassmorphism effect to the component'
});

// Glass preset
export const GlassPresetProperty = UIEnum("Glass Preset", GLASS_PRESET_OPTIONS, "Pre-defined glass effect styles", {
  control: 'dropdown',
  label: 'Glass Style',
});

// Blur properties
export const GlassBlurProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Glass Blur',
  description: 'Background blur intensity',
  controlProps: {
    min: 0,
    max: 30,
    step: 1
  }
});

export const GlassSaturationProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Glass Saturation',
  description: 'Color saturation behind glass',
  controlProps: {
    min: 0,
    max: 200,
    step: 10
  }
});

// Transparency
export const GlassOpacityProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Glass Opacity',
  description: 'Glass surface opacity',
  controlProps: {
    min: 0,
    max: 1,
    step: 0.05
  }
});

// Tint
export const GlassTintProperty = UIEnum("Glass Tint", GLASS_TINT_OPTIONS, "Color tint for the glass", {
  control: 'dropdown',
  label: 'Glass Tint',
});

export const GlassTintOpacityProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Tint Opacity',
  description: 'Tint color opacity',
  controlProps: {
    min: 0,
    max: 0.5,
    step: 0.05
  }
});

// Border properties
export const GlassBorderEnabledProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Glass Border',
  description: 'Add a subtle border to the glass'
});

export const GlassBorderOpacityProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Border Opacity',
  description: 'Glass border opacity',
  controlProps: {
    min: 0,
    max: 1,
    step: 0.05
  }
});

// Reflection/shine
export const GlassReflectionEnabledProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Glass Reflection',
  description: 'Add a light reflection to the glass'
});

export const GlassReflectionAngleProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Reflection Angle',
  description: 'Angle of the light reflection',
  controlProps: {
    min: 0,
    max: 360,
    step: 15
  }
});

export const GlassReflectionOpacityProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Reflection Opacity',
  description: 'Intensity of the reflection',
  controlProps: {
    min: 0,
    max: 0.5,
    step: 0.05
  }
});

// Noise texture
export const GlassNoiseEnabledProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Glass Texture',
  description: 'Add subtle noise texture to the glass'
});

export const GlassNoiseOpacityProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Texture Opacity',
  description: 'Noise texture opacity',
  controlProps: {
    min: 0,
    max: 0.3,
    step: 0.02
  }
});

// Inner shadow for depth
export const GlassInnerShadowEnabledProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Inner Shadow',
  description: 'Add inner shadow for depth'
});

export const GlassInnerShadowOpacityProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Inner Shadow Opacity',
  description: 'Inner shadow intensity',
  controlProps: {
    min: 0,
    max: 0.5,
    step: 0.05
  }
});

// Refraction effect
export const GlassRefractionEnabledProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Refraction Effect',
  description: 'Simulate light refraction through glass'
});

export const GlassRefractionIntensityProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Refraction Intensity',
  description: 'Strength of refraction distortion',
  controlProps: {
    min: 0,
    max: 10,
    step: 1
  }
});

// Chromatic aberration
export const GlassChromaticAberrationProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Chromatic Aberration',
  description: 'Add RGB color separation effect'
});

export const GlassChromaticIntensityProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Chromatic Intensity',
  description: 'RGB separation distance',
  controlProps: {
    min: 0,
    max: 5,
    step: 0.5
  }
});

// Frost patterns
export const GlassFrostPatternProperty = UIEnum("Frost Pattern", {
  none: 'none',
  crystalline: 'crystalline',
  organic: 'organic',
  geometric: 'geometric',
  radial: 'radial'
}, "Frost pattern on the glass", {
  control: 'dropdown',
  label: 'Frost Pattern',
});

export const GlassFrostIntensityProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Frost Intensity',
  description: 'Intensity of frost pattern',
  controlProps: {
    min: 0,
    max: 1,
    step: 0.1
  }
});

// Animation
export const GlassAnimateProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Animate Glass',
  description: 'Add subtle animation to glass effects'
});

export const GlassAnimationSpeedProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Animation Speed',
  description: 'Speed of glass animations',
  controlProps: {
    min: 0.5,
    max: 5,
    step: 0.5
  }
});

/**
 * Helper function to get glass effect styles
 */
export const getGlassEffectStyles = (props: any): React.CSSProperties => {
  if (!props.glassEffectEnabled) return {};
  
  const styles: React.CSSProperties = {};
  const filters: string[] = [];
  
  // Apply preset or custom values
  switch (props.glassPreset) {
    case 'subtle':
      filters.push(`blur(${props.glassBlur || 8}px)`);
      filters.push(`saturate(${props.glassSaturation || 120}%)`);
      styles.backgroundColor = `rgba(255, 255, 255, ${props.glassOpacity || 0.1})`;
      break;
    case 'frosted':
      filters.push(`blur(${props.glassBlur || 16}px)`);
      filters.push(`saturate(${props.glassSaturation || 180}%)`);
      styles.backgroundColor = `rgba(255, 255, 255, ${props.glassOpacity || 0.25})`;
      break;
    case 'crystal':
      filters.push(`blur(${props.glassBlur || 12}px)`);
      filters.push(`saturate(${props.glassSaturation || 150}%)`);
      filters.push('brightness(105%)');
      styles.backgroundColor = `rgba(255, 255, 255, ${props.glassOpacity || 0.15})`;
      break;
    case 'aurora':
      filters.push(`blur(${props.glassBlur || 20}px)`);
      filters.push(`saturate(${props.glassSaturation || 200}%)`);
      filters.push('hue-rotate(30deg)');
      styles.backgroundColor = `rgba(255, 255, 255, ${props.glassOpacity || 0.2})`;
      break;
    case 'neon':
      filters.push(`blur(${props.glassBlur || 10}px)`);
      filters.push(`saturate(${props.glassSaturation || 300}%)`);
      filters.push('contrast(120%)');
      styles.backgroundColor = `rgba(0, 0, 0, ${props.glassOpacity || 0.3})`;
      break;
    case 'holographic':
      filters.push(`blur(${props.glassBlur || 14}px)`);
      filters.push(`saturate(${props.glassSaturation || 250}%)`);
      filters.push('hue-rotate(45deg)');
      styles.backgroundColor = `rgba(255, 255, 255, ${props.glassOpacity || 0.18})`;
      break;
    case 'custom':
    default:
      if (props.glassBlur > 0) filters.push(`blur(${props.glassBlur}px)`);
      if (props.glassSaturation !== 100) filters.push(`saturate(${props.glassSaturation}%)`);
      styles.backgroundColor = `rgba(255, 255, 255, ${props.glassOpacity || 0.1})`;
      break;
  }
  
  if (filters.length > 0) {
    styles.backdropFilter = filters.join(' ');
    // Add webkit prefix for Safari
    (styles as any).WebkitBackdropFilter = filters.join(' ');
  }
  
  return styles;
};

/**
 * Get tint color based on selection
 */
export const getGlassTintColor = (tint: string, opacity: number): string => {
  switch (tint) {
    case 'white': return `rgba(255, 255, 255, ${opacity})`;
    case 'black': return `rgba(0, 0, 0, ${opacity})`;
    case 'blue': return `rgba(59, 130, 246, ${opacity})`;
    case 'purple': return `rgba(147, 51, 234, ${opacity})`;
    case 'pink': return `rgba(236, 72, 153, ${opacity})`;
    case 'green': return `rgba(34, 197, 94, ${opacity})`;
    case 'orange': return `rgba(251, 146, 60, ${opacity})`;
    case 'rainbow': return `linear-gradient(135deg, rgba(255,0,0,${opacity}), rgba(255,154,0,${opacity}), rgba(208,222,33,${opacity}), rgba(79,220,74,${opacity}), rgba(63,218,216,${opacity}), rgba(47,201,226,${opacity}), rgba(28,127,238,${opacity}), rgba(95,21,242,${opacity}), rgba(186,12,248,${opacity}), rgba(251,7,217,${opacity}), rgba(255,0,0,${opacity}))`;
    default: return 'transparent';
  }
}; 