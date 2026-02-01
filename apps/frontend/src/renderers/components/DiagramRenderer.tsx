import React, { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
import { ComponentInstance } from "../../types/components";

// Add global styles for Mermaid scaling
const mermaidStyles = `
  .mermaid-container {
    box-sizing: border-box;
  }
  .mermaid-container svg {
    max-width: 100% !important;
    max-height: 100% !important;
    width: auto !important;
    height: auto !important;
    display: block;
  }
`;

if (typeof document !== 'undefined' && !document.getElementById('mermaid-custom-styles')) {
  const style = document.createElement('style');
  style.id = 'mermaid-custom-styles';
  style.textContent = mermaidStyles;
  document.head.appendChild(style);
}

// Initialize mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'inherit',
});

/**
 * DiagramRenderer - Renders diagrams using Mermaid.js
 * 
 * Features:
 * - Flowcharts, sequence diagrams, class diagrams, state diagrams, etc.
 * - Multiple themes (default, neutral, dark, forest, base)
 * - Perfect for educational content, process flows, system architectures
 * 
 * @example
 * // Flowchart
 * {
 *   type: "Diagram",
 *   props: {
 *     mermaid: "graph TD\n    A[Start] --> B[Process]\n    B --> C[Decision]\n    C -->|Yes| D[End]\n    C -->|No| B",
 *     theme: "default"
 *   }
 * }
 * 
 * @example
 * // Sequence Diagram
 * {
 *   type: "Diagram",
 *   props: {
 *     mermaid: "sequenceDiagram\n    Student->>Teacher: Ask question\n    Teacher->>Student: Provide answer",
 *     theme: "neutral"
 *   }
 * }
 * 
 * @example
 * // Class Diagram
 * {
 *   type: "Diagram",
 *   props: {
 *     mermaid: "classDiagram\n    Animal <|-- Dog\n    Animal <|-- Cat\n    Animal: +name\n    Animal: +makeSound()",
 *     theme: "forest"
 *   }
 * }
 */

const DiagramContent: React.FC<{
  mermaidCode: string;
  theme?: 'default' | 'neutral' | 'dark' | 'forest' | 'base';
  componentId: string;
  containerWidth?: number;
  containerHeight?: number;
}> = ({ mermaidCode, theme = 'default', componentId, containerWidth, containerHeight }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [diagramId] = useState(`mermaid-${componentId}-${Date.now()}`);

  useEffect(() => {
    const renderDiagram = async () => {
      if (containerRef.current && mermaidCode) {
        try {
          // Update mermaid config with the selected theme
          mermaid.initialize({
            startOnLoad: false,
            theme: theme,
            securityLevel: 'loose',
            fontFamily: 'inherit',
            flowchart: {
              useMaxWidth: true,
              htmlLabels: true,
              curve: 'basis',
            },
            sequence: {
              useMaxWidth: true,
              actorMargin: 50,
              messageMargin: 35,
            },
            gantt: {
              useMaxWidth: true,
            },
          });

          // Clear previous content
          containerRef.current.innerHTML = '';

          // Render the diagram
          const { svg } = await mermaid.render(diagramId, mermaidCode);
          
          // Insert rendered SVG
          containerRef.current.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true } });
          
          // Scale SVG to fit if needed
          setTimeout(() => {
            if (containerRef.current && containerWidth && containerHeight) {
              const svgElement = containerRef.current.querySelector('svg');
              if (svgElement) {
                const contentWidth = svgElement.clientWidth || svgElement.getBoundingClientRect().width;
                const contentHeight = svgElement.clientHeight || svgElement.getBoundingClientRect().height;
                
                if (contentWidth > 0 && contentHeight > 0) {
                  const scaleX = contentWidth > containerWidth ? containerWidth / contentWidth : 1;
                  const scaleY = contentHeight > containerHeight ? containerHeight / contentHeight : 1;
                  const scale = Math.min(scaleX, scaleY, 1);
                  
                  if (scale < 1) {
                    svgElement.style.transform = `scale(${scale})`;
                    svgElement.style.transformOrigin = 'center center';
                  }
                }
              }
            }
          }, 50);
        } catch (err) {
          console.error('Mermaid rendering error:', err);
          
          // Show error in container
          if (containerRef.current) {
            containerRef.current.innerHTML = DOMPurify.sanitize(`
              <div style="color: #cc0000; padding: 20px; font-size: 14px;">
                <strong>Error rendering diagram:</strong><br/>
                ${err instanceof Error ? err.message : 'Unknown error'}
              </div>
            `);
          }
        }
      }
    };

    renderDiagram();
  }, [mermaidCode, theme, diagramId, containerWidth, containerHeight]);

  return (
    <div 
      ref={containerRef}
      style={{ 
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        maxWidth: '100%',
        maxHeight: '100%',
      }}
      className="mermaid-container"
    />
  );
};

export const renderDiagram = (
  component: ComponentInstance,
  baseStyles: React.CSSProperties,
  containerRef: React.RefObject<HTMLDivElement>
) => {
  const props = component.props;
  
  const {
    mermaid: mermaidCode = "graph TD\n    A[Start] --> B[Process]\n    B --> C[End]",
    theme = "default",
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
  const actualHeight = component.props.height || 400;
  const innerWidth = actualWidth - (padding * 2);
  const innerHeight = actualHeight - (padding * 2);

  return (
    <div ref={containerRef} style={containerStyles}>
      <DiagramContent 
        mermaidCode={mermaidCode}
        theme={theme as 'default' | 'neutral' | 'dark' | 'forest' | 'base'}
        componentId={component.id}
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
const DiagramRendererWrapper: RendererFunction = (props) => {
  return renderDiagram(props.component, props.styles || {}, props.containerRef);
};

// Register the wrapped renderer
registerRenderer('Diagram', DiagramRendererWrapper);
