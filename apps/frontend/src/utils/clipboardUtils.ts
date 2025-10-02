
import { v4 as uuidv4 } from 'uuid';
import { ComponentInstance } from '../types/components';

// In-memory clipboard storage to avoid browser clipboard API limitations
let clipboardData: ComponentInstance | null = null;
// Track number of times the same component has been pasted
let pasteCount = 0;

export const copyToClipboard = (component: ComponentInstance): void => {
  // Create a deep copy of the component to avoid reference issues
  clipboardData = JSON.parse(JSON.stringify(component));
  // Reset paste counter when a new component is copied
  pasteCount = 0;
};

export const getFromClipboard = (): ComponentInstance | null => {
  return clipboardData ? JSON.parse(JSON.stringify(clipboardData)) : null;
};

export const pasteFromClipboard = (): ComponentInstance | null => {
  if (!clipboardData) {
    return null;
  }

  // Increment paste count
  pasteCount++;

  // Create a duplicate with a new ID
  const duplicate: ComponentInstance = {
    ...JSON.parse(JSON.stringify(clipboardData)),
    id: `${clipboardData.type}-${uuidv4().slice(0, 8)}`,
  };

  // Calculate offset based on paste count (staggered grid-like arrangement)
  // This creates a more organized pattern of pasted components
  if (duplicate.props.position) {
    const offsetX = (pasteCount % 3) * 5; // 0, 5, 10, then repeat
    const offsetY = Math.floor(pasteCount / 3) * 5; // 0 for first row, then 5, 10, etc.
    
    duplicate.props.position = {
      x: Math.min(95, clipboardData.props.position.x + offsetX),
      y: Math.min(95, clipboardData.props.position.y + offsetY)
    };
  }

  return duplicate;
};
