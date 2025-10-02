import { ChartData, ChartDataPoint, ChartSeries, ChartType, SeriesDataPoint } from './ChartTypes';
import { CHART_DEFAULT_COLORS } from '@/config/chartColors';

/**
 * Transforms any chart data into the correct format for the specific chart type
 * @param data Raw chart data (could be in any supported format)
 * @param chartType The target chart type
 * @returns Properly formatted data for the specific chart type
 */
export function transformChartData(data: any, chartType: ChartType): ChartData {
  // Coerce to array to make downstream logic safe
  const arrayData: any[] = Array.isArray(data)
    ? data
    : (data !== null && data !== undefined ? [data] : []);

  if (arrayData.length === 0) {
    return getDefaultData(chartType);
  }

  // Determine the input data format
  const isSeriesData =
    arrayData[0] &&
    typeof arrayData[0] === 'object' &&
    'data' in arrayData[0] &&
    Array.isArray((arrayData[0] as any).data);
  
  // Transform based on target chart type
  switch (chartType) {
    case 'bar':
    case 'column':
    case 'pie':
    case 'funnel':
    case 'pyramid':
    case 'gauge':
      return transformToDataPoints(arrayData, isSeriesData);
    
    case 'line':
    case 'spline':
    case 'area':
    case 'areaspline':
    case 'scatter':
    case 'bubble':
    case 'radar':
    case 'waterfall':
    case 'boxplot':
    case 'errorbar':
    case 'heatmap':
    case 'streamgraph':
      return transformToSeries(arrayData, isSeriesData);
    
    // Special cases that need custom handling
    case 'wordcloud':
      // Transform wordcloud data to ensure it has 'weight' property
      if (isSeriesData && (arrayData[0] as any)?.data) {
        return [{
          id: (arrayData[0] as any).id || 'Words',
          data: (arrayData[0] as any).data.map((item: any) => ({
            name: item.name || item.id || 'Unknown',
            weight: item.weight || item.value || 0
          }))
        }] as any;
      } else if (Array.isArray(arrayData)) {
        // Direct data format
        return [{
          id: 'Words',
          data: arrayData.map((item: any) => ({
            name: item.name || item.id || 'Unknown',
            weight: item.weight || item.value || 0
          }))
        }] as any;
      }
      return getDefaultData(chartType);
      
    case 'treemap':
    case 'sunburst':
    case 'sankey':
    case 'dependencywheel':
    case 'networkgraph':
      // Network graph data can come in different formats
      if (arrayData.length > 0) {
        // If data is already in the expected format with from/to/value, wrap it
        if ((arrayData[0] as any)?.from && (arrayData[0] as any)?.to) {
          return [{
            id: 'Network',
            data: arrayData
          }];
        }
        // If data is in series format with a data array, return as-is
        if ((arrayData[0] as any)?.data && Array.isArray((arrayData[0] as any).data)) {
          return arrayData as any;
        }
        // Otherwise wrap the data
        return [{
          id: 'Network',
          data: arrayData
        }];
      }
      return getDefaultData(chartType);
      
    case 'packedbubble':
      // For now, just return the data as-is or default data
      // These need special data structures
      return arrayData.length > 0 ? (arrayData as any) : getDefaultData(chartType);
      
    default:
      return arrayData as any;
  }
}

/**
 * Transform any data format to ChartDataPoint[] format
 * @param data Raw data
 * @param isSeriesFormat Whether the data is already in series format
 * @returns Formatted data points
 */
function transformToDataPoints(data: any[], isSeriesFormat: boolean): ChartDataPoint[] {
  const safeData: any[] = Array.isArray(data)
    ? data
    : (data !== null && data !== undefined ? [data] : []);

  if (!isSeriesFormat) {
    // Data is already in data point format, just normalize it
    return safeData.map(item => {
      const { id, name, x, label, value, y, color, ...rest } = item || {};
      const numericValue = typeof value === 'number' ? value : 
             typeof y === 'number' ? y :
             (typeof value === 'string' ? parseFloat(value) || 0 : 
              typeof y === 'string' ? parseFloat(y) || 0 : 0);
      return {
        ...rest, // Preserve additional metadata like sourceIndex
        id: id || name || x || 'Unknown',
        name: name || id || x || 'Unknown',
        label: label || name || id || x || 'Unknown',
        value: numericValue,
        color: color
      } as any;
    });
  }
  
  // Data is in series format, convert first series to data points
  const firstSeries = safeData[0] as any;
  if (!firstSeries?.data) return [];
  
  return (firstSeries.data as any[]).map((point: any) => {
    const { x, y, color, ...rest } = point || {};
    const numericY = typeof y === 'number' ? y : (typeof y === 'string' ? parseFloat(y) || 0 : 0);
    return {
      ...rest, // Preserve metadata like sourceIndex
      name: x || 'Unknown',
      value: numericY,
      color: color || firstSeries.color
    } as any;
  });
}

