import React, { useCallback, useEffect, useRef } from 'react';
import { ComponentInstance } from '@/types/components';
import { sendComponentLayoutUpdate } from '@/utils/componentSyncUtils';
import { useActiveSlide } from '@/context/ActiveSlideContext';

interface UseComponentRotateProps {
  componentId: string;
  component?: ComponentInstance;
  isRotatable?: boolean;
  isSelected?: boolean;
  updateComponent: (id: string, updates: Partial<any>, skipHistory: boolean) => void;
}

/**
 * Hook to manage component rotation interaction via global event listener.
 */
export function useComponentRotate({
  componentId,
  component,
  isRotatable,
  isSelected,
  updateComponent,
}: UseComponentRotateProps): void {
  const { slideId } = useActiveSlide();
  const lastWsSendTimeRef = useRef(0);
  const THROTTLE_INTERVAL_MS = 30;

  const componentPropsRef = useRef(component?.props || {});

  useEffect(() => {
    if (component && component.props) {
      componentPropsRef.current = component.props;
    } else {
      componentPropsRef.current = {}; 
    }
  }, [component?.props]);

  const handleRotate = useCallback((e: CustomEvent) => {
    if (!component) return; 

    const { componentId: eventComponentId, rotation: newRotation, position: newPositionFromEvent } = e.detail;

    if (eventComponentId === componentId && isRotatable && isSelected) { 
      const currentProps = componentPropsRef.current;
      const currentPosition = currentProps.position || { x: 0, y: 0 };
      const currentSize = currentProps.size; 

      updateComponent(componentId, {
        props: {
          ...currentProps,
          rotation: newRotation,
          position: newPositionFromEvent || currentPosition 
        }
      }, true);

      if (slideId) {
        const now = Date.now();
        if (now - lastWsSendTimeRef.current > THROTTLE_INTERVAL_MS) {
          sendComponentLayoutUpdate(
            componentId,
            slideId,
            {
              position: newPositionFromEvent || currentPosition,
              size: currentSize, 
              rotation: newRotation,
            },
            true 
          );
          lastWsSendTimeRef.current = now;
        }
      }
    }
  }, [
    componentId, 
    isRotatable, 
    isSelected, 
    updateComponent, 
    slideId,
    component 
  ]);

  const handleRotateEnd = useCallback((e: CustomEvent) => {
    if (!component) return;

    const { componentId: eventComponentId, rotation: finalRotation, position: finalPositionFromEvent } = e.detail;
    
    if (eventComponentId === componentId && isRotatable && isSelected) {
      const currentProps = componentPropsRef.current;

      updateComponent(componentId, {
          props: {
            ...currentProps,
            rotation: finalRotation,
            position: finalPositionFromEvent || currentProps.position || { x: 0, y: 0 },
          },
        }, 
        false 
      );

      if (slideId) {
        sendComponentLayoutUpdate(
          componentId,
          slideId,
          {
            position: finalPositionFromEvent || currentProps.position || { x: 0, y: 0 },
            size: currentProps.size,
            rotation: finalRotation,
          },
          false 
        );
      }
    }
  }, [
    componentId, 
    isRotatable, 
    isSelected, 
    updateComponent, 
    slideId,
    component 
  ]);

  useEffect(() => {
    if (isSelected && isRotatable && component) {
      document.addEventListener('component:rotate', handleRotate as EventListener);
      document.addEventListener('component:rotate-end', handleRotateEnd as EventListener); 
      return () => {
        document.removeEventListener('component:rotate', handleRotate as EventListener);
        document.removeEventListener('component:rotate-end', handleRotateEnd as EventListener);
      };
    }
    return undefined; 
  }, [isSelected, isRotatable, handleRotate, handleRotateEnd, component]);
} 