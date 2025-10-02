import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X } from 'lucide-react';
import { SlideOutline, DeckOutline, ExtractedData } from '@/types/SlideTypes';
import { transformChartData } from '@/types/DataTransformers';
import { CHART_TYPES } from '@/registry/library/chart-properties';
import { Edit2, Check } from 'lucide-react';

interface ChartDataTableProps {
  slide?: SlideOutline;
  setCurrentOutline?: React.Dispatch<React.SetStateAction<DeckOutline | null>>;
  extractedData?: ExtractedData;
  onChangeExtractedData?: (extracted: ExtractedData) => void;
}

/**
 * Validates and repairs malformed chart data from the backend
 */
const validateAndRepairChartData = (extractedData: any): any => {
  if (!extractedData || typeof extractedData !== 'object') {
    return null;
  }

  // Ensure required properties exist
  const repaired = {
    source: extractedData.source || 'Unknown Source',
    chartType: extractedData.chartType || 'bar',
    compatibleChartTypes: Array.isArray(extractedData.compatibleChartTypes) 
      ? extractedData.compatibleChartTypes 
      : ['bar'],
    data: []
  };

  // Validate chartType is not empty or null
  if (!repaired.chartType || repaired.chartType.trim() === '') {
    repaired.chartType = 'bar';
  }

  // Ensure compatibleChartTypes is never empty
  if (!repaired.compatibleChartTypes || repaired.compatibleChartTypes.length === 0) {
    repaired.compatibleChartTypes = ['bar'];
  }

  // Validate and repair data array
  if (!Array.isArray(extractedData.data) || extractedData.data.length === 0) {
    repaired.data = getDefaultDataForChartType(repaired.chartType);
    return repaired;
  }

  const seriesChartTypes = ['line', 'scatter', 'bump', 'heatmap'];
  const isSeriesChart = seriesChartTypes.includes(repaired.chartType);
  
  // Check if data structure matches chart type
  const isCurrentlySeriesFormat = extractedData.data[0] && 
                                  typeof extractedData.data[0] === 'object' && 
                                  'data' in extractedData.data[0] &&
                                  Array.isArray(extractedData.data[0].data);

  if (isSeriesChart && !isCurrentlySeriesFormat) {
    // Convert simple format to series format
    repaired.data = convertSimpleToSeries(extractedData.data);
  } else if (!isSeriesChart && isCurrentlySeriesFormat) {
    // Convert series format to simple format
    repaired.data = convertSeriesToSimple(extractedData.data);
  } else if (isSeriesChart && isCurrentlySeriesFormat) {
    // Validate series format
    repaired.data = validateSeriesData(extractedData.data);
  } else {
    // Validate simple format
    repaired.data = validateSimpleData(extractedData.data);
  }

  // Validate data variance - check for identical values
  if (repaired.data && repaired.data.length > 0) {
    repaired.data = ensureDataVariance(repaired.data, isSeriesChart);
  }

  // Final validation - ensure we have valid data
  if (!repaired.data || repaired.data.length === 0) {
    repaired.data = getDefaultDataForChartType(repaired.chartType);
  }

  // Ensure compatibleChartTypes includes the current chartType
  if (!repaired.compatibleChartTypes.includes(repaired.chartType)) {
    repaired.compatibleChartTypes = [repaired.chartType, ...repaired.compatibleChartTypes];
  }

  return repaired;
};

/**
 * Ensures data has proper variance and no identical values
 */
const ensureDataVariance = (data: any[], isSeriesFormat: boolean): any[] => {
  if (!data || data.length === 0) return data;

  if (isSeriesFormat) {
    return data.map(series => {
      if (!series.data || !Array.isArray(series.data)) return series;
      
      // Check if all Y values are identical
      const yValues = series.data.map((point: any) => Number(point.y) || 0);
      const allSame = yValues.every((val: number) => val === yValues[0]);
      
      if (allSame && yValues.length > 1) {
        const baseValue = yValues[0] || 100;
        
        return {
          ...series,
          data: series.data.map((point: any, index: number) => ({
            ...point,
            y: Math.round(baseValue * (0.8 + (index * 0.1) + Math.random() * 0.3))
          }))
        };
      }
      
      return series;
    });
  } else {
    // Check simple format data
    const values = data.map(item => Number(item.value) || 0);
    const allSame = values.every(val => val === values[0]);
    
    if (allSame && values.length > 1) {
      const baseValue = values[0] || 100;
      
      return data.map((item, index) => ({
        ...item,
        value: Math.round(baseValue * (0.7 + (index * 0.15) + Math.random() * 0.4))
      }));
    }
  }
  
  return data;
};

