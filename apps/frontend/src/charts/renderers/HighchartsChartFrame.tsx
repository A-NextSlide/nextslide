import React, { useRef, useMemo, useState, useEffect } from 'react';
import { getComponentProps } from '@/renderers/utils';
import { convertToHighchartsTheme, getCommonHighchartsOptions } from '../utils/highchartsUtils';
import { BaseChartProps } from '@/types/ChartTypes';
import { RendererProps } from '@/renderers/index';
import { SSRHighcharts } from '../utils/highchartsSSR';
import Highcharts from 'highcharts';
import { getChartTheme } from '../utils/ThemeUtils';
import { ComponentInstance } from '@/types/components';

/**
 * Shared frame component for rendering Highcharts charts with common props.
 * Applies defaults, theme, sizing, and container ref, then delegates to children.
 */
export type HighchartsChartFrameProps<T> = {
  component: RendererProps['component'];
  containerRef?: React.RefObject<HTMLDivElement>;
  defaultProps?: Partial<T & BaseChartProps>;
  onUpdate?: RendererProps['onUpdate'];
  children: (params: {
    props: T & BaseChartProps;
    highchartsOptions: Highcharts.Options;
    height: number;
    width: number;
    chartRef: React.Ref<HTMLDivElement>;
    component: RendererProps['component'];
    onUpdate?: RendererProps['onUpdate'];
    isReady: boolean;
    backgroundColor?: string;
  }) => React.ReactElement;
  backgroundColor?: string;
};

export function HighchartsChartFrame<T extends Record<string, any>>({
  component,
  containerRef,
  defaultProps = {},
  onUpdate,
  children,
  backgroundColor
}: HighchartsChartFrameProps<T>) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isReady, setIsReady] = useState(false);
  const hasMeasured = useRef(false);

  // Merge default props with component props
  const props = useMemo(() => {
    const componentProps = getComponentProps<T & BaseChartProps>(component, defaultProps);
    
    return {
      ...componentProps,
      backgroundColor
    };
  }, [component, defaultProps, backgroundColor]);

  // Update dimensions based on container
  useEffect(() => {
    if (!containerRef?.current) return;

    const resizeObserver = new ResizeObserver(entries => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;

      if (width > 0 && height > 0) {
        const newWidth = Math.max(width, 200);
        const newHeight = Math.max(height, 200);
        
        // Update dimensions
        setDimensions({
          width: newWidth,
          height: newHeight
        });
        
        // Mark ready on first successful measurement
        if (!hasMeasured.current) {
          hasMeasured.current = true;
          setIsReady(true);
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [containerRef]);

  // Fallback: if ResizeObserver hasn't measured shortly after mount, attempt a manual measure
  useEffect(() => {
    if (!containerRef?.current || hasMeasured.current) return;
    const timer = setTimeout(() => {
      if (hasMeasured.current || !containerRef.current) return;
      const el = containerRef.current;
      const rect = el.getBoundingClientRect();
      const width = Math.max(rect.width || el.clientWidth || el.offsetWidth || 200, 200);
      const height = Math.max(rect.height || el.clientHeight || el.offsetHeight || 200, 200);
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
        if (!hasMeasured.current) {
          hasMeasured.current = true;
          setIsReady(true);
        }
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [containerRef]);

  // Defensive: when a slide completes or generation finishes, re-measure and mark ready
  useEffect(() => {
    const remeasure = () => {
      if (!containerRef?.current) return;
      const el = containerRef.current;
      const rect = el.getBoundingClientRect();
      const width = Math.max(rect.width || el.clientWidth || el.offsetWidth || 0, 0);
      const height = Math.max(rect.height || el.clientHeight || el.offsetHeight || 0, 0);
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
        if (!hasMeasured.current) {
          hasMeasured.current = true;
          setIsReady(true);
        }
      }
    };
    window.addEventListener('slide_completed', remeasure as EventListener);
    window.addEventListener('deck_generation_complete', remeasure as EventListener);
    return () => {
      window.removeEventListener('slide_completed', remeasure as EventListener);
      window.removeEventListener('deck_generation_complete', remeasure as EventListener);
    };
  }, [containerRef]);

  // Don't create highcharts options until we have dimensions
  const highchartsOptions = useMemo(() => {
    if (!dimensions) return null;
    
    const theme = props.theme || 'light';
    const backgroundColor = props.backgroundColor;
    const fontFamily = props.fontFamily;
    
    const themeOptions = convertToHighchartsTheme(theme, backgroundColor, fontFamily);
    const commonOptions = getCommonHighchartsOptions(props);
    
    // Merge theme and common options, ensuring font family is applied
    const mergedOptions = {
      ...themeOptions,
      ...commonOptions,
      chart: {
        ...themeOptions.chart,
        ...commonOptions.chart,
        width: dimensions.width,
        height: dimensions.height,
        style: {
          ...themeOptions.chart?.style,
          fontFamily: fontFamily && fontFamily !== 'default' ? fontFamily : themeOptions.chart?.style?.fontFamily
        }
      }
    } as Highcharts.Options;
    
    return mergedOptions;
  }, [props, dimensions, props.backgroundColor, props.theme, props.fontFamily]);

  // Handle updates to chart properties
  useEffect(() => {
    // Add logic to handle updates to chart properties
  }, [props, dimensions, props.backgroundColor, props.theme]);

  // Always call children to ensure hooks are called consistently
  const childrenResult = children({
    props,
    highchartsOptions: highchartsOptions || {} as Highcharts.Options, // Provide empty options if null
    height: dimensions?.height || 400,
    width: dimensions?.width || 600,
    chartRef,
    component,
    onUpdate,
    isReady,
    backgroundColor
  });

  // Don't render until we have proper dimensions
  if (!dimensions || !highchartsOptions) {
    return null;
  }

  return childrenResult;
} 