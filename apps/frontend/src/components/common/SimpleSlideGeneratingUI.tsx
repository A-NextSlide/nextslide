import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface SimpleSlideGeneratingUIProps {
  progress?: number;
  message?: string;
  slideNumber?: number;
  totalSlides?: number;
}

const SimpleSlideGeneratingUI: React.FC<SimpleSlideGeneratingUIProps> = ({
  progress = 0,
  message = 'Generating slides...',
  slideNumber,
  totalSlides
}) => {
  const [displayProgress, setDisplayProgress] = useState(progress);
  
  // Smooth progress animation
  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayProgress(prev => {
        const diff = progress - prev;
        if (Math.abs(diff) < 0.1) return progress;
        return prev + diff * 0.1; // Smooth transition
      });
    }, 50);
    
    return () => clearInterval(interval);
  }, [progress]);
  
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/10 dark:to-orange-800/10">
      <div className="text-center space-y-6 p-8">
        {/* Simple loading spinner */}
        <div className="relative">
          <div className="w-16 h-16 border-4 border-orange-200 dark:border-orange-700 rounded-full mx-auto">
            <div className="w-full h-full border-4 border-t-orange-500 dark:border-t-orange-400 rounded-full animate-spin" />
          </div>
        </div>
        
        {/* Status text */}
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-orange-900 dark:text-orange-100">
            {message}
          </h3>
          
          {slideNumber && totalSlides && (
            <p className="text-sm text-orange-700 dark:text-orange-300">
              Slide {slideNumber} of {totalSlides}
            </p>
          )}
        </div>
        
        {/* Progress bar */}
        {progress > 0 && (
          <div className="w-64 mx-auto">
            <div className="flex justify-between text-xs text-orange-600 dark:text-orange-400 mb-1">
              <span>Progress</span>
              <span>{Math.round(displayProgress)}%</span>
            </div>
            <div className="w-full bg-orange-200 dark:bg-orange-800 rounded-full h-2 overflow-hidden">
              <motion.div
                className="h-full bg-orange-500 dark:bg-orange-400 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${displayProgress}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SimpleSlideGeneratingUI;