/**
 * Validates series format data and repairs common issues
 */
const validateSeriesData = (data: any[]): any[] => {
  return data.map((series, index) => {
    if (!series || typeof series !== 'object') {
      return {
        id: `Series ${index + 1}`,
        data: [
          { x: 'Point 1', y: 10 },
          { x: 'Point 2', y: 20 },
          { x: 'Point 3', y: 15 }
        ]
      };
    }

    const validSeries = {
      id: series.id || series.name || `Series ${index + 1}`,
      data: []
    };

    if (Array.isArray(series.data)) {
      validSeries.data = series.data.map((point, pointIndex) => {
        if (!point || typeof point !== 'object') {
          return { x: `Point ${pointIndex + 1}`, y: 10 };
        }

        return {
          x: point.x !== undefined ? point.x : `Point ${pointIndex + 1}`,
          y: isNaN(Number(point.y)) ? 10 : Number(point.y)
        };
      }).filter(point => point.x !== undefined && point.y !== undefined);
    }

    // Ensure at least 3 data points
    if (validSeries.data.length < 3) {
      validSeries.data = [
        { x: 'Point 1', y: 10 },
        { x: 'Point 2', y: 20 },
        { x: 'Point 3', y: 15 }
      ];
    }

    return validSeries;
  }).filter(series => series && series.data && series.data.length > 0);
};

/**
 * Validates simple format data and repairs common issues
 */
const validateSimpleData = (data: any[]): any[] => {
  const validData = data.map((item, index) => {
    if (!item || typeof item !== 'object') {
      return { name: `Category ${index + 1}`, value: 10 };
    }

    const name = item.name || item.id || item.label || `Category ${index + 1}`;
    const value = isNaN(Number(item.value)) ? 10 : Number(item.value);

    return { name, value };
  }).filter(item => item && item.name && !isNaN(item.value));

  // Ensure at least 3 data points
  if (validData.length < 3) {
    return [
      { name: 'Category 1', value: 25 },
      { name: 'Category 2', value: 35 },
      { name: 'Category 3', value: 40 }
    ];
  }

  return validData;
};

/**
 * Converts simple format to series format
 */
const convertSimpleToSeries = (data: any[]): any[] => {
  if (!Array.isArray(data) || data.length === 0) {
    return getDefaultDataForChartType('line');
  }

  return [{
    id: 'Series 1',
    data: data.map(item => ({
      x: item.x || item.name || item.id || item.label || 'Point',
      y: isNaN(Number(item.value)) ? (isNaN(Number(item.y)) ? 10 : Number(item.y)) : Number(item.value)
    }))
  }];
};

/**
 * Converts series format to simple format
 */
const convertSeriesToSimple = (data: any[]): any[] => {
  if (!Array.isArray(data) || data.length === 0 || !data[0]?.data) {
    return getDefaultDataForChartType('bar');
  }

  // Use first series data
  const firstSeries = data[0];
  if (!Array.isArray(firstSeries.data)) {
    return getDefaultDataForChartType('bar');
  }

  return firstSeries.data.map(point => ({
    name: point.x || 'Category',
    value: isNaN(Number(point.y)) ? 10 : Number(point.y)
  }));
};

/**
 * Provides fallback data when no valid data exists
 */
