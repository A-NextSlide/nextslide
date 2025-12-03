/**
 * OutlineChatBlock
 * Clean, minimal slide list - matches theme card style
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Trash2, Plus } from 'lucide-react';

export interface OutlineSlide {
  id: string;
  title: string;
  subtitle?: string;
  keyPoints?: string[];
  content?: string;
}

export interface OutlineBlockData {
  title: string;
  slides: OutlineSlide[];
}

interface OutlineChatBlockProps {
  data: OutlineBlockData;
  onSlideEdit?: (slideId: string, updates: Partial<OutlineSlide>) => void;
  onSlideAdd?: () => void;
  onSlideDelete?: (slideId: string) => void;
  isEditable?: boolean;
  className?: string;
}

const OutlineChatBlock: React.FC<OutlineChatBlockProps> = ({
  data,
  onSlideEdit,
  onSlideAdd,
  onSlideDelete,
  isEditable = true,
  className,
}) => {
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null);

  if (!data.slides || data.slides.length === 0) {
    return (
      <div className={cn(
        "w-full max-w-[320px] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3",
        className
      )}>
        <div className="text-xs text-zinc-400 text-center">No slides</div>
      </div>
    );
  }

  return (
    <div className={cn(
      "w-full max-w-[320px] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden",
      className
    )}>
      {/* Slide list */}
      <div className="max-h-[280px] overflow-y-auto">
        {data.slides.map((slide, index) => {
          const isEditing = editingSlideId === slide.id;

          return (
            <div
              key={slide.id}
              className="flex items-center gap-2 px-2.5 py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 group"
            >
              {/* Slide number */}
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-[10px] font-medium">
                {index + 1}
              </span>

              {/* Title */}
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <input
                    autoFocus
                    className="w-full text-xs bg-transparent border-b border-zinc-300 dark:border-zinc-600 focus:border-zinc-500 focus:outline-none py-0.5"
                    value={slide.title}
                    onChange={(e) => onSlideEdit?.(slide.id, { title: e.target.value })}
                    onBlur={() => setEditingSlideId(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setEditingSlideId(null);
                    }}
                  />
                ) : (
                  <span
                    className={cn(
                      "text-xs text-zinc-700 dark:text-zinc-300 truncate block",
                      isEditable && "cursor-text"
                    )}
                    onClick={() => isEditable && setEditingSlideId(slide.id)}
                  >
                    {slide.title || 'Untitled'}
                  </span>
                )}
              </div>

              {/* Delete button */}
              {isEditable && data.slides.length > 1 && (
                <button
                  onClick={() => onSlideDelete?.(slide.id)}
                  className="p-1 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add slide */}
      {isEditable && (
        <button
          onClick={onSlideAdd}
          className="w-full flex items-center justify-center gap-1 px-2.5 py-2 text-[10px] text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-t border-zinc-100 dark:border-zinc-800 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add slide
        </button>
      )}
    </div>
  );
};

export default OutlineChatBlock;
