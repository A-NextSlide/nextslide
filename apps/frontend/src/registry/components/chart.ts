import { Type } from '@sinclair/typebox';
import { UIObject, TypeFromSchema } from '../schemas';
import { BaseComponentSchema, baseComponentDefaults } from '../base';
import { ComponentDefinition } from '../registry';
import { BorderWidthProperty } from '../library/border-shadow-properties';
import { BackgroundColorProperty } from '../library/color-properties';
import { getChartTypeDefaults } from '../utils';
import { 
  AxisConfigSchema,
  ChartTypeProperty,
  ChartThemeProperty,
  ChartDataProperty,
  ChartColorsProperty,
  ChartAnimateProperty,
  ChartMotionConfigProperty,
  ChartShowLegendProperty,
  ChartEnableAxisTicksProperty,
  ChartEnableGridProperty,
  ChartShowAxisLegendsProperty,
  ChartVerticalAnimationProperty,
  ChartBorderRadiusProperty,
  ChartInnerRadiusProperty,
  ChartPadAngleProperty,
  ChartCornerRadiusProperty,
  ChartEnableArcLinkLabelsProperty,
  ChartEnableLabelProperty,
  ChartBorderColorProperty,
  ChartStartYAtZeroProperty,
  ChartSmoothCurveProperty,
  ChartPointSizeProperty,
  ChartPointBorderWidthProperty,
  ChartLineWidthProperty,
  ChartMarginProperty,
  ChartTickSpacingProperty,
  ChartTickSpacingYProperty
} from '../library/chart-properties';
import {
  MediaSourceIdProperty,
  OriginalFilenameProperty,
  AIInterpretationProperty,
  MediaSlideIdProperty
} from '../library/image-properties';

/**
 * Chart Component Schema
 * Now includes support for media tagging and AI-enhanced data interpretation
 */
export const ChartSchema = UIObject(
  'Chart',
  {
    ...BaseComponentSchema.properties,
    
  chartType: ChartTypeProperty,
  data: ChartDataProperty,
  colors: ChartColorsProperty,
  backgroundColor: BackgroundColorProperty,
  animate: ChartAnimateProperty,
  motionConfig: ChartMotionConfigProperty,
  theme: ChartThemeProperty,
  showLegend: ChartShowLegendProperty,
  
  // Properties that are only relevant for specific chart types
  enableAxisTicks: ChartEnableAxisTicksProperty,
  enableGrid: ChartEnableGridProperty, 
  showAxisLegends: ChartShowAxisLegendsProperty,
  
  // Bar-specific properties
  verticalAnimation: ChartVerticalAnimationProperty,
  borderRadius: ChartBorderRadiusProperty,
  
  // Pie-specific properties
  innerRadius: ChartInnerRadiusProperty,
  padAngle: ChartPadAngleProperty,
  cornerRadius: ChartCornerRadiusProperty,
  enableArcLinkLabels: ChartEnableArcLinkLabelsProperty,
  
  // Shared properties
  enableLabel: ChartEnableLabelProperty,
  borderWidth: BorderWidthProperty,
  borderColor: ChartBorderColorProperty,
  
  // Line-specific properties
  startYAtZero: ChartStartYAtZeroProperty,
  smoothCurve: ChartSmoothCurveProperty,
  pointSize: ChartPointSizeProperty,
  pointBorderWidth: ChartPointBorderWidthProperty,
  lineWidth: ChartLineWidthProperty,
  
  // Spacing/Margin
  margin: ChartMarginProperty,
  
  // Axes
  axisBottom: AxisConfigSchema,
  axisLeft: AxisConfigSchema,
  
  // Ticks
  tickSpacing: ChartTickSpacingProperty,
  tickSpacingY: ChartTickSpacingYProperty,
  
  // Media tagging properties
  mediaSourceId: MediaSourceIdProperty,
  originalFilename: OriginalFilenameProperty,
  aiInterpretation: AIInterpretationProperty,
  mediaSlideId: MediaSlideIdProperty
});

/**
 * Chart properties type
 */
export type ChartProps = TypeFromSchema<typeof ChartSchema>;


/**
 * Chart component definition for the registry
 */
export const ChartDefinition: ComponentDefinition<typeof ChartSchema> = {
  type: 'Chart',
  name: 'Chart',
  schema: ChartSchema,
  defaultProps: {
    ...baseComponentDefaults,
    chartType: 'bar',
    backgroundColor: '#00000000', // Default to transparent
    // merge in chart-type defaults but exclude the `data` key to defer data defaults
    ...(() => {
      const { data, ...defaults } = getChartTypeDefaults('bar');
      return defaults;
    })(),
    // Media tagging defaults
    mediaSourceId: '',
    originalFilename: '',
    aiInterpretation: '',
    mediaSlideId: ''
  } as any,
  category: 'data'
}; 