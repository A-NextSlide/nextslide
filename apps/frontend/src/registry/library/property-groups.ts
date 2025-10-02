/**
 * Property Groups
 * 
 * This file defines groups of related properties that are used
 * for organizing settings editors and determining which properties
 * to display in which specialized editors.
 */

/**
 * Layout properties 
 * Related to positioning and sizing of components
 */
export const LAYOUT_PROPERTIES = [
  'position', 'left', 'top', 'width', 'height', 'rotation', 'zIndex', 'opacity'
];

/**
 * Background properties
 * Related to the background appearance of components
 */
export const BACKGROUND_PROPERTIES = [
  'backgroundColor', 'backgroundGradient', 'backgroundImage', 'backgroundSize',
  'backgroundPosition', 'backgroundRepeat', 'backgroundOpacity'
];

/**
 * Shadow properties
 * Related to drop shadows
 */
export const SHADOW_PROPERTIES = [
  'shadow', 'shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'shadowOpacity'
];

/**
 * Border properties
 * Related to the borders of components
 */
export const BORDER_PROPERTIES = [
  'border', 'borderColor', 'borderWidth', 'borderStyle', 'borderRadius',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'
];

/**
 * Text properties
 * Related to text styling
 */
export const TEXT_PROPERTIES = [
  'text', 'html', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'textDecoration',
  'textAlign', 'color', 'letterSpacing', 'lineHeight', 'textTransform', 'paragraphSpacing'
];

/**
 * Chart properties
 * Related to chart components
 */
export const CHART_PROPERTIES = [
  'chartType', 'data', 'colors', 'animate', 'theme', 'showLegend', 'enableLabel',
  'axisBottom', 'axisLeft', 'margin', 'innerRadius', 'padAngle', 'cornerRadius',
  'enableArcLinkLabels', 'verticalAnimation', 'borderRadius', 'enableAxisTicks',
  'enableGrid', 'showAxisLegends', 'pointSize', 'pointBorderWidth', 'lineWidth',
  'smoothCurve', 'tickSpacing', 'fillOpacity', 'cellPadding', 'cellRadius'
];

/**
 * Table properties
 * Related to table components
 */
export const TABLE_PROPERTIES = [
  'data', 'columns', 'rowHeight', 'headerBackground', 'rowBackground',
  'alternateRowBackground', 'headerTextColor', 'cellTextColor',
  'borderColor', 'fontSize', 'fontFamily'
];

/**
 * Image properties
 * Related to image components
 */
export const IMAGE_PROPERTIES = [
  'src', 'alt', 'objectFit', 'borderRadius', 'borderWidth', 'borderColor',
  'shadow', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY', 'shadowSpread',
  'filterPreset', 'brightness', 'contrast', 'saturation', 'grayscale', 'sepia',
  'hueRotate', 'blur', 'invert', 'overlayColor', 'overlayOpacity', 'overlayBlendMode',
  'overlayPattern', 'overlayPatternOpacity', 'gradientOverlayEnabled', 'gradientStartColor',
  'gradientEndColor', 'gradientDirection', 'animationType', 'animationDuration',
  'animationDelay', 'animationEasing', 'scale', 'rotate', 'skewX', 'skewY',
  'perspective', 'rotateX', 'rotateY', 'rotateZ', 'maskShape', 'maskSize',
  'duotoneEnabled', 'duotoneLightColor', 'duotoneDarkColor', 'glitchEnabled',
  'glitchIntensity', 'parallaxEnabled', 'parallaxSpeed', 'hoverEffect',
  'hoverTransitionDuration', 'mediaSourceId', 'originalFilename', 'aiInterpretation',
  'mediaSlideId'
];

/**
 * Check if a property belongs to a specified property group
 */
export function isPropertyInGroup(propName: string, group: string[]): boolean {
  return group.includes(propName);
}

/**
 * Check if a property belongs to a specialized category with its own editor
 */
export function isCategorizedProperty(propName: string, componentType: string): boolean {
  // Check component-specific property groups
  if (componentType === 'TextBlock' || componentType === 'TiptapTextBlock') {
    if (isPropertyInGroup(propName, TEXT_PROPERTIES)) return true;
  }
  
  if (componentType === 'Chart') {
    if (isPropertyInGroup(propName, CHART_PROPERTIES)) return true;
  }
  
  if (componentType === 'Table') {
    if (isPropertyInGroup(propName, TABLE_PROPERTIES)) return true;
  }
  
  if (componentType === 'Image') {
    if (isPropertyInGroup(propName, IMAGE_PROPERTIES)) return true;
  }
  
  // Check generic property groups
  return (
    isPropertyInGroup(propName, LAYOUT_PROPERTIES) ||
    isPropertyInGroup(propName, BACKGROUND_PROPERTIES) ||
    isPropertyInGroup(propName, SHADOW_PROPERTIES) ||
    isPropertyInGroup(propName, BORDER_PROPERTIES)
  );
} 