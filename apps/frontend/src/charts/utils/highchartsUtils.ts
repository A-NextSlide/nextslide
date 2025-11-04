/**
 * Highcharts utility functions for data and theme conversion
 */
import { DEFAULT_CHART_COLORS } from '@/config/chartColors';
import Highcharts from 'highcharts';
import { ChartDataPoint, ChartSeries, ChartType } from '@/types/ChartTypes';
import { getChartTheme } from './ThemeUtils';
import { getFontFamilyWithFallback } from '@/utils/fontUtils';

/**
 * Convert our theme format to Highcharts theme options
 */
export function convertToHighchartsTheme(theme: 'light' | 'dark', backgroundColor?: string, fontFamily?: string): Partial<Highcharts.Options> {
  const themeConfig = getChartTheme(theme);
  
  // Default font family if not provided or if 'default' is selected
  const chartFontFamily = (!fontFamily || fontFamily === 'default') 
    ? '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    : getFontFamilyWithFallback(fontFamily);
  
  // Function to convert hex with alpha to rgba
  const convertHexToRgba = (hex: string): string => {
    if (!hex || hex === 'transparent') return 'transparent';
    
    // Handle rgba format with alpha 0 - convert to transparent
    if (hex.toLowerCase().startsWith('rgba(')) {
      const match = hex.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/i);
      if (match) {
        const a = parseFloat(match[4]);
        // If alpha is 0, return transparent
        if (a === 0) return 'transparent';
      }
      // Return as-is for non-zero alpha rgba
      return hex;
    }
    
    // Handle rgb format (no alpha) - return as-is
    if (hex.toLowerCase().startsWith('rgb(')) {
      return hex;
    }
    
    // Handle 8-digit hex (with alpha)
    if (hex.startsWith('#') && hex.length === 9) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const a = parseInt(hex.slice(7, 9), 16) / 255;
      
      // If alpha is 0, return transparent
      if (a === 0) return 'transparent';
      
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
    
    // Handle 6-digit hex (no alpha)
    if (hex.startsWith('#') && hex.length === 7) {
      return hex; // Return as-is, Highcharts handles regular hex
    }
    
    // Return as-is for other formats
    return hex;
  };
  
  // Ensure we use transparent if no backgroundColor is provided
  const bgColor = backgroundColor !== undefined ? convertHexToRgba(backgroundColor) : 'transparent';
  
  // Highcharts supports both null and 'transparent' for transparent backgrounds
  // Use 'transparent' explicitly to ensure no default grey background is applied
  const highchartsBgColor = bgColor === 'transparent' ? 'transparent' : bgColor;
  
  return {
    chart: {
      backgroundColor: highchartsBgColor,
      plotBackgroundColor: highchartsBgColor,
      plotBorderWidth: 0,
      plotShadow: false,
      style: {
        fontFamily: chartFontFamily
      }
    },
    title: {
      style: {
        color: themeConfig.textColor || (theme === 'dark' ? '#e0e0e0' : '#333333'),
        fontFamily: chartFontFamily
      }
    },
    subtitle: {
      style: {
        color: themeConfig.textColor || (theme === 'dark' ? '#e0e0e0' : '#666666'),
        fontFamily: chartFontFamily
      }
    },
    xAxis: {
      gridLineColor: themeConfig.grid?.line?.stroke || (theme === 'dark' ? '#333333' : '#e0e0e0'),
      labels: {
        style: {
          color: themeConfig.textColor || (theme === 'dark' ? '#e0e0e0' : '#666666'),
          fontFamily: chartFontFamily
        }
      },
      lineColor: themeConfig.axis?.domain?.line?.stroke || (theme === 'dark' ? '#999999' : '#cccccc'),
      tickColor: themeConfig.axis?.domain?.line?.stroke || (theme === 'dark' ? '#999999' : '#cccccc'),
      title: {
        style: {
          color: themeConfig.textColor || (theme === 'dark' ? '#e0e0e0' : '#666666'),
          fontFamily: chartFontFamily
        }
      }
    },
    yAxis: {
      gridLineColor: themeConfig.grid?.line?.stroke || (theme === 'dark' ? '#333333' : '#e0e0e0'),
      labels: {
        style: {
          color: themeConfig.textColor || (theme === 'dark' ? '#e0e0e0' : '#666666'),
          fontFamily: chartFontFamily
        }
      },
      lineColor: themeConfig.axis?.domain?.line?.stroke || (theme === 'dark' ? '#999999' : '#cccccc'),
      tickColor: themeConfig.axis?.domain?.line?.stroke || (theme === 'dark' ? '#999999' : '#cccccc'),
      title: {
        style: {
          color: themeConfig.textColor || (theme === 'dark' ? '#e0e0e0' : '#333333'),
          fontFamily: chartFontFamily
        }
      }
    },
    legend: {
      itemStyle: {
        color: themeConfig.textColor || (theme === 'dark' ? '#e0e0e0' : '#333333'),
        fontSize: '12px',
        fontWeight: 'normal',
        fontFamily: chartFontFamily
      },
      itemHoverStyle: {
        color: theme === 'dark' ? '#ffffff' : '#000000'
      },
      itemDistance: 20,
      symbolPadding: 5,
      padding: 8,
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderWidth: 0,
      align: 'center',
      verticalAlign: 'bottom',
      layout: 'horizontal',
      floating: false,
      x: 0,
      y: 0
    },
    tooltip: {
      backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.95)',
      style: {
        color: theme === 'dark' ? '#e0e0e0' : '#333333',
        fontFamily: chartFontFamily
      }
    },
    plotOptions: {
      series: {
        dataLabels: {
          color: themeConfig.textColor || (theme === 'dark' ? '#e0e0e0' : '#333333'),
          style: {
            fontFamily: chartFontFamily
          }
        }
      }
    },
    credits: {
      enabled: false
    }
  };
}

