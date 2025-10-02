import { ComponentInstance } from '../types/components';

/**
 * Gets the highest z-index from a list of components
 * @param components List of component instances
 * @returns The highest z-index value
 */
export function getHighestZIndex(components: ComponentInstance[]): number {
  return components.reduce(
    (max, comp) => {
      // Skip background components
      if (comp.type === 'Background' || comp.id.toLowerCase().includes('background')) {
        return max;
      }
      return Math.max(max, comp.props.zIndex || 0);
    }, 
    0
  );
}

/**
 * Gets the next available z-index for a new component
 * @param components List of component instances
 * @returns The next z-index value (highest + 1)
 */
export function getNextZIndex(components: ComponentInstance[]): number {
  const highestZIndex = getHighestZIndex(components);
  return highestZIndex + 1;
}

/**
 * Re-assigns z-indices sequentially to all components
 * @param components List of component instances to reorder
 * @returns A new array of components with reassigned z-indices
 */
export function reorderZIndices(components: ComponentInstance[]): ComponentInstance[] {
  // Separate background components (always z-index 0)
  const backgroundComponents = components.filter(comp => 
    comp.type === 'Background' || comp.id.toLowerCase().includes('background')
  );
  
  // Get non-background components
  const otherComponents = components.filter(comp => 
    comp.type !== 'Background' && !comp.id.toLowerCase().includes('background')
  );
  
  // Sort other components by z-index (ascending)
  const sortedComponents = [...otherComponents].sort((a, b) => 
    (a.props.zIndex || 0) - (b.props.zIndex || 0)
  );
  
  // Reassign z-indices starting from 1 (0 is reserved for backgrounds)
  const reorderedComponents = sortedComponents.map((comp, index) => ({
    ...comp,
    props: {
      ...comp.props,
      zIndex: index + 1 // Start from 1, incrementing for each component
    }
  }));
  
  // Set background components to z-index 0
  const updatedBackgroundComponents = backgroundComponents.map(comp => ({
    ...comp,
    props: {
      ...comp.props,
      zIndex: 0
    }
  }));
  
  // Combine background and other components
  return [...updatedBackgroundComponents, ...reorderedComponents];
}

/**
 * Moves a component to the front (highest z-index)
 * @param components List of component instances
 * @param componentId ID of the component to move
 * @returns A new list with updated z-indices
 */
export function moveComponentToFront(components: ComponentInstance[], componentId: string): ComponentInstance[] {
  // First, reorder all z-indices to ensure they're sequential
  const reordered = reorderZIndices(components);
  
  // Find the component to move
  const componentToMove = reordered.find(comp => comp.id === componentId);
  if (!componentToMove) return reordered;
  
  // If it's a background component, can't move it
  if (componentToMove.type === 'Background' || componentToMove.id.toLowerCase().includes('background')) {
    return reordered;
  }
  
  // Get the highest z-index
  const highestZIndex = getHighestZIndex(reordered);
  
  // Update the target component's z-index
  return reordered.map(comp => {
    if (comp.id === componentId) {
      return {
        ...comp,
        props: {
          ...comp.props,
          zIndex: highestZIndex + 1
        }
      };
    }
    return comp;
  });
}

/**
 * Moves a component to the back (lowest non-background z-index)
 * @param components List of component instances
 * @param componentId ID of the component to move
 * @returns A new list with updated z-indices
 */
export function moveComponentToBack(components: ComponentInstance[], componentId: string): ComponentInstance[] {
  // First, reorder all z-indices to ensure they're sequential
  const reordered = reorderZIndices(components);
  
  // Find the component to move
  const componentToMove = reordered.find(comp => comp.id === componentId);
  if (!componentToMove) return reordered;
  
  // If it's a background component, can't move it
  if (componentToMove.type === 'Background' || componentToMove.id.toLowerCase().includes('background')) {
    return reordered;
  }
  
  // Get all non-background components
  const nonBackgroundComponents = reordered.filter(comp => 
    comp.type !== 'Background' && !comp.id.toLowerCase().includes('background')
  );
  
  // Set the target component to z-index 1 and shift others up
  let currentZIndex = 2; // Start from 2 since 1 will be used for the target component
  
  return reordered.map(comp => {
    // Background components stay at 0
    if (comp.type === 'Background' || comp.id.toLowerCase().includes('background')) {
      return {
        ...comp,
        props: {
          ...comp.props,
          zIndex: 0
        }
      };
    }
    
    // The target component moves to the back (z-index 1)
    if (comp.id === componentId) {
      return {
        ...comp,
        props: {
          ...comp.props,
          zIndex: 1
        }
      };
    }
    
    // All other components get incremented z-indices
    const result = {
      ...comp,
      props: {
        ...comp.props,
        zIndex: currentZIndex++
      }
    };
    
    return result;
  });
}

