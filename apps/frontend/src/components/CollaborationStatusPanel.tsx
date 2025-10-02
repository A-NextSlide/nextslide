import React, { useEffect, useState } from 'react';
import { UserPresence } from '../yjs/YjsTypes';

interface CollaborationStatusPanelProps {
  connectedUsers: UserPresence[];
  connectionStatus: 'connected' | 'connecting' | 'disconnected';
  collaborationEnabled: boolean;
  onToggleCollaboration?: () => void;
  onReconnect?: () => void;
}

const CollaborationStatusPanel: React.FC<CollaborationStatusPanelProps> = ({
  connectedUsers,
  connectionStatus,
  collaborationEnabled,
  onToggleCollaboration,
  onReconnect
}) => {
  const [expandedUsers, setExpandedUsers] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipUser, setTooltipUser] = useState<UserPresence | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  
  // Status text and color based on connection status
  const getStatusInfo = () => {
    switch (connectionStatus) {
      case 'connected':
        return { text: 'Connected', color: '#4caf50' };
      case 'connecting':
        return { text: 'Connecting...', color: '#ff9800' };
      case 'disconnected':
        return { text: 'Disconnected', color: '#f44336' };
    }
  };
  
  const statusInfo = getStatusInfo();
  
  // Hide tooltip when component unmounts or dependencies change
  useEffect(() => {
    return () => {
      setTooltipVisible(false);
    };
  }, [connectedUsers]);
  
  // Handle mouse over user avatar to show tooltip
  const handleMouseOver = (user: UserPresence, event: React.MouseEvent) => {
    setTooltipUser(user);
    setTooltipPosition({ 
      x: event.clientX,
      y: event.clientY
    });
    setTooltipVisible(true);
  };
  
  // Handle mouse out to hide tooltip
  const handleMouseOut = () => {
    setTooltipVisible(false);
  };
  
  return (
    <div className="collaboration-status-panel" style={{
      position: 'fixed',
      bottom: '1rem',
      right: '1rem',
      backgroundColor: 'white',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
      borderRadius: '0.5rem',
      padding: '0.75rem',
      zIndex: 100,
      maxWidth: expandedUsers ? '300px' : '250px',
      transition: 'max-width 0.3s ease'
    }}>
      {/* Connection Status */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: '0.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ 
            width: '10px', 
            height: '10px', 
            borderRadius: '50%', 
            backgroundColor: statusInfo.color 
          }}></div>
          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{statusInfo.text}</span>
        </div>
        
        {/* Toggle Collaboration Button */}
        <button 
          onClick={onToggleCollaboration}
          style={{
            background: 'none',
            border: '1px solid #e0e0e0',
            borderRadius: '0.25rem',
            padding: '0.25rem 0.5rem',
            fontSize: '0.75rem',
            cursor: 'pointer',
            color: collaborationEnabled ? '#f44336' : '#4caf50'
          }}
        >
          {collaborationEnabled ? 'Disable' : 'Enable'}
        </button>
      </div>
      
      {/* Connected Users */}
      <div>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem'
        }}>
          <span style={{ fontSize: '0.75rem', color: '#666' }}>
            {connectedUsers.length} user{connectedUsers.length !== 1 ? 's' : ''} connected
          </span>
          <button 
            onClick={() => setExpandedUsers(!expandedUsers)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '0.75rem',
              color: '#2196f3',
              cursor: 'pointer',
              padding: '0.25rem'
            }}
          >
            {expandedUsers ? 'Show Less' : 'Show All'}
          </button>
        </div>
        
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap',
          gap: '0.5rem',
          maxHeight: expandedUsers ? '200px' : '40px',
          overflowY: expandedUsers ? 'auto' : 'hidden',
          transition: 'max-height 0.3s ease'
        }}>
          {connectedUsers.map(user => {
            const userAny = user as any; // Handle runtime properties
            return (
              <div
                key={userAny.id || userAny.clientId}
                onMouseOver={(e) => handleMouseOver(user, e)}
                onMouseOut={handleMouseOut}
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '50%',
                  backgroundColor: user.color || '#ccc',
                  border: userAny.self ? '2px solid black' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  position: 'relative'
                }}
              >
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Reconnect Button (Only when disconnected) */}
      {connectionStatus === 'disconnected' && (
        <button
          onClick={onReconnect}
          style={{
            width: '100%',
            background: '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: '0.25rem',
            padding: '0.5rem',
            marginTop: '0.75rem',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}
        >
          Reconnect
        </button>
      )}
      
      {/* User Tooltip */}
      {tooltipVisible && tooltipUser && (
        <div style={{
          position: 'fixed',
          top: tooltipPosition.y + 10,
          left: tooltipPosition.x + 10,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '0.5rem 0.75rem',
          borderRadius: '0.25rem',
          fontSize: '0.75rem',
          zIndex: 1000,
          pointerEvents: 'none',
          maxWidth: '200px'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{tooltipUser.name || 'Unknown User'}</div>
          <div>Client ID: {((tooltipUser as any).id || (tooltipUser as any).clientId || '').toString().substring(0, 8)}...</div>
          {(tooltipUser as any).self && <div style={{ fontStyle: 'italic', marginTop: '0.25rem' }}>You</div>}
        </div>
      )}
    </div>
  );
};

export default CollaborationStatusPanel;