/**
 * Collaborative Cursors Component
 * 
 * Displays remote users' cursors on the slide canvas
 */
import React, { useEffect, useState } from 'react';
import { useYjs } from '../YjsProvider';
import { useShardedYjs } from '../ShardedYjsProvider';

interface CollaborativeCursorsProps {
  slideId: string;
  containerRef: React.RefObject<HTMLDivElement>;
}

interface RemoteCursor {
  id: string;
  color: string;
  name: string;
  position: { x: number; y: number };
}

export const CollaborativeCursors: React.FC<CollaborativeCursorsProps> = ({
  slideId,
  containerRef,
}) => {
  // Try to get users from the sharded provider first, fallback to regular Yjs provider
  const shardedYjs = useShardedYjs();
  const yjsProvider = useYjs();
  
  // Use the sharded provider if available, otherwise use the regular provider
  const users = shardedYjs.users.length > 0 ? shardedYjs.users : yjsProvider.users;
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);
  
  // Update cursors when users change
  useEffect(() => {
    if (!Array.isArray(users) || !slideId) {
      setCursors([]);
      return;
    }
    
    const filteredCursors = users
      .filter(user => {
        // Filter out cursors that are:
        // 1. The current user (self)
        // 2. On a different slide
        // 3. Have negative coordinates (indicating they left the slide)
        return !user.self && 
               user.cursor?.slideId === slideId && 
               Number(user.cursor?.x) >= 0 && 
               Number(user.cursor?.y) >= 0;
      })
      .map(user => ({
        id: user.id || 'unknown',
        color: user.color || '#000000',
        name: user.name || 'User',
        position: {
          x: Number(user.cursor?.x) || 0,
          y: Number(user.cursor?.y) || 0
        }
      }));
    
    setCursors(filteredCursors);
  }, [users, slideId]);
  
  // Don't render if no container reference
  if (!containerRef.current) {
    return null;
  }
  
  return (
    <div 
      className="pointer-events-none absolute inset-0 overflow-visible"
      aria-hidden="true"
      style={{
        zIndex: 9999,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none'
      }}
    >
      {cursors.map(cursor => (
        <div
          key={cursor.id}
          className="absolute"
          style={{
            transform: `translate(${cursor.position.x}px, ${cursor.position.y}px)`,
            zIndex: 10000, // Ensure each cursor has its own high z-index
            position: 'absolute'
          }}
          data-testid={`remote-cursor-${cursor.id}`}
        >
          {/* Cursor pointer shape - clean and smooth */}
          <svg
            width="22" 
            height="32" 
            viewBox="0 0 16 24" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            style={{ 
              color: cursor.color,
              filter: 'drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.2))'
            }}
          >
            <path
              d="M 0.75 0.5 L 0.75 15.5 C 4 11 5 10 11 10 L 0.75 0.5 Z"
              fill={cursor.color}
              stroke="#333333"
              strokeWidth="1"
            />
          </svg>
          
          {/* User label - with background color and white text */}
          <div
            className="ml-1 rounded-md px-2 py-0.5 text-xs font-medium text-white"
            style={{ 
              backgroundColor: cursor.color,
              position: 'absolute',
              left: '22px',
              top: '0px',
              opacity: 0.9,
              boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
              maxWidth: '100px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {cursor.name}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CollaborativeCursors;