/**
 * ComponentLockIndicator - Visual indicator for component locks
 */
import React from 'react';
import { useYjs } from '../YjsProvider';

interface ComponentLockIndicatorProps {
  slideId: string;
  componentId: string;
  className?: string;
}

/**
 * Visual indicator that shows when a component is locked by a user
 */
export const ComponentLockIndicator: React.FC<ComponentLockIndicatorProps> = ({
  slideId,
  componentId,
  className = '',
}) => {
  const { 
    isComponentLocked, 
    getComponentLock, 
    clientId 
  } = useYjs();
  
  const isLocked = isComponentLocked(slideId, componentId);
  
  // If not locked, don't render anything
  if (!isLocked) {
    return null;
  }
  
  const lock = getComponentLock(slideId, componentId);
  
  // If we own the lock, show a different indicator
  const isOwnLock = lock?.clientId === clientId;
  
  return (
    <div 
      className={`absolute top-0 right-0 p-1 z-50 ${className}`}
      style={{ pointerEvents: 'none' }}
    >
      <div 
        className="flex items-center justify-center rounded-full p-1 text-xs"
        style={{ 
          backgroundColor: lock?.userColor || '#6b7280',
          color: getContrastColor(lock?.userColor || '#6b7280'),
          border: '1px solid white',
          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          width: '24px',
          height: '24px'
        }}
        title={isOwnLock 
          ? 'Locked by you' 
          : `Locked by ${lock?.userName || 'another user'}`
        }
      >
        <LockIcon size={14} />
      </div>
    </div>
  );
};

/**
 * Component to display current locked components in a slide
 */
export const SlideLockIndicators: React.FC<{
  slideId: string;
  containerRef: React.RefObject<HTMLElement>;
}> = ({ slideId, containerRef }) => {
  const { getAllLocks } = useYjs();
  
  // Get locks for this slide
  const locks = getAllLocks().filter(lock => lock.slideId === slideId);
  
  if (locks.length === 0 || !containerRef.current) {
    return null;
  }
  
  return (
    <div className="absolute inset-0 pointer-events-none">
      {locks.map(lock => (
        <ComponentLockIndicator
          key={lock.componentId}
          slideId={lock.slideId}
          componentId={lock.componentId}
        />
      ))}
    </div>
  );
};

/**
 * Component that shows a list of locked components
 */
export const LockedComponentsList: React.FC = () => {
  const { getAllLocks, releaseLock, clientId } = useYjs();
  
  const locks = getAllLocks();
  
  if (locks.length === 0) {
    return (
      <div className="p-4 text-gray-500 text-center">
        No locked components
      </div>
    );
  }
  
  return (
    <div className="max-h-48 overflow-y-auto">
      <ul className="divide-y divide-gray-100">
        {locks.map(lock => {
          const isOwnLock = lock.clientId === clientId;
          
          return (
            <li key={`${lock.slideId}:${lock.componentId}`} className="p-2 flex items-center">
              <div 
                className="w-3 h-3 rounded-full mr-2" 
                style={{ backgroundColor: lock.userColor }}
              />
              <div className="flex-1 text-sm">
                <span className="font-medium">{lock.userName}</span>
                {isOwnLock ? ' (you)' : ''}
                <div className="text-xs text-gray-500">
                  Slide: {lock.slideId.substring(0, 8)}...
                </div>
              </div>
              
              {isOwnLock && (
                <button
                  className="text-xs text-blue-500 hover:text-blue-700"
                  onClick={() => releaseLock(lock.slideId, lock.componentId)}
                >
                  Release
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/**
 * Simple lock icon component
 */
const LockIcon: React.FC<{size?: number}> = ({ size = 16 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M19 10h-1V7c0-3.3-2.7-6-6-6S6 3.7 6 7v3H5c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-8c0-1.1-.9-2-2-2zm-8 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM8 7c0-2.2 1.8-4 4-4s4 1.8 4 4v3H8V7z" />
  </svg>
);

/**
 * Calculate a contrasting text color (black/white) for a background color
 */
function getContrastColor(hexColor: string): string {
  // Default to black if invalid color
  if (!hexColor.startsWith('#') || hexColor.length !== 7) {
    return '#000000';
  }

  // Convert hex to RGB
  const r = parseInt(hexColor.substring(1, 3), 16);
  const g = parseInt(hexColor.substring(3, 5), 16);
  const b = parseInt(hexColor.substring(5, 7), 16);
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return black for light colors, white for dark colors
  return luminance > 0.5 ? '#000000' : '#ffffff';
}