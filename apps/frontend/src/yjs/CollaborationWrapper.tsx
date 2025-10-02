/**
 * CollaborationWrapper Component
 * 
 * A higher-order component that provides Yjs collaboration features
 * to any part of the application.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { YjsProvider } from './YjsProvider';
import CollaborationStatusPanel from '../components/CollaborationStatusPanel';
import { useDeckStore } from '../stores/deckStore';
import { API_CONFIG } from '../config/environment';
import { UserPresence } from './YjsTypes';
import { useAuth } from '@/context/SupabaseAuthContext';
import { getAllAwarenessSources } from './utils/cursorUtils';

interface CollaborationWrapperProps {
  children: React.ReactNode;
  enabled?: boolean;
  wsUrl?: string;
  showPanel?: boolean;
}

/**
 * Wraps components with real-time collaboration functionality
 */
export function CollaborationWrapper({
  children,
  enabled = true,
  // Use the WebSocket URL from environment or fallback to production
  wsUrl = API_CONFIG.WEBSOCKET_URL || 'wss://slide-websocket.onrender.com',
  showPanel = true
}: CollaborationWrapperProps) {
  const deck = useDeckStore(state => state.deckData);
  const setupYjsCollaboration = useDeckStore(state => (state as any).setupYjsCollaboration);
  const disconnectYjsSync = useDeckStore(state => (state as any).disconnectYjsSync);
  
  // Local state for tracking collaboration
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [connectedUsers, setConnectedUsers] = useState<UserPresence[]>([]);
  const [collaborationEnabled, setCollaborationEnabled] = useState(enabled);
  
  // Prefer authenticated user's full name/email, fallback to local storage
  const { user } = useAuth();
  const [userName, setUserName] = useState<string>(() => {
    const fullName = user?.user_metadata?.full_name as string | undefined;
    const email = user?.email || '';
    if (fullName && fullName.trim()) return fullName.trim();
    if (email) return email;
    const storedName = localStorage.getItem('yjs-user-name');
    return storedName || 'Anonymous';
  });

  // Stable userId persisted in localStorage for presence consistency
  const userId = useMemo(() => {
    try {
      let id = localStorage.getItem('yjs-user-id');
      if (!id) {
        id = `user-${Math.floor(Math.random() * 100000)}`;
        localStorage.setItem('yjs-user-id', id);
      }
      return id;
    } catch {
      return `user-${Math.floor(Math.random() * 100000)}`;
    }
  }, []);
  
  // Get deck ID from store
  const deckId = useDeckStore(state => state.deckData?.uuid);
  
  // Get Yjs state from store
  const yjsConnected = useDeckStore(state => (state as any).yjsConnected);
  const yjsDocManager = useDeckStore(state => (state as any).yjsDocManager);
  const getYjsUsers = useDeckStore(state => (state as any).getYjsUsers);
  
  // Update connection status based on Yjs state
  useEffect(() => {
    if (yjsConnected) {
      setConnectionStatus('connected');
    } else if (yjsDocManager) {
      setConnectionStatus('connecting');
    } else {
      setConnectionStatus('disconnected');
    }
  }, [yjsConnected, yjsDocManager]);

  // React to auth user changes and update userName + persist
  useEffect(() => {
    const fullName = user?.user_metadata?.full_name as string | undefined;
    const email = user?.email || '';
    const storedName = (() => {
      try { return localStorage.getItem('yjs-user-name') || ''; } catch { return ''; }
    })();
    const computed = (fullName && fullName.trim()) || email || storedName || 'Anonymous';
    if (computed && computed !== userName) {
      setUserName(computed);
      try { if (storedName !== computed) localStorage.setItem('yjs-user-name', computed); } catch {}
    }
  }, [user, userName]);
  
  // Update connected users when connected
  useEffect(() => {
    if (yjsConnected && getYjsUsers) {
      const updateUsers = () => {
        const users = getYjsUsers();
        // Only update if users have actually changed
        setConnectedUsers(prevUsers => {
          // Deep comparison of user arrays
          if (!users || !Array.isArray(users)) return prevUsers;
          
          if (prevUsers.length !== users.length) {
            return users;
          }
          
          // Check if any user has changed
          const hasChanged = users.some((user, idx) => {
            const prevUser = prevUsers[idx];
            return !prevUser || 
                   prevUser.id !== user.id ||
                   prevUser.name !== user.name ||
                   prevUser.color !== user.color;
          });
          
          return hasChanged ? users : prevUsers;
        });
      };
      
      // Update users immediately
      updateUsers();
      
      // Also set up an interval to update users periodically
      const interval = setInterval(updateUsers, 2000);
      
      return () => clearInterval(interval);
    }
  }, [yjsConnected, getYjsUsers]);
  
  // Initialize collaboration when component mounts
  useEffect(() => {
    if (!collaborationEnabled || !enabled || !deckId || !setupYjsCollaboration) return;
    
    // Setup Yjs collaboration (run once per deck/session; userName is propagated separately)
    const cleanupFn = setupYjsCollaboration({
      deckId,
      wsUrl,
      userName,
      autoConnect: true
    });
    
    // Clean up when component unmounts
    return cleanupFn;
  }, [collaborationEnabled, enabled, deckId, wsUrl, setupYjsCollaboration]);

  // Push latest userName into all awareness sources without reconnecting
  useEffect(() => {
    try {
      const sources = getAllAwarenessSources?.() || [];
      sources.forEach((awareness: any) => {
        if (!awareness || typeof awareness.getLocalState !== 'function' || typeof awareness.setLocalStateField !== 'function') return;
        const state = awareness.getLocalState() || {};
        const existingUser = state.user || {};
        if (existingUser.name !== userName) {
          awareness.setLocalStateField('user', {
            id: existingUser.id || userId,
            name: userName,
            color: existingUser.color || '#3f51b5'
          });
          awareness.setLocalStateField('lastUpdate', Date.now());
        }
      });
    } catch {}
  }, [userName, userId, yjsConnected, yjsDocManager]);
  
  // Clean up when component unmounts or becomes disabled
  useEffect(() => {
    return () => {
      if (!collaborationEnabled || !enabled) {
        // Disconnect if collaboration becomes disabled
        if (disconnectYjsSync) {
          disconnectYjsSync();
        }
      }
    };
  }, [collaborationEnabled, enabled, disconnectYjsSync]);
  
  // Toggle collaboration
  const handleToggleCollaboration = () => {
    setCollaborationEnabled(!collaborationEnabled);
    if (!collaborationEnabled && setupYjsCollaboration && deckId) {
      // Enable collaboration
      setupYjsCollaboration({
        deckId,
        wsUrl,
        userName,
        autoConnect: true
      });
    } else if (collaborationEnabled) {
      // Disable collaboration
      if (disconnectYjsSync) {
        disconnectYjsSync();
      }
    }
  };
  
  // Handle reconnect
  const handleReconnect = () => {
    if (setupYjsCollaboration && deckId) {
      setupYjsCollaboration({
        deckId,
        wsUrl,
        userName,
        autoConnect: true
      });
    }
  };
  
  // If not enabled or no deck ID, just render children
  if (!enabled || !deckId) {
    return <>{children}</>;
  }
  
  // If we're using integrated collaboration with the deck store
  if (setupYjsCollaboration) {
    return (
      <>
        {children}
        {showPanel && (
          <CollaborationStatusPanel
            connectedUsers={connectedUsers}
            connectionStatus={connectionStatus}
            collaborationEnabled={collaborationEnabled}
            onToggleCollaboration={handleToggleCollaboration}
            onReconnect={handleReconnect}
          />
        )}
      </>
    );
  }
  
  // Fallback to standalone YjsProvider if needed
  return (
    <YjsProvider
      docId={deckId}
      wsUrl={wsUrl}
      userId={userId}
      userName={userName}
      autoConnect={true}
    >
      {children}
      {showPanel && (
        <CollaborationStatusPanel
          connectedUsers={connectedUsers}
          connectionStatus={connectionStatus}
          collaborationEnabled={collaborationEnabled}
          onToggleCollaboration={handleToggleCollaboration}
          onReconnect={handleReconnect}
        />
      )}
    </YjsProvider>
  );
}

export default CollaborationWrapper;