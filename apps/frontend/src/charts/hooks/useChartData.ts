import { useMemo } from 'react';
import { ChartData, ChartType } from '@/types/ChartTypes';
import { calculateTickSpacing, getAdjustedMargin, getColorsFromData } from '../utils/ChartUtils';
import { transformChartData } from '@/types/DataTransformers';

/**
 * Custom hook to process and prepare chart data for rendering
 * 
 * This hook handles:
 * - Data transformation and normalization
 * - Calculating tick spacings
 * - Preparing colors
 * - Computing appropriate margins
 * 
 * @param rawData The raw chart data
 * @param chartType The chart type being rendered
 * @param props Additional chart properties
 * @returns Processed chart data and computed properties
 */
export function useChartData(
  rawData: any[],
  chartType: ChartType,
  props: {
    colors?: string[];
    margin?: { top: number; right: number; bottom: number; left: number };
    showLegend?: boolean;
    enableAxisTicks?: boolean;
    tickSpacing?: number;
    startYAtZero?: boolean;
  }
) {
  // Transform the raw data into the correct format for the chart type
  const processedData = useMemo(() => {
    return transformChartData(rawData, chartType);
  }, [rawData, chartType]);
  
  // Extract colors from data items if available
  const colorsFromData = useMemo(() => {
    return getColorsFromData(processedData, chartType);
  }, [processedData, chartType]);
  
  // Compute color array to use
  // Prioritize: 1. Colors from data, 2. Colors prop, 3. Default colors
  const colorsProp = useMemo(() => {
    if (colorsFromData?.length) {
      return colorsFromData;
    }
    if (props.colors?.length) {
      return props.colors;
    }
    return undefined;
  }, [colorsFromData, props.colors]);
  
  // Adjust margins based on legend visibility
  const adjustedMargin = useMemo(() => {
    return getAdjustedMargin(props.margin, props.showLegend || false);
  }, [props.margin, props.showLegend]);
  
  // Calculate data point count for tick spacing
  const dataPointCount = useMemo(() => {
    if (!Array.isArray(processedData) || processedData.length === 0) {
      return 0;
    }
    
    // For array of data points (bar, pie)
    if ('value' in processedData[0]) {
      return processedData.length;
    }
    
    // For array of series (line, scatter, bump, heatmap)
    // Get count of unique x values across all series
    const allXValues = new Set();
    for (const series of processedData) {
      if (Array.isArray(series.data)) {
        for (const point of series.data) {
          if (point.x !== undefined) {
            allXValues.add(point.x);
          }
        }
      }
    }
    return allXValues.size;
  }, [processedData]);
  
  // Auto-calculate tick spacing based on data size
  const autoTickSpacing = useMemo(() => {
    return calculateTickSpacing(dataPointCount);
  }, [dataPointCount]);
  
  // Final tick spacing either from props or auto-calculated
  const effectiveTickSpacing = useMemo(() => {
    if (props.tickSpacing && props.tickSpacing > 1) {
      return props.tickSpacing;
    }
    return autoTickSpacing;
  }, [props.tickSpacing, autoTickSpacing]);
  
  // Detect if data has negative values (for Y axis scaling)
  const hasNegativeValues = useMemo(() => {
    if (!Array.isArray(processedData) || processedData.length === 0) {
      return false;
    }
    
    // For array of data points (bar, pie)
    if ('value' in processedData[0]) {
      return processedData.some(item => 
        typeof item.value === 'number' && item.value < 0
      );
    }
    
    // For array of series (line, scatter, bump, heatmap)
    for (const series of processedData) {
      if (Array.isArray(series.data)) {
        for (const point of series.data) {
          if (typeof point.y === 'number' && point.y < 0) {
            return true;
          }
        }
      }
    }
    
    return false;
  }, [processedData]);
  
  // Override startYAtZero if data has negative values
  const effectiveStartYAtZero = useMemo(() => {
    if (hasNegativeValues) {
      return false;
    }
    return props.startYAtZero;
  }, [hasNegativeValues, props.startYAtZero]);
  
  // Pre-calculate tick values for axes
  const tickValues = useMemo(() => {
    if (!props.enableAxisTicks) {
      return { xTickValues: [], yTickCount: 0 };
    }
    
    // X axis tick calculation
    let xTickValues: (string | number)[] = [];
    
    // For bar and pie charts
    if (['bar', 'pie'].includes(chartType) && 'value' in processedData[0]) {
      xTickValues = processedData
        .filter((_, i) => i % Math.max(1, effectiveTickSpacing) === 0)
        .map(d => d.name || d.id || 'Unknown');
    } 
    // For line, scatter, bump, and heatmap charts
    else if (['line', 'scatter', 'bump', 'heatmap'].includes(chartType)) {
      // Get all unique x values from all series
      const allXValues = Array.from(new Set(
        processedData.flatMap(series => 
          Array.isArray(series.data) ? series.data.map(point => point.x) : []
        )
      )).sort();
      
      // Filter based on spacing
      xTickValues = allXValues.filter((_, i) => i % Math.max(1, effectiveTickSpacing) === 0);
    }
    
    // Y axis tick count - fewer ticks for larger datasets
    const yTickCount = Math.max(2, 11 - effectiveTickSpacing);
    
    return { xTickValues, yTickCount };
  }, [chartType, processedData, effectiveTickSpacing, props.enableAxisTicks]);
  
  return {
    processedData,
    colorsProp,
    adjustedMargin,
    effectiveTickSpacing,
    effectiveStartYAtZero,
    tickValues,
    hasNegativeValues,
    dataPointCount
  };
}