import React, { useState, useEffect, useMemo } from 'react';
import { createColumn, DataTable, EditableCell, NumericCell } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, X, ChevronsUpDown, Copy, FileSpreadsheet, Upload } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { ChartDataItem, ChartSeriesItem } from './ChartDataEditor';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Uploady from "@rpldy/uploady";
import UploadButton from "@rpldy/upload-button";
import UploadDropZone from "@rpldy/upload-drop-zone";
import * as XLSX from 'xlsx';

interface TableEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chartType: 'bar' | 'pie' | 'line' | 'radar' | 'scatter' | 'bump' | 'heatmap';
  data: any[];
  onChange: (data: any[]) => void;
  saveComponentToHistory?: (message?: string) => void;
}

// Simple chart data
type SimpleChartData = {
  id: string;
  name?: string;
  value?: number;
  label?: string;
  x?: string | number;
  y?: number;
  [key: string]: any;
};

const ActionCell = ({ row, table }: any) => {
  const handleDelete = () => {
    table.options.meta?.deleteRow(row.index);
  };

  return (
    <div className="flex justify-center items-center">
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={handleDelete} 
        className="h-6 w-6 rounded-sm opacity-70 hover:opacity-100 hover:bg-destructive/20 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};

// Series picker for line charts
const SeriesPicker = ({ 
  series, 
  activeSeries, 
  onSelect,
  onAddSeries,
  onDeleteSeries,
}: { 
  series: any[],
  activeSeries: number,
  onSelect: (index: number) => void,
  onAddSeries: () => void,
  onDeleteSeries: (index: number) => void,
}) => {
  return (
    <div className="flex items-center mb-3 gap-2">
      <Label className="text-xs font-medium whitespace-nowrap">Active Series:</Label>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex items-center justify-between text-xs h-8 px-3 rounded"
          >
            <span className="truncate max-w-[130px]">{series[activeSeries]?.id || `Series ${activeSeries + 1}`}</span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[180px]">
          {series.map((s, i) => (
            <DropdownMenuItem 
              key={i} 
              className="flex items-center justify-between"
              onClick={() => onSelect(i)}
            >
              <div className="flex items-center gap-2">
                <div 
                  className="w-2 h-2 rounded-sm" 
                  style={{ backgroundColor: s.color || '#61cdbb' }}
                />
                <span className="truncate max-w-[120px]">{s.id || `Series ${i + 1}`}</span>
              </div>
              
              {series.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 rounded-sm ml-1 hover:bg-destructive/20 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSeries(i);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </DropdownMenuItem>
          ))}
          
          <DropdownMenuItem 
            className="border-t mt-1 flex justify-center text-muted-foreground hover:text-primary"
            onClick={onAddSeries}
          >
            <div className="flex items-center">
              <Plus className="mr-1 h-3.5 w-3.5" />
              <span>Add Series</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

// Consistent color palette for all chart types
const DEFAULT_COLORS = [
  '#61cdbb', '#97e3d5', '#e8c1a0', '#f47560', '#f1e15b',
  '#e8a838', '#efc764', '#8fa4ff', '#6772e5', '#99b898'
];

const TableEditor: React.FC<TableEditorProps> = ({
  open,
  onOpenChange,
  chartType,
  data,
  onChange,
  saveComponentToHistory
}) => {
  // Utility function to scroll to the bottom of containers
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
  // For line/scatter/bump charts, we need to manage active series
  const [activeSeries, setActiveSeries] = useState(0);
  const [activeTab, setActiveTab] = useState<string>('data');
  
  // Excel import states
  const [isProcessing, setIsProcessing] = useState(false);
  const [importedData, setImportedData] = useState<any[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [activeSeriesIndex, setActiveSeriesIndex] = useState(0);
  
  // Make a deep copy of data to work with
  const [tableData, setTableData] = useState<any[]>([]);

  // Reset table data when dialog opens or chart type/data changes
  useEffect(() => {
    if (open) {
      if (['bar', 'pie', 'radar'].includes(chartType)) {
        // For charts with simple data structure
        setTableData(JSON.parse(JSON.stringify(data || [])));
      } else {
        // For series-based charts like line, scatter, etc.
        setTableData(JSON.parse(JSON.stringify(data || [])));
        // Reset active series to first one if it exists
        if (data && data.length > 0) {
          setActiveSeries(0);
        }
      }
      // Start with data tab
      setActiveTab('data');
      // Reset import states
      setImportedData(null);
      setImportError(null);
      setPreviewData([]);
      setSelectedSheet('');
      setAvailableSheets([]);
      setIsProcessing(false);
    }
  }, [open, chartType, data]);

  // Create columns based on chart type
  const columns = useMemo(() => {
    if (chartType === 'pie') {
      return [
        createColumn<SimpleChartData, string>('id' as keyof SimpleChartData, 'ID', EditableCell),
        createColumn<SimpleChartData, string>('label' as keyof SimpleChartData, 'Label', EditableCell),
        createColumn<SimpleChartData, number>('value' as keyof SimpleChartData, 'Value', NumericCell),
        {
          id: 'actions',
          header: '',
          cell: ActionCell,
        },
      ];
    } else if (chartType === 'bar' || chartType === 'radar') {
      return [
        createColumn<SimpleChartData, string>('name' as keyof SimpleChartData, 'Name', EditableCell),
        createColumn<SimpleChartData, number>('value' as keyof SimpleChartData, 'Value', NumericCell),
        {
          id: 'actions',
          header: '',
          cell: ActionCell,
        },
      ];
    } else {
      // For line, scatter, bump, heatmap (focused on current series)
      return [
        createColumn<SimpleChartData, string | number>('x' as keyof SimpleChartData, 'X Value', EditableCell),
        createColumn<SimpleChartData, number>('y' as keyof SimpleChartData, 'Y Value', NumericCell),
        {
          id: 'actions',
          header: '',
          cell: ActionCell,
        },
      ];
    }
  }, [chartType]);

  // Get the data for the current table view
  const getCurrentTableData = () => {
    if (['line', 'scatter', 'bump', 'heatmap'].includes(chartType)) {
      if (!tableData[activeSeries]?.data) return [];
      return tableData[activeSeries].data;
    }
    return tableData;
  };

  // Update data and propagate changes to parent
  const updateData = (rowIndex: number, columnId: string, value: any) => {
    if (saveComponentToHistory) {
      saveComponentToHistory("Save before edit");
    }
    
    if (['line', 'scatter', 'bump', 'heatmap'].includes(chartType)) {
      // For series-based data
      const newData = [...tableData];
      if (newData[activeSeries] && newData[activeSeries].data) {
        newData[activeSeries].data[rowIndex] = {
          ...newData[activeSeries].data[rowIndex],
          [columnId]: value
        };
        setTableData(newData);
        onChange(newData);
      }
    } else {
      // For simple data structure
      const newData = [...tableData];
      newData[rowIndex] = {
        ...newData[rowIndex],
        [columnId]: value
      };
      setTableData(newData);
      onChange(newData);
    }
  };

  // Add a new row
  const addRow = () => {
    if (saveComponentToHistory) {
      saveComponentToHistory("Save before adding row");
    }
    
    if (['line', 'scatter', 'bump', 'heatmap'].includes(chartType)) {
      // For series-based data
      const newData = [...tableData];
      
      if (!newData[activeSeries]) {
        // Create a new series if it doesn't exist
        newData[activeSeries] = {
          id: `Series ${activeSeries + 1}`,
          data: []
        };
      }
      
      // Default values for different chart types
      let newPoint;
      
      if (newData[activeSeries].data && newData[activeSeries].data.length > 0) {
        // Get the last point index or label
        const lastPoint = newData[activeSeries].data[newData[activeSeries].data.length - 1];
        let nextValue;
        
        if (typeof lastPoint.x === 'number') {
          // If x is numeric, increment by 1
          nextValue = lastPoint.x + 1;
        } else {
          // If x is a string, try to extract a number and increment
          const match = String(lastPoint.x).match(/(\D*)(\d+)$/);
          if (match) {
            const [, prefix, number] = match;
            nextValue = `${prefix}${parseInt(number) + 1}`;
          } else {
            nextValue = `Point ${newData[activeSeries].data.length + 1}`;
          }
        }
        
        newPoint = { x: nextValue, y: 0 };
      } else {
        // Default first point
        newPoint = { x: 'Point 1', y: 0 };
      }
      
      if (!newData[activeSeries].data) {
        newData[activeSeries].data = [];
      }
      
      newData[activeSeries].data.push(newPoint);
      setTableData(newData);
      onChange(newData);
    } else if (chartType === 'pie') {
      // For pie charts
      const newItem = {
        id: `Segment ${tableData.length + 1}`,
        label: `Segment ${tableData.length + 1}`,
        value: 10
      };
      setTableData([...tableData, newItem]);
      onChange([...tableData, newItem]);
    } else {
      // For bar and radar charts
      const newItem = {
        name: `Category ${tableData.length + 1}`,
        value: 10
      };
      setTableData([...tableData, newItem]);
      onChange([...tableData, newItem]);
    }
  };

  // Delete a row
  const deleteRow = (rowIndex: number) => {
    if (saveComponentToHistory) {
      saveComponentToHistory("Save before deleting row");
    }
    
    if (['line', 'scatter', 'bump', 'heatmap'].includes(chartType)) {
      // For series-based data
      const newData = [...tableData];
      
      if (newData[activeSeries] && newData[activeSeries].data) {
        // Don't delete the last point
        if (newData[activeSeries].data.length <= 1) {
          return;
        }
        
        newData[activeSeries].data = newData[activeSeries].data.filter((_, i) => i !== rowIndex);
        setTableData(newData);
        onChange(newData);
      }
    } else {
      // For simple data structure
      // Don't delete the last row
      if (tableData.length <= 1) {
        return;
      }
      
      const newData = tableData.filter((_, i) => i !== rowIndex);
      setTableData(newData);
      onChange(newData);
    }
  };

  // Add a new series (for line, scatter, bump charts)
  const addSeries = () => {
    if (saveComponentToHistory) {
      saveComponentToHistory("Save before adding series");
    }
    
    const newData = [...tableData];
    
    // Get data points from previous series if available
    let dataPoints = [];
    
    if (newData.length > 0 && newData[newData.length - 1]?.data) {
      // Clone data points from previous series
      dataPoints = newData[newData.length - 1].data.map(point => ({
        x: point.x,
        y: typeof point.y === 'number' ? point.y : (typeof point.y === 'string' ? parseFloat(point.y) || 0 : 0)
      }));
    } else {
      // Default data points
      dataPoints = [
        { x: 'Jan', y: 20 },
        { x: 'Feb', y: 30 },
        { x: 'Mar', y: 10 }
      ];
    }
    
    newData.push({
      id: `Series ${newData.length + 1}`,
      data: dataPoints
    });
    
    setTableData(newData);
    onChange(newData);
    setActiveSeries(newData.length - 1);
  };

  // Delete a series
  const deleteSeries = (seriesIndex: number) => {
    if (saveComponentToHistory) {
      saveComponentToHistory("Save before deleting series");
    }
    
    // Don't delete the last series
    if (tableData.length <= 1) {
      return;
    }
    
    const newData = tableData.filter((_, i) => i !== seriesIndex);
    setTableData(newData);
    onChange(newData);
    
    // Adjust active series if needed
    if (activeSeries >= newData.length) {
      setActiveSeries(Math.max(0, newData.length - 1));
    }
  };

  // Update series name/id
  const updateSeriesName = (name: string) => {
    if (saveComponentToHistory) {
      saveComponentToHistory("Save before updating series name");
    }
    
    const newData = [...tableData];
    
    if (newData[activeSeries]) {
      newData[activeSeries].id = name;
      setTableData(newData);
      onChange(newData);
    }
  };

  // Handle Excel file upload
  const handleFileUpload = (file: File) => {
    if (saveComponentToHistory) {
      saveComponentToHistory("Before importing Excel data");
    }
    
    setIsProcessing(true);
    setImportError(null);
    setImportedData(null);
    setPreviewData([]);
    setAvailableSheets([]);
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        
        // Parse file data using XLSX
        let workbook;
        try {
          workbook = XLSX.read(data, { type: 'array' });
        } catch (xlsxError) {
          console.error("Error parsing with XLSX:", xlsxError);
          setImportError("Failed to parse Excel file. Make sure it's a valid Excel or CSV file.");
          setIsProcessing(false);
          return;
        }
        
        // Get available sheets
        const sheets = workbook.SheetNames;
        setAvailableSheets(sheets);
        
        if (sheets.length > 0) {
          const firstSheet = sheets[0];
          setSelectedSheet(firstSheet);
          const worksheet = workbook.Sheets[firstSheet];
          
          // Parse data from worksheet with smart options
          try {
            // Try different parsing strategies in order of preference
            
            // Strategy 1: Parse with headers (best for well-formatted data)
            let jsonData = XLSX.utils.sheet_to_json(worksheet, {
              defval: null, // Use null for empty cells - helps with type detection
              raw: true     // Keep numbers as numbers
            });
            
            // Check if we got any data
            if (jsonData.length === 0) {
              // Strategy 2: Parse with default column headers if previous failed
              jsonData = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,       // Generate array-style data
                defval: null,    // Use null for empty cells
                raw: true        // Keep numbers as numbers
              });
              
              // Remove any completely empty rows
              jsonData = jsonData.filter(row => {
                // Check if the row has any non-null values
                return Array.isArray(row) && row.some(cell => cell !== null);
              });
            }
            
            // Detect and handle header row
            if (jsonData.length > 0) {
              const firstRow = jsonData[0];
              let hasHeader = false;
              
              // Check if the first row contains column labels (strings)
              if (Array.isArray(firstRow)) {
                // For array format, check if first row is all strings
                hasHeader = firstRow.every(cell => 
                  cell !== null && (typeof cell === 'string' || typeof cell === 'number') && !isNaN(String(cell).indexOf)
                );
              } else if (typeof firstRow === 'object') {
                // For object format, we already have headers
                hasHeader = false; // Headers are already column names
              }
              
              // Remove header row if detected in array data
              if (hasHeader && Array.isArray(firstRow)) {
                jsonData = jsonData.slice(1);
              }
            }
            
            // Process data based on chart type
            const processedData = processExcelData(jsonData, chartType);
            
            // Validate processed data
            if (!processedData || processedData.length === 0) {
              setImportError("Could not extract valid chart data from the file. Try using the template format.");
              setIsProcessing(false);
              return;
            }
            
            // Set the processed data for preview and import
            setPreviewData(processedData);
            setImportedData(processedData);
            
            console.log("Successfully processed data:", processedData);
          } catch (parseError) {
            console.error("Error parsing worksheet:", parseError);
            setImportError("Failed to extract data from the file. Please check the file format.");
            setIsProcessing(false);
          }
        } else {
          setImportError("No sheets found in the Excel file");
          setIsProcessing(false);
        }
      } catch (error) {
        console.error("Error handling Excel file:", error);
        setImportError("Failed to process Excel file. Make sure it's a valid Excel or CSV file.");
        setIsProcessing(false);
      } finally {
        setIsProcessing(false);
      }
    };
    
    reader.onerror = () => {
      setImportError("Error reading file");
      setIsProcessing(false);
    };
    
    reader.readAsArrayBuffer(file);
  };
  
  // Generate a template for download based on chart type
  const generateTemplate = () => {
    const filename = `${chartType}-chart-template.xlsx`;
    
    try {
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      let worksheet;
      
      // Set column widths and formatting
      const wscols = [
        {wch: 15}, // Width of first column
        {wch: 15}, // Width of second column
        {wch: 15}  // Width of third column
      ];

      // Prepare template data based on chart type
      let templateData;
      
      switch (chartType) {
        case 'bar':
        case 'radar':
          templateData = [
            ['name', 'value'], // Header row
            ['Category A', 40],
            ['Category B', 30],
            ['Category C', 50],
            ['Category D', 20]
          ];
          break;
          
        case 'pie':
          templateData = [
            ['id', 'label', 'value'], // Header row
            ['Market Share', 'Market Share', 40],
            ['Revenue', 'Revenue', 30],
            ['Growth', 'Growth', 50]
          ];
          break;
          
        case 'line':
        case 'scatter':
        case 'bump':
          // For line charts, we can do either series-based or column-based format
          // Series-based is more flexible
          templateData = [
            ['series', 'x', 'y'], // Header row
            ['Series A', 'Jan', 20],
            ['Series A', 'Feb', 35],
            ['Series A', 'Mar', 25],
            ['Series A', 'Apr', 40],
            ['Series B', 'Jan', 10],
            ['Series B', 'Feb', 25],
            ['Series B', 'Mar', 30],
            ['Series B', 'Apr', 20]
          ];
          break;
          
        case 'heatmap':
          // For heatmap, a tabular format with category rows and column headers is best
          templateData = [
            ['', 'Group 1', 'Group 2', 'Group 3'], // Header row with empty first cell
            ['Category A', 20, 35, 15],
            ['Category B', 10, 30, 25],
            ['Category C', 30, 15, 40]
          ];
          break;
          
        default:
          // Default format for any chart type
          templateData = [
            ['name', 'value'], // Header row
            ['Category A', 40],
            ['Category B', 30],
            ['Category C', 50]
          ];
      }
      
      // Create worksheet from template data
      worksheet = XLSX.utils.aoa_to_sheet(templateData);
      
      // Set column widths
      worksheet['!cols'] = wscols;
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Chart Data');
      
      // Convert to binary data
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      
      // Create Blob and download
      const blob = new Blob([wbout], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = URL.createObjectURL(blob);
      
      // Create download link and trigger click
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
    } catch (error) {
      console.error("Error generating template:", error);
      
      // Fall back to CSV if XLSX creation fails
      console.log("Falling back to CSV format");
      
      let template;
      switch (chartType) {
        case 'bar':
        case 'radar':
          template = 'name,value\r\nCategory A,40\r\nCategory B,30\r\nCategory C,50\r\nCategory D,20';
          break;
        case 'pie':
          template = 'id,label,value\r\nMarket Share,Market Share,40\r\nRevenue,Revenue,30\r\nGrowth,Growth,50';
          break;
        case 'line':
        case 'scatter':
        case 'bump':
          template = 'series,x,y\r\nSeries A,Jan,20\r\nSeries A,Feb,35\r\nSeries A,Mar,25\r\nSeries A,Apr,40\r\nSeries B,Jan,10\r\nSeries B,Feb,25\r\nSeries B,Mar,30\r\nSeries B,Apr,20';
          break;
        case 'heatmap':
          template = ',Group 1,Group 2,Group 3\r\nCategory A,20,35,15\r\nCategory B,10,30,25\r\nCategory C,30,15,40';
          break;
        default:
          template = 'name,value\r\nCategory A,40\r\nCategory B,30\r\nCategory C,50';
      }
      
      // Create blob for CSV
      const blob = new Blob([template], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      
      // Create download link and trigger click
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.replace('.xlsx', '.csv');
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    }
  };

  // Process the Excel data based on chart type
  const processExcelData = (data: any[], chartType: string): any[] => {
    console.log("Processing data:", data);
    if (!data || data.length === 0) {
      console.log("No data to process");
      return [];
    }
    
    // Simple color management - consistent and maintainable
    const getColorForIndex = (index: number): string => {
      return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
    };
    
    // Get color for an existing item/series or assign a new one
    const getColorForKey = (key: string, collection: any[], keyField: string): string => {
      // Try to find existing color first
      const existingItem = collection.find(item => item[keyField] === key);
      if (existingItem?.color) {
        return existingItem.color;
      }
      
      // Find the index of this key in all keys to assign a consistent color
      const allKeys = collection.map(item => item[keyField]);
      const keyIndex = allKeys.indexOf(key);
      if (keyIndex >= 0) {
        return getColorForIndex(keyIndex);
      }
      
      // If it's a new key, use the collection length as index for color
      return getColorForIndex(collection.length);
    };
    
    // Detect whether we're dealing with array data
    const isArrayData = data.length > 0 && Array.isArray(data[0]);
    
    // Handle array data (like from some CSV formats)
    if (isArrayData) {
      if (['bar', 'radar'].includes(chartType)) {
        return data.map((row, index) => ({
          name: String(row[0] || `Category ${index + 1}`),
          value: Number(row[1] || 0),
          color: getColorForIndex(index)
        }));
      } else if (chartType === 'pie') {
        return data.map((row, index) => ({
          id: String(row[0] || `Segment ${index + 1}`),
          label: String(row[1] || row[0] || `Segment ${index + 1}`),
          value: Number(row[2] || row[1] || 0),
          color: getColorForIndex(index)
        }));
      } else {
        // For series-based charts with array data
        const seriesMap = new Map();
        data.forEach((row, index) => {
          if (!row || row.length < 2) return;
          
          const seriesName = String(row[0] || 'Series 1');
          const x = String(row[1] || `Point ${index + 1}`);
          const y = Number(row[2] || 0);
          
          if (!seriesMap.has(seriesName)) {
            seriesMap.set(seriesName, {
              id: seriesName,
              color: getColorForIndex(seriesMap.size),
              data: []
            });
          }
          
          seriesMap.get(seriesName).data.push({ x, y });
        });
        
        return Array.from(seriesMap.values());
      }
    }
    
    // Handle object data based on chart type
    if (['bar', 'radar'].includes(chartType)) {
      // Extract the meaningful data for bar and radar charts
      return data
        .filter(row => row && typeof row === 'object')
        .map((row, index) => {
          // Extract name (look for common field names)
          const name = String(
            row.name || row.category || row.id || row.label || 
            Object.values(row)[0] || `Category ${index + 1}`
          );
          
          // Extract value (look for common field names or any numeric value)
          let value = 0;
          if (row.value !== undefined) {
            value = Number(row.value);
          } else if (row.y !== undefined) {
            value = Number(row.y);
          } else {
            // Find first numeric value
            const numValue = Object.values(row).find(v => 
              !isNaN(Number(v)) && typeof v !== 'boolean'
            );
            if (numValue !== undefined) {
              value = Number(numValue);
            }
          }
          
          return {
            name,
            value,
            color: getColorForKey(name, tableData, 'name')
          };
        });
    } 
    else if (chartType === 'pie') {
      // Extract the meaningful data for pie charts
      return data
        .filter(row => row && typeof row === 'object')
        .map((row, index) => {
          // Extract id and label
          const id = String(
            row.id || row.name || row.category || 
            Object.values(row)[0] || `Segment ${index + 1}`
          );
          
          const label = String(
            row.label || row.name || row.id || id
          );
          
          // Extract value
          let value = 0;
          if (row.value !== undefined) {
            value = Number(row.value);
          } else if (row.y !== undefined) {
            value = Number(row.y);
          } else {
            // Find first numeric value
            const numValue = Object.values(row).find(v => 
              !isNaN(Number(v)) && typeof v !== 'boolean'
            );
            if (numValue !== undefined) {
              value = Number(numValue);
            }
          }
          
          return {
            id,
            label, 
            value,
            color: getColorForKey(id, tableData, 'id')
          };
        });
    }
    else if (['line', 'scatter', 'bump', 'heatmap'].includes(chartType)) {
      // For series-based charts, need to organize data by series
      
      // First determine if the data contains explicit series information
      const firstFewRows = data.slice(0, Math.min(data.length, 5));
      const hasSeries = firstFewRows.some(row => 
        row && typeof row === 'object' && 'series' in row
      );
      
      // If data has explicit series column, group by series
      if (hasSeries) {
        const seriesMap = new Map();
        
        data.forEach((row, index) => {
          if (!row || typeof row !== 'object') return;
          
          // Get series name
          const seriesName = String(row.series || `Series ${index + 1}`);
          
          // Extract x and y values
          const x = String(
            row.x || row.category || row.date || row.label || 
            Object.values(row)[0] || `Point ${index + 1}`
          );
          
          // Extract y value - ensure it's a number
          let y = 0;
          if (row.y !== undefined) {
            y = Number(row.y);
          } else if (row.value !== undefined) {
            y = Number(row.value);
          } else {
            // Find first numeric value that's not the series or x value
            const numValues = Object.entries(row)
              .filter(([key, val]) => 
                key !== 'series' && key !== 'x' && 
                !isNaN(Number(val)) && typeof val !== 'boolean'
              );
              
            if (numValues.length > 0) {
              y = Number(numValues[0][1]);
            }
          }
          
          // Create series if it doesn't exist
          if (!seriesMap.has(seriesName)) {
            seriesMap.set(seriesName, {
              id: seriesName,
              color: getColorForKey(seriesName, tableData, 'id'),
              data: []
            });
          }
          
          // Add data point to series
          seriesMap.get(seriesName).data.push({ x, y });
        });
        
        return Array.from(seriesMap.values())
          .filter(series => series.data && series.data.length > 0);
      }
      else {
        // Each row becomes a data point of a single series
        // Group the data by potential x-axis values to determine if we should make multiple series
        
        // Extract all potential x value columns
        const colNames = data.length > 0 ? Object.keys(data[0]) : [];
        
        // If we have at least two columns, assume first is x and the rest are series
        if (colNames.length >= 2) {
          const xColumn = colNames[0];
          const valueColumns = colNames.slice(1).filter(col => {
            // Check if this column contains mostly numeric values
            return data.some(row => !isNaN(Number(row[col])));
          });
          
          if (valueColumns.length > 0) {
            // Create a series for each value column
            return valueColumns.map((seriesCol, seriesIndex) => {
              return {
                id: seriesCol,
                color: getColorForIndex(seriesIndex),
                data: data
                  .filter(row => row && typeof row === 'object')
                  .map(row => ({
                    x: String(row[xColumn] || ''),
                    y: Number(row[seriesCol] || 0)
                  }))
                  .filter(point => point.x !== '')
              };
            }).filter(series => series.data && series.data.length > 0);
          }
        }
        
        // If we couldn't create series from columns, treat each row as a separate point in one series
        return [{
          id: 'Series 1',
          color: getColorForIndex(0),
          data: data
            .filter(row => row && typeof row === 'object')
            .map((row, index) => {
              // For each row, extract first value as x and second as y
              const values = Object.values(row);
              return {
                x: String(values[0] || `Point ${index + 1}`),
                y: Number(values.length > 1 ? values[1] : 0)
              };
            })
        }];
      }
    }
    
    // Default fallback for unknown chart types
    return data
      .filter(row => row && typeof row === 'object')
      .map((row, index) => {
        const values = Object.values(row);
        return {
          name: String(values[0] || `Item ${index + 1}`),
          value: values.length > 1 ? Number(values[1]) : 10,
          color: getColorForIndex(index)
        };
      });
  };
  
  // Apply imported data
  const applyImportedData = () => {
    if (importedData) {
      if (saveComponentToHistory) {
        saveComponentToHistory("Import Excel data");
      }
      
      setTableData(importedData);
      onChange(importedData);
      setActiveTab('data'); // Switch to data tab to show imported data
    }
  };
  
  // Handle sheet selection change
  const handleSheetChange = (sheetName: string) => {
    if (isProcessing || !availableSheets.includes(sheetName)) return;
    
    setSelectedSheet(sheetName);
    setImportError(null);
    setIsProcessing(true);
    
    try {
      // We need to read the file again to get the new sheet
      const fileInput = document.getElementById('excel-file-input') as HTMLInputElement;
      if (fileInput?.files?.length) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        
        reader.onload = (e) => {
          try {
            const data = e.target?.result;
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[sheetName];
            
            // Parse data from worksheet with smart options
            try {
              // Try different parsing strategies in order of preference
              
              // Strategy 1: Parse with headers (best for well-formatted data)
              let jsonData = XLSX.utils.sheet_to_json(worksheet, {
                defval: null, // Use null for empty cells - helps with type detection
                raw: true     // Keep numbers as numbers
              });
              
              // Check if we got any data
              if (jsonData.length === 0) {
                // Strategy 2: Parse with default column headers if previous failed
                jsonData = XLSX.utils.sheet_to_json(worksheet, {
                  header: 1,       // Generate array-style data
                  defval: null,    // Use null for empty cells
                  raw: true        // Keep numbers as numbers
                });
                
                // Remove any completely empty rows
                jsonData = jsonData.filter(row => {
                  // Check if the row has any non-null values
                  return Array.isArray(row) && row.some(cell => cell !== null);
                });
              }
              
              // Detect and handle header row
              if (jsonData.length > 0) {
                const firstRow = jsonData[0];
                let hasHeader = false;
                
                // Check if the first row contains column labels (strings)
                if (Array.isArray(firstRow)) {
                  // For array format, check if first row is all strings
                  hasHeader = firstRow.every(cell => 
                    cell !== null && (typeof cell === 'string' || typeof cell === 'number') && !isNaN(String(cell).indexOf)
                  );
                } else if (typeof firstRow === 'object') {
                  // For object format, we already have headers
                  hasHeader = false; // Headers are already column names
                }
                
                // Remove header row if detected in array data
                if (hasHeader && Array.isArray(firstRow)) {
                  jsonData = jsonData.slice(1);
                }
              }
              
              // Skip processing if no data
              if (!jsonData || jsonData.length === 0) {
                setImportError("No data found in the selected sheet");
                setIsProcessing(false);
                return;
              }
              
              // Process data based on chart type
              const processedData = processExcelData(jsonData, chartType);
              
              // Validate processed data
              if (!processedData || processedData.length === 0) {
                setImportError("Could not extract valid chart data from the sheet. Try using the template format.");
                setIsProcessing(false);
                return;
              }
              
              // Set the processed data for preview and import
              setPreviewData(processedData);
              setImportedData(processedData);
              
              console.log("Successfully switched to sheet and processed data:", processedData);
            } catch (parseError) {
              console.error("Error parsing worksheet:", parseError);
              setImportError(`Failed to extract data from sheet "${sheetName}". Please check the format.`);
              setIsProcessing(false);
            }
          } catch (error) {
            console.error("Error parsing Excel sheet:", error);
            setImportError(`Failed to parse sheet "${sheetName}"`);
            setIsProcessing(false);
          } finally {
            setIsProcessing(false);
          }
        };
        
        reader.onerror = () => {
          setImportError("Error reading file");
          setIsProcessing(false);
        };
        
        reader.readAsArrayBuffer(file);
      } else {
        setImportError("No file selected");
        setIsProcessing(false);
      }
    } catch (error) {
      console.error("Error changing sheet:", error);
      setImportError("Failed to change sheet");
      setIsProcessing(false);
    }
  };

  // Save changes and close dialog
  const handleSave = () => {
    if (saveComponentToHistory) {
      saveComponentToHistory("Save chart data table edits");
    }
    
    // Apply imported data if it exists and we're on the upload tab
    if (activeTab === 'upload' && importedData && importedData.length > 0) {
      onChange(importedData);
    } else {
      onChange(tableData);
    }
    
    onOpenChange(false);
  };

  // Custom file filter for Uploady
  const fileFilter = (file: File) => {
    const acceptedTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/csv',
      '.csv',
      '.xls',
      '.xlsx'
    ];
    
    // Check if the file type is accepted
    const isAccepted = acceptedTypes.some(type => {
      if (type.startsWith('.')) {
        return file.name.toLowerCase().endsWith(type);
      }
      return file.type === type;
    });
    
    if (!isAccepted) {
      setImportError("Invalid file type. Please upload an Excel or CSV file.");
      return false;
    }
    
    return true;
  };
  
  // Render preview of imported data
  const renderDataPreview = () => {
    if (isProcessing) {
      return (
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-muted-foreground">Processing file...</p>
        </div>
      );
    }
    
    if (importError) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-sm text-destructive">{importError}</p>
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-4"
            onClick={() => {
              setImportError(null);
              const fileInput = document.getElementById('excel-file-input') as HTMLInputElement;
              if (fileInput) fileInput.value = '';
            }}
          >
            Try Again
          </Button>
        </div>
      );
    }
    
    if (previewData.length === 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-muted-foreground">No data to preview. Upload a file first.</p>
        </div>
      );
    }
    
    // For simple chart types (bar, pie, radar)
    if (['bar', 'pie', 'radar'].includes(chartType)) {
      return (
        <div className="overflow-auto w-full h-full">
          <Table className="w-full">
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow className="text-[11px] border-b-0">
                {chartType === 'pie' ? (
                  <>
                    <TableHead className="h-7 p-1 pl-2">ID</TableHead>
                    <TableHead className="h-7 p-1 pl-2">Label</TableHead>
                  </>
                ) : (
                  <TableHead className="h-7 p-1 pl-2">Name</TableHead>
                )}
                <TableHead className="h-7 p-1 text-center w-[70px]">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewData.map((item, index) => (
                <TableRow key={index} className="border-b-0 hover:bg-muted/30">
                  {chartType === 'pie' ? (
                    <>
                      <TableCell className="p-1 py-1">
                        <Input
                          value={item.id || ''}
                          onChange={(e) => {
                            const newPreviewData = [...previewData];
                            newPreviewData[index].id = e.target.value;
                            setPreviewData(newPreviewData);
                            setImportedData(newPreviewData);
                          }}
                          className="h-7 text-xs py-1.5 px-3 bg-transparent border-input hover:border-primary focus:border-primary rounded-sm"
                        />
                      </TableCell>
                      <TableCell className="p-1 py-1">
                        <Input
                          value={item.label || ''}
                          onChange={(e) => {
                            const newPreviewData = [...previewData];
                            newPreviewData[index].label = e.target.value;
                            setPreviewData(newPreviewData);
                            setImportedData(newPreviewData);
                          }}
                          className="h-7 text-xs py-1.5 px-3 bg-transparent border-input hover:border-primary focus:border-primary rounded-sm"
                        />
                      </TableCell>
                    </>
                  ) : (
                    <TableCell className="p-1 py-1">
                      <Input
                        value={item.name || ''}
                        onChange={(e) => {
                          const newPreviewData = [...previewData];
                          newPreviewData[index].name = e.target.value;
                          setPreviewData(newPreviewData);
                          setImportedData(newPreviewData);
                        }}
                        className="h-7 text-xs py-1.5 px-3 bg-transparent border-input hover:border-primary focus:border-primary rounded-sm"
                      />
                    </TableCell>
                  )}
                  <TableCell className="p-1 py-1">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={item.value === '' ? '' : (item.value || 0)}
                      onChange={(e) => {
                        const newPreviewData = [...previewData];
                        const value = e.target.value === '' ? '' : parseFloat(e.target.value) || 0;
                        newPreviewData[index].value = value;
                        setPreviewData(newPreviewData);
                        setImportedData(newPreviewData);
                      }}
                      className="h-7 text-xs py-1.5 px-3 text-right bg-transparent border-input hover:border-primary focus:border-primary rounded-sm"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    }
    
    // For series-based charts (line, scatter, bump)
    // Make sure activeSeriesIndex is valid
    const safeSeriesIndex = activeSeriesIndex < previewData.length ? activeSeriesIndex : 0;
    // Get the active series
    const activeSeries = previewData[safeSeriesIndex] || { id: '', data: [] };
    
    return (
      <div className="overflow-auto w-full h-full">
        <div className="flex items-center mb-2">
          <p className="text-sm font-medium">{previewData.length} series found</p>
        </div>
        
        <div className="mb-4">
          <div className="flex items-center mb-1 gap-2">
            <input
              type="text"
              value={activeSeries.id || ''}
              onChange={(e) => {
                const newPreviewData = [...previewData];
                if (newPreviewData[safeSeriesIndex]) {
                  newPreviewData[safeSeriesIndex].id = e.target.value;
                  setPreviewData(newPreviewData);
                  setImportedData(newPreviewData);
                }
              }}
              className="text-sm font-medium bg-transparent border-input border rounded-md p-1"
              placeholder="Series name"
            />
            <span className="text-xs text-muted-foreground">({activeSeries.data?.length || 0} points)</span>
          </div>
            
            <Table className="w-full">
              <TableHeader className="bg-muted/50 sticky top-0 z-10">
                <TableRow className="text-[11px] border-b-0">
                  <TableHead className="h-7 p-1 pl-2">X Value</TableHead>
                  <TableHead className="h-7 p-1 text-center w-[70px]">Y Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeSeries.data?.map((point: any, pointIndex: number) => (
                  <TableRow key={pointIndex} className="border-b-0 hover:bg-muted/30">
                    <TableCell className="p-1 py-1">
                      <Input
                        value={point.x || ''}
                        onChange={(e) => {
                          const newPreviewData = [...previewData];
                          newPreviewData[safeSeriesIndex].data[pointIndex].x = e.target.value;
                          setPreviewData(newPreviewData);
                          setImportedData(newPreviewData);
                        }}
                        className="h-7 text-xs py-1.5 px-3 bg-transparent border-input hover:border-primary focus:border-primary rounded-sm"
                      />
                    </TableCell>
                    <TableCell className="p-1 py-1">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={point.y === '' ? '' : (point.y || 0)}
                        onChange={(e) => {
                          const newPreviewData = [...previewData];
                          const value = e.target.value === '' ? '' : parseFloat(e.target.value) || 0;
                          newPreviewData[safeSeriesIndex].data[pointIndex].y = value;
                          setPreviewData(newPreviewData);
                          setImportedData(newPreviewData);
                        }}
                        className="h-7 text-xs py-1.5 px-3 text-right bg-transparent border-input hover:border-primary focus:border-primary rounded-sm"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Chart Data</DialogTitle>
          <DialogDescription>
            Update your chart data in this table editor.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="data">Edit Data</TabsTrigger>
            <TabsTrigger value="upload">Upload Excel</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="h-[480px] relative mt-4 mb-2">
          {activeTab === 'data' && (
            <div className="absolute inset-0 flex flex-col">
              {/* For series-based charts, show series selector */}
              {['line', 'scatter', 'bump', 'heatmap'].includes(chartType) && (
                <div className="pt-2">
                  <div className="flex justify-between items-center pb-2">
                    <SeriesPicker 
                      series={tableData} 
                      activeSeries={activeSeries}
                      onSelect={setActiveSeries}
                      onAddSeries={addSeries}
                      onDeleteSeries={deleteSeries}
                    />
                    
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Series Name:</Label>
                      <Input
                        value={tableData[activeSeries]?.id || ''}
                        onChange={(e) => updateSeriesName(e.target.value)}
                        className="h-8 text-xs py-1 px-2 w-[120px]"
                      />
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex-grow">
                <DataTable
                  columns={columns}
                  data={getCurrentTableData()}
                  onDataChange={updateData}
                  onRowDelete={deleteRow}
                  maxHeight="350px"
                  emptyMessage="No data available"
                />
              </div>
              
              <div className="flex justify-end mt-2 border-t pt-2 sticky bottom-0 bg-background">
                <Button 
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs mr-2"
                  onClick={() => {
                    addRow();
                    // Scroll to the bottom to show the newly added row
                    scrollToBottom();
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  <span>Add Row</span>
                </Button>
              </div>
            </div>
          )}
          
          {activeTab === 'upload' && (
            <div className="absolute inset-0 overflow-auto">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-xs font-medium text-muted-foreground">Upload Data</h4>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7 px-2 text-xs flex items-center gap-1"
                  onClick={generateTemplate}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Download Template
                </Button>
              </div>
              
              {!importedData && (
                <>
                  
                  <div 
                    className="w-full h-60 border-2 border-dashed border-primary/40 rounded-md hover:border-primary hover:border-opacity-90 hover:bg-primary/5 transition-all mb-4 flex items-center justify-center relative cursor-pointer"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.add('border-white', 'border-opacity-80', 'bg-primary/10');
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('border-white', 'border-opacity-80', 'bg-primary/10');
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('border-white', 'border-opacity-80', 'bg-primary/10');
                      
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        const file = e.dataTransfer.files[0];
                        if (fileFilter(file)) {
                          handleFileUpload(file);
                        }
                      }
                    }}
                    onClick={() => {
                      // Programmatically click the hidden file input
                      const fileInput = document.getElementById('excel-file-input') as HTMLInputElement;
                      if (fileInput) {
                        fileInput.click();
                      }
                    }}
                  >
                    <div className="flex flex-col items-center justify-center gap-4">
                      <Upload className="h-12 w-12 text-primary/70" />
                      <p className="text-lg font-medium text-foreground">Drag & drop Excel file or click to browse</p>
                      <span className="text-sm text-muted-foreground">(xlsx, xls, csv)</span>
                    </div>
                    
                    <input
                      id="excel-file-input"
                      type="file"
                      accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file && fileFilter(file)) {
                          handleFileUpload(file);
                        }
                      }}
                    />
                  </div>
                </>
              )}
              
              {isProcessing && (
                <div className="flex items-center justify-center p-4">
                  <p className="text-sm text-muted-foreground">Processing file...</p>
                </div>
              )}
              
              {importError && (
                <div className="flex flex-col items-center justify-center p-4">
                  <p className="text-sm text-destructive mb-2">{importError}</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2"
                    onClick={() => {
                      setImportError(null);
                      const fileInput = document.getElementById('excel-file-input') as HTMLInputElement;
                      if (fileInput) fileInput.value = '';
                    }}
                  >
                    Try Again
                  </Button>
                </div>
              )}
              
              {importedData && importedData.length > 0 && (
                <div className="flex flex-col h-full">
                  {/* Series selector dropdown */}
                  {['line', 'scatter', 'bump', 'heatmap'].includes(chartType) && previewData.length > 0 && (
                    <div className="flex items-center justify-between mb-3 pl-1 bg-muted/20 p-2 rounded-md border border-border/30">
                      <div className="flex items-center gap-3">
                        <label className="text-xs font-medium text-muted-foreground">Active Series:</label>
                        <select 
                          className="h-7 text-sm border border-input rounded-md bg-background px-2 min-w-[150px]"
                          value={activeSeriesIndex}
                          onChange={(e) => setActiveSeriesIndex(parseInt(e.target.value))}
                        >
                          {previewData.map((series, idx) => (
                            <option key={idx} value={idx}>
                              {series.id || `Series ${idx + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => {
                            if (importedData) {
                              const newData = [...importedData];
                              const newSeriesName = `Series ${newData.length + 1}`;
                              
                              // Copy data points from existing series or create default ones
                              let dataPoints = [];
                              if (newData.length > 0 && newData[0].data) {
                                dataPoints = [...newData[0].data];
                              } else {
                                dataPoints = [
                                  { x: 'Jan', y: 20 },
                                  { x: 'Feb', y: 30 },
                                  { x: 'Mar', y: 10 }
                                ];
                              }
                              
                              newData.push({
                                id: newSeriesName,
                                color: DEFAULT_COLORS[newData.length % DEFAULT_COLORS.length],
                                data: dataPoints
                              });
                              
                              setPreviewData(newData);
                              setImportedData(newData);
                              setActiveSeriesIndex(newData.length - 1);
                            }
                          }}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add
                        </Button>
                        
                        {importedData.length > 1 && (
                          <Button 
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-destructive"
                            onClick={() => {
                              if (importedData) {
                                const newData = importedData.filter((_, idx) => idx !== activeSeriesIndex);
                                setPreviewData(newData);
                                setImportedData(newData);
                                if (activeSeriesIndex >= newData.length) {
                                  setActiveSeriesIndex(Math.max(0, newData.length - 1));
                                }
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Sheet selector for multi-sheet Excel files */}
                  {availableSheets.length > 1 && (
                    <div className="flex items-center gap-2 mb-2">
                      <Label className="text-xs font-medium text-muted-foreground">Worksheet:</Label>
                      <select
                        value={selectedSheet}
                        onChange={(e) => handleSheetChange(e.target.value)}
                        className="h-7 text-sm border border-input rounded-md bg-background px-2 min-w-[120px]"
                        disabled={isProcessing}
                      >
                        {availableSheets.map((sheet) => (
                          <option key={sheet} value={sheet}>
                            {sheet}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  
                  {/* Reset file button */}
                  <div className="flex justify-end mb-1">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 text-xs flex items-center gap-1"
                      onClick={() => {
                        setImportedData(null);
                        setImportError(null);
                        setPreviewData([]);
                        setSelectedSheet('');
                        setAvailableSheets([]);
                        setIsProcessing(false);
                        const fileInput = document.getElementById('excel-file-input') as HTMLInputElement;
                        if (fileInput) fileInput.value = '';
                      }}
                    >
                      <span className="text-xs text-muted-foreground flex items-center">
                        Reset file
                      </span>
                    </Button>
                  </div>
                  
                  {/* Data container with fixed height to ensure buttons are visible */}
                  <div className="overflow-auto" style={{ height: 'calc(100vh - 420px)', minHeight: '180px' }}>
                    {renderDataPreview()}
                  </div>
                  
                  {/* Add buttons at the bottom - thinner and positioned below data */}
                  <div className="flex justify-end mt-2 border-t pt-2 sticky bottom-0 bg-background">
                    <Button 
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs mr-2" 
                      onClick={() => {
                        if (chartType === 'bar' || chartType === 'pie' || chartType === 'radar') {
                          // For simple chart types
                          const newRow = chartType === 'pie' 
                            ? { id: `Segment ${previewData.length + 1}`, label: `Segment ${previewData.length + 1}`, value: 10 }
                            : { name: `Category ${previewData.length + 1}`, value: 10 };
                            
                          const newData = [...previewData, newRow];
                          setPreviewData(newData);
                          setImportedData(newData);
                          
                          // Scroll to bottom
                          scrollToBottom();
                        } else {
                          // For series-based charts
                          if (previewData.length > 0) {
                            // Add to active series instead of last series
                            const activeSeries = previewData[activeSeriesIndex];
                            if (activeSeries && activeSeries.data) {
                              const newPoint = { x: `Point ${activeSeries.data.length + 1}`, y: 0 };
                              
                              const newData = [...previewData];
                              newData[activeSeriesIndex].data.push(newPoint);
                              
                              setPreviewData(newData);
                              setImportedData(newData);
                              
                              // Force a deeper scroll to make sure the new point is visible
                              scrollToBottom();
                            }
                          }
                        }
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Row
                    </Button>
                    <Button 
                      onClick={applyImportedData}
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs"
                    >
                      Apply Data
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TableEditor;