const getDefaultDataForChartType = (chartType: string): any[] => {
  const seriesTypes = ['line', 'scatter', 'bump', 'heatmap', 'spline', 'area', 'areaspline', 'streamgraph'];
  
  if (seriesTypes.includes(chartType)) {
    return [{ 
      id: 'Series 1', 
      data: [
        { x: 'Point 1', y: 10 },
        { x: 'Point 2', y: 20 },
        { x: 'Point 3', y: 15 },
        { x: 'Point 4', y: 25 }
      ] 
    }];
  }

  // Hierarchical chart types need different data structures
  if (['treemap', 'sunburst'].includes(chartType)) {
    return [
      { name: 'Technology', value: 45 },
      { name: 'Healthcare', value: 30 },
      { name: 'Finance', value: 25 },
      { name: 'Education', value: 20 },
      { name: 'Retail', value: 15 }
    ];
  }

  // Process/flow chart types (funnel, pyramid, waterfall)
  if (['funnel', 'pyramid', 'waterfall'].includes(chartType)) {
    return [
      { name: 'Leads', value: 1000 },
      { name: 'Prospects', value: 600 },
      { name: 'Opportunities', value: 300 },
      { name: 'Customers', value: 150 }
    ];
  }

  // Gauge/radar for smaller datasets
  if (['gauge', 'radar'].includes(chartType)) {
    return [
      { name: 'Performance', value: 85 },
      { name: 'Quality', value: 92 },
      { name: 'Efficiency', value: 78 },
      { name: 'Innovation', value: 88 }
    ];
  }

  // Bubble chart needs additional dimension
  if (chartType === 'bubble') {
    return [
      { name: 'Product A', value: 25, size: 15 },
      { name: 'Product B', value: 35, size: 25 },
      { name: 'Product C', value: 20, size: 10 },
      { name: 'Product D', value: 20, size: 20 }
    ];
  }

  // Default for all other charts (bar, column, pie, etc.)
  return [
    { name: 'Category 1', value: 25 },
    { name: 'Category 2', value: 35 },
    { name: 'Category 3', value: 20 },
    { name: 'Category 4', value: 20 }
  ];
};

