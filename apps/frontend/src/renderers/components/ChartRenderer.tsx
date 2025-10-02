import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ComponentInstance } from '@/types/components';
import { CSSProperties } from 'react';
import { 
  getComponentProps, 
  RendererProps, 
  registerRenderer 
} from '../index';
import { BaseChartRenderer } from '@/charts';
import { ChartProps } from '@/types/ChartTypes';
import { useEditModeTransitionStore } from '@/stores/editModeTransitionStore';
import { useTheme } from '@/context/ThemeContext';
import { generateColorPalette } from '@/utils/colorUtils';

// Use global window object to ensure chart component cache persists across rerenders
// This prevents charts from being recreated when switching to edit mode
if (typeof window !== 'undefined' && !(window as any).__chartComponentCache) {
  (window as any).__chartComponentCache = new Map();
}

// Helper to get the chart component cache
const getChartComponentCache = () => {
  // console.log('[ChartRenderer] getChartComponentCache - window defined:', typeof window !== 'undefined');
  if (typeof window !== 'undefined') {
    // console.log('[ChartRenderer] Using window.__chartComponentCache:', (window as any).__chartComponentCache ? 'exists' : 'undefined');
    return (window as any).__chartComponentCache;
  }
  // Fallback for SSR
  // console.log('[ChartRenderer] Creating new Map for SSR fallback');
  return new Map();
};

// Define the specific props for ChartRenderer
interface ChartRendererProps extends RendererProps {
  baseStyles?: React.CSSProperties & {
    isEditing?: boolean;
    isThumbnail?: boolean; // Add isThumbnail based on usage
  };
}

/**
 * Main Chart renderer component
 */
