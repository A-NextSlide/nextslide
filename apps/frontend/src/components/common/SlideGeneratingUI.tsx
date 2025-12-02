import React, { useState, useEffect, useRef } from 'react';
import { motion, useAnimation, AnimatePresence } from 'framer-motion';

interface SlideGeneratingUIProps {
  progress?: number;
  slideNumber?: number;
  totalSlides?: number;
  message?: string;
}

// Define different slide layout sketches - these will be drawn as if being sketched
interface SlideSketch {
  id: string;
  name: string;
  viewBox: string;
  paths: {
    id: string;
    d: string;
    strokeWidth?: number;
    delay?: number;
    duration?: number;
    opacity?: number;
    strokeDasharray?: string;
  }[];
}

const slideSketchLayouts: SlideSketch[] = [
  {
    id: 'title-slide',
    name: 'Title Slide',
    viewBox: '0 0 300 200',
    paths: [
      // Frame
      { id: 'frame', d: 'M20,20 L280,20 L280,180 L20,180 Z', strokeWidth: 2, delay: 0, duration: 1.5 },
      // Large title box
      { id: 'title', d: 'M60,70 L240,70 L240,90 L60,90 Z', strokeWidth: 3, delay: 0.5, duration: 0.8 },
      // Subtitle
      { id: 'subtitle', d: 'M80,110 L220,110', strokeWidth: 2, delay: 1, duration: 0.6 },
      // Decorative line
      { id: 'line', d: 'M100,130 L200,130', strokeWidth: 1, delay: 1.3, duration: 0.4, opacity: 0.6 },
      // Corner accents
      { id: 'corner1', d: 'M20,20 L40,20 L40,40', strokeWidth: 1.5, delay: 1.6, duration: 0.3 },
      { id: 'corner2', d: 'M260,20 L280,20 L280,40', strokeWidth: 1.5, delay: 1.7, duration: 0.3 },
    ]
  },
  {
    id: 'content-with-image',
    name: 'Content with Image',
    viewBox: '0 0 300 200',
    paths: [
      // Frame
      { id: 'frame', d: 'M15,15 L285,15 L285,185 L15,185 Z', strokeWidth: 2, delay: 0, duration: 1.5 },
      // Title area
      { id: 'title', d: 'M30,30 L150,30', strokeWidth: 3, delay: 0.5, duration: 0.6 },
      // Text content area
      { id: 'text1', d: 'M30,60 L140,60', strokeWidth: 1, delay: 0.8, duration: 0.4 },
      { id: 'text2', d: 'M30,70 L130,70', strokeWidth: 1, delay: 0.9, duration: 0.4 },
      { id: 'text3', d: 'M30,80 L135,80', strokeWidth: 1, delay: 1, duration: 0.4 },
      // Bullet points
      { id: 'bullet1', d: 'M30,100 m-2,0 a2,2 0 1,0 4,0 a2,2 0 1,0 -4,0', strokeWidth: 1, delay: 1.2, duration: 0.2 },
      { id: 'bullet-text1', d: 'M40,100 L120,100', strokeWidth: 1, delay: 1.3, duration: 0.4 },
      { id: 'bullet2', d: 'M30,115 m-2,0 a2,2 0 1,0 4,0 a2,2 0 1,0 -4,0', strokeWidth: 1, delay: 1.4, duration: 0.2 },
      { id: 'bullet-text2', d: 'M40,115 L110,115', strokeWidth: 1, delay: 1.5, duration: 0.4 },
      // Image placeholder
      { id: 'image-frame', d: 'M170,50 L270,50 L270,150 L170,150 Z', strokeWidth: 1.5, delay: 1.6, duration: 0.8 },
      // Image diagonal lines
      { id: 'img-diag1', d: 'M170,50 L270,150', strokeWidth: 0.5, delay: 2, duration: 0.4, opacity: 0.3 },
      { id: 'img-diag2', d: 'M270,50 L170,150', strokeWidth: 0.5, delay: 2.1, duration: 0.4, opacity: 0.3 },
    ]
  },
  {
    id: 'comparison-slide',
    name: 'Comparison Slide',
    viewBox: '0 0 300 200',
    paths: [
      // Frame
      { id: 'frame', d: 'M10,10 L290,10 L290,190 L10,190 Z', strokeWidth: 2, delay: 0, duration: 1.5 },
      // Title
      { id: 'title', d: 'M50,25 L250,25', strokeWidth: 3, delay: 0.5, duration: 0.7 },
      // Divider
      { id: 'divider', d: 'M150,50 L150,170', strokeWidth: 1.5, delay: 0.8, duration: 0.6, strokeDasharray: '5 3' },
      // Left column
      { id: 'left-header', d: 'M40,60 L130,60', strokeWidth: 2, delay: 1, duration: 0.5 },
      { id: 'left-box', d: 'M30,80 L140,80 L140,160 L30,160 Z', strokeWidth: 1.5, delay: 1.2, duration: 0.8 },
      // Left content lines
      { id: 'left-line1', d: 'M40,95 L120,95', strokeWidth: 1, delay: 1.6, duration: 0.3 },
      { id: 'left-line2', d: 'M40,110 L115,110', strokeWidth: 1, delay: 1.7, duration: 0.3 },
      { id: 'left-line3', d: 'M40,125 L125,125', strokeWidth: 1, delay: 1.8, duration: 0.3 },
      // Right column
      { id: 'right-header', d: 'M170,60 L260,60', strokeWidth: 2, delay: 1.1, duration: 0.5 },
      { id: 'right-box', d: 'M160,80 L270,80 L270,160 L160,160 Z', strokeWidth: 1.5, delay: 1.3, duration: 0.8 },
      // Right content lines
      { id: 'right-line1', d: 'M170,95 L250,95', strokeWidth: 1, delay: 1.9, duration: 0.3 },
      { id: 'right-line2', d: 'M170,110 L245,110', strokeWidth: 1, delay: 2, duration: 0.3 },
      { id: 'right-line3', d: 'M170,125 L255,125', strokeWidth: 1, delay: 2.1, duration: 0.3 },
    ]
  },
  {
    id: 'chart-slide',
    name: 'Chart Slide',
    viewBox: '0 0 300 200',
    paths: [
      // Frame
      { id: 'frame', d: 'M15,15 L285,15 L285,185 L15,185 Z', strokeWidth: 2, delay: 0, duration: 1.5 },
      // Title
      { id: 'title', d: 'M30,30 L200,30', strokeWidth: 3, delay: 0.5, duration: 0.6 },
      // Chart axes
      { id: 'y-axis', d: 'M60,160 L60,60', strokeWidth: 2, delay: 0.8, duration: 0.5 },
      { id: 'x-axis', d: 'M60,160 L240,160', strokeWidth: 2, delay: 0.9, duration: 0.5 },
      // Chart bars
      { id: 'bar1', d: 'M80,160 L80,120 L100,120 L100,160', strokeWidth: 1.5, delay: 1.2, duration: 0.4 },
      { id: 'bar2', d: 'M110,160 L110,100 L130,100 L130,160', strokeWidth: 1.5, delay: 1.3, duration: 0.4 },
      { id: 'bar3', d: 'M140,160 L140,80 L160,80 L160,160', strokeWidth: 1.5, delay: 1.4, duration: 0.4 },
      { id: 'bar4', d: 'M170,160 L170,90 L190,90 L190,160', strokeWidth: 1.5, delay: 1.5, duration: 0.4 },
      { id: 'bar5', d: 'M200,160 L200,110 L220,110 L220,160', strokeWidth: 1.5, delay: 1.6, duration: 0.4 },
      // Trend line
      { id: 'trend', d: 'M90,140 Q120,110 150,85 T210,95', strokeWidth: 1.5, delay: 1.8, duration: 0.8, strokeDasharray: '3 2', opacity: 0.7 },
      // Labels
      { id: 'label1', d: 'M250,90 L270,90', strokeWidth: 1, delay: 2.2, duration: 0.3 },
      { id: 'label2', d: 'M250,110 L270,110', strokeWidth: 1, delay: 2.3, duration: 0.3 },
    ]
  },
  {
    id: 'process-flow',
    name: 'Process Flow',
    viewBox: '0 0 300 200',
    paths: [
      // Frame
      { id: 'frame', d: 'M10,10 L290,10 L290,190 L10,190 Z', strokeWidth: 2, delay: 0, duration: 1.5 },
      // Title
      { id: 'title', d: 'M100,25 L200,25', strokeWidth: 3, delay: 0.5, duration: 0.6 },
      // Process boxes
      { id: 'box1', d: 'M30,70 L90,70 L90,110 L30,110 Z', strokeWidth: 1.5, delay: 0.8, duration: 0.5 },
      { id: 'box2', d: 'M120,70 L180,70 L180,110 L120,110 Z', strokeWidth: 1.5, delay: 1, duration: 0.5 },
      { id: 'box3', d: 'M210,70 L270,70 L270,110 L210,110 Z', strokeWidth: 1.5, delay: 1.2, duration: 0.5 },
      // Arrows
      { id: 'arrow1', d: 'M90,90 L110,90 M110,90 L105,85 M110,90 L105,95', strokeWidth: 1.5, delay: 1.5, duration: 0.4 },
      { id: 'arrow2', d: 'M180,90 L200,90 M200,90 L195,85 M200,90 L195,95', strokeWidth: 1.5, delay: 1.7, duration: 0.4 },
      // Bottom text
      { id: 'desc1', d: 'M40,130 L80,130', strokeWidth: 1, delay: 2, duration: 0.3, opacity: 0.7 },
      { id: 'desc2', d: 'M130,130 L170,130', strokeWidth: 1, delay: 2.1, duration: 0.3, opacity: 0.7 },
      { id: 'desc3', d: 'M220,130 L260,130', strokeWidth: 1, delay: 2.2, duration: 0.3, opacity: 0.7 },
    ]
  },
  {
    id: 'image-grid',
    name: 'Image Grid',
    viewBox: '0 0 300 200',
    paths: [
      // Frame
      { id: 'frame', d: 'M20,20 L280,20 L280,180 L20,180 Z', strokeWidth: 2, delay: 0, duration: 1.5 },
      // Title
      { id: 'title', d: 'M60,35 L240,35', strokeWidth: 3, delay: 0.5, duration: 0.7 },
      // Grid images
      { id: 'img1', d: 'M40,60 L130,60 L130,100 L40,100 Z', strokeWidth: 1.5, delay: 0.8, duration: 0.5 },
      { id: 'img1-x', d: 'M40,60 L130,100 M130,60 L40,100', strokeWidth: 0.5, delay: 1, duration: 0.3, opacity: 0.3 },
      { id: 'img2', d: 'M170,60 L260,60 L260,100 L170,100 Z', strokeWidth: 1.5, delay: 1.1, duration: 0.5 },
      { id: 'img2-x', d: 'M170,60 L260,100 M260,60 L170,100', strokeWidth: 0.5, delay: 1.3, duration: 0.3, opacity: 0.3 },
      { id: 'img3', d: 'M40,120 L130,120 L130,160 L40,160 Z', strokeWidth: 1.5, delay: 1.4, duration: 0.5 },
      { id: 'img3-x', d: 'M40,120 L130,160 M130,120 L40,160', strokeWidth: 0.5, delay: 1.6, duration: 0.3, opacity: 0.3 },
      { id: 'img4', d: 'M170,120 L260,120 L260,160 L170,160 Z', strokeWidth: 1.5, delay: 1.7, duration: 0.5 },
      { id: 'img4-x', d: 'M170,120 L260,160 M260,120 L170,160', strokeWidth: 0.5, delay: 1.9, duration: 0.3, opacity: 0.3 },
    ]
  }
];

