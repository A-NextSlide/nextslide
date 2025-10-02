import React from 'react';
import { MoveUp, MoveDown, ArrowUpToLine, ArrowDownToLine } from 'lucide-react';
import { ComponentInstance } from '@/types/components';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { 
  getHighestZIndex, 
  moveComponentToFront, 
  moveComponentToBack, 
  moveComponentForward, 
  moveComponentBackward 
} from '@/utils/zIndexUtils';

interface ZIndexControlsProps {
  component: ComponentInstance;
  onUpdate: (propName: string, value: any, skipHistory?: boolean) => void;
  saveComponentToHistory: (message?: string) => void;
  disabled?: boolean;
}

const ZIndexControls: React.FC<ZIndexControlsProps> = ({
  component,
  onUpdate,
  saveComponentToHistory,
  disabled = false
}) => {
  // Get active components to calculate max z-index
  const { activeComponents, updateComponent } = useActiveSlide();
  
  // Calculate if the current component is already at front or back
  const isBackground = component.type === 'Background' || 
                      component.id.toLowerCase().includes('background');
  
  // Background is always at z-index 0 and cannot be moved
  if (isBackground) {
    return (
      <div className="flex items-center justify-center h-8 border border-border rounded-md bg-muted/30">
        <span className="text-xs text-muted-foreground">Fixed at bottom layer</span>
      </div>
    );
  }

  // Filter out background components for z-index calculations
  const nonBackgroundComponents = activeComponents.filter(comp => 
    comp.type !== 'Background' && !comp.id.toLowerCase().includes('background')
  );

  // Get the current z-index
  const currentZIndex = component.props.zIndex || 0;
  
  // Calculate max z-index
  const maxZIndex = nonBackgroundComponents.reduce(
    (max, comp) => Math.max(max, comp.props.zIndex || 0), 
    0
  );
  
  // Check if component is already at front or back
  const isAtFront = currentZIndex >= maxZIndex;
  const isAtBack = currentZIndex <= 1; // 0 reserved for background

  // Helper function to save state before making changes
  const saveStateBeforeChanges = () => {
    saveComponentToHistory("Save z-index state");
  };

  // Handle applying z-index changes to all affected components
  const applyZIndexChanges = (updatedComponents: ComponentInstance[]) => {
    try {
      // Apply updates to all affected components
      updatedComponents.forEach(updatedComp => {
        // Skip updates to the current component (it's handled by our callback)
        if (updatedComp.id === component.id) return;
        
        // Get the original component
        const originalComp = activeComponents.find(c => c.id === updatedComp.id);
        if (!originalComp) return;
        
        // Only update if z-index has changed
        if (originalComp.props.zIndex !== updatedComp.props.zIndex) {
          // Update the component with the new z-index
          updateComponent(updatedComp.id, {
            props: { 
              zIndex: updatedComp.props.zIndex 
            }
          }, true); // Skip history for each individual update
        }
      });
    } catch (error) {
      console.error("Error applying z-index changes:", error);
    }
  };

  // Move to front (highest z-index)
  const handleMoveToFront = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent default button behavior
    e.stopPropagation(); // Stop event propagation
    
    if (isAtFront) return; // Don't do anything if already at front
    
    // Save state for undo
    saveStateBeforeChanges();
    
    try {
      // Calculate all component position changes
      const updatedComponents = moveComponentToFront(activeComponents, component.id);
      
      // Find our updated component to get its new z-index
      const updatedComponent = updatedComponents.find(c => c.id === component.id);
      if (!updatedComponent) return;
      
      // Update our component first
      onUpdate('zIndex', updatedComponent.props.zIndex);
      console.log(`Moving component ${component.id} to front, z-index: ${updatedComponent.props.zIndex}`);
      
      // Update all other affected components
      applyZIndexChanges(updatedComponents);
    } catch (error) {
      console.error("Error moving component to front:", error);
    }
  };

  // Move to back (lowest non-background z-index)
  const handleMoveToBack = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent default button behavior
    e.stopPropagation(); // Stop event propagation
    
    if (isAtBack) return; // Don't do anything if already at back
    
    // Save state for undo
    saveStateBeforeChanges();
    
    try {
      // Calculate all component position changes
      const updatedComponents = moveComponentToBack(activeComponents, component.id);
      
      // Find our updated component to get its new z-index
      const updatedComponent = updatedComponents.find(c => c.id === component.id);
      if (!updatedComponent) return;
      
      // Update our component first
      onUpdate('zIndex', updatedComponent.props.zIndex);
      console.log(`Moving component ${component.id} to back, z-index: ${updatedComponent.props.zIndex}`);
      
      // Update all other affected components
      applyZIndexChanges(updatedComponents);
    } catch (error) {
      console.error("Error moving component to back:", error);
    }
  };

  // Move forward one level
  const handleMoveForward = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent default button behavior
    e.stopPropagation(); // Stop event propagation
    
    if (isAtFront) return; // Don't do anything if already at front
    
    // Save state for undo
    saveStateBeforeChanges();
    
    try {
      // Calculate all component position changes
      const updatedComponents = moveComponentForward(activeComponents, component.id);
      
      // Find our updated component to get its new z-index
      const updatedComponent = updatedComponents.find(c => c.id === component.id);
      if (!updatedComponent) return;
      
      // Update our component first
      onUpdate('zIndex', updatedComponent.props.zIndex);
      console.log(`Moving component ${component.id} forward, z-index: ${updatedComponent.props.zIndex}`);
      
      // Update all other affected components
      applyZIndexChanges(updatedComponents);
    } catch (error) {
      console.error("Error moving component forward:", error);
    }
  };

  // Move backward one level
  const handleMoveBackward = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent default button behavior
    e.stopPropagation(); // Stop event propagation
    
    if (isAtBack) return; // Don't do anything if already at back
    
    // Save state for undo
    saveStateBeforeChanges();
    
    try {
      // Calculate all component position changes
      const updatedComponents = moveComponentBackward(activeComponents, component.id);
      
      // Find our updated component to get its new z-index
      const updatedComponent = updatedComponents.find(c => c.id === component.id);
      if (!updatedComponent) return;
      
      // Update our component first
      onUpdate('zIndex', updatedComponent.props.zIndex);
      console.log(`Moving component ${component.id} backward, z-index: ${updatedComponent.props.zIndex}`);
      
      // Update all other affected components
      applyZIndexChanges(updatedComponents);
    } catch (error) {
      console.error("Error moving component backward:", error);
    }
  };

  return (
    <div className="flex items-center space-x-1 mt-1">
      <div className={`flex items-center bg-background border border-border rounded-md h-8 w-full`}>
        {/* Send to Back */}
        <button 
          type="button"
          className={`h-7 w-1/4 rounded-l-sm flex justify-center items-center transition-colors ${
            isAtBack ? 'text-muted-foreground opacity-50 cursor-not-allowed' : 'hover:bg-accent/40 text-foreground'
          }`}
          onClick={handleMoveToBack}
          disabled={isAtBack || disabled}
          title="Send to Back"
        >
          <ArrowDownToLine size={15} />
        </button>

        <div className="w-px h-5 bg-border" />
        
        {/* Move Backward */}
        <button 
          type="button"
          className={`h-7 w-1/4 flex justify-center items-center transition-colors ${
            isAtBack ? 'text-muted-foreground opacity-50 cursor-not-allowed' : 'hover:bg-accent/40 text-foreground'
          }`}
          onClick={handleMoveBackward}
          disabled={isAtBack || disabled}
          title="Send Backward"
        >
          <MoveDown size={15} />
        </button>

        <div className="w-px h-5 bg-border" />
        
        {/* Move Forward */}
        <button 
          type="button"
          className={`h-7 w-1/4 flex justify-center items-center transition-colors ${
            isAtFront ? 'text-muted-foreground opacity-50 cursor-not-allowed' : 'hover:bg-accent/40 text-foreground'
          }`}
          onClick={handleMoveForward}
          disabled={isAtFront || disabled}
          title="Bring Forward"
        >
          <MoveUp size={15} />
        </button>

        <div className="w-px h-5 bg-border" />
        
        {/* Bring to Front */}
        <button 
          type="button"
          className={`h-7 w-1/4 rounded-r-sm flex justify-center items-center transition-colors ${
            isAtFront ? 'text-muted-foreground opacity-50 cursor-not-allowed' : 'hover:bg-accent/40 text-foreground'
          }`}
          onClick={handleMoveToFront}
          disabled={isAtFront || disabled}
          title="Bring to Front"
        >
          <ArrowUpToLine size={15} />
        </button>
      </div>
    </div>
  );
};

export default ZIndexControls;