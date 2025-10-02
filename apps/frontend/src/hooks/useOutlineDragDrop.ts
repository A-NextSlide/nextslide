import { useState, useCallback } from 'react';

interface UseOutlineDragDropProps {
  // Callback for when a slide reorder is detected and should be processed
  onSlideReorder: (draggedSlideId: string, targetSlideId: string) => void;
  // Callback for when files are dropped, to be processed by file handling logic
  onFilesDropped: (files: File[], targetId: string | null) => void; // targetId can be slideId or null for general drop zone
}

export const useOutlineDragDrop = ({
  onSlideReorder,
  onFilesDropped,
}: UseOutlineDragDropProps) => {
  const [draggedSlideId, setDraggedSlideId] = useState<string | null>(null);
  const [dragOverSlideId, setDragOverSlideId] = useState<string | null>(null);
  const [isDraggingOverChatInput, setIsDraggingOverChatInput] = useState<boolean>(false); // Specific for chat input drop zone

  const handleDragStart = useCallback((slideId: string) => {
    setDraggedSlideId(slideId);
  }, []);

  // Generic drag over handler for individual slide cards
  const handleDragOverSlide = useCallback((e: React.DragEvent, slideId: string) => {
    e.preventDefault();
    if (draggedSlideId !== slideId) {
      setDragOverSlideId(slideId);
    }
  }, [draggedSlideId]);

  // Drag over handler for the main chat input drop zone
  const handleDragOverChatZone = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverChatInput(true);
  }, []);

  const handleDragLeaveChatZone = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverChatInput(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetSlideId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverChatInput(false); // Reset chat zone dragging state
    setDragOverSlideId(null); // Reset slide-specific dragging state

    if (draggedSlideId && targetSlideId) { // Slide reorder
      if (draggedSlideId !== targetSlideId) {
        onSlideReorder(draggedSlideId, targetSlideId);
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) { // File drop
      const files = Array.from(e.dataTransfer.files);
      onFilesDropped(files, targetSlideId); // targetSlideId can be null if dropped on general area
    }

    setDraggedSlideId(null);
  }, [draggedSlideId, onSlideReorder, onFilesDropped]);

  const handleDragEnd = useCallback(() => {
    setDraggedSlideId(null);
    setDragOverSlideId(null);
    // setIsDraggingOverChatInput(false); // Usually handled by onDrop or onDragLeave
  }, []);

  return {
    draggedSlideId,
    dragOverSlideId,
    setDragOverSlideId, // Expose if needed by individual slide cards for onDragEnter/Leave
    isDraggingOverChatInput,
    setIsDraggingOverChatInput, // Expose for direct control of chat input drop zone visual
    handleDragStart,
    handleDragOverSlide,
    handleDragOverChatZone,
    handleDragLeaveChatZone,
    handleDrop,
    handleDragEnd,
  };
}; 