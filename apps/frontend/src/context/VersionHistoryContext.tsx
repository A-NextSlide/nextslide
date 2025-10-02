import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useDeckStore } from '../stores/deckStore';
import { VersionDiff } from '../types/VersionTypes';

interface VersionHistoryContextType {
  isHistoryPanelOpen: boolean;
  setHistoryPanelOpen: (open: boolean) => void;
  selectedVersionId: string | null;
  setSelectedVersionId: (id: string | null) => void;
  versionDiff: VersionDiff | null;
}

const defaultContext: VersionHistoryContextType = {
  isHistoryPanelOpen: false,
  setHistoryPanelOpen: () => {},
  selectedVersionId: null,
  setSelectedVersionId: () => {},
  versionDiff: null
};

export const VersionHistoryContext = createContext<VersionHistoryContextType>(defaultContext);

export function VersionHistoryProvider({ children }: { children: ReactNode }) {
  const [isHistoryPanelOpen, setHistoryPanelOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [versionDiff, setVersionDiff] = useState<VersionDiff | null>(null);
  
  return (
    <VersionHistoryContext.Provider
      value={{
        isHistoryPanelOpen,
        setHistoryPanelOpen,
        selectedVersionId,
        setSelectedVersionId,
        versionDiff
      }}
    >
      {children}
    </VersionHistoryContext.Provider>
  );
}

export function useVersionHistory() {
  return useContext(VersionHistoryContext);
}