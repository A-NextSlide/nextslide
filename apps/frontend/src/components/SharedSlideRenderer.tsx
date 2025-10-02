import React from 'react';
import { SlideData } from '@/types/SlideTypes';
import { ComponentInstance } from '@/types/components';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';

interface SharedSlideRendererProps {
  slide: SlideData;
  scale?: number;
}

/**
 * Simple slide renderer for shared/read-only views
 * Does not depend on editor contexts
 */
export const SharedSlideRenderer: React.FC<SharedSlideRendererProps> = ({ 
  slide, 
  scale = 0.6 
}) => {
  const renderComponent = (component: ComponentInstance) => {
    const { type, props } = component;
    const position = props.position || { x: 0, y: 0 };
    const dimensions = props.dimensions || { width: 100, height: 100 };
    
    const componentStyle: React.CSSProperties = {
      position: 'absolute',
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: `${dimensions.width}px`,
      height: `${dimensions.height}px`,
      pointerEvents: 'none'
    };

    // Simple component rendering based on type
    switch (type) {
      case 'TiptapTextBlock':
        return (
          <div 
            style={{
              ...componentStyle,
              fontFamily: props.fontFamily || 'Inter',
              fontSize: `${props.fontSize || 16}px`,
              fontWeight: props.fontWeight || 'normal',
              fontStyle: props.fontStyle || 'normal',
              textAlign: props.textAlign || 'left',
              color: props.color || '#000000',
              lineHeight: props.lineHeight || 1.5,
              padding: '8px'
            }}
            dangerouslySetInnerHTML={{ __html: props.content || '' }}
          />
        );
        
      case 'ShapeWithText':
        return (
          <div
            style={{
              ...componentStyle,
              backgroundColor: props.backgroundColor || '#3b82f6',
              borderRadius: props.shape === 'circle' ? '50%' : `${props.borderRadius || 0}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px'
            }}
          >
            {props.text && (
              <div 
                style={{
                  color: props.textColor || '#ffffff',
                  fontSize: `${props.fontSize || 16}px`,
                  fontWeight: props.fontWeight || 'normal',
                  textAlign: 'center'
                }}
              >
                {props.text}
              </div>
            )}
          </div>
        );
        
      case 'Image':
        {
          const hasShadow = !!props.shadow;
          const dropShadow = hasShadow
            ? `drop-shadow(${props.shadowOffsetX || 0}px ${props.shadowOffsetY || 4}px ${props.shadowBlur || 10}px ${props.shadowColor || 'rgba(0,0,0,0.3)'})`
            : undefined;
          return (
            <img
              src={props.src}
              alt={props.alt || ''}
              style={{
                ...componentStyle,
                objectFit: (props.objectFit as any) || 'cover',
                borderRadius: `${props.borderRadius || 0}px`,
                filter: dropShadow,
                // Safari/WebKit
                WebkitFilter: dropShadow as any
              }}
            />
          );
        }
        
      case 'Lines':
      case 'Line':
      case 'line':
        {
          const start = props.startPoint || { x: 100, y: 100 };
          const end = props.endPoint || { x: 300, y: 300 };
          const connectionType: string = props.connectionType || 'straight';
          const makePath = (s: { x: number; y: number }, e: { x: number; y: number }): string => {
            switch (connectionType) {
              case 'elbow': {
                const midX = (s.x + e.x) / 2;
                return `M ${s.x} ${s.y} L ${midX} ${s.y} L ${midX} ${e.y} L ${e.x} ${e.y}`;
              }
              case 'curved': {
                const cx = (s.x + e.x) / 2;
                return `M ${s.x} ${s.y} C ${cx} ${s.y}, ${cx} ${e.y}, ${e.x} ${e.y}`;
              }
              case 'quadratic': {
                const cpx = (s.x + e.x) / 2;
                const cpy = (s.y + e.y) / 2 - 50;
                return `M ${s.x} ${s.y} Q ${cpx} ${cpy} ${e.x} ${e.y}`;
              }
              case 'cubic': {
                const cp1x = s.x + (e.x - s.x) * 0.3;
                const cp2x = s.x + (e.x - s.x) * 0.7;
                return `M ${s.x} ${s.y} C ${cp1x} ${s.y}, ${cp2x} ${e.y}, ${e.x} ${e.y}`;
              }
              default:
                return `M ${s.x} ${s.y} L ${e.x} ${e.y}`;
            }
          };
          const strokeRaw: string = props.stroke || '#000000ff';
          const stroke = (typeof strokeRaw === 'string' && strokeRaw.startsWith('#') && strokeRaw.length === 9)
            ? strokeRaw.substring(0, 7)
            : (strokeRaw as string);
          const strokeWidth = props.strokeWidth || 2;
          const strokeDasharray = props.strokeDasharray === 'none' ? undefined : props.strokeDasharray;
          const opacity = props.opacity ?? 1;
          return (
            <svg
              style={{ position: 'absolute', left: 0, top: 0, width: `${DEFAULT_SLIDE_WIDTH}px`, height: `${DEFAULT_SLIDE_HEIGHT}px`, pointerEvents: 'none' }}
              viewBox={`0 0 ${DEFAULT_SLIDE_WIDTH} ${DEFAULT_SLIDE_HEIGHT}`}
            >
              <path
                d={makePath(start, end)}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                opacity={opacity}
              />
            </svg>
          );
        }
        
      default:
        // Fallback for unknown component types
        return (
          <div 
            style={{
              ...componentStyle,
              backgroundColor: '#f0f0f0',
              border: '1px dashed #999',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              color: '#666'
            }}
          >
            {type}
          </div>
        );
    }
  };

  return (
    <div 
      className="relative bg-white shadow-2xl"
      style={{
        width: DEFAULT_SLIDE_WIDTH,
        height: DEFAULT_SLIDE_HEIGHT,
        transform: `scale(${scale})`,
        transformOrigin: 'center'
      }}
    >
      {/* Render background */}
      {slide.backgroundColor && (
        <div 
          className="absolute inset-0"
          style={{
            backgroundColor: slide.backgroundColor
          }}
        />
      )}
      
      {/* Render background image if present */}
      {slide.backgroundImage && (
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${slide.backgroundImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />
      )}
      
      {/* Render components */}
      {slide.components && slide.components.map((component) => (
        <React.Fragment key={component.id}>
          {renderComponent(component)}
        </React.Fragment>
      ))}
    </div>
  );
}; 