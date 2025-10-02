import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Copy, ChevronsUpDown, Table2, X, Shuffle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import GradientPicker from './GradientPicker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import TableEditor from './TableEditor';
import { DEFAULT_CHART_COLORS, CHART_COLOR_PALETTES } from '@/config/chartColors';
import { transformChartData, getDefaultData } from '../types/DataTransformers';
import { ChartType, ChartDataPoint } from '../types/ChartTypes';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { CirclePlus, CircleMinus } from 'lucide-react';
import { notifyChartPropertyChanged } from '@/charts/utils/ThemeUtils';
import { useTheme } from '@/context/ThemeContext';
import { generateColorPalette } from '@/utils/colorUtils';

// Define ValueInput component outside ChartDataEditor
// This component handles numeric input with proper parsing to prevent string concatenation issues
interface ValueInputProps {
  initialValue: any;
  onChangeCallback: (value: any, immediate?: boolean) => void;
  className?: string;
  // saveComponentToHistory?: (message?: string) => void; // Pass if needed on blur
}

const ValueInput: React.FC<ValueInputProps> = ({ 
  initialValue, 
  onChangeCallback, 
  className = "",
  // saveComponentToHistory
}) => {
  // Use local state for the input value, initialized from prop
  const [inputValue, setInputValue] = useState<string>(() => 
      initialValue === null || initialValue === undefined ? '' : String(initialValue)
  );
  
  // Ref to store the input element
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Update input value if the external value changes (e.g., undo/redo)
  // But not while the input is focused to prevent cursor jumping
  useEffect(() => {
      if (!isFocused) {
        const stringValue = initialValue === null || initialValue === undefined ? '' : String(initialValue);
        // Only update if the external prop is different from the internal state
        if (stringValue !== inputValue) {
            setInputValue(stringValue);
        }
      }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue, isFocused]); // Rerun only when the initialValue prop changes or focus state changes

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value;
      const cursorPos = e.target.selectionStart || 0;
      
      // Update local state
      setInputValue(rawValue);
      
      // Store cursor position to restore after parent update
      if (inputRef.current) {
        const input = inputRef.current;
        // Use microtask to ensure cursor restoration happens after all React updates
        queueMicrotask(() => {
          if (document.activeElement === input) {
            input.setSelectionRange(cursorPos, cursorPos);
          }
        });
      }
      
      // Parse and update parent for real-time chart updates
      if (rawValue === '' || rawValue === '-') {
        onChangeCallback(rawValue, false);
      } else {
        const parsedValue = parseFloat(rawValue);
        if (!isNaN(parsedValue)) {
          onChangeCallback(parsedValue, false);
        } else {
          onChangeCallback(rawValue, false);
        }
      }
  };

  const handleInputBlur = () => {
      setIsFocused(false);
      
      // Parse the final value
      let finalValue: number;
      if (inputValue === '' || inputValue === '-') {
        finalValue = 0;
      } else {
        const parsedValue = parseFloat(inputValue);
        finalValue = isNaN(parsedValue) ? 0 : parsedValue;
      }
      
      // Only trigger update if the value has actually changed
      const initialNumericValue = typeof initialValue === 'number' ? initialValue : parseFloat(initialValue) || 0;
      if (finalValue !== initialNumericValue) {
        onChangeCallback(finalValue, true);
      }
  };
  
  const handleInputFocus = () => {
      setIsFocused(true);
  };

  return (
    <Input
      ref={inputRef}
      type="text" 
      inputMode="numeric"
      pattern="[0-9]*\\.?.*" // Allow decimal points
      value={inputValue}
      onChange={handleInputChange}
      onFocus={handleInputFocus}
      onBlur={handleInputBlur} 
      className={cn("h-7 text-xs px-1 text-right", className)}
      onClick={(e) => e.stopPropagation()} 
      onKeyDown={(e) => {
          if (!/^[0-9.\\-]$/.test(e.key) && 
              !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key)) {
              e.preventDefault();
          }
          if (e.key === 'Enter') {
               handleInputBlur();
               (e.target as HTMLInputElement).blur(); 
          }
      }}
    />
  );
};

// Chart data types - for bar and pie charts
export type ChartDataItem = {
  id: string;
  name: string;
  value: number;
  [key: string]: any;
};

export type ChartSeriesItem = {
  id: string;
  data: { x: string | number; y: number }[];
};

type ChartDataEditorProps = {
  chartType: string; // Make this generic to accept any chart type
  data: any[];
  colors?: string[];
  onChange: (data: any[], colors?: string[]) => void;
  saveComponentToHistory?: (message?: string) => void;
};

