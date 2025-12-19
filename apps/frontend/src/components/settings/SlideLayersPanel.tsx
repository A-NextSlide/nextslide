import React, { useMemo, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Layers, Image, Type, Box, Group, EyeOff } from 'lucide-react';
import { ComponentInstance } from '@/types/components';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/lib/utils';
import { getSelectionPathForComponent } from '@/utils/selectionUtils';

type DropPosition = 'before' | 'after' | 'inside';

type LayerNode = {
  id: string;
  component: ComponentInstance;
  parentId: string | null;
  children: LayerNode[];
  orderIndex: number;
};

interface SlideLayersPanelProps {
  slideId: string;
  components: ComponentInstance[];
}

const isBackgroundComponent = (component: ComponentInstance) =>
  component.type === 'Background' || (component.id && component.id.toLowerCase().includes('background'));

const getComponentZIndex = (component: ComponentInstance): number => {
  const zIndex = component.props?.zIndex;
  return typeof zIndex === 'number' ? zIndex : Number(zIndex) || 0;
};

const getComponentLabel = (component: ComponentInstance): string => {
  if (component.type === 'Group') return 'Group';
  if (component.type === 'TiptapTextBlock') {
    const text = component.props?.texts?.[0]?.text || component.props?.text || '';
    if (text) return text.length > 32 ? `${text.slice(0, 32)}...` : text;
  }
  if (component.type === 'Image') {
    const alt = component.props?.alt || '';
    if (alt) return alt.length > 32 ? `${alt.slice(0, 32)}...` : alt;
  }
  return component.type;
};

const getComponentIcon = (component: ComponentInstance) => {
  if (component.type === 'TiptapTextBlock') return <Type className="w-3 h-3 text-blue-500" />;
  if (component.type === 'Image') return <Image className="w-3 h-3 text-green-500" />;
  if (component.type === 'Group') return <Group className="w-3 h-3 text-muted-foreground" />;
  return <Box className="w-3 h-3 text-muted-foreground" />;
};

const buildLayerTree = (components: ComponentInstance[]): LayerNode[] => {
  const nodes = new Map<string, LayerNode>();
  const orderIndexMap = new Map<string, number>();

  components.forEach((component, index) => {
    orderIndexMap.set(component.id, index);
  });

  components.forEach((component) => {
    nodes.set(component.id, {
      id: component.id,
      component,
      parentId: (component.props?.parentId as string | null) || null,
      children: [],
      orderIndex: orderIndexMap.get(component.id) || 0,
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
    list.sort((a, b) => {
      const zDiff = getComponentZIndex(b.component) - getComponentZIndex(a.component);
      if (zDiff !== 0) return zDiff;
      return a.orderIndex - b.orderIndex;
    });
    list.forEach((node) => sortNodes(node.children));
  };

  sortNodes(roots);
  return roots;
};

const LayerRow: React.FC<{
  node: LayerNode;
  depth: number;
  isExpanded: boolean;
  hasChildren: boolean;
  isSelected: boolean;
  dropTarget: { id: string; position: DropPosition } | null;
  onToggle: (id: string) => void;
  onSelect: (node: LayerNode, additive: boolean) => void;
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
  dropTarget,
  onToggle,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) => {
  const isBackground = isBackgroundComponent(node.component);
  const isDropBefore = dropTarget?.id === node.id && dropTarget.position === 'before';
  const isDropAfter = dropTarget?.id === node.id && dropTarget.position === 'after';
  const isDropInside = dropTarget?.id === node.id && dropTarget.position === 'inside';

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer transition-colors',
        'hover:bg-muted/50',
        isSelected && 'bg-pink-50 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-800',
        isDropInside && 'bg-muted/70',
        isDropBefore && 'border-t-2 border-pink-500',
        isDropAfter && 'border-b-2 border-pink-500'
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      draggable={!isBackground}
      onDragStart={() => onDragStart(node.id)}
      onDragOver={(e) => onDragOver(e, node)}
      onDrop={() => onDrop(node)}
      onDragEnd={onDragEnd}
      onClick={(e) => onSelect(node, e.shiftKey || e.metaKey || e.ctrlKey)}
    >
      {hasChildren ? (
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.id);
          }}
        >
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
      ) : (
        <span className="w-3 h-3" />
      )}

      {getComponentIcon(node.component)}

      <span className="flex-1 text-xs truncate">{getComponentLabel(node.component)}</span>

      {isBackground && <EyeOff className="w-3 h-3 text-muted-foreground" />}
    </div>
  );
};

const SlideLayersPanel: React.FC<SlideLayersPanelProps> = ({ slideId, components }) => {
  const { selectedComponentIds, selectComponent, setSelectionPath, reorderLayers } = useEditorStore();
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: DropPosition } | null>(null);

  const layerTree = useMemo(() => buildLayerTree(components), [components]);

  const toggleGroup = useCallback((id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelect = useCallback((node: LayerNode, additive: boolean) => {
    const path = getSelectionPathForComponent(components, node.id);
    if (path.length > 0) {
      setSelectionPath(path, null, path.length - 1);
    }
    selectComponent(node.id, additive, slideId);
  }, [components, selectComponent, setSelectionPath, slideId]);

  const handleDragOver = useCallback((e: React.DragEvent, node: LayerNode) => {
    e.preventDefault();
    if (!draggedId || draggedId === node.id) return;

    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const offset = e.clientY - rect.top;
    const ratio = offset / rect.height;

    let position: DropPosition = 'before';
    if (node.component.type === 'Group' && ratio > 0.25 && ratio < 0.75) {
      position = 'inside';
    } else if (ratio > 0.5) {
      position = 'after';
    }

    setDropTarget({ id: node.id, position });
  }, [draggedId]);

  const handleDrop = useCallback((node: LayerNode) => {
    if (!draggedId || !dropTarget) return;
    reorderLayers(slideId, draggedId, dropTarget.id, dropTarget.position);
    setDraggedId(null);
    setDropTarget(null);
  }, [draggedId, dropTarget, reorderLayers, slideId]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDropTarget(null);
  }, []);

  const renderNodes = (nodes: LayerNode[], depth: number) => {
    return nodes.map((node) => {
      const hasChildren = node.children.length > 0;
      const isOpen = expandedGroups.has(node.id) || node.children.some((child) => selectedComponentIds.has(child.id));
      return (
        <React.Fragment key={node.id}>
          <LayerRow
            node={node}
            depth={depth}
            isExpanded={isOpen}
            hasChildren={hasChildren}
            isSelected={selectedComponentIds.has(node.id)}
            dropTarget={dropTarget}
            onToggle={toggleGroup}
            onSelect={handleSelect}
            onDragStart={(id) => setDraggedId(id)}
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
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 w-full px-3 py-2 bg-muted/30">
        <button
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex items-center gap-2 flex-1 hover:bg-muted/50 -ml-1 pl-1 py-0.5 rounded transition-colors"
        >
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <Layers className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Layers</span>
          <span className="text-[10px] text-muted-foreground">{components.length}</span>
        </button>
      </div>
      {isExpanded && (
        <div className="p-2 space-y-1 max-h-[300px] overflow-y-auto">
          {renderNodes(layerTree, 0)}
        </div>
      )}
    </div>
  );
};

export default SlideLayersPanel;
