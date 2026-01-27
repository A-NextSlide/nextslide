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
  isLoading = false,
  loadingLabel,
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

  const overlayLabel = loadingLabel || 'Finalizing outline...';
  const showLoadingOverlay = Boolean(isLoading);

  if (normalizedSlides.length === 0) {
    return (
      <div className={cn(
        "w-full max-w-[360px] rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white/95 dark:bg-zinc-900/90 p-4 relative shadow-[0_16px_40px_-32px_rgba(15,23,42,0.35)]",
        className
      )}>
        {showLoadingOverlay ? (
          <div className="flex items-center justify-center py-4 text-[11px] text-zinc-500">
            <span>{overlayLabel}</span>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    );
  }

  const canDeleteSlides = normalizedSlides.length > 1;

  return (
    <div className={cn(
      "w-full bg-transparent", // Removed card styling for cleaner look
      className
    )}>
      {showLoadingOverlay && (
        <div className="absolute inset-0 z-20 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-[1px] flex items-start justify-center pt-3 text-zinc-600 dark:text-zinc-300">
          <div className="rounded-full bg-white/95 dark:bg-zinc-900/95 px-3 py-1 text-[11px] shadow-sm">
            {overlayLabel}
          </div>
        </div>
      )}
      {/* Header */}
      <div className="px-1 py-2 mb-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
            Outline Preview
          </span>
          <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800/50 px-1.5 py-0.5 rounded-full">
            {normalizedSlides.length}
          </span>
        </div>
      </div>

      {/* Slide list - Expanding fully for parent scrolling */}
      <div
        ref={scrollContainerRef}
        // Removed internal scrolling: onWheel={handleWheel}
        // Removed max-height constraint: className="max-h-[360px] overflow-y-auto"
        className="flex flex-col"
      >
        {normalizedSlides.map((slide, index) => {
          const isExpanded = state.expandedSlides.has(slide.id);
          // Combine internal loading state with slide's own isUpdating property
          const isSlideLoading = state.loadingSlides.has(slide.id) || slide.isUpdating === true;

          return (
            <DropdownOutlineSlideRow
              key={slide.id}
              slide={slide}
              index={index}
              isExpanded={isExpanded}
              isLoading={isSlideLoading}
              isEditable={isEditable && !isSlideLoading}
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
