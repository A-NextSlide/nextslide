import React from 'react';
import { ComponentInstance } from '@/types/components';
import { getComponentSnapPoints } from '@/utils/lineSnapUtils';

interface LineSnapIndicatorsProps {
  components: ComponentInstance[];
  isDragging: boolean;
  hoveredComponentId?: string | null;
  cursorPosition?: { x: number; y: number };
  slideSize: { width: number; height: number };
  excludeComponentId?: string;
}

const LineSnapIndicators: React.FC<LineSnapIndicatorsProps> = ({
  components,
  isDragging,
  hoveredComponentId,
  cursorPosition,
  slideSize,
  excludeComponentId
}) => {
  if (!isDragging) return null;

  return (
    <>
      {/* Show hover feedback for hovered component */}
      {hoveredComponentId && components
        .filter(c => c.id === hoveredComponentId)
        .map(component => {
          const { position, width, height } = component.props;
          const x = (position.x / slideSize.width) * 100;
          const y = (position.y / slideSize.height) * 100;
          const w = (width / slideSize.width) * 100;
          const h = (height / slideSize.height) * 100;
          
          const snapPoints = getComponentSnapPoints(component);
          
          return (
            <React.Fragment key={component.id}>
              {/* Component outline */}
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: `${w}%`,
                  height: `${h}%`,
                  border: '2px solid #3B82F6',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  zIndex: 1000
                }}
              />
              
              {/* Snap points */}
              {snapPoints.map((point, index) => {
                const px = (point.x / slideSize.width) * 100;
                const py = (point.y / slideSize.height) * 100;
                
                return (
                  <div
                    key={`${component.id}-${index}`}
                    className="absolute pointer-events-none"
                    style={{
                      left: `${px}%`,
                      top: `${py}%`,
                      transform: 'translate(-50%, -50%)',
                      zIndex: 1001
                    }}
                  >
                    {/* Outer ring */}
                    <div 
                      className="absolute inset-0 rounded-full border-2 border-blue-500"
                      style={{
                        width: '14px',
                        height: '14px',
                        transform: 'translate(-50%, -50%)',
                        left: '50%',
                        top: '50%'
                      }}
                    />
                    {/* Inner dot */}
                    <div 
                      className="absolute bg-blue-500 rounded-full"
                      style={{
                        width: '6px',
                        height: '6px',
                        transform: 'translate(-50%, -50%)',
                        left: '50%',
                        top: '50%'
                      }}
                    />
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      
      {/* Show snap points for nearby components when cursor position is available */}
      {cursorPosition && !hoveredComponentId && components.map(component => {
        if (component.id === excludeComponentId) return null;
        if (component.type === 'Background' || (component.id && component.id.toLowerCase().includes('background'))) return null;
        
        const snapPoints = getComponentSnapPoints(component);
        const SHOW_THRESHOLD = 50; // Show snap points when cursor is within this distance
        
        return snapPoints.map((point, index) => {
          const distance = Math.sqrt(
            Math.pow(cursorPosition.x - point.x, 2) + 
            Math.pow(cursorPosition.y - point.y, 2)
          );
          
          if (distance > SHOW_THRESHOLD) return null;
          
          // Convert to percentage for positioning
          const x = (point.x / slideSize.width) * 100;
          const y = (point.y / slideSize.height) * 100;
          
          // Fade in as cursor gets closer
          const opacity = Math.max(0, 1 - (distance / SHOW_THRESHOLD));
          
          return (
            <div
              key={`${component.id}-${index}`}
              className="absolute pointer-events-none"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: 'translate(-50%, -50%)',
                opacity,
                zIndex: 1000
              }}
            >
              <div className="relative">
                {/* Outer ring */}
                <div 
                  className="absolute inset-0 rounded-full border-2 border-blue-500"
                  style={{
                    width: '12px',
                    height: '12px',
                    transform: 'translate(-50%, -50%)',
                    left: '50%',
                    top: '50%'
                  }}
                />
                {/* Inner dot */}
                <div 
                  className="absolute bg-blue-500 rounded-full"
                  style={{
                    width: '4px',
                    height: '4px',
                    transform: 'translate(-50%, -50%)',
                    left: '50%',
                    top: '50%'
                  }}
                />
              </div>
            </div>
          );
        });
      })}
    </>
  );
};

export default LineSnapIndicators; 