import { useEffect } from 'react';
import type { RefObject } from 'react';

export const useAutoResizeTextarea = (
  ref: RefObject<HTMLTextAreaElement>,
  value: string,
  maxHeight = 400
) => {
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = `${Math.min(ref.current.scrollHeight, maxHeight)}px`;
  }, [maxHeight, ref, value]);
};
