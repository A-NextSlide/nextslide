/**
 * SSR-compatible wrapper for Highcharts components
 * 
 * This component automatically detects whether it's running in a browser or
 * server environment and renders Highcharts appropriately.
 */
import React, { useRef, useEffect, useMemo } from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { convertToHighchartsTheme } from './highchartsUtils';

// Import Highcharts modules - they register themselves automatically
import 'highcharts/highcharts-more';
import 'highcharts/modules/solid-gauge';
import 'highcharts/modules/heatmap';
import 'highcharts/modules/treemap';
import 'highcharts/modules/sunburst';
import 'highcharts/modules/funnel';
import 'highcharts/modules/sankey';
import 'highcharts/modules/dependency-wheel';
import 'highcharts/modules/networkgraph';
import 'highcharts/modules/streamgraph';
import 'highcharts/modules/wordcloud';

import ssrDebugLogger from '@ssr/ssrDebugLogger.ts';
import { isSSR, getSlideDisplayScaleFactor } from '@ssr/ssrContext.ts';

// Configure Highcharts globally
if (typeof window !== 'undefined' && Highcharts) {
  Highcharts.setOptions({
    exporting: {
      enabled: false
    },
    credits: {
      enabled: false
    },
    accessibility: {
      enabled: false  // Disable accessibility warnings
    }
  });
}

// Helper to log SSR chart rendering
function logSSRChart(chartType: string, options: any) {
  const inSSRMode = isSSR();
  ssrDebugLogger.log('highchartsSSR', `Rendering ${chartType} in ${inSSRMode ? 'SSR' : 'Browser'} mode`, {
    chartType,
    isSSR: inSSRMode,
    dataLength: options.series?.[0]?.data?.length || 'unknown',
  });
}

export interface SSRHighchartsProps {
  options: Highcharts.Options;
  width?: number;
  height?: number;
  chartType?: string;
  containerProps?: React.HTMLAttributes<HTMLDivElement>;
  callback?: (chart: Highcharts.Chart) => void;
  constructorType?: 'chart' | 'stockChart' | 'mapChart' | 'ganttChart';
  isReady?: boolean;
  theme?: 'light' | 'dark';
}

/**
 * SSR-compatible Highcharts component
 */
