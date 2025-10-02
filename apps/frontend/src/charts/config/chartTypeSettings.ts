/**
 * Chart Type Settings Configuration
 * Defines which settings are available for each chart type in Highcharts
 */

export interface ChartSettingSection {
  id: string;
  label: string;
  icon: any;
}

export interface ChartSettingProperty {
  id: string;
  label: string;
  type: 'toggle' | 'slider' | 'input' | 'select' | 'color';
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: any;
  options?: { value: string; label: string }[];
}

export interface ChartTypeSettings {
  sections: {
    [sectionId: string]: boolean;
  };
  properties: {
    [propertyId: string]: boolean | ChartSettingProperty;
  };
  dataFormat: 'simple' | 'series' | 'special';
}

// Chart categories for organized display
export const CHART_CATEGORIES = {
  basic: {
    label: 'Basic Charts',
    charts: ['bar', 'column', 'pie', 'line', 'area', 'spline', 'areaspline', 'scatter']
  },
  advanced: {
    label: 'Advanced Charts',
    charts: ['bubble', 'radar', 'waterfall', 'gauge', 'boxplot', 'errorbar']
  },
  specialized: {
    label: 'Specialized Charts',
    charts: ['funnel', 'pyramid', 'treemap', 'sunburst', 'heatmap']
  },
  flow: {
    label: 'Flow Charts',
    charts: ['sankey', 'dependencywheel', 'networkgraph']
  },
  other: {
    label: 'Other Charts',
    charts: ['packedbubble', 'streamgraph', 'wordcloud']
  }
};

// Chart type labels
export const CHART_TYPE_LABELS: Record<string, string> = {
  bar: 'Bar Chart',
  column: 'Column Chart',
  pie: 'Pie Chart',
  line: 'Line Chart',
  area: 'Area Chart',
  spline: 'Spline Chart',
  areaspline: 'Area Spline',
  scatter: 'Scatter Plot',
  bubble: 'Bubble Chart',
  radar: 'Radar Chart',
  waterfall: 'Waterfall Chart',
  gauge: 'Gauge Chart',
  boxplot: 'Box Plot',
  errorbar: 'Error Bar',
  funnel: 'Funnel Chart',
  pyramid: 'Pyramid Chart',
  treemap: 'Treemap',
  sunburst: 'Sunburst',
  heatmap: 'Heatmap',
  sankey: 'Sankey Diagram',
  dependencywheel: 'Dependency Wheel',
  networkgraph: 'Network Graph',
  packedbubble: 'Packed Bubble',
  streamgraph: 'Streamgraph',
  wordcloud: 'Word Cloud'
};

