import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SketchPath {
  id: string;
  d: string;
  strokeWidth?: number;
  delay?: number;
  duration?: number;
  color?: string;
}

interface TemplateLayout {
  id: string;
  name: string;
  paths: SketchPath[];
  viewBox?: string;
}

// Define various template layouts that will be "sketched"
const templateLayouts: TemplateLayout[] = [
  {
    id: 'hero-split',
    name: 'Hero Split',
    viewBox: '0 0 200 150',
    paths: [
      // Frame
      { id: 'frame', d: 'M10 10 L190 10 L190 140 L10 140 Z', strokeWidth: 2, delay: 0, duration: 1.5 },
      // Left section
      { id: 'divider', d: 'M100 10 L100 140', strokeWidth: 1.5, delay: 0.5, duration: 0.8 },
      // Title area
      { id: 'title1', d: 'M20 30 L80 30', strokeWidth: 3, delay: 0.8, duration: 0.5, color: 'accent' },
      { id: 'title2', d: 'M20 40 L70 40', strokeWidth: 3, delay: 1, duration: 0.4, color: 'accent' },
      // Text lines
      { id: 'text1', d: 'M20 60 L85 60', strokeWidth: 1, delay: 1.2, duration: 0.3 },
      { id: 'text2', d: 'M20 70 L80 70', strokeWidth: 1, delay: 1.3, duration: 0.3 },
      { id: 'text3', d: 'M20 80 L75 80', strokeWidth: 1, delay: 1.4, duration: 0.3 },
      // Right image placeholder
      { id: 'img-tl', d: 'M120 30 L170 30 L170 80 L120 80 Z', strokeWidth: 1.5, delay: 1.5, duration: 1 },
      { id: 'img-diag1', d: 'M120 30 L170 80', strokeWidth: 0.5, delay: 2, duration: 0.5 },
      { id: 'img-diag2', d: 'M170 30 L120 80', strokeWidth: 0.5, delay: 2.2, duration: 0.5 },
      // Button
      { id: 'button', d: 'M20 110 L80 110 L80 125 L20 125 Z', strokeWidth: 1.5, delay: 2.5, duration: 0.8, color: 'accent' },
    ]
  },
  {
    id: 'grid-layout',
    name: 'Grid Layout',
    viewBox: '0 0 200 150',
    paths: [
      // Outer frame
      { id: 'frame', d: 'M10 10 L190 10 L190 140 L10 140 Z', strokeWidth: 2, delay: 0, duration: 1.5 },
      // Title
      { id: 'title', d: 'M60 25 L140 25', strokeWidth: 3, delay: 0.5, duration: 0.6, color: 'accent' },
      // Grid cells
      { id: 'grid1', d: 'M30 50 L80 50 L80 90 L30 90 Z', strokeWidth: 1.5, delay: 0.8, duration: 0.8 },
      { id: 'grid2', d: 'M120 50 L170 50 L170 90 L120 90 Z', strokeWidth: 1.5, delay: 1, duration: 0.8 },
      { id: 'grid3', d: 'M30 100 L80 100 L80 130 L30 130 Z', strokeWidth: 1.5, delay: 1.2, duration: 0.8 },
      { id: 'grid4', d: 'M120 100 L170 100 L170 130 L120 130 Z', strokeWidth: 1.5, delay: 1.4, duration: 0.8 },
      // Inner details
      { id: 'detail1', d: 'M40 65 L70 65', strokeWidth: 1, delay: 1.8, duration: 0.3 },
      { id: 'detail2', d: 'M40 75 L65 75', strokeWidth: 1, delay: 1.9, duration: 0.3 },
      { id: 'detail3', d: 'M130 65 L160 65', strokeWidth: 1, delay: 2, duration: 0.3 },
      { id: 'detail4', d: 'M130 75 L155 75', strokeWidth: 1, delay: 2.1, duration: 0.3 },
    ]
  },
  {
    id: 'centered-hero',
    name: 'Centered Hero',
    viewBox: '0 0 200 150',
    paths: [
      // Frame
      { id: 'frame', d: 'M10 10 L190 10 L190 140 L10 140 Z', strokeWidth: 2, delay: 0, duration: 1.5 },
      // Large central rectangle
      { id: 'hero-box', d: 'M40 35 L160 35 L160 95 L40 95 Z', strokeWidth: 2, delay: 0.5, duration: 1.2 },
      // Title in center
      { id: 'title1', d: 'M60 55 L140 55', strokeWidth: 3, delay: 1.2, duration: 0.6, color: 'accent' },
      { id: 'title2', d: 'M70 65 L130 65', strokeWidth: 2.5, delay: 1.5, duration: 0.5, color: 'accent' },
      // Decorative elements
      { id: 'deco1', d: 'M30 20 L50 20', strokeWidth: 1, delay: 1.8, duration: 0.3 },
      { id: 'deco2', d: 'M150 20 L170 20', strokeWidth: 1, delay: 1.9, duration: 0.3 },
      // Bottom text
      { id: 'subtitle', d: 'M60 110 L140 110', strokeWidth: 1.5, delay: 2, duration: 0.5 },
      { id: 'subtitle2', d: 'M70 120 L130 120', strokeWidth: 1, delay: 2.2, duration: 0.4 },
    ]
  },
  {
    id: 'data-viz',
    name: 'Data Visualization',
    viewBox: '0 0 200 150',
    paths: [
      // Frame
      { id: 'frame', d: 'M10 10 L190 10 L190 140 L10 140 Z', strokeWidth: 2, delay: 0, duration: 1.5 },
      // Title
      { id: 'title', d: 'M20 25 L100 25', strokeWidth: 3, delay: 0.5, duration: 0.6, color: 'accent' },
      // Chart axes
      { id: 'y-axis', d: 'M40 40 L40 110', strokeWidth: 2, delay: 0.8, duration: 0.5 },
      { id: 'x-axis', d: 'M40 110 L160 110', strokeWidth: 2, delay: 1, duration: 0.5 },
      // Chart bars
      { id: 'bar1', d: 'M60 110 L60 90 L80 90 L80 110', strokeWidth: 1.5, delay: 1.3, duration: 0.5, color: 'accent' },
      { id: 'bar2', d: 'M90 110 L90 70 L110 70 L110 110', strokeWidth: 1.5, delay: 1.5, duration: 0.5, color: 'accent' },
      { id: 'bar3', d: 'M120 110 L120 80 L140 80 L140 110', strokeWidth: 1.5, delay: 1.7, duration: 0.5, color: 'accent' },
      // Legend
      { id: 'legend1', d: 'M50 125 L70 125', strokeWidth: 1, delay: 2, duration: 0.3 },
      { id: 'legend2', d: 'M90 125 L110 125', strokeWidth: 1, delay: 2.1, duration: 0.3 },
      { id: 'legend3', d: 'M130 125 L150 125', strokeWidth: 1, delay: 2.2, duration: 0.3 },
    ]
  },
  {
    id: 'timeline',
    name: 'Timeline',
    viewBox: '0 0 200 150',
    paths: [
      // Frame
      { id: 'frame', d: 'M10 10 L190 10 L190 140 L10 140 Z', strokeWidth: 2, delay: 0, duration: 1.5 },
      // Central timeline
      { id: 'timeline', d: 'M30 75 L170 75', strokeWidth: 2, delay: 0.5, duration: 1, color: 'accent' },
      // Timeline points
      { id: 'point1', d: 'M50 75 m-5,0 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0', strokeWidth: 2, delay: 1, duration: 0.5 },
      { id: 'point2', d: 'M100 75 m-5,0 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0', strokeWidth: 2, delay: 1.2, duration: 0.5 },
      { id: 'point3', d: 'M150 75 m-5,0 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0', strokeWidth: 2, delay: 1.4, duration: 0.5 },
      // Labels
      { id: 'label1', d: 'M35 50 L65 50', strokeWidth: 1, delay: 1.6, duration: 0.3 },
      { id: 'desc1', d: 'M35 55 L60 55', strokeWidth: 0.5, delay: 1.7, duration: 0.2 },
      { id: 'label2', d: 'M85 100 L115 100', strokeWidth: 1, delay: 1.8, duration: 0.3 },
      { id: 'desc2', d: 'M85 105 L110 105', strokeWidth: 0.5, delay: 1.9, duration: 0.2 },
      { id: 'label3', d: 'M135 50 L165 50', strokeWidth: 1, delay: 2, duration: 0.3 },
      { id: 'desc3', d: 'M135 55 L160 55', strokeWidth: 0.5, delay: 2.1, duration: 0.2 },
    ]
  },
  {
    id: 'comparison',
    name: 'Comparison',
    viewBox: '0 0 200 150',
    paths: [
      // Frame
      { id: 'frame', d: 'M10 10 L190 10 L190 140 L10 140 Z', strokeWidth: 2, delay: 0, duration: 1.5 },
      // Title
      { id: 'title', d: 'M60 20 L140 20', strokeWidth: 3, delay: 0.5, duration: 0.6, color: 'accent' },
      // VS divider
      { id: 'vs-circle', d: 'M100 75 m-15,0 a15,15 0 1,0 30,0 a15,15 0 1,0 -30,0', strokeWidth: 2, delay: 0.8, duration: 0.8, color: 'accent' },
      { id: 'vs-text', d: 'M92 75 L96 75 M104 75 L108 75', strokeWidth: 1.5, delay: 1.2, duration: 0.3 },
      // Left section
      { id: 'left-box', d: 'M25 45 L75 45 L75 105 L25 105 Z', strokeWidth: 1.5, delay: 1, duration: 0.8 },
      { id: 'left-title', d: 'M35 55 L65 55', strokeWidth: 1, delay: 1.5, duration: 0.3 },
      { id: 'left-line1', d: 'M35 70 L65 70', strokeWidth: 0.5, delay: 1.6, duration: 0.2 },
      { id: 'left-line2', d: 'M35 80 L60 80', strokeWidth: 0.5, delay: 1.7, duration: 0.2 },
      { id: 'left-line3', d: 'M35 90 L55 90', strokeWidth: 0.5, delay: 1.8, duration: 0.2 },
      // Right section
      { id: 'right-box', d: 'M125 45 L175 45 L175 105 L125 105 Z', strokeWidth: 1.5, delay: 1.2, duration: 0.8 },
      { id: 'right-title', d: 'M135 55 L165 55', strokeWidth: 1, delay: 1.7, duration: 0.3 },
      { id: 'right-line1', d: 'M135 70 L165 70', strokeWidth: 0.5, delay: 1.8, duration: 0.2 },
      { id: 'right-line2', d: 'M135 80 L160 80', strokeWidth: 0.5, delay: 1.9, duration: 0.2 },
      { id: 'right-line3', d: 'M135 90 L155 90', strokeWidth: 0.5, delay: 2, duration: 0.2 },
    ]
  },
  {
    id: 'process-flow',
    name: 'Process Flow',
    viewBox: '0 0 200 150',
    paths: [
      // Frame
      { id: 'frame', d: 'M10 10 L190 10 L190 140 L10 140 Z', strokeWidth: 2, delay: 0, duration: 1.5 },
      // Process boxes
      { id: 'box1', d: 'M20 60 L50 60 L50 90 L20 90 Z', strokeWidth: 1.5, delay: 0.5, duration: 0.5, color: 'accent' },
      { id: 'arrow1', d: 'M50 75 L70 75 M65 70 L70 75 L65 80', strokeWidth: 1.5, delay: 0.8, duration: 0.3 },
      { id: 'box2', d: 'M70 60 L100 60 L100 90 L70 90 Z', strokeWidth: 1.5, delay: 0.9, duration: 0.5 },
      { id: 'arrow2', d: 'M100 75 L120 75 M115 70 L120 75 L115 80', strokeWidth: 1.5, delay: 1.2, duration: 0.3 },
      { id: 'box3', d: 'M120 60 L150 60 L150 90 L120 90 Z', strokeWidth: 1.5, delay: 1.3, duration: 0.5 },
      { id: 'arrow3', d: 'M150 75 L170 75 M165 70 L170 75 L165 80', strokeWidth: 1.5, delay: 1.6, duration: 0.3 },
      { id: 'box4', d: 'M170 60 L180 60 L180 90 L170 90 Z', strokeWidth: 2, delay: 1.7, duration: 0.5, color: 'accent' },
      // Labels
      { id: 'label1', d: 'M25 75 L45 75', strokeWidth: 0.5, delay: 1.8, duration: 0.2 },
      { id: 'label2', d: 'M75 75 L95 75', strokeWidth: 0.5, delay: 1.9, duration: 0.2 },
      { id: 'label3', d: 'M125 75 L145 75', strokeWidth: 0.5, delay: 2, duration: 0.2 },
      // Title
      { id: 'title', d: 'M50 35 L150 35', strokeWidth: 3, delay: 2.1, duration: 0.5, color: 'accent' },
    ]
  },
  {
    id: 'masonry',
    name: 'Masonry Layout',
    viewBox: '0 0 200 150',
    paths: [
      // Frame
      { id: 'frame', d: 'M10 10 L190 10 L190 140 L10 140 Z', strokeWidth: 2, delay: 0, duration: 1.5 },
      // Masonry blocks
      { id: 'block1', d: 'M20 20 L60 20 L60 70 L20 70 Z', strokeWidth: 1.5, delay: 0.5, duration: 0.6 },
      { id: 'block2', d: 'M70 20 L110 20 L110 50 L70 50 Z', strokeWidth: 1.5, delay: 0.7, duration: 0.5, color: 'accent' },
      { id: 'block3', d: 'M120 20 L180 20 L180 60 L120 60 Z', strokeWidth: 1.5, delay: 0.9, duration: 0.6 },
      { id: 'block4', d: 'M20 80 L80 80 L80 130 L20 130 Z', strokeWidth: 1.5, delay: 1.1, duration: 0.7, color: 'accent' },
      { id: 'block5', d: 'M90 60 L130 60 L130 100 L90 100 Z', strokeWidth: 1.5, delay: 1.3, duration: 0.5 },
      { id: 'block6', d: 'M140 70 L180 70 L180 130 L140 130 Z', strokeWidth: 1.5, delay: 1.5, duration: 0.6 },
      { id: 'block7', d: 'M90 110 L130 110 L130 130 L90 130 Z', strokeWidth: 1.5, delay: 1.7, duration: 0.4 },
      // Details
      { id: 'detail1', d: 'M30 35 L50 35', strokeWidth: 0.5, delay: 1.9, duration: 0.2 },
      { id: 'detail2', d: 'M30 45 L45 45', strokeWidth: 0.5, delay: 2, duration: 0.2 },
      { id: 'detail3', d: 'M130 35 L170 35', strokeWidth: 0.5, delay: 2.1, duration: 0.2 },
    ]
  }
];

