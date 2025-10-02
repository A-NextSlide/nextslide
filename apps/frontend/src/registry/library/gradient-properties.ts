import { Type } from '@sinclair/typebox';
import { UIProperty, UIEnum } from '../schemas';

/**
 * Gradient Properties Library
 * 
 * Properties for creating gradient fills on shapes and components
 * Supports linear and radial gradients
 */

/**
 * Gradient types
 */
export const GRADIENT_TYPE_OPTIONS = {
  none: 'none',
  linear: 'linear',
  radial: 'radial'
};

/**
 * Gradient presets
 */
export const GRADIENT_PRESET_OPTIONS = {
  none: 'none',
  sunset: 'sunset',
  ocean: 'ocean',
  forest: 'forest',
  lavender: 'lavender',
  fire: 'fire',
  aurora: 'aurora',
  rainbow: 'rainbow',
  metallic: 'metallic',
  pastel: 'pastel',
  neon: 'neon',
  custom: 'custom'
};

// Main gradient toggle
export const GradientEnabledProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Enable Gradient',
  description: 'Use gradient fill instead of solid color'
});

// Gradient type
export const GradientTypeProperty = UIEnum("Gradient Type", GRADIENT_TYPE_OPTIONS, "Type of gradient", {
  control: 'dropdown',
  label: 'Gradient Type',
});

// Gradient preset
export const GradientPresetProperty = UIEnum("Gradient Preset", GRADIENT_PRESET_OPTIONS, "Pre-defined gradient styles", {
  control: 'dropdown',
  label: 'Gradient Preset',
});

// Color stops
export const GradientStartColorProperty = UIProperty(Type.String(), {
  control: 'input',
  label: 'Start Color',
  description: 'Starting color of the gradient',
  controlProps: {
    placeholder: '#000000'
  }
});

export const GradientMiddleColorProperty = UIProperty(Type.String(), {
  control: 'input',
  label: 'Middle Color',
  description: 'Middle color of the gradient (optional)',
  controlProps: {
    placeholder: '#808080'
  }
});

export const GradientEndColorProperty = UIProperty(Type.String(), {
  control: 'input',
  label: 'End Color',
  description: 'Ending color of the gradient',
  controlProps: {
    placeholder: '#ffffff'
  }
});

// Direction/angle for linear gradients
export const GradientAngleProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Gradient Angle',
  description: 'Direction of linear gradient in degrees',
  controlProps: {
    min: 0,
    max: 360,
    step: 15
  }
});

// Position for radial gradients
export const GradientCenterXProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Center X',
  description: 'Horizontal center position for radial gradient',
  controlProps: {
    min: 0,
    max: 100,
    step: 5
  }
});

export const GradientCenterYProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Center Y',
  description: 'Vertical center position for radial gradient',
  controlProps: {
    min: 0,
    max: 100,
    step: 5
  }
});

// Radial gradient shape
export const GradientRadialShapeProperty = UIEnum("Radial Shape", {
  circle: 'circle',
  ellipse: 'ellipse'
}, "Shape of radial gradient", {
  control: 'dropdown',
  label: 'Radial Shape',
});

// Gradient spread
export const GradientSpreadProperty = UIEnum("Gradient Spread", {
  pad: 'pad',
  reflect: 'reflect',
  repeat: 'repeat'
}, "How gradient spreads beyond its bounds", {
  control: 'dropdown',
  label: 'Gradient Spread',
});

// Color stop positions
export const GradientStartPositionProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Start Position',
  description: 'Position of start color (0-100%)',
  controlProps: {
    min: 0,
    max: 100,
    step: 5
  }
});

export const GradientMiddlePositionProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Middle Position',
  description: 'Position of middle color (0-100%)',
  controlProps: {
    min: 0,
    max: 100,
    step: 5
  }
});

export const GradientEndPositionProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'End Position',
  description: 'Position of end color (0-100%)',
  controlProps: {
    min: 0,
    max: 100,
    step: 5
  }
});

// Smoothness
export const GradientSmoothnessProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Smoothness',
  description: 'Gradient transition smoothness',
  controlProps: {
    min: 0,
    max: 100,
    step: 10
  }
});

// Opacity
export const GradientOpacityProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Gradient Opacity',
  description: 'Overall gradient opacity',
  controlProps: {
    min: 0,
    max: 1,
    step: 0.05
  }
});

// Animation
export const GradientAnimatedProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Animate Gradient',
  description: 'Animate gradient colors or position'
});

