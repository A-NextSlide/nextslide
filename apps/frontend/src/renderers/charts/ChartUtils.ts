// Chart theme configurations
export const chartThemes = {
  light: {
    background: 'transparent',
    textColor: '#333333',
    fontSize: 11,
    axis: {
      domain: {
        line: {
          stroke: '#777777',
          strokeWidth: 1
        }
      },
      ticks: {
        line: {
          stroke: '#777777',
          strokeWidth: 1
        },
        text: {
          fill: '#333333',
          fontSize: 10
        }
      },
      legend: {
        text: {
          fill: '#333333',
          fontSize: 12,
          fontWeight: 'bold'
        }
      }
    },
    grid: {
      line: {
        stroke: '#dddddd',
        strokeWidth: 1
      }
    },
    legends: {
      text: {
        fill: '#333333',
        fontSize: 11
      }
    },
    tooltip: {
      container: {
        background: '#ffffff',
        color: '#333333',
        fontSize: 12,
        borderRadius: 4,
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)'
      }
    }
  },
  dark: {
    background: 'transparent',
    textColor: '#eeeeee',
    fontSize: 11,
    axis: {
      domain: {
        line: {
          stroke: '#888888',
          strokeWidth: 1
        }
      },
      ticks: {
        line: {
          stroke: '#888888',
          strokeWidth: 1
        },
        text: {
          fill: '#eeeeee',
          fontSize: 10
        }
      },
      legend: {
        text: {
          fill: '#eeeeee',
          fontSize: 12,
          fontWeight: 'bold'
        }
      }
    },
    grid: {
      line: {
        stroke: '#444444',
        strokeWidth: 1
      }
    },
    legends: {
      text: {
        fill: '#eeeeee',
        fontSize: 11
      }
    },
    tooltip: {
      container: {
        background: '#333333',
        color: '#eeeeee',
        fontSize: 12,
        borderRadius: 4,
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)'
      }
    }
  }
};

// Default legend configuration
export const defaultLegend = [
  {
    anchor: 'top-right',
    direction: 'column',
    justify: false,
    translateX: -5,
    translateY: 5,
    itemsSpacing: 2,
    itemWidth: 100,
    itemHeight: 16,
    itemTextColor: '#666',
    itemDirection: 'left-to-right',
    itemOpacity: 1,
    symbolSize: 10,
    symbolShape: 'circle'
  }
];

// Helper to extract colors from data items
export const getColorsFromData = (data: any[], chartType: string): string[] | undefined => {
  if (!data || data.length === 0) return undefined;
  
  // For bar and pie charts, colors are directly on the items
  if (['bar', 'pie'].includes(chartType)) {
    return data.map(item => item.color || '#cccccc');
  }
  
  // For line, scatter, bump, and heatmap charts, colors are on the series
  if (['line', 'scatter', 'bump', 'heatmap'].includes(chartType)) {
    return data.map(series => series.color || '#cccccc');
  }
  
  return undefined;
};

// Get color function that will use the color from each data item (for Bar charts)
export const getBarColor = (bar: any, colors?: string[]) => {
  // If the data item has a color property, use it
  if (bar.data && bar.data.color) {
    return bar.data.color;
  }
  
  // Otherwise fall back to the colors array
  if (Array.isArray(colors)) {
    return colors[bar.index % colors.length];
  }
  
  // Final fallback
  return '#61cdbb';
};

// Get color function for pie charts
export const getPieColor = (pie: any, colors?: string[]) => {
  // If the data has a color property, use it
  if (pie.data && pie.data.color) {
    return pie.data.color;
  }
  
  // Otherwise fall back to the colors array
  if (Array.isArray(colors)) {
    return colors[pie.index % colors.length];
  }
  
  // Final fallback
  return '#61cdbb';
};

// Create adjusted margins based on legend visibility
// @deprecated Use Highcharts default legend handling instead
export const getAdjustedMargin = (margin?: { top: number; right: number; bottom: number; left: number }, showLegend = false) => {
  // Just return the margin as-is - let Highcharts handle legend positioning
  return { 
    top: margin?.top || 40,
    right: margin?.right || 40,
    bottom: margin?.bottom || 60,
    left: margin?.left || 40
  };
};

// Create modified legend with top-right positioning from data items
export const createLegendFromData = (data: any[], colors?: string[], legendBase = defaultLegend[0]) => {
  return {
    ...legendBase,
    anchor: 'top-right',
    direction: 'column',
    translateX: -5,
    translateY: 5,
    itemsSpacing: 2,
    itemHeight: 16,
    symbolSize: 10,
    data: data.map((item, index) => ({
      id: item.name || item.id,
      label: item.name || item.id,
      color: item.color || (Array.isArray(colors) ? colors[index % colors.length] : '#61cdbb')
    }))
  };
};