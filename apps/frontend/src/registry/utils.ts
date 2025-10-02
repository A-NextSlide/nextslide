import { TSchema, Type } from '@sinclair/typebox';
import { ControlMetadata, getControlMetadata } from './schemas';
import { CHART_DEFAULT_COLORS } from '../config/chartColors';
import { getDefaultData } from '../types/DataTransformers';

/**
 * Gets control metadata for a schema property with additional derived information
 * This replaces the old schemaToPropertyDefinition function
 * 
 * @param schema The TypeBox schema to get control info from
 * @param propName The name of the property (used for labels if not defined in schema)
 * @returns An enhanced control metadata object
 */
export function getEnhancedControlMetadata(schema: TSchema, propName: string): ControlMetadata {
  if (!schema) {
    console.warn(`No schema found for property: ${propName}`);
    return {
      control: 'input',
      label: propName,
      description: '',
      controlProps: {}
    };
  }
  
  const metadata = getControlMetadata(schema);
  const control = metadata?.control || 'input';
  
  // Create base control metadata (similar to old PropDefinition)
  const enhancedMetadata: ControlMetadata = {
    control: control,
    label: metadata?.label || propName,
    description: metadata?.description || '',
    controlProps: { ...(metadata?.controlProps || {}) }
  };
  
  // Map TypeBox types to control properties
  if (schema.type === 'number') {
    if (schema.minimum !== undefined) {
      enhancedMetadata.controlProps.min = schema.minimum;
    }
    if (schema.maximum !== undefined) {
      enhancedMetadata.controlProps.max = schema.maximum;
    }
    if (schema.multipleOf !== undefined) {
      enhancedMetadata.controlProps.step = schema.multipleOf;
    }
  }
  
  // Handle enum values for dropdowns
  if (schema.enum) {
    enhancedMetadata.controlProps.enumValues = schema.enum as string[];
  }
  
  return enhancedMetadata;
}

/**
 * Creates a control metadata factory for a specific component's properties
 * This replaces the old createPropertyDefinitionFactory function
 * 
 * @param schemaProperties The schema properties object from the component definition
 * @returns A function that generates ControlMetadata from just a property name
 */
export function createControlMetadataFactory(
  schemaProperties: Record<string, TSchema>
) {
  return (propName: string): ControlMetadata => {
    const schema = schemaProperties[propName] as TSchema;
    return getEnhancedControlMetadata(schema, propName);
  };
}

/**
 * Determines if a property is supported for a specific chart type
 * 
 * @param propertyName The name of the property to check 
 * @param chartType The type of chart to check support for
 * @returns True if the property is supported for the given chart type
 */
export function isPropertySupportedForChartType(propertyName: string, chartType: string): boolean {
  // Properties applicable to all chart types
  const universalProperties = [
    'colors', 'animate', 'theme', 'showLegend', 'enableLabel',
    'margin', 'width', 'height', 'position', 'rotation', 'opacity', 'zIndex',
    'chartType', 'data'
  ];
  
  if (universalProperties.includes(propertyName)) {
    return true;
  }
  
  // Chart-type specific properties
  const chartTypeProperties: Record<string, string[]> = {
    bar: [
      'enableAxisTicks', 'enableGrid', 'showAxisLegends', 'startYAtZero', 
      'verticalAnimation', 'animate', 'motionConfig', 'borderRadius', 'borderWidth', 'borderColor', 'enableLabel',
      'tickSpacing', 'tickSpacingY', 'tickRotation'
    ],
    pie: [
      'innerRadius', 'padAngle', 'cornerRadius', 'enableArcLinkLabels', 
      'animate', 'borderWidth', 'borderColor'
    ],
    line: [
      'enableAxisTicks', 'enableGrid', 'showAxisLegends', 'startYAtZero', 
      'animate', 'smoothCurve', 'pointSize', 'pointBorderWidth', 'lineWidth',
      'tickSpacing', 'tickSpacingY', 'tickRotation'
    ],
    scatter: [
      'enableAxisTicks', 'enableGrid', 'showAxisLegends', 'animate',
      'pointSize', 'pointBorderWidth', 'startYAtZero', 'tickSpacing', 'tickSpacingY', 'tickRotation'
    ],
    bump: [
      'enableAxisTicks', 'enableGrid', 'showAxisLegends', 'animate',
      'pointSize', 'pointBorderWidth', 'lineWidth', 'tickSpacing', 'tickSpacingY', 'tickRotation'
    ],
    heatmap: [
      'enableAxisTicks', 'enableGrid', 'showAxisLegends', 'animate',
      'borderRadius', 'tickSpacing', 'tickSpacingY', 'tickRotation'
    ]
  };
  
  // Check if property is supported for the given chart type
  return chartTypeProperties[chartType]?.includes(propertyName) || false;
}


