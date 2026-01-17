import React from 'react';
import { motion } from 'framer-motion';
import { useEditorState } from '@/context/EditorStateContext';

interface SlideEditControlsProps {
  isEditing: boolean;
  slideId?: string;
}

const SlideEditControls: React.FC<SlideEditControlsProps> = ({ isEditing }) => {
  const { setIsEditing } = useEditorState();

  // Only show Done button when in edit mode
  if (!isEditing) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="absolute top-4 right-4 z-50"
    >
      <button
        onClick={() => setIsEditing(false)}
        className="px-3 py-1 text-xs rounded-md border transition-all bg-[#FF4301] text-white border-[#FF4301] hover:bg-[#e63d01]"
        style={{
          fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
          fontWeight: 600,
          letterSpacing: '0.3px'
        }}
      >
        DONE
      </button>
    </motion.div>
  );
};

export default SlideEditControls;
