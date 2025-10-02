import { useState, useEffect, useRef } from 'react';
import { useEditorState } from '@/context/EditorStateContext';

/**
 * Hook to manage chart animation state and optimize transition performance
 * This helps prevent unnecessary animations during edit mode transitions
 */
export const useChartAnimation = (componentId: string) => {
  // Simply return static values - no animations on edit mode changes
  return {
    shouldAnimate: false,
    animationKey: `${componentId}-stable`
  };
};
