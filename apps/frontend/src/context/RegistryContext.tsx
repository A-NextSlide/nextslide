import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { sendRegistryToBackend, checkApiHealth, isRegistryLoadedOnServer } from '../utils/apiUtils';
import { registry } from '../registry';
import { BaseComponentSchema } from '../registry/base';
import { createLogger, LogCategory } from '../utils/logging';

// Types for registry send response
interface RegistrySendResponse {
  status: string;
  message: string;
  [key: string]: any;
}

// Types for the registry context
interface RegistryContextType {
  registry: {
    components: Record<string, any>;
    global: Record<string, any>;
    schemas: Record<string, any>;
  } | null;
  loading: boolean;
  error: string | null;
  refreshRegistry: () => void;
  sendRegistryToServer: () => Promise<RegistrySendResponse | void>;
  serverConnected: boolean;
  serverHasRegistry: boolean;
}

// Create the context with default values
const RegistryContext = createContext<RegistryContextType>({
  registry: null,
  loading: false,
  error: null,
  refreshRegistry: () => {},
  sendRegistryToServer: async () => {},
  serverConnected: false,
  serverHasRegistry: false,
});

// Custom hook for using the registry context
export const useRegistry = () => useContext(RegistryContext);

// Create a logger for the registry
const logger = createLogger(LogCategory.REGISTRY);

