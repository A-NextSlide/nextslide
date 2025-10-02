import React, { useState } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  getPaginationRowModel,
  VisibilityState,
  getFilteredRowModel,
  RowData,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  SortAsc,
  SortDesc,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Define a generic row data type
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData extends RowData> {
    updateData?: (rowIndex: number, columnId: string, value: unknown) => void;
    deleteRow?: (rowIndex: number) => void;
    addRow?: () => void;
    getCellStyle?: (rowIndex: number, columnId: number) => Record<string, any>;
    getDefaultCellStyle?: () => Record<string, any>;
    onCellStyleEdit?: (rowIndex: number, columnId: number) => void;
  }
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onRowDelete?: (rowIndex: number) => void;
  onRowAdd?: () => void;
  onDataChange?: (rowIndex: number, columnId: string, value: unknown) => void;
  enableSorting?: boolean;
  enableFiltering?: boolean;
  enablePagination?: boolean;
  showSearchFilter?: boolean;
  enableRowSelection?: boolean;
  maxHeight?: string | number;
  emptyMessage?: string;
  meta?: {
    updateData?: (rowIndex: number, columnId: string, value: unknown) => void;
    deleteRow?: (rowIndex: number) => void;
    addRow?: () => void;
    getCellStyle?: (rowIndex: number, columnId: number) => Record<string, any>;
    getDefaultCellStyle?: () => Record<string, any>;
    onCellStyleEdit?: (rowIndex: number, columnId: number) => void;
  };
}

export function DataTable<TData, TValue>({
  columns,
  data,
  onRowDelete,
  onRowAdd,
  onDataChange,
  enableSorting = true,
  enableFiltering = true,
  enablePagination = false,
  showSearchFilter = false,
  enableRowSelection = false,
  maxHeight,
  emptyMessage = "No data available",
  meta
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getFilteredRowModel: enableFiltering ? getFilteredRowModel() : undefined,
    onPaginationChange: setPagination,
    getPaginationRowModel: enablePagination ? getPaginationRowModel() : undefined,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      globalFilter,
      pagination: enablePagination ? pagination : undefined,
    },
    meta: meta || {
      updateData: onDataChange,
      deleteRow: onRowDelete,
      addRow: onRowAdd,
    },
    debugTable: false,
  });

  return (
    <div className="w-full space-y-2">
      {showSearchFilter && (
        <div className="flex items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-8 h-9 text-xs"
            />
            {globalFilter && (
              <X
                className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => setGlobalFilter("")}
              />
            )}
          </div>
        </div>
      )}

      <div className={cn("rounded-md border", maxHeight ? "overflow-hidden" : "")}>
        <ScrollArea style={{ height: maxHeight }}>
          <Table className="min-w-full">
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-b-0">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "h-8 p-2 text-xs font-medium",
                        header.column.getCanSort() && "cursor-pointer select-none"
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center justify-between">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                        {header.column.getCanSort() && (
                          <div className="pl-1 opacity-60">
                            {{
                              asc: <SortAsc className="h-3.5 w-3.5" />,
                              desc: <SortDesc className="h-3.5 w-3.5" />,
                            }[header.column.getIsSorted() as string] ?? null}
                          </div>
                        )}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className="border-b-0 hover:bg-muted/30"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="p-2 text-xs">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground text-xs"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {enablePagination && (
        <div className="flex items-center justify-between space-x-2 py-1">
          <div className="flex text-xs text-muted-foreground">
            Showing{" "}
            <span className="font-semibold text-foreground px-1">
              {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}
            </span>
            to{" "}
            <span className="font-semibold text-foreground px-1">
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                table.getFilteredRowModel().rows.length
              )}
            </span>
            of{" "}
            <span className="font-semibold text-foreground px-1">
              {table.getFilteredRowModel().rows.length}
            </span>
            entries
          </div>
          <div className="flex space-x-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="flex h-7 items-center justify-center px-3 text-xs">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Export editable cell components