export const GradientAnimationSpeedProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Animation Speed',
  description: 'Speed of gradient animation',
  controlProps: {
    min: 1,
    max: 10,
    step: 1
  }
});

/**
 * Normalize gradient stops to ensure they have the correct structure
 * Handles both 'position' and 'offset' field names
 */
export const normalizeGradientStops = (stops: any[]): { color: string; position: number }[] => {
  if (!Array.isArray(stops)) return [];
  
  return stops.map(stop => ({
    color: stop.color || '#000000',
    position: stop.position !== undefined ? stop.position : (stop.offset !== undefined ? stop.offset : 0)
  }));
};

/**
 * Get gradient preset colors
 */
export const getGradientPresetColors = (preset: string): { start: string; middle?: string; end: string; angle: number } => {
  switch (preset) {
    case 'sunset':
      return { start: '#FF512F', middle: '#F09819', end: '#FF512F', angle: 45 };
    case 'ocean':
      return { start: '#2E3192', middle: '#1BFFFF', end: '#2E3192', angle: 90 };
    case 'forest':
      return { start: '#134E5E', middle: '#71B280', end: '#134E5E', angle: 135 };
    case 'lavender':
      return { start: '#C471ED', middle: '#F64F59', end: '#C471ED', angle: 45 };
    case 'fire':
      return { start: '#F00000', middle: '#FFA500', end: '#FFD700', angle: 0 };
    case 'aurora':
      return { start: '#00C9FF', middle: '#92FE9D', end: '#FC466B', angle: 120 };
    case 'rainbow':
      return { start: '#FF0000', middle: '#00FF00', end: '#0000FF', angle: 90 };
    case 'metallic':
      return { start: '#ADA996', middle: '#F2F2F2', end: '#DBDBDB', angle: 45 };
    case 'pastel':
      return { start: '#FFDEE9', middle: '#B5FFFC', end: '#FFDEE9', angle: 60 };
    case 'neon':
      return { start: '#FF006E', middle: '#8338EC', end: '#3A86FF', angle: 135 };
    default:
      return { start: '#000000', end: '#FFFFFF', angle: 0 };
  }
};

/**
 * Generate CSS gradient string
 */
export const generateGradientCSS = (props: any): string => {
  if (!props.gradientEnabled || props.gradientType === 'none') {
    return props.backgroundColor || props.fill || 'transparent';
  }
  
  let colors: { start: string; middle?: string; end: string; angle: number } = { 
    start: '', 
    end: '', 
    angle: 0 
  };
  
  // Get colors from preset or custom
  if (props.gradientPreset && props.gradientPreset !== 'none' && props.gradientPreset !== 'custom') {
    colors = getGradientPresetColors(props.gradientPreset);
  } else {
    colors = {
      start: props.gradientStartColor || '#000000',
      middle: props.gradientMiddleColor,
      end: props.gradientEndColor || '#FFFFFF',
      angle: props.gradientAngle || 0
    };
  }
  
  // Build color stops
  const stops: string[] = [];
  const startPos = props.gradientStartPosition || 0;
  const middlePos = props.gradientMiddlePosition || 50;
  const endPos = props.gradientEndPosition || 100;
  
  stops.push(`${colors.start} ${startPos}%`);
  if (colors.middle) {
    stops.push(`${colors.middle} ${middlePos}%`);
  }
  stops.push(`${colors.end} ${endPos}%`);
  
  // Generate gradient based on type
  switch (props.gradientType) {
    case 'radial':
      const shape = props.gradientRadialShape || 'circle';
      const centerX = props.gradientCenterX || 50;
      const centerY = props.gradientCenterY || 50;
      return `radial-gradient(${shape} at ${centerX}% ${centerY}%, ${stops.join(', ')})`;
      
    case 'linear':
    default:
      return `linear-gradient(${colors.angle || props.gradientAngle || 0}deg, ${stops.join(', ')})`;
  }
};

/**
 * Generate animated gradient CSS
 */
export const generateAnimatedGradientCSS = (props: any): { background: string; animation?: string } => {
  const baseGradient = generateGradientCSS(props);
  
  if (!props.gradientAnimated) {
    return { background: baseGradient };
  }
  
  const speed = props.gradientAnimationSpeed || 5;
  const duration = 11 - speed; // Inverse relationship: higher speed = shorter duration
  
  // For animated gradients, we'll use a larger gradient and animate the position
  const animatedGradient = props.gradientType === 'linear' 
    ? `${baseGradient}, ${baseGradient}`
    : baseGradient;
  
  return {
    background: animatedGradient,
    animation: `gradientShift ${duration}s ease infinite`
  };
}; 