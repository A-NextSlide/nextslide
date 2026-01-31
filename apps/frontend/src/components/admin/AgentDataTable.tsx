import React, { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Check, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import DeckThumbnail from '@/components/deck/DeckThumbnail';
import { CompleteDeckData } from '@/types/DeckTypes';

interface AgentDataTableProps {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  truncated?: boolean;
  entityLinks?: Record<string, 'user' | 'deck'>;
}

const MAX_VISIBLE_ROWS = 25;

const SLIDE_DATA_COLUMNS = new Set([
  'first_slide', 'slides', 'slide_data', 'slide_content', 'components',
]);

// Columns whose content is typically very wide — give them wider defaults
const WIDE_COLUMNS = new Set([
  'data', 'notes', 'conversation_history', 'metadata', 'api_response',
  'first_slide', 'slides', 'slide_data', 'components', 'content',
  'raw_user_meta_data', 'raw_app_meta_data',
]);

const AgentDataTable: React.FC<AgentDataTableProps> = ({
  columns,
  rows,
  rowCount,
  truncated,
  entityLinks = {},
}) => {
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [expandedCell, setExpandedCell] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const thumbnailCol = useMemo(() => {
    for (const col of columns) {
      if (SLIDE_DATA_COLUMNS.has(col.toLowerCase())) return col;
    }
    return null;
  }, [columns]);

  // Columns to show in the table (exclude slide data col — rendered as thumbnail)
  const tableColumns = useMemo(
    () => (thumbnailCol ? columns.filter(c => c !== thumbnailCol) : columns),
    [columns, thumbnailCol],
  );

  const visibleRows = showAll ? rows : rows.slice(0, MAX_VISIBLE_ROWS);
  const hasMore = rows.length > MAX_VISIBLE_ROWS && !showAll;

  const copyToClipboard = useCallback((value: string, cellId: string) => {
    navigator.clipboard.writeText(value);
    setCopiedCell(cellId);
    setTimeout(() => setCopiedCell(null), 1500);
  }, []);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-[#eaeaea] dark:border-[#333] bg-white dark:bg-[#111] p-3 text-center text-[11px] text-[#888]">
        No results returned.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#eaeaea] dark:border-[#333] bg-white dark:bg-[#111] overflow-hidden">
      {/* Row count bar */}
      <div className="px-2 py-1 border-b border-[#eaeaea] dark:border-[#333] bg-[#fafafa] dark:bg-[#0a0a0a]">
        <span className="text-[10px] text-[#888]">
          {rowCount} row{rowCount !== 1 ? 's' : ''}
          {truncated && <span className="text-amber-500 ml-1">(capped at 1,000)</span>}
        </span>
      </div>

      {/* Single scroll container — both axes, capped height */}
      <div className="overflow-auto max-h-[60vh]">
        <table className="border-collapse" style={{ minWidth: 'max-content' }}>
          <thead className="sticky top-0 z-10">
            <tr>
              {thumbnailCol && (
                <th className="px-2 py-[5px] text-[10px] font-medium text-[#888] whitespace-nowrap bg-[#fafafa] dark:bg-[#0a0a0a] border-b border-[#eaeaea] dark:border-[#333] text-left w-14">
                  Slide
                </th>
              )}
              {tableColumns.map(col => (
                <th
                  key={col}
                  className="px-2 py-[5px] text-[10px] font-medium text-[#888] whitespace-nowrap bg-[#fafafa] dark:bg-[#0a0a0a] border-b border-[#eaeaea] dark:border-[#333] text-left"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-[#f0f0f0] dark:border-[#1e1e1e] last:border-0 hover:bg-[#f8f8f8] dark:hover:bg-[#151515]"
              >
                {thumbnailCol && (
                  <td className="px-2 py-[3px] w-14 align-middle">
                    <SlideThumbnailCell row={row} slideCol={thumbnailCol} />
                  </td>
                )}
                {tableColumns.map(col => (
                  <Cell
                    key={col}
                    col={col}
                    value={row[col]}
                    rowIdx={ri}
                    entityLinks={entityLinks}
                    isWide={WIDE_COLUMNS.has(col.toLowerCase())}
                    expanded={expandedCell === `${ri}-${col}`}
                    onToggleExpand={() =>
                      setExpandedCell(prev => (prev === `${ri}-${col}` ? null : `${ri}-${col}`))
                    }
                    copiedCell={copiedCell}
                    onCopy={copyToClipboard}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Show more / collapse */}
      {(hasMore || (showAll && rows.length > MAX_VISIBLE_ROWS)) && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="w-full px-2 py-1.5 text-[10px] font-medium text-[#FF4301] hover:bg-[#FF4301]/5 border-t border-[#eaeaea] dark:border-[#333] transition-colors"
        >
          {showAll ? `Collapse to ${MAX_VISIBLE_ROWS} rows` : `Show all ${rows.length} rows`}
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Single cell
// ---------------------------------------------------------------------------
const TRUNCATE_LEN = 80;

const Cell: React.FC<{
  col: string;
  value: any;
  rowIdx: number;
  entityLinks: Record<string, string>;
  isWide: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  copiedCell: string | null;
  onCopy: (v: string, id: string) => void;
}> = ({ col, value, rowIdx, entityLinks, isWide, expanded, onToggleExpand, copiedCell, onCopy }) => {
  const cellId = `${rowIdx}-${col}`;

  // Stringify once
  const str = value === null || value === undefined
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);

  const isLong = str.length > TRUNCATE_LEN;

  const inner = (() => {
    if (value === null || value === undefined) {
      return <span className="text-[#bbb] dark:text-[#555] italic">null</span>;
    }

    // Entity links
    const linkType = entityLinks[col];
    if (linkType === 'user' && typeof value === 'string') {
      return (
        <Link
          to={`/admin/users/${value}`}
          className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
        >
          {value.slice(0, 8)}&hellip;
          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
        </Link>
      );
    }
    if (linkType === 'deck' && typeof value === 'string') {
      return (
        <Link
          to={`/deck/${value}`}
          className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
        >
          {value.slice(0, 8)}&hellip;
          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
        </Link>
      );
    }

    if (typeof value === 'boolean') {
      return <span className={value ? 'text-green-600 dark:text-green-400' : 'text-[#bbb] dark:text-[#555]'}>{String(value)}</span>;
    }

    if (typeof value === 'number') {
      return <span className="tabular-nums">{value.toLocaleString()}</span>;
    }

    // Expanded long value — shown in a popover-like box below the row
    if (isLong && expanded) {
      return (
        <span>
          <button onClick={onToggleExpand} className="text-blue-500 hover:text-blue-700 inline-flex items-center gap-0.5">
            {str.slice(0, TRUNCATE_LEN)}&hellip; <ChevronUp className="h-3 w-3 shrink-0" />
          </button>
          <pre className="mt-1 p-1.5 rounded bg-[#f5f5f5] dark:bg-[#1a1a1a] border border-[#eaeaea] dark:border-[#333] whitespace-pre-wrap break-all max-w-lg text-[10px] leading-tight max-h-48 overflow-auto">
            {typeof value === 'object' ? JSON.stringify(value, null, 2) : str}
          </pre>
        </span>
      );
    }

    // Truncated
    if (isLong) {
      return (
        <button onClick={onToggleExpand} className="text-left text-blue-500 hover:text-blue-700 inline-flex items-center gap-0.5">
          <span className="truncate">{str.slice(0, TRUNCATE_LEN)}&hellip;</span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </button>
      );
    }

    return <span>{str}</span>;
  })();

  return (
    <td
      className="px-2 py-[3px] align-top whitespace-nowrap group relative"
      style={isWide ? { maxWidth: 200 } : undefined}
    >
      <div className="font-mono text-[11px] leading-[18px] truncate" style={isLong || isWide ? { maxWidth: 200 } : undefined}>
        {inner}
      </div>
      {/* Copy button */}
      {str && (
        <button
          onClick={() => onCopy(str, cellId)}
          className="absolute top-[3px] right-0.5 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#eee] dark:hover:bg-[#333] transition-opacity"
          title="Copy"
        >
          {copiedCell === cellId
            ? <Check className="h-2.5 w-2.5 text-green-500" />
            : <Copy className="h-2.5 w-2.5 text-[#bbb]" />}
        </button>
      )}
    </td>
  );
};

// ---------------------------------------------------------------------------
// Slide thumbnail
// ---------------------------------------------------------------------------
const SlideThumbnailCell: React.FC<{ row: Record<string, any>; slideCol: string }> = ({ row, slideCol }) => {
  const deckData = useMemo(() => {
    const slideVal = row[slideCol];
    if (!slideVal) return null;
    let firstSlide = slideVal;
    if (typeof firstSlide === 'string') {
      try { firstSlide = JSON.parse(firstSlide); } catch { return null; }
    }
    if (Array.isArray(firstSlide)) {
      firstSlide = firstSlide[0];
      if (!firstSlide) return null;
    }
    return {
      uuid: row.uuid || row.id || row.deck_id || '',
      name: row.name || row.title || '',
      first_slide: firstSlide,
      slides: [],
    } as unknown as CompleteDeckData;
  }, [row, slideCol]);

  if (!deckData) {
    return <div className="w-10 h-6 rounded-sm bg-[#f0f0f0] dark:bg-[#222]" />;
  }

  return (
    <div className="w-10 h-6 rounded-sm overflow-hidden border border-[#eaeaea] dark:border-[#333] bg-[#fafafa] dark:bg-[#0a0a0a]">
      <DeckThumbnail deck={deckData} />
    </div>
  );
};

export default AgentDataTable;
