import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, Table2 } from 'lucide-react';
import { SlideOutline, DeckOutline } from '@/types/SlideTypes';

interface TableDataEditorProps {
  slide?: SlideOutline;
  setCurrentOutline?: React.Dispatch<React.SetStateAction<DeckOutline | null>>;
  tableData?: {
    headers: string[];
    data: string[][];
    title?: string;
  };
  onChangeTableData?: (data: { headers: string[]; data: string[][]; title?: string }) => void;
}

const TableDataEditor: React.FC<TableDataEditorProps> = ({
  slide,
  setCurrentOutline,
  tableData: externalTableData,
  onChangeTableData
}) => {
  // Get table data from slide or external prop
  const getCurrentTableData = () => {
    if (externalTableData) return externalTableData;
    if (slide?.tableData) return slide.tableData;

    // Default empty table
    return {
      headers: ['Column 1', 'Column 2', 'Column 3'],
      data: [
        ['Data 1', 'Data 2', 'Data 3'],
        ['Data 4', 'Data 5', 'Data 6']
      ],
      title: ''
    };
  };

  const [localData, setLocalData] = useState(getCurrentTableData());

  const updateTableData = (newData: { headers: string[]; data: string[][]; title?: string }) => {
    setLocalData(newData);

    if (onChangeTableData) {
      onChangeTableData(newData);
      return;
    }

    if (setCurrentOutline && slide) {
      setCurrentOutline(prev => {
        if (!prev) return null;

        return {
          ...prev,
          slides: prev.slides.map(s => {
            if (s.id !== slide.id) return s;
            return {
              ...s,
              tableData: newData
            };
          })
        };
      });
    }
  };

  const addColumn = () => {
    const newHeaders = [...localData.headers, `Column ${localData.headers.length + 1}`];
    const newData = localData.data.map(row => [...row, '']);
    updateTableData({ ...localData, headers: newHeaders, data: newData });
  };

  const addRow = () => {
    const newRow = localData.headers.map(() => '');
    updateTableData({ ...localData, data: [...localData.data, newRow] });
  };

  const removeColumn = (colIndex: number) => {
    if (localData.headers.length <= 1) return;
    const newHeaders = localData.headers.filter((_, i) => i !== colIndex);
    const newData = localData.data.map(row => row.filter((_, i) => i !== colIndex));
    updateTableData({ ...localData, headers: newHeaders, data: newData });
  };

  const removeRow = (rowIndex: number) => {
    if (localData.data.length <= 1) return;
    const newData = localData.data.filter((_, i) => i !== rowIndex);
    updateTableData({ ...localData, data: newData });
  };

  const updateHeader = (colIndex: number, value: string) => {
    const newHeaders = [...localData.headers];
    newHeaders[colIndex] = value;
    updateTableData({ ...localData, headers: newHeaders });
  };

  const updateCell = (rowIndex: number, colIndex: number, value: string) => {
    const newData = localData.data.map((row, rIdx) =>
      rIdx === rowIndex
        ? row.map((cell, cIdx) => cIdx === colIndex ? value : cell)
        : row
    );
    updateTableData({ ...localData, data: newData });
  };

  return (
    <div className="mt-3 p-2 border border-dashed border-purple-300 dark:border-purple-700 rounded-md bg-purple-50/50 dark:bg-purple-900/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-purple-600 dark:text-purple-400 flex items-center">
          <Table2 className="h-3 w-3 mr-1" />
          Table Data {localData.title ? `(${localData.title})` : ''}
        </h4>

        <div className="flex gap-1">
          <button
            onClick={addColumn}
            className="text-[10px] px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/50 flex items-center"
          >
            <Plus className="h-2.5 w-2.5 mr-0.5" /> Col
          </button>
          <button
            onClick={addRow}
            className="text-[10px] px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/50 flex items-center"
          >
            <Plus className="h-2.5 w-2.5 mr-0.5" /> Row
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          {/* Headers */}
          <thead>
            <tr className="bg-purple-100/70 dark:bg-purple-800/30">
              {localData.headers.map((header, colIndex) => (
                <th key={colIndex} className="p-1 border border-purple-200 dark:border-purple-700 relative group">
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={header}
                      onChange={(e) => updateHeader(colIndex, e.target.value)}
                      className="flex-1 text-[10px] font-semibold bg-transparent border-0 p-0.5 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:focus:ring-purple-400 rounded text-purple-700 dark:text-purple-300"
                      placeholder={`Column ${colIndex + 1}`}
                    />
                    {localData.headers.length > 1 && (
                      <button
                        onClick={() => removeColumn(colIndex)}
                        className="opacity-0 group-hover:opacity-100 text-purple-500 hover:text-red-500 dark:text-purple-400 dark:hover:text-red-400 transition-opacity"
                        title="Remove column"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th className="p-0.5 border border-purple-200 dark:border-purple-700 w-6"></th>
            </tr>
          </thead>

          {/* Data Rows */}
          <tbody>
            {localData.data.map((row, rowIndex) => (
              <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white/50 dark:bg-transparent' : 'bg-purple-50/30 dark:bg-purple-900/10'}>
                {row.map((cell, colIndex) => (
                  <td key={colIndex} className="p-0.5 border border-purple-200 dark:border-purple-700">
                    <input
                      type="text"
                      value={cell}
                      onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                      className="w-full text-[10px] bg-transparent border-0 p-0.5 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:focus:ring-purple-400 rounded"
                      placeholder="-"
                    />
                  </td>
                ))}
                <td className="p-0 border border-purple-200 dark:border-purple-700 text-center">
                  {localData.data.length > 1 && (
                    <button
                      onClick={() => removeRow(rowIndex)}
                      className="text-purple-500 hover:text-red-500 dark:text-purple-400 dark:hover:text-red-400"
                      title="Remove row"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-1 text-[9px] text-purple-600/70 dark:text-purple-400/70">
        💡 Tip: Use tables for comparisons, specs, pricing, or competitive analysis
      </div>
    </div>
  );
};

export default TableDataEditor;
