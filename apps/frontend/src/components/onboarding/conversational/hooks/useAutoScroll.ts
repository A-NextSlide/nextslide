import { useEffect, useRef, type RefObject } from 'react';

// Threshold in pixels - user is considered "at bottom" if within this distance
const SCROLL_THRESHOLD = 100;

interface UseAutoScrollReturn {
  anchorRef: RefObject<HTMLDivElement>;
  scrollContainerRef: RefObject<HTMLDivElement>;
}

export const useAutoScroll = (deps: unknown[]): UseAutoScrollReturn => {
  const anchorRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  // Attach scroll listener to detect user scrolling up
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      if (distanceFromBottom <= SCROLL_THRESHOLD) {
        userScrolledUpRef.current = false;
      } else {
        userScrolledUpRef.current = true;
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    // Don't scroll if user has scrolled up
    if (userScrolledUpRef.current) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) return;

    // Scroll only the internal message container; avoid viewport/body jumps.
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'auto',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { anchorRef, scrollContainerRef };
};
