import { useState, useRef, useEffect } from 'react';

interface UseAnimatedProgressOptions {
  initialProgress?: number;
  creepSpeed?: {
    slow: number;
    medium: number; 
    fast: number;
  };
  updateInterval?: number;
}

/**
 * Hook for smooth progress animation with automatic creeping
 * Extracted from SlideGeneratingUI for reusability
 */
export function useAnimatedProgress(
  targetProgress: number,
  options: UseAnimatedProgressOptions = {}
) {
  const {
    initialProgress = 0,
    creepSpeed = {
      slow: 0.4,
      medium: 0.8,
      fast: 1.5
    },
    updateInterval = 30
  } = options;

  const [animatedProgress, setAnimatedProgress] = useState(initialProgress);
  
  // Use refs to track animation state without causing re-renders
  const targetProgressRef = useRef(targetProgress);
  const animatedProgressRef = useRef(initialProgress);
  const lastTimeRef = useRef(Date.now());
  const animationIdRef = useRef<number | null>(null);
  const isComponentVisibleRef = useRef(true);
  
  // Update target when progress prop changes
  useEffect(() => {
    targetProgressRef.current = targetProgress;
    // If this is the first time setting progress, also update animated progress
    if (animatedProgressRef.current === 0 && targetProgress > 0) {
      animatedProgressRef.current = targetProgress;
      setAnimatedProgress(targetProgress);
    }
  }, [targetProgress]);
  
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
        let speed = creepSpeed.slow; // % per second
        
        if (current < 30) {
          // Faster during theme generation (0-30%)
          speed = creepSpeed.fast;
        } else if (current < 60) {
          // Medium speed during slide creation
          speed = creepSpeed.medium;
        } else {
          // Slower as we approach completion
          speed = creepSpeed.slow;
        }
        
        // Don't exceed 100% or go too far past target
        const maxProgress = Math.min(target + 10, 99);
        newProgress = Math.min(current + speed * deltaTime, maxProgress);
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
  }, [creepSpeed, updateInterval]); // Dependencies intentionally limited
  
  return animatedProgress;
} 