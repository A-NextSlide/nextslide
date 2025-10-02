import { ComponentInstance } from "../types/components";
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from './deckUtils';

export interface SnapPosition {
  x: number | null;
  y: number | null;
}

export interface SnapGuideInfo {
  visible: boolean;
  position: number;
  type: 'center-x' | 'center-y' | 'edge-x' | 'edge-y';
}

// Snap threshold in pixels - adjusted for 1920x1080 resolution
// Using a slightly larger threshold to make snapping easier to trigger
const SNAP_THRESHOLD = 8;

/**
 * Calculate snapping position and visible guides
 * Only shows guides for: 
 * - Center alignment (vertical/horizontal)
 * - Edge alignment (top, middle, bottom, left, right)
 */
export function calculateSnap(
  movingComponent: ComponentInstance,
  allComponents: ComponentInstance[],
  newPosition: { x: number, y: number },
  slideSize: { width: number, height: number } = { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT }
): { snappedPosition: { x: number, y: number }, guides: SnapGuideInfo[] } {
  // Skip background components
  if (isBackgroundComponent(movingComponent)) {
    return { 
      snappedPosition: newPosition, 
      guides: [] 
    };
  }

  const otherComponents = allComponents.filter(c => 
    c.id !== movingComponent.id && !isBackgroundComponent(c)
  );
  
  // Start with no snapping
  let snappedX = newPosition.x;
  let snappedY = newPosition.y;
  const guides: SnapGuideInfo[] = [];
  
  // Get component dimensions
  const movingWidth = typeof movingComponent.props.width === 'number' 
    ? movingComponent.props.width 
    : 100; // Default if not numeric
  
  const movingHeight = typeof movingComponent.props.height === 'number' 
    ? movingComponent.props.height 
    : 100; // Default if not numeric

  // Calculate edges and center of the moving component
  const movingLeft = newPosition.x;
  const movingRight = newPosition.x + movingWidth;
  const movingTop = newPosition.y;
  const movingBottom = newPosition.y + movingHeight;
  const movingCenterX = newPosition.x + (movingWidth / 2);
  const movingCenterY = newPosition.y + (movingHeight / 2);
  
  // Check for center snapping with the slide
  const slideCenterX = Math.floor(slideSize.width / 2);
  if (Math.abs(movingCenterX - slideCenterX) < SNAP_THRESHOLD) {
    // Snap to center X - ensure precise alignment with exact center
    snappedX = Math.round(slideCenterX - (movingWidth / 2));
    guides.push({
      visible: true,
      position: slideCenterX,
      type: 'center-x'
    });
  }
  
  const slideCenterY = Math.floor(slideSize.height / 2);
  if (Math.abs(movingCenterY - slideCenterY) < SNAP_THRESHOLD) {
    // Snap to center Y - ensure precise alignment with exact center
    snappedY = Math.round(slideCenterY - (movingHeight / 2));
    guides.push({
      visible: true,
      position: slideCenterY,
      type: 'center-y'
    });
  }

  // Check for alignment with other components
  otherComponents.forEach(otherComp => {
    const otherWidth = typeof otherComp.props.width === 'number' 
      ? otherComp.props.width 
      : 100;
    
    const otherHeight = typeof otherComp.props.height === 'number' 
      ? otherComp.props.height 
      : 100;
    
    const otherPosition = otherComp.props.position || { x: 0, y: 0 };
    
    // Calculate edges and center of the other component
    const otherLeft = otherPosition.x;
    const otherRight = otherPosition.x + otherWidth;
    const otherTop = otherPosition.y;
    const otherBottom = otherPosition.y + otherHeight;
    const otherCenterX = otherPosition.x + (otherWidth / 2);
    const otherCenterY = otherPosition.y + (otherHeight / 2);
    
    // Check for horizontal center alignment (component centers align horizontally)
    if (Math.abs(movingCenterX - otherCenterX) < SNAP_THRESHOLD) {
      // Snap center X to other center X - ensure precise alignment
      snappedX = Math.round(otherCenterX - (movingWidth / 2));
      guides.push({
        visible: true,
        position: otherCenterX,
        type: 'center-x'
      });
    }
    
    // Check for vertical center alignment (component centers align vertically)
    if (Math.abs(movingCenterY - otherCenterY) < SNAP_THRESHOLD) {
      // Snap center Y to other center Y - ensure precise alignment
      snappedY = Math.round(otherCenterY - (movingHeight / 2));
      guides.push({
        visible: true,
        position: otherCenterY,
        type: 'center-y'
      });
    }
    
    // ===== Edge Alignment Checks =====
    
    // Top edge alignment
    if (Math.abs(movingTop - otherTop) < SNAP_THRESHOLD) {
      snappedY = Math.round(otherTop);
      guides.push({
        visible: true,
        position: otherTop,
        type: 'edge-y'
      });
    }
    
    // Bottom edge alignment
    else if (Math.abs(movingBottom - otherBottom) < SNAP_THRESHOLD) {
      snappedY = Math.round(otherBottom - movingHeight);
      guides.push({
        visible: true,
        position: otherBottom,
        type: 'edge-y'
      });
    }
    
    // Middle horizontal alignment (top of component with bottom of other)
    else if (Math.abs(movingTop - otherBottom) < SNAP_THRESHOLD) {
      snappedY = Math.round(otherBottom);
      guides.push({
        visible: true,
        position: otherBottom,
        type: 'edge-y'
      });
    }
    
    // Middle horizontal alignment (bottom of component with top of other)
    else if (Math.abs(movingBottom - otherTop) < SNAP_THRESHOLD) {
      snappedY = Math.round(otherTop - movingHeight);
      guides.push({
        visible: true,
        position: otherTop,
        type: 'edge-y'
      });
    }
    
    // Left edge alignment
    if (Math.abs(movingLeft - otherLeft) < SNAP_THRESHOLD) {
      snappedX = Math.round(otherLeft);
      guides.push({
        visible: true,
        position: otherLeft,
        type: 'edge-x'
      });
    }
    
    // Right edge alignment
    else if (Math.abs(movingRight - otherRight) < SNAP_THRESHOLD) {
      snappedX = Math.round(otherRight - movingWidth);
      guides.push({
        visible: true,
        position: otherRight,
        type: 'edge-x'
      });
    }
    
    // Middle vertical alignment (left of component with right of other)
    else if (Math.abs(movingLeft - otherRight) < SNAP_THRESHOLD) {
      snappedX = Math.round(otherRight);
      guides.push({
        visible: true,
        position: otherRight,
        type: 'edge-x'
      });
    }
    
    // Middle vertical alignment (right of component with left of other)
    else if (Math.abs(movingRight - otherLeft) < SNAP_THRESHOLD) {
      snappedX = Math.round(otherLeft - movingWidth);
      guides.push({
        visible: true,
        position: otherLeft,
        type: 'edge-x'
      });
    }
  });

  // Log guides if enabled and they exist
  // console.log(`Snap guides generated: ${guides.length}`, guides);

  return {
    snappedPosition: { x: snappedX, y: snappedY },
    guides
  };
}

// Helper to check if a component is a background component
function isBackgroundComponent(component: ComponentInstance): boolean {
  return component.type === 'Background' || 
                   (component.id && component.id.toLowerCase().includes('background'));
}
