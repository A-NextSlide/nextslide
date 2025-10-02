import React, { createContext, useRef, useContext, useState, ReactNode } from 'react';

type ChartInstanceMap = Map<string, any>;

interface ChartInstanceContextType {
  instances: ChartInstanceMap;
  registerInstance: (id: string, instance: any) => void;
  getInstance: (id: string) => any;
  clearUnusedInstances: (activeIds: string[]) => void;
}

const ChartInstanceContext = createContext<ChartInstanceContextType | null>(null);

export const ChartInstanceProvider: React.FC<{children: ReactNode}> = ({children}) => {
  const instancesRef = useRef<ChartInstanceMap>(new Map());
  const [, forceUpdate] = useState({});
  
  const registerInstance = (id: string, instance: any) => {
    instancesRef.current.set(id, instance);
  };
  
  const getInstance = (id: string) => {
    return instancesRef.current.get(id);
  };
  
  const clearUnusedInstances = (activeIds: string[]) => {
    const activeIdSet = new Set(activeIds);
    instancesRef.current.forEach((_, id) => {
      if (!activeIdSet.has(id)) {
        instancesRef.current.delete(id);
      }
    });
    forceUpdate({});
  };
  
  return (
    <ChartInstanceContext.Provider value={{
      instances: instancesRef.current,
      registerInstance,
      getInstance,
      clearUnusedInstances
    }}>
      {children}
    </ChartInstanceContext.Provider>
  );
};

export const useChartInstances = () => {
  const context = useContext(ChartInstanceContext);
  if (!context) {
    throw new Error('useChartInstances must be used within a ChartInstanceProvider');
  }
  return context;
};
