import React, { useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type GuideType = 'center-x' | 'center-y' | 'edge-x' | 'edge-y';

interface SnapGuideProps {
  visible: boolean;
  position: number;
  type: GuideType;
}

interface SnapGuidesProps {
  guides: SnapGuideProps[];
}

const SnapGuide: React.FC<SnapGuideProps> = ({ visible, position, type }) => {
  if (!visible) return null;
  
  const isHorizontal = type === 'center-y' || type === 'edge-y';
  const isCenterGuide = type === 'center-x' || type === 'center-y';
  
  // Center guides are red, edge guides are blue
  const guideColor = isCenterGuide ? '#ff0000' : '#3e9fff';
  
  // Calculate position as a percentage of the slide dimensions
  const percentage = isHorizontal 
    ? (position / 1080) * 100 // Y position as percentage of slide height
    : (position / 1920) * 100; // X position as percentage of slide width
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="absolute pointer-events-none"
      style={{
        position: 'absolute',
        left: isHorizontal ? 0 : `${percentage}%`,
        top: isHorizontal ? `${percentage}%` : 0,
        width: isHorizontal ? '100%' : '1px',
        height: isHorizontal ? '1px' : '100%',
        backgroundColor: guideColor,
        boxShadow: isCenterGuide ? `0 0 1px ${guideColor}` : `0 0 2px ${guideColor}`,
        zIndex: 9999,
      }}
    />
  );
};

const SnapGuides: React.FC<SnapGuidesProps> = ({ guides }) => {
  const guidesToRender = useMemo(() => {
    // Memoize to prevent unnecessary calculations
    return guides;
  }, [guides]);
  
  // Find the slide container to contain the guides
  useEffect(() => {
    // Ensure guides are contained within the slide container
    const slideContainer = document.getElementById('slide-display-container');
    if (slideContainer && portalDiv.current) {
      // Position the portal div to match the slide container's position and size
      const slideRect = slideContainer.getBoundingClientRect();
      const portalElem = portalDiv.current;
      
      portalElem.style.position = 'absolute';
      portalElem.style.top = '0';
      portalElem.style.left = '0';
      portalElem.style.width = '100%';
      portalElem.style.height = '100%';
      portalElem.style.overflow = 'hidden';
      portalElem.style.pointerEvents = 'none';
    }
  }, []);
  
  // Create a ref for the container div
  const portalDiv = useRef<HTMLDivElement>(null);
  
  return (
    <div 
      ref={portalDiv}
      className="snap-guides-container pointer-events-none" 
      style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '100%', 
        zIndex: 9999,
        overflow: 'hidden'
      }}
    >
      <AnimatePresence>
        {guidesToRender.map((guide, index) => (
          <SnapGuide
            key={`${guide.type}-${index}`}
            visible={guide.visible}
            position={guide.position}
            type={guide.type}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

export default SnapGuides;
