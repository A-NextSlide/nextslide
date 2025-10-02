import React from 'react';
import { Button } from '@/components/ui/button';
import { Edit2, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEditorState } from '@/context/EditorStateContext';

interface SlideEditControlsProps {
  isEditing: boolean;
  slideId?: string;
}

const SlideEditControls: React.FC<SlideEditControlsProps> = ({ isEditing, slideId }) => {
  const { setIsEditing } = useEditorState();

  if (!isEditing) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="absolute top-4 right-4 z-50"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-2 bg-white/90 backdrop-blur-sm"
        >
          <Edit2 className="h-4 w-4" />
          Edit
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="absolute top-4 right-4 z-50"
    >
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsEditing(false)}
        className="flex items-center gap-2 bg-white/90 backdrop-blur-sm"
      >
        <X className="h-4 w-4" />
        Exit Edit Mode
      </Button>
    </motion.div>
  );
};

export default SlideEditControls;