interface TemplateSketchLoaderProps {
  isGenerating: boolean;
  currentTheme?: {
    page?: { backgroundColor?: string };
    typography?: { paragraph?: { color?: string } };
    accent1?: string;
  };
  className?: string;
}

const TemplateSketchLoader: React.FC<TemplateSketchLoaderProps> = ({
  isGenerating,
  currentTheme,
  className
}) => {
  const [currentTemplateIndex, setCurrentTemplateIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const bgColor = currentTheme?.page?.backgroundColor || '#ffffff';
  const textColor = currentTheme?.typography?.paragraph?.color || '#333333';
  const accentColor = currentTheme?.accent1 || '#007bff';

  useEffect(() => {
    if (!isGenerating) {
      setCurrentTemplateIndex(0);
      setIsAnimating(false);
      return;
    }

    setIsAnimating(true);
    const interval = setInterval(() => {
      setCurrentTemplateIndex((prev) => (prev + 1) % templateLayouts.length);
    }, 4000); // Change template every 4 seconds

    return () => clearInterval(interval);
  }, [isGenerating]);

  const currentTemplate = templateLayouts[currentTemplateIndex];

  const getStrokeColor = (color?: string) => {
    if (color === 'accent') return accentColor;
    return textColor;
  };

  return (
    <AnimatePresence mode="wait">
      {isGenerating && (
        <motion.div
          key="sketch-loader"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.3 }}
          className={cn("relative w-full h-32", className)}
        >
          <div 
            className="absolute inset-0 rounded-md"
            style={{ backgroundColor: bgColor }}
          />
          
          <svg 
            viewBox={currentTemplate.viewBox || "0 0 200 150"} 
            className="w-full h-full relative z-10"
            preserveAspectRatio="xMidYMid meet"
          >
            <AnimatePresence mode="sync">
              {currentTemplate.paths.map((path) => (
                <motion.path
                  key={`${currentTemplate.id}-${path.id}`}
                  d={path.d}
                  fill="none"
                  stroke={getStrokeColor(path.color)}
                  strokeWidth={path.strokeWidth || 1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ 
                    pathLength: 1, 
                    opacity: 1,
                    transition: {
                      pathLength: { 
                        delay: path.delay || 0, 
                        duration: path.duration || 0.5,
                        ease: "easeInOut"
                      },
                      opacity: { 
                        delay: path.delay || 0, 
                        duration: 0.2 
                      }
                    }
                  }}
                  exit={{ 
                    opacity: 0,
                    transition: { duration: 0.3 }
                  }}
                />
              ))}
            </AnimatePresence>
          </svg>
          
          <motion.div 
            className="absolute bottom-2 left-2 text-xs font-medium"
            style={{ color: textColor }}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 0.6, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            {currentTemplate.name}
          </motion.div>
          
          <motion.div className="absolute top-2 right-2 flex space-x-1">
            {templateLayouts.map((_, index) => (
              <motion.div
                key={index}
                className="w-1 h-1 rounded-full"
                style={{ 
                  backgroundColor: index === currentTemplateIndex ? accentColor : textColor 
                }}
                animate={{
                  scale: index === currentTemplateIndex ? 1.5 : 1,
                  opacity: index === currentTemplateIndex ? 1 : 0.3
                }}
                transition={{ duration: 0.2 }}
              />
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TemplateSketchLoader; 