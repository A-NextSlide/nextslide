import React, { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEditorStore } from '../stores/editorStore';
import { useHistoryStore } from '../stores/historyStore';

interface UnsavedChangesDialogProps {
  isOpen: boolean;
  slideId: string;
  onClose: () => void;
  onSave: () => void;
  onDiscard: () => void;
}

const UnsavedChangesDialog: React.FC<UnsavedChangesDialogProps> = ({
  isOpen,
  slideId,
  onClose,
  onSave,
  onDiscard
}) => {
  // Get editor store
  const editorStore = useEditorStore();
  const historyStore = useHistoryStore();
  
  // Use useEffect to handle dialogic logic to avoid state updates during render
  const [shouldSkipDialog, setShouldSkipDialog] = useState(false);
  
  // Check conditions in useEffect instead of during render
  useEffect(() => {
    if (!isOpen) {
      // Reset skip flag when dialog is closed
      setShouldSkipDialog(false);
      return;
    }
    
    // Check if we actually have unsaved changes for this slide using editorStore flag
    const hasUnsavedChanges = editorStore.hasSlideChanged(slideId);
    
    // More robust check: verify if there are more than one history entry for this slide
    // (first entry is the initialization baseline)
    const slideHistoryEntries = (historyStore.history[slideId] || []);
    const hasMultipleHistoryEntries = slideHistoryEntries.length > 1;
    
    // Check if history index is at least at the second entry (index 1 or higher)
    const currentHistoryIndex = historyStore.historyIndex[slideId] ?? -1;
    const hasAdvancedHistoryIndex = currentHistoryIndex > 0;
    
    // Determine if we have real changes by checking multiple conditions
    const hasRealChanges = hasUnsavedChanges && 
                         hasMultipleHistoryEntries && 
                         hasAdvancedHistoryIndex;
    
    // If no real unsaved changes, skip the dialog
    if (!hasRealChanges) {
      // Reset flag if it's incorrectly set
      if (hasUnsavedChanges) {
        // Use setTimeout to avoid direct state update after render
        setTimeout(() => {
          editorStore.markSlideAsUnchanged(slideId);
        }, 0);
      }
      
      // Set state to skip dialog on next render
      setShouldSkipDialog(true);
    } else {
      // Ensure skip flag is reset if there are real changes
      setShouldSkipDialog(false);
    }
  }, [isOpen, slideId, editorStore, historyStore]);
  
  // Handle auto-discard if needed
  useEffect(() => {
    if (shouldSkipDialog && isOpen) {
      // Use setTimeout to ensure this happens after render is complete
      setTimeout(() => {
        // Auto-close and proceed
        onDiscard(); 
        // Reset skip state after discarding
        setShouldSkipDialog(false); 
      }, 0);
    }
  }, [shouldSkipDialog, isOpen, onDiscard]);
  
  // Return null if we should skip the dialog
  if (shouldSkipDialog && isOpen) { // Check isOpen again to avoid rendering null briefly after discard
    return null;
  }
  
  return (
    <AlertDialog 
      open={isOpen} 
      onOpenChange={(open) => {
        if (!open) {
          // User clicked outside or pressed ESC - just close without navigation
          onClose();
          setShouldSkipDialog(false); // Reset skip state on close
        }
      }}
    >
      <AlertDialogContent 
        // Remove event prevention - allow normal escape and click outside behavior
        // Just rely on onOpenChange to handle these events
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Save changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes on this slide. Would you like to save them before navigating away?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { onDiscard(); setShouldSkipDialog(false); }}>
            Discard
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => { onSave(); setShouldSkipDialog(false); }}>Save</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default UnsavedChangesDialog;