/**
 * Convert bar/pie chart data to Highcharts format (SINGLE-SERIES ONLY)
 * For multi-series bar/column charts, use convertSeriesData instead
 */
export function convertBarPieData(
  data: ChartDataPoint[], 
  chartType: ChartType,
  colors?: string[]
): Highcharts.SeriesOptionsType[] {
  const chartColors = colors?.length ? colors : DEFAULT_CHART_COLORS;
  
  // Handle column as bar chart
  const highchartsType = chartType === 'bar' ? 'column' : chartType;
  
  if (chartType === 'pie') {
    return [{
      type: 'pie',
      name: 'Values',
      data: data.map((point, index) => {
        const yVal = typeof point.value === 'number' ? point.value : parseFloat(String(point.value)) || 0;
        const base = {
          name: point.name || point.id || `Item ${index + 1}`,
          y: yVal,
          color: point.color || chartColors[index % chartColors.length]
        } as any;
        // Preserve metadata like sourceIndex for tooltip mapping
        if ((point as any)?.sourceIndex !== undefined) {
          base.sourceIndex = (point as any).sourceIndex;
        }
        return base;
      })
    }];
  }
  
  // Handle gauge chart
  if (chartType === 'gauge') {
    // Gauge charts expect a single value
    const value = data.length > 0 ? 
      (typeof data[0].value === 'number' ? data[0].value : parseFloat(String(data[0].value)) || 0) : 
      0;
    
    return [{
      type: 'gauge',
      name: 'Value',
      data: [value],
      dataLabels: {
        format: '{y}'
      }
    }];
  }
  
  // Bar/Column chart (SINGLE-SERIES)
  return [{
    type: 'column',
    name: 'Values',
    data: data.map((point, index) => {
      const yVal = typeof point.value === 'number' ? point.value : parseFloat(String(point.value)) || 0;
      const base = {
        name: point.name || point.id || `Item ${index + 1}`,
        y: yVal,
        color: point.color || chartColors[index % chartColors.length]
      } as any;
      if ((point as any)?.sourceIndex !== undefined) {
        base.sourceIndex = (point as any).sourceIndex;
      }
      return base;
    })
  }];
}

/**
 * Convert series data (line/scatter/area/spline/bar/column) to Highcharts format
 * 
 * According to Highcharts API (https://api.highcharts.com/highcharts/):
 * - For categorical x-axis: use { name: category, y: value } format
 * - For numerical x-axis: use { x: number, y: value } format
 * - For datetime x-axis: use [timestamp, value] or { x: timestamp, y: value }
 * 
 * Supports both single-series and multi-series charts for all chart types.
 */
export function convertSeriesData(
  data: ChartSeries[], 
  chartType: ChartType,
  colors?: string[]
): Highcharts.SeriesOptionsType[] {
  const chartColors = colors?.length ? colors : DEFAULT_CHART_COLORS;
  
  // Ensure data is valid and is an array
  if (!data || !Array.isArray(data)) {
    return [{
      type: chartType as any,
      name: 'Series 1',
      data: []
    }];
  }
  
  // Map chart types to Highcharts series types
  let seriesType: string;
  if (chartType === 'radar') {
    // For radar charts, use 'line' as the series type since Highcharts uses polar + line
    seriesType = 'line';
  } else if (chartType === 'bar') {
    // For horizontal bars, Highcharts uses 'bar' type
    seriesType = 'bar';
  } else if (chartType === 'column') {
    // For vertical bars, Highcharts uses 'column' type
    seriesType = 'column';
  } else {
    // For all other types (line, area, spline, etc.), use the type as-is
    seriesType = chartType;
  }
  
  return data.map((series, index) => {
    // Ensure series.data exists and is an array
    const seriesData = series?.data && Array.isArray(series.data) ? series.data : [];
    
    return {
      type: seriesType as any,
      name: series?.name || series?.id || `Series ${index + 1}`,
      color: series?.color || chartColors[index % chartColors.length],
      data: seriesData.map(point => {
        // Get the y value
        const yVal = typeof point?.y === 'number' ? point.y : 0;
        
        // Determine the data point format based on x type
        const p: any = {
          y: yVal
        };
        
        // Handle x-axis value
        if (point?.x !== undefined && point?.x !== null) {
          if (typeof point.x === 'string') {
            // Categorical data: use 'name' property for category labels
            p.name = point.x;
          } else if (typeof point.x === 'number') {
            // Numerical data: use 'x' property
            p.x = point.x;
          }
        }
        
        // Also check for 'name' property directly (for categorical data)
        if (!p.name && point?.name) {
          p.name = String(point.name);
        }
        
        // Preserve sourceIndex for tooltip mapping
        if ((point as any)?.sourceIndex !== undefined) {
          p.sourceIndex = (point as any).sourceIndex;
        }
        
        return p;
      })
    };
  });
}

