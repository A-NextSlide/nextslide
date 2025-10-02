/**
 * Hook for automatic component locking during interactions
 */
import { useEffect, useState } from 'react';
import { useYjs } from '../YjsProvider';
import { LockResponse } from '../YjsTypes';

interface UseComponentLockOptions {
  /** ID of the slide containing the component */
  slideId: string;
  
  /** ID of the component to lock */
  componentId: string;
  
  /** Whether to enable auto-locking (default: true) */
  enabled?: boolean;
  
  /** Auto-release timeout in milliseconds (default: 30000 - 30 seconds) */
  lockTimeout?: number;
  
  /** Whether to auto extend the lock during interaction (default: true) */
  autoExtend?: boolean;
  
  /** Interval for auto-extending the lock in milliseconds (default: 10000 - 10 seconds) */
  extendInterval?: number;
  
  /** Callback when the lock is acquired */
  onLockAcquired?: (response: LockResponse) => void;
  
  /** Callback when the lock fails to acquire */
  onLockFailed?: (response: LockResponse) => void;
  
  /** Callback when the lock is released */
  onLockReleased?: () => void;
}

/**
 * Hook for automatic component locking during interactions
 * 
 * This hook will automatically request a lock for a component when used,
 * and release it when the component is unmounted or options change.
 * 
 * Usage:
 * ```tsx
 * const { isLocked, isOwnLock, lockOwner } = useComponentLock({
 *   slideId: slide.id,
 *   componentId: component.id,
 * });
 * ```
 */
export const useComponentLock = ({
  slideId,
  componentId,
  enabled = true,
  lockTimeout = 30000,
  autoExtend = true,
  extendInterval = 10000,
  onLockAcquired,
  onLockFailed,
  onLockReleased
}: UseComponentLockOptions) => {
  // Get Yjs hooks
  const { 
    requestLock, 
    releaseLock, 
    isComponentLocked, 
    getComponentLock,
    extendLock,
    clientId
  } = useYjs();
  
  // Local state
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isOwnLock, setIsOwnLock] = useState<boolean>(false);
  const [lockOwner, setLockOwner] = useState<{userId: string; userName: string} | null>(null);
  const [acquireError, setAcquireError] = useState<string | null>(null);
  
  // Function to check and update lock status
  const updateLockStatus = () => {
    const locked = isComponentLocked(slideId, componentId);
    setIsLocked(locked);
    
    if (locked) {
      const lock = getComponentLock(slideId, componentId);
      const isOwn = lock?.clientId === clientId;
      setIsOwnLock(isOwn);
      
      if (lock && !isOwn) {
        setLockOwner({
          userId: lock.userId,
          userName: lock.userName
        });
      } else {
        setLockOwner(null);
      }
    } else {
      setIsOwnLock(false);
      setLockOwner(null);
    }
  };
  
  // Effect to acquire the lock
  useEffect(() => {
    let extensionInterval: NodeJS.Timeout | null = null;
    
    // Request the lock when the component mounts
    const acquireLock = async () => {
      if (!enabled) return;
      
      try {
        const response = await requestLock(slideId, componentId);
        
        if (response.granted) {
          setIsLocked(true);
          setIsOwnLock(true);
          setLockOwner(null);
          setAcquireError(null);
          
          // Call the onLockAcquired callback if provided
          if (onLockAcquired) {
            onLockAcquired(response);
          }
          
          // Set up auto-extension if enabled
          if (autoExtend) {
            extensionInterval = setInterval(() => {
              extendLock(slideId, componentId);
            }, extendInterval);
          }
        } else {
          setIsLocked(true);
          setIsOwnLock(false);
          setAcquireError(response.error || 'Failed to acquire lock');
          
          if (response.currentLockHolder) {
            setLockOwner(response.currentLockHolder);
          }
          
          // Call the onLockFailed callback if provided
          if (onLockFailed) {
            onLockFailed(response);
          }
        }
      } catch (err) {
        setAcquireError(`Error requesting lock: ${err.message}`);
        
        // Call the onLockFailed callback if provided
        if (onLockFailed) {
          onLockFailed({
            componentId,
            slideId,
            granted: false,
            error: err.message
          });
        }
      }
    };
    
    // Try to acquire the lock
    acquireLock();
    
    // Set up interval to check the lock status
    const statusInterval = setInterval(updateLockStatus, 1000);
    
    // Clean up
    return () => {
      if (extensionInterval) {
        clearInterval(extensionInterval);
      }
      
      clearInterval(statusInterval);
      
      // Release the lock when the component unmounts
      if (isOwnLock) {
        releaseLock(slideId, componentId);
        
        // Call the onLockReleased callback if provided
        if (onLockReleased) {
          onLockReleased();
        }
      }
    };
  }, [slideId, componentId, enabled]);
  
  // Function to manually release the lock
  const release = () => {
    if (isOwnLock) {
      const released = releaseLock(slideId, componentId);
      
      if (released) {
        setIsLocked(false);
        setIsOwnLock(false);
        
        // Call the onLockReleased callback if provided
        if (onLockReleased) {
          onLockReleased();
        }
      }
      
      return released;
    }
    
    return false;
  };
  
  return {
    isLocked,
    isOwnLock,
    lockOwner,
    acquireError,
    release,
    updateLockStatus
  };
};