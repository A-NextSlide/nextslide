/**
 * LockDemo - Component for testing component locking
 */
import React, { useState } from 'react';
import { useYjs } from '../YjsProvider';
import { 
  ComponentLockIndicator, 
  LockedComponentsList 
} from './ComponentLockIndicator';
import { LockRequestHandler } from './LockRequestHandler';

/**
 * Lock Controls for a component
 */
interface LockControlsProps {
  slideId: string;
  componentId: string;
}

export const LockControls: React.FC<LockControlsProps> = ({
  slideId,
  componentId,
}) => {
  const { 
    isComponentLocked, 
    requestLock, 
    releaseLock, 
    getComponentLock,
    clientId
  } = useYjs();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const locked = isComponentLocked(slideId, componentId);
  const lock = getComponentLock(slideId, componentId);
  const isOwnLock = lock?.clientId === clientId;
  
  // Handle lock request
  const handleRequestLock = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await requestLock(slideId, componentId);
      
      if (!response.granted) {
        // If there's a current lock holder, show who has it locked
        if (response.currentLockHolder) {
          setError(`Locked by ${response.currentLockHolder.userName}`);
        } else {
          // Otherwise show the generic error or a default message
          setError(response.error || 'Unable to acquire lock');
        }
      }
    } catch (err) {
      setError('Could not request lock');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle lock release
  const handleReleaseLock = () => {
    setError(null);
    
    try {
      const released = releaseLock(slideId, componentId);
      
      if (!released) {
        setError('Failed to release lock');
      }
    } catch (err) {
      setError('Error releasing lock');
      console.error(err);
    }
  };
  
  return (
    <div className="mt-2 space-y-2">
      {error && (
        <div className="text-red-500 text-xs">
          {error}
        </div>
      )}
      
      {locked ? (
        isOwnLock ? (
          <button
            onClick={handleReleaseLock}
            disabled={loading}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground px-3 py-1 rounded text-sm"
          >
            Release Lock
          </button>
        ) : (
          <div className="text-muted-foreground text-sm flex items-center">
            <div 
              className="w-3 h-3 rounded-full mr-2" 
              style={{ backgroundColor: lock?.userColor || '#6b7280' }}
            />
            Locked by {lock?.userName || 'another user'}
          </div>
        )
      ) : (
        <button
          onClick={handleRequestLock}
          disabled={loading}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1 rounded text-sm"
        >
          {loading ? 'Requesting...' : 'Lock Component'}
        </button>
      )}
    </div>
  );
};

/**
 * Demo component for testing component locking
 */
export const LockDemo: React.FC = () => {
  // Generate demo components
  const demoComponents = [
    { id: 'demo-component-1', slideId: 'demo-slide-1', name: 'Header Text' },
    { id: 'demo-component-2', slideId: 'demo-slide-1', name: 'Main Image' },
    { id: 'demo-component-3', slideId: 'demo-slide-1', name: 'Button Group' },
    { id: 'demo-component-4', slideId: 'demo-slide-2', name: 'Chart' },
    { id: 'demo-component-5', slideId: 'demo-slide-2', name: 'Data Table' },
  ];
  
  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Component Locking Demo</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-background border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Demo Components</h2>
          <div className="space-y-4">
            {demoComponents.map(component => (
              <div 
                key={component.id} 
                className="border border-border rounded-md p-3 relative"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium">{component.name}</h3>
                    <div className="text-sm text-muted-foreground">
                      Slide: {component.slideId}
                    </div>
                  </div>
                  <ComponentLockIndicator
                    slideId={component.slideId}
                    componentId={component.id}
                  />
                </div>
                
                <LockControls
                  slideId={component.slideId}
                  componentId={component.id}
                />
              </div>
            ))}
          </div>
        </div>
        
        <div>
          <div className="bg-background border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">Currently Locked Components</h2>
            <LockedComponentsList />
          </div>
          
          <div className="mt-6 bg-background border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">Instructions</h2>
            <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
              <li>
                Open this page in multiple browser windows to simulate different users
              </li>
              <li>
                Click "Lock Component" to acquire a lock for a component
              </li>
              <li>
                When someone else requests a lock you own, you'll see a notification
              </li>
              <li>
                Locks automatically expire after 30 seconds of inactivity
              </li>
              <li>
                In the actual slide editor, components would be locked automatically during editing
              </li>
            </ul>
          </div>
        </div>
      </div>
      
      {/* Lock request handler - will show notifications */}
      <LockRequestHandler />
    </div>
  );
};