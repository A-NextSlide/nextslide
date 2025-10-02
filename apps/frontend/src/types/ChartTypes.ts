import { ComponentInstance } from '@/types/components';
import { CSSProperties } from 'react';

/**
 * Basic chart types supported by the system
 * Extended to include more Highcharts chart types
 */
export type ChartType = 
  // Basic charts (work without extra modules)
  | 'bar' | 'column' | 'pie' | 'line' | 'area' | 'spline' | 'areaspline' | 'scatter'
  // Advanced charts (require highcharts-more module)
  | 'bubble' | 'radar' | 'waterfall' | 'gauge' | 'boxplot' | 'errorbar'
  // Specialized charts (require specific modules)
  | 'funnel' | 'pyramid' | 'treemap' | 'sunburst' | 'heatmap' 
  // Flow charts (require specific modules)
  | 'sankey' | 'dependencywheel' | 'networkgraph'
  // Other specialized types
  | 'packedbubble' | 'streamgraph' | 'wordcloud'
  ;

/**
 * Configuration for chart motion/animation
 */
export interface ChartMotionConfig {
  mass: number;
  tension: number;
  friction: number;
  clamp: boolean;
  precision: number;
  restSpeed?: number;
  restDelta?: number;
  duration?: number;
  damping?: number;
  stiffness?: number;
}

/**
 * Margin configuration for charts
 */
export interface ChartMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Axis configuration
 */
export interface AxisConfig {
  legend?: string;
  legendOffset?: number;
  legendPosition?: 'start' | 'middle' | 'end';
  tickSize?: number;
  tickPadding?: number;
  tickRotation?: number;
}

/**
 * Single data point for basic charts (bar, pie)
 */
export interface ChartDataPoint {
  id?: string;
  name?: string;
  label?: string;
  value: number;
  color?: string;
  [key: string]: any;
}

/**
 * Series data point (x, y coordinates)
 */
export interface SeriesDataPoint {
  x: string | number;
  y: number;
  [key: string]: any;
}

/**
 * Data series for line/scatter/bump charts
 */
export interface ChartSeries {
  id: string;
  data: SeriesDataPoint[];
  color?: string;
  [key: string]: any;
}

/**
 * Union type for all chart data formats
 */
export type ChartData = ChartDataPoint[] | ChartSeries[];

/**
 * Base interface for all chart properties
 */
export interface BaseChartProps {
  // Basic configuration
  chartType: ChartType;
  data: ChartData;
  
  // Visual styling
  margin?: ChartMargin;
  colors?: string[];
  backgroundColor?: string;
  theme?: 'light' | 'dark';
  lineWidth?: number;
  pointSize?: number;
  pointBorderWidth?: number;
  fontFamily?: string;
  
  // Feature toggles
  enableLabel?: boolean;
  enableAxisTicks?: boolean;
  enableGrid?: boolean;
  showLegend?: boolean;
  showAxisLegends?: boolean;
  animate?: boolean;
  enableDirectEditing?: boolean;
  isThumbnail?: boolean;
  startYAtZero?: boolean;
  
  // Animation
  motionConfig?: ChartMotionConfig | string;
  
  // Axis configuration
  axisBottom?: AxisConfig;
  axisLeft?: AxisConfig;
  /** Number of ticks to skip on the X axis (show every Nth tick) */
  tickSpacing?: number;
  /** Number of ticks to skip on the Y axis (show every Nth tick) */
  tickSpacingY?: number;

  component: ComponentInstance;
  
  // Chart-specific props will be added via intersection types
}

/**
 * Properties specific to bar charts
 */
export interface BarChartProps {
  verticalAnimation?: boolean;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  startYAtZero?: boolean;
  padding?: number;
  innerPadding?: number;
  indexScale?: { type: 'band', round?: boolean };
  valueScale?: { type: 'linear' | 'symlog', min?: number | 'auto', max?: number | 'auto' };
  isInteractive?: boolean;
}

/**
 * Properties specific to pie charts
 */
export interface PieChartProps {
  innerRadius?: number;
  padAngle?: number;
  cornerRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  enableArcLinkLabels?: boolean;
  usePatterns?: boolean;
}

/**
 * Properties specific to line charts
 */
export interface LineChartProps {
  smoothCurve?: boolean;
  startYAtZero?: boolean;
  pointSize?: number;
  pointBorderWidth?: number;
  lineWidth?: number;
}

/**
 * Properties specific to scatter charts
 */
export interface ScatterChartProps {
  pointSize?: number;
  pointBorderWidth?: number;
  startYAtZero?: boolean;
  useMesh?: boolean;
  isInteractive?: boolean;
}


/**
 * Properties specific to bump charts
 */
export interface BumpChartProps {
  pointSize?: number;
  pointBorderWidth?: number;
  lineWidth?: number;
  interpolation?: 'smooth' | 'linear';
  xPadding?: number;
  xOuterPadding?: number;
  yOuterPadding?: number;
  useMesh?: boolean;
  startLabel?: boolean | ((datum: any) => string);
  endLabel?: boolean | ((datum: any) => string);
  startLabelTextColor?: any;
  endLabelTextColor?: any;
  colors?: any;
  opacity?: number;
  activeOpacity?: number;
  inactiveOpacity?: number;
  startLabelPadding?: number;
  endLabelPadding?: number;
  isInteractive?: boolean;
  defaultActiveSerieIds?: string[];
  pointColor?: any;
  pointBorderColor?: any;
  enableGridX?: boolean;
  enableGridY?: boolean;
}

/**
 * Properties specific to heatmap charts
 */
export interface HeatmapChartProps {
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: any;
  forceSquare?: boolean;
  axisTop?: AxisConfig | null;
  axisRight?: AxisConfig | null;
  axisBottom?: AxisConfig | null;
  axisLeft?: AxisConfig | null;
  labelTextColor?: any;
  hoverTarget?: 'cell' | 'row' | 'column' | 'rowColumn';
  colors?: any;
  opacity?: number;
  activeOpacity?: number;
  inactiveOpacity?: number;
}

/**
 * Combined chart properties for any chart type
 */
export type ChartProps = BaseChartProps & 
  Partial<BarChartProps> & 
  Partial<PieChartProps> & 
  Partial<LineChartProps> & 
  Partial<ScatterChartProps> & 
  Partial<BumpChartProps> & 
  Partial<HeatmapChartProps>;

/**
 * Props used by the chart renderer component
 */
export interface ChartRendererProps {
  component: ComponentInstance;
  baseStyles: CSSProperties;
  containerRef: React.RefObject<HTMLDivElement>;
  isEditing?: boolean;
  isSelected?: boolean;
  onUpdate?: (updates: Partial<ComponentInstance>) => void;
  onChange?: (propName: string, value: any) => void;
} 