const ChartDataTable: React.FC<ChartDataTableProps> = ({ slide, setCurrentOutline, extractedData, onChangeExtractedData }) => {
  const [activeSeriesIndex, setActiveSeriesIndex] = useState<number>(0);
  const [hasLoggedConversion, setHasLoggedConversion] = useState<Set<string>>(new Set());

  // Validate and repair chart data on component mount
  const validatedData = React.useMemo(() => {
    const sourceData = extractedData || slide?.extractedData;
    if (!sourceData) return null;
    
    // Create a logging wrapper to reduce console spam
    const originalWarn = console.warn;
    const conversionKey = `${slide?.id ?? 'local'}-${sourceData.chartType}`;
    
    // Only log conversion warnings once per slide/chart type combination
    if (!hasLoggedConversion.has(conversionKey)) {
      setHasLoggedConversion(prev => new Set([...prev, conversionKey]));
    } else {
      // Temporarily suppress warnings for repeated conversions
      console.warn = () => {};
    }
    
    const result = validateAndRepairChartData(sourceData);
    
    // Restore original console.warn
    console.warn = originalWarn;
    
    return result;
  }, [extractedData, slide?.extractedData, slide?.id, hasLoggedConversion]);

  /**
   * Determines compatible chart types based on data structure and content
   */
  const getCompatibleChartTypes = (extractedData: any): string[] => {
    if (!extractedData?.data || !Array.isArray(extractedData.data) || extractedData.data.length === 0) {
      return ['bar', 'pie', 'line'];
    }

    const data = extractedData.data;
    const isSeriesFormat = data[0]?.data && Array.isArray(data[0].data);
    
    if (isSeriesFormat) {
      return determineSeriesChartTypes(data);
    } else {
      return determineSimpleChartTypes(data);
    }
  };

  /**
   * Determines chart types for series data format
   */
  const determineSeriesChartTypes = (data: any[]): string[] => {
    const firstSeries = data[0];
    if (!firstSeries?.data || firstSeries.data.length < 2) {
      return ['bar', 'pie', 'line', 'area', 'column'];
    }

    const hasTimeData = firstSeries.data.some((point: any) => 
      typeof point.x === 'string' && (
        point.x.match(/\d{4}/) ||
        point.x.match(/Q[1-4]/) ||
        point.x.match(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/) ||
        point.x.match(/Week|Month|Day|Year/i)
      )
    );

    const hasValidNumericData = firstSeries.data.every((point: any) => 
      point.x !== undefined && point.y !== undefined && !isNaN(Number(point.y))
    );

    const dataLength = firstSeries.data.length;
    const hasMultipleSeries = data.length > 1;

    if (!hasValidNumericData) return ['bar', 'line', 'pie', 'column', 'area'];
    
    // Time-based data works well with trends and flows
    if (hasTimeData) {
      return hasMultipleSeries 
        ? ['line', 'area', 'spline', 'areaspline', 'streamgraph', 'bar', 'column', 'scatter']
        : ['line', 'area', 'spline', 'areaspline', 'bar', 'column', 'waterfall', 'scatter'];
    }
    
    // Categorical data with multiple series
    if (hasMultipleSeries) {
      return dataLength > 10 
        ? ['heatmap', 'scatter', 'bubble', 'line', 'area', 'bar', 'column']
        : ['line', 'scatter', 'bubble', 'radar', 'bar', 'column', 'area', 'spline'];
    }
    
    // Single series with lots of data points
    if (dataLength > 15) {
      return ['scatter', 'bubble', 'line', 'area', 'heatmap', 'treemap'];
    }
    
    // Single series with moderate data
    return ['line', 'scatter', 'area', 'spline', 'bar', 'column', 'pie'];
  };

  /**
   * Determines chart types for simple data format
   */
  const determineSimpleChartTypes = (data: any[]): string[] => {
    const validData = data.filter(item => 
      item && (item.x || item.name || item.id) && (item.y !== undefined || item.value !== undefined) && (!isNaN(Number(item.y)) || !isNaN(Number(item.value)))
    );

    if (validData.length < 2) return ['bar', 'pie', 'line', 'column', 'funnel'];

    const hasTimeBasedCategories = validData.some(item => {
      const name = item.x || item.name || item.id || '';
      return typeof name === 'string' && (
        name.match(/\d{4}/) || name.match(/Q[1-4]/) ||
        name.match(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/) ||
        name.match(/Week|Month|Day|Year/i) || name.match(/\d+/)
      );
    });

    const totalValue = validData.reduce((sum, item) => sum + Number(item.y !== undefined ? item.y : item.value || 0), 0);
    const maxValue = Math.max(...validData.map(item => Number(item.y !== undefined ? item.y : item.value || 0)));
    const minValue = Math.min(...validData.map(item => Number(item.y !== undefined ? item.y : item.value || 0)));
    const isPieAppropriate = validData.length <= 8 && totalValue > 0 && maxValue / totalValue < 0.8;
    const isHierarchical = validData.length > 5 && validData.length <= 20;
    const isFunnelAppropriate = validData.length <= 8 && validData.every(item => Number(item.y !== undefined ? item.y : item.value) > 0);
    const hasWideValueRange = maxValue / Math.max(minValue, 1) > 5;

    // Time-based categories: great for trends and temporal analysis
    if (hasTimeBasedCategories) {
      return validData.length > 12 
        ? ['line', 'area', 'bar', 'column', 'spline', 'waterfall', 'scatter']
        : ['line', 'area', 'bar', 'column', 'spline', 'waterfall', 'gauge'];
    }
    
    // Hierarchical data: good for treemaps and specialized views
    if (isHierarchical) {
      return hasWideValueRange
        ? ['treemap', 'sunburst', 'bar', 'column', 'bubble', 'scatter', 'heatmap']
        : ['treemap', 'bar', 'column', 'pie', 'sunburst', 'radar'];
    }
    
    // Funnel/process data: sequential values
    if (isFunnelAppropriate && validData.length >= 3) {
      const isDescending = validData.every((item, i, arr) => 
        i === 0 || Number(item.value) <= Number(arr[i-1].value) * 1.1
      );
      if (isDescending) {
        return ['funnel', 'pyramid', 'waterfall', 'bar', 'column', 'pie'];
      }
    }
    
    // Small datasets: good for detailed views
    if (validData.length <= 5) {
      return isPieAppropriate 
        ? ['pie', 'bar', 'column', 'radar', 'gauge', 'funnel']
        : ['bar', 'column', 'radar', 'gauge', 'pie', 'bubble'];
    }
    
    // Medium datasets: versatile options
    if (validData.length <= 12) {
      return isPieAppropriate 
        ? ['bar', 'pie', 'column', 'radar', 'treemap', 'bubble', 'line']
        : ['bar', 'column', 'bubble', 'scatter', 'treemap', 'line', 'pie'];
    }
    
    // Large datasets: focus on patterns and aggregation
    return ['treemap', 'heatmap', 'bar', 'column', 'bubble', 'scatter', 'sunburst'];
  };

  /**
   * Updates chart type and transforms data accordingly
   */
  const handleChartTypeChange = (newChartType: string) => {
    if (onChangeExtractedData && validatedData) {
      const newExtracted = validateAndRepairChartData({
        ...validatedData,
        chartType: newChartType
      });
      onChangeExtractedData(newExtracted);
      return;
    }

    if (setCurrentOutline && slide && validatedData) {
      setCurrentOutline(prev => {
        if (!prev) return null;

        return {
          ...prev,
          slides: prev.slides.map(s => {
            if (s.id !== slide.id) return s;

            const newExtractedData = {
              ...validatedData,
              chartType: newChartType
            };
            const revalidatedData = validateAndRepairChartData(newExtractedData);
            return {
              ...s,
              extractedData: revalidatedData
            };
          })
        };
      });
    }
  };

  /**
   * Updates data for the current slide
   */
  const updateSlideData = (newData: any[]) => {
    if (onChangeExtractedData && validatedData) {
      onChangeExtractedData({
        ...validatedData,
        data: newData
      });
      return;
    }

    if (setCurrentOutline && slide && validatedData) {
      setCurrentOutline(prev => {
        if (!prev) return null;

        return {
          ...prev,
          slides: prev.slides.map(s => {
            if (s.id !== slide.id) return s;

            return {
              ...s,
              extractedData: {
                ...validatedData,
                data: newData
              }
            };
          })
        };
      });
    }
  };

  // Early return if no validated data
  if (!validatedData) {
    return null;
  }

  const compatibleTypes = validatedData.compatibleChartTypes || getCompatibleChartTypes(validatedData);
  const isSeriesChart = ['line', 'scatter', 'bump', 'heatmap'].includes(validatedData.chartType || '');
  const hasValidData = Array.isArray(validatedData.data) && validatedData.data.length > 0;

  return (
    <div className="mt-3 p-2 border border-dashed border-blue-300 dark:border-blue-700 rounded-md bg-blue-50/50 dark:bg-blue-900/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
            <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
          </svg>
          Data Table {validatedData.title ? `(${validatedData.title})` : ''}
        </h4>
        
        {/* Chart Type Selector */}
        <Select value={validatedData.chartType || 'bar'} onValueChange={handleChartTypeChange}>
          <SelectTrigger className="h-6 text-xs px-2 w-auto min-w-[120px]">
            <SelectValue placeholder="Chart Type" />
          </SelectTrigger>
          <SelectContent>
            {compatibleTypes.map(type => {
              const config = CHART_TYPES[type as keyof typeof CHART_TYPES];
              return config ? (
                <SelectItem key={type} value={type} className="text-xs py-1">
                  {config.label}
                </SelectItem>
              ) : null;
            })}
          </SelectContent>
        </Select>
      </div>
      
      {hasValidData ? (
        <div className="overflow-x-auto">
          {isSeriesChart ? (
            <SeriesDataEditor 
              data={validatedData.data}
              activeSeriesIndex={activeSeriesIndex}
              setActiveSeriesIndex={setActiveSeriesIndex}
              onDataChange={updateSlideData}
            />
          ) : (
            <SimpleDataEditor 
              data={validatedData.data}
              chartType={validatedData.chartType}
              onDataChange={updateSlideData}
            />
          )}
        </div>
      ) : (
        <div className="p-2 text-xs text-blue-700 dark:text-blue-400">
          No data available to display
        </div>
      )}
    </div>
  );
};

