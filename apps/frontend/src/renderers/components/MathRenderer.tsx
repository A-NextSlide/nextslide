import React, { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { ComponentInstance } from "../../types/components";

// Add global styles for KaTeX scaling
const katexStyles = `
  .katex-container {
    max-width: 100%;
    max-height: 100%;
    box-sizing: border-box;
  }
  .katex-container .katex {
    max-width: 100% !important;
    max-height: 100% !important;
    font-size: inherit !important;
  }
  .katex-container .katex-html {
    max-width: 100%;
    overflow: hidden;
  }
  .katex-container .katex .base {
    max-width: 100%;
  }
`;

if (typeof document !== 'undefined' && !document.getElementById('katex-custom-styles')) {
  const style = document.createElement('style');
  style.id = 'katex-custom-styles';
  style.textContent = katexStyles;
  document.head.appendChild(style);
}

/**
 * MathRenderer - Renders mathematical expressions using KaTeX
 * 
 * Features:
 * - LaTeX rendering with KaTeX (fast and beautiful)
 * - Supports both display mode (block) and inline mode
 * - Chemistry equations support via mhchem extension
 * - Customizable colors, sizing, and styling
 * 
 * @example
 * // Quadratic Formula
 * {
 *   type: "Math",
 *   props: {
 *     latex: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
 *     displayMode: true,
 *     fontSize: 48,
 *     color: "#000000ff"
 *   }
 * }
 * 
 * @example
 * // Chemical Equation (using mhchem)
 * {
 *   type: "Math",
 *   props: {
 *     latex: "\\ce{CO2 + H2O -> H2CO3}",
 *     displayMode: true
 *   }
 * }
 */

const MathContent: React.FC<{
  latex: string;
  displayMode?: boolean;
  fontSize?: number;
  color?: string;
  containerWidth?: number;
  containerHeight?: number;
}> = ({ latex, displayMode = true, fontSize = 32, color = '#000000ff', containerWidth, containerHeight }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && latex) {
      try {
        // Clear previous content
        containerRef.current.innerHTML = '';
        
        // Create a wrapper div for the content
        const wrapper = document.createElement('div');
        wrapper.ref = contentRef;
        containerRef.current.appendChild(wrapper);
        
        // Render the LaTeX
        katex.render(latex, wrapper, {
          displayMode: displayMode,
          throwOnError: false,
          errorColor: '#cc0000',
          strict: false,
          trust: true,
          macros: {
            "\\ce": "\\text{#1}", // Basic chemistry equation support
          }
        });
        
        // Scale content to fit if it overflows
        setTimeout(() => {
          if (wrapper && containerRef.current && containerWidth && containerHeight) {
            const contentWidth = wrapper.scrollWidth;
            const contentHeight = wrapper.scrollHeight;
            const availableWidth = containerWidth;
            const availableHeight = containerHeight;
            
            // Calculate scale to fit both dimensions
            const scaleX = contentWidth > availableWidth ? availableWidth / contentWidth : 1;
            const scaleY = contentHeight > availableHeight ? availableHeight / contentHeight : 1;
            const scale = Math.min(scaleX, scaleY, 1); // Never scale up, only down
            
            if (scale < 1) {
              wrapper.style.transform = `scale(${scale})`;
              wrapper.style.transformOrigin = 'center center';
            }
          }
        }, 10);
      } catch (err) {
        console.error('KaTeX rendering error:', err);
        if (containerRef.current) {
          containerRef.current.innerHTML = DOMPurify.sanitize(`
            <div style="color: #cc0000; font-size: 14px;">
              Error rendering LaTeX: ${err instanceof Error ? err.message : 'Unknown error'}
            </div>
          `);
        }
      }
    }
  }, [latex, displayMode, containerWidth, containerHeight]);

  // Parse color with alpha channel
  const parseColor = (colorStr: string): string => {
    if (!colorStr) return '#000000';
    
    // If already in rgba format
    if (colorStr.startsWith('rgba') || colorStr.startsWith('rgb')) return colorStr;
    
    // If hex with alpha (#RRGGBBAA)
    if (colorStr.length === 9 && colorStr.startsWith('#')) {
      const r = parseInt(colorStr.slice(1, 3), 16);
      const g = parseInt(colorStr.slice(3, 5), 16);
      const b = parseInt(colorStr.slice(5, 7), 16);
      const a = parseInt(colorStr.slice(7, 9), 16) / 255;
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
    
    // If hex without alpha (#RRGGBB)
    if (colorStr.length === 7 && colorStr.startsWith('#')) {
      return colorStr;
    }
    
    return colorStr;
  };

  return (
    <div 
      ref={containerRef} 
      style={{ 
        color: parseColor(color),
        fontSize: `${fontSize}px`,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        maxWidth: '100%',
        maxHeight: '100%',
      }}
      className="katex-container"
    />
  );
};

export const renderMath = (
  component: ComponentInstance,
  baseStyles: React.CSSProperties,
  containerRef: React.RefObject<HTMLDivElement>
) => {
  const props = component.props;
  
  const {
    latex = "f(x) = x^2",
    displayMode = true,
    fontSize = 32,
    color = "#000000ff",
    backgroundColor = "#00000000",
    padding = 3,
    borderRadius = 8,
  } = props;

  // Parse background color with alpha channel
  const parseColor = (colorStr: string): string => {
    if (!colorStr) return 'transparent';
    
    // If already in rgba format
    if (colorStr.startsWith('rgba') || colorStr.startsWith('rgb')) return colorStr;
    
    // If hex with alpha (#RRGGBBAA)
    if (colorStr.length === 9 && colorStr.startsWith('#')) {
      const r = parseInt(colorStr.slice(1, 3), 16);
      const g = parseInt(colorStr.slice(3, 5), 16);
      const b = parseInt(colorStr.slice(5, 7), 16);
      const a = parseInt(colorStr.slice(7, 9), 16) / 255;
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
    
    // If hex without alpha (#RRGGBB)
    if (colorStr.length === 7 && colorStr.startsWith('#')) {
      return colorStr;
    }
    
    return colorStr;
  };

  const containerStyles: React.CSSProperties = {
    ...baseStyles,
    width: "100%",
    height: "100%",
    padding: `${padding}px`,
    backgroundColor: parseColor(backgroundColor),
    borderRadius: `${borderRadius}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    boxSizing: 'border-box',
  };

  const actualWidth = component.props.width || 800;
  const actualHeight = component.props.height || 200;
  const innerWidth = actualWidth - (padding * 2);
  const innerHeight = actualHeight - (padding * 2);

  return (
    <div ref={containerRef} style={containerStyles}>
      <MathContent 
        latex={latex}
        displayMode={displayMode}
        fontSize={fontSize}
        color={color}
        containerWidth={innerWidth}
        containerHeight={innerHeight}
      />
    </div>
  );
};

// Register the renderer
import { registerRenderer } from '../utils';
import type { RendererFunction } from '../index';

// Wrapper function to match the expected signature
const MathRendererWrapper: RendererFunction = (props) => {
  return renderMath(props.component, props.styles || {}, props.containerRef);
};

// Register the wrapped renderer
registerRenderer('Math', MathRendererWrapper);
