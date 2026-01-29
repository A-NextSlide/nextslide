import React from 'react';
import { SlideData } from '@/types/SlideTypes';
import { StaticEditorStateProvider } from '@/context/EditorStateContext';
import { StaticActiveSlideProvider } from '@/context/ActiveSlideContext';
import { StaticNavigationProvider } from '@/context/NavigationContext';
import { ThumbnailRenderProvider } from '@/context/ThumbnailRenderContext';

interface StampProvidersProps {
  slideSize: { width: number; height: number };
  slide: SlideData;
  children: React.ReactNode;
}

/**
 * Wraps children with the static providers needed for offscreen slide rendering.
 * Used by stampRenderer to render slides in a hidden container.
 */
export const StampProviders: React.FC<StampProvidersProps> = ({ slideSize, slide, children }) => {
  return (
    <StaticNavigationProvider slideIndex={0}>
      <StaticEditorStateProvider slideSize={slideSize}>
        <StaticActiveSlideProvider slide={slide}>
          <ThumbnailRenderProvider mode="full">
            {children}
          </ThumbnailRenderProvider>
        </StaticActiveSlideProvider>
      </StaticEditorStateProvider>
    </StaticNavigationProvider>
  );
};