// Provider component
export const RegistryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [registryState, setRegistryState] = useState<RegistryContextType['registry']>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [registrySent, setRegistrySent] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [serverConnected, setServerConnected] = useState<boolean>(false);
  const [serverHasRegistry, setServerHasRegistry] = useState<boolean>(false);
  const [lastServerCheckTime, setLastServerCheckTime] = useState<number>(0);
  const [previousServerConnected, setPreviousServerConnected] = useState<boolean | null>(null);
  const [forceServerCheck, setForceServerCheck] = useState<boolean>(false);

  // Function to load registry data from TypeBox registry
  const loadLocalRegistry = () => {
    try {
      // Create a registry object from the TypeBox registry
      const components = {};
      const schemas = {};
      registry.getAllDefinitions().forEach(def => {
        // Store component for legacy format
        components[def.type] = {
          type: def.type,
          name: def.name,
          schema: def.schema,
          defaultProps: def.defaultProps,
          category: def.category || 'basic',
          renderer: def.renderer,
          editorComponent: def.editorComponent,
          // For compatibility with old code that expects editorSchema
          editorSchema: {}
        };
        
        // Store full TypeBox schema separately
        schemas[def.type] = {
          type: def.type,
          name: def.name,
          schema: def.schema,
          defaultProps: def.defaultProps,
          category: def.category || 'basic'
        };
      });
      
      const localRegistry = {
        components,
        global: BaseComponentSchema.properties,
        schemas
      };
      
      setRegistryState(localRegistry);
      return localRegistry;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load TypeBox registry';
      setError(errorMessage);
      logger.error('Error loading TypeBox registry:', errorMessage);
      return null;
    }
  };

  // Check server connectivity with rate limiting
  const checkServerStatus = useCallback(async (force = false) => {
    const now = Date.now();
    
    // Rate limit checks to every 5 seconds unless forced
    if (!force && now - lastServerCheckTime < 5000) {
      // Return the current values when rate-limited
      return { isConnected: serverConnected, hasRegistry: serverHasRegistry };
    }
    
    // Avoid updating state if component is unmounting
    if (!force && typeof window !== 'undefined' && (window as any).__isUnmounting) {
      return { isConnected: serverConnected, hasRegistry: serverHasRegistry };
    }
    
    setLastServerCheckTime(now);
    
    try {
      // Check if server is healthy
      const healthResponse = await checkApiHealth();
      const isConnected = healthResponse.status === 'healthy';
      const hasRegistry = healthResponse.registry_loaded;
      
      // Detect server restart: if we were disconnected and now we're connected,
      // or if we're connected but the registry status changed
      const serverRestarted = 
        (previousServerConnected === false && isConnected) || 
        (previousServerConnected === true && isConnected && serverHasRegistry !== hasRegistry);
      
      // Update previous connection state
      setPreviousServerConnected(isConnected);
      
      // Update current state
      setServerConnected(isConnected);
      setServerHasRegistry(hasRegistry);
      
      // If server restarted, reset registrySent flag to ensure we send again
      if (serverRestarted) {
        // console.log('Server restart detected, will re-send registry');
        setRegistrySent(false);
      }
      
      // If server connection status has changed or registry status has changed
      if (isConnected !== serverConnected || hasRegistry !== serverHasRegistry) {
        // Status change detected
      }
      
      return { isConnected, hasRegistry, serverRestarted };
    } catch (err) {
      logger.error('Error checking server status:', err);
      setServerConnected(false);
      setServerHasRegistry(false);
      return { isConnected: false, hasRegistry: false, serverRestarted: false };
    }
  }, [serverConnected, serverHasRegistry, lastServerCheckTime, previousServerConnected]);

  // Function to send registry data to the backend
  const sendRegistryToServer = async (force = false): Promise<RegistrySendResponse | void> => {
    // Safety checks to prevent duplicate sends if already known to be on server
    if (!force && serverHasRegistry && !loading) {
      // Skip sending as registry is already on server
      return { status: 'skipped', message: 'Registry already on server' };
    }
    
    if (isSending) {
      // Skip sending as a send is already in progress
      return { status: 'skipped', message: 'Send already in progress' };
    }

    try {
      setIsSending(true);
      
      // Use the current registry or load from local files
      const registryToSend = registryState || loadLocalRegistry();
      
      if (!registryToSend) {
        throw new Error('No registry data available to send');
      }
      
      // Check server status before sending, force check
      const { isConnected } = await checkServerStatus(true);
      if (!isConnected) {
        throw new Error('Server not connected');
      }
      
      // Include schemas in the registry data sent to backend
      const registryPayload = {
        ...registryToSend,
        source: 'frontend-init'
      };
      
      // Log sending TypeBox schemas
      if (registryPayload.schemas) {
        logger.debug(`Sending ${Object.keys(registryPayload.schemas).length} TypeBox schemas to server`);
      }
      
      // Sending registry to backend
      const response = await sendRegistryToBackend(registryPayload);
      
      // Registry successfully sent to backend
      setRegistrySent(true);
      setServerHasRegistry(true);
      
      return {
        ...response,
        status: 'success',
        message: 'Registry data sent successfully'
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send registry to backend';
      logger.error('Error sending registry to backend:', errorMessage);
      
      // Schedule a retry if it's a connection error
      if (errorMessage.includes('connection') || errorMessage.includes('network')) {
        // Connection error, schedule a forced check shortly
        setTimeout(() => setForceServerCheck(true), 5000);
      }
      
      throw err;
    } finally {
      setIsSending(false);
    }
  };

  // Function to refresh registry data from local files
  const refreshRegistry = () => {
    setLoading(true);
    setError(null);
    
    try {
      // Just load from local files
      loadLocalRegistry();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh registry';
      setError(errorMessage);
      logger.error('Error refreshing registry:', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Load registry data when application loads and set up health checks
  useEffect(() => {
    // Load the registry from local files
    refreshRegistry();
    
    // Set up less frequent health checks to reduce background processing
    const healthCheckInterval = setInterval(() => {
      // Skip health checks during drag operations or while unmounting/navigating
      if (typeof window !== 'undefined' && ((window as any).__isDragging || (window as any).__isUnmounting)) {
        return;
      }
      checkServerStatus();
    }, 45000); // Reduce frequency to 45s
    
    // Clean up interval on unmount
    return () => clearInterval(healthCheckInterval);
  }, []); // Empty dependency array to run only once on mount
  
  // Initial server check
  useEffect(() => {
    // Add a small delay to reduce initial request burst
    const timeout = setTimeout(() => {
      checkServerStatus(true);
    }, 1000); // 1 second delay
    
    return () => clearTimeout(timeout);
  }, []);
  
  // Handle forced server checks
  useEffect(() => {
    if (forceServerCheck) {
      // Performing forced server check
      checkServerStatus(true)
        .then(({ isConnected, hasRegistry }) => {
          if (isConnected && !hasRegistry) {
            // Server connected but registry missing on forced check
            return sendRegistryToServer(true);
          }
        })
        .catch(err => logger.error('Error during forced server check:', err))
        .finally(() => setForceServerCheck(false));
    }
  }, [forceServerCheck, checkServerStatus, sendRegistryToServer]);
  
  // Send registry when server connection or registry status changes
  useEffect(() => {
    const handleRegistrySend = async () => {
      // Skip if already sending
      if (isSending) return;
      
      // Skip if registry not loaded yet
      if (!registryState) return;
      
      // If server is connected but doesn't have the registry, and not already sending, send it
      if (serverConnected && !serverHasRegistry && !isSending) {
        // Server connected but missing registry, sending it now
        try {
          await sendRegistryToServer();
        } catch (err) {
          logger.error('Failed to send registry on server connection:', err);
          // Optionally trigger a forced check after error
          // setTimeout(() => setForceServerCheck(true), 5000);
        }
      }
    };
    
    handleRegistrySend();
  }, [serverConnected, serverHasRegistry, registryState, isSending, sendRegistryToServer]);

  // Effect to log when local registry is loaded, including server status
  useEffect(() => {
    if (registryState) { // Only log once the registry is actually loaded
      // Use a structured log through the logger instead of direct console.log
      // Registry loaded successfully
    }
  }, [registryState, serverConnected, serverHasRegistry]); // Depend on registry and server statuses

  return (
    <RegistryContext.Provider
      value={{
        registry: registryState,
        loading,
        error,
        refreshRegistry,
        sendRegistryToServer,
        serverConnected,
        serverHasRegistry,
      }}
    >
      {children}
    </RegistryContext.Provider>
  );
};

export default RegistryContext; 