// Settings configuration for each chart type
export const CHART_TYPE_SETTINGS: Record<string, ChartTypeSettings> = {
  // Basic Charts
  bar: {
    sections: {
      colors: true,
      borderSettings: true,
      axisSettings: true,
      animation: true,
      typography: true
    },
    properties: {
      backgroundColor: true,
      fontFamily: {
        id: 'fontFamily',
        label: 'Font Family',
        type: 'select',
        options: [
          { value: 'default', label: 'System Default' },
          // Local custom fonts
          { value: '"HK Grotesk Wide", sans-serif', label: 'HK Grotesk Wide' },
          // Popular Google Fonts
          { value: '"Inter", sans-serif', label: 'Inter' },
          { value: '"Poppins", sans-serif', label: 'Poppins' },
          { value: '"Roboto", sans-serif', label: 'Roboto' },
          { value: '"Montserrat", sans-serif', label: 'Montserrat' },
          { value: '"Open Sans", sans-serif', label: 'Open Sans' },
          { value: '"Lato", sans-serif', label: 'Lato' },
          { value: '"Raleway", sans-serif', label: 'Raleway' },
          { value: '"Outfit", sans-serif', label: 'Outfit' },
          { value: '"DM Sans", sans-serif', label: 'DM Sans' },
          // Serif fonts
          { value: '"Playfair Display", serif', label: 'Playfair Display' },
          { value: '"Merriweather", serif', label: 'Merriweather' },
          { value: '"Lora", serif', label: 'Lora' },
          { value: '"Georgia", serif', label: 'Georgia' },
          // Display fonts
          { value: '"Bebas Neue", sans-serif', label: 'Bebas Neue' },
          { value: '"Righteous", sans-serif', label: 'Righteous' },
          // Modern Fontshare fonts
          { value: '"Satoshi", sans-serif', label: 'Satoshi' },
          { value: '"Cabinet Grotesk", sans-serif', label: 'Cabinet Grotesk' },
          { value: '"General Sans", sans-serif', label: 'General Sans' },
          // Monospace
          { value: '"JetBrains Mono", monospace', label: 'JetBrains Mono' },
          { value: '"Fira Code", monospace', label: 'Fira Code' },
          { value: '"Roboto Mono", monospace', label: 'Roboto Mono' }
        ],
        defaultValue: 'default'
      },
      enableLabel: true,
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true,
      showLegend: true,
      animate: true,
      borderRadius: true,
      borderWidth: true,
      borderColor: true,
      tickSpacing: true,
      tickSpacingY: true,
      tickRotation: true,
      axisBottom: true,
      axisLeft: true,
      horizontalBars: {
        id: 'horizontalBars',
        label: 'Horizontal bars',
        type: 'toggle',
        defaultValue: true
      }
    },
    dataFormat: 'simple'
  },
  
  column: {
    sections: {
      colors: true,
      borderSettings: true,
      axisSettings: true,
      animation: true,
      typography: true
    },
    properties: {
      backgroundColor: true,
      fontFamily: true,
      enableLabel: true,
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true,
      showLegend: true,
      animate: true,
      borderRadius: true,
      borderWidth: true,
      borderColor: true,
      tickSpacing: true,
      tickSpacingY: true,
      tickRotation: true,
      axisBottom: true,
      axisLeft: true
    },
    dataFormat: 'simple'
  },
  
  pie: {
    sections: {
      colors: true,
      borderSettings: true,
      pieSettings: true,
      animation: true,
      typography: true
    },
    properties: {
      backgroundColor: true,
      fontFamily: true,
      enableLabel: true,
      showLegend: true,
      animate: true,
      innerRadius: {
        id: 'innerRadius',
        label: 'Inner Radius',
        type: 'slider',
        min: 0,
        max: 0.9,
        step: 0.05,
        defaultValue: 0.5
      },
      padAngle: {
        id: 'padAngle',
        label: 'Pad Angle',
        type: 'slider',
        min: 0,
        max: 3,
        step: 0.1,
        defaultValue: 0.7
      },
      cornerRadius: true,
      borderWidth: true,
      borderColor: true
    },
    dataFormat: 'simple'
  },
  
  line: {
    sections: {
      colors: true,
      pointSettings: true,
      axisSettings: true,
      animation: true,
      typography: true
    },
    properties: {
      backgroundColor: true,
      fontFamily: true,
      enableLabel: true,
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true,
      showLegend: true,
      animate: true,
      smoothCurve: true,
      startYAtZero: true,
      pointSize: true,
      pointBorderWidth: true,
      lineWidth: true,
      tickSpacing: true,
      tickSpacingY: true,
      tickRotation: true,
      axisBottom: true,
      axisLeft: true
    },
    dataFormat: 'series'
  },
  
  area: {
    sections: {
      colors: true,
      pointSettings: true,
      axisSettings: true,
      animation: true
    },
    properties: {
      backgroundColor: true,
      enableLabel: true,
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true,
      showLegend: true,
      animate: true,
      startYAtZero: true,
      lineWidth: true,
      tickSpacing: true,
      tickSpacingY: true,
      tickRotation: true,
      axisBottom: true,
      axisLeft: true
    },
    dataFormat: 'series'
  },
  
  spline: {
    sections: {
      colors: true,
      pointSettings: true,
      axisSettings: true,
      animation: true
    },
    properties: {
      backgroundColor: true,
      enableLabel: true,
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true,
      showLegend: true,
      animate: true,
      startYAtZero: true,
      pointSize: true,
      pointBorderWidth: true,
      lineWidth: true,
      tickSpacing: true,
      tickSpacingY: true,
      tickRotation: true,
      axisBottom: true,
      axisLeft: true
    },
    dataFormat: 'series'
  },
  
  areaspline: {
    sections: {
      colors: true,
      pointSettings: true,
      axisSettings: true,
      animation: true
    },
    properties: {
      backgroundColor: true,
      enableLabel: true,
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true,
      showLegend: true,
      animate: true,
      startYAtZero: true,
      lineWidth: true,
      tickSpacing: true,
      tickSpacingY: true,
      tickRotation: true,
      axisBottom: true,
      axisLeft: true
    },
    dataFormat: 'series'
  },
  
  scatter: {
    sections: {
      colors: true,
      pointSettings: true,
      axisSettings: true,
      animation: true
    },
    properties: {
      backgroundColor: true,
      enableLabel: true,
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true,
      showLegend: true,
      animate: true,
      startYAtZero: true,
      pointSize: true,
      pointBorderWidth: true,
      tickSpacing: true,
      tickSpacingY: true,
      tickRotation: true,
      axisBottom: true,
      axisLeft: true
    },
    dataFormat: 'series'
  },
  
  // Advanced Charts
  bubble: {
    sections: {
      colors: true,
      pointSettings: true,
      axisSettings: true,
      animation: true
    },
    properties: {
      backgroundColor: true,
      enableLabel: true,
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true,
      showLegend: true,
      animate: true,
      pointSize: true,
      tickSpacing: true,
      tickSpacingY: true,
      axisBottom: true,
      axisLeft: true
    },
    dataFormat: 'series'
  },
  
  radar: {
    sections: {
      colors: true,
      animation: true
    },
    properties: {
      backgroundColor: true,
      enableLabel: true,
      showLegend: true,
      animate: true
    },
    dataFormat: 'series'
  },
  
  waterfall: {
    sections: {
      colors: true,
      borderSettings: true,
      axisSettings: true,
      animation: true
    },
    properties: {
      backgroundColor: true,
      enableLabel: true,
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true,
      showLegend: true,
      animate: true,
      borderRadius: true,
      tickSpacing: true,
      tickSpacingY: true,
      axisBottom: true,
      axisLeft: true
    },
    dataFormat: 'series'
  },
  
  gauge: {
    sections: {
      colors: true,
      animation: true,
      gaugeSettings: true
    },
    properties: {
      backgroundColor: true,
      animate: true,
      gaugeLabel: {
        id: 'gaugeLabel',
        label: 'Gauge Label',
        type: 'input',
        defaultValue: 'Speed'
      },
      minValue: {
        id: 'minValue',
        label: 'Min Value',
        type: 'slider',
        min: 0,
        max: 100,
        step: 10,
        defaultValue: 0
      },
      maxValue: {
        id: 'maxValue',
        label: 'Max Value',
        type: 'slider',
        min: 100,
        max: 500,
        step: 50,
        defaultValue: 100
      }
    },
    dataFormat: 'simple'
  },
  
  boxplot: {
    sections: {
      colors: true,
      axisSettings: true,
      animation: true
    },
    properties: {
      backgroundColor: true,
      enableLabel: true,
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true,
      showLegend: true,
      animate: true,
      tickSpacing: true,
      tickSpacingY: true,
      axisBottom: true,
      axisLeft: true
    },
    dataFormat: 'series'
  },
  
  errorbar: {
    sections: {
      colors: true,
      axisSettings: true,
      animation: true
    },
    properties: {
      backgroundColor: true,
      enableLabel: true,
      enableAxisTicks: true,
      enableGrid: true,
      showAxisLegends: true,
      showLegend: true,
      animate: true,
      tickSpacing: true,
      tickSpacingY: true,
      axisBottom: true,
      axisLeft: true
    },
    dataFormat: 'series'
  },
  
  // Specialized Charts
  funnel: {
    sections: {
      colors: true,
      animation: true
    },
    properties: {
      backgroundColor: true,
      enableLabel: true,
      showLegend: true,
      animate: true
    },
    dataFormat: 'simple'
  },
  
  pyramid: {
    sections: {
      colors: true,
      animation: true
    },
    properties: {
      backgroundColor: true,
      enableLabel: true,
      showLegend: true,
      animate: true
    },
    dataFormat: 'simple'
  },
  
  treemap: {
    sections: {
      colors: true,
      animation: true
    },
    properties: {
      backgroundColor: true,
      enableLabel: true,
      animate: true
    },
    dataFormat: 'special'
  },
  
  sunburst: {
    sections: {
      colors: true,
      animation: true
    },
    properties: {
      backgroundColor: true,
      enableLabel: true,
      animate: true
    },
    dataFormat: 'special'
  },
  
  heatmap: {
    sections: {
      colors: true,
      borderSettings: true,
      axisSettings: true,
      animation: true
    },
    properties: {
      backgroundColor: true,
      enableLabel: true,
      enableAxisTicks: true,
      showAxisLegends: true,
      animate: true,
      borderRadius: true,
      tickSpacing: true,
      tickSpacingY: true,
      axisBottom: true,
      axisLeft: true
    },
    dataFormat: 'series'
  },
  
  // Flow Charts
  sankey: {
    sections: {
      colors: true,
      animation: true
    },
    properties: {
      backgroundColor: true,
      animate: true
    },
    dataFormat: 'special'
  },
  
  dependencywheel: {
    sections: {
      colors: true,
      animation: true
    },
    properties: {
      backgroundColor: true,
      animate: true
    },
    dataFormat: 'special'
  },
  
  networkgraph: {
    sections: {
      colors: true,
      animation: true
    },
    properties: {
      backgroundColor: true,
      animate: true
    },
    dataFormat: 'special'
  },
  
  // Other Charts
  packedbubble: {
    sections: {
      colors: true,
      animation: true
    },
    properties: {
      backgroundColor: true,
      enableLabel: true,
      animate: true
    },
    dataFormat: 'special'
  },
  
  streamgraph: {
    sections: {
      colors: true,
      animation: true
    },
    properties: {
      backgroundColor: true,
      animate: true
    },
    dataFormat: 'special'
  },
  
  wordcloud: {
    sections: {
      colors: true,
      animation: true
    },
    properties: {
      backgroundColor: true,
      animate: true
    },
    dataFormat: 'special'
  }
}; 