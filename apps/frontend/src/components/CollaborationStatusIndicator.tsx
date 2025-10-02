/**
 * CollaborationStatusIndicator - Compact collaboration status for the header
 * 
 * A minimal version of the collaboration status that fits in the DeckHeader
 */
import React, { useMemo, useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar } from '@/components/ui/avatar';
import { useYjs } from '@/yjs/YjsProvider';
import { useShardedYjs } from '@/yjs/ShardedYjsProvider';

interface CollaborationStatusIndicatorProps {
  className?: string;
}

export function CollaborationStatusIndicator({ className = '' }: CollaborationStatusIndicatorProps) {
  // Try to get users from both providers
  const standardYjs = useYjs();
  const shardedYjs = useShardedYjs();
  
  // Track users with state to ensure updates
  const [users, setUsers] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  
  // Update users when either provider changes
  useEffect(() => {
    const getUsers = () => {
      // Prefer sharded users if available
      if (Array.isArray(shardedYjs?.users) && shardedYjs.users.length > 0) {
        return shardedYjs.users;
      }
      
      // Fall back to standard provider
      if (Array.isArray(standardYjs?.users)) {
        return standardYjs.users;
      }
      
      return [];
    };
    
    // Get connection status
    const getConnectionStatus = () => {
      return shardedYjs?.isConnected || standardYjs?.isConnected || false;
    };
    
    // Update state
    setUsers(getUsers());
    setIsConnected(getConnectionStatus());
    
    // Set up a refreshing interval for UI updates
    // This ensures we always show the latest user status
    const interval = setInterval(() => {
      setUsers(getUsers());
      setIsConnected(getConnectionStatus());
    }, 1000);
    
    return () => clearInterval(interval);
  }, [standardYjs, shardedYjs]);
  
  // Don't render if no connection and no users
  if (!isConnected && users.length === 0) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`flex items-center gap-1.5 ${className}`}>
          <Badge 
            variant={isConnected ? "success" : "destructive"}
            className="h-2 w-2 rounded-full p-0"
          />
          
          {/* Show up to 3 user avatars */}
          {users.length > 0 ? (
            <div className="flex -space-x-2">
              {users.slice(0, 3).map(user => (
                <Avatar 
                  key={user.id} 
                  className="h-5 w-5 border border-background" 
                  style={{ backgroundColor: user.color }}
                >
                  <span className="text-[8px] text-white font-medium">
                    {user.name?.substring(0, 2).toUpperCase() || 'U'}
                  </span>
                </Avatar>
              ))}
              
              {/* Show count for additional users */}
              {users.length > 3 && (
                <span className="text-xs ml-1">
                  +{users.length - 3}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs">No users</span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <div className="text-xs">
          <p>Collaboration: {isConnected ? 'Connected' : 'Disconnected'}</p>
          <p>{users.length} user{users.length !== 1 ? 's' : ''} collaborating</p>
          {users.length > 0 && (
            <ul className="mt-1 pl-4 space-y-1">
              {users.map(user => (
                <li key={user.id} className="flex items-center gap-1">
                  <div 
                    className="h-2 w-2 rounded-full" 
                    style={{ backgroundColor: user.color }}
                  ></div>
                  {user.name || 'Unknown User'}
                  {user.self && <span className="text-muted-foreground ml-1">(you)</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export default CollaborationStatusIndicator;