/**
 * Moves a component forward one level in the z-index stack
 * @param components List of component instances
 * @param componentId ID of the component to move
 * @returns A new list with updated z-indices
 */
export function moveComponentForward(components: ComponentInstance[], componentId: string): ComponentInstance[] {
  // First, reorder all z-indices to ensure they're sequential
  const reordered = reorderZIndices(components);
  
  // Find the component to move
  const componentToMove = reordered.find(comp => comp.id === componentId);
  if (!componentToMove) return reordered;
  
  // If it's a background component, can't move it
  if (componentToMove.type === 'Background' || componentToMove.id.toLowerCase().includes('background')) {
    return reordered;
  }
  
  // Get the current z-index
  const currentZIndex = componentToMove.props.zIndex || 0;
  
  // Find the component immediately above this one
  const aboveComponents = reordered.filter(comp => 
    (comp.props.zIndex || 0) > currentZIndex
  );
  
  // If there's no component above, move to front
  if (aboveComponents.length === 0) {
    return moveComponentToFront(reordered, componentId);
  }
  
  // Find the component immediately above
  const aboveComponent = aboveComponents.reduce((closest, comp) => {
    const compZIndex = comp.props.zIndex || 0;
    const closestZIndex = closest.props.zIndex || 0;
    return (compZIndex < closestZIndex || closest === aboveComponents[0]) ? comp : closest;
  }, aboveComponents[0]);
  
  // Swap positions between the component and the one above it
  return reordered.map(comp => {
    if (comp.id === componentId) {
      return {
        ...comp,
        props: {
          ...comp.props,
          zIndex: aboveComponent.props.zIndex
        }
      };
    }
    if (comp.id === aboveComponent.id) {
      return {
        ...comp,
        props: {
          ...comp.props,
          zIndex: currentZIndex
        }
      };
    }
    return comp;
  });
}

/**
 * Moves a component backward one level in the z-index stack
 * @param components List of component instances
 * @param componentId ID of the component to move
 * @returns A new list with updated z-indices
 */
export function moveComponentBackward(components: ComponentInstance[], componentId: string): ComponentInstance[] {
  // First, reorder all z-indices to ensure they're sequential
  const reordered = reorderZIndices(components);
  
  // Find the component to move
  const componentToMove = reordered.find(comp => comp.id === componentId);
  if (!componentToMove) return reordered;
  
  // If it's a background component, can't move it
  if (componentToMove.type === 'Background' || componentToMove.id.toLowerCase().includes('background')) {
    return reordered;
  }
  
  // Get the current z-index
  const currentZIndex = componentToMove.props.zIndex || 0;
  
  // Can't go below 1 (0 is reserved for backgrounds)
  if (currentZIndex <= 1) {
    return reordered;
  }
  
  // Find the component immediately below this one
  const belowComponents = reordered.filter(comp => 
    (comp.props.zIndex || 0) < currentZIndex && 
    (comp.props.zIndex || 0) > 0 // Skip backgrounds
  );
  
  // If there's no component below, move to back
  if (belowComponents.length === 0) {
    return moveComponentToBack(reordered, componentId);
  }
  
  // Find the component immediately below
  const belowComponent = belowComponents.reduce((closest, comp) => {
    const compZIndex = comp.props.zIndex || 0;
    const closestZIndex = closest.props.zIndex || 0;
    return (compZIndex > closestZIndex || closest === belowComponents[0]) ? comp : closest;
  }, belowComponents[0]);
  
  // Swap positions between the component and the one below it
  return reordered.map(comp => {
    if (comp.id === componentId) {
      return {
        ...comp,
        props: {
          ...comp.props,
          zIndex: belowComponent.props.zIndex
        }
      };
    }
    if (comp.id === belowComponent.id) {
      return {
        ...comp,
        props: {
          ...comp.props,
          zIndex: currentZIndex
        }
      };
    }
    return comp;
  });
}