const ChartDataEditor: React.FC<ChartDataEditorProps> = ({
  chartType,
  data,
  colors = DEFAULT_CHART_COLORS,
  onChange,
  saveComponentToHistory
}) => {
  const { currentTheme } = useTheme();
  const themeAccent = currentTheme?.accent1 || '#4287f5';
  const getThemePalette = React.useCallback((count: number) => {
    try {
      return generateColorPalette(themeAccent, Math.max(3, Math.min(24, count)));
    } catch {
      return DEFAULT_CHART_COLORS.slice(0, Math.max(3, Math.min(10, count)));
    }
  }, [themeAccent]);
  // Define chart type groups once at the top
  const barPieTypes = ['bar', 'column', 'pie', 'funnel', 'pyramid', 'gauge'];
  const lineSeriesTypes = ['line', 'spline', 'area', 'areaspline', 'scatter', 'bubble', 'radar', 'waterfall', 'boxplot', 'errorbar'];
  const specialTypes = ['heatmap', 'treemap', 'sunburst', 'sankey', 'dependencywheel', 'networkgraph', 'packedbubble', 'streamgraph', 'wordcloud'];
  
  // Track if colors are being updated from the color picker
  const isColorUpdateRef = useRef(false);
  // State for TableEditor dialog
  const [tableEditorOpen, setTableEditorOpen] = useState(false);
  // Removed loading state: editor renders immediately on type change

  // Utility function to scroll to the bottom
  const scrollToBottom = () => {
    setTimeout(() => {
      // Try to find table containers first (more specific targets)
      const tableContainers = document.querySelectorAll('.overflow-auto table tbody');
      if (tableContainers.length > 0) {
        // Get the last table body
        const lastTableBody = tableContainers[tableContainers.length - 1];
        // Get the last row in that tbody
        const lastRow = lastTableBody.querySelector('tr:last-child');
        if (lastRow) {
          // Scroll to the last row with some extra padding at the bottom
          lastRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }
      
      // Fallback to general containers if no tables found
      const containers = document.querySelectorAll('.overflow-auto');
      if (containers.length > 0) {
        // Scroll the deepest container to the bottom
        const deepestContainer = containers[containers.length - 1];
        if (deepestContainer) {
          deepestContainer.scrollTop = deepestContainer.scrollHeight + 100; // Add extra padding
        }
      }
    }, 100); // Longer timeout to ensure DOM is updated
  };

  // Ensure data items have colors and all required properties
  const ensureDataItemsHaveColors = useCallback((dataArr: any[], type: string): any[] => {
    if (!Array.isArray(dataArr) || dataArr.length === 0) return [];
    
    const result = [...dataArr];
    const palette = getThemePalette(result.length || 8);
    
    if (barPieTypes.includes(type)) {
      // Add colors to each data item
      return result.map((item, index) => {
        const colorIndex = index % palette.length;
        const itemWithColor = { ...item };
        
        // Ensure color is set
        if (!itemWithColor.color) {
          itemWithColor.color = palette[colorIndex];
        }
        
        // For pie charts, ensure id and label are set consistently
        if (type === 'pie') {
          if (!itemWithColor.id) {
            itemWithColor.id = itemWithColor.name || `Segment ${index + 1}`;
          }
          if (!itemWithColor.label) {
            itemWithColor.label = itemWithColor.id;
          }
        }
        
        return itemWithColor;
      });
    }
    
    if (lineSeriesTypes.includes(type) || !barPieTypes.includes(type)) {
      // Add colors to each series
      return result.map((series, index) => {
        const colorIndex = index % palette.length;
        const seriesWithColor: any = { ...series };

        // Ensure a color is always present
        if (!seriesWithColor.color) {
          seriesWithColor.color = palette[colorIndex];
        }

        // Guard against missing or invalid `data` arrays which would break the editor
        if (!Array.isArray(seriesWithColor.data) || seriesWithColor.data.length === 0) {
          // If we find "value" on the series itself (e.g. bar → line conversion) convert it to a single point
          if (seriesWithColor.value !== undefined) {
            const numericY = typeof seriesWithColor.value === 'number'
              ? seriesWithColor.value
              : parseFloat(seriesWithColor.value) || 0;

            seriesWithColor.data = [{ x: seriesWithColor.name || seriesWithColor.id || index, y: numericY }];
          } else {
            // Otherwise create a harmless placeholder point so the chart/ editor can render
            seriesWithColor.data = [{ x: 0, y: 0 }];
          }
        } else {
          // Normalise existing data points and ensure numeric y values
          seriesWithColor.data = seriesWithColor.data.map((point: any) => {
            const normalised = { ...point };
            if (typeof normalised.y === 'string') {
              normalised.y = parseFloat(normalised.y) || 0;
            }
            return normalised;
          });
        }

        return seriesWithColor;
      });
    }
    
    return result;
  }, [barPieTypes, lineSeriesTypes]);

  // Initialize localData state with transformed data (includes defaults when empty)
  const [localData, setLocalData] = useState<any[]>(() => {
    const series = transformChartData(data, chartType as ChartType) as any[];
    return ensureDataItemsHaveColors(series, chartType);
  });

  // Extract initial colors based on initial localData or props
  const extractInitialColors = useCallback((sourceData: any[]) => {
    if (!Array.isArray(sourceData) || sourceData.length === 0) return getThemePalette(5);
    const palette = getThemePalette(sourceData.length || 8);
    
    if (barPieTypes.includes(chartType)) {
      return sourceData.map((item, index) => item?.color || palette[index % palette.length]);
    } else if (lineSeriesTypes.includes(chartType) || !barPieTypes.includes(chartType)) {
      return sourceData.map((series, index) => series?.color || palette[index % palette.length]);
    }
    return getThemePalette(5);
  }, [chartType, barPieTypes, lineSeriesTypes, getThemePalette]); // Depend on chartType and groups

  // Initialize localColors state
  const [localColors, setLocalColors] = useState<string[]>(() => {
    if (colors && colors.length > 0) return colors;
    // Initialize based on initial localData state
    return extractInitialColors(localData); 
  });

  // Sync localData from incoming props (transforms include defaults when empty)
  useEffect(() => {
    const series = transformChartData(data, chartType as ChartType) as any[];
    setLocalData(ensureDataItemsHaveColors(series, chartType));
  }, [data, chartType, ensureDataItemsHaveColors]);

  // Sync localColors from props or regenerate from localData
  useEffect(() => {
    // Skip if we're updating colors internally
    if (isColorUpdateRef.current) return;
    
    if (colors && colors.length > 0) {
      // Only update if colors actually changed
      const colorsChanged = JSON.stringify(colors) !== JSON.stringify(localColors);
      if (!colorsChanged) return;
      
      setLocalColors(colors);
      
      // Also update the color properties in the data items/series to keep them in sync
      // This ensures the color pickers show the correct colors
      let dataChanged = false;
      const updatedData = [...localData];

      if (barPieTypes.includes(chartType) && updatedData.length > 0) {
        updatedData.forEach((item, idx) => {
          if (idx < colors.length && item.color !== colors[idx]) {
            item.color = colors[idx];
            dataChanged = true;
          }
        });
      } 
      else if ((lineSeriesTypes.includes(chartType) || !barPieTypes.includes(chartType)) && updatedData.length > 0) {
        updatedData.forEach((series, idx) => {
          if (idx < colors.length && series.color !== colors[idx]) {
            series.color = colors[idx];
            dataChanged = true;
          }
        });
      }

      if (dataChanged) {
        setLocalData(updatedData);
      }
    }
    else setLocalColors(extractInitialColors(localData));
  }, [colors, chartType, barPieTypes, lineSeriesTypes]); // Minimal dependencies to prevent loops

  // For line chart series management
  const [selectedSeries, setSelectedSeries] = useState<number>(0);
  
  // Optimized event handlers with efficient debouncing
  const handleDataChange = useCallback((newData: any[], newColors?: string[], immediate: boolean = false) => {
    // Set local state immediately for responsive UI
    setLocalData(newData);
    if (newColors) {
      setLocalColors(newColors);
    }
    
    // For immediate updates (like color changes), update right away
    if (immediate) {
      onChange(newData, newColors);
      return;
    }
    
    // Clear existing timer 
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Debounce the update to allow smooth animations
    debounceTimerRef.current = setTimeout(() => {
      // Update the chart data after user stops typing
      // This allows Highcharts to animate the change smoothly
      onChange(newData, newColors);
    }, 300); // Wait 300ms after typing stops to update with animation
  }, [onChange]);
  
  // Debounce timer for onChange events
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Optimized data item change handler for bar and pie charts
  const handleItemChange = useCallback((index: number, field: string, value: any, immediate: boolean = false) => {
    // REMOVED: No longer need specific handling for 'label' field if it was present
    if (field === 'label') {
      // If somehow a label change is triggered, ignore it or handle as needed
      console.warn("Attempted to change removed 'label' field directly.");
      return; // Or potentially update 'id' if that's the desired behavior
    }
    
    const newData = [...localData];
    let newColors = localColors; // Initialize with current colors
    
    // Input validation/parsing logic (keep this)
    if (field === 'value' || field === 'y') {
      if (value === '') {
        // Keep value as empty string for local state update
      } else {
        const parsedValue = parseFloat(value);
        value = !isNaN(parsedValue) ? parsedValue : (newData[index]?.[field] || 0); // Use actual number or fallback
      }
    }
    
    // Update the local data structure for immediate UI feedback
    if(newData[index]) {
        newData[index] = { ...newData[index], [field]: value };
    }

    // Update local state immediately
    setLocalData(newData);

    // If color changed, update the localColors array
    if (field === 'color') {
      newColors = [...localColors]; // Create new array copy
      if (index < newColors.length) {
        newColors[index] = value; // Update the specific color
        setLocalColors(newColors); // Update local color state
      }
    }
    
    // Determine if the update to the parent (and chart) should be immediate
    const isImmediateUpdate = immediate || field === 'value' || field === 'y' || field === 'color';

    // Prepare data for parent/chart (ensure numeric fields are numbers)
    const chartData = JSON.parse(JSON.stringify(newData));
    if (chartData[index]) {
        if(field === 'value' || field === 'y') {
            const numericValue = parseFloat(chartData[index][field]) || 0;
            chartData[index][field] = numericValue;
        }
        // Ensure other potential numeric fields are handled if necessary
    }
    
    // Call the parent onChange handler
    handleDataChange(chartData, newColors, isImmediateUpdate);
    
    // --- REMOVED ALL PREVIOUS EMPTY VALUE CHECKS FROM HERE ---

  }, [localData, localColors, handleDataChange, onChange]);

  // Add a new data item for bar and pie charts - optimized for immediate feedback
  const handleAddItem = useCallback(() => {
    // Pick a color for the new item
    const newItemIndex = localData.length;
    const themePalette = getThemePalette(newItemIndex + 1);
    const newItemColor = themePalette[newItemIndex % themePalette.length];
    
    let newItem;
    if (chartType === 'pie') {
      // For Pie, use 'id' for both ID and Label
      const itemId = `Segment ${localData.length + 1}`;
      newItem = { 
        id: itemId, // Set ID 
        value: 10, 
        color: newItemColor,
        // label: itemId // No longer set separate label
      };
    } else {
      // Keep existing logic for other types (e.g., Bar/Radar)
      newItem = { 
        name: `Category ${localData.length + 1}`, 
        value: 10, 
        color: newItemColor 
      };
    }
    
    const newData = [...localData, newItem];
    
    // Use optimized handler with immediate update for responsive UI
    handleDataChange(newData, localColors, true);
    
    // Scroll to the bottom to show the newly added item
    scrollToBottom();
  }, [localData, localColors, chartType, handleDataChange, scrollToBottom]);

  // Remove a data item - optimized for immediate feedback
  const handleRemoveItem = useCallback((index: number) => {
    const newData = localData.filter((_, i) => i !== index);
    
    // Use optimized handler with immediate update for responsive UI
    handleDataChange(newData, localColors, true);
  }, [localData, localColors, handleDataChange]);

  // For line chart: handle point change - Refactored for clarity
  const handlePointChange = useCallback((seriesIndex: number, pointIndex: number, field: string, value: any, immediate: boolean = false) => {
    if (!localData[seriesIndex]?.data?.[pointIndex]) return; // More robust check
    
    const newData = [...localData];
    let updatedValue = value;
    let numericValueForChart: number | null = null; // Store the numeric value separately

    // Update the local state representation (can store string temporarily for input)
    newData[seriesIndex].data[pointIndex] = {
      ...newData[seriesIndex].data[pointIndex],
      [field]: updatedValue
    };
    setLocalData(newData); // Update local state immediately for input feedback

    // Determine the final numeric value for the 'y' field for the chart/parent
    if (field === 'y') {
      if (typeof updatedValue === 'number') {
        numericValueForChart = updatedValue;
      } else if (typeof updatedValue === 'string') {
        const parsed = parseFloat(updatedValue);
        numericValueForChart = isNaN(parsed) ? 0 : parsed; // Default to 0 if parsing fails
      } else {
        numericValueForChart = 0; // Default if not string or number
      }
    }
    
    // Prepare a clean copy of the data for the parent/chart
    // Ensure the 'y' value in this copy is the final numeric value
    const chartData = JSON.parse(JSON.stringify(newData)); 
    if (field === 'y' && numericValueForChart !== null) {
      chartData[seriesIndex].data[pointIndex].y = numericValueForChart;
    }
    
    // Always update without triggering animations during data entry
    onChange(chartData, localColors);
  }, [localData, localColors, onChange]);

  // Add a new point to line chart series
  const handleAddPoint = useCallback((seriesIndex: number) => {
    if (!localData[seriesIndex]?.data) {
      // Initialize data array if it doesn't exist
      const newData = [...localData];
      if (!newData[seriesIndex]) {
        const themePalette = getThemePalette(1);
        newData[seriesIndex] = { id: 'Series A', color: themePalette[0], data: [] };
      }
      if (!newData[seriesIndex].data) {
        newData[seriesIndex].data = [];
      }
      
      // Always use explicit number for y value to avoid type issues
      newData[seriesIndex].data.push({
        x: 'Point 1',
        y: 10  // Explicitly using number primitive, not string
      });
      
      setLocalData(newData);
      onChange(newData, localColors);
      return;
    }
    
    const newData = [...localData];
    const pointCount = newData[seriesIndex].data.length;
    
    // Try to find a common X value that this series doesn't have yet
    // Check other series for existing X values
    let xValue = `Point ${pointCount + 1}`;
    let defaultYValue = 10;
    
    // Look for X values in other series
    let availableXValues = new Set<string | number>();
    
    // Gather all X values from all series
    newData.forEach((series, idx) => {
      if (idx !== seriesIndex && series.data && Array.isArray(series.data)) {
        series.data.forEach(point => {
          availableXValues.add(point.x);
        });
      }
    });
    
    // Convert to array and remove X values that already exist in this series
    const existingXValues = new Set(newData[seriesIndex].data.map(point => point.x));
    const missingXValues = Array.from(availableXValues).filter(x => !existingXValues.has(x));
    
    if (missingXValues.length > 0) {
      // Use the first missing X value
      xValue = String(missingXValues[0]); // Ensure xValue is a string

      // Try to find a corresponding Y value from other series for consistency
      for (const series of newData) {
        if (series.data && Array.isArray(series.data)) {
          const matchingPoint = series.data.find(point => point.x === xValue);
          if (matchingPoint && typeof matchingPoint.y === 'number') {
            defaultYValue = matchingPoint.y;
            break;
          }
        }
      }
    }
    
    // Create point with explicit numeric y value and string x value
    const newPoint: { x: string; y: number } = { // Explicitly type the new point
      x: String(xValue), // Ensure x is always a string for consistency
      y: defaultYValue  // Already ensured this is a number
    };
    newData[seriesIndex].data.push(newPoint);
    
    setLocalData(newData);
    onChange(newData, localColors);
    
    // Scroll to the bottom to show the newly added point
    scrollToBottom();
  }, [localData, localColors, onChange, scrollToBottom]);

  // Remove a point from line chart series
  const handleRemovePoint = useCallback((seriesIndex: number, pointIndex: number) => {
    if (!localData[seriesIndex]?.data) return;
    
    const newData = [...localData];
    newData[seriesIndex].data = newData[seriesIndex].data.filter((_, i) => i !== pointIndex);
    
    setLocalData(newData);
    onChange(newData, localColors);
  }, [localData, localColors, onChange]);

  // Add a new series for line chart
  const handleAddSeries = useCallback(() => {
    const newData = [...localData];
    
    // Get data points from the previous series if available
    let dataPoints = [];
    
    // Find a color different from the previous series
    let newSeriesColor;
    
    if (newData.length > 0) {
      // Get the previous series
      const themePalette = getThemePalette(newData.length + 1);
      newSeriesColor = themePalette[newData.length % themePalette.length];
      
      // If the previous series has data points, duplicate them
      if (prevSeries && Array.isArray(prevSeries.data) && prevSeries.data.length > 0) {
        // Clone data points from previous series
        dataPoints = prevSeries.data.map(point => ({
          x: String(point.x), // Ensure x is string here too
          y: typeof point.y === 'number' ? point.y : 
            (typeof point.y === 'string' ? parseFloat(point.y) || 0 : 0)
        }));
      } else {
        // Fallback to default data points if no previous series data
        dataPoints = [
          { x: 'Jan', y: 20 }, // Ensure x is string here
          { x: 'Feb', y: 30 }, // Ensure x is string here
          { x: 'Mar', y: 10 } // Ensure x is string here
        ];
      }
    } else {
      // For the first series, use the first default color
      newSeriesColor = getThemePalette(1)[0];
      
      // Fallback to default data points if no previous series
      dataPoints = [
        { x: 'Jan', y: 20 }, // Ensure x is string here
        { x: 'Feb', y: 30 }, // Ensure x is string here
        { x: 'Mar', y: 10 } // Ensure x is string here
      ];
    }
    
    // Create new series with the duplicated data points
    newData.push({
      id: `Series ${newData.length + 1}`,
      color: newSeriesColor,
      data: dataPoints
    });
    
    // Deep clone the data to ensure clean data for the chart renderer
    const formattedData = JSON.parse(JSON.stringify(newData));
    
    // Ensure all y values are explicit numbers
    formattedData.forEach(series => {
      if (series.data && Array.isArray(series.data)) {
        series.data.forEach(point => {
          if (point && typeof point === 'object') {
            // Force y to be a number type
            point.y = typeof point.y === 'number' ? point.y : 
              (typeof point.y === 'string' ? parseFloat(point.y) || 0 : 0);
          }
        });
      }
    });
    
    setLocalData(newData);
    onChange(formattedData, localColors);
    setSelectedSeries(newData.length - 1);
    
    // Scroll to show the newly added series
    setTimeout(() => {
      // First try to find selected series and scroll to it
      const seriesDropdown = document.querySelector('.group.bg-primary\\/20');
      if (seriesDropdown) {
        seriesDropdown.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      // Then scroll the data container to the top to show the first point
      scrollToBottom();
    }, 50);
  }, [localData, localColors, onChange, scrollToBottom]);

  // Remove a series from line chart
  const handleRemoveSeries = useCallback((seriesIndex: number) => {
    const newData = localData.filter((_, i) => i !== seriesIndex);
    
    setLocalData(newData);
    onChange(newData, localColors);
    
    if (selectedSeries >= newData.length && newData.length > 0) {
      setSelectedSeries(newData.length - 1);
    }
  }, [localData, localColors, selectedSeries, onChange, setSelectedSeries]);

  // Update series name - with consistent data handling
  const handleSeriesNameChange = useCallback((seriesIndex: number, name: string) => {
    const newData = [...localData];
    newData[seriesIndex] = { ...newData[seriesIndex], id: name };
    
    // Use immediate update
    handleDataChange(newData, localColors, true);
  }, [localData, localColors, handleDataChange]);

  // Handle color change for a specific item/series - optimized
  const handleColorChange = useCallback((index: number, color: string) => {
    isColorUpdateRef.current = true;
    
    const newData = [...localData];
    let newColors = [...localColors];
    
    if (barPieTypes.includes(chartType)) {
      // Update item color
      newData[index] = { ...newData[index], color: color };
      // Update corresponding color in the flat array
      if (index < newColors.length) {
        newColors[index] = color;
      } else {
        // Extend the colors array if needed
        newColors = [...newColors, ...Array(index - newColors.length).fill(undefined), color];
      }
    } else if (lineSeriesTypes.includes(chartType) || !barPieTypes.includes(chartType)) {
      // Update series color
      newData[index] = { ...newData[index], color: color };
      // Update corresponding color in the flat array
      if (index < newColors.length) {
        newColors[index] = color;
      } else {
        // Extend the colors array if needed
        newColors = [...newColors, ...Array(index - newColors.length).fill(undefined), color];
      }
    }
    
    // Update local state immediately
    setLocalData(newData);
    setLocalColors(newColors);
    
    // Use immediate update for color changes
    onChange(newData, newColors);
    
    // Keep the flag set for longer to prevent re-sync
    setTimeout(() => {
      isColorUpdateRef.current = false;
    }, 500); // Increased from 100ms to 500ms
  }, [localData, localColors, chartType, onChange, barPieTypes, lineSeriesTypes]);

  // Main render logic choosing which editor to display
  const renderDataEditor = () => {
    // Determine which editor to use based on chart type
    if (barPieTypes.includes(chartType)) {
      if (chartType === 'pie') {
        return renderPieChartEditor();
      }
      return renderBarPieRadarEditor();
    } else if (lineSeriesTypes.includes(chartType)) {
      // Special handling for bubble charts (has z dimension)
      if (chartType === 'bubble') {
        return renderBubbleChartEditor();
      }
      return renderLineChartEditor();
    } else if (specialTypes.includes(chartType)) {
      // Handle each special type with its own editor
      switch (chartType) {
        case 'heatmap':
        case 'streamgraph':
          // These use series-like data, can use the line editor
          return renderLineChartEditor();
        
        case 'wordcloud':
          return renderWordCloudEditor();
        
        case 'treemap':
        case 'sunburst':
          return renderHierarchicalEditor();
        
        case 'sankey':
        case 'dependencywheel':
        case 'networkgraph':
          return renderNetworkEditor();
        
        case 'packedbubble':
          return renderPackedBubbleEditor();
        
        default:
          // Fallback for any unhandled special types
          return (
            <div className="p-4 text-center text-xs text-muted-foreground">
              <p className="mb-2">This chart type uses a specialized data format.</p>
              <p>Data editing for {chartType} charts is coming soon!</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => {
                  // Reset to default data for this chart type
                  const defaultData = getDefaultData(chartType as ChartType);
                  onChange(defaultData as any[], localColors);
                  saveComponentToHistory?.(`Reset ${chartType} to default data`);
                }}
              >
                Reset to Default Data
              </Button>
            </div>
          );
      }
    } else {
      // For any new or unknown chart types, default to line editor
      // since most charts use series data
      console.warn(`ChartDataEditor: Chart type '${chartType}' using default series editor`);
      return renderLineChartEditor();
    }
  };

  // Render editor for Bar, Pie, Radar charts
  const renderBarPieRadarEditor = useCallback(() => {
    // Now directly uses localData, initialization is handled by useEffect
    const safeData = Array.isArray(localData) ? localData : []; 
    
    return (
      <div className="flex flex-col">
        <div className="flex justify-between items-center mb-2">
          <h4 className="text-xs font-medium text-muted-foreground">Chart Data</h4>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 px-2 text-xs flex items-center gap-1 mr-1"
            onClick={() => setTableEditorOpen(true)}
          >
            <Table2 className="h-3.5 w-3.5 mr-0.5" />
            Edit in Table
          </Button>
        </div>

        <div className="flex-grow overflow-auto" style={{ maxHeight: '250px' }}>
          <Table className="min-w-full">
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow className="text-[11px] border-b-0">
                <TableHead className="h-7 p-1 pl-2">Name</TableHead>
                <TableHead className="h-7 p-1 text-center w-[70px]">Value</TableHead>
                <TableHead className="h-7 p-1 text-center w-[32px]">Color</TableHead>
                <TableHead className="h-7 p-0 w-[20px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {safeData.map((item, index) => (
                <TableRow key={index} className="border-b-0 hover:bg-muted/30 group">
                  <TableCell className="p-1 py-1">
                    <Input
                      value={item.name || ''}
                      onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                      className="h-7 text-xs py-1 px-2 bg-transparent text-foreground placeholder:text-muted-foreground"
                    />
                  </TableCell>
                  <TableCell className="px-1 py-1 w-20">
                    {/* Use the new ValueInput component */}
                    <ValueInput 
                        initialValue={item.value} 
                        onChangeCallback={(value, immediate) => handleItemChange(index, 'value', value, immediate)}
                        // saveComponentToHistory={saveComponentToHistory} // Pass if needed
                    />
                  </TableCell>
                  <TableCell className="p-1 py-1 text-center">
                    <Popover>
                      <PopoverTrigger asChild>
                        <div 
                          className="w-7 h-7 rounded-sm border cursor-pointer mx-auto flex items-center justify-center hover:border-primary" 
                          style={{ 
                            backgroundImage: `
                              linear-gradient(45deg, #ccc 25%, transparent 25%),
                              linear-gradient(-45deg, #ccc 25%, transparent 25%),
                              linear-gradient(45deg, transparent 75%, #ccc 75%),
                              linear-gradient(-45deg, transparent 75%, #ccc 75%)
                            `,
                            backgroundSize: "8px 8px",
                            backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
                            backgroundColor: "#fff"
                          }}
                          onClick={() => saveComponentToHistory?.("Saved initial color state")}
                        >
                          <div 
                            className="w-6 h-6 rounded-sm" 
                            style={{
                              backgroundColor: item.color || localColors[index % Math.max(1, localColors.length)]
                            }}
                          />
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="p-0" onClick={(e) => e.stopPropagation()}>
                        <div onClick={(e) => e.stopPropagation()}>
                          <GradientPicker
                            value={item.color || localColors[index % Math.max(1, localColors.length)]} 
                            onChange={color => handleItemChange(index, 'color', color)}
                            onChangeComplete={() => saveComponentToHistory?.("Saved final color state")}
                            forceMode="solid"
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                  <TableCell className="p-0 pr-1">
                    <button
                      onClick={() => handleRemoveItem(index)}
                      disabled={safeData.length <= 1}
                      className="opacity-0 group-hover:opacity-100 h-4 w-4 inline-flex items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:pointer-events-none transition-opacity"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        
        <div className="flex justify-center mt-2">
          <button 
            className="text-xs text-muted-foreground hover:text-primary flex items-center justify-center transition-colors py-1"
            onClick={handleAddItem}
          >
            <Plus className="h-3 w-3 mr-1" />
            <span>Add item</span>
          </button>
        </div>
      </div>
    );
  }, [localData, handleItemChange, handleAddItem, handleRemoveItem, saveComponentToHistory, setTableEditorOpen]);
  
  // Function to render pie chart data editor
  const renderPieChartEditor = useCallback(() => {
    const safeData = Array.isArray(localData) ? localData : []; 
    
    return (
      <div className="flex flex-col">
        <div className="flex justify-between items-center mb-2">
          <h4 className="text-xs font-medium text-muted-foreground">Chart Data</h4>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 px-2 text-xs flex items-center gap-1 mr-1"
            onClick={() => setTableEditorOpen(true)}
          >
            <Table2 className="h-3.5 w-3.5 mr-0.5" />
            Edit in Table
          </Button>
        </div>

        <div className="flex-grow overflow-auto" style={{ maxHeight: '250px' }}>
          <Table className="min-w-full">
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow className="text-[11px] border-b-0">
                {/* Combine ID and Label into one column */}
                <TableHead className="h-7 p-1 pl-2">ID / Label</TableHead>
                <TableHead className="h-7 p-1 text-center w-[70px]">Value</TableHead>
                <TableHead className="h-7 p-1 text-center w-[32px]">Color</TableHead>
                <TableHead className="h-7 p-0 w-[20px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {safeData.map((item, index) => (
                <TableRow key={index} className="border-b-0 hover:bg-muted/30 group">
                  <TableCell className="p-1 py-1">
                    <Input
                      value={item.id || ''}
                      onChange={(e) => {
                        // Only update ID, remove label syncing logic
                        handleItemChange(index, 'id', e.target.value);
                      }}
                      className="h-7 text-xs py-1 px-2 bg-transparent text-foreground placeholder:text-muted-foreground"
                    />
                  </TableCell>
                  <TableCell className="px-1 py-1 w-20">
                    {/* Use the new ValueInput component */}
                    <ValueInput 
                        initialValue={item.value} 
                        onChangeCallback={(value, immediate) => handleItemChange(index, 'value', value, immediate)}
                        // saveComponentToHistory={saveComponentToHistory} // Pass if needed
                    />
                  </TableCell>
                  <TableCell className="p-1 py-1 text-center">
                    <Popover>
                      <PopoverTrigger asChild>
                        <div 
                          className="w-7 h-7 rounded-sm border cursor-pointer mx-auto flex items-center justify-center hover:border-primary" 
                          style={{ 
                            backgroundImage: `
                              linear-gradient(45deg, #ccc 25%, transparent 25%),
                              linear-gradient(-45deg, #ccc 25%, transparent 25%),
                              linear-gradient(45deg, transparent 75%, #ccc 75%),
                              linear-gradient(-45deg, transparent 75%, #ccc 75%)
                            `,
                            backgroundSize: "8px 8px",
                            backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
                            backgroundColor: "#fff"
                          }}
                          onClick={() => saveComponentToHistory?.("Saved initial color state")}
                        >
                          <div 
                            className="w-6 h-6 rounded-sm" 
                            style={{
                              backgroundColor: item.color || localColors[index % Math.max(1, localColors.length)]
                            }}
                          />
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="p-0" onClick={(e) => e.stopPropagation()}>
                        <div onClick={(e) => e.stopPropagation()}>
                          <GradientPicker
                            value={item.color || localColors[index % Math.max(1, localColors.length)]} 
                            onChange={color => handleItemChange(index, 'color', color)}
                            onChangeComplete={() => saveComponentToHistory?.("Saved final color state")}
                            forceMode="solid"
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                  <TableCell className="p-0 pr-1">
                    <button
                      onClick={() => handleRemoveItem(index)}
                      disabled={safeData.length <= 1}
                      className="opacity-0 group-hover:opacity-100 h-4 w-4 inline-flex items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:pointer-events-none transition-opacity"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        
        <div className="flex justify-center mt-2">
          <button 
            className="text-xs text-muted-foreground hover:text-primary flex items-center justify-center transition-colors py-1"
            onClick={handleAddItem}
          >
            <Plus className="h-3 w-3 mr-1" />
            <span>Add item</span>
          </button>
        </div>
      </div>
    );
  }, [localData, handleItemChange, handleAddItem, handleRemoveItem, saveComponentToHistory, setTableEditorOpen]);
  
  // Function to render line chart data editor
  const renderLineChartEditor = useCallback(() => {
    // Combined check for empty data OR invalid selected series index
    if (
        !Array.isArray(localData) || 
        localData.length === 0 || 
        selectedSeries < 0 || // Ensure selectedSeries is not negative
        selectedSeries >= localData.length // Ensure selectedSeries is within bounds
    ) {
        // If selectedSeries is out of bounds after data load, attempt to reset it
        if (localData.length > 0 && selectedSeries >= localData.length) {
             // Schedule state update after render
             setTimeout(() => setSelectedSeries(Math.max(0, localData.length - 1)), 0);
        }
        // Show a generic placeholder while data/selection stabilizes
        return <div className="p-4 text-center text-xs text-muted-foreground">Initializing data editor...</div>; 
    }
    
    // If we pass the checks, selectedSeries is valid for the current localData
    const currentSeries = localData[selectedSeries];
    
    // Enhanced check for valid XY series structure
    const isValidSeriesStructure = 
        currentSeries && 
        typeof currentSeries === 'object' && 
        Array.isArray(currentSeries.data) &&
        currentSeries.data.length > 0 &&
        typeof currentSeries.data[0] === 'object' &&
        currentSeries.data[0] !== null && // Check for null explicitly
        'x' in currentSeries.data[0] &&
        'y' in currentSeries.data[0];
    
    if (!isValidSeriesStructure) {
        console.error(
            "ChartDataEditor (renderLineChartEditor): Invalid or incompatible series data structure detected for selected series.", 
            { selectedSeries, currentSeriesData: currentSeries }
        );
        // Return placeholder or a specific error message, avoid crashing
        return <div className="p-4 text-center text-xs text-muted-foreground">Initializing data editor or invalid data format...</div>; 
    }

    // We have valid localData and a valid currentSeries with XY data points
    const dataPoints = currentSeries.data;

    return (
      <div className="space-y-3">
        {/* Series Selection Dropdown */}
        {localData.length > 1 && (
          <div className="flex items-center justify-between mb-2 bg-muted/20 p-1.5 rounded-md border border-border/30">
            <div className="flex items-center gap-1">
              <select 
                className="h-6 text-xs border border-input rounded-md bg-background px-1 w-[100px]"
                value={selectedSeries}
                onChange={(e) => {
                  setSelectedSeries(parseInt(e.target.value));
                  onChange(localData, localColors);
                }}
              >
                {localData.map((series, index) => (
                  <option key={index} value={index}>
                    {series.id || `Series ${index + 1}`}
                  </option>
                ))}
              </select>
              
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 p-0 min-w-0"
                title="Add Series"
                onClick={handleAddSeries}
              >
                <Plus className="h-3 w-3" />
              </Button>
              
              {/* Color picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <div 
                    className="w-5 h-5 rounded-sm border cursor-pointer hover:border-primary" 
                    style={{ 
                      backgroundColor: currentSeries.color || localColors[selectedSeries % Math.max(1, localColors.length)]
                    }}
                    onClick={() => saveComponentToHistory?.("Saved initial series color state")}
                  />
                </PopoverTrigger>
                <PopoverContent className="p-0" onClick={(e) => e.stopPropagation()}>
                  <div onClick={(e) => e.stopPropagation()}>
                    <GradientPicker
                      value={currentSeries.color || localColors[selectedSeries % Math.max(1, localColors.length)]} 
                      onChange={color => {
                        const newData = [...localData];
                        newData[selectedSeries] = {
                          ...newData[selectedSeries],
                          color: color
                        };
                        
                        // Update colors array with all series colors
                        const newColors = newData.map((series, index) => 
                            series.color || localColors[index % Math.max(1, localColors.length)]
                        );
                        setLocalColors(newColors);
                        
                        setLocalData(newData);
                        onChange(newData, newColors);
                        saveComponentToHistory?.("Updated series color");
                      }}
                      onChangeComplete={() => saveComponentToHistory?.("Saved final series color state")}
                      forceMode="solid"
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 p-0 min-w-0"
                title="Edit Series Name"
                onClick={() => {
                  // Create a custom input dialog using DOM
                  const dialog = document.createElement('div');
                  dialog.style.position = 'fixed';
                  dialog.style.top = '0';
                  dialog.style.left = '0';
                  dialog.style.right = '0';
                  dialog.style.bottom = '0';
                  dialog.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
                  dialog.style.display = 'flex';
                  dialog.style.alignItems = 'center';
                  dialog.style.justifyContent = 'center';
                  dialog.style.zIndex = '9999';
                  
                  const input = document.createElement('input');
                  input.type = 'text';
                  input.value = currentSeries.id || '';
                  input.style.padding = '8px';
                  input.style.borderRadius = '4px';
                  input.style.border = 'none';
                  input.style.width = '250px';
                  
                  dialog.appendChild(input);
                  document.body.appendChild(dialog);
                  
                  input.focus();
                  
                  input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                      handleSeriesNameChange(selectedSeries, input.value);
                      document.body.removeChild(dialog);
                    } else if (e.key === 'Escape') {
                      document.body.removeChild(dialog);
                    }
                  });
                  
                  dialog.addEventListener('click', (e) => {
                    if (e.target === dialog) {
                      document.body.removeChild(dialog);
                    }
                  });
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                </svg>
              </Button>
              
              {localData.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 p-0 min-w-0 text-destructive"
                  title="Remove Series"
                  onClick={() => handleRemoveSeries(selectedSeries)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        )}
        
        <div className="flex-grow overflow-auto" style={{ maxHeight: '250px' }}>
          <Table className="min-w-full">
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow className="text-[11px] border-b-0">
                <TableHead className="h-7 p-1 pl-2">X Value</TableHead>
                <TableHead className="h-7 p-1 text-center w-[70px]">Y Value</TableHead>
                <TableHead className="h-7 p-0 w-[20px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dataPoints.map((point, pointIndex) => (
                <TableRow key={pointIndex} className="border-b-0 hover:bg-muted/30 group">
                  <TableCell className="p-1 py-1">
                    <Input
                      value={point.x || ''}
                      onChange={(e) => handlePointChange(selectedSeries, pointIndex, 'x', e.target.value)}
                      className="h-7 text-xs py-1.5 px-3 bg-transparent border-input hover:border-primary focus:border-primary rounded-sm"
                    />
                  </TableCell>
                  <TableCell className="px-1 py-1 w-16">
                    {/* Use the new ValueInput component */}
                    <ValueInput 
                        initialValue={point.y} 
                        onChangeCallback={(value, immediate) => handlePointChange(selectedSeries, pointIndex, 'y', value, immediate)} 
                        // saveComponentToHistory={saveComponentToHistory} // Pass if needed
                    />
                  </TableCell>
                  <TableCell className="p-0 pr-1">
                    <button
                      onClick={() => handleRemovePoint(selectedSeries, pointIndex)}
                      disabled={dataPoints.length <= 1}
                      className="opacity-0 group-hover:opacity-100 h-4 w-4 inline-flex items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:pointer-events-none transition-opacity"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-center mt-2">
          <button 
            className="text-xs text-muted-foreground hover:text-primary flex items-center justify-center transition-colors py-1"
            onClick={() => handleAddPoint(selectedSeries)}
          >
            <Plus className="h-3 w-3 mr-1" />
            <span>Add point</span>
          </button>
        </div>
      </div>
    );
  }, [localData, selectedSeries, setSelectedSeries, handleAddSeries, handleRemoveSeries, handleSeriesNameChange, handleAddPoint, handlePointChange, handleRemovePoint, saveComponentToHistory, setTableEditorOpen]);

  // Render editor for bubble charts (with z dimension)
  const renderBubbleChartEditor = useCallback(() => {
    if (!Array.isArray(localData) || localData.length === 0) {
      return <div className="p-4 text-center text-xs text-muted-foreground">Initializing data editor...</div>;
    }

    const currentSeries = localData[selectedSeries];
    if (!currentSeries?.data) {
      return <div className="p-4 text-center text-xs text-muted-foreground">Invalid data format</div>;
    }

    return (
      <div className="space-y-3">
        {/* Series Selection */}
        {localData.length > 1 && (
          <div className="flex items-center justify-between mb-2 bg-muted/20 p-1.5 rounded-md border border-border/30">
            <select 
              className="h-6 text-xs border border-input rounded-md bg-background px-1 w-[100px]"
              value={selectedSeries}
              onChange={(e) => setSelectedSeries(parseInt(e.target.value))}
            >
              {localData.map((series, index) => (
                <option key={index} value={index}>
                  {series.id || `Series ${index + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex-grow overflow-auto" style={{ maxHeight: '250px' }}>
          <Table className="min-w-full">
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow className="text-[11px] border-b-0">
                <TableHead className="h-7 p-1 pl-2">Name</TableHead>
                <TableHead className="h-7 p-1 text-center w-[60px]">X</TableHead>
                <TableHead className="h-7 p-1 text-center w-[60px]">Y</TableHead>
                <TableHead className="h-7 p-1 text-center w-[60px]">Size (Z)</TableHead>
                <TableHead className="h-7 p-0 w-[20px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentSeries.data.map((point: any, pointIndex: number) => (
                <TableRow key={pointIndex} className="border-b-0 hover:bg-muted/30 group">
                  <TableCell className="p-1 py-1">
                    <Input
                      value={point.name || ''}
                      onChange={(e) => {
                        const newData = [...localData];
                        newData[selectedSeries].data[pointIndex] = {
                          ...newData[selectedSeries].data[pointIndex],
                          name: e.target.value
                        };
                        handleDataChange(newData, localColors);
                      }}
                      className="h-7 text-xs py-1 px-2"
                    />
                  </TableCell>
                  <TableCell className="px-1 py-1">
                    <ValueInput 
                      initialValue={point.x} 
                      onChangeCallback={(value, immediate) => {
                        const newData = [...localData];
                        newData[selectedSeries].data[pointIndex] = {
                          ...newData[selectedSeries].data[pointIndex],
                          x: value
                        };
                        handleDataChange(newData, localColors, immediate);
                      }}
                    />
                  </TableCell>
                  <TableCell className="px-1 py-1">
                    <ValueInput 
                      initialValue={point.y} 
                      onChangeCallback={(value, immediate) => {
                        const newData = [...localData];
                        newData[selectedSeries].data[pointIndex] = {
                          ...newData[selectedSeries].data[pointIndex],
                          y: value
                        };
                        handleDataChange(newData, localColors, immediate);
                      }}
                    />
                  </TableCell>
                  <TableCell className="px-1 py-1">
                    <ValueInput 
                      initialValue={point.z || 10} 
                      onChangeCallback={(value, immediate) => {
                        const newData = [...localData];
                        newData[selectedSeries].data[pointIndex] = {
                          ...newData[selectedSeries].data[pointIndex],
                          z: value
                        };
                        handleDataChange(newData, localColors, immediate);
                      }}
                    />
                  </TableCell>
                  <TableCell className="p-0 pr-1">
                    <button
                      onClick={() => handleRemovePoint(selectedSeries, pointIndex)}
                      disabled={currentSeries.data.length <= 1}
                      className="opacity-0 group-hover:opacity-100 h-4 w-4 inline-flex items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:pointer-events-none transition-opacity"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-center mt-2">
          <button 
            className="text-xs text-muted-foreground hover:text-primary flex items-center justify-center transition-colors py-1"
            onClick={() => {
              const newData = [...localData];
              newData[selectedSeries].data.push({
                name: `Point ${newData[selectedSeries].data.length + 1}`,
                x: 50,
                y: 50,
                z: 10
              });
              handleDataChange(newData, localColors, true);
              scrollToBottom();
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            <span>Add point</span>
          </button>
        </div>
      </div>
    );
  }, [localData, selectedSeries, localColors, handleDataChange, handleRemovePoint, scrollToBottom]);

  // Render editor for word cloud charts
  const renderWordCloudEditor = useCallback(() => {
    const safeData = localData[0]?.data || [];

    return (
      <div className="flex flex-col">
        <h4 className="text-xs font-medium text-muted-foreground mb-2">Word Cloud Data</h4>
        
        <div className="flex-grow overflow-auto" style={{ maxHeight: '250px' }}>
          <Table className="min-w-full">
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow className="text-[11px] border-b-0">
                <TableHead className="h-7 p-1 pl-2">Word</TableHead>
                <TableHead className="h-7 p-1 text-center w-[70px]">Weight</TableHead>
                <TableHead className="h-7 p-0 w-[20px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {safeData.map((item: any, index: number) => (
                <TableRow key={index} className="border-b-0 hover:bg-muted/30 group">
                  <TableCell className="p-1 py-1">
                    <Input
                      value={item.name || ''}
                      onChange={(e) => {
                        const newData = [...localData];
                        newData[0].data[index] = { ...newData[0].data[index], name: e.target.value };
                        handleDataChange(newData, localColors);
                      }}
                      className="h-7 text-xs py-1 px-2"
                    />
                  </TableCell>
                  <TableCell className="px-1 py-1">
                    <ValueInput 
                      initialValue={item.weight} 
                      onChangeCallback={(value, immediate) => {
                        const newData = [...localData];
                        newData[0].data[index] = { ...newData[0].data[index], weight: value };
                        handleDataChange(newData, localColors, immediate);
                      }}
                    />
                  </TableCell>
                  <TableCell className="p-0 pr-1">
                    <button
                      onClick={() => {
                        const newData = [...localData];
                        newData[0].data = newData[0].data.filter((_: any, i: number) => i !== index);
                        handleDataChange(newData, localColors, true);
                      }}
                      disabled={safeData.length <= 1}
                      className="opacity-0 group-hover:opacity-100 h-4 w-4 inline-flex items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:pointer-events-none transition-opacity"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-center mt-2">
          <button 
            className="text-xs text-muted-foreground hover:text-primary flex items-center justify-center transition-colors py-1"
            onClick={() => {
              const newData = [...localData];
              if (!newData[0]) newData[0] = { id: 'Words', data: [] };
              newData[0].data.push({ name: 'New Word', weight: 10 });
              handleDataChange(newData, localColors, true);
              scrollToBottom();
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            <span>Add word</span>
          </button>
        </div>
      </div>
    );
  }, [localData, localColors, handleDataChange, scrollToBottom]);

  // Render editor for hierarchical charts (treemap, sunburst)
  const renderHierarchicalEditor = useCallback(() => {
    const safeData = localData[0]?.data || [];

    return (
      <div className="flex flex-col">
        <h4 className="text-xs font-medium text-muted-foreground mb-2">Hierarchical Data</h4>
        
        <div className="flex-grow overflow-auto" style={{ maxHeight: '250px' }}>
          <Table className="min-w-full">
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow className="text-[11px] border-b-0">
                <TableHead className="h-7 p-1 pl-2">ID</TableHead>
                <TableHead className="h-7 p-1">Name</TableHead>
                <TableHead className="h-7 p-1">Parent</TableHead>
                <TableHead className="h-7 p-1 text-center w-[60px]">Value</TableHead>
                <TableHead className="h-7 p-0 w-[20px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {safeData.map((item: any, index: number) => (
                <TableRow key={index} className="border-b-0 hover:bg-muted/30 group">
                  <TableCell className="p-1 py-1">
                    <Input
                      value={item.id || ''}
                      onChange={(e) => {
                        const newData = [...localData];
                        newData[0].data[index] = { ...newData[0].data[index], id: e.target.value };
                        handleDataChange(newData, localColors);
                      }}
                      className="h-7 text-xs py-1 px-2"
                    />
                  </TableCell>
                  <TableCell className="p-1 py-1">
                    <Input
                      value={item.name || ''}
                      onChange={(e) => {
                        const newData = [...localData];
                        newData[0].data[index] = { ...newData[0].data[index], name: e.target.value };
                        handleDataChange(newData, localColors);
                      }}
                      className="h-7 text-xs py-1 px-2"
                    />
                  </TableCell>
                  <TableCell className="p-1 py-1">
                    <Input
                      value={item.parent || ''}
                      onChange={(e) => {
                        const newData = [...localData];
                        newData[0].data[index] = { ...newData[0].data[index], parent: e.target.value };
                        handleDataChange(newData, localColors);
                      }}
                      className="h-7 text-xs py-1 px-2"
                      placeholder="(root)"
                    />
                  </TableCell>
                  <TableCell className="px-1 py-1">
                    <ValueInput 
                      initialValue={item.value || 0} 
                      onChangeCallback={(value, immediate) => {
                        const newData = [...localData];
                        newData[0].data[index] = { ...newData[0].data[index], value: value };
                        handleDataChange(newData, localColors, immediate);
                      }}
                    />
                  </TableCell>
                  <TableCell className="p-0 pr-1">
                    <button
                      onClick={() => {
                        const newData = [...localData];
                        newData[0].data = newData[0].data.filter((_: any, i: number) => i !== index);
                        handleDataChange(newData, localColors, true);
                      }}
                      disabled={safeData.length <= 1}
                      className="opacity-0 group-hover:opacity-100 h-4 w-4 inline-flex items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:pointer-events-none transition-opacity"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-center mt-2">
          <button 
            className="text-xs text-muted-foreground hover:text-primary flex items-center justify-center transition-colors py-1"
            onClick={() => {
              const newData = [...localData];
              if (!newData[0]) newData[0] = { id: 'Root', data: [] };
              const newId = `item-${Date.now()}`;
              newData[0].data.push({ 
                id: newId, 
                name: 'New Item', 
                parent: '', 
                value: 10 
              });
              handleDataChange(newData, localColors, true);
              scrollToBottom();
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            <span>Add item</span>
          </button>
        </div>
      </div>
    );
  }, [localData, localColors, handleDataChange, scrollToBottom]);

  // Render editor for network/flow charts (sankey, dependency wheel, network graph)
  const renderNetworkEditor = useCallback(() => {
    const safeData = localData[0]?.data || [];

    return (
      <div className="flex flex-col">
        <h4 className="text-xs font-medium text-muted-foreground mb-2">Network/Flow Data</h4>
        
        <div className="flex-grow overflow-auto" style={{ maxHeight: '250px' }}>
          <Table className="min-w-full">
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow className="text-[11px] border-b-0">
                <TableHead className="h-7 p-1 pl-2">From</TableHead>
                <TableHead className="h-7 p-1">To</TableHead>
                <TableHead className="h-7 p-1 text-center w-[70px]">Weight</TableHead>
                <TableHead className="h-7 p-0 w-[20px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {safeData.map((item: any, index: number) => {
                // Handle both object format and array format
                const from = Array.isArray(item) ? item[0] : item.from;
                const to = Array.isArray(item) ? item[1] : item.to;
                const weight = Array.isArray(item) ? item[2] : item.weight;

                return (
                  <TableRow key={index} className="border-b-0 hover:bg-muted/30 group">
                    <TableCell className="p-1 py-1">
                      <Input
                        value={from || ''}
                        onChange={(e) => {
                          const newData = [...localData];
                          if (Array.isArray(newData[0].data[index])) {
                            newData[0].data[index][0] = e.target.value;
                          } else {
                            newData[0].data[index] = { ...newData[0].data[index], from: e.target.value };
                          }
                          handleDataChange(newData, localColors);
                        }}
                        className="h-7 text-xs py-1 px-2"
                      />
                    </TableCell>
                    <TableCell className="p-1 py-1">
                      <Input
                        value={to || ''}
                        onChange={(e) => {
                          const newData = [...localData];
                          if (Array.isArray(newData[0].data[index])) {
                            newData[0].data[index][1] = e.target.value;
                          } else {
                            newData[0].data[index] = { ...newData[0].data[index], to: e.target.value };
                          }
                          handleDataChange(newData, localColors);
                        }}
                        className="h-7 text-xs py-1 px-2"
                      />
                    </TableCell>
                    <TableCell className="px-1 py-1">
                      <ValueInput 
                        initialValue={weight || 1} 
                        onChangeCallback={(value, immediate) => {
                          const newData = [...localData];
                          if (Array.isArray(newData[0].data[index])) {
                            newData[0].data[index][2] = value;
                          } else {
                            newData[0].data[index] = { ...newData[0].data[index], weight: value };
                          }
                          handleDataChange(newData, localColors, immediate);
                        }}
                      />
                    </TableCell>
                    <TableCell className="p-0 pr-1">
                      <button
                        onClick={() => {
                          const newData = [...localData];
                          newData[0].data = newData[0].data.filter((_: any, i: number) => i !== index);
                          handleDataChange(newData, localColors, true);
                        }}
                        disabled={safeData.length <= 1}
                        className="opacity-0 group-hover:opacity-100 h-4 w-4 inline-flex items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:pointer-events-none transition-opacity"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-center mt-2">
          <button 
            className="text-xs text-muted-foreground hover:text-primary flex items-center justify-center transition-colors py-1"
            onClick={() => {
              const newData = [...localData];
              if (!newData[0]) newData[0] = { id: 'Network', data: [] };
              // Use object format for new items
              newData[0].data.push({ 
                from: 'Source', 
                to: 'Target', 
                weight: 1 
              });
              handleDataChange(newData, localColors, true);
              scrollToBottom();
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            <span>Add connection</span>
          </button>
        </div>
      </div>
    );
  }, [localData, localColors, handleDataChange, scrollToBottom]);

  // Render editor for packed bubble charts
  const renderPackedBubbleEditor = useCallback(() => {
    return (
      <div className="space-y-3">
        {/* Group Selection */}
        <div className="flex items-center justify-between mb-2 bg-muted/20 p-1.5 rounded-md border border-border/30">
          <select 
            className="h-6 text-xs border border-input rounded-md bg-background px-1 w-[100px]"
            value={selectedSeries}
            onChange={(e) => setSelectedSeries(parseInt(e.target.value))}
          >
            {localData.map((group, index) => (
              <option key={index} value={index}>
                {group.id || `Group ${index + 1}`}
              </option>
            ))}
          </select>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 p-0 min-w-0"
              title="Add Group"
              onClick={() => {
                const newData = [...localData];
                newData.push({
                  id: `Group ${newData.length + 1}`,
                  color: getThemePalette(newData.length + 1)[newData.length % getThemePalette(newData.length + 1).length],
                  data: [{ name: 'Item 1', value: 50 }]
                });
                handleDataChange(newData, localColors, true);
                setSelectedSeries(newData.length - 1);
              }}
            >
              <Plus className="h-3 w-3" />
            </Button>
            
            {localData.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 p-0 min-w-0 text-destructive"
                title="Remove Group"
                onClick={() => {
                  const newData = localData.filter((_, i) => i !== selectedSeries);
                  handleDataChange(newData, localColors, true);
                  if (selectedSeries >= newData.length) {
                    setSelectedSeries(Math.max(0, newData.length - 1));
                  }
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex-grow overflow-auto" style={{ maxHeight: '250px' }}>
          <Table className="min-w-full">
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow className="text-[11px] border-b-0">
                <TableHead className="h-7 p-1 pl-2">Name</TableHead>
                <TableHead className="h-7 p-1 text-center w-[70px]">Value</TableHead>
                <TableHead className="h-7 p-0 w-[20px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(localData[selectedSeries]?.data || []).map((item: any, index: number) => (
                <TableRow key={index} className="border-b-0 hover:bg-muted/30 group">
                  <TableCell className="p-1 py-1">
                    <Input
                      value={item.name || ''}
                      onChange={(e) => {
                        const newData = [...localData];
                        newData[selectedSeries].data[index] = { 
                          ...newData[selectedSeries].data[index], 
                          name: e.target.value 
                        };
                        handleDataChange(newData, localColors);
                      }}
                      className="h-7 text-xs py-1 px-2"
                    />
                  </TableCell>
                  <TableCell className="px-1 py-1">
                    <ValueInput 
                      initialValue={item.value} 
                      onChangeCallback={(value, immediate) => {
                        const newData = [...localData];
                        newData[selectedSeries].data[index] = { 
                          ...newData[selectedSeries].data[index], 
                          value: value 
                        };
                        handleDataChange(newData, localColors, immediate);
                      }}
                    />
                  </TableCell>
                  <TableCell className="p-0 pr-1">
                    <button
                      onClick={() => {
                        const newData = [...localData];
                        newData[selectedSeries].data = newData[selectedSeries].data.filter(
                          (_: any, i: number) => i !== index
                        );
                        handleDataChange(newData, localColors, true);
                      }}
                      disabled={localData[selectedSeries]?.data?.length <= 1}
                      className="opacity-0 group-hover:opacity-100 h-4 w-4 inline-flex items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:pointer-events-none transition-opacity"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-center mt-2">
          <button 
            className="text-xs text-muted-foreground hover:text-primary flex items-center justify-center transition-colors py-1"
            onClick={() => {
              const newData = [...localData];
              if (!newData[selectedSeries].data) newData[selectedSeries].data = [];
              newData[selectedSeries].data.push({ 
                name: `Item ${newData[selectedSeries].data.length + 1}`, 
                value: 50 
              });
              handleDataChange(newData, localColors, true);
              scrollToBottom();
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            <span>Add item</span>
          </button>
        </div>
      </div>
    );
  }, [localData, selectedSeries, localColors, handleDataChange, scrollToBottom]);

  return (
    <div className="w-full">
      {renderDataEditor()}

      {/* Table Editor Dialog */}
      <TableEditor
        open={tableEditorOpen}
        onOpenChange={setTableEditorOpen}
        chartType={chartType as 'bar' | 'pie' | 'line' | 'radar' | 'scatter' | 'bump' | 'heatmap'}
        data={localData}
        onChange={(newData) => {
          setLocalData(newData);
          onChange(newData, localColors);
        }}
        saveComponentToHistory={saveComponentToHistory}
      />
    </div>
  );
};

export default ChartDataEditor;