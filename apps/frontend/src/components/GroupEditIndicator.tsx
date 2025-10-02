import React from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { X } from 'lucide-react';

interface GroupEditIndicatorProps {
  slideId: string;
}

const GroupEditIndicator: React.FC<GroupEditIndicatorProps> = ({ slideId }) => {
  const { editingGroupId, setEditingGroupId, getDraftComponents } = useEditorStore();
  
  if (!editingGroupId) return null;
  
  const components = getDraftComponents(slideId);
  const groupComponent = components.find(c => c.id === editingGroupId && c.type === 'Group');
  
  if (!groupComponent) return null;
  
  const handleExit = () => {
    setEditingGroupId(null);
  };
  
  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-blue-500 text-white px-4 py-2 rounded-md shadow-lg flex items-center gap-2">
      <span className="text-sm font-medium">Editing Group</span>
      <button
        onClick={handleExit}
        className="p-1 hover:bg-blue-600 rounded transition-colors"
        title="Exit group edit mode"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default GroupEditIndicator; 