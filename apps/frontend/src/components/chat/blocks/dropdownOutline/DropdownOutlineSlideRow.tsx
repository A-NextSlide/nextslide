import React from 'react';
import { cn } from '@/lib/utils';
import {
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Check,
  X,
  GripVertical,
  Video,
  Image as ImageIcon,
} from 'lucide-react';
import type { OutlineEditField, OutlineSlide } from './types';

const renderBoldMarkdown = (text: string): React.ReactNode => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

interface DropdownOutlineSlideRowProps {
  slide: OutlineSlide;
  index: number;
  isExpanded: boolean;
  isLoading: boolean;
  isEditable: boolean;
  canDelete: boolean;
  editingField: OutlineEditField | null;
  editValue: string;
  onEditValueChange: (value: string) => void;
  draggedIndex: number | null;
  dragOverIndex: number | null;
  onToggle: () => void;
  onStartEditing: (
    e: React.MouseEvent,
    slideId: string,
    field: OutlineEditField['field'],
    value: string,
    keyPointIndex?: number
  ) => void;
  onSaveEdit: (e?: React.MouseEvent) => void;
  onCancelEdit: (e?: React.MouseEvent) => void;
  onAddKeyPoint: (e: React.MouseEvent, slideId: string) => void;
  onRemoveKeyPoint: (e: React.MouseEvent, slideId: string, index: number) => void;
  onDeleteSlide: (slideId: string) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

const DropdownOutlineSlideRow: React.FC<DropdownOutlineSlideRowProps> = ({
  slide,
  index,
  isExpanded,
  isLoading,
  isEditable,
  canDelete,
  editingField,
  editValue,
  onEditValueChange,
  draggedIndex,
  dragOverIndex,
  onToggle,
  onStartEditing,
  onSaveEdit,
  onCancelEdit,
  onAddKeyPoint,
  onRemoveKeyPoint,
  onDeleteSlide,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}) => {
  const isEditing = editingField?.slideId === slide.id;
  const isEditingTitle = isEditing && editingField.field === 'title';
  const isEditingContent = isEditing && editingField.field === 'content';
  const isDragOver = dragOverIndex === index;
  const isDragging = draggedIndex === index;
  const isDraggable = isEditable && !isEditing;
  const hasPreviewContent = Boolean(
    (slide.content && slide.content.trim().length > 0)
      || (slide.keyPoints && slide.keyPoints.length > 0)
  );
  const showLoadingState = isLoading && !hasPreviewContent;

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 transition-all",
        isDragOver && "border-t-2 border-t-orange-400",
        isDragging && "opacity-50"
      )}
    >
      {/* Slide header */}
      <div
        draggable={isDraggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className={cn(
          "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors group",
          isExpanded
            ? "bg-zinc-50 dark:bg-zinc-800/50"
            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
        )}
        onClick={() => {
          if (isEditing) onSaveEdit();
          onToggle();
        }}
      >
        {/* Drag handle */}
        {isEditable && (
          <div
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-400 dark:text-zinc-600 dark:hover:text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Drag to reorder"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>
        )}

        {/* Expand/collapse icon */}
        <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
          {showLoadingState ? (
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
        <div className="flex-1 min-w-0">
          {isEditingTitle ? (
            <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
              <input
                autoFocus
                className="flex-1 text-sm bg-white dark:bg-zinc-800 border border-orange-400 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-orange-400"
                value={editValue}
                onChange={(e) => onEditValueChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveEdit();
                  if (e.key === 'Escape') onCancelEdit();
                }}
              />
              <button
                onClick={onSaveEdit}
                className="p-0.5 text-green-500 hover:text-green-600"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onCancelEdit}
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
                  onClick={(e) => onStartEditing(e, slide.id, 'title', slide.title)}
                  className="p-0.5 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-orange-500 rounded transition-all"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Delete button */}
        {isEditable && canDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteSlide(slide.id);
            }}
            className="p-1 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 rounded transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Expanded content - Key points + context */}
      {isExpanded && (
        <div className="px-3 pb-2.5 pt-1">
          {showLoadingState ? (
            <div className="flex items-center gap-2 text-xs text-zinc-500 py-2.5 pl-8">
              <Loader2 className="w-3 h-3 animate-spin" />
              Generating slide content...
            </div>
          ) : (
            <div className="pl-8">
              {/* Key points */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide">
                  Key Points
                </span>
                {isEditable && (
                  <button
                    onClick={(e) => onAddKeyPoint(e, slide.id)}
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
                    isEditing &&
                    editingField.field === 'keyPoint' &&
                    editingField.keyPointIndex === pointIndex;

                  return (
                    <div key={pointIndex} className="flex items-start gap-2 group/point">
                      <span className="w-1 h-1 rounded-full bg-orange-400 mt-1 flex-shrink-0" />
                      {isEditingThisPoint ? (
                        <div className="flex-1 flex items-center gap-1">
                          <input
                            autoFocus
                            className="flex-1 text-xs bg-white dark:bg-zinc-800 border border-orange-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-orange-400"
                            value={editValue}
                            onChange={(e) => onEditValueChange(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') onSaveEdit();
                              if (e.key === 'Escape') onCancelEdit();
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button
                            onClick={onSaveEdit}
                            className="p-0.5 text-green-500 hover:text-green-600"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={onCancelEdit}
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
                            onClick={(e) => isEditable && onStartEditing(e, slide.id, 'keyPoint', point, pointIndex)}
                          >
                            {renderBoldMarkdown(point)}
                          </span>
                          {isEditable && (
                            <button
                              onClick={(e) => onRemoveKeyPoint(e, slide.id, pointIndex)}
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

              {/* Slide Notes */}
              <div className="mt-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide">
                    Slide Notes
                  </span>
                  {isEditable && !isEditingContent && (
                    <button
                      onClick={(e) => onStartEditing(e, slide.id, 'content', slide.content || '')}
                      className="flex items-center gap-1 text-[10px] font-medium text-zinc-400 hover:text-zinc-600 transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                      Edit
                    </button>
                  )}
                </div>
                {isEditingContent ? (
                  <div className="flex items-start gap-1.5">
                    <textarea
                      autoFocus
                      className="flex-1 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1.5 min-h-[72px] max-h-[160px] resize-none focus:outline-none focus:ring-1 focus:ring-orange-400"
                      value={editValue}
                      onChange={(e) => onEditValueChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') onCancelEdit();
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSaveEdit();
                      }}
                    />
                    <div className="flex flex-col gap-1 pt-0.5">
                      <button
                        onClick={onSaveEdit}
                        className="p-0.5 text-green-500 hover:text-green-600"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={onCancelEdit}
                        className="p-0.5 text-zinc-400 hover:text-zinc-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={cn(
                      "rounded-md px-2 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50/70 dark:bg-zinc-800/40 whitespace-pre-wrap leading-relaxed",
                      isEditable && "cursor-text hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60"
                    )}
                    onClick={(e) => isEditable && onStartEditing(e, slide.id, 'content', slide.content || '')}
                  >
                    {slide.content ? slide.content : (
                      <span className="text-zinc-400 italic">No context yet</span>
                    )}
                  </div>
                )}
              </div>

              {/* Assigned Media Section */}
              {(slide.assignedVideo || (slide.taggedMedia && slide.taggedMedia.length > 0)) && (
                <div className="mt-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5 block">
                    Assigned Media
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {/* Assigned Video */}
                    {slide.assignedVideo && (
                      <div className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded text-[10px] font-medium">
                        <Video className="w-3 h-3" />
                        <span className="truncate max-w-[120px]">
                          {slide.assignedVideo.title || 'Video'}
                        </span>
                      </div>
                    )}
                    {/* Tagged Media */}
                    {slide.taggedMedia?.filter(m => m.type === 'image').map((media, idx) => (
                      <div
                        key={media.id || idx}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-[10px] font-medium"
                      >
                        <ImageIcon className="w-3 h-3" />
                        <span className="truncate max-w-[80px]">
                          {media.filename || 'Image'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DropdownOutlineSlideRow;
