import React, { useState, useEffect, useCallback } from 'react';
import { RotateCcw, Clock, ChevronDown, ChevronUp, Check } from 'lucide-react';

interface Version {
  id: string;
  version_number: number;
  summary: string;
  timestamp: string;
  deck_revision?: string;
  slide_ids: string[];
  can_restore: boolean;
}

interface VersionHistoryBlockProps {
  versions: Version[];
  onRestore: (editId: string) => Promise<void>;
  isLoading?: boolean;
}

export function VersionHistoryBlock({ versions, onRestore, isLoading = false }: VersionHistoryBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoredId, setRestoredId] = useState<string | null>(null);

  const handleRestore = useCallback(async (editId: string) => {
    if (restoringId) return;
    setRestoringId(editId);
    try {
      await onRestore(editId);
      setRestoredId(editId);
      setTimeout(() => setRestoredId(null), 2000);
    } catch (error) {
      console.error('[VersionHistory] Failed to restore:', error);
    } finally {
      setRestoringId(null);
    }
  }, [onRestore, restoringId]);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  if (!versions || versions.length === 0) {
    return null;
  }

  const visibleVersions = expanded ? versions : versions.slice(0, 3);
  const hasMore = versions.length > 3;

  return (
    <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <Clock className="w-3.5 h-3.5" />
          <span className="font-medium">Version History</span>
          <span className="text-gray-400">({versions.length} edits)</span>
        </div>
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            {expanded ? (
              <>Show less <ChevronUp className="w-3 h-3" /></>
            ) : (
              <>Show all <ChevronDown className="w-3 h-3" /></>
            )}
          </button>
        )}
      </div>

      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {visibleVersions.map((version, index) => (
          <div
            key={version.id}
            className={`px-3 py-2 flex items-center justify-between gap-2 ${
              index === 0 ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                  index === 0
                    ? 'bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  v{version.version_number}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatTimestamp(version.timestamp)}
                </span>
                {index === 0 && (
                  <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                    Current
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 truncate mt-0.5">
                {version.summary}
              </p>
            </div>

            {version.can_restore && (
              <button
                onClick={() => handleRestore(version.id)}
                disabled={!!restoringId || isLoading}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                  restoredId === version.id
                    ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400'
                    : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {restoringId === version.id ? (
                  <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                ) : restoredId === version.id ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <RotateCcw className="w-3 h-3" />
                )}
                <span>{restoredId === version.id ? 'Restored' : 'Restore'}</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default VersionHistoryBlock;