/**
 * Transform any data format to ChartSeries[] format
 * @param data Raw data
 * @param isSeriesFormat Whether the data is already in series format
 * @returns Formatted data series
 */
function transformToSeries(data: any[], isSeriesFormat: boolean): ChartSeries[] {
  // Ensure data exists and is valid
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }
  
  if (isSeriesFormat) {
    // Data is already in series format, normalize it thoroughly
    return data.map(series => {
      // Validate series object
      if (!series || typeof series !== 'object') {
        return { id: 'Invalid Series', color: '#cccccc', data: [] };
      }
      
      // Ensure series has an ID
      const seriesId = series.id || series.name || 'Series';
      
      // Ensure data array is valid
      const seriesData = Array.isArray(series.data) 
        ? series.data.filter(p => p && typeof p === 'object')
            .map((point: any) => normalizeDataPoint(point))
        : [];
      
      return {
        id: seriesId,
        color: series.color || null,
        data: seriesData
      };
    });
  }
  
  // Data is in data point format, convert to a single series
  // Filter out any invalid data items first
  const validData = Array.isArray(data) ? data.filter(item => item && typeof item === 'object') : [];
  
  if (validData.length === 0) return [{ id: 'Series', data: [] }];
  
  return [{
    id: 'Series',
    data: validData.map(item => {
      // Extract x value (check for x, name, or id)
      const xValue = item.x || item.name || item.id || 'Unknown';
      
      // Ensure y value is a number and can never be NaN
      let yValue = 0;
      // First check for y property (from backend)
      if (typeof item.y === 'number' && !isNaN(item.y)) {
        yValue = item.y;
      } else if (typeof item.y === 'string') {
        const parsed = parseFloat(item.y);
        yValue = isNaN(parsed) ? 0 : parsed;
      }
      // Then fall back to value property (legacy format)
      else if (typeof item.value === 'number' && !isNaN(item.value)) {
        yValue = item.value;
      } else if (typeof item.value === 'string') {
        const parsed = parseFloat(item.value);
        yValue = isNaN(parsed) ? 0 : parsed;
      }
      const { x, name, id, value, color, ...rest } = item;
      
      return { x: xValue, y: yValue, ...rest } as any;
    })
  }];
}

/**
 * Normalize a series data point to ensure correct format
 * @param point Raw data point
 * @returns Normalized data point
 */
function normalizeDataPoint(point: any): SeriesDataPoint {
  if (!point || typeof point !== 'object') {
    return { x: 'Unknown', y: 0 } as any;
  }
  
  // Ensure y value is a number
  const yValue = typeof point.y === 'string' 
    ? parseFloat(point.y) 
    : (typeof point.y === 'number' ? point.y : 0);
  const { x, y, ...rest } = point;
  
  // Strictly ensure we never return NaN, null, or undefined
  return {
    x: x !== undefined ? x : 'Unknown',
    y: (yValue === null || yValue === undefined || isNaN(yValue)) ? 0 : yValue,
    ...rest // Preserve extra metadata such as sourceIndex
  } as any;
}

/**
 * Get default data for a chart type when no data is provided
 * @param chartType The chart type
 * @returns Default data for the chart type
 */
