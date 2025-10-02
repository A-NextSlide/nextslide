import React, { useState, useCallback, useEffect } from 'react';
import { ComponentInstance } from '@/types/components';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash, Table2, Minus } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import GradientPicker from '../GradientPicker';
import createSettingsEditor, { SpecificEditorProps } from './BaseSettingsEditor';
import { VirtualizedTable } from '../ui/virtualized-table';
import { useComponentOptimization } from '@/hooks/useComponentOptimization';
import { getComponentDefinition } from '@/registry';
import PropertyControlRenderer from './PropertyControlRenderer';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import GroupedDropdown from './GroupedDropdown';
import { FONT_CATEGORIES } from '@/registry/library/fonts';
import { FontLoadingService } from '@/services/FontLoadingService';

interface TableSettingsEditorProps {
  component: ComponentInstance;
  slideId: string;
}

type CellStyleInfo = {
  row: number;
  col: number;
  style: Record<string, any>;
};

type TableData = Array<Array<string | number>>;

// Define the specific editor component that will be wrapped by BaseSettingsEditor
const TableSettingsEditorContent: React.FC<SpecificEditorProps> = ({
  component,
  onUpdate,
  handlePropChange,
  saveComponentToHistory,
  isOpen,
  setIsOpen
}) => {
  const [tableEditorOpen, setTableEditorOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [cellStyleEditorOpen, setCellStyleEditorOpen] = useState(false);
  
  // Use the optimization hook to improve performance
  const {
    props: optimizedProps, 
    handlePropChange: optimizedPropChange,
    cachedComputation
  } = useComponentOptimization({
    component,
    onChange: (updates) => {
      if (updates.props) {
        onUpdate(updates.props);
      }
    },
    debounceTime: 100
  });
  
  // Default styles for a modern, clean table
  const defaultTableStyles = {
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 12,
    borderColor: "#e1e5e9",
    borderWidth: 1,
    cellPadding: 4,
    rowHeight: 32,
    headerBackgroundColor: "#f8fafc",
    headerTextColor: "#1f2937",
    cellBackgroundColor: "#ffffff",
    textColor: "#374151",
    alignment: "left",
    borderRadius: 8,
    boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
    stripedRows: false,
    hoverEffect: true,
  };

  // Extract table props with defaults
  const tableData = component.props.data || [];
  const headers = component.props.headers || [];
  const showHeader = component.props.showHeader !== false;
  
  // Apply default styles if not already present
  const tableStyles = {
    ...defaultTableStyles,
    ...(component.props.tableStyles || {})
  };
  
  const cellStyles = component.props.cellStyles || [];

  // Ensure backend fonts are synced for font dropdowns
  const [dynamicFontGroups, setDynamicFontGroups] = useState<Record<string, string[]> | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await FontLoadingService.syncDesignerFonts?.(); } catch {}
      if (!cancelled) {
        try { setDynamicFontGroups(FontLoadingService.getDedupedFontGroups?.() || null); } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, []);
  
  // Helper functions
  const addRow = () => {
    saveComponentToHistory("Before adding row");
    
    const newData = [...tableData];
    const columnCount = headers.length || (tableData[0]?.length || 0);
    
    // Create a new row with empty cells
    const newRow = Array(columnCount).fill("");
    newData.push(newRow);
    
    onUpdate({ data: newData });
  };
  
  const addColumn = () => {
    saveComponentToHistory("Before adding column");
    
    // Update headers
    const newHeaders = [...headers];
    newHeaders.push(`Column ${newHeaders.length + 1}`);
    
    // Update data rows
    const newData = tableData.map(row => [...row, ""]);
    
    onUpdate({ 
      headers: newHeaders,
      data: newData
    });
  };
  
  const removeRow = (rowIndex: number) => {
    saveComponentToHistory("Before removing row");
    
    const newData = [...tableData];
    newData.splice(rowIndex, 1);
    
    // Also remove any cell styles for this row
    const newCellStyles = cellStyles.filter(style => style.row !== rowIndex);
    
    // Update row indices for styles after the deleted row
    const updatedCellStyles = newCellStyles.map(style => {
      if (style.row > rowIndex) {
        return { ...style, row: style.row - 1 };
      }
      return style;
    });
    
    onUpdate({ 
      data: newData,
      cellStyles: updatedCellStyles
    });
  };
  
  const removeColumn = (colIndex: number) => {
    saveComponentToHistory("Before removing column");
    
    // Update headers
    const newHeaders = [...headers];
    newHeaders.splice(colIndex, 1);
    
    // Update data rows
    const newData = tableData.map(row => {
      const newRow = [...row];
      newRow.splice(colIndex, 1);
      return newRow;
    });
    
    // Also remove any cell styles for this column
    const newCellStyles = cellStyles.filter(style => style.col !== colIndex);
    
    // Update column indices for styles after the deleted column
    const updatedCellStyles = newCellStyles.map(style => {
      if (style.col > colIndex) {
        return { ...style, col: style.col - 1 };
      }
      return style;
    });
    
    onUpdate({ 
      headers: newHeaders,
      data: newData,
      cellStyles: updatedCellStyles
    });
  };
  
  const updateCellData = (rowIndex: number, colIndex: number, value: string) => {
    const newData = [...tableData];
    
    // Ensure the row exists
    if (!newData[rowIndex]) {
      newData[rowIndex] = [];
    }
    
    // Update the cell
    newData[rowIndex][colIndex] = value;
    
    onUpdate({ data: newData });
  };
  
  const updateHeaderData = (headerIndex: number, value: string) => {
    const newHeaders = [...headers];
    newHeaders[headerIndex] = value;
    
    onUpdate({ headers: newHeaders });
  };
  
  const updateCellStyle = (rowIndex: number, colIndex: number, styleKey: string, value: any) => {
    saveComponentToHistory("Before updating cell style");
    
    // Create a copy of cell styles
    const newCellStyles = [...cellStyles];
    
    // Find if we already have a style for this cell
    const cellStyleIndex = newCellStyles.findIndex(
      style => style.row === rowIndex && style.col === colIndex
    );
    
    if (cellStyleIndex >= 0) {
      // Update existing style
      newCellStyles[cellStyleIndex] = {
        ...newCellStyles[cellStyleIndex],
        style: {
          ...newCellStyles[cellStyleIndex].style,
          [styleKey]: value
        }
      };
    } else {
      // Create new style
      newCellStyles.push({
        row: rowIndex,
        col: colIndex,
        style: {
          [styleKey]: value
        }
      });
    }
    
    onUpdate({ cellStyles: newCellStyles });
  };
  
  const getCellStyle = (rowIndex: number, colIndex: number): Record<string, any> => {
    // Find cell style
    const cellStyle = cellStyles.find(
      style => style.row === rowIndex && style.col === colIndex
    );
    
    return cellStyle ? cellStyle.style : {};
  };
  
  // Generate columns for VirtualizedTable
  const generateVirtualizedColumns = useCallback(() => {
    const columns = [];
    
    // First add row numbers
    columns.push({
      id: 'rowIndex',
      header: '#',
      cell: (item: any, rowIndex: number) => (
        <span className="text-xs text-muted-foreground">{rowIndex + 1}</span>
      ),
      width: 40,
    });
    
    // Add columns based on headers or first row
    const columnCount = Math.max(headers.length, tableData[0]?.length || 0);
    
    for (let i = 0; i < columnCount; i++) {
      columns.push({
        id: i.toString(),
        header: showHeader ? (
          <div className="flex items-center gap-1 w-full"> 
            <input
              type="text"
              value={headers[i] || `Column ${i + 1}`}
              onChange={(e) => updateHeaderData(i, e.target.value)}
              className="w-full border-0 bg-transparent focus:outline-none focus:ring-0 p-0 text-xs font-medium"
              placeholder={`Column ${i + 1}`}
              onBlur={() => saveComponentToHistory(`Updated header ${i + 1}`)}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeColumn(i)}
              className="h-5 w-5 p-0 flex-shrink-0 opacity-50 hover:opacity-100 hover:bg-destructive/20 hover:text-destructive"
            >
              <Trash className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          `Column ${i + 1}`
        ),
        cell: (item: any, rowIndex: number) => {
          const value = item[i] || "";
          const cellStyle = getCellStyle(rowIndex, i);
          return (
            <div
              style={{
                ...cellStyle,
                textAlign: cellStyle.alignment || tableStyles.alignment || 'left'
              }}
              className="w-full h-full"
            >
              <input
                type="text"
                value={value}
                onChange={(e) => updateCellData(rowIndex, i, e.target.value)}
                className="w-full border-0 bg-transparent focus:outline-none focus:ring-0 p-0"
                style={{
                  fontWeight: cellStyle.fontWeight || 'normal',
                  color: cellStyle.color || tableStyles.textColor
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setSelectedCell({ row: rowIndex, col: i });
                  setCellStyleEditorOpen(true);
                }}
              />
            </div>
          );
        },
        width: 150,
      });
    }
    
    // Add action column
    columns.push({
      id: 'actions',
      header: '',
      cell: (item: any, rowIndex: number) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => removeRow(rowIndex)}
          className="h-7 w-7 p-0 opacity-70 hover:opacity-100 hover:bg-destructive/20 hover:text-destructive"
        >
          <Trash className="h-3.5 w-3.5" />
        </Button>
      ),
      width: 40,
    });
    
    return columns;
  }, [headers, tableData, showHeader, tableStyles, getCellStyle, updateCellData, removeRow, removeColumn, updateHeaderData, saveComponentToHistory]);
  
  // Prepare data for DataTable
  const prepareDataForTable = () => {
    return tableData.map((row, rowIndex) => {
      const rowData: Record<string, any> = {};
      
      // Ensure row is an array before iterating
      if (Array.isArray(row)) {
        row.forEach((cell, cellIndex) => {
          rowData[cellIndex] = cell;
        });
      } else {
        console.error(`TableSettingsEditor: Expected array for row ${rowIndex}, got:`, typeof row);
        // Potentially return default/empty data or handle error appropriately
      }
      
      return rowData;
    });
  };
  
  // Handle cell style updates with one function
  const onCellDataChange = (rowIndex: number, columnId: string, value: any) => {
    // Skip rowIndex and actions columns
    if (columnId === 'rowIndex' || columnId === 'actions') {
      return;
    }
    
    const colIndex = parseInt(columnId);
    if (!isNaN(colIndex)) {
      updateCellData(rowIndex, colIndex, value);
    }
  };
  
  // Instead of multiple individual updates
  const batchPropertyUpdates = (updates) => {
    saveComponentToHistory("Before batch update");
    onUpdate(updates);
  };

  return (
    <div className="space-y-2">
      {/* Table Content Editor */}
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <Label className="text-xs font-medium">Table Content</Label>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-6 px-2 text-xs"
            onClick={() => setTableEditorOpen(true)}
          >
            <Table2 className="h-3 w-3 mr-1" />
            Edit
          </Button>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Column controls */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Col</span>
            <button
              onClick={() => {
                const columnCount = headers.length || (tableData[0]?.length || 0);
                if (columnCount > 1) {
                  removeColumn(columnCount - 1);
                }
              }}
              className="h-6 w-6 rounded border border-red-200 bg-white text-red-500 hover:bg-red-50 hover:border-red-300 transition-colors flex items-center justify-center"
            >
              <Minus className="h-3 w-3" />
            </button>
            <button
              onClick={addColumn}
              className="h-6 w-6 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition-colors flex items-center justify-center"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          {/* Row controls */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Row</span>
            <button
              onClick={() => {
                if (tableData.length > 1) {
                  removeRow(tableData.length - 1);
                }
              }}
              className="h-6 w-6 rounded border border-red-200 bg-white text-red-500 hover:bg-red-50 hover:border-red-300 transition-colors flex items-center justify-center"
            >
              <Minus className="h-3 w-3" />
            </button>
            <button
              onClick={addRow}
              className="h-6 w-6 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition-colors flex items-center justify-center"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Header Toggle */}
      <div className="flex items-center justify-between py-1">
        <Label className="text-xs">Show Header</Label>
        <Switch 
          checked={showHeader} 
          onCheckedChange={(checked) => {
            saveComponentToHistory("Before toggling header visibility");
            onUpdate({ showHeader: checked });
          }}
          className="scale-75" 
        />
      </div>
      
      {/* Font Family */}
      <div className="space-y-1">
        <Label className="text-xs">Font Family</Label>
        <GroupedDropdown
          value={tableStyles.fontFamily || "Inter"}
          options={[]}
          groups={dynamicFontGroups || Object.fromEntries(
            Object.entries(FONT_CATEGORIES).map(([category, fonts]) => 
              [category, fonts.map(font => font.name)]
            )
          )}
          onChange={(value) => {
            saveComponentToHistory("Before changing font family");
            onUpdate({ 
              tableStyles: { 
                ...tableStyles, 
                fontFamily: value 
              } 
            });
          }}
          placeholder="Select font"
        />
      </div>

      {/* Text Settings */}
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-1.5 px-2 bg-secondary/50 rounded-md hover:bg-secondary/70 transition-colors">
          <span className="text-xs font-medium">Text & Alignment</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Font Size</Label>
              <div className="flex items-center">
                <Slider 
                  min={8} 
                  max={24} 
                  step={1} 
                  value={[tableStyles.fontSize || 14]} 
                  onValueChange={values => {
                    onUpdate({ 
                      tableStyles: { 
                        ...tableStyles, 
                        fontSize: values[0] 
                      } 
                    });
                  }}
                  onPointerDown={() => saveComponentToHistory("Before changing font size")}
                  className="flex-grow" 
                />
                <span className="text-xs ml-2 w-8 text-right">
                  {tableStyles.fontSize || 14}px
                </span>
              </div>
            </div>
            
            <div className="space-y-1">
              <Label className="text-xs">Text Align</Label>
              <Select 
                value={tableStyles.alignment || "left"} 
                onValueChange={(value) => {
                  saveComponentToHistory("Before changing text alignment");
                  onUpdate({ 
                    tableStyles: { 
                      ...tableStyles, 
                      alignment: value 
                    } 
                  });
                }}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
      
      {/* Layout Settings */}
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-1.5 px-2 bg-secondary/50 rounded-md hover:bg-secondary/70 transition-colors">
          <span className="text-xs font-medium">Layout & Spacing</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Row Height</Label>
              <div className="flex items-center">
                <Slider 
                  min={24} 
                  max={80} 
                  step={2} 
                  value={[tableStyles.rowHeight || 44]} 
                  onValueChange={values => {
                    onUpdate({ 
                      tableStyles: { 
                        ...tableStyles, 
                        rowHeight: values[0] 
                      } 
                    });
                  }}
                  onPointerDown={() => saveComponentToHistory("Before changing row height")}
                  className="flex-grow" 
                />
                <span className="text-xs ml-2 w-8 text-right">
                  {tableStyles.rowHeight || 44}px
                </span>
              </div>
            </div>
            
            <div className="space-y-1">
              <Label className="text-xs">Cell Padding</Label>
              <div className="flex items-center">
                <Slider 
                  min={2} 
                  max={20} 
                  step={1} 
                  value={[tableStyles.cellPadding || 12]} 
                  onValueChange={values => {
                    onUpdate({ 
                      tableStyles: { 
                        ...tableStyles, 
                        cellPadding: values[0] 
                      } 
                    });
                  }}
                  onPointerDown={() => saveComponentToHistory("Before changing cell padding")}
                  className="flex-grow" 
                />
                <span className="text-xs ml-2 w-8 text-right">
                  {tableStyles.cellPadding || 12}px
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                <Label className="text-xs">Border Width</Label>
                <div className="flex items-center">
                  <Slider 
                    min={0} 
                    max={5} 
                    step={1} 
                    value={[tableStyles.borderWidth ?? 1]} 
                    onValueChange={values => {
                      onUpdate({ 
                        tableStyles: { 
                          ...tableStyles, 
                          borderWidth: values[0] 
                        } 
                      });
                    }}
                    onPointerDown={() => saveComponentToHistory("Before changing border width")}
                    className="flex-grow" 
                  />
                  <span className="text-xs ml-2 w-6 text-right">
                    {tableStyles.borderWidth ?? 1}px
                  </span>
                </div>
              </div>
            
            <div className="space-y-1">
              <Label className="text-xs">Border Radius</Label>
              <div className="flex items-center">
                <Slider 
                  min={0} 
                  max={20} 
                  step={1} 
                  value={[tableStyles.borderRadius || 8]} 
                  onValueChange={values => {
                    onUpdate({ 
                      tableStyles: { 
                        ...tableStyles, 
                        borderRadius: values[0] 
                      } 
                    });
                  }}
                  onPointerDown={() => saveComponentToHistory("Before changing border radius")}
                  className="flex-grow" 
                />
                <span className="text-xs ml-2 w-6 text-right">
                  {tableStyles.borderRadius || 8}px
                </span>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
      
      {/* Visual Effects */}
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-1.5 px-2 bg-secondary/50 rounded-md hover:bg-secondary/70 transition-colors">
          <span className="text-xs font-medium">Visual Effects</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Striped Rows</Label>
              <Switch 
                checked={tableStyles.stripedRows || false} 
                onCheckedChange={(checked) => {
                  saveComponentToHistory("Before toggling striped rows");
                  onUpdate({ 
                    tableStyles: { 
                      ...tableStyles, 
                      stripedRows: checked 
                    } 
                  });
                }}
                className="scale-75" 
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Label className="text-xs">Hover Effect</Label>
              <Switch 
                checked={tableStyles.hoverEffect !== false} 
                onCheckedChange={(checked) => {
                  saveComponentToHistory("Before toggling hover effect");
                  onUpdate({ 
                    tableStyles: { 
                      ...tableStyles, 
                      hoverEffect: checked 
                    } 
                  });
                }}
                className="scale-75" 
              />
            </div>
          </div>
          
          <div className="space-y-1">
            <Label className="text-xs">Shadow</Label>
            <Select 
              value={
                tableStyles.boxShadow === "none" ? "none" :
                tableStyles.boxShadow === "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)" ? "medium" :
                tableStyles.boxShadow === "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)" ? "large" :
                "default"
              } 
              onValueChange={value => {
                saveComponentToHistory("Before changing box shadow");
                const shadows = {
                  none: "none",
                  default: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
                  medium: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                  large: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
                };
                onUpdate({ 
                  tableStyles: { 
                    ...tableStyles, 
                    boxShadow: shadows[value] || shadows.default
                  } 
                });
              }}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="default">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CollapsibleContent>
      </Collapsible>
      
      {/* Color Settings */}
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-1.5 px-2 bg-secondary/50 rounded-md hover:bg-secondary/70 transition-colors">
          <span className="text-xs font-medium">Colors</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2">
          {/* Compact color grid */}
          <div className="grid grid-cols-2 gap-2">
            {/* Border Color */}
            <div className="flex items-center gap-2">
              <Label className="text-xs flex-1">Border</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <div 
                    className="w-6 h-6 rounded border cursor-pointer" 
                    style={{ backgroundColor: tableStyles.borderColor || "#e1e5e9" }}
                    onClick={() => saveComponentToHistory("Before changing border color")}
                  />
                </PopoverTrigger>
                <PopoverContent className="p-0" onClick={(e) => e.stopPropagation()}>
                  <GradientPicker 
                    value={tableStyles.borderColor || "#e1e5e9"} 
                    onChange={color => {
                      onUpdate({ 
                        tableStyles: { 
                          ...tableStyles, 
                          borderColor: color 
                        } 
                      });
                    }}
                    onChangeComplete={() => saveComponentToHistory("After changing border color")}
                    initialTab="solid"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Header Background */}
            <div className="flex items-center gap-2">
              <Label className="text-xs flex-1">Header BG</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <div 
                    className="w-6 h-6 rounded border cursor-pointer" 
                    style={{ backgroundColor: tableStyles.headerBackgroundColor || "#f8fafc" }}
                    onClick={() => saveComponentToHistory("Before changing header background")}
                  />
                </PopoverTrigger>
                <PopoverContent className="p-0" onClick={(e) => e.stopPropagation()}>
                  <GradientPicker 
                    value={tableStyles.headerBackgroundColor || "#f8fafc"} 
                    onChange={color => {
                      onUpdate({ 
                        tableStyles: { 
                          ...tableStyles, 
                          headerBackgroundColor: color 
                        } 
                      });
                    }}
                    onChangeComplete={() => saveComponentToHistory("After changing header background")}
                    initialTab="solid"
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            {/* Header Text */}
            <div className="flex items-center gap-2">
              <Label className="text-xs flex-1">Header Text</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <div 
                    className="w-6 h-6 rounded border cursor-pointer" 
                    style={{ backgroundColor: tableStyles.headerTextColor || "#1f2937" }}
                    onClick={() => saveComponentToHistory("Before changing header text color")}
                  />
                </PopoverTrigger>
                <PopoverContent className="p-0" onClick={(e) => e.stopPropagation()}>
                  <GradientPicker 
                    value={tableStyles.headerTextColor || "#1f2937"} 
                    onChange={color => {
                      onUpdate({ 
                        tableStyles: { 
                          ...tableStyles, 
                          headerTextColor: color 
                        } 
                      });
                    }}
                    onChangeComplete={() => saveComponentToHistory("After changing header text color")}
                    initialTab="solid"
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            {/* Cell Background */}
            <div className="flex items-center gap-2">
              <Label className="text-xs flex-1">Cell BG</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <div 
                    className="w-6 h-6 rounded border cursor-pointer" 
                    style={{ backgroundColor: tableStyles.cellBackgroundColor || "#ffffff" }}
                    onClick={() => saveComponentToHistory("Before changing cell background")}
                  />
                </PopoverTrigger>
                <PopoverContent className="p-0" onClick={(e) => e.stopPropagation()}>
                  <GradientPicker 
                    value={tableStyles.cellBackgroundColor || "#ffffff"} 
                    onChange={color => {
                      onUpdate({ 
                        tableStyles: { 
                          ...tableStyles, 
                          cellBackgroundColor: color 
                        } 
                      });
                    }}
                    onChangeComplete={() => saveComponentToHistory("After changing cell background")}
                    initialTab="solid"
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            {/* Cell Text */}
            <div className="flex items-center gap-2">
              <Label className="text-xs flex-1">Cell Text</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <div 
                    className="w-6 h-6 rounded border cursor-pointer" 
                    style={{ backgroundColor: tableStyles.textColor || "#374151" }}
                    onClick={() => saveComponentToHistory("Before changing cell text color")}
                  />
                </PopoverTrigger>
                <PopoverContent className="p-0" onClick={(e) => e.stopPropagation()}>
                  <GradientPicker 
                    value={tableStyles.textColor || "#374151"} 
                    onChange={color => {
                      onUpdate({ 
                        tableStyles: { 
                          ...tableStyles, 
                          textColor: color 
                        } 
                      });
                    }}
                    onChangeComplete={() => saveComponentToHistory("After changing cell text color")}
                    initialTab="solid"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Dialog for Editing Table Data */}
      <Dialog open={tableEditorOpen} onOpenChange={setTableEditorOpen}>
        <DialogContent className="max-w-[90vw] lg:max-w-[800px] h-[80vh] flex flex-col p-0">
          <DialogHeader className="p-4 pb-2 border-b flex-shrink-0">
            <DialogTitle>Edit Table Data</DialogTitle>
            <DialogDescription>
              Modify rows, columns, and cell content. Right-click a cell for styling options.
            </DialogDescription>
          </DialogHeader>
          
          {/* Scroll container - remove p-4, keep flex-1, overflow-auto, relative */}
          <div className="flex-1 overflow-y-auto relative"> 
            {/* Add a new content wrapper with padding and spacing */}
            <div className="p-4 space-y-3">
              {/* Add Row / Add Column Buttons */}
              <div className="flex gap-2"> {/* Removed mb-3 as space-y handles it */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-6 px-1.5 text-[10px] flex items-center gap-0.5"
                  onClick={addRow}
                >
                  <Plus className="h-3 w-3" />
                  Add Row
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-6 px-1.5 text-[10px] flex items-center gap-0.5"
                  onClick={addColumn}
                >
                  <Plus className="h-3 w-3" />
                  Add Column
                </Button>
              </div>
              
              {/* Virtualized Table Wrapper (remains the same) */}
              <div className="rounded-md border overflow-hidden"> 
                <VirtualizedTable
                  data={prepareDataForTable()}
                  columns={generateVirtualizedColumns()}
                />
              </div>
            </div> {/* End content wrapper */}
          </div> {/* End scroll container */}
          
          <DialogFooter className="p-4 pt-2 border-t flex-shrink-0">
            <Button onClick={() => setTableEditorOpen(false)} variant="outline">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cell Style Editor Dialog */}
      {selectedCell && (
        <Dialog open={cellStyleEditorOpen} onOpenChange={setCellStyleEditorOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Edit Cell Style</DialogTitle>
              <DialogDescription>
                Customize the appearance of this cell.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-3 py-2">
              {/* Text Alignment */}
              <div className="space-y-2">
                <Label className="text-xs">Text Alignment</Label>
                <Select 
                  value={getCellStyle(selectedCell.row, selectedCell.col).alignment || tableStyles.alignment || "left"} 
                  onValueChange={value => {
                    saveComponentToHistory("Before changing cell alignment");
                    updateCellStyle(selectedCell.row, selectedCell.col, 'alignment', value);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Alignment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Font Weight */}
              <div className="space-y-2">
                <Label className="text-xs">Font Weight</Label>
                <Select 
                  value={getCellStyle(selectedCell.row, selectedCell.col).fontWeight || "normal"}
                  onValueChange={value => {
                    saveComponentToHistory("Before changing cell font weight");
                    updateCellStyle(selectedCell.row, selectedCell.col, 'fontWeight', value);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Font Weight" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="bold">Bold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Colors section */}
              <Collapsible defaultOpen={true}>
                <CollapsibleTrigger className="flex items-center justify-between w-full py-1 px-2 hover:bg-secondary/30 rounded-md transition-colors">
                  <Label className="text-xs font-medium">Colors</Label>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-3">
                  {/* Cell Background Color */}
                  <div className="flex items-center space-x-2">
                    <Label className="text-xs min-w-20">Background:</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <div 
                          className="w-6 h-6 rounded border cursor-pointer" 
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
                          onClick={() => saveComponentToHistory("Before changing cell background")}
                        >
                          <div 
                            className="w-full h-full rounded-sm" 
                            style={{
                              backgroundColor: getCellStyle(selectedCell.row, selectedCell.col).backgroundColor || tableStyles.cellBackgroundColor || "#ffffff"
                            }}
                          />
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="p-0" onClick={(e) => e.stopPropagation()}>
                        <div onClick={(e) => e.stopPropagation()}>
                          <GradientPicker 
                            value={getCellStyle(selectedCell.row, selectedCell.col).backgroundColor || tableStyles.cellBackgroundColor || "#ffffff"} 
                            onChange={color => {
                              updateCellStyle(selectedCell.row, selectedCell.col, 'backgroundColor', color);
                            }}
                            onChangeComplete={() => saveComponentToHistory("After changing cell background")}
                            initialTab="solid"
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Cell Text Color */}
                  <div className="flex items-center space-x-2">
                    <Label className="text-xs min-w-20">Text color:</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <div 
                          className="w-6 h-6 rounded border cursor-pointer" 
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
                          onClick={() => saveComponentToHistory("Before changing cell text color")}
                        >
                          <div 
                            className="w-full h-full rounded-sm" 
                            style={{
                              backgroundColor: getCellStyle(selectedCell.row, selectedCell.col).color || tableStyles.textColor || "#000000"
                            }}
                          />
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="p-0" onClick={(e) => e.stopPropagation()}>
                        <div onClick={(e) => e.stopPropagation()}>
                          <GradientPicker 
                            value={getCellStyle(selectedCell.row, selectedCell.col).color || tableStyles.textColor || "#000000"} 
                            onChange={color => {
                              updateCellStyle(selectedCell.row, selectedCell.col, 'color', color);
                            }}
                            onChangeComplete={() => saveComponentToHistory("After changing cell text color")}
                            initialTab="solid"
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setCellStyleEditorOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={() => {
                saveComponentToHistory("Cell style updated");
                setCellStyleEditorOpen(false);
              }}>
                Apply Style
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

// Create the enhanced settings editor with our base editor
const TableSettingsEditor = createSettingsEditor(TableSettingsEditorContent, {
  includeBorderControls: false,  // We handle borders in our own UI
  includeShadowControls: false,  // We handle shadows in our own UI
  includeColorControls: false    // We handle colors in our own UI
});

export default TableSettingsEditor;