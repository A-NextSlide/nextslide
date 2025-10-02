
import React, { useEffect, useState, useMemo } from 'react';
import { useDeckStore } from '../stores/deckStore';
import { useVersionHistory } from '../context/VersionHistoryContext';
import { Button } from './ui/button';
import { DeckVersion } from '../types/VersionTypes';
import { X, RefreshCw, ChevronLeft, ChevronRight, Save, Clock } from 'lucide-react';
import { SlideData } from '../types/SlideTypes';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { IconButton } from './ui/IconButton';
import Slide from './Slide';
import { useToast } from '@/hooks/use-toast';
import VersionHistoryTree from './VersionHistoryTree';
import { autosaveService } from '@/services/autosaveService';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

const VersionHistoryPanel: React.FC = () => {
  const [versions, setVersions] = useState<DeckVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<DeckVersion | null>(null);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState<number>(0);
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState<boolean>(false);
  const [versionToRestore, setVersionToRestore] = useState<string | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState(autosaveService.getAutosaveStatus());
  const [activeTab, setActiveTab] = useState<'all' | 'manual' | 'autosave'>('all');
  
  const getVersionHistory = useDeckStore(state => state.getVersionHistory);
  const restoreVersion = useDeckStore(state => state.restoreVersion);
  const createVersion = useDeckStore(state => state.createVersion);
  const updateVersionMetadata = useDeckStore(state => state.updateVersionMetadata);
  
  const { setHistoryPanelOpen } = useVersionHistory();
  const { toast } = useToast();
  
  // Load versions on mount
  useEffect(() => {
    loadVersions();
    
    // Update autosave status periodically
    const interval = setInterval(() => {
      setAutosaveStatus(autosaveService.getAutosaveStatus());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  

  
  const loadVersions = async () => {
    setIsLoading(true);
    try {
      const history = await getVersionHistory();
      setVersions(history);
    } catch (error) {
      console.error('Error loading versions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter versions based on active tab
  const filteredVersions = useMemo(() => {
    switch (activeTab) {
      case 'manual':
        return versions.filter(v => !v.is_auto_save);
      case 'autosave':
        return versions.filter(v => v.is_auto_save);
      default:
        return versions;
    }
  }, [versions, activeTab]);
  
  const openRestoreDialog = (versionId: string) => {
    setVersionToRestore(versionId);
    setRestoreDialogOpen(true);
  };
  
  const handleRestoreVersion = async () => {
    if (!versionToRestore) return;
    
    // Close dialogs immediately for better UX
    setRestoreDialogOpen(false);
    setPreviewOpen(false);
    
    // Show loading toast
    const loadingToast = toast({
      title: "Restoring Version",
      description: "Please wait while we restore your selected version...",
      duration: 10000 // Keep it open until we dismiss it
    });
    
    const success = await restoreVersion(versionToRestore);
    
    // Dismiss loading toast
    loadingToast.dismiss();
    
    if (success) {
      toast({
        title: "Version Restored",
        description: "Successfully restored to the selected version",
        duration: 3000
      });
      
      // Reload versions to reflect current state
      await loadVersions();
      setSelectedVersion(null);
    } else {
      toast({
        title: "Restore Failed",
        description: "Failed to restore the selected version. Please try again.",
        variant: "destructive",
        duration: 4000
      });
    }
    
    setVersionToRestore(null);
  };
  
  // State for version notes
  const [versionNotes, setVersionNotes] = useState<string>('');
  
  const handleVersionSelect = (version: DeckVersion) => {
    setSelectedVersion(version);
    setSelectedSlideIndex(0);
    setVersionNotes(version.metadata?.notes || '');
    setPreviewOpen(true);
  };
  
  // Save version notes
  const saveVersionNotes = async (versionId: string, notes: string) => {
    try {
      await updateVersionMetadata(versionId, { notes });
      
      // Update local versions with the new notes
      setVersions(versions.map(v => {
        if (v.id === versionId) {
          return {
            ...v,
            metadata: {
              ...v.metadata,
              notes
            }
          };
        }
        return v;
      }));
      
      toast({
        title: "Notes Saved",
        description: "Version notes have been updated",
        duration: 2000
      });
    } catch (error) {
      console.error('Error saving version notes:', error);
      toast({
        title: "Error",
        description: "Failed to save notes",
        variant: "destructive"
      });
    }
  };
  
  // State for save version dialog
  const [saveVersionOpen, setSaveVersionOpen] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');
  const [newVersionNotes, setNewVersionNotes] = useState('');
  const [newVersionBookmarked, setNewVersionBookmarked] = useState(false);
  
  // Handle opening save version dialog
  const openSaveVersionDialog = () => {
    setNewVersionName('');
    setNewVersionNotes('');
    setNewVersionBookmarked(false);
    setSaveVersionOpen(true);
  };
  
  // Handle creating a new version
  const handleCreateVersion = async () => {
    if (isSaving) return; // Prevent multiple clicks
    
    setIsSaving(true);
    try {
      if (!newVersionName.trim()) {
        toast({
          title: "Error",
          description: "Please enter a name for your version",
          variant: "destructive"
        });
        setIsSaving(false);
        return;
      }
      
      const versionId = await createVersion(
        newVersionName.trim(), 
        undefined, 
        newVersionBookmarked,
        newVersionNotes.trim() || undefined
      );
      
      if (versionId) {
        setSaveVersionOpen(false);
        toast({
          title: "Version Saved",
          description: "Your version has been saved successfully",
          duration: 3000
        });
        loadVersions(); // Refresh the versions list
      } else {
        toast({
          title: "Error",
          description: "Failed to save version",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error creating version:', error);
      toast({
        title: "Error",
        description: "An error occurred while saving the version",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  // Handle toggling bookmark status
  const handleToggleBookmark = async (version: DeckVersion) => {
    try {
      const isBookmarking = !version.metadata?.bookmarked;
      
      // Update locally first for immediate feedback
      const updatedVersions = versions.map(v => {
        if (v.id === version.id) {
          return {
            ...v,
            metadata: {
              ...v.metadata,
              bookmarked: isBookmarking
            }
          };
        }
        return v;
      });
      
      setVersions(updatedVersions);
      
      // Show toast notification
      toast({
        title: isBookmarking ? "Version Bookmarked" : "Bookmark Removed",
        description: isBookmarking 
          ? `"${version.version_name}" has been bookmarked`
          : `Bookmark removed from "${version.version_name}"`,
        duration: 2000
      });
      
      // Actually update on the server
      await updateVersionMetadata(
        version.id, 
        { bookmarked: isBookmarking }
      );
      
    } catch (error) {
      console.error('Error toggling bookmark:', error);
      toast({
        title: "Error",
        description: "Failed to update bookmark status",
        variant: "destructive"
      });
    }
  };
  
  // Format dates for better display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: undefined
    });
  };

  // Handle version rename
  const handleVersionRename = async (versionId: string, newName: string) => {
    try {
      const success = await updateVersionMetadata(versionId, { name: newName });
      
      if (success) {
        // Update local state
        setVersions(versions.map(v => 
          v.id === versionId ? { ...v, version_name: newName } : v
        ));
        
        toast({
          title: "Name Updated",
          description: `Version renamed to "${newName}"`,
          duration: 2000
        });
      }
    } catch (error) {
      console.error('Error renaming version:', error);
      toast({
        title: "Error",
        description: "Failed to rename version",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="h-full flex flex-col bg-background border-l">
      <div className="p-4 border-b">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold">Version History</h2>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm"
              className="h-8 text-xs"
              onClick={loadVersions} 
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="w-8 h-8" 
              onClick={() => setHistoryPanelOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {/* Save version button and autosave status */}
        <div className="space-y-2">
          <Button 
            variant="default" 
            size="sm"
            className="w-full"
            onClick={openSaveVersionDialog}
            disabled={isSaving}
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Version'}
          </Button>
          
          {/* Autosave status indicator */}
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <div className="flex items-center gap-1.5">
              <Clock className={cn(
                "w-3 h-3",
                autosaveStatus.isRunning && "text-green-500"
              )} />
              <span>Autosave: {autosaveStatus.isRunning ? 'On' : 'Off'}</span>
            </div>
            {autosaveStatus.isCurrentlySaving && (
              <span className="text-blue-500">Saving...</span>
            )}
          </div>
        </div>
      </div>
      
      {/* Tabs for filtering versions */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3 h-9 px-4">
          <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
          <TabsTrigger value="manual" className="text-xs">Manual</TabsTrigger>
          <TabsTrigger value="autosave" className="text-xs">Autosaves</TabsTrigger>
        </TabsList>
        
        <TabsContent value={activeTab} className="flex-1 overflow-hidden mt-0">
          <div className="h-full overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex justify-center my-8">
                <p className="text-sm text-muted-foreground">Loading versions...</p>
              </div>
            ) : (
              <VersionHistoryTree
                versions={filteredVersions}
                selectedVersionId={selectedVersion?.id}
                onVersionSelect={handleVersionSelect}
                onVersionRestore={openRestoreDialog}
                onVersionRename={handleVersionRename}
                onVersionBookmark={handleToggleBookmark}
              />
            )}
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Slide Preview Dialog */}
      {selectedVersion && (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-5xl p-6 max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
            <DialogTitle className="flex justify-between items-center text-lg">
              <span>Version Preview: {selectedVersion.version_name}</span>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                {formatDistanceToNow(new Date(selectedVersion.created_at), { addSuffix: true })}
              </div>
            </DialogTitle>
          </DialogHeader>
            
            <div className="flex flex-col space-y-4 mt-2">
              {/* Slide Preview with Navigation Controls */}
              <div className="flex flex-col space-y-3">
                <AspectRatio 
                  ratio={16/9} 
                  className="overflow-hidden rounded-md relative border shadow-sm"
                > 
                  {selectedVersion.data.slides && selectedVersion.data.slides[selectedSlideIndex] ? (
                    <Slide 
                      slide={selectedVersion.data.slides[selectedSlideIndex]} 
                      isActive={true}
                      direction={null}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground p-4">
                      <div className="text-center">
                        <p>No slide content available</p>
                        <p className="text-xs mt-2">Slide data might be missing or corrupted</p>
                      </div>
                    </div>
                  )}
                </AspectRatio>
                
                {/* Navigation Controls Below Slide */}
                {selectedVersion.data.slides && selectedVersion.data.slides.length > 1 && (
                  <div className="flex flex-col items-center mt-2">
                    <div className="flex items-center w-full py-0 px-1">
                      {/* Empty div for left spacing */}
                      <div className="flex-1 min-w-8"></div>
                      
                      {/* Slide indicator - centered */}
                      <div 
                        className="glass-panel px-3 py-1 rounded-full text-xs font-medium text-muted-foreground mx-auto"
                      >
                        {selectedSlideIndex + 1} / {selectedVersion.data.slides.length}
                      </div>
                      
                      {/* Navigation buttons - right aligned */}
                      <div 
                        className="flex items-center gap-1 justify-end flex-1"
                      >
                        <IconButton
                          onClick={() => setSelectedSlideIndex(prev => Math.max(0, prev - 1))}
                          disabled={selectedSlideIndex <= 0}
                          variant="ghost"
                          size="xs"
                          className="bg-white/80 backdrop-blur-sm hover:bg-white/90 text-gray-800"
                        >
                          <ChevronLeft size={14} />
                        </IconButton>
                        
                        <IconButton
                          onClick={() => setSelectedSlideIndex(prev => Math.min(selectedVersion.data.slides!.length - 1, prev + 1))}
                          disabled={selectedSlideIndex >= selectedVersion.data.slides.length - 1}
                          variant="ghost"
                          size="xs"
                          className="bg-white/80 backdrop-blur-sm hover:bg-white/90 text-gray-800"
                        >
                          <ChevronRight size={14} />
                        </IconButton>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Version Information and Notes */}
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="border rounded p-3 bg-blue-50 dark:bg-blue-900/20">
                  <div className="flex flex-col">
                    <h3 className="text-sm font-medium">{selectedVersion.version_name}</h3>
                    <p className="text-xs text-muted-foreground mb-1">
                      Version {selectedVersion.version_number} • {formatDate(selectedVersion.created_at)}
                    </p>
                    {selectedVersion.metadata?.description && (
                      <p className="text-xs border-t pt-1 mt-1">{selectedVersion.metadata.description}</p>
                    )}
                  </div>
                </div>
                
                <div className="flex justify-end items-start gap-2">
                  <Button 
                    onClick={() => openRestoreDialog(selectedVersion.id)}
                    variant="default"
                    size="sm"
                  >
                    Restore This Version
                  </Button>
                  <Button 
                    onClick={() => setPreviewOpen(false)}
                    variant="outline"
                    size="sm"
                  >
                    Close
                  </Button>
                </div>
              </div>
              
              {/* Notes Section */}
              {selectedVersion.metadata?.notes && (
                <div className="border rounded p-3 bg-gray-50 dark:bg-gray-900/50">
                  <h3 className="text-sm font-medium mb-2">Notes</h3>
                  <div className="text-sm text-muted-foreground p-2 min-h-[50px]">
                    {selectedVersion.metadata.notes || "No notes available for this version."}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
      
      {/* Restore Confirmation Dialog */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Version</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore this version? Any unsaved changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRestoreDialogOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestoreVersion}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Save Version Dialog */}
      <Dialog open={saveVersionOpen} onOpenChange={setSaveVersionOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Save Version</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="version-name" className="text-sm font-medium">
                Version Name <span className="text-destructive">*</span>
              </label>
              <input
                id="version-name"
                type="text"
                value={newVersionName}
                onChange={(e) => setNewVersionName(e.target.value)}
                className="w-full p-2 text-sm border rounded-md focus:ring-1 focus:ring-primary focus:outline-none"
                placeholder="Enter a name for this version"
                autoFocus
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="version-notes" className="text-sm font-medium">
                Notes
              </label>
              <textarea
                id="version-notes"
                value={newVersionNotes}
                onChange={(e) => setNewVersionNotes(e.target.value)}
                className="w-full p-2 text-sm border rounded-md min-h-[100px] focus:ring-1 focus:ring-primary focus:outline-none"
                placeholder="Add notes about this version (optional)"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                id="bookmark-version"
                type="checkbox"
                checked={newVersionBookmarked}
                onChange={(e) => setNewVersionBookmarked(e.target.checked)}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="bookmark-version" className="text-sm font-medium">
                Bookmark this version
              </label>
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setSaveVersionOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateVersion}
              disabled={isSaving || !newVersionName.trim()}
            >
              {isSaving ? 'Saving...' : 'Save Version'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VersionHistoryPanel;
