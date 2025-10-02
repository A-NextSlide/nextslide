import { Type } from '@sinclair/typebox';
import { UIProperty, UIArray, UIEnum, UIObject } from '../schemas';
import { createColorProperty } from './color-properties';

/**
 * Chart Properties Library
 * 
 * Common chart property definitions for component schemas
 */

/**
 * Chart types definition with labels for UI display
 * Extended to include all Highcharts chart types
 */
export const CHART_TYPES = {
  // Basic charts (work without extra modules)
  bar: { type: 'bar', label: 'Bar Chart', category: 'basic' },
  column: { type: 'column', label: 'Column Chart', category: 'basic' },
  pie: { type: 'pie', label: 'Pie Chart', category: 'basic' },
  line: { type: 'line', label: 'Line Chart', category: 'basic' },
  area: { type: 'area', label: 'Area Chart', category: 'basic' },
  spline: { type: 'spline', label: 'Spline Chart', category: 'basic' },
  areaspline: { type: 'areaspline', label: 'Area Spline', category: 'basic' },
  scatter: { type: 'scatter', label: 'Scatter Chart', category: 'basic' },
  
  // Advanced charts
  bubble: { type: 'bubble', label: 'Bubble Chart', category: 'advanced' },
  radar: { type: 'radar', label: 'Radar Chart', category: 'advanced' },
  waterfall: { type: 'waterfall', label: 'Waterfall Chart', category: 'advanced' },
  gauge: { type: 'gauge', label: 'Gauge Chart', category: 'advanced' },
  boxplot: { type: 'boxplot', label: 'Box Plot', category: 'advanced' },
  errorbar: { type: 'errorbar', label: 'Error Bar', category: 'advanced' },
  
  // Specialized charts
  funnel: { type: 'funnel', label: 'Funnel Chart', category: 'specialized' },
  pyramid: { type: 'pyramid', label: 'Pyramid Chart', category: 'specialized' },
  treemap: { type: 'treemap', label: 'Treemap', category: 'specialized' },
  sunburst: { type: 'sunburst', label: 'Sunburst', category: 'specialized' },
  heatmap: { type: 'heatmap', label: 'Heatmap', category: 'specialized' },
  
  // Flow charts
  sankey: { type: 'sankey', label: 'Sankey Diagram', category: 'flow' },
  dependencywheel: { type: 'dependencywheel', label: 'Dependency Wheel', category: 'flow' },
  networkgraph: { type: 'networkgraph', label: 'Network Graph', category: 'flow' },
  
  // Other specialized types
  packedbubble: { type: 'packedbubble', label: 'Packed Bubble', category: 'other' },
  streamgraph: { type: 'streamgraph', label: 'Streamgraph', category: 'other' },
  wordcloud: { type: 'wordcloud', label: 'Word Cloud', category: 'other' }
} as const;

/**
 * Simple Chart types for TypeBox enum definition
 * This is derived from the main CHART_TYPES object
 */
export const CHART_TYPE_VALUES = Object.fromEntries(
  Object.entries(CHART_TYPES).map(([key, value]) => [key, value.type])
);

/**
 * Theme options for charts
 */
export const CHART_THEMES = {
  light: 'light',
  dark: 'dark'
};

/**
 * Chart type property
 */
export const ChartTypeProperty = UIEnum("Chart Type", CHART_TYPE_VALUES, "Type of chart to display", {
  control: 'dropdown',
  label: 'Chart Type',
});

/**
 * Chart theme property
 */
export const ChartThemeProperty = UIEnum("Chart Theme", CHART_THEMES, "Color theme for the chart", {
  control: 'dropdown',
  label: 'Theme',
});

/**
 * Data Point Schema for chart data
 */
export const ChartDataPointSchema = UIObject('ChartDataPoint',
  {
    name: UIProperty(Type.String(), {
        control: 'input',
        label: 'Label',
        description: 'Data point label'
    }),
    
    value: UIProperty(Type.Number(), {
      control: 'input',
      label: 'Value',
      description: 'Numeric value for this data point'
    }),
  
    color: createColorProperty('Color', 'Color for this data point')
  },
);

/**
 * Chart data property
 */
export const ChartDataProperty = UIArray("Chart Data", ChartDataPointSchema, "Data points for the chart", {
  control: 'custom',
  label: 'Chart Data',
});

/**
 * Chart colors property
 */
export const ChartColorsProperty = UIArray("Color Palette", Type.String(), "Colors to use for the chart elements", {
  control: 'custom',
  label: 'Color Palette',
});

/**
 * Chart animation property
 */
export const ChartAnimateProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Enable Animation',
  description: 'Enable or disable animations'
});

/**
 * Chart animation style property (Bar charts)
 */
export const ChartMotionConfigProperty = UIEnum(
  'Animation Style',
  {
    default: 'default',
    gentle: 'gentle',
    wobbly: 'wobbly',
    stiff: 'stiff',
    slow: 'slow',
    responsive: 'responsive'
  },
  'Animation style preset for the chart',
  {
    control: 'dropdown',
    label: 'Animation Style',
    controlProps: {
      showWhen: { chartType: ['bar'] }
    }
  }
);

/**
 * Chart legend property
 */
export const ChartShowLegendProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Legend',
  description: 'Display a legend for the chart data'
});

/**
 * Chart axis ticks property
 */
export const ChartEnableAxisTicksProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Axis',
  description: 'Display ticks on the axes',
  controlProps: {
    showWhen: { chartType: ['bar', 'line'] }
  }
});

/**
 * Chart grid property
 */
export const ChartEnableGridProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Grid',
  description: 'Show grid lines on the chart',
  controlProps: {
    showWhen: { chartType: ['bar', 'line'] }
  }
});

/**
 * Chart axis legends property
 */
export const ChartShowAxisLegendsProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Axis Titles',
  description: 'Display titles for the axes',
  controlProps: {
    showWhen: { chartType: ['bar', 'line'] }
  }
});

/**
 * Chart vertical animation property (Bar charts)
 */
export const ChartVerticalAnimationProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Switch to vertical',
  description: 'Animate bars vertically instead of horizontally',
  controlProps: {
    showWhen: { chartType: 'bar' }
  }
});

/**
 * Chart border radius property (Bar charts)
 */
export const ChartBorderRadiusProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Border Radius (Bar)',
  description: 'Radius of the bar corners',
  controlProps: {
    min: 0,
    max: 20,
    showWhen: { chartType: 'bar' }
  }
});

/**
 * Chart inner radius property (Pie charts)
 */
export const ChartInnerRadiusProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Inner Radius (Pie)',
  description: 'Inner radius for donut charts',
  controlProps: {
    min: 0,
    max: 0.9,
    step: 0.05,
    showWhen: { chartType: 'pie' }
  }
});

/**
 * Chart pad angle property (Pie charts)
 */
export const ChartPadAngleProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Pad Angle (Pie)',
  description: 'Padding between pie slices',
  controlProps: {
    min: 0,
    max: 3,
    step: 0.1,
    showWhen: { chartType: 'pie' }
  }
});

/**
 * Chart corner radius property (Pie charts)
 */
export const ChartCornerRadiusProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Corner Radius',
  description: 'Radius of slice corners',
  controlProps: {
    min: 0,
    max: 20,
    showWhen: { chartType: 'pie' }
  }
});

/**
 * Chart arc link labels property (Pie charts)
 */
export const ChartEnableArcLinkLabelsProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Labels',
  description: 'Display outer labels with connecting lines',
  controlProps: {
    showWhen: { chartType: 'pie' }
  }
});

/**
 * Chart enable labels property
 */
export const ChartEnableLabelProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Labels',
  description: 'Display value labels'
});

/**
 * Chart border color property
 */
export const ChartBorderColorProperty = createColorProperty(
  'Stroke Color',
  'Border color with alpha channel support',
  '#000000ff'
);

/**
 * Chart start Y at zero property (Line charts)
 */
export const ChartStartYAtZeroProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Start Y at Zero',
  description: 'Force Y axis to start at zero',
  controlProps: {
    showWhen: { chartType: 'line' }
  }
});

/**
 * Chart smooth curve property (Line charts)
 */
export const ChartSmoothCurveProperty = UIProperty(Type.Boolean(), {
  control: 'checkbox',
  label: 'Smooth Lines',
  description: 'Use curved lines instead of straight lines',
  controlProps: {
    showWhen: { chartType: 'line' }
  }
});

/**
 * Chart point size property (Line/Scatter charts)
 */
export const ChartPointSizeProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Point Size',
  description: 'Size of data points',
  controlProps: {
    min: 0,
    max: 20,
    step: 1,
    showWhen: { chartType: ['line', 'scatter'] }
  }
});

/**
 * Chart point border width property (Line/Scatter charts)
 */
export const ChartPointBorderWidthProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Point Border Width',
  description: 'Width of point borders',
  controlProps: {
    min: 0,
    max: 10,
    step: 1,
    showWhen: { chartType: ['line', 'scatter'] }
  }
});

/**
 * Chart line width property (Line charts)
 */
export const ChartLineWidthProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Line Width',
  description: 'Width of lines connecting points',
  controlProps: {
    min: 1,
    max: 10,
    step: 1,
    showWhen: { chartType: 'line' }
  }
});

/**
 * Chart margin property
 */
export const ChartMarginProperty = UIObject('ChartMargin', {
  top: UIProperty(Type.Number(), {
    control: 'slider',
    label: 'Top',
    description: 'Top margin'
  }),
  right: UIProperty(Type.Number(), {
    control: 'slider',
    label: 'Right',
    description: 'Right margin'
  }),
  bottom: UIProperty(Type.Number(), {
    control: 'slider',
    label: 'Bottom',
    description: 'Bottom margin'
  }),
  left: UIProperty(Type.Number(), {
    control: 'slider',
    label: 'Left',
    description: 'Left margin'
  })
}, 'Space around the chart');

/**
 * Axis Configuration Schema
 */
export const AxisConfigSchema = UIObject('AxisConfig', 
  {
  legend: UIProperty(Type.String(), {
    control: 'input',
    label: 'Title',
    description: 'Axis title text'
  }),
  
  legendOffset: UIProperty(Type.Number(), {
    control: 'slider',
    label: 'Title Offset',
    description: 'Distance of the title from the axis',
    controlProps: {
      min: -100,
      max: 100
    }
  }),

  tickRotation: UIProperty(Type.Number(), {
    control: 'slider',
    label: 'Tick Label Rotation',
    description: 'Rotation angle for axis tick labels (in degrees)',
    controlProps: {
      min: -90,
      max: 90,
      step: 1
    }
  })
});

/**
 * Chart tick spacing property
 */
export const ChartTickSpacingProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Tick Spacing',
  description: 'Control spacing between axis ticks',
  controlProps: {
    min: 1,
    max: 10,
    step: 1,
    showWhen: { chartType: ['bar', 'line'] }
  }
});

/**
 * Chart Y-axis tick spacing property
 */
export const ChartTickSpacingYProperty = UIProperty(Type.Number(), {
  control: 'slider',
  label: 'Y Tick Spacing',
  description: 'Control spacing between Y-axis ticks',
  controlProps: {
    min: 1,
    max: 10,
    step: 1,
    showWhen: { chartType: ['bar', 'line', 'scatter', 'bump', 'heatmap'] }
  }
}); 