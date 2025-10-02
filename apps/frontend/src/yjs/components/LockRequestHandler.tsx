/**
 * LockRequestHandler - Handles incoming lock requests
 */
import React, { useEffect, useState } from 'react';
import { useYjs } from '../YjsProvider';
import { LockRequest } from '../YjsTypes';

interface LockRequestNotificationProps {
  request: LockRequest;
  onApprove: () => void;
  onDeny: () => void;
}

/**
 * Component to display a single lock request notification
 */
const LockRequestNotification: React.FC<LockRequestNotificationProps> = ({
  request,
  onApprove,
  onDeny,
}) => (
  <div className="p-3 mb-2 bg-white rounded-lg shadow-md border border-gray-200">
    <div className="flex justify-between items-start">
      <div className="flex-1">
        <p className="font-medium text-sm">
          {request.userName} requested access
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Component on slide {request.slideId.substring(0, 8)}...
        </p>
      </div>
      <div className="flex space-x-2">
        <button
          onClick={onDeny}
          className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded"
        >
          Deny
        </button>
        <button
          onClick={onApprove}
          className="px-2 py-1 text-xs text-white bg-blue-500 hover:bg-blue-600 rounded"
        >
          Approve
        </button>
      </div>
    </div>
  </div>
);

/**
 * Component that listens for and handles lock requests
 */
export const LockRequestHandler: React.FC = () => {
  const { 
    docManager, 
    approveLockRequest, 
    denyLockRequest, 
    clientId 
  } = useYjs();
  
  const [pendingRequests, setPendingRequests] = useState<LockRequest[]>([]);
  
  // Listen for lock request events
  useEffect(() => {
    if (!docManager) return;
    
    const handleLockRequest = ({ request, currentLock }: {
      request: LockRequest;
      currentLock: any;
    }) => {
      // Only handle requests for components we own
      if (currentLock && currentLock.clientId === clientId) {
        setPendingRequests(prev => [...prev, request]);
      }
    };
    
    docManager.on('lock-requested', handleLockRequest);
    
    return () => {
      docManager.off('lock-requested', handleLockRequest);
    };
  }, [docManager, clientId]);
  
  // Handle approval
  const handleApprove = (request: LockRequest) => {
    approveLockRequest(request.slideId, request.componentId, request.userId);
    setPendingRequests(prev => 
      prev.filter(r => 
        r.componentId !== request.componentId || 
        r.slideId !== request.slideId || 
        r.userId !== request.userId
      )
    );
  };
  
  // Handle denial
  const handleDeny = (request: LockRequest) => {
    denyLockRequest(request.slideId, request.componentId, request.userId);
    setPendingRequests(prev => 
      prev.filter(r => 
        r.componentId !== request.componentId || 
        r.slideId !== request.slideId || 
        r.userId !== request.userId
      )
    );
  };
  
  // If no pending requests, don't render anything
  if (pendingRequests.length === 0) {
    return null;
  }
  
  return (
    <div className="fixed bottom-4 right-4 z-50 w-64">
      {pendingRequests.map((request, index) => (
        <LockRequestNotification
          key={`${request.slideId}:${request.componentId}:${request.userId}:${index}`}
          request={request}
          onApprove={() => handleApprove(request)}
          onDeny={() => handleDeny(request)}
        />
      ))}
    </div>
  );
};