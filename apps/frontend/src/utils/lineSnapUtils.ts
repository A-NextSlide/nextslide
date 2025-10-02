import { ComponentInstance } from "../types/components";

export interface SnapPoint {
  x: number;
  y: number;
  componentId: string;
  side: 'top' | 'right' | 'bottom' | 'left' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'center';
}

export interface LineSnapResult {
  snapped: boolean;
  point: { x: number; y: number };
  connection?: {
    componentId: string;
    side: string;
    offset: { x: number; y: number };
  };
}

// Snap threshold in pixels - using same as component snap
const SNAP_THRESHOLD = 12;

/**
 * Get all snap points for a component (corners and edge midpoints)
 */
export function getComponentSnapPoints(component: ComponentInstance): SnapPoint[] {
  // Skip background components
  if (component.type === 'Background' || (component.id && component.id.toLowerCase().includes('background'))) {
    return [];
  }

  const position = component.props.position || { x: 0, y: 0 };
  const width = typeof component.props.width === 'number' ? component.props.width : 100;
  const height = typeof component.props.height === 'number' ? component.props.height : 100;

  const left = position.x;
  const right = position.x + width;
  const top = position.y;
  const bottom = position.y + height;
  const centerX = position.x + width / 2;
  const centerY = position.y + height / 2;

  return [
    // Corners
    { x: left, y: top, componentId: component.id, side: 'topLeft' as const },
    { x: right, y: top, componentId: component.id, side: 'topRight' as const },
    { x: left, y: bottom, componentId: component.id, side: 'bottomLeft' as const },
    { x: right, y: bottom, componentId: component.id, side: 'bottomRight' as const },
    
    // Edge midpoints
    { x: centerX, y: top, componentId: component.id, side: 'top' as const },
    { x: right, y: centerY, componentId: component.id, side: 'right' as const },
    { x: centerX, y: bottom, componentId: component.id, side: 'bottom' as const },
    { x: left, y: centerY, componentId: component.id, side: 'left' as const },
    
    // Center
    { x: centerX, y: centerY, componentId: component.id, side: 'center' as const }
  ];
}

/**
 * Find the nearest snap point for a line endpoint
 */
export function findNearestSnapPoint(
  point: { x: number; y: number },
  components: ComponentInstance[],
  excludeComponentId?: string
): LineSnapResult {
  let nearestSnapPoint: SnapPoint | null = null;
  let minDistance = SNAP_THRESHOLD;

  // Check all components for snap points
  for (const component of components) {
    if (component.id === excludeComponentId) continue;
    
    const snapPoints = getComponentSnapPoints(component);
    
    for (const snapPoint of snapPoints) {
      const distance = Math.sqrt(
        Math.pow(point.x - snapPoint.x, 2) + 
        Math.pow(point.y - snapPoint.y, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestSnapPoint = snapPoint;
      }
    }
  }

  if (nearestSnapPoint) {
    return {
      snapped: true,
      point: { x: nearestSnapPoint.x, y: nearestSnapPoint.y },
      connection: {
        componentId: nearestSnapPoint.componentId,
        side: nearestSnapPoint.side,
        offset: { x: 0, y: 0 }
      }
    };
  }

  return {
    snapped: false,
    point: point
  };
}

/**
 * Check if a point is still within snap range of a component
 */
export function isStillConnected(
  point: { x: number; y: number },
  componentId: string,
  side: string,
  components: ComponentInstance[]
): boolean {
  const component = components.find(c => c.id === componentId);
  if (!component) return false;

  const snapPoints = getComponentSnapPoints(component);
  const snapPoint = snapPoints.find(p => p.side === side);
  
  if (!snapPoint) return false;

  const distance = Math.sqrt(
    Math.pow(point.x - snapPoint.x, 2) + 
    Math.pow(point.y - snapPoint.y, 2)
  );

  // Use a larger threshold for disconnection to prevent accidental disconnects
  return distance < SNAP_THRESHOLD * 2;
}

/**
 * Update line endpoints when a connected component moves
 */
export function updateConnectedLines(
  movedComponentId: string,
  components: ComponentInstance[],
  updateComponent: (id: string, updates: Partial<ComponentInstance>, skipHistory: boolean) => void
) {
  // Find all lines that are connected to this component
  const lines = components.filter(c => c.type === 'Lines' || c.type === 'Line' || c.type === 'line');
  const movedComponent = components.find(c => c.id === movedComponentId);
  
  if (!movedComponent) return;
  
  // Batch all line updates
  const lineUpdates: Array<{ id: string; props: any }> = [];
  
  for (const line of lines) {
    let needsUpdate = false;
    const updates: any = {
      ...line.props
    };
    
    // Check start point connection
    if (line.props.startPoint?.connection?.componentId === movedComponentId) {
      const snapPoints = getComponentSnapPoints(movedComponent);
      const newPoint = snapPoints.find(p => p.side === line.props.startPoint.connection.side);
      
      if (newPoint) {
        updates.startPoint = {
          ...line.props.startPoint,
          x: newPoint.x,
          y: newPoint.y
        };
        needsUpdate = true;
      }
    }
    
    // Check end point connection
    if (line.props.endPoint?.connection?.componentId === movedComponentId) {
      const snapPoints = getComponentSnapPoints(movedComponent);
      const newPoint = snapPoints.find(p => p.side === line.props.endPoint.connection.side);
      
      if (newPoint) {
        updates.endPoint = {
          ...line.props.endPoint,
          x: newPoint.x,
          y: newPoint.y
        };
        needsUpdate = true;
      }
    }
    
    if (needsUpdate) {
      lineUpdates.push({ id: line.id, props: updates });
    }
  }
  
  // Apply all updates in a single frame
  if (lineUpdates.length > 0) {
    requestAnimationFrame(() => {
      lineUpdates.forEach(({ id, props }) => {
        updateComponent(id, { props }, true);
      });
    });
  }
} 