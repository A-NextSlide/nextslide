/**
 * LayersPanel - Shows all detected elements as layers with drag-to-reorder
 *
 * Features:
 * - Shows all child elements (not the custom component as root)
 * - Click to select element
 * - Drag to reorder (changes z-index)
 * - Delete button for each element
 * - Visual indication of selected element
 */

import React, { useState, useCallback } from 'react';
import { useCustomComponentEditStore } from '@/stores/customComponentEditStore';
import { VirtualElement } from '@/components/custom-component-editor/types';
import { Type, Image, Box, GripVertical, Trash2, Eye, EyeOff, ChevronDown, ChevronRight, Layers, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LayersPanelProps {
  onSave?: (message?: string) => void;
}

// Get icon for element type
const getElementIcon = (element: VirtualElement) => {
  switch (element.type) {
    case 'text':
      return <Type className="w-3.5 h-3.5 text-blue-500" />;
    case 'image':
      return <Image className="w-3.5 h-3.5 text-green-500" />;
    case 'container':
      // Simple square icon with muted color for containers
      return <Box className="w-3.5 h-3.5 text-muted-foreground" />;
    default:
      return <Box className="w-3.5 h-3.5 text-muted-foreground" />;
  }
};

// Get display name for element
const getElementName = (element: VirtualElement): string => {
  if (element.type === 'text') {
    const text = element.textContent?.slice(0, 25) || '';
    return text + (element.textContent && element.textContent.length > 25 ? '...' : '') || `Text ${element.tagName}`;
  }
  if (element.type === 'image') {
    return element.alt || `Image`;
  }
  return `${element.tagName}`;
};

// Layer item component
const LayerItem: React.FC<{
  element: VirtualElement;
  index: number;
  isSelected: boolean;
  isDragging: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  dropTarget: number | null;
}> = ({
  element,
  index,
  isSelected,
  isDragging,
  onSelect,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dropTarget,
}) => {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-all',
        'hover:bg-muted/50',
        isSelected && 'bg-pink-50 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-800',
        isDragging && 'opacity-50',
        dropTarget === index && 'border-t-2 border-pink-500'
      )}
      onClick={onSelect}
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
    >
      {/* Drag handle */}
      <div
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3 h-3" />
      </div>

      {/* Element icon */}
      {getElementIcon(element)}

      {/* Element name */}
      <span className="flex-1 text-xs truncate">
        {getElementName(element)}
      </span>

      {/* Delete button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:opacity-100 hover:bg-red-100 hover:text-red-600"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="w-3 h-3" />
      </Button>
    </div>
  );
};

export const LayersPanel: React.FC<LayersPanelProps> = ({ onSave }) => {
  const {
    detectedElements,
    selectedElement,
    selectElementById,
    deleteSelectedElement,
    reorderElements,
  } = useCustomComponentEditStore();

  const [isExpanded, setIsExpanded] = useState(true);
  const [isFullHeight, setIsFullHeight] = useState(false); // Expanded height mode
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  // Handle drag start
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex !== null && draggedIndex !== index) {
      setDropTargetIndex(index);
    }
  }, [draggedIndex]);

  // Handle drop
  const handleDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      console.log('[LayersPanel] Dropping:', { from: draggedIndex, to: targetIndex });
      reorderElements(draggedIndex, targetIndex);
      onSave?.('Reordered layers');
    }
    setDraggedIndex(null);
    setDropTargetIndex(null);
  }, [draggedIndex, reorderElements, onSave]);

  // Handle drag end (cleanup if drop didn't happen)
  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDropTargetIndex(null);
  }, []);

  // Handle delete
  const handleDelete = useCallback((elementId: string) => {
    selectElementById(elementId);
    setTimeout(() => {
      deleteSelectedElement();
      onSave?.('Deleted element');
    }, 10);
  }, [selectElementById, deleteSelectedElement, onSave]);

  // Handle select
  const handleSelect = useCallback((elementId: string) => {
    selectElementById(elementId);
  }, [selectElementById]);

  if (detectedElements.length === 0) {
    return null;
  }

  // Reverse the array so higher z-index (visually on top) appears at top of list
  const layersInOrder = [...detectedElements].reverse();

  return (
    <div
      className="border rounded-lg overflow-hidden"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center gap-2 w-full px-3 py-2 bg-muted/30">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 flex-1 hover:bg-muted/50 -ml-1 pl-1 py-0.5 rounded transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
          <Layers className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Layers</span>
          <span className="text-[10px] text-muted-foreground">
            {detectedElements.length}
          </span>
        </button>
        {/* Expand/collapse height toggle */}
        {isExpanded && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsFullHeight(!isFullHeight);
            }}
            className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            title={isFullHeight ? 'Collapse' : 'Expand'}
          >
            {isFullHeight ? (
              <Minimize2 className="w-3 h-3" />
            ) : (
              <Maximize2 className="w-3 h-3" />
            )}
          </button>
        )}
      </div>

      {/* Layer list */}
      {isExpanded && (
        <div
          className={cn(
            "p-2 space-y-1 overflow-y-auto",
            isFullHeight ? "max-h-[400px]" : "max-h-[200px]"
          )}
        >
          {layersInOrder.map((element, displayIndex) => {
            // Get the actual index in the original array for drag operations
            const actualIndex = detectedElements.length - 1 - displayIndex;
            return (
              <div key={element.id} className="group">
                <LayerItem
                  element={element}
                  index={actualIndex}
                  isSelected={selectedElement?.id === element.id}
                  isDragging={draggedIndex === actualIndex}
                  onSelect={() => handleSelect(element.id)}
                  onDelete={() => handleDelete(element.id)}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  dropTarget={dropTargetIndex}
                />
              </div>
            );
          })}

          {/* Hint */}
          <p className="text-[9px] text-muted-foreground text-center pt-2">
            Drag to reorder layers
          </p>
        </div>
      )}
    </div>
  );
};

export default LayersPanel;
