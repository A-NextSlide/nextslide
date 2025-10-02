import { ChartData, ChartMargin, ChartType } from '@/types/ChartTypes';
import { scaleLinear } from 'd3-scale';

/**
 * Creates adjusted margins based on legend visibility
 * @deprecated Use Highcharts default legend handling instead
 */
export const getAdjustedMargin = (
  margin?: ChartMargin, 
  showLegend = false
): ChartMargin => {
  const defaultMargin = { top: 40, right: 40, bottom: 60, left: 60 };
  const baseMargin = margin || defaultMargin;
  
  // Just return the base margin - let Highcharts handle legend positioning
  return baseMargin;
};

/**
 * Calculate dynamic margins based on chart content and settings
 */
export const calculateDynamicMargins = (
  baseMargin: ChartMargin,
  settings: {
    showLegend: boolean;
    tickRotation: number;
    averageLabelLength: number;
    legendWidth?: number;
    axisBottomLegend?: string;
    axisLeftLegend?: string;
    width?: number;
    height?: number;
  }
): ChartMargin => {
  // Base margins - let Highcharts handle legend positioning
  const margin: ChartMargin = {
    top: 20,    // Fixed top margin
    right: 10,   // Fixed right margin - no legend adjustment
    bottom: 40,  // Base bottom margin
    left: 10     // Minimal left margin - let Highcharts auto-calculate based on labels
  };
  
  // Adjust bottom margin for axis legend
  margin.bottom = settings.axisBottomLegend ? 50 : 40;
  
  // For left margin, we keep it minimal to allow auto-calculation
  // Only add extra space if there's a y-axis legend
  margin.left = settings.axisLeftLegend ? 30 : 10;
  
  // Keep top margin fixed
  margin.top = 20;
  
  // Keep right margin fixed - let Highcharts handle legend spacing
  margin.right = 10;
  
  return margin;
};

/**
 * Extract colors from chart data based on chart type
 */
export const getColorsFromData = (data: ChartData, chartType: ChartType): string[] | undefined => {
  if (!data || !Array.isArray(data) || data.length === 0) return undefined;
  
  // For bar and pie charts, colors are directly on the items
  if (['bar', 'pie'].includes(chartType)) {
    return (data as any[]).map(item => item.color || '#cccccc');
  }
  
  // For line, scatter, bump, and heatmap charts, colors are on the series
  if (['line', 'scatter', 'bump', 'heatmap'].includes(chartType)) {
    return (data as any[]).map(series => series.color || '#cccccc');
  }
  
  return undefined;
};

/**
 * Get color function for bar charts
 */
export const getBarColor = (bar: any, colors?: string[]): string => {
  // If the data item has a color property, use it
  if (bar.data && bar.data.color && typeof bar.data.color === 'string') {
    return bar.data.color;
  }
  
  // Otherwise fall back to the colors array
  if (Array.isArray(colors) && colors[bar.index % colors.length]) {
    return colors[bar.index % colors.length];
  }
  
  // Final fallback
  return '#61cdbb';
};

/**
 * Get color function for pie charts
 */
export const getPieColor = (pie: any, colors?: string[]): string => {
  // If the data has a color property, use it
  if (pie.data && pie.data.color && typeof pie.data.color === 'string') {
    return pie.data.color;
  }
  
  // Otherwise fall back to the colors array
  if (Array.isArray(colors) && colors[pie.index % colors.length]) {
    return colors[pie.index % colors.length];
  }
  
  // Final fallback
  return '#61cdbb';
};

/**
 * Create a legend configuration based on chart data
 */
