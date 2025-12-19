/**
 * DropdownOutlineChatBlock
 * Expandable outline cards with editable key points
 * Supports drag-and-drop reordering
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import DropdownOutlineSlideRow from './dropdownOutline/DropdownOutlineSlideRow';
import { useDropdownOutlineState } from './dropdownOutline/useDropdownOutlineState';
import type { DropdownOutlineChatBlockProps } from './dropdownOutline/types';

export type { OutlineSlide, DropdownOutlineBlockData } from './dropdownOutline/types';

const DropdownOutlineChatBlock: React.FC<DropdownOutlineChatBlockProps> = ({
  data,
  onSlideEdit,
  onSlideAdd,
  onSlideDelete,
  onSlideReorder,
  onLoadContent,
  isEditable = true,
  className,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const normalizedSlides = useMemo(() => (
    data.slides.map(slide => ({
      ...slide,
      isContentLoaded: slide.isContentLoaded ?? Boolean(slide.content),
    }))
  ), [data.slides]);

  const { state, handlers } = useDropdownOutlineState({
    slides: normalizedSlides,
    onSlideEdit,
    onSlideReorder,
    onLoadContent,
  });

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtTop = scrollTop === 0;
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 1;
    const isScrollingUp = e.deltaY < 0;
    const isScrollingDown = e.deltaY > 0;

    if ((isAtTop && isScrollingUp) || (isAtBottom && isScrollingDown)) {
      return;
    }

    e.stopPropagation();
  }, []);

  const handleAddSlide = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSlideAdd?.();
  }, [onSlideAdd]);

  const handleDeleteSlide = useCallback((slideId: string) => {
    onSlideDelete?.(slideId);
  }, [onSlideDelete]);

  if (normalizedSlides.length === 0) {
    return (
      <div className={cn(
        "w-full max-w-[360px] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4",
        className
      )}>
        <div className="text-sm text-zinc-400 text-center py-4">No slides yet</div>
        {isEditable && (
          <button
            onClick={handleAddSlide}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-sm text-orange-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add first slide
          </button>
        )}
      </div>
    );
  }

  const canDeleteSlides = normalizedSlides.length > 1;

  return (
    <div className={cn(
      "w-full max-w-[360px] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden",
      className
    )}>
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Outline
          </span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {normalizedSlides.length} slides
          </span>
        </div>
      </div>

      {/* Slide list */}
      <div
        ref={scrollContainerRef}
        onWheel={handleWheel}
        className="max-h-[360px] overflow-y-auto"
      >
        {normalizedSlides.map((slide, index) => {
          const isExpanded = state.expandedSlides.has(slide.id);
          const isLoading = state.loadingSlides.has(slide.id);

          return (
            <DropdownOutlineSlideRow
              key={slide.id}
              slide={slide}
              index={index}
              isExpanded={isExpanded}
              isLoading={isLoading}
              isEditable={isEditable}
              canDelete={canDeleteSlides}
              editingField={state.editingField}
              editValue={state.editValue}
              onEditValueChange={(value) => handlers.setEditValue(value)}
              draggedIndex={state.draggedIndex}
              dragOverIndex={state.dragOverIndex}
              onToggle={() => handlers.toggleSlide(slide.id, index, isExpanded)}
              onStartEditing={handlers.startEditing}
              onSaveEdit={handlers.saveEdit}
              onCancelEdit={handlers.cancelEdit}
              onAddKeyPoint={handlers.handleAddKeyPoint}
              onRemoveKeyPoint={handlers.handleRemoveKeyPoint}
              onDeleteSlide={handleDeleteSlide}
              onDragStart={(e) => handlers.handleDragStart(e, index)}
              onDragEnd={handlers.handleDragEnd}
              onDragOver={(e) => handlers.handleDragOver(e, index)}
              onDragLeave={handlers.handleDragLeave}
              onDrop={(e) => handlers.handleDrop(e, index)}
            />
          );
        })}
      </div>

      {/* Add slide footer */}
      {isEditable && (
        <button
          onClick={handleAddSlide}
          className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-orange-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add slide
        </button>
      )}
    </div>
  );
};

export default DropdownOutlineChatBlock;
