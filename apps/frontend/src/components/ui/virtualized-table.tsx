import React, { useRef, useState, useCallback, useLayoutEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface VirtualizedTableProps<T> {
  /**
   * Data array to display in the table
   */
  data: T[];
  
  /**
   * Column definitions
   */
  columns: {
    id: string;
    header: string | React.ReactNode;
    cell: (item: T, rowIndex: number) => React.ReactNode;
    width?: number;
  }[];
  
  /**
   * Fixed height of the table in pixels
   */
  height?: number;
  
  /**
   * Default row height in pixels for virtualization calculations
   */
  rowHeight?: number;
  
  /**
   * CSS class name for the wrapper div
   */
  className?: string;
  
  /**
   * Empty state message when no data is present
   */
  emptyMessage?: string;
  
  /**
   * Whether to show a header row
   */
  showHeader?: boolean;
  
  /**
   * Optional callback when a row is clicked
   */
  onRowClick?: (item: T, index: number) => void;
  
  /**
   * Optional row selection state
   */
  selectedRowIndex?: number;
  
  /**
   * Function to determine custom row classes
   */
  getRowClassName?: (item: T, index: number) => string;
  
  /**
   * Placeholder to show while data is loading
   */
  loadingPlaceholder?: React.ReactNode;
  
  /**
   * Whether data is currently loading
   */
  isLoading?: boolean;
}

/**
 * A virtualized table component for efficiently rendering large datasets
 * Uses react-virtual for windowing to only render visible rows
 */
export function VirtualizedTable<T>({
  data,
  columns,
  height = 400,
  rowHeight = 35,
  className,
  emptyMessage = "No data available",
  showHeader = true,
  onRowClick,
  selectedRowIndex,
  getRowClassName,
  loadingPlaceholder,
  isLoading = false,
}: VirtualizedTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLTableSectionElement>(null);
  const [headerOffset, setHeaderOffset] = useState(0);
  
  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });
  
  useLayoutEffect(() => {
    if (showHeader && headerRef.current) {
      setHeaderOffset(headerRef.current.offsetHeight);
    } else {
      setHeaderOffset(0);
    }
  }, [showHeader, columns]);
  
  const handleRowClick = useCallback(
    (item: T, index: number) => {
      if (onRowClick) {
        onRowClick(item, index);
      }
    },
    [onRowClick]
  );
  
  const totalWidth = columns.reduce((acc, column) => acc + (column.width || 150), 0);
  
  if (isLoading && loadingPlaceholder) {
    return (
      <div className={cn("border rounded-md", className)} style={{ height }}>
        {loadingPlaceholder}
      </div>
    );
  }
  
  if (!isLoading && data.length === 0) {
    return (
      <div className={cn("border rounded-md flex items-center justify-center", className)} style={{ height }}>
        <p className="text-muted-foreground text-sm">{emptyMessage}</p>
      </div>
    );
  }
  
  return (
    <div
      ref={parentRef}
      className={cn("border rounded-md overflow-auto", className)}
      style={{ height }}
    >
      <div
        style={{
          width: totalWidth > 0 ? totalWidth : '100%',
          height: `${rowVirtualizer.getTotalSize() + headerOffset}px`,
          position: 'relative',
        }}
      >
        <table className="w-full border-collapse">
          {showHeader && (
            <thead ref={headerRef} className="z-10 bg-muted/50">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.id}
                    className="p-2 text-xs font-medium text-left"
                    style={{ width: column.width || 150 }}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          
          <tbody>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = data[virtualRow.index];
              return (
                <tr
                  key={virtualRow.index}
                  data-index={virtualRow.index}
                  className={cn(
                    "hover:bg-muted/30 transition-colors",
                    selectedRowIndex === virtualRow.index && "bg-primary/10",
                    getRowClassName && getRowClassName(item, virtualRow.index)
                  )}
                  onClick={() => handleRowClick(item, virtualRow.index)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start + headerOffset}px)`,
                  }}
                >
                  {columns.map((column) => (
                    <td
                      key={`${virtualRow.index}-${column.id}`}
                      className="p-2 text-xs border-b"
                      style={{ width: column.width || 150 }}
                    >
                      {column.cell(item, virtualRow.index)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
} 