import React, { useEffect, useState } from 'react';
import { DocumentShardManager } from '../yjs/DocumentShardManager';
import { UserPresence } from '../yjs/YjsTypes';
import { CompleteDeckData } from '../types/DeckTypes';
import { v4 as uuidv4 } from 'uuid';
import { API_CONFIG } from '../config/environment';

interface ShardedCollaborationPanelProps {
  deckId: string;
  initialDeckData: CompleteDeckData;
  wsUrl: string;
  onUserListUpdate?: (users: UserPresence[]) => void;
  children?: React.ReactNode;
}

const ShardedCollaborationPanel: React.FC<ShardedCollaborationPanelProps> = ({
  deckId,
  initialDeckData,
  wsUrl = API_CONFIG.WEBSOCKET_URL || 'wss://slide-websocket.onrender.com',
  onUserListUpdate,
  children
}) => {
  // Log the WebSocket URL being used
  console.log(`ShardedCollaborationPanel: Using WebSocket URL ${wsUrl}`);
  const [shardManager, setShardManager] = useState<DocumentShardManager | null>(null);
  const [connectedUsers, setConnectedUsers] = useState<UserPresence[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [visibleSlideIds, setVisibleSlideIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Initialize sharding manager on component mount
  useEffect(() => {
    // Generate a random user name and color
    const userName = `User-${uuidv4().substring(0, 8)}`;
    const userColor = getRandomColor();

    console.log(`[ShardedCollaborationPanel] Creating DocumentShardManager with URL: ${wsUrl}`);
    console.log(`[ShardedCollaborationPanel] Environment API_CONFIG.WEBSOCKET_URL is: ${API_CONFIG.WEBSOCKET_URL}`);

    const manager = new DocumentShardManager(
      deckId,
      userName,
      userColor,
      {
        wsUrl,
        maxLoadedDocuments: 5,
        debug: true
      }
    );

    // Set up event listeners
    manager.on('initialized', () => {
      console.log('[ShardedCollaborationPanel] Shard manager initialized');
      setIsInitialized(true);
    });

    manager.on('shard-loaded', ({ shardId, slideIds }) => {
      console.log(`[ShardedCollaborationPanel] Shard loaded: ${shardId} with ${slideIds.length} slides`);
      
      // Update user list when a shard is loaded
      if (visibleSlideIds.length > 0) {
        const firstVisibleSlide = visibleSlideIds[0];
        manager.getUsersForSlide(firstVisibleSlide)
          .then(users => {
            setConnectedUsers(users);
            onUserListUpdate?.(users);
          })
          .catch(err => {
            console.error('Error getting users for slide:', err);
          });
      }
    });

    manager.on('shard-error', ({ shardId, error }) => {
      console.error(`[ShardedCollaborationPanel] Shard error for ${shardId}:`, error);
      setError(`Error with shard ${shardId}: ${error}`);
    });

    // Initialize the manager with the initial deck data
    manager.initialize(initialDeckData.slides)
      .catch(err => {
        console.error('Error initializing shard manager:', err);
        setError(`Failed to initialize collaboration: ${err}`);
      });

    setShardManager(manager);

    // Clean up on unmount
    return () => {
      manager.destroy().catch(err => {
        console.error('Error destroying shard manager:', err);
      });
    };
  }, [deckId, initialDeckData.slides, wsUrl, onUserListUpdate]);

  // Update visible slides when they change
  useEffect(() => {
    if (shardManager && isInitialized && visibleSlideIds.length > 0) {
      shardManager.setVisibleSlides(visibleSlideIds)
        .then(() => {
          // Update user list for the first visible slide
          return shardManager.getUsersForSlide(visibleSlideIds[0]);
        })
        .then(users => {
          setConnectedUsers(users);
          onUserListUpdate?.(users);
        })
        .catch(err => {
          console.error('Error setting visible slides:', err);
        });
    }
  }, [shardManager, isInitialized, visibleSlideIds, onUserListUpdate]);

  // Update cursor position on mouse move
  useEffect(() => {
    if (!shardManager || !isInitialized || visibleSlideIds.length === 0) {
      return;
    }

    const currentSlideId = visibleSlideIds[0];
    
    const handleMouseMove = (event: MouseEvent) => {
      // Only track cursor every 100ms for performance
      if (shardManager && currentSlideId) {
        shardManager.updateCursor(currentSlideId, event.clientX, event.clientY)
          .catch(err => {
            console.error('Error updating cursor:', err);
          });
      }
    };

    // Throttled mouse move handler
    let lastMoveTime = 0;
    const throttledMouseMove = (event: MouseEvent) => {
      const now = Date.now();
      if (now - lastMoveTime > 100) { // 100ms throttle
        lastMoveTime = now;
        handleMouseMove(event);
      }
    };

    document.addEventListener('mousemove', throttledMouseMove);
    
    return () => {
      document.removeEventListener('mousemove', throttledMouseMove);
    };
  }, [shardManager, isInitialized, visibleSlideIds]);

  // Poll for updated user list periodically
  useEffect(() => {
    if (!shardManager || !isInitialized || visibleSlideIds.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      const currentSlideId = visibleSlideIds[0];
      if (currentSlideId) {
        shardManager.getUsersForSlide(currentSlideId)
          .then(users => {
            setConnectedUsers(users);
            onUserListUpdate?.(users);
          })
          .catch(err => {
            console.error('Error getting users for slide:', err);
          });
      }
    }, 5000); // Update every 5 seconds

    return () => {
      clearInterval(interval);
    };
  }, [shardManager, isInitialized, visibleSlideIds, onUserListUpdate]);

  // Helper to get a random color
  function getRandomColor(): string {
    const colors = [
      '#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5',
      '#2196F3', '#03A9F4', '#00BCD4', '#009688', '#4CAF50',
      '#8BC34A', '#CDDC39', '#FFEB3B', '#FFC107', '#FF9800',
      '#FF5722', '#795548', '#9E9E9E', '#607D8B'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // Function to set the visible slides (to be called by parent)
  const setCurrentVisibleSlides = (slideIds: string[]) => {
    setVisibleSlideIds(slideIds);
  };

  // Function to update a component (exposed to parent)
  const updateComponent = async (
    slideId: string,
    componentId: string,
    props: Record<string, any>
  ) => {
    if (!shardManager || !isInitialized) {
      console.warn('Cannot update component: Shard manager not initialized');
      return;
    }

    try {
      await shardManager.updateComponent(slideId, componentId, props);
    } catch (err) {
      console.error('Error updating component:', err);
      setError(`Failed to update component: ${err}`);
    }
  };

  // Function to add a component (exposed to parent)
  const addComponent = async (
    slideId: string,
    component: any
  ) => {
    if (!shardManager || !isInitialized) {
      console.warn('Cannot add component: Shard manager not initialized');
      return;
    }

    try {
      await shardManager.addComponent(slideId, component);
    } catch (err) {
      console.error('Error adding component:', err);
      setError(`Failed to add component: ${err}`);
    }
  };

  // Function to remove a component (exposed to parent)
  const removeComponent = async (
    slideId: string,
    componentId: string
  ) => {
    if (!shardManager || !isInitialized) {
      console.warn('Cannot remove component: Shard manager not initialized');
      return;
    }

    try {
      await shardManager.removeComponent(slideId, componentId);
    } catch (err) {
      console.error('Error removing component:', err);
      setError(`Failed to remove component: ${err}`);
    }
  };

  return (
    <div className="sharded-collaboration-panel">
      {error && (
        <div className="error-banner" style={{ background: '#ffecec', color: '#f44336', padding: '0.5rem', margin: '0.5rem 0' }}>
          {error}
        </div>
      )}
      
      {children}

      {/* User presence indicator */}
      <div className="user-presence-indicator" style={{ position: 'fixed', right: '1rem', bottom: '1rem' }}>
        <div style={{ fontSize: '0.8rem', marginBottom: '0.25rem' }}>
          {connectedUsers.length} user{connectedUsers.length !== 1 ? 's' : ''} connected
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {connectedUsers.map(user => (
            <div
              key={user.clientId}
              title={user.name}
              style={{
                width: '1.5rem',
                height: '1.5rem',
                borderRadius: '50%',
                backgroundColor: user.color || '#ccc',
                border: user.self ? '2px solid black' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '0.75rem'
              }}
            >
              {user.name.charAt(0).toUpperCase()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ShardedCollaborationPanel;