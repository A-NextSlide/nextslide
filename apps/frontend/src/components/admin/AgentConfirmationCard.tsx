import React, { useState } from 'react';
import { AlertTriangle, Check, X, Loader2 } from 'lucide-react';

interface AgentConfirmationCardProps {
  summary: string;
  affectedRows?: number | null;
  operationType?: string | null;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  result?: {
    success: boolean;
    affected_rows: number;
    message: string;
    error?: string;
  } | null;
}

const AgentConfirmationCard: React.FC<AgentConfirmationCardProps> = ({
  summary,
  affectedRows,
  operationType,
  onConfirm,
  onCancel,
  result,
}) => {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  // Already executed - show result
  if (result) {
    if (result.success) {
      return (
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-green-100 dark:bg-green-900 p-1">
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Executed successfully
              </p>
              <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                {result.message}
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-red-100 dark:bg-red-900 p-1">
            <X className="h-4 w-4 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              Execution failed
            </p>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">
              {result.error || 'Unknown error'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Pending confirmation
  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-amber-100 dark:bg-amber-900 p-1.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Write operation requires confirmation
          </p>
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
            {summary}
          </p>
          {affectedRows != null && affectedRows >= 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-1 font-medium">
              This will affect {affectedRows} row{affectedRows !== 1 ? 's' : ''}.
            </p>
          )}
          {operationType && (
            <span className="inline-block mt-2 px-2 py-0.5 text-xs font-medium rounded bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 uppercase">
              {operationType}
            </span>
          )}

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-[#FF4301] text-white hover:bg-[#e63d00] disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Confirm
            </button>
            <button
              onClick={onCancel}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-[#ddd] dark:border-[#444] text-[#666] dark:text-[#aaa] hover:bg-[#f5f5f5] dark:hover:bg-[#222] disabled:opacity-50 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentConfirmationCard;
