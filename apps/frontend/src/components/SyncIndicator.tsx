
import React, { useState, useEffect } from 'react';
import { RotateCw, Wifi, WifiOff } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDeckStore } from '@/stores/deckStore';
import { API_CONFIG } from '@/config/environment';

interface SyncIndicatorProps {
  isSyncing: boolean;
  lastSyncTime: Date | null;
  realtimeEnabled?: boolean;
}

const SyncIndicator: React.FC<SyncIndicatorProps> = ({ 
  isSyncing, 
  lastSyncTime, 
  realtimeEnabled = false
}) => {
  const [recentUpdate, setRecentUpdate] = useState(false);
  const [yjsConnected, setYjsConnected] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);
  const [cursorCount, setCursorCount] = useState(0);
  
  // Get Yjs status from deck store
  const getYjsConnectionStatus = useDeckStore(state => (state as any).getYjsConnectionStatus);
  
  // Check Yjs connection status
  useEffect(() => {
    const checkYjsStatus = () => {
      const yjsStatus = getYjsConnectionStatus && getYjsConnectionStatus();
      
      // Only update if status has changed
      setYjsConnected(prevConnected => {
        const newConnected = yjsStatus?.isConnected || false;
        return prevConnected !== newConnected ? newConnected : prevConnected;
      });
      
      setConnectionInfo(prevInfo => {
        // Deep comparison to avoid unnecessary updates
        if (!yjsStatus && !prevInfo) return prevInfo;
        if (!yjsStatus) return null;
        if (!prevInfo) return yjsStatus;
        
        // Check if any property has changed
        const hasChanged = prevInfo.isConnected !== yjsStatus.isConnected ||
                          prevInfo.isEnabled !== yjsStatus.isEnabled ||
                          JSON.stringify(prevInfo) !== JSON.stringify(yjsStatus);
        
        return hasChanged ? yjsStatus : prevInfo;
      });

      // Count visible cursors
      const cursors = document.querySelectorAll('[data-testid^="remote-cursor-"]');
      setCursorCount(prevCount => {
        const newCount = cursors.length;
        return prevCount !== newCount ? newCount : prevCount;
      });
    };
    
    // Initial check
    checkYjsStatus();
    
    // Set up polling
    const interval = setInterval(checkYjsStatus, 2000);
    
    return () => clearInterval(interval);
  }, [getYjsConnectionStatus]);

  // Flash the indicator when new real-time updates occur
  useEffect(() => {
    if ((lastSyncTime && realtimeEnabled) || (yjsConnected && lastSyncTime)) {
      // Check if sync happened in the last 5 seconds
      const now = new Date();
      const diffMs = now.getTime() - lastSyncTime.getTime();
      if (diffMs < 5000) {
        setRecentUpdate(true);
        
        // Reset after the animation completes
        const timeout = setTimeout(() => {
          setRecentUpdate(false);
        }, 2000);
        
        return () => clearTimeout(timeout);
      }
    }
  }, [lastSyncTime, realtimeEnabled, yjsConnected]);

  // Format the last sync time
  const formatLastSync = () => {
    if (!lastSyncTime) return 'Never';
    
    // If synced within the last minute, show "Just now"
    const now = new Date();
    const diffMs = now.getTime() - lastSyncTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const hours = lastSyncTime.getHours();
    const minutes = lastSyncTime.getMinutes();
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  };

  const websocketUrl = API_CONFIG.WEBSOCKET_URL;

  return (
    <div className="flex items-center gap-2 text-xs text-foreground/80 dark:text-white/80">
      {isSyncing ? (
        <>
          <RotateCw className="h-3 w-3 animate-spin text-foreground dark:text-white" />
          <span>Syncing</span>
        </>
      ) : (
        <>
          <span className="text-foreground/70 dark:text-white/70">Synced {formatLastSync()}</span>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`transition-all duration-300 ${recentUpdate ? 'scale-125' : ''} relative`}>
                  {yjsConnected ? (
                    <Wifi className={`h-3 w-3 ${recentUpdate ? 'text-green-500 dark:text-green-400' : 'text-foreground/70 dark:text-white/70'}`} />
                  ) : (
                    <WifiOff className="h-3 w-3 text-foreground/50 dark:text-white/50" />
                  )}
                  {cursorCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-green-500 text-[8px] text-white">
                      {cursorCount}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="text-xs">
                  <p className="font-semibold">
                    {yjsConnected 
                      ? "Collaboration active" 
                      : "Collaboration disconnected"}
                  </p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    Using WebSocket URL: <code className="bg-muted px-1 rounded">{websocketUrl}</code>
                  </p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    {connectionInfo?.userCount || 0} connected user(s), {cursorCount} active cursor(s)
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      )}
    </div>
  );
};

export default SyncIndicator;