export const createLegendFromData = (data: any[], colors?: string[]): any => {
  // Default legend configuration
  const defaultLegend = {
    anchor: 'top-right',
    direction: 'column',
    justify: false,
    translateX: -20, // Increased negative value to move further right
    translateY: 10,
    itemsSpacing: 4,
    itemWidth: 120, // Increased to accommodate longer labels
    itemHeight: 18,
    itemTextColor: '#666',
    itemDirection: 'left-to-right',
    itemOpacity: 1,
    symbolSize: 12,
    symbolShape: 'circle',
    effects: [
      {
        on: 'hover',
        style: {
          itemOpacity: 0.8,
          itemTextColor: '#333'
        }
      }
    ]
  };

  // Create legend items from data
  return {
    ...defaultLegend,
    data: data.map((item, index) => {
      // Handle different data formats
      const id = item.id || item.name || `Item ${index+1}`;
      const label = item.label || item.name || item.id || `Item ${index+1}`;
      const itemColor = item.color || (Array.isArray(colors) ? colors[index % colors.length] : '#61cdbb');
      
      return {
        id,
        label,
        color: itemColor
      };
    })
  };
};

/**
 * Calculate appropriate tick spacing based on data size
 */
export const calculateTickSpacing = (dataPoints: number): number => {
  // For small datasets (< 10 points): show all ticks (spacing = 1)
  if (dataPoints < 10) return 1;
  
  // For medium datasets (10-20 points): show every other tick (spacing = 2)
  if (dataPoints < 20) return 2;
  
  // For larger datasets, scale up spacing (max reasonable spacing is 5)
  return Math.min(5, Math.ceil(dataPoints / 10));
};

/**
 * Create a universal tooltip container style
 */
export const createTooltipContainerStyle = (themeType: 'light' | 'dark'): React.CSSProperties => ({
  background: themeType === 'dark' ? '#333' : 'white',
  padding: '8px 12px',
  border: '1px solid #ccc',
  borderRadius: '4px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  fontSize: '12px',
  color: themeType === 'dark' ? '#eee' : '#333'
});

/**
 * Format a value for display in tooltips and labels
 */
export const formatChartValue = (value: number): string => {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(1);
};
// --------------------------------------------------------------------------
// Tick Spacing Helpers
// --------------------------------------------------------------------------
/**
 * Returns an array of tick values filtered to every Nth entry.
 * Useful for discrete axes where tick values correspond directly to data points.
 * @param values Array of tick values (strings or numbers)
 * @param spacing Show every Nth tick (spacing >= 1)
 */
export function getDiscreteTickValues(
  values: Array<string | number>,
  spacing: number
): Array<string | number> {
  if (spacing <= 1) return values;
  return values.filter((_, idx) => idx % spacing === 0);
}

/**
 * Returns a tick count for continuous axes based on a spacing slider.
 * Larger spacing yields fewer ticks. Minimum of 2 ticks.
 * @param spacing Slider value for tick spacing (>=1)
 */
export function getContinuousTickCount(spacing: number): number {
  return Math.max(2, 11 - spacing);
}
/**
 * Returns filtered tick values for both discrete and continuous axes.
 * Deduplicates entries, sorts them, and returns every Nth value.
 * @param values Array of tick values (strings or numbers)
 * @param spacing Show every Nth tick (spacing >= 1)
 */
export function getFilteredTickValues(
  values: Array<string | number>,
  spacing: number
): Array<string | number> {
  if (spacing <= 1) return Array.from(values);
  // Dedupe preserving first occurrence order
  const unique: Array<string | number> = [];
  const seen = new Set<string | number>();
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      unique.push(v);
    }
  }
  // Determine if values are numeric for sorting
  const sorted = unique.slice();
  if (unique.every(v => typeof v === 'number')) {
    (sorted as number[]).sort((a, b) => (a as number) - (b as number));
  } else if (unique.every(v => typeof v === 'string')) {
    (sorted as string[]).sort((a, b) => String(a).localeCompare(String(b)));
  }
  return getDiscreteTickValues(sorted, spacing);
}
// --------------------------------------------------------------------------
// Chart renderer helper utilities
// --------------------------------------------------------------------------
/**
 * Map data array to legend items for Nivo legends.
 */
export function getLegendItems(
  data: any[],
  colors?: string[]
): Array<{ id: string; label: string; color: string }> {
  return data.map((item, index) => {
    const id = item.id || item.name || `Item ${index + 1}`;
    const label = item.label || item.name || item.id || `Item ${index + 1}`;
    const color =
      (item.color as string) ||
      (Array.isArray(colors) ? colors[index % colors.length] : '#61cdbb');
    return { id, label, color };
  });
}

