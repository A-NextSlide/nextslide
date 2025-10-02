import React, { FC, useMemo, useRef, useState, useEffect } from 'react';
import { ChartProps, ChartRendererProps, ChartType } from '@/types/ChartTypes';
import { getChartTheme, motionPresets } from '../utils/ThemeUtils';
import { getComponentProps } from '@/renderers/utils';
import ssrDebugLogger from '@ssr/ssrDebugLogger';
import '@/styles/chart.css';
import UnifiedHighchartsRenderer from './UnifiedHighchartsRenderer';
import { getDefaultData } from '@/types/DataTransformers';
import { CustomComponentOptimizationService } from '@/services/CustomComponentOptimizationService';
import { useChartAnimation } from '@/charts/hooks/useChartAnimation';

const isBrowser = typeof window !== 'undefined';
// initialize global map if needed (cast window to any to avoid TS errors)
if (isBrowser && !(window as any).__chartInstanceKeyMap) {
  (window as any).__chartInstanceKeyMap = new Map<string, string>();
}
// retrieve the instance key map
const getChartInstanceKeyMap = (): Map<string, string> =>
  isBrowser
    ? (window as any).__chartInstanceKeyMap
    : new Map<string, string>();

const BaseChartRenderer: FC<ChartRendererProps> = ({
  component,
  baseStyles,
  containerRef,
  onUpdate,
  isEditing,
}) => {
  const { id, type, props } = component;
  
  // Track mount time for initial animation
  const mountTimeRef = useRef(Date.now());
  const hasAnimatedOnce = useRef(false);
  
  // Reset when component remounts (different slide)
  useEffect(() => {
    hasAnimatedOnce.current = false;
    mountTimeRef.current = Date.now();
  }, [id]);

  // Reset animation state when this chart's slide becomes active via navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleSlideChange = (event: Event) => {
      const slideId = (event as CustomEvent)?.detail?.slideId;
      if (!slideId) return;

      const containerEl = containerRef?.current?.closest?.('.slide-container[data-slide-id]') as HTMLElement | null;
      if (!containerEl) return;

      const chartSlideId = containerEl.getAttribute('data-slide-id');
      if (chartSlideId === slideId) {
        hasAnimatedOnce.current = false;
        mountTimeRef.current = Date.now();
      }
    };

    document.addEventListener('slidechange', handleSlideChange);
    return () => {
      document.removeEventListener('slidechange', handleSlideChange);
    };
  }, [containerRef]);
  
  // Add debugging for resize state
  useEffect(() => {
    const checkResizeState = () => {
      if (typeof window !== 'undefined') {
        const isResizing = (window as any).__isResizingCharts;
        const resizedChart = (window as any).__currentResizedChart;
        if (isResizing && resizedChart === id) {
          
        }
      }
    };
    
    // Check immediately and on interval
    checkResizeState();
    const interval = setInterval(checkResizeState, 500);
    
    return () => clearInterval(interval);
  }, [id]);
  
  // Determine the chart type.
  const chartType: ChartType =
    (props.chartType as ChartType) || (type as ChartType) || 'bar';
  ssrDebugLogger.log('BaseChartRenderer', 'Rendering', { id, chartType, isSSR: !isBrowser });

  // Import the default data from DataTransformers.ts for consistency
  const defaultData = useMemo(() => {
    return getDefaultData(chartType as ChartType);
  }, [chartType]);

  // Extract colors from data if available
  const colorsFromData = useMemo(() => {
    const actualData = props.data || defaultData;
    if (!Array.isArray(actualData) || actualData.length === 0) return [];
    
    // Handle different data formats
    if (['bar', 'pie'].includes(chartType)) {
      // Direct data points - extract colors from the data
      return actualData.filter(d => d && d.color).map(d => d.color);
    } else if (['line', 'scatter', 'bump', 'heatmap'].includes(chartType)) {
      // Series data
      return actualData.filter(series => series && series.color).map(series => series.color);
    }
    return [];
  }, [props.data, defaultData, chartType]);
    
  // Determine if legend should be shown
  const showLegend = props.showLegend ?? false;
  
  // Use a constant as a unique key for this component instance
  const chartKeyRef = useRef<string>(`chart-${id}-${Date.now()}`);
  
  // derive chart props, only passing known ChartProps keys
  const chartProps = getComponentProps<ChartProps>(component, {
    chartType,
    data: props.data || defaultData,
    theme: props.theme ?? 'light',
    backgroundColor: props.backgroundColor !== undefined ? props.backgroundColor : 'transparent',
    // Priority: 1. props.colors (from palette/custom), 2. colorsFromData, 3. empty array (let Highcharts use defaults)
    colors: props.colors?.length ? props.colors : (colorsFromData.length ? colorsFromData : []),
    margin: props.margin || { top: 20, right: 10, bottom: 30, left: 40 },
    animate: true,
    motionConfig: 'default',
    // Set good defaults for chart properties based on type
    showLegend,
    enableLabel: props.enableLabel ?? true, // Keep labels enabled by default
    enableArcLinkLabels: props.enableArcLinkLabels ?? (chartType === 'pie'),
    lineWidth: props.lineWidth ?? (chartType === 'line' ? 3 : 2), // Line charts default to 3px
    pointSize: props.pointSize ?? (chartType === 'scatter' ? 12 : (chartType === 'line' || chartType === 'spline' ? 6 : 10)), // Line charts default to 6px
    smoothCurve: props.smoothCurve ?? (chartType === 'line' ? true : false), // Ensure line charts default to smooth curves
  });
  
  const themeObj = getChartTheme(chartProps.theme || 'light');
  
  // Get optimized styles if any
  const optimizedStyles = CustomComponentOptimizationService.getOptimizedStyles(component);
  
  const containerStyle: React.CSSProperties = useMemo(
    () => ({
      width: '100%', 
      height: '100%', 
      position: 'relative', 
      overflow: 'visible',
      boxSizing: 'border-box',
      backgroundColor: 'transparent', // Ensure container is transparent
      // Ensure charts scale with their container
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      ...baseStyles
    }),
    [baseStyles]
  );

  // handle thumbnail mode or explicit suppress flag (untyped)
  const isThumb = chartProps.isThumbnail === true;
  const suppressAll = (props as any)._suppressAllRenders === true;
  if (isThumb || suppressAll) {
    // prefer any cached image (untyped)
    const cachedImage =
      (props as any)._cachedChartImage ||
      (isBrowser && (window as any).__chartThumbnailCache?.[component.id]);
    if (cachedImage) {
      return (
        <div ref={containerRef} style={{
          ...containerStyle,
          backgroundImage: `url(${cachedImage})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }} />
      );
    }
    return (
      <div ref={containerRef} style={{
        ...containerStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: themeObj.background || '#f5f5f5',
        border: '1px solid #ddd',
        borderRadius: 4,
      }}>
        <span style={{ fontSize: 10, color: themeObj.textColor || '#666' }}>{chartType}</span>
      </div>
    );
  }

  const chartInstanceKeyMap = useMemo(() => getChartInstanceKeyMap(), []);

  // Animate-once-per-slide: listen for slidechange and trigger a one-time animation
  const { shouldAnimate: animateOnceOnSlide } = useChartAnimation(id, containerRef as React.RefObject<HTMLDivElement>);
  
  // Incorporate _animationTrigger into the key to force remounts for previews
  const animationTrigger = props._animationTrigger;
  let chartKey = chartInstanceKeyMap.get(component.id);
  
  // Base key structure
  const baseKey = `${type}-${id}`;
  
  // Append animation trigger if present
  const finalKey = animationTrigger ? `${baseKey}-${animationTrigger}` : baseKey;

  // Track previous data to detect actual data changes - use component props directly
  const previousDataRef = useRef(JSON.stringify(props.data));
  const currentDataString = JSON.stringify(props.data);
  const dataChanged = currentDataString !== previousDataRef.current;
  
  // Track if we've had a recent data change that should animate
  const [recentDataChange, setRecentDataChange] = useState(false);
  
  useEffect(() => {
    if (dataChanged) {
      previousDataRef.current = currentDataString;
      setRecentDataChange(true);
      // Clear the flag after animation completes
      const timer = setTimeout(() => {
        setRecentDataChange(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [currentDataString, dataChanged]);
  

  
  // Calculate animate value - do NOT memoize to ensure it updates when flags change
  const currentShouldAnimate = (() => {
    // Respect explicit disable flags first
    if (props.animate === false || chartProps.animate === false) return false;

    // Suppress animations during drag/resize/transition
    if (typeof window !== 'undefined') {
      const isDragging = (window as any).__isDraggingCharts;
      const isResizing = (window as any).__isResizingCharts;
      const isTransitioning = (window as any).__isInEditModeTransition;
      if (isDragging || isResizing || isTransitioning) {
        return false;
      }
    }

    const timeSinceMount = Date.now() - mountTimeRef.current;

    // View mode: animate only on slide-activation or real data changes
    if (!isEditing) {
      const activationCue = animateOnceOnSlide || dataChanged || recentDataChange;
      if (activationCue) {
        return true;
      }

      if (!hasAnimatedOnce.current) {
        if (timeSinceMount < 400) {
          return true;
        }

        if (typeof window !== 'undefined') {
          const lastSlideChangeTs = (window as any).__lastSlideChangeDispatch?.ts;
          if (lastSlideChangeTs) {
            const sinceChange = Date.now() - lastSlideChangeTs;
            if (sinceChange < 350) {
              return true;
            }
          }
        }
      }

      return false;
    }

    // In editing mode, allow a brief initial animation window
    if (timeSinceMount < 300) {
      return true;
    }

    // Otherwise animate only for data changes
    return dataChanged || recentDataChange;
  })();
  
  // For initial render or during animation window, use the calculated value
  const shouldAnimate = currentShouldAnimate;

  useEffect(() => {
    if (shouldAnimate) {
      hasAnimatedOnce.current = true;
    }
  }, [shouldAnimate]);
  


  const combinedProps = {
    component,
    baseStyles,
    containerRef,
    onUpdate,
    isEditing,
    ...chartProps,
    backgroundColor: chartProps.backgroundColor,
    themeType: chartProps.theme,
    // Pass the original string value for motionConfig - don't resolve to object
    motionConfig: chartProps.motionConfig || 'default',
    // Disable animations when charts are being dragged or resized to prevent bouncing
    animate: shouldAnimate,
    isInteractive: chartProps.isInteractive ?? true,
  };

  try {
    // Use a stable key that doesn't change - let Highcharts handle animation internally
    // Use a stable key to avoid remount flicker; control one-time animation via options, not remounts
    const renderKey = finalKey;
    
    // Apply optimization styles if present
    if (Object.keys(optimizedStyles).length > 0) {
      return (
        <div 
          ref={containerRef} 
          style={containerStyle} 
          data-chart-type={chartProps.chartType}
          data-legend-visible={showLegend ? 'true' : 'false'} // Add data attribute for CSS targeting
          data-has-background={chartProps.backgroundColor && chartProps.backgroundColor !== 'transparent' ? 'true' : 'false'} // Add background indicator
          key={chartKeyRef.current} // Use instance key for component identity
        >
          <div style={optimizedStyles}>
            <UnifiedHighchartsRenderer key={renderKey} {...combinedProps} animate={shouldAnimate} />
          </div>
        </div>
      );
    }
    
    return (
      <div 
        ref={containerRef} 
        style={containerStyle} 
        data-chart-type={chartProps.chartType}
        data-legend-visible={showLegend ? 'true' : 'false'} // Add data attribute for CSS targeting
        data-has-background={chartProps.backgroundColor && chartProps.backgroundColor !== 'transparent' ? 'true' : 'false'} // Add background indicator
        key={chartKeyRef.current} // Use instance key for component identity
      >
        <UnifiedHighchartsRenderer key={renderKey} {...combinedProps} animate={shouldAnimate} />
      </div>
    );
  } catch (error) {
    console.error('Error rendering chart:', error);
    const message = error instanceof Error ? error.message : 'Error rendering chart';
    return (
      <div ref={containerRef} style={{
        ...containerStyle,
        padding: 16,
        backgroundColor: '#fff0f0',
        border: '1px solid #ffcaca',
        borderRadius: 4,
        color: '#d32f2f',
      }}>
        <h4 style={{ margin: 0, marginBottom: 8, fontSize: 14 }}>Chart Error</h4>
        <p style={{ margin: 0, fontSize: 12 }}>{message}</p>
      </div>
    );
  }
};

export default React.memo(BaseChartRenderer);
