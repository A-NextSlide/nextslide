import React, { createContext, useContext, useState, useCallback } from 'react';

// Define the context type
export interface ComponentStateContextType {
  getState: (componentId: string) => any;
  updateState: (componentId: string, newState: any) => void;
  forceUpdate: (componentId: string) => void;
  clearState: (componentId: string) => void;
}

// Create the context with default values
const ComponentStateContext = createContext<ComponentStateContextType>({
  getState: () => ({}),
  updateState: () => {},
  forceUpdate: () => {},
  clearState: () => {}
});

// Custom hook for using the component state
export const useComponentInstance = (componentId: string) => {
  const { getState, updateState, forceUpdate, clearState } = useContext(ComponentStateContext);
  
  return {
    state: getState(componentId),
    updateState: (newState: any) => updateState(componentId, newState),
    forceUpdate: () => forceUpdate(componentId),
    clearState: () => clearState(componentId)
  };
};

// Provider component
export const ComponentStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Store component states in a map
  const [componentStates, setComponentStates] = useState<Record<string, any>>({});
  // Store update counters to force re-renders
  const [updateCounters, setUpdateCounters] = useState<Record<string, number>>({});
  
  // Get state for a specific component
  const getState = useCallback((componentId: string) => {
    return componentStates[componentId] || {};
  }, [componentStates]);
  
  // Update state for a specific component
  const updateState = useCallback((componentId: string, newState: any) => {
    setComponentStates(prev => {
      const currentState = prev[componentId] || {};
      const mergedState = {
        ...currentState,
        ...newState
      };
      
      // Only update if the state has actually changed
      if (JSON.stringify(currentState) === JSON.stringify(mergedState)) {
        return prev;
      }
      
      return {
        ...prev,
        [componentId]: mergedState
      };
    });
  }, []);
  
  // Force a component to update by incrementing its counter
  const forceUpdate = useCallback((componentId: string) => {
    setUpdateCounters(prev => ({
      ...prev,
      [componentId]: (prev[componentId] || 0) + 1
    }));
  }, []);
  
  // Clear state for a specific component
  const clearState = useCallback((componentId: string) => {
    setComponentStates(prev => {
      const newStates = { ...prev };
      delete newStates[componentId];
      return newStates;
    });
    setUpdateCounters(prev => {
      const newCounters = { ...prev };
      delete newCounters[componentId];
      return newCounters;
    });
  }, []);
  
  return (
    <ComponentStateContext.Provider value={{ getState, updateState, forceUpdate, clearState }}>
      {children}
    </ComponentStateContext.Provider>
  );
}; 