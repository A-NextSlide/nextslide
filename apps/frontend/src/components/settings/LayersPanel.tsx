/**
 * LayersPanel - Hierarchical layers tree for CustomComponent HTML elements
 *
 * Features:
 * - Shows DOM-derived hierarchy via parentId
 * - Click to select element (syncs with overlay)
 * - Drag to reorder/reparent (updates z-index + DOM parent)
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useCustomComponentEditStore } from '@/stores/customComponentEditStore';
import { VirtualElement } from '@/components/custom-component-editor/types';
import { Type, Image, Box, GripVertical, Trash2, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getElementDisplayName } from '@/utils/customComponentLabels';

interface LayersPanelProps {
  onSave?: (message?: string) => void;
}

type DropPosition = 'before' | 'after' | 'inside';

type LayerNode = {
  id: string;
  element: VirtualElement;
  parentId: string | null;
  children: LayerNode[];
  orderIndex: number;
};

const getExplicitZIndex = (element: VirtualElement): number | null => {
  const raw = element.computedStyle?.zIndex;
  if (!raw || raw === 'auto') return null;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const getDomIndex = (element: VirtualElement): number => {
  return typeof element.domIndex === 'number' ? element.domIndex : 0;
};

const hasExplicitZIndex = (nodes: LayerNode[]): boolean => {
  return nodes.some((node) => getExplicitZIndex(node.element) !== null);
};

const sortByStackOrderDesc = (a: LayerNode, b: LayerNode, useZIndex: boolean): number => {
  if (useZIndex) {
    const aZ = getExplicitZIndex(a.element) ?? 0;
    const bZ = getExplicitZIndex(b.element) ?? 0;
    if (aZ !== bZ) return bZ - aZ;
  }
  return getDomIndex(b.element) - getDomIndex(a.element);
};

const buildLayerTree = (elements: VirtualElement[]): LayerNode[] => {
  const nodes = new Map<string, LayerNode>();
  const orderIndexMap = new Map<string, number>();

  elements.forEach((element, index) => {
    orderIndexMap.set(element.id, index);
  });

  elements.forEach((element) => {
    nodes.set(element.id, {
      id: element.id,
      element,
      parentId: element.parentId || null,
      children: [],
      orderIndex: orderIndexMap.get(element.id) || 0,
    });
  });

  const roots: LayerNode[] = [];
  nodes.forEach((node) => {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortNodes = (list: LayerNode[]) => {
    const useZIndex = hasExplicitZIndex(list);
    list.sort((a, b) => {
      const zSort = sortByStackOrderDesc(a, b, useZIndex);
      if (zSort !== 0) return zSort;
      return a.orderIndex - b.orderIndex;
    });
    list.forEach((node) => sortNodes(node.children));
  };

  sortNodes(roots);
  return roots;
};

const getElementIcon = (element: VirtualElement) => {
  switch (element.type) {
    case 'text':
      return <Type className="w-3.5 h-3.5 text-blue-500" />;
    case 'image':
      return <Image className="w-3.5 h-3.5 text-green-500" />;
    default:
      return <Box className="w-3.5 h-3.5 text-muted-foreground" />;
  }
};

const LayerRow: React.FC<{
  node: LayerNode;
  depth: number;
  isExpanded: boolean;
  hasChildren: boolean;
  isSelected: boolean;
  elementIndexById: Map<string, number>;
  dropTarget: { id: string; position: DropPosition } | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, node: LayerNode) => void;
  onDrop: (node: LayerNode) => void;
  onDragEnd: () => void;
}> = ({
  node,
  depth,
  isExpanded,
  hasChildren,
  isSelected,
  elementIndexById,
  dropTarget,
  onToggle,
  onSelect,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) => {
  const isDropBefore = dropTarget?.id === node.id && dropTarget.position === 'before';
  const isDropAfter = dropTarget?.id === node.id && dropTarget.position === 'after';
  const isDropInside = dropTarget?.id === node.id && dropTarget.position === 'inside';

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer transition-all',
        'hover:bg-muted/50',
        isSelected && 'bg-pink-50 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-800',
        isDropInside && 'bg-muted/70',
        isDropBefore && 'border-t-2 border-pink-500',
        isDropAfter && 'border-b-2 border-pink-500'
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      draggable
      onDragStart={() => onDragStart(node.id)}
      onDragOver={(e) => onDragOver(e, node)}
      onDrop={() => onDrop(node)}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(node.id)}
    >
      {hasChildren ? (
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.id);
          }}
        >
          {isExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </button>
      ) : (
        <span className="w-3 h-3" />
      )}

      <div
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3 h-3" />
      </div>

      {getElementIcon(node.element)}

      <span className="flex-1 text-[11px] truncate">
        {getElementDisplayName(node.element, elementIndexById.get(node.id))}
      </span>

      <Button
        variant="ghost"
        size="sm"
        className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:opacity-100 hover:bg-red-100 hover:text-red-600"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(node.id);
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
    selectedElementId,
    setSelectedElementId,
    deleteSelectedElement,
    moveElement,
  } = useCustomComponentEditStore();

  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: DropPosition } | null>(null);

  const layerTree = useMemo(() => buildLayerTree(detectedElements), [detectedElements]);
  const elementIndexById = useMemo(() => {
    const map = new Map<string, number>();
    const counts = new Map<string, number>();
    const ordered = detectedElements.slice().sort((a, b) => getDomIndex(a) - getDomIndex(b));
    ordered.forEach((element) => {
      const typeKey = element.type || 'other';
      const current = counts.get(typeKey) ?? 0;
      map.set(element.id, current);
      counts.set(typeKey, current + 1);
    });
    return map;
  }, [detectedElements]);

  const toggleNode = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleDragStart = useCallback((id: string) => {
    setDraggedId(id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, node: LayerNode) => {
    if (!draggedId || draggedId === node.id) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const offset = e.clientY - rect.top;
    const ratio = rect.height > 0 ? offset / rect.height : 0;

    let position: DropPosition = 'before';
    if (node.element.type === 'container' && ratio > 0.25 && ratio < 0.75) {
      position = 'inside';
    } else if (ratio > 0.5) {
      position = 'after';
    }

    setDropTarget({ id: node.id, position });
  }, [draggedId]);

  const handleDrop = useCallback((node: LayerNode) => {
    if (!draggedId || !dropTarget) return;

    moveElement(draggedId, dropTarget.id, dropTarget.position);
    onSave?.('Reordered layers');

    setDraggedId(null);
    setDropTarget(null);
  }, [draggedId, dropTarget, moveElement, onSave]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDropTarget(null);
  }, []);

  const handleDelete = useCallback((elementId: string) => {
    setSelectedElementId(elementId);
    setTimeout(() => {
      deleteSelectedElement();
      onSave?.('Deleted element');
    }, 10);
  }, [deleteSelectedElement, onSave, setSelectedElementId]);

  const handleSelect = useCallback((elementId: string) => {
    setSelectedElementId(elementId);
  }, [setSelectedElementId]);

  if (detectedElements.length === 0) {
    return null;
  }

  const renderNodes = (nodes: LayerNode[], depth: number) => {
    return nodes.map((node) => {
      const hasChildren = node.children.length > 0;
      const hasSelectedDescendant = (current: LayerNode): boolean => {
        return current.children.some((child) => child.id === selectedElementId || hasSelectedDescendant(child));
      };
      const isOpen = expandedNodes.has(node.id) || hasSelectedDescendant(node);
      return (
        <React.Fragment key={node.id}>
          <LayerRow
            node={node}
            depth={depth}
            isExpanded={isOpen}
            hasChildren={hasChildren}
            isSelected={selectedElementId === node.id}
            elementIndexById={elementIndexById}
            dropTarget={dropTarget}
            onToggle={toggleNode}
            onSelect={handleSelect}
            onDelete={handleDelete}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          />
          {hasChildren && isOpen && renderNodes(node.children, depth + 1)}
        </React.Fragment>
      );
    });
  };

  return (
    <div
      className="border rounded-md overflow-hidden"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 w-full px-2.5 py-1.5 bg-muted/20">
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
          <span className="text-[11px] font-medium">Layers</span>
          <span className="text-[10px] text-muted-foreground">
            {detectedElements.length}
          </span>
        </button>
      </div>

      {isExpanded && (
        <div className="p-1.5 space-y-0.5 max-h-[320px] overflow-y-auto">
          {renderNodes(layerTree, 0)}
        </div>
      )}
    </div>
  );
};

export default LayersPanel;
