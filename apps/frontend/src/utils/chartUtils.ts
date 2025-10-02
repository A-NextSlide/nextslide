import { isEqual } from 'lodash';

/**
 * Efficiently compares chart props to determine what kind of changes were made
 * This helps minimize unnecessary re-renders and animations
 */
export const diffChartProps = (prevProps: Record<string, any>, nextProps: Record<string, any>) => {
  // Visual properties that affect appearance but not data structure
  const visualPropsChanged = [
    'chartType', 'colors', 'theme', 'enableLabel', 'enableAxisTicks',
    'enableGrid', 'showLegend', 'showAxisLegends', 'animate',
    'borderRadius', 'borderWidth', 'borderColor',
    'innerRadius', 'cornerRadius', 'padAngle',
    'pointSize', 'pointBorderWidth', 'lineWidth',
    'verticalAnimation', 'smoothCurve', 'tickSpacing'
  ].some(prop => prevProps[prop] !== nextProps[prop]);
  
  // Check data structure changes separately - this is more expensive
  const dataChanged = !isEqual(prevProps.data, nextProps.data);
  
  // Position/size changes don't require chart redraws
  const sizeChanged = [
    'width', 'height', 'x', 'y'
  ].some(prop => prevProps[prop] !== nextProps[prop]);
  
  return { 
    visualPropsChanged,
    dataChanged, 
    sizeChanged,
    // For optimizing updates
    shouldRedrawChart: visualPropsChanged || dataChanged,
    shouldRepositionOnly: !visualPropsChanged && !dataChanged && sizeChanged
  };
};

/**
 * Creates an animation key for chart components based on component state
 */
export const createChartAnimationKey = (
  componentId: string, 
  shouldAnimate: boolean, 
  isEditMode: boolean
) => {
  if (isEditMode) {
    // In edit mode, use stable key to prevent animations
    return `${componentId}-stable`;
  }
  
  // In view mode, create animation keys when animation is needed
  return `${componentId}-${shouldAnimate ? Date.now() : 'stable'}`;
};

/**
 * Helper to extract chart colors from different data formats
 */
export const extractChartColors = (data: any[], defaultColors: string[]) => {
  if (!Array.isArray(data) || data.length === 0) {
    return defaultColors;
  }
  
  // Try to extract colors from data items if they have color property
  const extractedColors = data.map(item => item.color || null).filter(Boolean);
  
  if (extractedColors.length > 0) {
    return extractedColors;
  }
  
  return defaultColors;
};

/**
 * Initializes window globals needed for chart rendering and animation
 */
export const initChartGlobals = () => {
  if (typeof window !== 'undefined') {
    // Initialize chart property change flag
    if ((window as any).__chartPropertyChanged === undefined) {
      (window as any).__chartPropertyChanged = false;
    }
    
    // Initialize animation enabled flag
    if ((window as any).__chartAnimationsEnabled === undefined) {
      (window as any).__chartAnimationsEnabled = true;
    }
  }
};

// Initialize globals when this module is imported
initChartGlobals();