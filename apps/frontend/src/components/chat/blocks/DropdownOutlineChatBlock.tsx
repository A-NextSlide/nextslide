/**
 * DropdownOutlineChatBlock
 * Expandable outline cards with editable key points
 * Supports drag-and-drop reordering
 */

import React, { useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Trash2, Plus, ChevronDown, ChevronRight, Loader2, Pencil, Check, X, GripVertical } from 'lucide-react';

// Helper to render text with **bold** markdown
const renderBoldMarkdown = (text: string): React.ReactNode => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

export interface OutlineSlide {
  id: string;
  title: string;
  subtitle?: string;
  keyPoints?: string[];
  content?: string;
  isLoading?: boolean;
  isContentLoaded?: boolean;
}

export interface DropdownOutlineBlockData {
  title: string;
  slides: OutlineSlide[];
}

interface DropdownOutlineChatBlockProps {
  data: DropdownOutlineBlockData;
  onSlideEdit?: (slideId: string, updates: Partial<OutlineSlide>) => void;
  onSlideAdd?: () => void;
  onSlideDelete?: (slideId: string) => void;
  onSlideReorder?: (fromIndex: number, toIndex: number) => void;
  onLoadContent?: (slideId: string) => Promise<{ content: string; keyPoints?: string[] }>;
  isEditable?: boolean;
  className?: string;
}

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
  const [expandedSlides, setExpandedSlides] = useState<Set<string>>(new Set());
  const [loadingSlides, setLoadingSlides] = useState<Set<string>>(new Set());
  const [editingField, setEditingField] = useState<{ slideId: string; field: 'title' | 'keyPoint'; keyPointIndex?: number } | null>(null);
  const [editValue, setEditValue] = useState('');

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  const toggleSlide = useCallback(async (slideId: string) => {
    const slide = data.slides.find(s => s.id === slideId);
    if (!slide) return;

    const isExpanded = expandedSlides.has(slideId);

    if (!isExpanded) {
      // Expanding - load content if not already loaded
      if (!slide.isContentLoaded && !slide.content && onLoadContent) {
        setLoadingSlides(prev => new Set(prev).add(slideId));
        try {
          const contentData = await onLoadContent(slideId);
          onSlideEdit?.(slideId, {
            content: contentData.content,
            keyPoints: contentData.keyPoints || slide.keyPoints,
            isContentLoaded: true,
          });
        } catch (error) {
          console.error('Failed to load content for slide:', slideId, error);
        } finally {
          setLoadingSlides(prev => {
            const next = new Set(prev);
            next.delete(slideId);
            return next;
          });
        }
      }
      setExpandedSlides(prev => new Set(prev).add(slideId));
    } else {
      // Collapsing
      setExpandedSlides(prev => {
        const next = new Set(prev);
        next.delete(slideId);
        return next;
      });
    }
  }, [data.slides, expandedSlides, onLoadContent, onSlideEdit]);

  const startEditing = (e: React.MouseEvent, slideId: string, field: 'title' | 'keyPoint', value: string, keyPointIndex?: number) => {
    e.stopPropagation();
    setEditingField({ slideId, field, keyPointIndex });
    setEditValue(value);
  };

  const saveEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!editingField) return;

    const { slideId, field, keyPointIndex } = editingField;
    const slide = data.slides.find(s => s.id === slideId);
    if (!slide) return;

    if (field === 'title') {
      onSlideEdit?.(slideId, { title: editValue });
    } else if (field === 'keyPoint' && typeof keyPointIndex === 'number') {
      const newKeyPoints = [...(slide.keyPoints || [])];
      newKeyPoints[keyPointIndex] = editValue;
      onSlideEdit?.(slideId, { keyPoints: newKeyPoints });
    }

    setEditingField(null);
    setEditValue('');
  };

  const cancelEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingField(null);
    setEditValue('');
  };

  const handleAddKeyPoint = (e: React.MouseEvent, slideId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const slide = data.slides.find(s => s.id === slideId);
    if (!slide) return;

    const newKeyPoints = [...(slide.keyPoints || []), 'New point'];
    onSlideEdit?.(slideId, { keyPoints: newKeyPoints });
  };

  const handleRemoveKeyPoint = (e: React.MouseEvent, slideId: string, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    const slide = data.slides.find(s => s.id === slideId);
    if (!slide) return;

    const newKeyPoints = (slide.keyPoints || []).filter((_, i) => i !== index);
    onSlideEdit?.(slideId, { keyPoints: newKeyPoints });
  };

  const handleDeleteSlide = (e: React.MouseEvent, slideId: string) => {
    e.stopPropagation();
    e.preventDefault();
    onSlideDelete?.(slideId);
  };

  const handleAddSlide = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSlideAdd?.();
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    dragNodeRef.current = e.currentTarget as HTMLDivElement;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());

    setTimeout(() => {
      if (dragNodeRef.current) {
        dragNodeRef.current.style.opacity = '0.5';
      }
    }, 0);
  };

  const handleDragEnd = () => {
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = '1';
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
    dragNodeRef.current = null;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== toIndex && onSlideReorder) {
      onSlideReorder(draggedIndex, toIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  if (!data.slides || data.slides.length === 0) {
    return (
      <div className={cn(
        "w-full max-w-[400px] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4",
        className
      )}>
        <div className="text-sm text-zinc-400 text-center py-4">No slides yet</div>
        {isEditable && (
          <button
            onClick={handleAddSlide}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-orange-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add first slide
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      "w-full max-w-[400px] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden",
      className
    )}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Outline
          </span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {data.slides.length} slides
          </span>
        </div>
      </div>

      {/* Slide list */}
      <div className="max-h-[400px] overflow-y-auto">
        {data.slides.map((slide, index) => {
          const isExpanded = expandedSlides.has(slide.id);
          const isLoading = loadingSlides.has(slide.id);
          const isEditingTitle = editingField?.slideId === slide.id && editingField.field === 'title';
          const isDragOver = dragOverIndex === index;
          const isDragging = draggedIndex === index;

          return (
            <div
              key={slide.id}
              draggable={isEditable && !isEditingTitle}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              className={cn(
                "border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 transition-all",
                isDragOver && "border-t-2 border-t-orange-400",
                isDragging && "opacity-50"
              )}
            >
              {/* Slide header */}
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors group",
                  isExpanded
                    ? "bg-zinc-50 dark:bg-zinc-800/50"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                )}
                onClick={() => !isEditingTitle && toggleSlide(slide.id)}
              >
                {/* Drag handle */}
                {isEditable && (
                  <div
                    className="flex-shrink-0 cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-400 dark:text-zinc-600 dark:hover:text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>
                )}

                {/* Expand/collapse icon */}
                <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500" />
                  ) : isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                </div>

                {/* Slide number */}
                <span className={cn(
                  "flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-[10px] font-semibold",
                  isExpanded
                    ? "bg-orange-500 text-white"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                )}>
                  {index + 1}
                </span>

                {/* Title */}
                <div className="flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                  {isEditingTitle ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        className="flex-1 text-sm bg-white dark:bg-zinc-800 border border-orange-400 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-orange-400"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        onClick={saveEdit}
                        className="p-0.5 text-green-500 hover:text-green-600"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="p-0.5 text-zinc-400 hover:text-zinc-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">
                        {slide.title || 'Untitled'}
                      </span>
                      {isEditable && (
                        <button
                          onClick={(e) => startEditing(e, slide.id, 'title', slide.title)}
                          className="p-0.5 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-orange-500 rounded transition-all"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Delete button */}
                {isEditable && data.slides.length > 1 && (
                  <button
                    onClick={(e) => handleDeleteSlide(e, slide.id)}
                    className="p-1 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 rounded transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Expanded content - Key points only */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-1">
                  {isLoading ? (
                    <div className="flex items-center gap-2 text-xs text-zinc-500 py-3 pl-10">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading...
                    </div>
                  ) : (
                    <div className="pl-10">
                      {/* Key points */}
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide">
                          Key Points
                        </span>
                        {isEditable && (
                          <button
                            onClick={(e) => handleAddKeyPoint(e, slide.id)}
                            className="flex items-center gap-0.5 text-[10px] font-medium text-orange-500 hover:text-orange-600 px-1.5 py-0.5 rounded transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                            Add
                          </button>
                        )}
                      </div>
                      <div className="space-y-1">
                        {(slide.keyPoints || []).map((point, pointIndex) => {
                          const isEditingThisPoint =
                            editingField?.slideId === slide.id &&
                            editingField.field === 'keyPoint' &&
                            editingField.keyPointIndex === pointIndex;

                          return (
                            <div key={pointIndex} className="flex items-start gap-2 group/point">
                              <span className="w-1 h-1 rounded-full bg-orange-400 mt-1.5 flex-shrink-0" />
                              {isEditingThisPoint ? (
                                <div className="flex-1 flex items-center gap-1">
                                  <input
                                    autoFocus
                                    className="flex-1 text-xs bg-white dark:bg-zinc-800 border border-orange-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-orange-400"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveEdit();
                                      if (e.key === 'Escape') cancelEdit();
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <button
                                    onClick={saveEdit}
                                    className="p-0.5 text-green-500 hover:text-green-600"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    className="p-0.5 text-zinc-400 hover:text-zinc-600"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <span
                                    className={cn(
                                      "flex-1 text-xs text-zinc-600 dark:text-zinc-400",
                                      isEditable && "cursor-text hover:text-zinc-800 dark:hover:text-zinc-200"
                                    )}
                                    onClick={(e) => isEditable && startEditing(e, slide.id, 'keyPoint', point, pointIndex)}
                                  >
                                    {renderBoldMarkdown(point)}
                                  </span>
                                  {isEditable && (
                                    <button
                                      onClick={(e) => handleRemoveKeyPoint(e, slide.id, pointIndex)}
                                      className="p-0.5 opacity-0 group-hover/point:opacity-100 text-zinc-400 hover:text-red-500 rounded transition-all"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                        {(!slide.keyPoints || slide.keyPoints.length === 0) && (
                          <div className="text-xs text-zinc-400 italic">
                            No key points
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add slide footer */}
      {isEditable && (
        <button
          onClick={handleAddSlide}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-400 hover:text-orange-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add slide
        </button>
      )}
    </div>
  );
};

export default DropdownOutlineChatBlock;
