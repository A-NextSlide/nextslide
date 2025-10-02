import React, { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { ComponentInstance } from "@/types/components";
import { registerRenderer } from '../utils';
import type { RendererFunction } from '../index';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { useLinesDrag } from '@/hooks/componentInteractions/useLinesDrag';
import { getComponentSnapPoints } from '@/utils/lineSnapUtils';
import { normalizeGradientStops } from '../../registry/library/gradient-properties';

/**
 * Calculate the actual position of a connection point on a component
 */
const getConnectionPoint = (
  componentId: string,
  side: string,
  offset: { x: number; y: number } = { x: 0, y: 0 },
  allComponents: ComponentInstance[],
  draggedPositions?: Map<string, { x: number; y: number }>
): { x: number; y: number } | null => {
  const component = allComponents.find(c => c.id === componentId);
  if (!component) return null;

  const { position, width, height } = component.props;
  // Use dragged position if available, otherwise use component position
  const actualPosition = draggedPositions?.get(componentId) || position || { x: 0, y: 0 };
  const { x, y } = actualPosition;

  let connectionX = x;
  let connectionY = y;

  switch (side) {
    case 'top':
      connectionX = x + width / 2;
      connectionY = y;
      break;
    case 'right':
      connectionX = x + width;
      connectionY = y + height / 2;
      break;
    case 'bottom':
      connectionX = x + width / 2;
      connectionY = y + height;
      break;
    case 'left':
      connectionX = x;
      connectionY = y + height / 2;
      break;
    case 'topLeft':
      connectionX = x;
      connectionY = y;
      break;
    case 'topRight':
      connectionX = x + width;
      connectionY = y;
      break;
    case 'bottomLeft':
      connectionX = x;
      connectionY = y + height;
      break;
    case 'bottomRight':
      connectionX = x + width;
      connectionY = y + height;
      break;
    case 'center':
      connectionX = x + width / 2;
      connectionY = y + height / 2;
      break;
  }

  return {
    x: connectionX + offset.x,
    y: connectionY + offset.y
  };
};

/**
 * Generate SVG path for different connection types
 */
const generatePath = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  connectionType: string,
  controlPoints?: { x: number; y: number }[]
): string => {
  switch (connectionType) {
    case 'straight':
      return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    
    case 'elbow': {
      // Use control point if provided, otherwise default to middle
      let midX = (start.x + end.x) / 2;
      if (controlPoints && controlPoints.length > 0) {
        midX = controlPoints[0].x;
      }
      return `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;
    }
    
    case 'curved': {
      const controlX = (start.x + end.x) / 2;
      const controlY1 = start.y;
      const controlY2 = end.y;
      return `M ${start.x} ${start.y} C ${controlX} ${controlY1}, ${controlX} ${controlY2}, ${end.x} ${end.y}`;
    }
    
    case 'quadratic': {
      if (controlPoints && controlPoints.length >= 1) {
        const cp = controlPoints[0];
        return `M ${start.x} ${start.y} Q ${cp.x} ${cp.y} ${end.x} ${end.y}`;
      }
      // Fallback to curved if no control points
      const cpX = (start.x + end.x) / 2;
      const cpY = (start.y + end.y) / 2 - 50; // Offset up for visual curve
      return `M ${start.x} ${start.y} Q ${cpX} ${cpY} ${end.x} ${end.y}`;
    }
    
    case 'cubic': {
      if (controlPoints && controlPoints.length >= 2) {
        const cp1 = controlPoints[0];
        const cp2 = controlPoints[1];
        return `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;
      }
      // Fallback to S-curve if no control points
      const cp1X = start.x + (end.x - start.x) * 0.3;
      const cp1Y = start.y;
      const cp2X = start.x + (end.x - start.x) * 0.7;
      const cp2Y = end.y;
      return `M ${start.x} ${start.y} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${end.x} ${end.y}`;
    }
    
    default:
      return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }
};

