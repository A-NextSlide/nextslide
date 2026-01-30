import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Check, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

interface AgentDataTableProps {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  truncated?: boolean;
  entityLinks?: Record<string, 'user' | 'deck'>;
}

const MAX_CELL_LENGTH = 120;

const AgentDataTable: React.FC<AgentDataTableProps> = ({
  columns,
  rows,
  rowCount,
  truncated,
  entityLinks = {},
}) => {
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());

  const copyToClipboard = (value: string, cellId: string) => {
    navigator.clipboard.writeText(value);
    setCopiedCell(cellId);
    setTimeout(() => setCopiedCell(null), 1500);
  };

  const toggleExpand = (cellId: string) => {
    setExpandedCells(prev => {
      const next = new Set(prev);
      if (next.has(cellId)) next.delete(cellId);
      else next.add(cellId);
      return next;
    });
  };

  const renderCellValue = (col: string, value: any, rowIdx: number) => {
    if (value === null || value === undefined) {
      return <span className="text-[#999] italic">null</span>;
    }

    const cellId = `${rowIdx}-${col}`;
    const strValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    const isLong = strValue.length > MAX_CELL_LENGTH;
    const isExpanded = expandedCells.has(cellId);

    // Entity link rendering
    const linkType = entityLinks[col];
    if (linkType === 'user' && typeof value === 'string') {
      return (
        <Link
          to={`/admin/users/${value}`}
          className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 font-mono text-xs"
        >
          {value.slice(0, 8)}...
          <ExternalLink className="h-3 w-3" />
        </Link>
      );
    }
    if (linkType === 'deck' && typeof value === 'string') {
      return (
        <Link
          to="/admin/decks"
          className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 font-mono text-xs"
        >
          {value.slice(0, 8)}...
          <ExternalLink className="h-3 w-3" />
        </Link>
      );
    }

    // Boolean rendering
    if (typeof value === 'boolean') {
      return (
        <span className={value ? 'text-green-600 dark:text-green-400' : 'text-[#999]'}>
          {value ? 'true' : 'false'}
        </span>
      );
    }

    // Number rendering
    if (typeof value === 'number') {
      return <span className="font-mono tabular-nums">{value.toLocaleString()}</span>;
    }

    // Long text / JSON
    if (isLong && !isExpanded) {
      return (
        <span className="group">
          <span className="font-mono text-xs">{strValue.slice(0, MAX_CELL_LENGTH)}</span>
          <button
            onClick={() => toggleExpand(cellId)}
            className="ml-1 text-blue-500 hover:text-blue-700 text-xs inline-flex items-center"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </span>
      );
    }

    if (isLong && isExpanded) {
      return (
        <span>
          <pre className="font-mono text-xs whitespace-pre-wrap max-w-md">{strValue}</pre>
          <button
            onClick={() => toggleExpand(cellId)}
            className="text-blue-500 hover:text-blue-700 text-xs inline-flex items-center mt-1"
          >
            collapse <ChevronUp className="h-3 w-3 ml-0.5" />
          </button>
        </span>
      );
    }

    return <span className="font-mono text-xs">{strValue}</span>;
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-[#eaeaea] dark:border-[#333] bg-white dark:bg-[#111] p-6 text-center text-sm text-[#666]">
        No results returned.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#eaeaea] dark:border-[#333] bg-white dark:bg-[#111] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#eaeaea] dark:border-[#333] bg-[#fafafa] dark:bg-[#0a0a0a] flex items-center justify-between">
        <span className="text-xs text-[#666] dark:text-[#888]">
          {rowCount} row{rowCount !== 1 ? 's' : ''}
          {truncated && <span className="text-amber-500 ml-1">(results capped at 500)</span>}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#eaeaea] dark:border-[#333]">
              {columns.map(col => (
                <th
                  key={col}
                  className="px-3 py-2 text-left text-xs font-medium text-[#666] dark:text-[#888] whitespace-nowrap bg-[#fafafa] dark:bg-[#0a0a0a]"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="border-b border-[#eaeaea] dark:border-[#333] last:border-0 hover:bg-[#f5f5f5] dark:hover:bg-[#1a1a1a] transition-colors"
              >
                {columns.map(col => {
                  const cellId = `${rowIdx}-${col}`;
                  const rawValue = row[col];
                  const strValue = rawValue === null || rawValue === undefined
                    ? ''
                    : typeof rawValue === 'object'
                      ? JSON.stringify(rawValue)
                      : String(rawValue);

                  return (
                    <td
                      key={col}
                      className="px-3 py-2 align-top max-w-xs group relative"
                    >
                      {renderCellValue(col, rawValue, rowIdx)}
                      {strValue && (
                        <button
                          onClick={() => copyToClipboard(strValue, cellId)}
                          className="absolute top-2 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-[#eaeaea] dark:hover:bg-[#333]"
                          title="Copy"
                        >
                          {copiedCell === cellId ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3 text-[#999]" />
                          )}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AgentDataTable;
