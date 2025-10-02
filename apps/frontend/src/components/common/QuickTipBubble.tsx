import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface QuickTipBubbleProps {
  show: boolean;
  duration?: number;
}

export const QuickTipBubble: React.FC<QuickTipBubbleProps> = ({ 
  show, 
  duration = 10000 // 10 seconds default
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, duration);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [show, duration]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.9 }}
          transition={{ 
            type: "spring", 
            stiffness: 400, 
            damping: 25 
          }}
          className="fixed bottom-8 right-8 z-50 pointer-events-none"
        >
          <div className="bg-orange-500 text-white rounded-full px-6 py-3 shadow-lg flex items-center gap-3 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span>💡 Press</span>
              <kbd className="px-2 py-0.5 text-xs font-mono bg-white/20 text-white rounded">E</kbd>
              <span>to edit • Double-click any slide</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default QuickTipBubble; 