export function getDefaultData(chartType: ChartType): ChartData {
  switch (chartType) {
    case 'bar':
    case 'column':
      return [
        { name: 'Category 1', value: 40, color: CHART_DEFAULT_COLORS[0] },
        { name: 'Category 2', value: 30, color: CHART_DEFAULT_COLORS[1] },
        { name: 'Category 3', value: 50, color: CHART_DEFAULT_COLORS[2] },
        { name: 'Category 4', value: 20, color: CHART_DEFAULT_COLORS[3] },
        { name: 'Category 5', value: 35, color: CHART_DEFAULT_COLORS[4] }
      ];
      
    case 'pie':
      return [
        { id: 'Segment 1', value: 40, color: CHART_DEFAULT_COLORS[0], label: 'Segment A' },
        { id: 'Segment 2', value: 30, color: CHART_DEFAULT_COLORS[1], label: 'Segment B' },
        { id: 'Segment 3', value: 50, color: CHART_DEFAULT_COLORS[2], label: 'Segment C' },
        { id: 'Segment 4', value: 20, color: CHART_DEFAULT_COLORS[3], label: 'Segment D' }
      ];
      
    case 'line':
    case 'spline':
      return [
        {
          id: 'Series A',
          color: CHART_DEFAULT_COLORS[0],
          data: [
            { x: 'Jan', y: 20 },
            { x: 'Feb', y: 35 },
            { x: 'Mar', y: 25 },
            { x: 'Apr', y: 40 },
            { x: 'May', y: 30 },
            { x: 'Jun', y: 45 },
            { x: 'Jul', y: 55 },
            { x: 'Aug', y: 50 },
            { x: 'Sep', y: 60 }
          ]
        },
        {
          id: 'Series B',
          color: CHART_DEFAULT_COLORS[1],
          data: [
            { x: 'Jan', y: 10 },
            { x: 'Feb', y: 15 },
            { x: 'Mar', y: 35 },
            { x: 'Apr', y: 20 },
            { x: 'May', y: 25 },
            { x: 'Jun', y: 30 },
            { x: 'Jul', y: 40 },
            { x: 'Aug', y: 35 },
            { x: 'Sep', y: 45 }
          ]
        },
        {
          id: 'Series C',
          color: CHART_DEFAULT_COLORS[2],
          data: [
            { x: 'Jan', y: 15 },
            { x: 'Feb', y: 20 },
            { x: 'Mar', y: 30 },
            { x: 'Apr', y: 25 },
            { x: 'May', y: 35 },
            { x: 'Jun', y: 40 },
            { x: 'Jul', y: 30 },
            { x: 'Aug', y: 25 },
            { x: 'Sep', y: 35 }
          ]
        }
      ];

    case 'area':
    case 'areaspline':
      return [
        {
          id: 'Revenue',
          color: CHART_DEFAULT_COLORS[0],
          data: [
            { x: 'Q1 2023', y: 120 },
            { x: 'Q2 2023', y: 135 },
            { x: 'Q3 2023', y: 125 },
            { x: 'Q4 2023', y: 140 },
            { x: 'Q1 2024', y: 150 },
            { x: 'Q2 2024', y: 165 }
          ]
        },
        {
          id: 'Costs',
          color: CHART_DEFAULT_COLORS[1],
          data: [
            { x: 'Q1 2023', y: 80 },
            { x: 'Q2 2023', y: 85 },
            { x: 'Q3 2023', y: 75 },
            { x: 'Q4 2023', y: 90 },
            { x: 'Q1 2024', y: 95 },
            { x: 'Q2 2024', y: 100 }
          ]
        }
      ];

    case 'scatter':
      return [
        {
          id: 'Group A',
          color: CHART_DEFAULT_COLORS[0],
          data: [
            { x: 10, y: 20 },
            { x: 15, y: 35 },
            { x: 20, y: 25 },
            { x: 25, y: 40 },
            { x: 30, y: 30 },
            { x: 35, y: 45 },
            { x: 40, y: 35 },
            { x: 45, y: 50 },
            { x: 50, y: 40 },
            { x: 55, y: 55 }
          ]
        },
        {
          id: 'Group B',
          color: CHART_DEFAULT_COLORS[1],
          data: [
            { x: 12, y: 10 },
            { x: 18, y: 15 },
            { x: 22, y: 35 },
            { x: 28, y: 20 },
            { x: 32, y: 25 },
            { x: 38, y: 30 },
            { x: 42, y: 15 },
            { x: 48, y: 25 },
            { x: 52, y: 20 },
            { x: 58, y: 10 }
          ]
        },
        {
          id: 'Group C',
          color: CHART_DEFAULT_COLORS[2],
          data: [
            { x: 8, y: 30 },
            { x: 16, y: 25 },
            { x: 24, y: 40 },
            { x: 32, y: 35 },
            { x: 40, y: 45 },
            { x: 48, y: 40 },
            { x: 56, y: 50 },
            { x: 64, y: 45 },
            { x: 72, y: 55 },
            { x: 80, y: 50 }
          ]
        }
      ];

    case 'bubble':
      return [
        {
          id: 'Product A',
          color: CHART_DEFAULT_COLORS[0],
          data: [
            { x: 95, y: 95, z: 13.8, name: 'BE', country: 'Belgium' },
            { x: 86.5, y: 102.9, z: 14.7, name: 'DE', country: 'Germany' },
            { x: 80.8, y: 91.5, z: 15.8, name: 'FI', country: 'Finland' },
            { x: 80.4, y: 102.5, z: 12, name: 'NL', country: 'Netherlands' },
            { x: 80.3, y: 86.1, z: 11.8, name: 'SE', country: 'Sweden' }
          ]
        },
        {
          id: 'Product B',
          color: CHART_DEFAULT_COLORS[1],
          data: [
            { x: 78.4, y: 70.1, z: 16.6, name: 'ES', country: 'Spain' },
            { x: 74.2, y: 68.5, z: 14.5, name: 'FR', country: 'France' },
            { x: 73.5, y: 83.1, z: 10, name: 'NO', country: 'Norway' },
            { x: 71, y: 93.2, z: 24.7, name: 'UK', country: 'United Kingdom' },
            { x: 69.2, y: 57.6, z: 10.4, name: 'IT', country: 'Italy' }
          ]
        }
      ];

    case 'radar':
      return [
        {
          id: 'Allocated Budget',
          color: CHART_DEFAULT_COLORS[0],
          data: [
            { x: 'Sales', y: 43000 },
            { x: 'Marketing', y: 19000 },
            { x: 'Development', y: 60000 },
            { x: 'Customer Support', y: 35000 },
            { x: 'IT', y: 17000 },
            { x: 'Administration', y: 10000 }
          ]
        },
        {
          id: 'Actual Spending',
          color: CHART_DEFAULT_COLORS[1],
          data: [
            { x: 'Sales', y: 50000 },
            { x: 'Marketing', y: 39000 },
            { x: 'Development', y: 42000 },
            { x: 'Customer Support', y: 31000 },
            { x: 'IT', y: 26000 },
            { x: 'Administration', y: 14000 }
          ]
        }
      ];

    case 'waterfall':
      return [{
        id: 'Waterfall',
        color: CHART_DEFAULT_COLORS[0],
        data: [
          { x: 'Start', y: 120 },
          { x: 'Product Revenue', y: 569 },
          { x: 'Service Revenue', y: 231 },
          { x: 'Fixed Costs', y: -342 },
          { x: 'Variable Costs', y: -233 },
          { x: 'Balance', y: 345 }
        ]
      }];

    case 'gauge':
      return [
        { name: 'Speed', value: 80, color: CHART_DEFAULT_COLORS[0] }
      ];

    case 'boxplot':
      return [{
        id: 'Observations',
        color: CHART_DEFAULT_COLORS[0],
        data: [
          { x: 'Q1 2023', y: 848 },
          { x: 'Q2 2023', y: 939 },
          { x: 'Q3 2023', y: 817 },
          { x: 'Q4 2023', y: 806 },
          { x: 'Q1 2024', y: 864 }
        ]
      }] as any;

    case 'errorbar':
      return [{
        id: 'Rainfall',
        color: CHART_DEFAULT_COLORS[0],
        data: [
          { x: 'Jan', y: 49.9 },
          { x: 'Feb', y: 71.5 },
          { x: 'Mar', y: 106.4 },
          { x: 'Apr', y: 129.2 },
          { x: 'May', y: 144.0 },
          { x: 'Jun', y: 176.0 }
        ]
      }];

    case 'funnel':
      return [
        { name: 'Website visits', value: 15654, color: CHART_DEFAULT_COLORS[0] },
        { name: 'Downloads', value: 4064, color: CHART_DEFAULT_COLORS[1] },
        { name: 'Requested price list', value: 1987, color: CHART_DEFAULT_COLORS[2] },
        { name: 'Invoice sent', value: 976, color: CHART_DEFAULT_COLORS[3] },
        { name: 'Finalized', value: 846, color: CHART_DEFAULT_COLORS[4] }
      ];

    case 'pyramid':
      return [
        { name: 'Basic', value: 50420, color: CHART_DEFAULT_COLORS[0] },
        { name: 'Standard', value: 26252, color: CHART_DEFAULT_COLORS[1] },
        { name: 'Premium', value: 11009, color: CHART_DEFAULT_COLORS[2] },
        { name: 'Enterprise', value: 3875, color: CHART_DEFAULT_COLORS[3] }
      ];

    case 'heatmap':
      return [{
        id: 'Sales per employee',
        data: [
          { x: 'Alexander', y: 0 },
          { x: 'Alexander', y: 1 },
          { x: 'Alexander', y: 2 },
          { x: 'Alexander', y: 3 },
          { x: 'Alexander', y: 4 },
          { x: 'Marie', y: 0 },
          { x: 'Marie', y: 1 },
          { x: 'Marie', y: 2 },
          { x: 'Marie', y: 3 },
          { x: 'Marie', y: 4 },
          { x: 'Maximilian', y: 0 },
          { x: 'Maximilian', y: 1 },
          { x: 'Maximilian', y: 2 },
          { x: 'Maximilian', y: 3 },
          { x: 'Maximilian', y: 4 }
        ]
      }] as any;

    case 'treemap':
      return [{
        id: 'Products',
        data: [
          { name: 'A', value: 6, colorValue: 1 },
          { name: 'B', value: 6, colorValue: 2 },
          { name: 'C', value: 4, colorValue: 3 },
          { name: 'D', value: 3, colorValue: 4 },
          { name: 'E', value: 2, colorValue: 5 },
          { name: 'F', value: 2, colorValue: 6 },
          { name: 'G', value: 1, colorValue: 7 }
        ]
      }] as any;

    case 'sunburst':
      return [{
        id: 'Root',
        data: [
          { id: '0.0', parent: '', name: 'The World' },
          { id: '1.1', parent: '0.0', name: 'Asia', value: 4604 },
          { id: '1.2', parent: '0.0', name: 'Africa', value: 1345 },
          { id: '1.3', parent: '0.0', name: 'Europe', value: 747 },
          { id: '1.4', parent: '0.0', name: 'America', value: 1021 },
          { id: '2.1', parent: '1.1', name: 'China', value: 1411 },
          { id: '2.2', parent: '1.1', name: 'India', value: 1380 },
          { id: '2.3', parent: '1.2', name: 'Nigeria', value: 206 },
          { id: '2.4', parent: '1.3', name: 'Germany', value: 83 },
          { id: '2.5', parent: '1.4', name: 'USA', value: 331 }
        ]
      }] as any;

    case 'sankey':
      return [{
        id: 'Sankey',
        data: [
          { from: 'Brazil', to: 'Portugal', weight: 5 },
          { from: 'Brazil', to: 'France', weight: 1 },
          { from: 'Brazil', to: 'Spain', weight: 1 },
          { from: 'Brazil', to: 'England', weight: 1 },
          { from: 'Canada', to: 'Portugal', weight: 1 },
          { from: 'Canada', to: 'France', weight: 5 },
          { from: 'Canada', to: 'England', weight: 1 },
          { from: 'Mexico', to: 'Portugal', weight: 1 },
          { from: 'Mexico', to: 'France', weight: 1 },
          { from: 'Mexico', to: 'Spain', weight: 5 },
          { from: 'Mexico', to: 'England', weight: 1 },
          { from: 'USA', to: 'Portugal', weight: 1 },
          { from: 'USA', to: 'France', weight: 1 },
          { from: 'USA', to: 'Spain', weight: 1 },
          { from: 'USA', to: 'England', weight: 5 },
          { from: 'Portugal', to: 'Angola', weight: 2 },
          { from: 'Portugal', to: 'Senegal', weight: 1 },
          { from: 'Portugal', to: 'Morocco', weight: 1 },
          { from: 'Portugal', to: 'South Africa', weight: 3 },
          { from: 'France', to: 'Angola', weight: 1 },
          { from: 'France', to: 'Morocco', weight: 3 },
          { from: 'France', to: 'South Africa', weight: 1 },
          { from: 'Spain', to: 'Senegal', weight: 1 },
          { from: 'Spain', to: 'Morocco', weight: 3 },
          { from: 'Spain', to: 'South Africa', weight: 1 },
          { from: 'England', to: 'Angola', weight: 1 },
          { from: 'England', to: 'Senegal', weight: 1 },
          { from: 'England', to: 'Morocco', weight: 2 },
          { from: 'England', to: 'South Africa', weight: 7 }
        ]
      }] as any;

    case 'dependencywheel':
      return [{
        id: 'Network',
        data: [
          ['Brazil', 'Portugal', 5],
          ['Brazil', 'France', 1],
          ['Brazil', 'Spain', 1],
          ['Canada', 'Portugal', 1],
          ['Canada', 'France', 5],
          ['Canada', 'England', 1],
          ['Mexico', 'Portugal', 1],
          ['Mexico', 'France', 1],
          ['Mexico', 'Spain', 5],
          ['USA', 'England', 5],
          ['Portugal', 'Angola', 2],
          ['Portugal', 'Morocco', 1],
          ['France', 'Morocco', 3],
          ['Spain', 'Senegal', 1],
          ['England', 'Morocco', 2],
          ['England', 'South Africa', 7]
        ]
      }] as any;
      
    case 'networkgraph':
      return [{
        id: 'Network',
        data: [
          { from: 'Brazil', to: 'Portugal', weight: 5 },
          { from: 'Brazil', to: 'France', weight: 1 },
          { from: 'Brazil', to: 'Spain', weight: 1 },
          { from: 'Canada', to: 'Portugal', weight: 1 },
          { from: 'Canada', to: 'France', weight: 5 },
          { from: 'Canada', to: 'England', weight: 1 },
          { from: 'Mexico', to: 'Portugal', weight: 1 },
          { from: 'Mexico', to: 'France', weight: 1 },
          { from: 'Mexico', to: 'Spain', weight: 5 },
          { from: 'USA', to: 'England', weight: 5 },
          { from: 'Portugal', to: 'Angola', weight: 2 },
          { from: 'Portugal', to: 'Morocco', weight: 1 },
          { from: 'France', to: 'Morocco', weight: 3 },
          { from: 'Spain', to: 'Senegal', weight: 1 },
          { from: 'England', to: 'Morocco', weight: 2 },
          { from: 'England', to: 'South Africa', weight: 7 }
        ]
      }] as any;

    case 'packedbubble':
      return [
        {
          id: 'Europe',
          color: CHART_DEFAULT_COLORS[0],
          data: [
            { name: 'Germany', value: 767.1 },
            { name: 'Croatia', value: 20.7 },
            { name: 'Belgium', value: 97.2 },
            { name: 'Czech Republic', value: 111.7 },
            { name: 'Netherlands', value: 158.1 }
          ]
        },
        {
          id: 'Africa',
          color: CHART_DEFAULT_COLORS[1],
          data: [
            { name: 'Nigeria', value: 119.3 },
            { name: 'Egypt', value: 74.0 },
            { name: 'South Africa', value: 57.2 },
            { name: 'Morocco', value: 50.0 },
            { name: 'Kenya', value: 32.7 }
          ]
        }
      ] as any;

    case 'streamgraph':
      return [
        {
          id: 'Finland',
          color: CHART_DEFAULT_COLORS[0],
          data: [
            { x: 0, y: 502 },
            { x: 1, y: 635 },
            { x: 2, y: 809 },
            { x: 3, y: 947 },
            { x: 4, y: 1402 },
            { x: 5, y: 3634 },
            { x: 6, y: 5268 }
          ]
        },
        {
          id: 'Austria',
          color: CHART_DEFAULT_COLORS[1],
          data: [
            { x: 0, y: 106 },
            { x: 1, y: 107 },
            { x: 2, y: 111 },
            { x: 3, y: 133 },
            { x: 4, y: 221 },
            { x: 5, y: 767 },
            { x: 6, y: 1766 }
          ]
        },
        {
          id: 'UK',
          color: CHART_DEFAULT_COLORS[2],
          data: [
            { x: 0, y: 163 },
            { x: 1, y: 203 },
            { x: 2, y: 276 },
            { x: 3, y: 408 },
            { x: 4, y: 547 },
            { x: 5, y: 729 },
            { x: 6, y: 628 }
          ]
        }
      ] as any;

    case 'wordcloud':
      return [{
        id: 'Words',
        data: [
          { name: 'Lorem', weight: 105 },
          { name: 'Ipsum', weight: 90 },
          { name: 'Dolor', weight: 80 },
          { name: 'Sit', weight: 70 },
          { name: 'Amet', weight: 65 },
          { name: 'Consectetur', weight: 60 },
          { name: 'Adipiscing', weight: 55 },
          { name: 'Elit', weight: 50 },
          { name: 'Nam', weight: 45 },
          { name: 'Sapien', weight: 40 },
          { name: 'Nunc', weight: 35 },
          { name: 'Sagittis', weight: 30 },
          { name: 'Aliquam', weight: 25 },
          { name: 'Malesuada', weight: 20 },
          { name: 'Rhoncus', weight: 15 },
          { name: 'Vivamus', weight: 10 },
          { name: 'Donec', weight: 8 },
          { name: 'Fusce', weight: 6 },
          { name: 'Augue', weight: 4 },
          { name: 'Sem', weight: 2 },
          { name: 'Magna', weight: 1 }
        ]
      }] as any;

    default:
      return [];
  }
} 