/**
 * Convert heatmap data to Highcharts format
 */
export function convertHeatmapData(data: ChartSeries[]): Highcharts.SeriesOptionsType[] {
  const heatmapData: any[] = [];
  
  if (!data || !Array.isArray(data)) {
    return [{
      type: 'heatmap',
      name: 'Heatmap',
      data: []
    }];
  }
  
  data.forEach((series, yIndex) => {
    const seriesData = series?.data && Array.isArray(series.data) ? series.data : [];
    seriesData.forEach((point, xIndex) => {
      heatmapData.push({
        x: xIndex,
        y: yIndex,
        value: typeof point?.value === 'number' ? point.value : 
               typeof point?.y === 'number' ? point.y : 0,
        name: `${series?.id || 'Series'}: ${point?.x || xIndex}`
      });
    });
  });
  
  return [{
    type: 'heatmap',
    name: 'Heatmap',
    data: heatmapData,
    borderWidth: 1,
    dataLabels: {
      enabled: true
    }
  }];
}

/**
 * Convert bump chart data to Highcharts spline format
 */
export function convertBumpData(data: ChartSeries[], colors?: string[]): Highcharts.SeriesOptionsType[] {
  const chartColors = colors?.length ? colors : DEFAULT_CHART_COLORS;
  
  if (!data || !Array.isArray(data)) {
    return [{
      type: 'spline',
      name: 'Series 1',
      data: []
    }];
  }
  
  return data.map((series, index) => {
    const seriesData = series?.data && Array.isArray(series.data) ? series.data : [];
    
    return {
      type: 'spline',
      name: series?.name || series?.id || `Series ${index + 1}`,
      color: series?.color || chartColors[index % chartColors.length],
      data: seriesData.map(point => ({
        x: typeof point?.x === 'number' ? point.x : 0,
        y: typeof point?.y === 'number' ? point.y : 0
      })),
      marker: {
        enabled: true,
        radius: 6
      }
    };
  });
}

/**
 * Get common Highcharts options based on our chart props
 */
export function getCommonHighchartsOptions(props: any): Partial<Highcharts.Options> {
  // Only show axis titles if showAxisLegends is true
  const showAxisTitles = props.showAxisLegends !== false;
  
  // Check if we have axis titles that need space
  const hasBottomTitle = showAxisTitles && props.axisBottom?.legend;
  const hasLeftTitle = showAxisTitles && props.axisLeft?.legend;
  
  // Calculate margins - ensure enough space for axis titles
  let chartMargins: any = {};
  if (props.margin) {
    chartMargins = {
      marginTop: props.margin.top,
      marginRight: props.margin.right,
      marginBottom: props.margin.bottom,
      marginLeft: props.margin.left
    };
    
    // Add extra space for axis titles if they're shown
    if (hasBottomTitle && chartMargins.marginBottom < 50) {
      chartMargins.marginBottom = 50;
    }
    if (hasLeftTitle && chartMargins.marginLeft < 65) {
      chartMargins.marginLeft = 65;
    }
  }
  
  return {
    chart: {
      animation: props.animate !== false,
      ...chartMargins
    },
    title: {
      text: undefined // We don't use titles in our charts
    },
    xAxis: {
      title: {
        text: showAxisTitles ? (props.axisBottom?.legend || '') : '',
        margin: 10, // Closer to axis
        // Don't override style - let it inherit from theme
      },
      labels: {
        rotation: props.axisBottom?.tickRotation || 0
      }
    },
    yAxis: {
      title: {
        text: showAxisTitles ? (props.axisLeft?.legend || '') : '',
        margin: 10, // Closer to axis
        // Don't override style - let it inherit from theme
      },
      labels: {
        rotation: props.axisLeft?.tickRotation || 0
      },
      min: props.startYAtZero ? 0 : undefined
    },
    legend: {
      enabled: props.showLegend !== false,
      align: 'center',
      verticalAlign: 'bottom',
      layout: 'horizontal',
      x: 0,
      y: 0,
      floating: false,
      itemStyle: {
        fontSize: '12px',
        fontWeight: 'normal'
      }
    },
    plotOptions: {
      series: {
        animation: props.animate !== false,
        dataLabels: {
          enabled: props.enableLabel === true
        }
      }
    },
    tooltip: {
      enabled: true,
      shared: false
    },
    credits: {
      enabled: false
    },
    exporting: {
      enabled: false
    }
  };
} 