import { useMemo } from 'react';
import { ChartType } from '@/types/ChartTypes';
import { isPropertySupportedForChartType } from '@/registry';

/**
 * Custom hook to manage chart settings for the editor
 * 
 * @param chartType The current chart type
 * @param props The current chart properties
 * @returns Visibility status for different settings groups and properties
 */
export function useChartSettings(
  chartType: ChartType,
  props: Record<string, any>
) {
  // Determine which settings sections should be visible
  const visibleSections = useMemo(() => {
    return {
      // Border settings (not shown for line, scatter charts)
      borderSettings: !['line', 'scatter'].includes(chartType),
      
      // Point settings (for charts with points)
      pointSettings: ['line', 'scatter'].includes(chartType),
      
      // Pie chart specific settings
      pieSettings: chartType === 'pie',
      
      // Axis settings
      axisSettings: ['bar', 'line', 'scatter', 'heatmap'].includes(chartType)
    };
  }, [chartType]);

  // Determine which properties should be visible
  const visibleProperties = useMemo(() => {
    const anAxisIsVisible = ['bar', 'line', 'scatter', 'heatmap'].includes(chartType); // From visibleSections.axisSettings logic

    const baseProperties = {
      // Basic toggles
      enableLabel: isPropertySupportedForChartType('enableLabel', chartType),
      enableArcLinkLabels: isPropertySupportedForChartType('enableArcLinkLabels', chartType),
      enableAxisTicks: isPropertySupportedForChartType('enableAxisTicks', chartType),
      enableGrid: isPropertySupportedForChartType('enableGrid', chartType),
      showAxisLegends: isPropertySupportedForChartType('showAxisLegends', chartType),
      startYAtZero: isPropertySupportedForChartType('startYAtZero', chartType),
      animate: true, // Always show animation toggle
      showLegend: true, // Always show legend toggle
      
      // Specific properties
      verticalAnimation: chartType === 'bar',
      smoothCurve: chartType === 'line',
      
      // Border controls
      borderRadius: ['bar', 'heatmap'].includes(chartType),
      borderWidth: !['line', 'scatter'].includes(chartType),
      borderColor: !['line', 'scatter'].includes(chartType),
      
      // Point controls
      pointSize: ['line', 'scatter'].includes(chartType),
      pointBorderWidth: ['line', 'scatter'].includes(chartType),
      lineWidth: ['line'].includes(chartType),
      
      // Pie controls
      innerRadius: chartType === 'pie',
      padAngle: chartType === 'pie',
      cornerRadius: chartType === 'pie',
      
      // Axis controls
      axisBottom: anAxisIsVisible,
      axisLeft: anAxisIsVisible,   // Keep this based on chart type supporting axes
      tickSpacing: isPropertySupportedForChartType('tickSpacing', chartType) && props.enableAxisTicks !== false,
      // Y-axis tick spacing control
      tickSpacingY: isPropertySupportedForChartType('tickSpacing', chartType) && props.enableAxisTicks !== false,
      // tickRotation is relevant if an axis is visible and ticks are enabled.
      // The actual tickRotation property is on component.props.axisBottom or component.props.axisLeft
      // The ChartSettingsEditor currently uses component.props.axisBottom?.tickRotation for its value
      // and applies the change to both axisBottom and axisLeft.
      // So, a single 'tickRotation' visibility flag is sufficient if we keep that UI behavior.
      tickRotation: anAxisIsVisible && props.enableAxisTicks !== false
    };
    
    return baseProperties;
  }, [chartType, props.enableAxisTicks]); // props.axisBottom removed as direct dependency for tickRotation flag

  // Get appropriate label based on chart type
  const getLabel = (propName: string): string => {
    switch (propName) {
      case 'enableLabel':
        if (chartType === 'pie') return 'Data Marker';
        return 'Labels';
        
      case 'borderRadius':
        return chartType === 'bar' ? 'Bar Radius' : 'Cell Radius';
        
      default:
        return propName;
    }
  };

  return {
    visibleSections,
    visibleProperties,
    getLabel
  };
}