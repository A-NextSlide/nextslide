import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useDeckStore } from '../stores/deckStore';
import { useVersionHistory } from '../context/VersionHistoryContext';
import { DeckVersion } from '../types/VersionTypes';
import { X, Save, RotateCcw, Clock, Sparkles, CircleDot, Loader2, ChevronLeft, ChevronRight, Check, Pencil } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import MiniSlide from './deck/MiniSlide';
import { versionHistoryService } from '../lib/versionHistoryService';
import { SlideData } from '../types/SlideTypes';

const VersionHistoryPanel: React.FC = () => {
  const [versions, setVersions] = useState<DeckVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [versionToRestore, setVersionToRestore] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [loadingExpandId, setLoadingExpandId] = useState<string | null>(null);
  const [fetchedSlides, setFetchedSlides] = useState<Record<string, SlideData[]>>({});
  const originalCreated = useRef(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const getVersionHistory = useDeckStore(state => state.getVersionHistory);
  const restoreVersion = useDeckStore(state => state.restoreVersion);
  const createVersion = useDeckStore(state => state.createVersion);
  const updateVersionMetadata = useDeckStore(state => state.updateVersionMetadata);

  const { setHistoryPanelOpen } = useVersionHistory();
  const { toast } = useToast();

  useEffect(() => {
    loadVersions(true);
  }, []);

  // Focus name input when editing starts
  useEffect(() => {
    if (editingNameId && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingNameId]);

  const loadVersions = async (ensureOriginal = false) => {
    setIsLoading(true);
    try {
      const history = await getVersionHistory();
      setVersions(history);

      if (ensureOriginal && history.length === 0 && !originalCreated.current) {
        originalCreated.current = true;
        const id = await createVersion('Original', 'Initial version of the deck', false, undefined, false);
        if (id) {
          const updated = await getVersionHistory();
          setVersions(updated);
        }
      }
    } catch (error) {
      console.error('Error loading versions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const date = new Date();
      const name = `Snapshot ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
      const id = await createVersion(name, undefined, false, undefined, false);
      if (id) {
        toast({ title: 'Snapshot saved', duration: 2000 });
        await loadVersions();
      }
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive', duration: 3000 });
    } finally {
      setIsSaving(false);
    }
  };

  const openRestoreDialog = (versionId: string) => {
    setVersionToRestore(versionId);
    setRestoreDialogOpen(true);
  };

  const handleRestoreVersion = async () => {
    if (!versionToRestore) return;
    setRestoreDialogOpen(false);
    setRestoringId(versionToRestore);

    const success = await restoreVersion(versionToRestore);
    setRestoringId(null);

    if (success) {
      toast({ title: 'Version restored', duration: 2000 });
      setExpandedId(null);
      await loadVersions();
    } else {
      toast({ title: 'Restore failed', variant: 'destructive', duration: 3000 });
    }
    setVersionToRestore(null);
  };

  const handleToggleExpand = async (versionId: string) => {
    if (expandedId === versionId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(versionId);
    setPreviewSlideIndex(0);

    // Check if we already have slides from the list data or a previous fetch
    const version = versions.find(v => v.id === versionId);
    const existingSlides = version?.data?.slides;
    if (existingSlides && existingSlides.length > 0) {
      setFetchedSlides(prev => ({ ...prev, [versionId]: existingSlides }));
      return;
    }

    // Already fetched before
    if (fetchedSlides[versionId]) return;

    // Fetch full version data on demand
    setLoadingExpandId(versionId);
    try {
      const fullVersion = await versionHistoryService.getVersion(versionId);
      const slides = fullVersion?.data?.slides || [];
      setFetchedSlides(prev => ({ ...prev, [versionId]: slides }));
    } catch {
      // silent fail - will show empty state
    } finally {
      setLoadingExpandId(null);
    }
  };

  const startRename = (e: React.MouseEvent, version: DeckVersion) => {
    e.stopPropagation();
    setEditingNameId(version.id);
    setEditingNameValue(version.version_name);
  };

  const commitRename = useCallback(async () => {
    if (!editingNameId || !editingNameValue.trim()) {
      setEditingNameId(null);
      return;
    }

    const currentVersion = versions.find(v => v.id === editingNameId);
    if (currentVersion && currentVersion.version_name === editingNameValue.trim()) {
      setEditingNameId(null);
      return;
    }

    const trimmed = editingNameValue.trim();
    // Optimistic update
    setVersions(prev => prev.map(v =>
      v.id === editingNameId ? { ...v, version_name: trimmed } : v
    ));
    setEditingNameId(null);

    const success = await updateVersionMetadata(editingNameId, { name: trimmed });
    if (!success) {
      toast({ title: 'Failed to rename', variant: 'destructive', duration: 2000 });
      await loadVersions();
    }
  }, [editingNameId, editingNameValue, versions, updateVersionMetadata, toast]);

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    } else if (e.key === 'Escape') {
      setEditingNameId(null);
    }
  };

  const { manualVersions, autoVersions } = useMemo(() => {
    const manual: DeckVersion[] = [];
    const auto: DeckVersion[] = [];
    for (const v of versions) {
      if (v.is_auto_save) auto.push(v);
      else manual.push(v);
    }
    return { manualVersions: manual, autoVersions: auto };
  }, [versions]);

  const sortedVersions = useMemo(() => {
    return [...versions].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [versions]);

  const getTimeLabel = (v: DeckVersion) => {
    try {
      return formatDistanceToNow(new Date(v.created_at), { addSuffix: true });
    } catch {
      return '';
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
            <Clock size={12} className="text-white" />
          </div>
          <h2 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Version History</h2>
        </div>
        <button
          onClick={() => setHistoryPanelOpen(false)}
          className="h-6 w-6 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Save button */}
      <div className="px-3 py-2.5 border-b border-gray-100 dark:border-white/[0.06]">
        <button
          onClick={handleQuickSave}
          disabled={isSaving}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-all",
            "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm",
            "hover:from-orange-600 hover:to-amber-600 hover:shadow-md",
            "active:scale-[0.98]",
            "disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-sm"
          )}
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {isSaving ? 'Saving...' : 'Save snapshot'}
        </button>
      </div>

      {/* Version list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Loader2 size={18} className="animate-spin text-gray-300 dark:text-gray-600" />
            <p className="text-[11px] text-gray-400 dark:text-gray-500">Loading versions...</p>
          </div>
        ) : sortedVersions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <div className="h-10 w-10 rounded-full bg-gray-100 dark:bg-white/[0.06] flex items-center justify-center mb-3">
              <Clock size={18} className="text-gray-300 dark:text-gray-600" />
            </div>
            <p className="text-[13px] text-gray-500 dark:text-gray-400 font-medium">No versions yet</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Save a snapshot to start tracking changes</p>
          </div>
        ) : (
          <div className="py-1">
            {/* Current state indicator */}
            <div className="px-3 py-2">
              <div className="flex items-center gap-2.5 px-2.5 py-2">
                <div className="relative flex-shrink-0">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <div className="absolute inset-0 h-2 w-2 rounded-full bg-green-500 animate-ping opacity-40" />
                </div>
                <span className="text-[12px] font-semibold text-gray-900 dark:text-gray-100">Current state</span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">now</span>
              </div>
            </div>

            {/* Timeline */}
            <div className="relative">
              <div className="absolute left-[22px] top-0 bottom-0 w-px bg-gray-200 dark:bg-white/[0.08]" />

              {sortedVersions.map((version) => {
                const isOriginal = version.version_name === 'Original';
                const isAuto = version.is_auto_save;
                const isRestoring = restoringId === version.id;
                const isExpanded = expandedId === version.id;
                const isEditing = editingNameId === version.id;
                const isLoadingSlides = loadingExpandId === version.id;
                const slides = fetchedSlides[version.id] || version.data?.slides || [];

                return (
                  <div key={version.id} className="relative">
                    {/* Version row */}
                    <div
                      className={cn(
                        "group mx-2 flex items-start gap-2.5 px-2 py-2 rounded-lg transition-colors cursor-pointer",
                        isExpanded
                          ? "bg-orange-50/60 dark:bg-orange-500/[0.06]"
                          : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                      )}
                      onClick={() => handleToggleExpand(version.id)}
                    >
                      {/* Timeline dot */}
                      <div className="relative z-10 flex-shrink-0 mt-0.5">
                        {isOriginal ? (
                          <div className="h-4 w-4 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
                            <Sparkles size={8} className="text-white" />
                          </div>
                        ) : isAuto ? (
                          <div className="h-4 w-4 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                            <div className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-500" />
                          </div>
                        ) : (
                          <div className="h-4 w-4 rounded-full bg-orange-100 dark:bg-orange-500/20 flex items-center justify-center">
                            <CircleDot size={10} className="text-orange-500" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {isEditing ? (
                            <input
                              ref={nameInputRef}
                              type="text"
                              value={editingNameValue}
                              onChange={(e) => setEditingNameValue(e.target.value)}
                              onKeyDown={handleNameKeyDown}
                              onBlur={commitRename}
                              onClick={(e) => e.stopPropagation()}
                              className="text-[12px] font-medium bg-white dark:bg-zinc-800 border border-orange-300 dark:border-orange-500/40 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-orange-400 w-full max-w-[140px] text-gray-900 dark:text-gray-100"
                            />
                          ) : (
                            <>
                              <span className={cn(
                                "text-[12px] font-medium truncate",
                                isOriginal
                                  ? "text-orange-600 dark:text-orange-400"
                                  : isAuto
                                    ? "text-gray-500 dark:text-gray-400"
                                    : "text-gray-800 dark:text-gray-200"
                              )}>
                                {version.version_name}
                              </span>
                              {/* Inline edit icon */}
                              <button
                                onClick={(e) => startRename(e, version)}
                                className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200/60 dark:hover:bg-white/10 transition-all"
                              >
                                <Pencil size={9} className="text-gray-400" />
                              </button>
                            </>
                          )}
                          {isOriginal && !isEditing && (
                            <span className="flex-shrink-0 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-500/10 text-orange-500">
                              base
                            </span>
                          )}
                          {isAuto && !isEditing && (
                            <span className="flex-shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.06] text-gray-400 dark:text-gray-500">
                              auto
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            {getTimeLabel(version)}
                          </span>
                          {slides.length > 0 && (
                            <span className="text-[10px] text-gray-300 dark:text-gray-600">
                              · {slides.length} slide{slides.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Restore button */}
                      {!isEditing && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openRestoreDialog(version.id);
                          }}
                          disabled={isRestoring}
                          className={cn(
                            "flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all",
                            "opacity-0 group-hover:opacity-100",
                            "text-gray-500 hover:text-orange-600 dark:hover:text-orange-400",
                            "hover:bg-orange-50 dark:hover:bg-orange-500/10",
                            "disabled:opacity-50"
                          )}
                        >
                          {isRestoring ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                          Restore
                        </button>
                      )}
                    </div>

                    {/* Expanded preview */}
                    {isExpanded && (
                      <div className="mx-2 mb-1 px-2">
                        <div className="ml-[26px] rounded-lg overflow-hidden border border-gray-200/80 dark:border-white/[0.08] bg-gray-50 dark:bg-black/20">
                          {isLoadingSlides ? (
                            <div className="flex flex-col items-center justify-center py-8 gap-2">
                              <Loader2 size={16} className="animate-spin text-gray-300 dark:text-gray-600" />
                              <span className="text-[10px] text-gray-400 dark:text-gray-500">Loading preview...</span>
                            </div>
                          ) : slides.length > 0 ? (
                            <>
                              {/* Slide thumbnail */}
                              <div className="relative aspect-video bg-gray-100 dark:bg-zinc-800">
                                <MiniSlide
                                  slide={slides[previewSlideIndex]}
                                  className="rounded-none hover:ring-0"
                                  renderMode="full"
                                  forceRender
                                />

                                {/* Prev/Next overlay buttons */}
                                {slides.length > 1 && (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPreviewSlideIndex(i => Math.max(0, i - 1));
                                      }}
                                      disabled={previewSlideIndex <= 0}
                                      className={cn(
                                        "absolute left-1 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full flex items-center justify-center transition-all",
                                        "bg-white/90 dark:bg-black/60 shadow-sm backdrop-blur-sm",
                                        "hover:bg-white dark:hover:bg-black/80",
                                        "disabled:opacity-0 disabled:pointer-events-none"
                                      )}
                                    >
                                      <ChevronLeft size={14} className="text-gray-700 dark:text-gray-300" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPreviewSlideIndex(i => Math.min(slides.length - 1, i + 1));
                                      }}
                                      disabled={previewSlideIndex >= slides.length - 1}
                                      className={cn(
                                        "absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full flex items-center justify-center transition-all",
                                        "bg-white/90 dark:bg-black/60 shadow-sm backdrop-blur-sm",
                                        "hover:bg-white dark:hover:bg-black/80",
                                        "disabled:opacity-0 disabled:pointer-events-none"
                                      )}
                                    >
                                      <ChevronRight size={14} className="text-gray-700 dark:text-gray-300" />
                                    </button>
                                  </>
                                )}
                              </div>

                              {/* Slide counter + restore bar */}
                              <div className="flex items-center justify-between px-2.5 py-1.5 border-t border-gray-200/80 dark:border-white/[0.06]">
                                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium tabular-nums">
                                  {previewSlideIndex + 1} / {slides.length}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openRestoreDialog(version.id);
                                  }}
                                  className="flex items-center gap-1 text-[11px] font-medium text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition-colors"
                                >
                                  <RotateCcw size={10} />
                                  Restore this version
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center justify-center py-6 gap-1.5">
                              <span className="text-[11px] text-gray-400 dark:text-gray-500">No slide preview available</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openRestoreDialog(version.id);
                                }}
                                className="flex items-center gap-1 text-[11px] font-medium text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition-colors"
                              >
                                <RotateCcw size={10} />
                                Restore anyway
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Stats footer */}
            <div className="mx-3 mt-2 mb-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06]">
              <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500">
                <span>{manualVersions.length} snapshot{manualVersions.length !== 1 ? 's' : ''}</span>
                <span className="w-px h-3 bg-gray-200 dark:bg-white/[0.08]" />
                <span>{autoVersions.length} auto-save{autoVersions.length !== 1 ? 's' : ''}</span>
                <span className="w-px h-3 bg-gray-200 dark:bg-white/[0.08]" />
                <span>{versions.length} total</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Restore confirmation */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent className="max-w-sm rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">Restore this version?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              Your current deck will be replaced with this version. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[13px]" onClick={() => setRestoreDialogOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreVersion}
              className="bg-orange-500 hover:bg-orange-600 text-white text-[13px]"
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VersionHistoryPanel;
