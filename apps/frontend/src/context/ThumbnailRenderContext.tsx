import React, { createContext, useContext } from 'react';

export type ThumbnailRenderMode = 'lite' | 'full';

const ThumbnailRenderContext = createContext<ThumbnailRenderMode>('lite');

export const ThumbnailRenderProvider: React.FC<{ mode: ThumbnailRenderMode; children: React.ReactNode }> = ({ mode, children }) => {
  return (
    <ThumbnailRenderContext.Provider value={mode}>
      {children}
    </ThumbnailRenderContext.Provider>
  );
};

export const useThumbnailRenderMode = () => useContext(ThumbnailRenderContext);


