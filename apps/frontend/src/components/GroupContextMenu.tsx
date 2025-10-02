import React from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useEditorStore } from '@/stores/editorStore';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { 
  Group, 
  Ungroup, 
  AlignLeft, 
  AlignCenter, 
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  Columns,
  Copy,
  Clipboard,
  Trash2
} from 'lucide-react';

interface GroupContextMenuProps {
  children: React.ReactNode;
  slideId: string;
}

const GroupContextMenu: React.FC<GroupContextMenuProps> = ({ children, slideId }) => {
  const { 
    selectedComponentIds, 
    groupSelectedComponents,
    ungroupComponents,
    alignSelectedComponents,
    distributeSelectedComponents,
    clearSelection,
    removeDraftComponent
  } = useEditorStore();
  
  const { activeComponents } = useActiveSlide();
  
  const selectedCount = selectedComponentIds.size;
  const selectedComponents = activeComponents.filter(c => selectedComponentIds.has(c.id));
  
  // Check if selection contains a group
  const hasGroup = selectedComponents.some(c => c.type === 'Group');
  const hasMultipleSelection = selectedCount > 1;
  
  const handleGroup = () => {
    if (hasMultipleSelection) {
      groupSelectedComponents(slideId);
    }
  };
  
  const handleUngroup = () => {
    selectedComponents.forEach(comp => {
      if (comp.type === 'Group') {
        ungroupComponents(slideId, comp.id);
      }
    });
  };
  
  const handleEditGroup = () => {
    const groupComponent = selectedComponents.find(c => c.type === 'Group');
    if (groupComponent) {
      useEditorStore.getState().setEditingGroupId(groupComponent.id);
    }
  };
  
  const handleDelete = () => {
    selectedComponents.forEach(comp => {
      const isBackground = comp.type === 'Background' || (comp.id && comp.id.toLowerCase().includes('background'));
      if (!isBackground) {
        removeDraftComponent(slideId, comp.id);
      }
    });
    clearSelection();
  };
  
  const handleCopy = () => {
    // Store selected components in clipboard
    const clipboardData = {
      type: 'components',
      components: selectedComponents.map(comp => ({
        ...comp,
        id: `${comp.id}-copy` // Will need new IDs when pasting
      }))
    };
    navigator.clipboard.writeText(JSON.stringify(clipboardData));
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        {hasMultipleSelection && (
          <>
            <ContextMenuItem onClick={handleGroup}>
              <Group className="mr-2 h-4 w-4" />
              Group Selection
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        
        {hasGroup && (
          <>
            <ContextMenuItem onClick={handleUngroup}>
              <Ungroup className="mr-2 h-4 w-4" />
              Ungroup
            </ContextMenuItem>
            <ContextMenuItem onClick={handleEditGroup}>
              <Group className="mr-2 h-4 w-4" />
              Edit Group Contents
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        
        {hasMultipleSelection && (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <AlignLeft className="mr-2 h-4 w-4" />
                Align
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                <ContextMenuItem onClick={() => alignSelectedComponents(slideId, 'left')}>
                  <AlignLeft className="mr-2 h-4 w-4" />
                  Align Left
                </ContextMenuItem>
                <ContextMenuItem onClick={() => alignSelectedComponents(slideId, 'center')}>
                  <AlignCenter className="mr-2 h-4 w-4" />
                  Align Center
                </ContextMenuItem>
                <ContextMenuItem onClick={() => alignSelectedComponents(slideId, 'right')}>
                  <AlignRight className="mr-2 h-4 w-4" />
                  Align Right
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => alignSelectedComponents(slideId, 'top')}>
                  <AlignStartVertical className="mr-2 h-4 w-4" />
                  Align Top
                </ContextMenuItem>
                <ContextMenuItem onClick={() => alignSelectedComponents(slideId, 'middle')}>
                  <AlignCenterVertical className="mr-2 h-4 w-4" />
                  Align Middle
                </ContextMenuItem>
                <ContextMenuItem onClick={() => alignSelectedComponents(slideId, 'bottom')}>
                  <AlignEndVertical className="mr-2 h-4 w-4" />
                  Align Bottom
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
            
            {selectedCount >= 3 && (
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <Columns className="mr-2 h-4 w-4" />
                  Distribute
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-48">
                  <ContextMenuItem onClick={() => distributeSelectedComponents(slideId, 'horizontal')}>
                    Distribute Horizontally
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => distributeSelectedComponents(slideId, 'vertical')}>
                    Distribute Vertically
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
            )}
            
            <ContextMenuSeparator />
          </>
        )}
        
        <ContextMenuItem onClick={handleCopy}>
          <Copy className="mr-2 h-4 w-4" />
          Copy
        </ContextMenuItem>
        
        <ContextMenuItem>
          <Clipboard className="mr-2 h-4 w-4" />
          Paste
        </ContextMenuItem>
        
        <ContextMenuSeparator />
        
        <ContextMenuItem onClick={handleDelete} className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default GroupContextMenu; 