/**
 * Apply tick spacing to an axis configuration.
 * @param axis Nivo AxisProps or null
 * @param spacing Number of ticks to skip (>=1)
 * @param values Array of axis values (discrete or continuous)
 * @param discrete Whether values are discrete (strings/numbers)
*/
/**
 * Apply tick spacing to an axis configuration by skipping every Nth tick.
 * For discrete axes, skips every Nth original value.
 * For continuous axes, generates default numeric ticks from the data domain and skips every Nth.
 * @param axis Nivo AxisProps or null
 * @param spacing Number of ticks to skip (>=1)
 * @param values Array of axis values (strings or numbers)
 * @param discrete Whether axis is discrete (strings/numbers) or continuous
 */
export function applyTickSpacing(
  axis: any,
  spacing: number | undefined,
  values: Array<string | number>,
  discrete: boolean = true
): any {
  const tickSpacing = spacing ?? 1;
  if (!axis || tickSpacing <= 1) return axis;
  if (discrete) {
    const tickValues = getDiscreteTickValues(values, tickSpacing);
    return { ...axis, tickValues };
  } else {
    // For continuous axes, reduce the number of ticks based on spacing
    const numericValues = values.filter(v => typeof v === 'number') as number[];
    if (numericValues.length === 0) return axis;
    const min = Math.min(...numericValues, 0);
    const max = Math.max(...numericValues);
    const scale = scaleLinear().domain([min, max]).nice();
    
    // Calculate tick count based on spacing - fewer ticks for higher spacing
    const baseTickCount = 10;
    const tickCount = Math.max(2, Math.ceil(baseTickCount / tickSpacing));
    const candidateNiceTicks: number[] = scale.ticks(tickCount);
    
    return { ...axis, tickValues: candidateNiceTicks };
  }
}

/**
 * Sanitize motionConfig based on animate flag and allowed presets.
 */
const _validMotionConfigs = ['default', 'gentle', 'wobbly', 'stiff', 'slow', 'molasses'];
export function sanitizeMotionConfig(
  animate: boolean | undefined,
  motionConfig: any
): string | undefined {
  if (!animate) return undefined;
  if (typeof motionConfig === 'string' && _validMotionConfigs.includes(motionConfig)) {
    return motionConfig;
  }
  return 'default';
}



/**
 * Calculate dynamic tick spacing and rotation based on chart dimensions
 * to prevent overlapping when charts are resized smaller
 */