export const SlideGeneratingUI: React.FC<SlideGeneratingUIProps> = ({
  progress = 0,
  slideNumber,
  totalSlides,
  message
}) => {
  // Animated progress state - initialize with current progress
  const [animatedProgress, setAnimatedProgress] = useState(progress);
  const [currentSketchIndex, setCurrentSketchIndex] = useState(0);
  
  // Use refs to track animation state without causing re-renders
  const targetProgressRef = useRef(progress);
  const animatedProgressRef = useRef(progress);
  const lastTimeRef = useRef(Date.now());
  const animationIdRef = useRef<number | null>(null);
  const isComponentVisibleRef = useRef(true);
  
  // Update target when progress prop changes
  useEffect(() => {
    targetProgressRef.current = progress;
    // If this is the first time setting progress, also update animated progress
    if (animatedProgressRef.current === 0 && progress > 0) {
      animatedProgressRef.current = progress;
      setAnimatedProgress(progress);
    }
  }, [progress]);
  
  // Clean up on unmount
  useEffect(() => {
    isComponentVisibleRef.current = true;
    
    return () => {
      isComponentVisibleRef.current = false;
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }
    };
  }, []);
  
  // Smooth progress animation with continuous creeping
  useEffect(() => {
    let frameCount = 0;
    const updateInterval = 30; // Update state less frequently to reduce re-renders
    
    const animate = () => {
      // Stop animation if component is unmounted or hidden
      if (!isComponentVisibleRef.current) {
        return;
      }
      
      const now = Date.now();
      const deltaTime = (now - lastTimeRef.current) / 1000; // Convert to seconds
      lastTimeRef.current = now;
      
      const current = animatedProgressRef.current;
      const target = targetProgressRef.current;
      let newProgress = current;
      
      // If we've reached the target, creep slowly forward
      if (current >= target) {
        // Determine creep speed based on current progress
        let creepSpeed = 0.5; // % per second
        
        if (current < 30) {
          // Faster during theme generation (0-30%)
          creepSpeed = 1.5;
        } else if (current < 60) {
          // Medium speed during slide creation
          creepSpeed = 0.8;
        } else {
          // Slower as we approach completion
          creepSpeed = 0.4;
        }
        
        // Don't exceed 100% or go too far past target
        const maxProgress = Math.min(target + 10, 99);
        newProgress = Math.min(current + creepSpeed * deltaTime, maxProgress);
      } else {
        // Animate quickly to catch up to target
        const catchUpSpeed = 15; // % per second
        const diff = target - current;
        const step = Math.min(diff, catchUpSpeed * deltaTime);
        newProgress = current + step;
      }
      
      // Update ref immediately
      animatedProgressRef.current = newProgress;
      
      // Only update state periodically to reduce re-renders
      frameCount++;
      if (frameCount >= updateInterval) {
        frameCount = 0;
        setAnimatedProgress(newProgress);
      }
      
      // Continue animation only if component is still visible
      if (isComponentVisibleRef.current) {
        animationIdRef.current = requestAnimationFrame(animate);
      }
    };
    
    // Start animation only if component is visible
    if (isComponentVisibleRef.current) {
      animate();
    }
    
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }
    };
  }, []); // Empty dependency array since we're using refs

  // Cycle through sketches while generating
  useEffect(() => {
    const cycleTime = 4000; // Increased time to show each sketch
    const interval = setInterval(() => {
      if (isComponentVisibleRef.current) {
        setCurrentSketchIndex((prev) => (prev + 1) % slideSketchLayouts.length);
      }
    }, cycleTime);
    
    return () => clearInterval(interval);
  }, []);

  // Color scheme based on theme
  const isDarkMode = document.documentElement.classList.contains('dark');
  const lineColor = '#FF4301'; // Orange from theme generation
  const textColor = isDarkMode ? '#e0e0e0' : '#333333';
  const bgColor = isDarkMode ? '#1a1a1a' : '#fafafa';

  // Get current sketch
  const currentSketch = slideSketchLayouts[currentSketchIndex];

  return (
    <div 
      className="w-full h-full relative overflow-hidden flex items-center justify-center"
      style={{ backgroundColor: bgColor }}
    >
      {/* Canvas sketch animation */}
      <div className="absolute inset-0 flex items-center justify-center">
        <svg 
          viewBox={currentSketch.viewBox} 
          className="w-full h-full max-w-[800px] max-h-[600px] px-8 py-8"
          preserveAspectRatio="xMidYMid meet"
        >
          <AnimatePresence mode="sync">
            {currentSketch.paths
              .filter(path => path.id !== 'frame') // Filter out frame elements
              .map((path) => (
              <motion.path
                key={`${currentSketch.id}-${path.id}`}
                d={path.d}
                fill="none"
                stroke={lineColor}
                strokeWidth={path.strokeWidth || 1}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={path.strokeDasharray}
                opacity={path.opacity || 1}
                initial={{ pathLength: 0, opacity: 0 }}
          animate={{ 
                  pathLength: 1, 
                  opacity: path.opacity || 1,
                }}
                exit={{ 
                  opacity: 0,
          }}
          transition={{
                  pathLength: { 
                    delay: path.delay || 0, 
                    duration: path.duration || 0.5,
                    ease: "easeInOut"
                  },
                  opacity: { 
                    delay: path.delay || 0, 
                    duration: 0.2 
                  }
                }}
                style={{
                  filter: 'drop-shadow(0 0 8px rgba(255, 67, 1, 0.3))',
          }}
              />
            ))}
          </AnimatePresence>
        </svg>
      </div>



      {/* Progress bar - Always visible at bottom, styled like theme generation */}
      <div className="absolute bottom-4 left-4 right-4">
        <div className="flex items-center justify-between mb-2">
          <span 
            className="text-sm font-black tracking-wider"
            style={{ 
              color: textColor,
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
              textTransform: 'uppercase',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale'
            }}
          >
            {slideNumber && totalSlides ? `Generating Slide ${slideNumber}` : 'Generating Theme'}
          </span>
          <span 
            className="text-sm font-bold"
            style={{ 
              color: lineColor,
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
            }}
          >
            {Math.round(animatedProgress)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
          <motion.div
            className="h-1.5 rounded-full relative"
            style={{ backgroundColor: lineColor }}
            initial={{ width: 0 }}
            animate={{ width: `${animatedProgress}%` }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {/* Shimmer effect on progress bar */}
            <div 
              className="absolute inset-0"
              style={{
                background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)`,
                animation: 'shimmer 1.5s infinite'
              }}
            />
          </motion.div>
        </div>
      </div>
      
      {/* Add shimmer animation keyframes */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(200%); }
          }
        `
      }} />
    </div>
  );
};

export default SlideGeneratingUI;