/**
 * Returns default property values for a specific chart type
 * 
 * @param chartType The type of chart to get defaults for
 * @returns An object with default property values for the chart type
 */
export function getChartTypeDefaults(chartType: string): Record<string, any> {
  
  // Common defaults for all chart types
  const commonDefaults = {
    colors: CHART_DEFAULT_COLORS,
    animate: true,
    enableLabel: true,
    showLegend: false, // Legends off by default per requirements
    theme: 'light',
    margin: { top: 40, right: 80, bottom: 50, left: 60 }
  };

  // Chart-specific defaults
  const chartDefaults: Record<string, any> = {
    bar: {
      data: getDefaultData('bar'),
      verticalAnimation: true,
      borderRadius: 3,
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true,
      horizontalBars: true, // Bar charts are horizontal by default
      axisBottom: { legend: 'Value', legendOffset: 36, tickRotation: 0, legendPosition: 'middle' },
      axisLeft:   { legend: 'Category',    legendOffset: -40, tickRotation: 0, legendPosition: 'middle' }
    },
    column: {
      data: getDefaultData('column'),
      borderRadius: 3,
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true
    },
    pie: {
      data: getDefaultData('pie'),
      innerRadius: 0.5,
      padAngle: 0.7,
      cornerRadius: 3,
      enableArcLinkLabels: true
    },
    line: {
      data: getDefaultData('line'),
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true,
      axisBottom: { legend: 'Month', legendOffset: 36, tickRotation: 0, legendPosition: 'middle' },
      axisLeft:   { legend: 'Value', legendOffset: -40, tickRotation: 0, legendPosition: 'middle' },
      pointSize: 6,
      pointBorderWidth: 1,
      lineWidth: 3,
      smoothCurve: true, // Force smooth curve to true for line charts
      // Add below to ensure it's picked up in the final props
      _ensureSmoothCurve: true
    },
    area: {
      data: getDefaultData('area'),
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true,
      lineWidth: 2
    },
    spline: {
      data: getDefaultData('spline'),
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true,
      pointSize: 10,
      pointBorderWidth: 2,
      lineWidth: 3
    },
    areaspline: {
      data: getDefaultData('areaspline'),
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true,
      lineWidth: 2
    },
    scatter: {
      data: getDefaultData('scatter'),
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true,
      axisBottom: { legend: 'X', legendOffset: 36, tickRotation: 0, legendPosition: 'middle' },
      axisLeft:   { legend: 'Y', legendOffset: -40, tickRotation: 0, legendPosition: 'middle' },
      pointSize: 12,
      pointBorderWidth: 2
    },
    bubble: {
      data: getDefaultData('bubble'),
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true,
      pointSize: 10
    },
    radar: {
      data: getDefaultData('radar'),
      showLegend: true // Radar charts typically need legend
    },
    waterfall: {
      data: getDefaultData('waterfall'),
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true
    },
    gauge: {
      data: getDefaultData('gauge'),
      gaugeLabel: 'Speed',
      minValue: 0,
      maxValue: 100
    },
    boxplot: {
      data: getDefaultData('boxplot'),
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true
    },
    errorbar: {
      data: getDefaultData('errorbar'),
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true
    },
    funnel: {
      data: getDefaultData('funnel'),
      enableLabel: true
    },
    pyramid: {
      data: getDefaultData('pyramid'),
      enableLabel: true
    },
    heatmap: {
      data: getDefaultData('heatmap'),
      enableAxisTicks: true,
      showAxisLegends: true,
      axisBottom: { legend: 'X', legendOffset: 36, tickRotation: 0, legendPosition: 'middle' },
      axisLeft:   { legend: 'Y', legendOffset: -40, tickRotation: 0, legendPosition: 'middle' },
      cellPadding: 2,
      cellRadius: 3
    },
    treemap: {
      data: getDefaultData('treemap'),
      enableLabel: true
    },
    sunburst: {
      data: getDefaultData('sunburst'),
      enableLabel: true
    },
    sankey: {
      data: getDefaultData('sankey')
    },
    dependencywheel: {
      data: getDefaultData('dependencywheel')
    },
    networkgraph: {
      data: getDefaultData('networkgraph')
    },
    packedbubble: {
      data: getDefaultData('packedbubble'),
      enableLabel: true
    },
    streamgraph: {
      data: getDefaultData('streamgraph')
    },
    wordcloud: {
      data: getDefaultData('wordcloud')
    }
  };

  // Merge common defaults with chart-specific defaults
  return { ...commonDefaults, ...(chartDefaults[chartType] || {}) };
} 