export const calculateDynamicTickSettings = (
  width: number,
  height: number,
  dataPointCount: number,
  baseTickSpacing: number = 1,
  baseTickRotation: number = 0,
  averageLabelLength: number = 8, // Estimated average character length of labels
  baseTickSpacingY?: number
): {
  tickSpacing: number;
  tickSpacingY: number;
  tickRotation: number;
} => {
  // Define breakpoints for width and height
  const SMALL_WIDTH = 800;   // Start adjustments earlier
  const MEDIUM_WIDTH = 1200;  // Even larger threshold
  const SMALL_HEIGHT = 500;  // Start Y adjustments earlier
  const MEDIUM_HEIGHT = 800; // Larger threshold for Y
  
  // Calculate aspect ratio for extreme cases
  const aspectRatio = width / height;
  const isVeryWide = aspectRatio > 3; // Very wide charts
  const isVeryTall = aspectRatio < 0.5; // Very tall charts
  
  // Calculate width-based adjustments with smooth transitions
  let widthMultiplier = 1;
  let rotationAdjustment = 0;
  
  if (width < 300) {
    // Very small width - maximum adjustments
    widthMultiplier = 4.0;
    rotationAdjustment = 45;
  } else if (width < 500) {
    // Small width - strong adjustments
    const ratio = (500 - width) / (500 - 300);
    widthMultiplier = 2.5 + (1.5 * ratio); // 2.5 to 4.0
    rotationAdjustment = Math.round(30 + (15 * ratio)); // 30 to 45 degrees
  } else if (width < SMALL_WIDTH) {
    // Medium-small width - moderate adjustments
    const ratio = (SMALL_WIDTH - width) / (SMALL_WIDTH - 500);
    widthMultiplier = 1.5 + (1.0 * ratio); // 1.5 to 2.5
    rotationAdjustment = Math.round(15 + (15 * ratio)); // 15 to 30 degrees
  } else if (width < MEDIUM_WIDTH) {
    // Medium width - gentle adjustments start very early!
    const ratio = (MEDIUM_WIDTH - width) / (MEDIUM_WIDTH - SMALL_WIDTH);
    widthMultiplier = 1.2 + (0.3 * ratio); // 1.2 to 1.5
    rotationAdjustment = Math.round(15 * ratio); // 0 to 15 degrees
  } else {
    widthMultiplier = 1; // No adjustment for larger widths
    rotationAdjustment = 0;
  }
  
  // Additional adjustments for extreme aspect ratios
  if (isVeryWide && height < MEDIUM_HEIGHT) {
    // Very wide but short charts need more Y spacing and X rotation
    rotationAdjustment = Math.max(rotationAdjustment, 30);
  }
  
  if (isVeryTall && width < MEDIUM_WIDTH) {
    // Very tall but narrow charts need more X spacing and rotation
    widthMultiplier = Math.max(widthMultiplier, 2);
    rotationAdjustment = Math.max(rotationAdjustment, 45);
  }
  
  // Calculate height-based adjustments for Y-axis (vertical spacing) - similar to X axis
  let heightMultiplier = 1;
  
  if (height < 200) {
    // Very small height - maximum adjustments
    heightMultiplier = 4.0;
  } else if (height < 350) {
    // Small height - strong adjustments
    const ratio = (350 - height) / (350 - 200);
    heightMultiplier = 2.5 + (1.5 * ratio); // 2.5 to 4.0
  } else if (height < SMALL_HEIGHT) {
    // Medium-small height
    const ratio = (SMALL_HEIGHT - height) / (SMALL_HEIGHT - 350);
    heightMultiplier = 1.5 + (1.0 * ratio); // 1.5 to 2.5
  } else if (height < MEDIUM_HEIGHT) {
    // Medium height - adjustments start early
    const ratio = (MEDIUM_HEIGHT - height) / (MEDIUM_HEIGHT - SMALL_HEIGHT);
    heightMultiplier = 1.2 + (0.3 * ratio); // 1.2 to 1.5
  } else {
    heightMultiplier = 1; // No adjustment for larger heights
  }
  
  // Apply data point count factor - more data points need more spacing
  const dataFactor = Math.max(1, Math.sqrt(dataPointCount / 10));
  
  // Apply label length factor - longer labels need more spacing or rotation
  const labelFactor = Math.max(1, averageLabelLength / 8);
  const labelWidthEstimate = averageLabelLength * 8; // Rough estimate: 8px per character
  const availableSpacePerTick = width / dataPointCount;
  
  // If labels would overlap without rotation, increase spacing or rotation
  if (labelWidthEstimate > availableSpacePerTick && rotationAdjustment === 0) {
    const overlapRatio = labelWidthEstimate / availableSpacePerTick;
    if (overlapRatio > 2) {
      rotationAdjustment = Math.max(rotationAdjustment, 45);
    } else if (overlapRatio > 1.5) {
      rotationAdjustment = Math.max(rotationAdjustment, 30);
    }
    widthMultiplier = Math.max(widthMultiplier, Math.sqrt(overlapRatio));
  }
  
  // Calculate final values
  const tickSpacing = Math.max(1, Math.round(baseTickSpacing * widthMultiplier * dataFactor * labelFactor));
  // Y-axis should only be affected by height, not data count
  const tickSpacingY = Math.max(1, Math.round((baseTickSpacingY || baseTickSpacing) * heightMultiplier));
  const tickRotation = Math.min(90, Math.max(-90, baseTickRotation + rotationAdjustment));
  
  return {
    tickSpacing,
    tickSpacingY,
    tickRotation
  };
};