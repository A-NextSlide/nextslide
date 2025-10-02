import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { IconButton } from '../ui/IconButton';
import { Edit, Plus, ChevronLeft, Undo, Redo, History, ZoomIn, ZoomOut, Search, Users, RefreshCw, Edit3, Undo2, Redo2, Presentation, HelpCircle, Menu, NotepadText, FileJson, Layers, UploadCloud, Sun, Moon, MessageSquare, Type } from 'lucide-react';
import { useVersionHistory } from '@/context/VersionHistoryContext';
import { useEditorSettingsStore } from '@/stores/editorSettingsStore';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import SyncIndicator from '../SyncIndicator';
// ModeToggle removed from header surface; theme options moved into actions menu
import { useYjs } from '@/yjs/YjsProvider';
import { useShardedYjs } from '@/yjs/ShardedYjsProvider';
import { Badge } from '../ui/badge';
import { Avatar } from '../ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { useDeckStore } from '@/stores/deckStore';
import { DeckStatus } from '@/types/DeckTypes';
import { usePresentationStore } from '@/stores/presentationStore';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { useTheme } from "next-themes";
import { extractDeckComponents } from '@/lib/componentExtractor';
import { googleIntegrationApi } from '@/services/googleIntegrationApi';
import { useToast } from '@/hooks/use-toast';

interface DeckHeaderProps {
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  handleAddNewSlide: () => void;
  deckName: string;
  setDeckName: (name: string) => void;
  handleUndo?: () => void;
  handleRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  rightSideComponents?: React.ReactNode;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  realtimeEnabled: boolean;
  deckStatus?: DeckStatus | null;
}