export const SSRHighcharts: React.FC<SSRHighchartsProps> = ({
  options,
  width = 600,
  height = 400,
  chartType = 'chart',
  containerProps = {},
  callback,
  constructorType = 'chart',
  isReady = true,
  theme,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Highcharts.Chart | null>(null);
  const renderCount = useRef(0);
  const lastDimensions = useRef({ width, height });
  const isAnimatingRef = useRef(false);
  const hasPlayedEntranceRef = useRef(false);
  
  // Initialize isClient based on window availability to prevent double render
  const isClient = typeof window !== 'undefined';
  
  const inSSRMode = isSSR();
  
  // Track render count (must be before any returns)
  const isFirstRender = useMemo(() => {
    if (!inSSRMode && isClient && isReady) {
      renderCount.current += 1;
      return renderCount.current === 1;
    }
    return true;
  }, [inSSRMode, isClient, isReady]);
  
  // Enhanced options with SSR considerations
  const enhancedOptions = useMemo(() => {
    const scale = inSSRMode ? getSlideDisplayScaleFactor() : 1;
    
    // Check if animations should be disabled
    const shouldDisableAnimation = inSSRMode || 
                                  (typeof window !== 'undefined' && 
                                   ((window as any).__isInEditModeTransition || 
                                    (window as any).__isResizingCharts));

    // Allow a one-time entrance animation on the first ready render
    const allowInitialAnimation = isClient && !inSSRMode && !hasPlayedEntranceRef.current;
    
    // Get theme options if theme prop is provided
    const themeOptions = theme ? convertToHighchartsTheme(
      theme, 
      typeof options.chart?.backgroundColor === 'string' ? options.chart.backgroundColor : undefined,
      options.chart?.style?.fontFamily
    ) : {};
    
    // Merge theme options with the provided options
    const mergedOptions = {
      ...themeOptions,
      ...options,
      chart: {
        ...themeOptions.chart,
        ...options.chart,
        width: width * scale,
        height: height * scale,
        // Preserve explicit animation config if provided; otherwise enable unless globally disabled
        animation: (shouldDisableAnimation && !allowInitialAnimation)
          ? false
          : (options.chart?.animation === undefined ? true : options.chart.animation),
        renderTo: inSSRMode ? undefined : containerRef.current || undefined,
        reflow: false, // Disable automatic reflow
        // Disable all animations during transitions
        events: {
          ...options.chart?.events,
        }
      },
      plotOptions: {
        ...themeOptions.plotOptions,
        ...options.plotOptions,
        series: {
          ...(themeOptions.plotOptions?.series || {}),
          ...(options.plotOptions?.series || {}),
          // Follow explicit series animation if provided; otherwise inherit from chart
          animation: (shouldDisableAnimation && !allowInitialAnimation)
            ? false
            : (options.plotOptions?.series?.animation !== undefined
                ? options.plotOptions.series.animation
                : (options.chart?.animation === undefined ? true : options.chart.animation)),
          states: {
            hover: {
              animation: false
            }
          }
        }
      },
      tooltip: {
        ...themeOptions.tooltip,
        ...options.tooltip,
        animation: false
      },
      xAxis: {
        ...themeOptions.xAxis,
        ...options.xAxis,
      },
      yAxis: {
        ...themeOptions.yAxis,
        ...options.yAxis,
      },
      legend: {
        ...themeOptions.legend,
        ...options.legend,
      },
      title: {
        ...themeOptions.title,
        ...options.title,
      },
      subtitle: {
        ...themeOptions.subtitle,
        ...options.subtitle,
      },
      // Disable all features that require interactivity in SSR
      ...(inSSRMode ? {
        tooltip: { enabled: false },
        legend: { ...options.legend, enabled: false },
        exporting: { enabled: false },
        credits: { enabled: false },
        accessibility: { enabled: false }
      } : {})
    };
    
    return mergedOptions;
  }, [options, width, height, inSSRMode, theme]);
  
  // Update args for Highcharts
  const updateArgs = useMemo(() => {
    // Check if we should disable animations
    const disableAnimation = inSSRMode || 
                           (typeof window !== 'undefined' && 
                            ((window as any).__isInEditModeTransition || 
                             (window as any).__isResizingCharts));
    const requested = options.chart?.animation;
    // Allow animation on the first update post-mount only once
    const allowInitialAnimation = isClient && !inSSRMode && !hasPlayedEntranceRef.current;
    const animationOn = (!disableAnimation || allowInitialAnimation) && (requested === undefined ? true : requested !== false);
    return [true, true, animationOn]; // redraw=true, oneToOne=true, animation
  }, [inSSRMode, options.chart?.animation, isReady, isClient]);
  
  // Log after all hooks are called
  if (process.env.NODE_ENV === 'development') {
    logSSRChart(chartType, options);
    // console.debug('[SSRHighcharts] updateArgs', updateArgs);
  }
  
  // Effect to handle size updates using Highcharts setSize method
  useEffect(() => {
    if (!chartRef.current || !isReady || inSSRMode || !isClient) return;
    if (isAnimatingRef.current) return; // Freeze size changes during initial animation
    
    // Check if dimensions actually changed
    const dimensionsChanged = lastDimensions.current.width !== width || 
                            lastDimensions.current.height !== height;
    if (!dimensionsChanged) return;
    
    // Update last dimensions
    lastDimensions.current = { width, height };
    
    // Skip if we're already in a resize operation
    if (typeof window !== 'undefined' && (window as any).__isResizingCharts) {
      return;
    }
    
    // Use setSize for dimension changes if chart already exists
    if (width !== undefined && height !== undefined) {
      const shouldAnimateResize = false; // Never animate resize operations
      chartRef.current.setSize(width, height, shouldAnimateResize);
    }
  }, [width, height, isReady, inSSRMode, isClient]);

  // Detect initial animation window to pause setSize
  useEffect(() => {
    if (!isClient || inSSRMode || !isReady) return;
    // Determine if animation is enabled from merged options
    const chartAnim: any = (enhancedOptions.chart as any)?.animation;
    const seriesAnim: any = (enhancedOptions.plotOptions as any)?.series?.animation;
    const enabled = (chartAnim && chartAnim !== false) || (seriesAnim && seriesAnim !== false);
    if (!enabled) return;
    isAnimatingRef.current = true;
    const duration = typeof seriesAnim === 'object' && typeof seriesAnim.duration === 'number'
      ? seriesAnim.duration
      : (typeof chartAnim === 'object' && typeof chartAnim.duration === 'number'
          ? chartAnim.duration
          : 800);
    const t = setTimeout(() => { isAnimatingRef.current = false; }, Math.max(100, duration + 100));
    return () => clearTimeout(t);
  }, [isClient, inSSRMode, isReady, enhancedOptions]);
  
  // Effect to update theme dynamically
  useEffect(() => {
    if (chartRef.current && isReady && !inSSRMode && isClient && theme) {
      // Small delay to ensure this runs after the automatic update
      const timer = setTimeout(() => {
        if (chartRef.current) {
          const bgColor = options.chart?.backgroundColor;
          const fontFamily = options.chart?.style?.fontFamily;
          const themeOptions = convertToHighchartsTheme(theme, typeof bgColor === 'string' ? bgColor : undefined, fontFamily);
          chartRef.current.update(themeOptions, true); // true for redraw
        }
      }, 50);
      
      return () => clearTimeout(timer);
    }
  }, [theme, options.chart?.backgroundColor, options.chart?.style?.fontFamily, isReady, inSSRMode, isClient]);
  

  

  
  // Server-side rendering fallback
  if (inSSRMode || !isClient) {
    return (
      <div 
        ref={containerRef}
        {...containerProps}
        style={{
          width: width,
          height: height,
          backgroundColor: '#f5f5f5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid #ddd',
          borderRadius: '4px',
          ...containerProps.style
        }}
      >
        <span style={{ color: '#666', fontSize: '14px' }}>
          {chartType} Chart
        </span>
      </div>
    );
  }

  // Don't render Highcharts until ready (prevents double-initialization glitches)
  if (!isReady) {
    return null;
  }

  // Determine if chart should be immutable (complex charts have update issues)
  const shouldBeImmutable = ['networkgraph', 'dependencywheel', 'sankey', 'packedbubble'].includes(chartType);

  // Client-side rendering with HighchartsReact
  return (
    <div ref={containerRef} {...containerProps} style={{ width, height, ...containerProps.style }}>
      <HighchartsReact
        highcharts={Highcharts}
        options={enhancedOptions}
        constructorType={constructorType}
        callback={(chart: Highcharts.Chart) => {
          const isNewChart = !chartRef.current;
          if (import.meta.env.DEV) {
      
          }
          chartRef.current = chart;
          // Mark entrance animation as played once we have a chart and are ready
          if (isClient && isReady && !hasPlayedEntranceRef.current) {
            hasPlayedEntranceRef.current = true;
          }
          if (callback) callback(chart);
        }}
        updateArgs={updateArgs}
        immutable={shouldBeImmutable} // Network graphs should be immutable to prevent update errors
      />
    </div>
  );
};

// Export a helper to create chart-specific wrappers
export function createHighchartsWrapper(defaultChartType: string) {
  return React.forwardRef<HTMLDivElement, SSRHighchartsProps>((props, ref) => {
    return <SSRHighcharts {...props} chartType={defaultChartType} />;
  });
}

// Effect to update existing chart when options change