/**
 * Render end shape markers
 */
const renderEndShape = (
  type: string,
  id: string,
  size: number,
  color: string,
  strokeWidth: number
): React.ReactNode => {
  if (type === 'none') return null;

  const markerSize = size;
  const halfSize = markerSize / 2;
  // Use a fixed stroke width for hollow shapes to ensure visibility
  const shapeStrokeWidth = 1.5;

  switch (type) {
    case 'arrow':
      return (
        <marker
          id={id}
          markerWidth={markerSize}
          markerHeight={markerSize}
          refX={markerSize - 1}
          refY={halfSize}
          orient="auto"
        >
          <path
            d={`M 0 0 L ${markerSize} ${halfSize} L 0 ${markerSize} z`}
            fill={color}
          />
        </marker>
      );
    
    case 'circle':
      return (
        <marker
          id={id}
          markerWidth={markerSize}
          markerHeight={markerSize}
          refX={markerSize - 1}
          refY={halfSize}
          orient="auto"
        >
          <circle
            cx={halfSize}
            cy={halfSize}
            r={halfSize - 1}
            fill={color}
          />
        </marker>
      );
    
    case 'hollowCircle':
      return (
        <marker
          id={id}
          markerWidth={markerSize}
          markerHeight={markerSize}
          refX={markerSize - 1}
          refY={halfSize}
          orient="auto"
        >
          <circle
            cx={halfSize}
            cy={halfSize}
            r={Math.max(2, halfSize - shapeStrokeWidth - 0.5)}
            fill="white"
            stroke={color}
            strokeWidth={shapeStrokeWidth}
          />
        </marker>
      );
    
    case 'square':
      return (
        <marker
          id={id}
          markerWidth={markerSize}
          markerHeight={markerSize}
          refX={markerSize - 1}
          refY={halfSize}
          orient="auto"
        >
          <rect
            x={1}
            y={1}
            width={markerSize - 2}
            height={markerSize - 2}
            fill={color}
          />
        </marker>
      );
    
    case 'hollowSquare':
      return (
        <marker
          id={id}
          markerWidth={markerSize}
          markerHeight={markerSize}
          refX={markerSize - shapeStrokeWidth / 2}
          refY={halfSize}
          orient="auto"
        >
          <rect
            x={shapeStrokeWidth}
            y={shapeStrokeWidth}
            width={markerSize - shapeStrokeWidth * 2}
            height={markerSize - shapeStrokeWidth * 2}
            fill="white"
            stroke={color}
            strokeWidth={shapeStrokeWidth}
          />
        </marker>
      );
    
    case 'diamond':
      return (
        <marker
          id={id}
          markerWidth={markerSize}
          markerHeight={markerSize}
          refX={markerSize}
          refY={halfSize}
          orient="auto"
        >
          <path
            d={`M ${halfSize} 0 L ${markerSize} ${halfSize} L ${halfSize} ${markerSize} L 0 ${halfSize} z`}
            fill={color}
          />
        </marker>
      );
    
    case 'hollowDiamond':
      return (
        <marker
          id={id}
          markerWidth={markerSize}
          markerHeight={markerSize}
          refX={markerSize - shapeStrokeWidth / 2}
          refY={halfSize}
          orient="auto"
        >
          <path
            d={`M ${halfSize} ${shapeStrokeWidth} L ${markerSize - shapeStrokeWidth} ${halfSize} L ${halfSize} ${markerSize - shapeStrokeWidth} L ${shapeStrokeWidth} ${halfSize} z`}
            fill="white"
            stroke={color}
            strokeWidth={shapeStrokeWidth}
          />
        </marker>
      );
    
    default:
      return null;
  }
};

/**
 * Renders a Lines component
 */