const DeckHeader: React.FC<DeckHeaderProps> = ({
  isEditing,
  setIsEditing,
  handleAddNewSlide,
  deckName,
  setDeckName,
  handleUndo,
  handleRedo,
  canUndo = false,
  canRedo = false,
  rightSideComponents,
  isSyncing,
  lastSyncTime,
  realtimeEnabled,
  deckStatus
}) => {
  const navigate = useNavigate();
  const { isHistoryPanelOpen, setHistoryPanelOpen } = useVersionHistory();
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [isChatSelecting, setIsChatSelecting] = useState(false);
  const { setTheme } = useTheme();
  const deckData = useDeckStore(state => state.deckData);
  const [isExporting, setIsExporting] = useState(false);
  // Removed font optimization state
  const { toast } = useToast();
  
  // Get Yjs status from deck store
  const getYjsConnectionStatus = useDeckStore(state => (state as any).getYjsConnectionStatus);
  const getYjsUsers = useDeckStore(state => (state as any).getYjsUsers);
  
  // Track users with state
  const [users, setUsers] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  
  // Update collaboration status
  const updateCollaborationStatus = useCallback(() => {
    // Get connection status directly from deck store
    const yjsStatus = getYjsConnectionStatus && getYjsConnectionStatus();
    // Get users from deck store
    const yjsUsers = getYjsUsers && getYjsUsers() || [];
    
    if (yjsStatus) {
      setIsConnected(yjsStatus.isConnected || false);
    }
    
    // Update users list only if it has actually changed
    if (Array.isArray(yjsUsers)) {
      setUsers(prevUsers => {
        // Compare arrays to avoid unnecessary updates
        if (prevUsers.length !== yjsUsers.length || 
            prevUsers.some((user, idx) => user.clientId !== yjsUsers[idx]?.clientId)) {
          return yjsUsers;
        }
        return prevUsers;
      });
    }
  }, [getYjsConnectionStatus, getYjsUsers]);
  
  // Initial update
  useEffect(() => {
    updateCollaborationStatus();
    
    // Set up recurring updates (every 2 seconds) to detect user disconnections
    const interval = setInterval(updateCollaborationStatus, 2000);
    
    return () => clearInterval(interval);
  }, [updateCollaborationStatus]);

  // Listen for chat selection mode to hide the slide Edit toggle when active
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const selecting = !!e.detail?.selecting;
      setIsChatSelecting(selecting);
    };
    window.addEventListener('chat:selection-mode-changed', handler as EventListener);
    return () => window.removeEventListener('chat:selection-mode-changed', handler as EventListener);
  }, []);
  
  const handleBackToDeckList = async () => {
    // Kick off save, but navigate immediately to avoid blocking Back
    const deckData = useDeckStore.getState().deckData;
    (async () => {
      try {
        if (deckData && deckData.uuid) {
          const { deckSyncService } = await import('@/lib/deckSyncService');
          await deckSyncService.saveDeck(deckData);
          console.log('[DeckHeader] Deck saved after navigation');
        }
      } catch (error) {
        console.error('[DeckHeader] Error saving deck during navigation:', error);
      }
    })();
    navigate('/app');
  };

  // Export handlers (moved from DeckExporter into header actions menu)
  const handleExportJSON = useCallback(async () => {
    try {
      setIsExporting(true);
      const data = await extractDeckComponents(deckName, deckData?.slides || []);
      const deckString = JSON.stringify(data, null, 2);
      const blob = new Blob([deckString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${deckName}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }, [deckName, deckData?.slides]);

  const handleExportHTML = useCallback(async () => {
    try {
      setIsExporting(true);
      const data = await extractDeckComponents(deckName, deckData?.slides || []);
      // Reuse exporter by dynamic import if needed, otherwise simple wrapper
      const { default: DeckExporterModule } = await import('./DeckExporter');
      // Fallback: simple HTML wrapper via Blob if module API not available
      try {
        // Prefer using the same generation as DeckExporter by temporarily creating the module instance
        const generateHtml = (DeckExporterModule as any)?.generateHtmlExport;
        if (typeof generateHtml === 'function') {
          const htmlContent = generateHtml(data);
          const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
          const htmlUrl = URL.createObjectURL(htmlBlob);
          const htmlLink = document.createElement('a');
          htmlLink.href = htmlUrl;
          htmlLink.download = `${deckName}.html`;
          document.body.appendChild(htmlLink);
          htmlLink.click();
          document.body.removeChild(htmlLink);
          URL.revokeObjectURL(htmlUrl);
          return;
        }
      } catch {}
      // Minimal HTML if exporter helper is not exposed
      const html = `<html><head><meta charset="utf-8"><title>${deckName}</title></head><body><pre>${
        // Escape HTML for safety
        String(JSON.stringify(data, null, 2)).replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c] as string))
      }</pre></body></html>`;
      const htmlBlob = new Blob([html], { type: 'text/html' });
      const htmlUrl = URL.createObjectURL(htmlBlob);
      const htmlLink = document.createElement('a');
      htmlLink.href = htmlUrl;
      htmlLink.download = `${deckName}.html`;
      document.body.appendChild(htmlLink);
      htmlLink.click();
      document.body.removeChild(htmlLink);
      URL.revokeObjectURL(htmlUrl);
    } finally {
      setIsExporting(false);
    }
  }, [deckName, deckData?.slides]);

  // Manual text fitting trigger for debugging
  const handleOptimizeAllSlides = useCallback(async () => {
    const SlideCompletionHandler = (await import('@/services/SlideCompletionHandler')).SlideCompletionHandler;
    const handler = SlideCompletionHandler.getInstance();
    const slides = deckData?.slides || [];

    console.log('[DeckHeader] Manually triggering text fitting for all slides');

    let optimizedCount = 0;
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      if (slide && slide.components && slide.components.length > 0) {
        console.log(`[DeckHeader] Processing slide ${i + 1} of ${slides.length}`);
        // Force refit all text components
        await handler.optimizeTextFitting(slide, i, true);
        optimizedCount++;
      }
    }

    toast({
      title: "Text fitting complete",
      description: `Optimized ${optimizedCount} slides with text content`
    });
  }, [deckData?.slides, toast]);

  const startGoogleExport = useCallback(async (mode: 'images' | 'editable') => {
    try {
      setIsExporting(true);
      const completeDeck = await extractDeckComponents(deckName, deckData?.slides || []);
      const status = await googleIntegrationApi.getAuthStatus();
      if (!status.connected) {
        const url = await googleIntegrationApi.initiateAuth();
        window.location.href = url;
        return;
      }
      const jobId = mode === 'images'
        ? await googleIntegrationApi.exportSlidesImages(completeDeck as any, { title: (completeDeck as any).name || deckName })
        : await googleIntegrationApi.exportSlidesEditable(completeDeck as any, { title: (completeDeck as any).name || deckName, createNew: true });
      const job = await googleIntegrationApi.pollJob<{ presentationId: string; webViewLink?: string }>(jobId, { intervalMs: 1500, timeoutMs: 300000 });
      const link = (job.result as any)?.webViewLink;
      if (link) window.open(link, '_blank');
    } finally {
      setIsExporting(false);
    }
  }, [deckName, deckData?.slides]);
  
  return (
    <div className="w-full py-2 px-4 border-b border-border flex items-center justify-between bg-card/80 fixed top-0 left-0 right-0 z-50">
      <div className="flex items-center gap-2">
        <IconButton
          onClick={handleBackToDeckList}
          variant="ghost"
          size="xs"
          aria-label="Back to deck list"
        >
          <ChevronLeft size={14} />
        </IconButton>
        
        <div className="h-3 w-px bg-muted-foreground/30 mx-1"></div>
        
        {!isChatSelecting && (
          <IconButton
            onClick={() => setIsEditing(!isEditing)}
            active={isEditing}
            variant="ghost"
            size="xs"
            aria-label={isEditing ? "Exit edit mode" : "Enter edit mode"}
          >
            <Edit3 size={14} />
          </IconButton>
        )}
        
        {isEditing && (
          <>
            <IconButton
              onClick={handleAddNewSlide}
              variant="ghost"
              size="xs"
              aria-label="Add new slide"
            >
              <Plus size={14} />
            </IconButton>
            
            {handleUndo && (
              <IconButton
                onClick={handleUndo}
                variant="ghost"
                size="xs"
                disabled={!canUndo}
                aria-label="Undo"
              >
                <Undo2 size={14} />
              </IconButton>
            )}
            
            {handleRedo && (
              <IconButton
                onClick={handleRedo}
                variant="ghost"
                size="xs"
                disabled={!canRedo}
                aria-label="Redo"
              >
                <Redo2 size={14} />
              </IconButton>
            )}

          </>
        )}
        
        <div className="h-3 w-px bg-muted-foreground/30 mx-1"></div>
        
        <input
          type="text"
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          className="text-xs font-medium bg-transparent border-none outline-none focus:ring-1 focus:ring-primary/20 px-3 py-1 rounded w-96 max-w-[40vw]"
          aria-label="Deck name"
        />
      </div>
      
      <div className="flex items-center gap-1.5">
        <SyncIndicator
          isSyncing={isSyncing}
          lastSyncTime={lastSyncTime}
          realtimeEnabled={realtimeEnabled}
        />
        <div className="h-3 w-px bg-muted-foreground/30 mx-1"></div>
        
        {/* Live collaboration status indicator */}
        <Popover open={showCollaborators} onOpenChange={setShowCollaborators}>
          <PopoverTrigger asChild>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer hover:bg-muted/70 transition-colors">
              {/* Only show the status dot when disconnected */}
              {!isConnected && (
                <Badge 
                  variant={"destructive"}
                  className="h-2 w-2 rounded-full p-0"
                />
              )}
              
              {/* Show up to 3 user avatars */}
              {users.length > 0 ? (
                <div className="flex -space-x-2">
                  {users.slice(0, 3).map(user => (
                    <Avatar 
                      key={user.clientId || user.id} 
                      className="h-5 w-5 border border-background" 
                      style={{ backgroundColor: user.color }}
                    >
                      <span className="text-[8px] text-white font-medium flex items-center justify-center h-full w-full">
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
                <div className="flex items-center">
                  <Users size={14} className="text-muted-foreground" />
                  <span className="text-xs ml-1 text-muted-foreground">0</span>
                </div>
              )}
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="end">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Collaboration</h3>
                <Badge variant={isConnected ? "default" : "destructive"} className="text-[10px] py-0">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>
              
              <div className="border-t pt-2">
                <h4 className="text-xs font-medium mb-2">Collaborators ({users.length})</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {users.length > 0 ? (
                    users.map(user => (
                      <div key={user.clientId || user.id} className="flex items-center gap-2 text-xs">
                        <div 
                          className="h-4 w-4 rounded-full flex items-center justify-center text-[8px] text-white"
                          style={{ backgroundColor: user.color }}
                        >
                          <span className="flex items-center justify-center h-full w-full">
                            {user.name?.substring(0, 1).toUpperCase() || 'U'}
                          </span>
                        </div>
                        <span className="text-xs">
                          {user.name || 'Unknown User'}
                          {user.self && <span className="text-muted-foreground ml-1">(you)</span>}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-muted-foreground">No collaborators</div>
                  )}
                </div>
              </div>
              
              {/* Inline invite CTA */}
              <div className="pt-2 border-t">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={() => {
                    try {
                      window.dispatchEvent(new CustomEvent('open-deck-sharing', { detail: { tab: 'collaborators', focusInvite: true } }));
                    } catch {}
                    setShowCollaborators(false);
                  }}
                >
                  Invite teammate
                </Button>
              </div>

              <div className="text-xs text-muted-foreground border-t pt-2">
                <p>Changes will sync while connected.</p>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        
        {/* Add comment quick icon */}
        <IconButton
          variant="ghost"
          size="xs"
          aria-label="Add comment"
          onClick={() => {
            try {
              window.dispatchEvent(new CustomEvent('editor:force-edit-mode'));
              window.dispatchEvent(new CustomEvent('comments:toggle-panel'));
            } catch {}
          }}
        >
          <MessageSquare size={14} />
        </IconButton>

        {/* Primary Present button */}
        <Button
          size="xs"
          className="h-7 px-3 bg-[#FF4301] hover:bg-[#E63901] text-white"
          onClick={usePresentationStore.getState().enterPresentation}
          title="Presentation mode (P)"
        >
          <Presentation size={14} className="mr-1" />
          Present
        </Button>

        {/* Secondary Share button (passed in) */}
        {rightSideComponents}

        {/* Actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="ghost" size="xs" aria-label="More actions">
              <Menu size={16} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => { try { window.dispatchEvent(new CustomEvent('notes:open')); } catch {} }}>
              <NotepadText size={14} className="mr-2" />
              Narrative/Notes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setHistoryPanelOpen(!isHistoryPanelOpen)}>
              <History size={14} className="mr-2" />
              Version history
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleOptimizeAllSlides}>
              <Type size={14} className="mr-2" />
              Optimize Text Size (All Slides)
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Search size={14} className="mr-2" />
                Zoom
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-64 p-2">
                <div className="flex items-center space-x-2">
                  <IconButton 
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      const z = useEditorSettingsStore.getState().zoomLevel;
                      if (z > 65) useEditorSettingsStore.getState().setZoomLevel(Math.max(65, z - 10));
                    }}
                    aria-label="Zoom Out"
                  >
                    <ZoomOut size={14} />
                  </IconButton>
                  <Slider
                    value={[useEditorSettingsStore.getState().zoomLevel]}
                    min={65}
                    max={400}
                    step={5}
                    onValueChange={(value) => useEditorSettingsStore.getState().setZoomLevel(value[0])}
                    className="flex-1"
                  />
                  <IconButton 
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      const z = useEditorSettingsStore.getState().zoomLevel;
                      if (z < 400) useEditorSettingsStore.getState().setZoomLevel(Math.min(400, z + 10));
                    }}
                    aria-label="Zoom In"
                  >
                    <ZoomIn size={14} />
                  </IconButton>
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Layers size={14} className="mr-2" />
                Export
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={handleExportJSON} disabled={isExporting}>
                  <FileJson size={14} className="mr-2" />
                  Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportHTML} disabled={isExporting}>
                  <Layers size={14} className="mr-2" />
                  Export as HTML
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => startGoogleExport('images')} disabled={isExporting}>
                  <UploadCloud size={14} className="mr-2" />
                  Google Slides (Images)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => startGoogleExport('editable')} disabled={isExporting}>
                  <UploadCloud size={14} className="mr-2" />
                  Google Slides (Editable)
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Sun size={14} className="mr-2" />
                Theme
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => setTheme('light')}>
                  <Sun size={14} className="mr-2" />
                  Light
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('dark')}>
                  <Moon size={14} className="mr-2" />
                  Dark
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('system')}>
                  System
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={() => { try { window.dispatchEvent(new CustomEvent('tour:start')); } catch {} }}>
              <HelpCircle size={14} className="mr-2" />
              Quick tour
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default DeckHeader;

// ZoomControl icon is removed from the header surface; zoom controls are available in the actions menu