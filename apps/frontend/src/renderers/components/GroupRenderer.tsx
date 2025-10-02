import React from 'react';
import { RendererProps } from '../index';
import { useEditorStore } from '@/stores/editorStore';
import { registerRenderer } from '../utils';

/**
 * GroupRenderer - Renders a group of components
 * Groups are containers that allow multiple components to be moved/transformed together
 */
const GroupRenderer: React.FC<RendererProps> = ({ 
  component, 
  isSelected = false,
  containerRef,
  styles,
  isEditing
}) => {
  const { isComponentSelected, editingGroupId, setEditingGroupId } = useEditorStore();
  const childIds = (component.props.children as string[]) || [];
  
  // Calculate if group should show selection based on any child being selected
  const isGroupOrChildSelected = isSelected || childIds.some(id => isComponentSelected(id));
  const isEditingThisGroup = editingGroupId === component.id;
  
  // Don't render anything if the group is invisible
  const opacity = component.props.opacity ?? 1;
  if (component.props.visible === false || opacity === 0) {
    return null;
  }

  // Handle double-click to enter group edit mode
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isEditing) {
      e.stopPropagation();
      e.preventDefault();
      setEditingGroupId(component.id);
    }
  };

  return (
    <div
      ref={containerRef}
      data-component-id={component.id}
      data-component-type="Group"
      style={{
        ...styles,
        pointerEvents: 'auto',
        cursor: isEditing ? 'move' : 'default',
      }}
      onDoubleClick={handleDoubleClick}
    >
      {/* Render selection outline */}
      {isGroupOrChildSelected && !isEditingThisGroup && (
        <div
          className="absolute inset-0 border-2 border-blue-500 border-dashed pointer-events-none"
          style={{
            boxShadow: '0 0 0 1px rgba(59, 130, 246, 0.3)',
          }}
        />
      )}
      
      {/* Show editing indicator when editing this group */}
      {isEditingThisGroup && (
        <div className="absolute -top-6 left-0 bg-blue-500 text-white text-xs px-2 py-1 rounded">
          Editing Group
        </div>
      )}
      
      {/* Groups don't render their children directly - they're rendered by the slide */}
      {/* This is just a container for selection and interaction */}
    </div>
  );
};

// Register the renderer
registerRenderer('Group', GroupRenderer);

export default GroupRenderer; 