/**
 * Editor component for series data (line, scatter, bump charts)
 */
interface SeriesDataEditorProps {
  data: any[];
  activeSeriesIndex: number;
  setActiveSeriesIndex: (index: number) => void;
  onDataChange: (newData: any[]) => void;
}

const SeriesDataEditor: React.FC<SeriesDataEditorProps> = ({
  data,
  activeSeriesIndex,
  setActiveSeriesIndex,
  onDataChange
}) => {
  const currentSeries = data[activeSeriesIndex];
  
  const addSeries = () => {
    if (data.length === 0) return;
    
    const newSeries = {
      id: `Series ${data.length + 1}`,
      data: data[0].data?.map(point => ({
        x: point.x,
        y: Math.floor(Math.random() * 50) + 10
      })) || []
    };
    
    const newData = [...data, newSeries];
    onDataChange(newData);
    setActiveSeriesIndex(newData.length - 1);
  };

  const addPoint = () => {
    const pointCount = currentSeries?.data?.length || 0;
    const lastPoint = currentSeries?.data?.[pointCount - 1];
    
    let newX = `Point ${pointCount + 1}`;
    if (lastPoint) {
      if (typeof lastPoint.x === 'number') {
        newX = lastPoint.x + 1;
      } else {
        const match = String(lastPoint.x).match(/(\D*)(\d+)$/);
        if (match) {
          const [, prefix, num] = match;
          newX = `${prefix}${parseInt(num) + 1}`;
        }
      }
    }

    const newData = data.map(series => ({
      ...series,
      data: series.data ? [...series.data, { x: newX, y: Math.floor(Math.random() * 50) + 10 }] : []
    }));
    
    onDataChange(newData);
  };

  const updatePoint = (pointIndex: number, field: 'x' | 'y', value: any) => {
    const newData = [...data];
    
    if (field === 'x') {
      // Update X value across all series
      newData.forEach(series => {
        if (series.data?.[pointIndex]) {
          series.data[pointIndex] = { ...series.data[pointIndex], x: value };
        }
      });
    } else {
      // Update Y value for active series only
      if (newData[activeSeriesIndex]?.data?.[pointIndex]) {
        const newValue = !isNaN(parseFloat(value)) ? parseFloat(value) : value;
        newData[activeSeriesIndex].data[pointIndex] = {
          ...newData[activeSeriesIndex].data[pointIndex],
          y: newValue
        };
      }
    }
    
    onDataChange(newData);
  };

  const removePoint = (pointIndex: number) => {
    const newData = data.map(series => ({
      ...series,
      data: series.data?.filter((_, i) => i !== pointIndex) || []
    }));
    onDataChange(newData);
  };

  return (
    <div>
      {/* Series Controls */}
      <div className="flex items-center justify-between mb-2">
        <Select
          value={String(activeSeriesIndex)}
          onValueChange={(value) => setActiveSeriesIndex(parseInt(value))}
        >
          <SelectTrigger className="h-5 text-[10px] px-2 w-auto">
            <span className="truncate max-w-[80px]">
              {currentSeries?.id || `Series ${activeSeriesIndex + 1}`}
            </span>
          </SelectTrigger>
          <SelectContent>
            {data.map((series, idx) => (
              <SelectItem key={idx} value={String(idx)} className="text-[10px] py-0.5">
                {series.id || `Series ${idx + 1}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button 
          onClick={addSeries}
          className="text-[10px] text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center"
        >
          <Plus className="h-2.5 w-2.5 mr-0.5" /> Add Series
        </button>
      </div>
      
      {/* Data Table */}
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-blue-100/70 dark:bg-blue-800/30">
            <th className="p-1 border border-blue-200 dark:border-blue-700 text-left font-medium text-blue-700 dark:text-blue-300 w-1/2">X Value</th>
            <th className="p-1 border border-blue-200 dark:border-blue-700 text-left font-medium text-blue-700 dark:text-blue-300 w-1/2">Y Value</th>
            <th className="p-0.5 border border-blue-200 dark:border-blue-700 text-center font-medium text-blue-700 dark:text-blue-300 w-6"></th>
          </tr>
        </thead>
        <tbody>
          {currentSeries?.data?.map((point, pointIndex) => (
            <tr key={pointIndex} className={pointIndex % 2 === 0 ? 'bg-white/50 dark:bg-transparent' : 'bg-blue-50/30 dark:bg-blue-900/10'}>
              <td className="p-0.5 border border-blue-200 dark:border-blue-700">
                <input
                  type="text"
                  value={String(point.x)}
                  onChange={(e) => updatePoint(pointIndex, 'x', e.target.value)}
                  className="w-full text-[10px] bg-transparent border-0 p-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 rounded"
                />
              </td>
              <td className="p-0.5 border border-blue-200 dark:border-blue-700">
                <input
                  type="text"
                  value={String(point.y)}
                  onChange={(e) => updatePoint(pointIndex, 'y', e.target.value)}
                  className="w-full text-[10px] bg-transparent border-0 p-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 rounded"
                />
              </td>
              <td className="p-0 border border-blue-200 dark:border-blue-700 text-center">
                <button 
                  onClick={() => removePoint(pointIndex)}
                  className="text-blue-500 hover:text-red-500 dark:text-blue-400 dark:hover:text-red-400"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      <button 
        onClick={addPoint}
        className="text-[10px] text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center mt-1"
      >
        <Plus className="h-2.5 w-2.5 mr-0.5" /> Add Point
      </button>
    </div>
  );
};

/**
 * Editor component for simple data (bar, pie charts)
 */
interface SimpleDataEditorProps {
  data: any[];
  chartType?: string;
  onDataChange: (newData: any[]) => void;
}

const SimpleDataEditor: React.FC<SimpleDataEditorProps> = ({
  data,
  chartType,
  onDataChange
}) => {
  const addRow = () => {
    const newItem = chartType === 'pie' 
      ? { id: `Segment ${data.length + 1}`, label: `Segment ${data.length + 1}`, value: 10 }
      : { name: `Category ${data.length + 1}`, value: 10 };
    
    onDataChange([...data, newItem]);
  };

  const updateRow = (rowIndex: number, field: string, value: any) => {
    const newData = [...data];
    const newValue = (field === 'value' || field === 'y') && !isNaN(parseFloat(value)) ? parseFloat(value) : value;
    
    newData[rowIndex] = { 
      ...newData[rowIndex],
      [field]: newValue,
      ...(chartType === 'pie' && field !== 'value' && field !== 'y' ? { id: newValue, label: newValue } : {})
    };
    
    onDataChange(newData);
  };

  const removeRow = (rowIndex: number) => {
    onDataChange(data.filter((_, i) => i !== rowIndex));
  };

  const getDisplayValue = (row: any) => {
    if (chartType === 'pie') {
      return row.id || row.label || row.name || row.x || 'Segment';
    }
    return row.x || row.name || row.id || 'Category';
  };

  return (
    <div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-blue-100/70 dark:bg-blue-800/30">
            <th className="p-1 border border-blue-200 dark:border-blue-700 text-left font-medium text-blue-700 dark:text-blue-300">
              {chartType === 'pie' ? 'ID/Label' : 'Name'}
            </th>
            <th className="p-1 border border-blue-200 dark:border-blue-700 text-left font-medium text-blue-700 dark:text-blue-300 w-1/3">
              Value
            </th>
            <th className="p-0.5 border border-blue-200 dark:border-blue-700 text-center font-medium text-blue-700 dark:text-blue-300 w-6"></th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white/50 dark:bg-transparent' : 'bg-blue-50/30 dark:bg-blue-900/10'}>
              <td className="p-0.5 border border-blue-200 dark:border-blue-700">
                <input
                  type="text"
                  value={String(getDisplayValue(row))}
                  onChange={(e) => updateRow(rowIndex, chartType === 'pie' ? 'id' : 'name', e.target.value)}
                  className="w-full text-[10px] bg-transparent border-0 p-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 rounded"
                />
              </td>
              <td className="p-0.5 border border-blue-200 dark:border-blue-700">
                <input
                  type="text"
                  value={String(row.value)}
                  onChange={(e) => updateRow(rowIndex, 'value', e.target.value)}
                  className="w-full text-[10px] bg-transparent border-0 p-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 rounded"
                />
              </td>
              <td className="p-0 border border-blue-200 dark:border-blue-700 text-center">
                <button 
                  onClick={() => removeRow(rowIndex)}
                  className="text-blue-500 hover:text-red-500 dark:text-blue-400 dark:hover:text-red-400"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      <button 
        onClick={addRow}
        className="text-[10px] text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center mt-1"
      >
        <Plus className="h-2.5 w-2.5 mr-0.5" /> Add Row
      </button>
    </div>
  );
};

export default ChartDataTable; 