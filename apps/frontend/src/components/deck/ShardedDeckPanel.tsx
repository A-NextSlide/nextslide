import React, { useEffect, useState, useCallback } from 'react';
import { CompleteDeckData } from '../../types/DeckTypes';
import CollaborativeDeckPanel from '../CollaborativeDeckPanel';
import { UserPresence } from '../../yjs/YjsTypes';
import { v4 as uuidv4 } from 'uuid';
import { API_CONFIG } from '../../config/environment';

interface ShardedDeckPanelProps {
  deckId?: string;
  initialDeckData: CompleteDeckData;
  wsUrl?: string;
  showCollaborationStatus?: boolean;
}

/**
 * ShardedDeckPanel - A deck panel with sharded collaboration support
 * 
 * This component combines the standard DeckPanel with sharded collaboration
 * using document sharding for improved performance with large presentations.
 */
const ShardedDeckPanel: React.FC<ShardedDeckPanelProps> = ({
  deckId,
  initialDeckData,
  wsUrl = API_CONFIG.WEBSOCKET_URL || 'wss://slide-websocket.onrender.com',
  showCollaborationStatus = true
}) => {
  // Use provided deckId or fallback to deck UUID or generate a new one
  const actualDeckId = deckId || initialDeckData.uuid || uuidv4();
  
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [connectedUsers, setConnectedUsers] = useState<UserPresence[]>([]);
  const [isCollaborating, setIsCollaborating] = useState(false);
  
  // Handle connection status changes
  const handleConnectionStatusChange = useCallback((status: 'connected' | 'connecting' | 'disconnected') => {
    setConnectionStatus(status);
    setIsCollaborating(status === 'connected');
  }, []);
  
  // Handle user list updates
  const handleUserListUpdate = useCallback((users: UserPresence[]) => {
    setConnectedUsers(users);
  }, []);
  
  // Log collaboration status for debugging
  useEffect(() => {
    console.log(`ShardedDeckPanel: Collaboration ${isCollaborating ? 'enabled' : 'disabled'}, status: ${connectionStatus}, ${connectedUsers.length} users connected`);
  }, [isCollaborating, connectionStatus, connectedUsers.length]);
  
  return (
    <CollaborativeDeckPanel
      deckId={actualDeckId}
      initialDeckData={initialDeckData}
      wsUrl={wsUrl}
      onCollaborationStatusChange={handleConnectionStatusChange}
      onUserListUpdate={handleUserListUpdate}
    />
  );
};

export default ShardedDeckPanel;