export const renderLines: RendererFunction = ({ component, containerRef, isSelected, isEditing, onUpdate }) => {
  const props = component.props;
  
  // Try to use context, but provide fallback when not available
  let activeComponents: ComponentInstance[] = [];
  let updateComponent = (id: string, updates: Partial<ComponentInstance>, skipHistory?: boolean) => {
    // Default to using onUpdate if available
    if (onUpdate) {
      onUpdate(updates);
    }
  };
  
  try {
    // Attempt to use the ActiveSlide context
    const context = useActiveSlide();
    activeComponents = context.activeComponents;
    updateComponent = context.updateComponent;
  } catch (error) {
    // Context not available (e.g., in thumbnails or isolated renders)
    // Use empty components array and fallback update function
    console.debug('ActiveSlide context not available, using fallback for Lines component');
  }
  
  const localContainerRef = useRef<HTMLDivElement>(null);
  
  // Track real-time component positions during drag
  const [draggedComponents, setDraggedComponents] = useState<Map<string, { x: number; y: number }>>(new Map());
  
  // Listen for component position updates
  useEffect(() => {
    const handleComponentLayoutUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail && detail.componentId && detail.layout?.position) {
        setDraggedComponents(prev => {
          const newMap = new Map(prev);
          if (detail.source === 'localDrag' || detail.isDragging) {
            newMap.set(detail.componentId, detail.layout.position);
          } else {
            // Clear position when drag ends
            newMap.delete(detail.componentId);
          }
          return newMap;
        });
      }
    };
    
    // Also listen for drag end events to clear positions
    const handleDragEnd = () => {
      setDraggedComponents(new Map());
    };
    
    document.addEventListener('component-layout-updated', handleComponentLayoutUpdate);
    document.addEventListener('component:dragend', handleDragEnd);
    
    return () => {
      document.removeEventListener('component-layout-updated', handleComponentLayoutUpdate);
      document.removeEventListener('component:dragend', handleDragEnd);
    };
  }, []);
  
  // Use the lines drag hook
  const { 
    isDragging, 
    draggedEndpoint,
    hoveredComponentId,
    cursorPosition,
    handleLineMouseDown,
    handleStartMouseDown,
    handleEndMouseDown 
  } = useLinesDrag({
    component,
    isDraggable: isEditing,
    isSelected,
    containerRef: localContainerRef,
    slideSize: { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT },
    updateComponent: updateComponent
  });
  
  // Emit line drag state changes
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const event = new CustomEvent('line-drag-update', {
        bubbles: true,
        detail: {
          isDragging,
          hoveredComponentId,
          cursorPosition,
          componentId: component.id
        }
      });
      document.dispatchEvent(event);
    }
  }, [isDragging, hoveredComponentId, cursorPosition, component.id]);
  
  // Get line properties
  const {
    startPoint = { x: 100, y: 100 },
    endPoint = { x: 300, y: 300 },
    connectionType = 'straight',
    startShape = 'none',
    endShape = 'none',
    stroke = '#000000ff',
    strokeWidth = 4,
    strokeDasharray = '',
    controlPoints,
    opacity = 1
  } = props;
  
  // Calculate end shape size based on stroke width
  // Ensure minimum size of 10px for visibility of hollow shapes
  // Scale up to 20px for thicker lines
  const endShapeSize = Math.min(20, Math.max(10, 6 + strokeWidth * 0.7));
  
  // Process stroke color - handle both solid colors and gradients
  let svgStroke = stroke || '#000000';
  let gradientId: string | undefined;
  
  // Check if it's a gradient (either object or JSON string)
  const isGradient = typeof svgStroke === 'object' || (typeof svgStroke === 'string' && svgStroke.includes('gradient'));
  
  if (!isGradient && typeof svgStroke === 'string' && svgStroke.startsWith('#') && svgStroke.length === 9) {
    // Remove alpha channel for solid colors (SVG doesn't support it in stroke)
    svgStroke = svgStroke.substring(0, 7);
  }

  // Calculate actual start and end positions
  const actualStart = useMemo(() => {
    if (startPoint.connection?.componentId && startPoint.connection?.side) {
      const connectionPoint = getConnectionPoint(
        startPoint.connection.componentId,
        startPoint.connection.side,
        startPoint.connection.offset,
        activeComponents,
        draggedComponents
      );
      return connectionPoint || startPoint;
    }
    return startPoint;
  }, [startPoint, activeComponents, draggedComponents]);

  const actualEnd = useMemo(() => {
    if (endPoint.connection?.componentId && endPoint.connection?.side) {
      const connectionPoint = getConnectionPoint(
        endPoint.connection.componentId,
        endPoint.connection.side,
        endPoint.connection.offset,
        activeComponents,
        draggedComponents
      );
      return connectionPoint || endPoint;
    }
    return endPoint;
  }, [endPoint, activeComponents, draggedComponents]);

  // Calculate bounding box to properly size the SVG
  const bounds = useMemo(() => {
    // For full-slide rendering, just return the slide dimensions
    return {
      x: 0,
      y: 0,
      width: DEFAULT_SLIDE_WIDTH,
      height: DEFAULT_SLIDE_HEIGHT
    };
  }, []);

  // Don't adjust coordinates - use absolute positions within the slide
  const relativeStart = actualStart;
  const relativeEnd = actualEnd;
  const relativeControlPoints = controlPoints;

  // Generate the path
  const path = generatePath(relativeStart, relativeEnd, connectionType, relativeControlPoints);

  // Generate unique IDs for markers and gradients
  const startMarkerId = `line-start-${component.id}`;
  const endMarkerId = `line-end-${component.id}`;
  const lineGradientId = `line-gradient-${component.id}`;

  // Remove the automatic update effect - let the component manage its own position/size
  // The position and size should be derived from the startPoint and endPoint

  // The container div should fill the space allocated by ComponentRenderer
  // ComponentRenderer already handles positioning based on our calculated bounds
  const containerStyles: React.CSSProperties = {
    width: '100%',
    height: '100%',
    position: 'relative',
    pointerEvents: 'none', // Disable pointer events on container - only SVG elements should be clickable
  };
  
  // The position/width/height are calculated from the bounds for rendering
  // We don't modify the component props directly

  // Merge refs
  const mergedRef = (el: HTMLDivElement) => {
    if (containerRef) (containerRef as any).current = el;
    localContainerRef.current = el;
  };

  // Function to render gradient definition
  const renderGradient = () => {
    if (!isGradient) return null;
    
    try {
      // Handle gradient data whether it's an object or JSON string
      const gradientData = typeof svgStroke === 'object' ? svgStroke : JSON.parse(svgStroke);
      const { type, stops, angle = 0 } = gradientData;
      
      if (type === 'linear') {
        // Calculate gradient direction from angle
        const angleRad = (angle - 90) * Math.PI / 180;
        const x1 = 50 + 50 * Math.cos(angleRad + Math.PI);
        const y1 = 50 + 50 * Math.sin(angleRad + Math.PI);
        const x2 = 50 + 50 * Math.cos(angleRad);
        const y2 = 50 + 50 * Math.sin(angleRad);
        
        return (
          <linearGradient 
            id={lineGradientId} 
            x1={`${x1}%`} 
            y1={`${y1}%`} 
            x2={`${x2}%`} 
            y2={`${y2}%`}
            gradientUnits="objectBoundingBox"
          >
            {stops.map((stop: any, index: number) => (
              <stop key={index} offset={`${stop.position}%`} stopColor={stop.color} />
            ))}
          </linearGradient>
        );
      } else if (type === 'radial') {
        return (
          <radialGradient id={lineGradientId} cx="50%" cy="50%" r="50%">
            {stops.map((stop: any, index: number) => (
              <stop key={index} offset={`${stop.position}%`} stopColor={stop.color} />
            ))}
          </radialGradient>
        );
      }
    } catch (e) {
      console.error('Failed to parse gradient:', e);
    }
    
    return null;
  };

  // Determine the actual stroke value to use
  const strokeValue = isGradient ? `url(#${lineGradientId})` : svgStroke;

  return (
    <div ref={mergedRef} style={containerStyles}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${bounds.width} ${bounds.height}`}
        style={{ overflow: 'visible', opacity, pointerEvents: 'none' }}
      >
        <defs>
          {renderGradient()}
          {startShape !== 'none' && renderEndShape(startShape, startMarkerId, endShapeSize, svgStroke, strokeWidth)}
          {endShape !== 'none' && renderEndShape(endShape, endMarkerId, endShapeSize, svgStroke, strokeWidth)}
        </defs>
        
        {/* Invisible wider path for easier selection */}
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(strokeWidth * 3, 10)}
          style={{ pointerEvents: 'stroke', cursor: 'move' }}
          onMouseDown={(e) => {
            console.log('[LinesRenderer] Line clicked', {
              isEditing,
              isSelected,
              componentId: component.id,
              event: e
            });
            if (!isEditing) {
              console.warn('[LinesRenderer] Line is not draggable - edit mode is not enabled');
            }
            handleLineMouseDown(e);
          }}
        />
        
        {/* Invisible circles at start and end for shape selection */}
        {startShape !== 'none' && (
          <circle
            cx={relativeStart.x}
            cy={relativeStart.y}
            r={endShapeSize}
            fill="transparent"
            style={{ pointerEvents: 'fill', cursor: 'move' }}
            onMouseDown={handleLineMouseDown}
          />
        )}
        {endShape !== 'none' && (
          <circle
            cx={relativeEnd.x}
            cy={relativeEnd.y}
            r={endShapeSize}
            fill="transparent"
            style={{ pointerEvents: 'fill', cursor: 'move' }}
            onMouseDown={handleLineMouseDown}
          />
        )}
        
        {/* Visible path */}
        <path
          d={path}
          fill="none"
          stroke={strokeValue}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray === 'none' ? undefined : strokeDasharray}
          markerStart={startShape !== 'none' ? `url(#${startMarkerId})` : undefined}
          markerEnd={endShape !== 'none' ? `url(#${endMarkerId})` : undefined}
          style={{ pointerEvents: 'none' }}
        />
        
        {/* Add elbow control point if connection type is elbow */}
        {isEditing && isSelected && connectionType === 'elbow' && (
          <>
            {/* Visual guide lines for elbow control */}
            <line
              x1={relativeControlPoints?.[0]?.x ?? (relativeStart.x + relativeEnd.x) / 2}
              y1={relativeStart.y}
              x2={relativeControlPoints?.[0]?.x ?? (relativeStart.x + relativeEnd.x) / 2}
              y2={relativeEnd.y}
              stroke="#FF007B"
              strokeWidth={1}
              strokeDasharray="2,2"
              opacity={0.3}
              style={{ pointerEvents: 'none' }}
            />
            {/* Constraint indicators */}
            <line
              x1={relativeStart.x}
              y1={(relativeStart.y + relativeEnd.y) / 2 - 15}
              x2={relativeStart.x}
              y2={(relativeStart.y + relativeEnd.y) / 2 + 15}
              stroke="#FF007B"
              strokeWidth={1}
              opacity={0.2}
              style={{ pointerEvents: 'none' }}
            />
            <line
              x1={relativeEnd.x}
              y1={(relativeStart.y + relativeEnd.y) / 2 - 15}
              x2={relativeEnd.x}
              y2={(relativeStart.y + relativeEnd.y) / 2 + 15}
              stroke="#FF007B"
              strokeWidth={1}
              opacity={0.2}
              style={{ pointerEvents: 'none' }}
            />
            {/* Outer ring for elbow control point */}
            <circle
              cx={relativeControlPoints?.[0]?.x ?? (relativeStart.x + relativeEnd.x) / 2}
              cy={(relativeStart.y + relativeEnd.y) / 2}
              r={12}
              fill="transparent"
              stroke="#FF007B"
              strokeWidth={1}
              strokeOpacity={0.5}
              style={{ pointerEvents: 'none' }}
            />
            {/* Elbow control point */}
            <circle
            cx={relativeControlPoints?.[0]?.x ?? (relativeStart.x + relativeEnd.x) / 2}
            cy={(relativeStart.y + relativeEnd.y) / 2}
            r={8}
            fill="white"
            stroke="#FF007B"
            strokeWidth={2.5}
            style={{ 
              cursor: 'move', 
              pointerEvents: 'all' 
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              const slideContainer = localContainerRef.current?.closest('.slide-container');
              if (!slideContainer) return;
              
              const rect = slideContainer.getBoundingClientRect();
              const minX = Math.min(actualStart.x, actualEnd.x);
              const maxX = Math.max(actualStart.x, actualEnd.x);
              
              // Track the current position during drag
              let currentX = props.controlPoints?.[0]?.x || (actualStart.x + actualEnd.x) / 2;
              
              const handleMouseMove = (moveEvent: MouseEvent) => {
                const x = moveEvent.clientX - rect.left;
                const slideX = (x / rect.width) * DEFAULT_SLIDE_WIDTH;
                
                const actualX = Math.max(minX, Math.min(maxX, slideX));
                currentX = actualX; // Update the tracked position
                
                updateComponent(component.id, {
                  props: {
                    ...props,
                    controlPoints: [{ x: actualX, y: actualStart.y }]
                  }
                }, true);
              };
              
              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                // Use the tracked current position, not the old props value
                const constrainedFinalX = Math.max(minX, Math.min(maxX, currentX));
                
                updateComponent(component.id, {
                  props: {
                    ...props,
                    controlPoints: [{ x: constrainedFinalX, y: actualStart.y }]
                  }
                }, false);
              };
              
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
          />
          </>
        )}
        
        {/* Add interaction handles at endpoints for easier selection and dragging */}
        {isEditing && isSelected && (
          <>
            {/* Start point handle with outer ring for visibility */}
            <circle
              cx={relativeStart.x}
              cy={relativeStart.y}
              r={12}
              fill="transparent"
              stroke="#FF007B"
              strokeWidth={1}
              strokeOpacity={0.5}
              style={{ pointerEvents: 'none' }}
            />
            <circle
              cx={relativeStart.x}
              cy={relativeStart.y}
              r={8}
              fill="white"
              stroke="#FF007B"
              strokeWidth={2.5}
              style={{ 
                cursor: isDragging && draggedEndpoint === 'start' ? 'grabbing' : 'move', 
                pointerEvents: 'all' 
              }}
              data-endpoint="start"
              onMouseDown={handleStartMouseDown}
            />
            
            {/* End point handle with outer ring for visibility */}
            <circle
              cx={relativeEnd.x}
              cy={relativeEnd.y}
              r={12}
              fill="transparent"
              stroke="#FF007B"
              strokeWidth={1}
              strokeOpacity={0.5}
              style={{ pointerEvents: 'none' }}
            />
            <circle
              cx={relativeEnd.x}
              cy={relativeEnd.y}
              r={8}
              fill="white"
              stroke="#FF007B"
              strokeWidth={2.5}
              style={{ 
                cursor: isDragging && draggedEndpoint === 'end' ? 'grabbing' : 'move', 
                pointerEvents: 'all' 
              }}
              data-endpoint="end"
              onMouseDown={handleEndMouseDown}
            />
          </>
        )}
      </svg>
    </div>
  );
};

// Register the renderer
registerRenderer('Lines', renderLines);
// Register aliases so components typed 'Line'/'line' render via the same renderer
registerRenderer('Line', renderLines);
registerRenderer('line', renderLines);