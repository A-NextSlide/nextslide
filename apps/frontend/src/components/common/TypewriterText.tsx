import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface TypewriterTextProps {
  text: string;
  delay?: number;
  className?: string;
  onComplete?: () => void;
  fontSizePx?: number;
  fontWeight?: number;
  uppercase?: boolean;
  cursorColor?: string;
}

const TypewriterText: React.FC<TypewriterTextProps> = React.memo(({ 
  text, 
  delay = 50, 
  className,
  onComplete,
  fontSizePx,
  fontWeight,
  uppercase = true,
  cursorColor
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [showCursor, setShowCursor] = useState(true);
  const indexRef = useRef(0);
  const completedRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const cursorIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const togglesSinceCompleteRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  
  // Update the ref when onComplete changes
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  
  // Reset when text changes
  useEffect(() => {
    indexRef.current = 0;
    completedRef.current = false;
    setDisplayedText('');
    
    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [text]);

  // Typewriter effect
  useEffect(() => {
    if (!text || completedRef.current) return;
    
    const safeDelay = Math.max(10, delay);
    const typeNextChar = () => {
      if (indexRef.current < text.length) {
        const next = text.substring(0, indexRef.current + 1);
        setDisplayedText(prev => (prev === next ? prev : next));
        indexRef.current++;
        
        intervalRef.current = setTimeout(typeNextChar, safeDelay);
      } else if (!completedRef.current) {
        completedRef.current = true;
        if (onCompleteRef.current) {
          onCompleteRef.current();
        }
      }
    };
    
    intervalRef.current = setTimeout(typeNextChar, safeDelay);
    
    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [text, delay]); // Remove onComplete from dependencies

  // Blinking cursor
  useEffect(() => {
    // Reset blink counter when text changes
    togglesSinceCompleteRef.current = 0;
    if (cursorIntervalRef.current) {
      clearInterval(cursorIntervalRef.current);
      cursorIntervalRef.current = null;
    }

    cursorIntervalRef.current = setInterval(() => {
      // If completed, allow only a couple of blinks then stop
      if (completedRef.current) {
        if (togglesSinceCompleteRef.current >= 4) {
          if (cursorIntervalRef.current) {
            clearInterval(cursorIntervalRef.current);
            cursorIntervalRef.current = null;
          }
          setShowCursor(false);
          return;
        }
        togglesSinceCompleteRef.current += 1;
      }
      setShowCursor(prev => !prev);
    }, 500);

    return () => {
      if (cursorIntervalRef.current) {
        clearInterval(cursorIntervalRef.current);
        cursorIntervalRef.current = null;
      }
    };
  }, [text]);

  const effectiveFontSize = fontSizePx ?? (className?.includes('text-lg') ? 18 : 24);
  const effectiveFontWeight = fontWeight ?? 900;
  const effectiveCursorColor = cursorColor ?? '#FF4301';

  return (
    <span 
      className={cn(
        "text-[#383636] dark:text-gray-100",
        className
      )}
      style={{ 
        fontFamily: "'HK Grotesk Wide', 'Hanken Grotesk', sans-serif",
        fontWeight: effectiveFontWeight,
        fontSize: `${effectiveFontSize}px`,
        letterSpacing: '0.5px',
        textTransform: uppercase ? 'uppercase' as const : 'none'
      }}
    >
      {displayedText}
      <span 
        className={cn(
          "inline-block w-[3px] h-[1.2em] ml-[2px] align-middle",
          showCursor ? "opacity-100" : "opacity-0",
          "transition-opacity duration-100"
        )}
        style={{ backgroundColor: effectiveCursorColor }}
      />
    </span>
  );
});

TypewriterText.displayName = 'TypewriterText';

export default TypewriterText; 