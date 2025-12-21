import { useEffect, useRef } from 'react';

export const useAutoScroll = (deps: unknown[]) => {
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    anchorRef.current?.scrollIntoView({ behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return anchorRef;
};
