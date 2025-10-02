import React from "react";
import { ComponentInstance } from "../../types/components";
import { registerRenderer } from '../utils';
import type { RendererFunction } from '../index';

/**
 * Renders a shape component using SVG with gradient support.
 */
export const renderShape = (
  component: ComponentInstance, 
  baseStyles: React.CSSProperties,
  containerRef: React.RefObject<HTMLDivElement>
) => {
  const props = component.props;
  const { 
    borderRadius = 0,
    shadow = false,
    shadowBlur = 10,
    shadowColor = "rgba(0,0,0,0.3)",
    shadowOffsetX = 0,
    shadowOffsetY = 4,
    shadowSpread = 0,
    strokeWidth = 0
  } = props;
  // Normalize shape type (support both props.shapeType and props.shape)
  const rawShapeType = String((props as any).shapeType ?? (props as any).shape ?? 'rectangle').toLowerCase();
  const shapeTypeAliasMap: Record<string, string> = {
    rect: 'rectangle',
    rectangle: 'rectangle',
    roundrect: 'rectangle',
    'round-rect': 'rectangle',
    rounded: 'rectangle',
    ellipse: 'ellipse',
    oval: 'ellipse',
    circle: 'circle',
  };
  const shapeType = shapeTypeAliasMap[rawShapeType] || rawShapeType;
  

  
  // Convert #RRGGBBAA to rgba(...) for SVG compatibility
  const toSvgColor = (c?: string) => {
    if (!c) return undefined;
    const lower = c.toLowerCase();
    if (lower === 'transparent' || lower === 'none') return 'none';
    
    // Handle 8-digit hex colors #RRGGBBAA
    const hex8Match = /^#([0-9a-f]{8})$/i.exec(c);
    if (hex8Match) {
      const hex = hex8Match[1];
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = parseInt(hex.slice(6, 8), 16) / 255;
      // If alpha is 0, return 'none' for SVG
      if (a === 0) return 'none';
      return `rgba(${r},${g},${b},${a})`;
    }
    
    // Handle 6-digit hex colors #RRGGBB (treat as opaque)
    const hex6Match = /^#([0-9a-f]{6})$/i.exec(c);
    if (hex6Match) {
      return c;
    }
    
    return c;
  };
  
  // Handle gradient
  const hasGradient = props.gradient && typeof props.gradient === 'object' && props.gradient.type && props.gradient.stops;
  const isRadialGradient = hasGradient && props.gradient.type === 'radial';
  
  // Generate unique IDs for gradients and filters
  const fillGradientId = `shape-fill-gradient-${component.id}`;
  const shadowFilterId = `shape-shadow-filter-${component.id}`;
  
  // Animation duration for gradients
  const animationDuration = props.isAnimated && hasGradient ? 11 - (props.animationSpeed || 1) : 0;
  
  // Calculate proper viewBox dimensions
  const actualWidth = props.width || 100;
  const actualHeight = props.height || 100;
  
  // Calculate padding needed for shadows and strokes
  let shadowPadding = 0;
  if (shadow) {
    // Account for blur, offset, and spread
    const shadowLeft = Math.max(0, shadowBlur + shadowSpread - shadowOffsetX);
    const shadowRight = Math.max(0, shadowBlur + shadowSpread + shadowOffsetX);
    const shadowTop = Math.max(0, shadowBlur + shadowSpread - shadowOffsetY);
    const shadowBottom = Math.max(0, shadowBlur + shadowSpread + shadowOffsetY);
    
    shadowPadding = Math.max(shadowLeft, shadowRight, shadowTop, shadowBottom);
  }
  
  // Do not add padding so shape bounds match wrapper exactly; rely on overflow: visible and enlarged filter region
  const strokePadding = 0;
  const padding = Math.max(strokePadding, shadowPadding);
  const halfStroke = strokeWidth / 2;
  
  // Expand viewBox to accommodate stroke, shadow, and padding
  const viewBoxWidth = actualWidth + (padding * 2);
  const viewBoxHeight = actualHeight + (padding * 2);
  const viewBox = `0 0 ${viewBoxWidth} ${viewBoxHeight}`;
  
  // Shape dimensions account for padding but maintain requested size
  const shapeWidth = actualWidth;
  const shapeHeight = actualHeight;
  // Position shape with padding offset
  const shapeX = padding;
  const shapeY = padding;

  // Function to render shadow filter for SVG
  const renderSVGShadowFilter = () => {
    if (!shadow) return null;
    
    return (
      <filter id={shadowFilterId} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceAlpha" stdDeviation={shadowBlur / 2} />
        <feOffset dx={shadowOffsetX} dy={shadowOffsetY} result="offsetblur" />
        <feFlood floodColor={shadowColor} />
        <feComposite in2="offsetblur" operator="in" />
        <feComponentTransfer>
          <feFuncA type="linear" slope="1" />
        </feComponentTransfer>
        {shadowSpread > 0 && (
          <feMorphology operator="dilate" radius={shadowSpread} />
        )}
        <feMerge>
          <feMergeNode />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    );
  };
  
  // Function to render gradient definitions for SVG
  const renderSVGGradients = () => {
    if (!hasGradient || !props.gradient) return null;
    
    const gradient = props.gradient;
    const sortedStops = [...gradient.stops].sort((a: any, b: any) => a.position - b.position);
    
    if (gradient.type === 'radial') {
      return (
        <radialGradient 
          id={fillGradientId} 
          cx="50%" 
          cy="50%" 
          r="50%"
          gradientUnits="objectBoundingBox"
        >
          {sortedStops.map((stop: any, index: number) => (
            <stop key={index} offset={`${stop.position}%`} stopColor={toSvgColor(stop.color)} />
          ))}
        </radialGradient>
      );
    } else if (gradient.type === 'linear') {
      // Convert angle to x1, y1, x2, y2 coordinates
      const angle = gradient.angle || 90;
      const angleRad = (angle - 90) * Math.PI / 180;
      const x1 = 50 + 50 * Math.cos(angleRad + Math.PI);
      const y1 = 50 + 50 * Math.sin(angleRad + Math.PI);
      const x2 = 50 + 50 * Math.cos(angleRad);
      const y2 = 50 + 50 * Math.sin(angleRad);
      
      return (
        <linearGradient 
          id={fillGradientId} 
          x1={`${x1}%`} 
          y1={`${y1}%`} 
          x2={`${x2}%`} 
          y2={`${y2}%`}
          gradientUnits="objectBoundingBox"
        >
          {sortedStops.map((stop: any, index: number) => (
            <stop key={index} offset={`${stop.position}%`} stopColor={toSvgColor(stop.color)} />
          ))}
          {props.isAnimated && (
            <animateTransform
              attributeName="gradientTransform"
              type="rotate"
              from="0 0.5 0.5"
              to="360 0.5 0.5"
              dur={`${animationDuration}s`}
              repeatCount="indefinite"
            />
          )}
        </linearGradient>
      );
    }
    
    return null;
  };

  // Determine the fill value (support legacy/import synonyms)
  // Default to 'none' when no explicit fill provided
  let fillValue = (props as any).fill ?? (props as any).fillColor ?? (props as any).backgroundColor ?? 'none';
  
  // Debug logging removed

  
  if (hasGradient) {
    // Use SVG gradient reference for both linear and radial gradients
    fillValue = `url(#${fillGradientId})`;
  } else {
    // Heuristic for PPTX imports: if fill is pure black with no effective stroke, treat as transparent
    const rawFillLower = String(fillValue || '').toLowerCase();
    const rawStrokeLower = String((props as any).stroke ?? (props as any).strokeColor ?? (props as any).borderColor ?? '#00000000').toLowerCase();
    const strokeWidthNum = Number(strokeWidth || 0);
    const hasEffectiveStroke = strokeWidthNum > 0 && rawStrokeLower !== '#00000000' && rawStrokeLower !== 'none' && rawStrokeLower !== 'transparent';
    // For PPTX imports, coerce any pure-black fill to transparent for all shapes
    const isFromPptx = (props as any).source === 'pptx';
    const isCircleOrEllipse = shapeType === 'circle' || shapeType === 'ellipse';
    // Detect pure/near-black values from various formats
    let isNearBlackHex = false;
    const hex6 = /^#([0-9a-f]{6})$/i.exec(rawFillLower);
    if (hex6) {
      const r = parseInt(hex6[1].slice(0, 2), 16);
      const g = parseInt(hex6[1].slice(2, 4), 16);
      const b = parseInt(hex6[1].slice(4, 6), 16);
      isNearBlackHex = r <= 6 && g <= 6 && b <= 6;
    }
    const hex8 = /^#([0-9a-f]{8})$/i.exec(rawFillLower);
    if (!isNearBlackHex && hex8) {
      const r = parseInt(hex8[1].slice(0, 2), 16);
      const g = parseInt(hex8[1].slice(2, 4), 16);
      const b = parseInt(hex8[1].slice(4, 6), 16);
      const a = parseInt(hex8[1].slice(6, 8), 16);
      isNearBlackHex = a === 255 && r <= 6 && g <= 6 && b <= 6;
    }
    const isPureBlack = (
      rawFillLower === '#000000ff' ||
      rawFillLower === '#000000' ||
      rawFillLower === 'black' ||
      /^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*1(\.0+)?\s*\)$/i.test(rawFillLower) ||
      /^rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)$/i.test(rawFillLower) ||
      isNearBlackHex
    );
    if (isFromPptx && isPureBlack) {
      fillValue = '#00000000';
    }

    const converted = toSvgColor(fillValue);

    // Treat fully transparent colors as 'none' to avoid unintended fills
    const isTransparentRgba = typeof converted === 'string' && /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(\.0+)?\s*\)/i.test(converted);
    fillValue = isTransparentRgba ? 'none' : (converted || 'none');
    
    // Debug logging removed
  }

  // Process stroke
  const strokeColor = toSvgColor((props as any).stroke ?? (props as any).strokeColor ?? (props as any).borderColor ?? '#000000ff') || 'none';

  // Create SVG attributes
  const svgAttrs = {
    fill: fillValue,
    stroke: strokeWidth > 0 ? strokeColor : 'none',
    strokeWidth: strokeWidth > 0 ? strokeWidth : 0,
    fillOpacity: 1,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
    vectorEffect: 'non-scaling-stroke' as const,
    filter: shadow ? `url(#${shadowFilterId})` : undefined
  };

  // Apply border radius for rectangle
  // Adjust radius to account for half the stroke width, ensuring it's not negative
  const adjustedBorderRadius = Math.max(0, borderRadius - (strokeWidth / 2));
  const rectAttrs = shapeType === 'rectangle' && borderRadius > 0
    ? { ...svgAttrs, rx: adjustedBorderRadius, ry: adjustedBorderRadius }
    : svgAttrs;

  // Generate shape element
  let svgShapeElement: React.ReactNode = null;

  switch (shapeType) {
    case 'rectangle':
      svgShapeElement = <rect x={shapeX} y={shapeY} width={shapeWidth} height={shapeHeight} {...rectAttrs} />;
      break;
    case 'circle':
      // No inset so visual bounds match the creation outline exactly
      const circleRadius = Math.min(shapeWidth, shapeHeight) / 2;
      const circleCx = shapeX + shapeWidth / 2;
      const circleCy = shapeY + shapeHeight / 2;
      svgShapeElement = <circle cx={circleCx} cy={circleCy} r={circleRadius} {...svgAttrs} />;
      break;
    case 'ellipse':
      // No inset so visual bounds match the creation outline exactly
      const ellipseRx = shapeWidth / 2;
      const ellipseRy = shapeHeight / 2;
      const ellipseCx = shapeX + shapeWidth / 2;
      const ellipseCy = shapeY + shapeHeight / 2;
      svgShapeElement = <ellipse cx={ellipseCx} cy={ellipseCy} rx={ellipseRx} ry={ellipseRy} {...svgAttrs} />;
      break;
    case 'triangle':
      const triTop = `${shapeX + shapeWidth/2},${shapeY}`;
      const triBottomLeft = `${shapeX},${shapeY + shapeHeight}`;
      const triBottomRight = `${shapeX + shapeWidth},${shapeY + shapeHeight}`;
      svgShapeElement = <polygon points={`${triTop} ${triBottomLeft} ${triBottomRight}`} {...svgAttrs} />;
      break;
    case 'star':
      const starCx = shapeX + shapeWidth / 2;
      const starCy = shapeY + shapeHeight / 2;
      const starPoints = [
        `${starCx},${shapeY}`,
        `${shapeX + shapeWidth*0.61},${shapeY + shapeHeight*0.385}`,
        `${shapeX + shapeWidth*0.98},${shapeY + shapeHeight*0.385}`,
        `${shapeX + shapeWidth*0.68},${shapeY + shapeHeight*0.576}`,
        `${shapeX + shapeWidth*0.79},${shapeY + shapeHeight}`,
        `${starCx},${shapeY + shapeHeight*0.769}`,
        `${shapeX + shapeWidth*0.21},${shapeY + shapeHeight}`,
        `${shapeX + shapeWidth*0.32},${shapeY + shapeHeight*0.576}`,
        `${shapeX + shapeWidth*0.02},${shapeY + shapeHeight*0.385}`,
        `${shapeX + shapeWidth*0.39},${shapeY + shapeHeight*0.385}`
      ];
      svgShapeElement = <polygon points={starPoints.join(' ')} {...svgAttrs} />;
      break;
    case 'hexagon':
      const hexCy = shapeY + shapeHeight / 2;
      const hexPoints = [
        `${shapeX + shapeWidth*0.25},${shapeY}`,
        `${shapeX + shapeWidth*0.75},${shapeY}`,
        `${shapeX + shapeWidth},${hexCy}`,
        `${shapeX + shapeWidth*0.75},${shapeY + shapeHeight}`,
        `${shapeX + shapeWidth*0.25},${shapeY + shapeHeight}`,
        `${shapeX},${hexCy}`
      ];
      svgShapeElement = <polygon points={hexPoints.join(' ')} {...svgAttrs} />;
      break;
    case 'pentagon':
      const pentCx = shapeX + shapeWidth / 2;
      const pentPoints = [
        `${pentCx},${shapeY}`,
        `${shapeX + shapeWidth},${shapeY + shapeHeight*0.38}`,
        `${shapeX + shapeWidth*0.82},${shapeY + shapeHeight}`,
        `${shapeX + shapeWidth*0.18},${shapeY + shapeHeight}`,
        `${shapeX},${shapeY + shapeHeight*0.38}`
      ];
      svgShapeElement = <polygon points={pentPoints.join(' ')} {...svgAttrs} />;
      break;
    case 'diamond':
      const diamondCx = shapeX + shapeWidth / 2;
      const diamondCy = shapeY + shapeHeight / 2;
      const diamondPoints = [
        `${diamondCx},${shapeY}`,
        `${shapeX + shapeWidth},${diamondCy}`,
        `${diamondCx},${shapeY + shapeHeight}`,
        `${shapeX},${diamondCy}`
      ];
      svgShapeElement = <polygon points={diamondPoints.join(' ')} {...svgAttrs} />;
      break;
    case 'arrow':
      const arrowCy = shapeY + shapeHeight / 2;
      const arrowPoints = [
        `${shapeX},${shapeY + shapeHeight*0.30}`,
        `${shapeX + shapeWidth*0.70},${shapeY + shapeHeight*0.30}`,
        `${shapeX + shapeWidth*0.70},${shapeY}`,
        `${shapeX + shapeWidth},${arrowCy}`,
        `${shapeX + shapeWidth*0.70},${shapeY + shapeHeight}`,
        `${shapeX + shapeWidth*0.70},${shapeY + shapeHeight*0.70}`,
        `${shapeX},${shapeY + shapeHeight*0.70}`
      ];
      svgShapeElement = <polygon points={arrowPoints.join(' ')} {...svgAttrs} />;
      break;
    case 'heart':
      const heartCx = shapeX + shapeWidth / 2;
      const heartPath = `M ${heartCx} ${shapeY + shapeHeight*0.25}
        C ${heartCx} ${shapeY + shapeHeight*0.1}, ${shapeX + shapeWidth*0.3} ${shapeY}, ${shapeX + shapeWidth*0.15} ${shapeY}
        C ${shapeX} ${shapeY}, ${shapeX} ${shapeY + shapeHeight*0.15}, ${shapeX} ${shapeY + shapeHeight*0.3}
        C ${shapeX} ${shapeY + shapeHeight*0.5}, ${heartCx} ${shapeY + shapeHeight}, ${heartCx} ${shapeY + shapeHeight}
        C ${heartCx} ${shapeY + shapeHeight}, ${shapeX + shapeWidth} ${shapeY + shapeHeight*0.5}, ${shapeX + shapeWidth} ${shapeY + shapeHeight*0.3}
        C ${shapeX + shapeWidth} ${shapeY + shapeHeight*0.15}, ${shapeX + shapeWidth} ${shapeY}, ${shapeX + shapeWidth*0.85} ${shapeY}
        C ${shapeX + shapeWidth*0.7} ${shapeY}, ${heartCx} ${shapeY + shapeHeight*0.1}, ${heartCx} ${shapeY + shapeHeight*0.25}
        Z`;
      svgShapeElement = <path d={heartPath} {...svgAttrs} />;
      break;
    default:
      svgShapeElement = <rect x={shapeX} y={shapeY} width={shapeWidth} height={shapeHeight} {...svgAttrs} />;
  }

  const preserveAspectRatio = (shapeType === 'circle' || shapeType === 'ellipse') ? "xMidYMid meet" : "none";

  // Base styles for the container
  const enhancedBaseStyles: React.CSSProperties = {
    ...baseStyles,
    display: 'block',
    lineHeight: 0,
    position: 'relative',
    // Remove box-shadow - now using SVG filter for shape-aware shadows
    // Apply border radius to container for shape alignment
    borderRadius: shapeType === 'rectangle' && borderRadius > 0 ? `${borderRadius}px` : undefined,
    // Remove overflow: hidden to allow stroke and shadows to render properly
    // overflow: 'hidden'
  };

  return (
    <div ref={containerRef} style={enhancedBaseStyles}>
        <svg 
          width="100%" 
          height="100%" 
          viewBox={viewBox} 
          preserveAspectRatio={preserveAspectRatio}
          style={{ 
            display: 'block',
            position: 'relative',
            zIndex: 0,
            overflow: 'visible'
          }}
        >
          {(hasGradient || shadow) && (
            <defs>
              {renderSVGGradients()}
              {renderSVGShadowFilter()}
            </defs>
          )}
          {svgShapeElement}
        </svg>
      </div>
  );
};

// Register the renderer
const ShapeRendererWrapper: RendererFunction = (props) => {
  return renderShape(props.component, props.styles || {}, props.containerRef);
};

registerRenderer('Shape', ShapeRendererWrapper); 