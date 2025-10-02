import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEditorSettingsStore } from '@/stores/editorSettingsStore';

const ZoomIndicator: React.FC = () => {
  const zoomLevel = useEditorSettingsStore(state => state.zoomLevel);
  const [isVisible, setIsVisible] = useState(false);
  const [displayZoom, setDisplayZoom] = useState(zoomLevel);
  const [hideTimeout, setHideTimeout] = useState<NodeJS.Timeout | null>(null);
  const isFirstRender = useRef(true);
  const previousZoomLevel = useRef(zoomLevel);

  useEffect(() => {
    // Skip showing on first render (initial page load)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      previousZoomLevel.current = zoomLevel;
      return;
    }

    // Only show if zoom level actually changed
    if (zoomLevel !== previousZoomLevel.current) {
      // Show indicator when zoom changes
      setDisplayZoom(zoomLevel);
      setIsVisible(true);

      // Clear existing timeout
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }

      // Hide after 1.5 seconds
      const timeout = setTimeout(() => {
        setIsVisible(false);
      }, 1500);

      setHideTimeout(timeout);
      previousZoomLevel.current = zoomLevel;
    }

    return () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }
    };
  }, [zoomLevel]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.2 }}
          className="fixed top-20 right-6 z-50 pointer-events-none"
        >
          <div className="bg-background/90 backdrop-blur-sm border border-border rounded-md px-3 py-2 shadow-lg">
            <span className="text-sm font-medium">{displayZoom}%</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ZoomIndicator; 