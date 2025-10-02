import React, { useMemo, useRef, useEffect, useState } from 'react';
import UnifiedHighchartsRenderer from '@/charts/renderers/UnifiedHighchartsRenderer';
import { ComponentInstance } from '@/types/components';

interface SlideChartViewerProps {
  extractedData: {
    source?: string;
    chartType?: string;
    data: any[];
    title?: string;
    metadata?: { citations?: Array<{ title?: string; source?: string; url?: string }> } | any;
  };
}

const SlideChartViewer: React.FC<SlideChartViewerProps> = ({ extractedData }) => {
  const { chartType = 'bar', data, title, metadata } = extractedData;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 380, height: 200 });

  // Update container size on mount and resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        // Subtract padding
        setContainerSize({ 
          width: Math.max(300, width - 16), 
          height: Math.max(180, height - 16) 
        });
      }
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  if (!data || data.length === 0) {
    return (
      <div className="mt-3 p-3 border border-dashed border-gray-300 dark:border-gray-700 rounded-md bg-gray-50/50 dark:bg-gray-900/20">
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
          No chart data available
        </div>
      </div>
    );
  }

  // Compute adaptive axis tick rotation for dense datasets
  const adaptiveTickRotation = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    const count = data.length ?? 0;
    if (chartType === 'pie') return 0;
    if (count <= 8) return 0;
    if (count <= 12) return 20;
    if (count <= 20) return 35;
    return 45;
  }, [data, chartType]);

  // Clamp pie segments to 10, rest moved to overflow list
  const { displayData, overflowData } = useMemo(() => {
    if (chartType !== 'pie') return { displayData: data, overflowData: [] as any[] };
    const maxSegments = 10;
    if (!Array.isArray(data) || data.length <= maxSegments) return { displayData: data, overflowData: [] as any[] };
    const shown = data.slice(0, maxSegments);
    const rest = data.slice(maxSegments);
    return { displayData: shown, overflowData: rest };
  }, [data, chartType]);

  // Enrich data points with source labels for tooltip/legend if citations exist
  const enrichedData = useMemo(() => {
    const citations = metadata?.citations as Array<{ title?: string; source?: string; url?: string }> | undefined;
    if (!citations || !citations.length) return displayData;
    const labelFor = (idx: number | undefined) => {
      if (idx === undefined || idx === null) return undefined;
      const c = citations[idx];
      if (!c) return undefined;
      try { return c.title || c.source || new URL(c.url).hostname; } catch { return c.title || c.source || c.url; }
    };
    const urlFor = (idx: number | undefined) => (idx !== undefined && citations[idx]?.url) || undefined;
    if (Array.isArray(displayData) && displayData.length > 0) {
      // Simple points array
      if (!displayData[0]?.data) {
        return displayData.map((p: any) => ({
          ...p,
          sourceLabel: labelFor(p?.sourceIndex),
          sourceUrl: urlFor(p?.sourceIndex)
        }));
      }
      // Series format
      return displayData.map((s: any) => ({
        ...s,
        data: (s.data || []).map((pt: any) => ({
          ...pt,
          sourceLabel: labelFor(pt?.sourceIndex),
          sourceUrl: urlFor(pt?.sourceIndex)
        }))
      }));
    }
    return displayData;
  }, [displayData, metadata]);

  const sourceBadgesMap = useMemo(() => {
    const citations = metadata?.citations as Array<{ title?: string; source?: string; url?: string }> | undefined;
    if (!citations || !citations.length) return {} as Record<number, { label: string; title?: string; url?: string }>;
    const map: Record<number, { label: string; title?: string; url?: string }> = {};
    citations.forEach((c, idx) => {
      const label = c.title || c.source || (new URL(c.url).hostname);
      map[idx] = { label, title: c.title, url: c.url };
    });
    return map;
  }, [metadata]);

  // Create a mock component instance for the UnifiedHighchartsRenderer
  const mockComponent: ComponentInstance = useMemo(() => ({
    id: `chart-preview-${Date.now()}`,
    type: 'Chart',
    position: { x: 0, y: 0, z: 0 },
    size: { width: containerSize.width, height: containerSize.height },
    props: {
      chartType: chartType,
      data: enrichedData,
      theme: 'light',
      enableLabel: true,
      enableAxisTicks: true,
      enableGrid: true,
      showLegend: false,
      showAxisLegends: ['bar', 'column', 'line'].includes(chartType),
      animate: false, // Disable animations for previews
      margin: { top: 10, right: 10, left: 10, bottom: 10 }, // Smaller margins for previews
      // Pass adaptive axis label rotation
      axisBottom: { tickRotation: adaptiveTickRotation },
    },
    styles: {},
    locked: false,
    visible: true
  }), [chartType, displayData, containerSize, adaptiveTickRotation]);

  return (
    <div className="p-2">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-purple-600 dark:text-purple-400 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
            <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
          </svg>
          {title || `Chart Preview (${chartType})`}
        </h4>
        {/* Source legend badges (grouped) */}
        {Object.keys(sourceBadgesMap).length > 0 && (
          <div className="flex items-center gap-1.5">
            {Object.entries(sourceBadgesMap).map(([idx, info]) => (
              <a key={idx} href={info.url} target="_blank" rel="noreferrer" className="text-[10px] px-1.5 py-0.5 rounded border border-purple-300/60 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20">
                Source: {info.label}
              </a>
            ))}
          </div>
        )}
      </div>
      
      <div 
        className="bg-white dark:bg-gray-800 rounded-md p-2 relative overflow-hidden shadow-sm" 
        style={{ height: '220px', minHeight: '220px', maxHeight: '220px' }}
        ref={containerRef}
      >
        <div className="w-full h-full">
          <UnifiedHighchartsRenderer
            component={mockComponent}
            containerRef={containerRef}
            isThumbnail={true}
          />
        </div>
      </div>

      {/* Overflow list for pie/donut if clamped */}
      {chartType === 'pie' && overflowData.length > 0 && (
        <div className="mt-2 border rounded-md bg-zinc-50/60 dark:bg-zinc-900/40">
          <div className="text-[10px] uppercase tracking-wide px-2 py-1 text-zinc-600 dark:text-zinc-400">More</div>
          <div className="max-h-24 overflow-auto">
            <table className="w-full text-[11px]">
              <tbody>
                {overflowData.map((p: any, i: number) => (
                  <tr key={i} className="border-t border-zinc-200/60 dark:border-zinc-800/60">
                    <td className="px-2 py-1 text-zinc-700 dark:text-zinc-300">{p.name}</td>
                    <td className="px-2 py-1 text-right text-zinc-700 dark:text-zinc-300">{typeof p.value === 'number' ? p.value : p.y}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default SlideChartViewer; 
