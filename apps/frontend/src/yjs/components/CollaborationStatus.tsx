/**
 * Collaboration Status Component
 * 
 * Displays connection status and current collaborators
 */
import React from 'react';
import { useYjs } from '../YjsProvider';
import { Wifi, WifiOff, Users } from 'lucide-react';

interface CollaborationStatusProps {
  className?: string;
  showUsers?: boolean;
}

export const CollaborationStatus: React.FC<CollaborationStatusProps> = ({
  className = '',
  showUsers = true,
}) => {
  const { isConnected, users, isLoading } = useYjs();
  
  // Don't show anything until loaded
  if (isLoading) {
    return null;
  }
  
  // Safely filter out current user from collaborator count with error handling
  let otherUsers = [];
  try {
    if (Array.isArray(users)) {
      otherUsers = users.filter(user => user && !user.self);
    }
  } catch (err) {
    console.error("Error filtering users:", err);
  }
  
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Connection status */}
      <div className="flex items-center gap-1" aria-label="Connection Status">
        {isConnected ? (
          <Wifi className="h-4 w-4 text-green-500" />
        ) : (
          <WifiOff className="h-4 w-4 text-red-500" />
        )}
        <span className="text-xs">
          {isConnected ? 'Connected' : 'Offline'}
        </span>
      </div>
      
      {/* Collaborator count */}
      {showUsers && (
        <div className="flex items-center gap-1" aria-label="Collaborators">
          <Users className="h-4 w-4 text-gray-500" />
          <span className="text-xs">{otherUsers.length}</span>
          
          {/* User avatars */}
          {otherUsers.length > 0 && (
            <div className="flex -space-x-2">
              {otherUsers.slice(0, 3).map(user => (
                <div
                  key={user.id}
                  className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background"
                  style={{ backgroundColor: user.color || '#cbd5e1' }}
                  title={user.name}
                >
                  <span className="text-xs text-white">
                    {user.name.substring(0, 2).toUpperCase()}
                  </span>
                </div>
              ))}
              
              {/* Additional users indicator */}
              {otherUsers.length > 3 && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-gray-200">
                  <span className="text-xs">+{otherUsers.length - 3}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CollaborationStatus;