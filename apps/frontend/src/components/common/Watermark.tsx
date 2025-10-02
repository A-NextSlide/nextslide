import React from 'react';
import { cn } from '@/lib/utils';

interface WatermarkProps {
  text?: string;
  className?: string;
  opacity?: number;
  fontSize?: number;
  rotation?: number;
  repeat?: boolean;
}

const Watermark: React.FC<WatermarkProps> = ({
  text = 'VIEW ONLY',
  className,
  opacity = 0.05,
  fontSize = 48,
  rotation = -45,
  repeat = true
}) => {
  if (!repeat) {
    // Single watermark in center
    return (
      <div 
        className={cn(
          "absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden",
          className
        )}
      >
        <div
          className="text-foreground/10 font-bold whitespace-nowrap select-none"
          style={{
            fontSize: `${fontSize}px`,
            transform: `rotate(${rotation}deg)`,
            opacity,
            letterSpacing: '0.1em'
          }}
        >
          {text}
        </div>
      </div>
    );
  }

  // Repeated watermark pattern
  const watermarkElements = [];
  const rows = 8;
  const cols = 6;
  
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      watermarkElements.push(
        <div
          key={`${i}-${j}`}
          className="absolute text-foreground/10 font-bold whitespace-nowrap select-none"
          style={{
            fontSize: `${fontSize * 0.5}px`,
            transform: `rotate(${rotation}deg) translate(-50%, -50%)`,
            opacity,
            letterSpacing: '0.1em',
            left: `${(j / (cols - 1)) * 100}%`,
            top: `${(i / (rows - 1)) * 100}%`,
          }}
        >
          {text}
        </div>
      );
    }
  }

  return (
    <div 
      className={cn(
        "absolute inset-0 pointer-events-none overflow-hidden",
        className
      )}
    >
      {watermarkElements}
    </div>
  );
};

export default Watermark; 