export const ChartRenderer: React.FC<ChartRendererProps> = React.memo(({ 
  component, 
  containerRef,
  isSelected,
  isEditing,
  onUpdate,
  isThumbnail = false
}) => {
  // Get transition state from store
  const { isInTransition, suppressChartRenders } = useEditModeTransitionStore();
  
  // Determine if we should prevent animations based on store state
  const shouldDisableAnimation = isInTransition || suppressChartRenders ||
    (typeof window !== 'undefined' && ((window as any).__isDraggingCharts || (window as any).__isResizingCharts));

  // Use component ID and editing state to determine cache strategy
  const cachedInfo = useMemo(() => {
    const cache = getChartComponentCache();
    let cached = cache.get(component.id);
    
    if (!cached) {
      // Create new cached info
      cached = {
        originalId: component.id,
        stableId: `chart-${component.id}-${Date.now()}`,
        lastProps: component.props,
        lastEditingState: isEditing
      };
      cache.set(component.id, cached);
    }
    
    return cached;
  }, [component.id]);
  
  // Create safe props with minimal processing
  const safeProps = useMemo(() => {
    if (!component.props) {
      return {
        _stableComponentId: cachedInfo.stableId,
        _preserveRef: true
      };
    }
    
    const hasNonChartKeys = Object.keys(component.props).some(key => 
      !['data', 'colors', 'chartType', 'title', 'showLegend', 'animate', 
        'width', 'height', 'margin', 'axisBottom', 'axisLeft', 'enableGridX', 
        'enableGridY', 'enablePoints', 'pointSize', 'lineWidth', 'curve',
        'areaBaselineValue', 'enableArea', 'areaOpacity', 'areaBlendMode',
        'background', 'backgroundColor', 'textColor', 'gridColor', 'theme', 'groupMode',
        'layout', 'innerRadius', 'padAngle', 'cornerRadius', 'activeOuterRadiusOffset',
        'borderWidth', 'borderColor', 'enableArcLinkLabels', 'arcLinkLabelsSkipAngle',
        'arcLinkLabelsTextColor', 'arcLinkLabelsThickness', 'arcLinkLabelsColor',
        'enableArcLabels', 'arcLabelsSkipAngle', 'arcLabelsTextColor',
        'legends', 'enableLabel', 'label', 'labelSkipWidth', 'labelSkipHeight',
        'labelTextColor', 'categoryField', 'valueField', 'xAxisLabel', 'yAxisLabel',
        'showPoints', 'pointColor', 'pointBorderWidth', 'pointBorderColor',
        'enableSlices', 'debugMesh', 'layers', 'fill', 'valueFormat',
        'legendLabel', 'id', 'position', 'props', 'lockAspectRatio',
        'allowResize', 'zIndex', 'maxHeight', 'opacity', 'enableAxisTicks',
        'startYAtZero', 'smoothCurve', 'horizontalBars', 'tickSpacing',
        'tickSpacingY', 'tickRotation', 'gaugeLabel', 'minValue', 'maxValue',
        'enableGrid', 'showAxisLegends', 'fontFamily'].includes(key)
    );
    
    if (hasNonChartKeys) {
      const { data, colors, chartType, title, showLegend, animate,
        width, height, margin, axisBottom, axisLeft, enableGridX, 
        enableGridY, enablePoints, pointSize, lineWidth, curve,
        areaBaselineValue, enableArea, areaOpacity, areaBlendMode,
        background, backgroundColor, textColor, gridColor, theme, groupMode,
        layout, innerRadius, padAngle, cornerRadius, activeOuterRadiusOffset,
        borderWidth, borderColor, enableArcLinkLabels, arcLinkLabelsSkipAngle,
        arcLinkLabelsTextColor, arcLinkLabelsThickness, arcLinkLabelsColor,
        enableArcLabels, arcLabelsSkipAngle, arcLabelsTextColor,
        legends, enableLabel, label, labelSkipWidth, labelSkipHeight,
        labelTextColor, categoryField, valueField, xAxisLabel, yAxisLabel,
        showPoints, pointColor, pointBorderWidth, pointBorderColor,
        enableSlices, debugMesh, layers, fill, valueFormat,
        legendLabel, id, position, lockAspectRatio,
        allowResize, zIndex, maxHeight, opacity, enableAxisTicks,
        startYAtZero, smoothCurve, horizontalBars, tickSpacing,
        tickSpacingY, tickRotation, gaugeLabel, minValue, maxValue,
        enableGrid, showAxisLegends, fontFamily, ...filteredProps } = component.props as any;
      
      return {
        data, colors, chartType, title, showLegend, animate,
        width, height, margin, axisBottom, axisLeft, enableGridX, 
        enableGridY, enablePoints, pointSize, lineWidth, curve,
        areaBaselineValue, enableArea, areaOpacity, areaBlendMode,
        background, backgroundColor, textColor, gridColor, theme, groupMode,
        layout, innerRadius, padAngle, cornerRadius, activeOuterRadiusOffset,
        borderWidth, borderColor, enableArcLinkLabels, arcLinkLabelsSkipAngle,
        arcLinkLabelsTextColor, arcLinkLabelsThickness, arcLinkLabelsColor,
        enableArcLabels, arcLabelsSkipAngle, arcLabelsTextColor,
        legends, enableLabel, label, labelSkipWidth, labelSkipHeight,
        labelTextColor, categoryField, valueField, xAxisLabel, yAxisLabel,
        showPoints, pointColor, pointBorderWidth, pointBorderColor,
        enableSlices, debugMesh, layers, fill, valueFormat,
        legendLabel, id, position, lockAspectRatio,
        allowResize, zIndex, maxHeight, opacity, enableAxisTicks,
        startYAtZero, smoothCurve, horizontalBars, tickSpacing,
        tickSpacingY, tickRotation, gaugeLabel, minValue, maxValue,
        enableGrid, showAxisLegends, fontFamily,
        _stableComponentId: cachedInfo.stableId,
        _preserveRef: true
      };
    }
    
    // Normal rendering - use props as is, with minimal flags
    return {
      ...component.props,  // No deep cloning - use props directly
      _stableComponentId: cachedInfo.stableId,
      _preserveRef: true
    };
  }, [component.id, component.props, cachedInfo.stableId]);

  // Derive a theme-based default palette when not explicitly provided
  const { currentTheme } = useTheme();
  const themeAccent = currentTheme?.accent1 || '#4287f5';
  const themeDefaultPalette = useMemo(() => {
    try {
      const data = (component.props && Array.isArray(component.props.data)) ? component.props.data : [];
      const inferredCount = data && data.length > 0
        ? (Array.isArray((data as any)[0]?.data) ? (data as any).length : (data as any).length)
        : 8;
      return generateColorPalette(themeAccent, Math.max(3, Math.min(24, inferredCount)));
    } catch {
      return generateColorPalette(themeAccent, 8);
    }
  }, [component.props, themeAccent]);
  
  // Create stable component with the simplified props - keeping only one instance
  const stableComponent = useMemo(() => {
    // Apply thumbnail settings directly in the props
    const compiledProps: any = {
      ...safeProps,
      // For thumbnails, pass through the isThumbnail flag explicitly
      isThumbnail,
      // For thumbnails, add additional suppression flags
      ...(isThumbnail ? {
        _disableAnimation: true,
        _suppressAllRenders: false
      } : {}),
      // Always add bump chart specific flags if this is a bump chart
      ...((safeProps as any).chartType === 'bump' ? {
        enableLines: true,
        layers: ['grid', 'axes', 'lines', 'points', 'mesh'],
        lineWidth: (safeProps as any).lineWidth || 3,
        _isBumpChart: true
      } : {}),
      // Disable animation if we're dragging, resizing, or in transition
      ...(shouldDisableAnimation ? {
        animate: false,
        _forceDisableAnimation: true
      } : {})
    };

    // If no explicit colors and data doesn't provide colors, use theme-based palette
    try {
      const hasExplicitColors = Array.isArray((safeProps as any).colors) && (safeProps as any).colors.length > 0;
      const dataArr = (safeProps as any).data || (component.props ? component.props.data : []);
      let hasColorsInData = false;
      if (Array.isArray(dataArr) && dataArr.length > 0) {
        if (Array.isArray((dataArr as any)[0]?.data)) {
          // Series-based
          hasColorsInData = (dataArr as any).some((s: any) => !!s?.color);
        } else {
          // Item-based
          hasColorsInData = (dataArr as any).some((d: any) => !!d?.color);
        }
      }
      if (!hasExplicitColors && !hasColorsInData) {
        compiledProps.colors = themeDefaultPalette;
      }
    } catch {}
    
    return {
      ...component,
      props: compiledProps
    };
  }, [component, safeProps, isThumbnail, shouldDisableAnimation, themeDefaultPalette]);
  
  // Add explicit flags to prevent re-renders on edit mode
  // This is run on every render to ensure the flags are set
  useEffect(() => {
    // Set window flags to prevent chart re-renders
    if (typeof window !== 'undefined') {
      if ((window as any).__isInEditModeTransition) {
        // If we're in an edit mode transition, ensure this chart is preserved
        if (component.props) {
          component.props._suppressEditModeRender = true;
        }
      }
      
      // Important flag to ensure we can detect if this is a thumbnail
      // when deciding whether to animate
      (window as any).__hasChartThumbnails = true;
      
      // Set edit mode flag if we're in edit mode
      if (isEditing) {
        (window as any).__isEditMode = true;
        (window as any).__chartAnimationsEnabled = true;
      }
    }
    
    // Also ensure the thumbnail flag is properly set
    if (isThumbnail && component.props) {
      component.props._suppressEditModeRender = true;
    }
  }, [isThumbnail, component.id, component.props, isEditing]);
  
  // Listen for position updates and store them in the global override
  useEffect(() => {
    const handlePositionUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.componentId === component.id && detail?.finalPosition) {
        if (typeof window !== 'undefined') {
          if (!(window as any).__chartPositionOverride) {
            (window as any).__chartPositionOverride = {};
          }
          // console.log(`[ChartRenderer] Storing position override for ${component.id}:`, detail.finalPosition);
          (window as any).__chartPositionOverride[component.id] = detail.finalPosition;
        }
      }
    };
    
    const handleDeletedCharts = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail) return;
      
      // If another component was deleted, make sure we're not affected
      const { componentId, componentType } = detail;
      
      if (componentType === 'Chart' && componentId !== component.id) {
        // Force this chart to render itself to prevent disappearing
        // console.log(`[ChartRenderer] Another chart was deleted (${componentId}), ensuring ${component.id} stays visible`);
        
        // Dispatch a custom event to ensure this chart remains visible
        const event = new CustomEvent('chartPropertyChanged', {
          bubbles: true,
          detail: { 
            chartId: component.id,
            propertyName: 'visibilityCheck',
            immediate: true,
            timestamp: Date.now()
          }
        });
        document.dispatchEvent(event);
      }
    };
    
    // Ensure this component is in the persistent list
    if (typeof window !== 'undefined') {
      if (!(window as any).__persistentChartList) {
        (window as any).__persistentChartList = new Set();
      }
      (window as any).__persistentChartList.add(component.id);
    }
    
    document.addEventListener('component:dragend', handlePositionUpdate);
    document.addEventListener('component:deleted', handleDeletedCharts);
    
    return () => {
      document.removeEventListener('component:dragend', handlePositionUpdate);
      document.removeEventListener('component:deleted', handleDeletedCharts);
    };
  }, [component.id]);
  
  // Use the BaseChartRenderer with the stable component reference
  return (
    <BaseChartRenderer
      component={stableComponent}
      baseStyles={{}}
      containerRef={containerRef}
      onUpdate={onUpdate}
      isEditing={isEditing}
    />
  );
});

/**
 * Legacy function for backward compatibility with existing code
 */
export const renderChart = (
  component: ComponentInstance,
  baseStyles: React.CSSProperties = {},
  containerRef: React.RefObject<HTMLDivElement>
) => {
  return (
    <ChartRenderer
      component={component}
      baseStyles={baseStyles as ChartRendererProps['baseStyles']}
      containerRef={containerRef}
    />
  );
};

// Register this renderer
registerRenderer("Chart", (props: RendererProps) => {
  return <ChartRenderer {...props} />;
});