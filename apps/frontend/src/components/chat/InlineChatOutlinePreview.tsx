/**
 * InlineChatOutlinePreview
 * Editable outline cards that match SlideCard design from outline page
 * Allows editing both title and content inline
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Plus,
  Trash2,
  GripVertical,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { OutlinePreviewData, OutlineSlidePreview } from '@/types/chatBlocks';

interface InlineChatOutlinePreviewProps {
  data: OutlinePreviewData;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSlideEdit?: (slideId: string, updates: Partial<OutlineSlidePreview>) => void;
  onSlideDelete?: (slideId: string) => void;
  onSlideAdd?: (afterSlideId?: string) => void;
  onSlideReorder?: (fromIndex: number, toIndex: number) => void;
  onRegenerate?: () => void;
  isEditable?: boolean;
  className?: string;
  maxVisibleSlides?: number;
}

const InlineChatOutlinePreview: React.FC<InlineChatOutlinePreviewProps> = ({
  data,
  isCollapsed,
  onToggleCollapse,
  onSlideEdit,
  onSlideDelete,
  onSlideAdd,
  onSlideReorder,
  onRegenerate,
  isEditable = true,
  className,
  maxVisibleSlides = 6,
}) => {
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingTitle, setEditingTitle] = useState('');
  const [showAllSlides, setShowAllSlides] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Slides to display
  const visibleSlides = useMemo(() => {
    if (showAllSlides) return data.slides;
    return data.slides.slice(0, maxVisibleSlides);
  }, [data.slides, showAllSlides, maxVisibleSlides]);

  const hiddenCount = data.slides.length - maxVisibleSlides;

  // Build content string from slide data (key points + content)
  const buildContentString = useCallback((slide: OutlineSlidePreview): string => {
    const parts: string[] = [];

    if (slide.keyPoints && slide.keyPoints.length > 0) {
      parts.push(slide.keyPoints.map(p => `• ${p}`).join('\n'));
    }

    if (slide.content) {
      if (parts.length > 0) parts.push('');
      parts.push(slide.content);
    }

    return parts.join('\n');
  }, []);

  // Parse content string back to keyPoints
  const parseContentString = useCallback((content: string): { keyPoints?: string[], content?: string } => {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    const keyPoints: string[] = [];
    const narrativeLines: string[] = [];

    lines.forEach(line => {
      if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
        keyPoints.push(line.replace(/^[•\-*]\s*/, ''));
      } else {
        narrativeLines.push(line);
      }
    });

    return {
      keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
      content: narrativeLines.length > 0 ? narrativeLines.join('\n') : undefined,
    };
  }, []);

  // Start editing a slide
  const startEditing = useCallback((slide: OutlineSlidePreview) => {
    setEditingSlideId(slide.id);
    setEditingTitle(slide.title);
    setEditingContent(buildContentString(slide));
    setTimeout(() => {
      contentTextareaRef.current?.focus();
    }, 50);
  }, [buildContentString]);

  // Save edit
  const saveEdit = useCallback(() => {
    if (editingSlideId) {
      const parsed = parseContentString(editingContent);
      onSlideEdit?.(editingSlideId, {
        title: editingTitle.trim() || 'Untitled Slide',
        ...parsed,
      });
    }
    setEditingSlideId(null);
    setEditingTitle('');
    setEditingContent('');
  }, [editingSlideId, editingTitle, editingContent, onSlideEdit, parseContentString]);

  // Cancel edit
  const cancelEdit = useCallback(() => {
    setEditingSlideId(null);
    setEditingTitle('');
    setEditingContent('');
  }, []);

  // Handle drag start
  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  // Handle drop
  const handleDrop = useCallback((toIndex: number) => {
    if (draggedIndex !== null && draggedIndex !== toIndex) {
      onSlideReorder?.(draggedIndex, toIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [draggedIndex, onSlideReorder]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (contentTextareaRef.current && editingSlideId) {
      contentTextareaRef.current.style.height = 'auto';
      contentTextareaRef.current.style.height = `${Math.min(contentTextareaRef.current.scrollHeight, 200)}px`;
    }
  }, [editingContent, editingSlideId]);

  // Collapsed view
  if (isCollapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg',
          'bg-zinc-50 dark:bg-zinc-800/50',
          'border border-zinc-200/70 dark:border-zinc-700/50',
          'hover:border-zinc-300 dark:hover:border-zinc-600 transition-all',
          'text-left',
          className
        )}
      >
        <FileText className="w-3.5 h-3.5 text-zinc-400" />
        <span className="text-xs text-zinc-600 dark:text-zinc-400 flex-1 truncate">
          {data.title}
        </span>
        <span className="text-[10px] text-zinc-400 bg-zinc-200/50 dark:bg-zinc-700/50 px-1.5 py-0.5 rounded">
          {data.slides.length} slides
        </span>
        <ChevronRight className="w-3 h-3 text-zinc-400" />
      </button>
    );
  }

  // Expanded view - SlideCard style
  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden',
        'bg-white dark:bg-zinc-900',
        'border-zinc-200 dark:border-zinc-700/50',
        'shadow-sm',
        className
      )}
    >
      {/* Header */}
      <button
        onClick={onToggleCollapse}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors border-b border-zinc-100 dark:border-zinc-800"
      >
        <FileText className="w-3.5 h-3.5 text-zinc-400" />
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex-1 text-left truncate">
          {data.title}
        </span>
        <span className="text-[10px] text-zinc-400">
          {data.slides.length} slides
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
      </button>

      {/* Slides list - matching SlideCard style */}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
        {visibleSlides.map((slide, index) => {
          const isEditing = editingSlideId === slide.id;
          const isDragging = draggedIndex === index;
          const isDragOver = dragOverIndex === index;

          return (
            <div
              key={slide.id}
              draggable={isEditable && !isEditing}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              className={cn(
                'group relative p-3',
                'transition-all duration-200',
                isDragging && 'opacity-50',
                isDragOver && 'bg-orange-50 dark:bg-orange-900/10',
                !isDragging && !isEditing && 'hover:bg-zinc-50 dark:hover:bg-zinc-800/30'
              )}
            >
              {/* Slide header with number, title, and actions */}
              <div className="flex items-start gap-2">
                {/* Drag handle & number */}
                <div className="flex items-center gap-1 pt-0.5 flex-shrink-0">
                  {isEditable && !isEditing && (
                    <GripVertical
                      className={cn(
                        'w-3 h-3 text-zinc-300 dark:text-zinc-600',
                        'opacity-0 group-hover:opacity-100 cursor-grab transition-opacity'
                      )}
                    />
                  )}
                  <span className="w-5 h-5 flex items-center justify-center rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
                    {index + 1}
                  </span>
                </div>

                {/* Content area */}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    /* Edit mode - inline editing like SlideCard */
                    <div className="space-y-2">
                      <input
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        className="w-full text-sm font-medium bg-transparent border-0 border-b border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-orange-500 pb-1 text-zinc-900 dark:text-zinc-100"
                        placeholder="Slide title"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            contentTextareaRef.current?.focus();
                          }
                          if (e.key === 'Escape') cancelEdit();
                        }}
                      />
                      <Textarea
                        ref={contentTextareaRef}
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        className={cn(
                          "w-full text-xs bg-zinc-50/50 dark:bg-zinc-800/30 border border-zinc-200 dark:border-zinc-700",
                          "rounded-md p-2 resize-none min-h-[80px] max-h-[200px]",
                          "focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                        )}
                        placeholder="• Key point 1&#10;• Key point 2&#10;Additional notes..."
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') cancelEdit();
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            saveEdit();
                          }
                        }}
                        onBlur={() => {
                          // Small delay to allow clicking save button
                          setTimeout(saveEdit, 200);
                        }}
                      />
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={cancelEdit}
                          className="text-[10px] text-zinc-400 hover:text-zinc-600 px-2 py-1"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveEdit}
                          className="text-[10px] text-orange-500 hover:text-orange-600 font-medium px-2 py-1"
                        >
                          Save (⌘↵)
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* View mode */
                    <div
                      onClick={() => isEditable && startEditing(slide)}
                      className={cn(
                        "cursor-text rounded-md p-1 -m-1",
                        isEditable && "hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50"
                      )}
                    >
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {slide.title}
                      </p>
                      {slide.subtitle && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {slide.subtitle}
                        </p>
                      )}
                      {/* Show ALL key points - this is user's content */}
                      {slide.keyPoints && slide.keyPoints.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {slide.keyPoints.map((point, i) => (
                            <li
                              key={i}
                              className="text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-1.5"
                            >
                              <span className="w-1 h-1 rounded-full bg-zinc-400 dark:bg-zinc-500 flex-shrink-0 mt-1.5" />
                              <span className="leading-relaxed">{point}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {/* Show narrative content if available */}
                      {slide.content && (
                        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500 leading-relaxed border-l-2 border-zinc-200 dark:border-zinc-700 pl-2 italic">
                          {slide.content}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions - visible on hover */}
                {isEditable && !isEditing && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditing(slide);
                      }}
                      className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      title="Edit slide"
                    >
                      <Pencil className="w-3 h-3 text-zinc-400" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSlideDelete?.(slide.id);
                      }}
                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                      title="Delete slide"
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Show more/less */}
        {!showAllSlides && hiddenCount > 0 && (
          <button
            onClick={() => setShowAllSlides(true)}
            className="w-full px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors text-center"
          >
            Show {hiddenCount} more slides
          </button>
        )}
        {showAllSlides && data.slides.length > maxVisibleSlides && (
          <button
            onClick={() => setShowAllSlides(false)}
            className="w-full px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors text-center"
          >
            Show less
          </button>
        )}
      </div>

      {/* Add slide button */}
      {isEditable && (
        <div className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-800">
          <Button
            onClick={() => onSlideAdd?.()}
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Slide
          </Button>
        </div>
      )}
    </div>
  );
};

export default InlineChatOutlinePreview;
