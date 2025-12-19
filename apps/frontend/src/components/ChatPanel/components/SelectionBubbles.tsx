import { XCircle } from 'lucide-react';
import type { SelectedElement } from '../types';

interface SelectionBubblesProps {
  selections: SelectedElement[];
  onRemove: (elementId: string) => void;
}

export function SelectionBubbles({ selections, onRemove }: SelectionBubblesProps) {
  if (selections.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 pt-3">
      {selections.map(sel => (
        <div
          key={sel.elementId}
          className="flex items-center gap-2 px-2 py-1 rounded-full bg-neutral-900/5 dark:bg-white/10 text-xs border border-neutral-300/60 dark:border-neutral-700"
        >
          <span className="truncate max-w-[160px]">{sel.label}</span>
          <button
            aria-label="Remove selection"
            className="hover:opacity-80"
            onClick={() => onRemove(sel.elementId)}
          >
            <XCircle size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