export const EditableCell = <TData extends {}>({
  getValue,
  row,
  column,
  table,
}: {
  getValue: () => any;
  row: { index: number };
  column: { id: string };
  table: any;
}) => {
  const initialValue = getValue();
  const [value, setValue] = useState(initialValue);
  
  const onBlur = () => {
    table.options.meta?.updateData?.(row.index, column.id, value);
  };

  // Get the cell style information if available
  const cellStyle = table.options.meta?.getCellStyle?.(row.index, parseInt(column.id));
  const defaultStyles = table.options.meta?.getDefaultCellStyle?.();
  
  // Handle right-click for style editing
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (table.options.meta?.onCellStyleEdit) {
      table.options.meta.onCellStyleEdit(row.index, parseInt(column.id));
    }
  };
  
  // Determine text color and background color based on cell style
  const textColor = cellStyle?.color || defaultStyles?.textColor || undefined;
  const bgColor = cellStyle?.backgroundColor || defaultStyles?.cellBackgroundColor || undefined;
  const textAlign = cellStyle?.alignment || defaultStyles?.alignment || 'left';
  const fontWeight = cellStyle?.fontWeight || 'normal';
  
  return (
    <div
      className="relative"
      onContextMenu={handleContextMenu}
    >
      <Input
        value={value === undefined || value === null ? "" : value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={onBlur}
        className="h-7 text-xs py-1 px-2 bg-transparent border-muted-foreground/30"
        style={{
          color: textColor,
          backgroundColor: bgColor,
          textAlign: textAlign as any,
          fontWeight: fontWeight as any
        }}
      />
      {/* Add visual indicator for styled cells */}
      {(textColor || bgColor || textAlign !== 'left' || fontWeight !== 'normal') && (
        <div 
          className="absolute top-0 right-0 w-2 h-2 rounded-full bg-primary"
          style={{ transform: "translate(25%, -25%)" }}
        />
      )}
    </div>
  );
};

// Export numeric cell component
export const NumericCell = <TData extends {}>({
  getValue,
  row,
  column,
  table,
}: {
  getValue: () => any;
  row: { index: number };
  column: { id: string };
  table: any;
}) => {
  const initialValue = getValue();
  const [value, setValue] = useState(initialValue);
  
  const onBlur = () => {
    const numValue = value === "" ? 0 : parseFloat(value) || 0;
    table.options.meta?.updateData?.(row.index, column.id, numValue);
  };

  // Get the cell style information if available
  const cellStyle = table.options.meta?.getCellStyle?.(row.index, parseInt(column.id));
  const defaultStyles = table.options.meta?.getDefaultCellStyle?.();
  
  // Handle right-click for style editing
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (table.options.meta?.onCellStyleEdit) {
      table.options.meta.onCellStyleEdit(row.index, parseInt(column.id));
    }
  };
  
  // Determine text color and background color based on cell style
  const textColor = cellStyle?.color || defaultStyles?.textColor || undefined;
  const bgColor = cellStyle?.backgroundColor || defaultStyles?.cellBackgroundColor || undefined;
  const textAlign = cellStyle?.alignment || defaultStyles?.alignment || 'left';
  const fontWeight = cellStyle?.fontWeight || 'normal';

  return (
    <div
      className="relative"
      onContextMenu={handleContextMenu}
    >
      <Input
        value={value === undefined || value === null ? "" : value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={onBlur}
        type="number"
        className="h-7 text-xs py-1 px-2 bg-transparent border-muted-foreground/30"
        style={{
          color: textColor,
          backgroundColor: bgColor,
          textAlign: textAlign as any,
          fontWeight: fontWeight as any
        }}
      />
      {/* Add visual indicator for styled cells */}
      {(textColor || bgColor || textAlign !== 'left' || fontWeight !== 'normal') && (
        <div 
          className="absolute top-0 right-0 w-2 h-2 rounded-full bg-primary"
          style={{ transform: "translate(25%, -25%)" }}
        />
      )}
    </div>
  );
};

// Helper function to create a column definition
export function createColumn<TData, TValue>(
  accessorKey: keyof TData,
  header: string,
  cell?: any,
  additional?: Partial<ColumnDef<TData, TValue>>
): ColumnDef<TData, TValue> {
  return {
    accessorKey: accessorKey as string,
    header,
    cell: cell,
    ...additional,
  };
}