import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ComponentInstance } from '@/types/components';

/**
 * Interface for options passed to the useComponentOptimization hook
 */
interface UseComponentOptimizationOptions {
  /**
   * The component to optimize
   */
  component: ComponentInstance;
  
  /**
   * Callback when component data changes
   */
  onChange?: (updates: Partial<ComponentInstance>) => void;
  
  /**
   * Whether to enable expensive rendering optimizations
   */
  enableCaching?: boolean;
  
  /**
   * Time in ms to debounce rapid property changes
   */
  debounceTime?: number;
  
  /**
   * Whether to memoize the component render output
   */
  memoizeOutput?: boolean;
}

/**
 * A hook that provides optimization techniques for components
 * - Debounces rapid changes to properties
 * - Caches expensive computations
 * - Defers non-critical updates
 * - Memoizes render output
 * 
 * @param options Configuration options for the optimization
 * @returns Optimized handlers and state
 */
export const useComponentOptimization = ({
  component,
  onChange,
  enableCaching = true,
  debounceTime = 50,
  memoizeOutput = true
}: UseComponentOptimizationOptions) => {
  // Ref to check if component has changed
  const prevComponentRef = useRef<ComponentInstance>(component);
  
  // State for debounced updates
  const [debouncedComponent, setDebouncedComponent] = useState<ComponentInstance>(component);
  
  // Refs for debounce handling
  const debounceTimerRef = useRef<number | null>(null);
  const pendingChangesRef = useRef<Partial<ComponentInstance["props"]>>({});
  
  // Cache for expensive computations
  const computationCache = useRef<Record<string, any>>({});
  
  // Detect component changes
  useEffect(() => {
    if (component !== prevComponentRef.current) {
      setDebouncedComponent(component);
      prevComponentRef.current = component;
      // Clear any pending changes when component changes externally
      pendingChangesRef.current = {};
      // Clear the computation cache when component changes
      if (enableCaching) {
        computationCache.current = {};
      }
    }
  }, [component, enableCaching]);
  
  /**
   * Performs an expensive computation with caching
   * @param key Unique key for the computation
   * @param computeFn The expensive computation function
   * @param dependencies Array of dependencies that should invalidate the cache
   * @returns The computed value
   */
  const cachedComputation = useCallback(
    <T>(key: string, computeFn: () => T, dependencies: any[] = []): T => {
      if (!enableCaching) {
        return computeFn();
      }
      
      // Generate a cache key based on the provided key and dependencies
      const dependencyHash = dependencies.map(dep => 
        typeof dep === 'object' ? JSON.stringify(dep) : String(dep)
      ).join('|');
      
      const cacheKey = `${key}:${dependencyHash}`;
      
      // Check if we have a cached result
      if (computationCache.current[cacheKey] !== undefined) {
        return computationCache.current[cacheKey] as T;
      }
      
      // Perform the computation and cache the result
      const result = computeFn();
      computationCache.current[cacheKey] = result;
      
      return result;
    },
    [enableCaching]
  );
  
  /**
   * Handle property changes with debouncing
   */
  const handlePropChange = useCallback(
    (propName: string, value: any) => {
      // Add to pending changes
      pendingChangesRef.current[propName] = value;
      
      // Clear existing timer
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      
      // Set new timer
      debounceTimerRef.current = window.setTimeout(() => {
        // Only trigger if component hasn't changed externally
        if (prevComponentRef.current === component && onChange) {
          const updates = {
            ...component,
            props: {
              ...component.props,
              ...pendingChangesRef.current
            }
          };
          
          // Update the debounced state
          setDebouncedComponent(updates);
          
          // Call the onChange prop with the batched updates
          onChange({
            props: pendingChangesRef.current
          });
          
          // Clear pending changes
          pendingChangesRef.current = {};
        }
        
        debounceTimerRef.current = null;
      }, debounceTime);
    },
    [component, debounceTime, onChange]
  );
  
  /**
   * Cancel any pending property changes
   */
  const cancelPendingChanges = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingChangesRef.current = {};
  }, []);
  
  /**
   * Force apply any pending changes immediately
   */
  const applyPendingChanges = useCallback(() => {
    if (Object.keys(pendingChangesRef.current).length > 0 && onChange) {
      onChange({
        props: pendingChangesRef.current
      });
      
      // Update the debounced state
      setDebouncedComponent({
        ...component,
        props: {
          ...component.props,
          ...pendingChangesRef.current
        }
      });
      
      // Clear pending changes
      pendingChangesRef.current = {};
      
      // Clear any existing timer
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    }
  }, [component, onChange]);
  
  /**
   * Clear the computation cache
   */
  const clearCache = useCallback(() => {
    computationCache.current = {};
  }, []);
  
  /**
   * Memoized component prop data
   */
  const memoizedProps = useMemo(() => {
    return debouncedComponent.props;
  }, [debouncedComponent.props]);
  
  /**
   * Check if there are pending changes
   */
  const hasPendingChanges = useMemo(() => {
    return Object.keys(pendingChangesRef.current).length > 0;
  }, [pendingChangesRef.current]);
  
  // Return optimized utilities
  return {
    // The latest component props with debouncing applied
    props: memoizeOutput ? memoizedProps : debouncedComponent.props,
    // Handler for prop changes with debouncing
    handlePropChange,
    // Function to perform expensive computations with caching
    cachedComputation,
    // Cancel any pending changes
    cancelPendingChanges,
    // Apply pending changes immediately
    applyPendingChanges,
    // Clear the computation cache
    clearCache,
    // Check if there are pending changes
    hasPendingChanges
  };
}; 