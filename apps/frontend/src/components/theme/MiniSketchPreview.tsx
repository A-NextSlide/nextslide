import React from 'react';
import { motion } from 'framer-motion';

interface MiniSketchPreviewProps {
  delay?: number;
  accentColor?: string;
  textColor?: string;
}

const MiniSketchPreview: React.FC<MiniSketchPreviewProps> = ({
  delay = 0,
  accentColor = '#007bff',
  textColor = '#333333'
}) => {
  const paths = [
    // Simple frame
    { d: 'M2 2 L18 2 L18 14 L2 14 Z', delay: 0 },
    // Title line
    { d: 'M4 5 L12 5', delay: 0.2, isAccent: true },
    // Content lines
    { d: 'M4 8 L14 8', delay: 0.3 },
    { d: 'M4 10 L11 10', delay: 0.4 },
    // Small accent box
    { d: 'M13 9 L16 9 L16 12 L13 12 Z', delay: 0.5, isAccent: true },
  ];

  return (
    <svg 
      viewBox="0 0 20 16" 
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {paths.map((path, index) => (
        <motion.path
          key={index}
          d={path.d}
          fill="none"
          stroke={path.isAccent ? accentColor : textColor}
          strokeWidth={0.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ 
            pathLength: 1, 
            opacity: 0.6,
            transition: {
              pathLength: { 
                delay: delay + path.delay, 
                duration: 0.4,
                ease: "easeInOut"
              },
              opacity: { 
                delay: delay + path.delay, 
                duration: 0.2 
              }
            }
          }}
        />
      ))}
    </svg>
  );
};

export default MiniSketchPreview; 