import React, { useState, useEffect, useCallback } from 'react';
import { CompleteDeckData } from '../types/DeckTypes';
import ShardedCollaborationPanel from './ShardedCollaborationPanel';
import { UserPresence } from '../yjs/YjsTypes';
import { API_CONFIG } from '../config/environment';

interface CollaborativeDeckPanelProps {
  deckId: string;
  initialDeckData: CompleteDeckData;
  wsUrl?: string;
  children: React.ReactNode;
  onCollaborationStatusChange?: (status: 'connected' | 'connecting' | 'disconnected') => void;
  onUserListUpdate?: (users: UserPresence[]) => void;
}

const CollaborativeDeckPanel: React.FC<CollaborativeDeckPanelProps> = ({
  deckId,
  initialDeckData,
  wsUrl = API_CONFIG.WEBSOCKET_URL || 'wss://slide-websocket.onrender.com',
  children,
  onCollaborationStatusChange,
  onUserListUpdate,
}) => {
  const [connectedUsers, setConnectedUsers] = useState<UserPresence[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [collaborationEnabled, setCollaborationEnabled] = useState(true);
  const [visibleSlideIds, setVisibleSlideIds] = useState<string[]>([]);
  const [currentSlideId, setCurrentSlideId] = useState<string | null>(null);

  // Handle connection status changes
  useEffect(() => {
    onCollaborationStatusChange?.(connectionStatus);
  }, [connectionStatus, onCollaborationStatusChange]);

  // Function to handle updates to the user list
  const handleUserListUpdate = useCallback((users: UserPresence[]) => {
    setConnectedUsers(users);
    onUserListUpdate?.(users);
  }, [onUserListUpdate]);

  // Function to toggle collaboration on/off
  const toggleCollaboration = () => {
    setCollaborationEnabled(!collaborationEnabled);
    
    // If disabling, clear connected users
    if (collaborationEnabled) {
      setConnectedUsers([]);
      setConnectionStatus('disconnected');
    } else {
      // If enabling, set status to connecting until we get confirmation
      setConnectionStatus('connecting');
    }
  };

  // Function to trigger reconnection
  const handleReconnect = () => {
    setConnectionStatus('connecting');
    // The actual reconnection will be handled by the ShardedCollaborationPanel
    // when it detects the status change
  };

  // Function to update the visible slides
  const updateVisibleSlides = useCallback((slideId: string) => {
    setCurrentSlideId(slideId);
    setVisibleSlideIds([slideId]);
  }, []);

  // Update the current slide ID whenever the initialDeckData changes
  // and we don't have a current slide ID yet
  useEffect(() => {
    if (!currentSlideId && initialDeckData.slides.length > 0) {
      const firstSlideId = initialDeckData.slides[0].id;
      updateVisibleSlides(firstSlideId);
    }
  }, [initialDeckData, currentSlideId, updateVisibleSlides]);

  // Wrap the children with additional props if needed
  const childrenWithProps = React.Children.map(children, child => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child, {
        onSlideChange: (slideId: string) => {
          updateVisibleSlides(slideId);
        }
      });
    }
    return child;
  });

  return (
    <div className="collaborative-deck-panel">
      {collaborationEnabled ? (
        <ShardedCollaborationPanel
          deckId={deckId}
          initialDeckData={initialDeckData}
          wsUrl={wsUrl}
          onUserListUpdate={handleUserListUpdate}
        >
          {childrenWithProps}
        </ShardedCollaborationPanel>
      ) : (
        childrenWithProps
      )}
    </div>
  );
};

export default CollaborativeDeckPanel;