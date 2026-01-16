import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { googleIntegrationApi, GooglePresentationFile, JobProgress } from '@/services/googleIntegrationApi';
import { useDeckStore } from '@/stores/deckStore';
import { Loader2, LogIn, RefreshCw, Clock, Layers, AlertCircle, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { deckSyncService } from '@/lib/deckSyncService';
import { Progress } from '@/components/ui/progress';

const MAX_SLIDES_LIMIT = 30;

interface GoogleSlidesImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GoogleSlidesImportModal: React.FC<GoogleSlidesImportModalProps> = ({ open, onOpenChange }) => {
  const { toast } = useToast();
  const createDefaultDeck = useDeckStore((state) => state.createDefaultDeck);
  const updateDeckData = useDeckStore((state) => state.updateDeckData);

  const [authLoading, setAuthLoading] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectedEmail, setConnectedEmail] = useState<string | undefined>();
  const [isListing, setIsListing] = useState<boolean>(false);
  const [query, setQuery] = useState<string>('');
  const [files, setFiles] = useState<GooglePresentationFile[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [lastError, setLastError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [scope, setScope] = useState<'mine' | 'shared' | 'all'>('mine');
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const didInitialFetchRef = useRef<boolean>(false);
  type ThumbMeta = { url: string; width: number; height: number };
  const [thumbMeta, setThumbMeta] = useState<Record<string, ThumbMeta>>({});
  const [slideCountMeta, setSlideCountMeta] = useState<Record<string, number>>({});
  const retryCountsRef = useRef<Record<string, number>>({});
  const fetchingRef = useRef<Set<string>>(new Set());
  const isFetchingRef = useRef<boolean>(false);
  const [importProgress, setImportProgress] = useState<JobProgress | null>(null);

  // Debounce query input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);
  const [isImportingId, setIsImportingId] = useState<string | null>(null);

  const loadAuthStatus = useCallback(async () => {
    setAuthLoading(true);
    try {
      const status = await googleIntegrationApi.getAuthStatus();
      setIsConnected(!!status.connected);
      setConnectedEmail(status.email);
    } catch {
      setIsConnected(false);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadAuthStatus();
    }
  }, [open, loadAuthStatus]);

  const handleConnect = useCallback(async () => {
    try {
      const url = await googleIntegrationApi.initiateAuth();
      window.location.href = url;
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed to start Google auth', description: e.message || 'Please try again.' });
    }
  }, [toast]);

  const listFiles = useCallback(async (reset: boolean = true) => {
    if (!isConnected) return;
    if (!reset && !nextPageToken) return;
    if (reset) {
      setFiles([]);
      setNextPageToken(undefined);
      setHasMore(true);
    }
    setIsListing(true);
    try {
      const data = await googleIntegrationApi.listPresentations({ query: debouncedQuery, pageToken: reset ? undefined : nextPageToken, pageSize: 20, scope });
      setFiles((prev) => {
        const existing = new Set(prev.map(f => f.id));
        const merged = reset ? (data.files || []) : prev.concat((data.files || []).filter(f => !existing.has(f.id)));
        return merged;
      });
      setNextPageToken(data.nextPageToken);
      setHasMore(Boolean(data.nextPageToken));
      setLastError(null);
    } catch (e: any) {
      const msg = e?.message || (typeof e === 'string' ? e : 'Failed to list Slides');
      setLastError(msg);
      setHasMore(false);
      toast({ variant: 'destructive', title: 'Failed to list Slides', description: msg });
    } finally {
      setIsListing(false);
    }
  }, [isConnected, debouncedQuery, nextPageToken, toast, scope]);

  // Load first page on open
  useEffect(() => {
    if (!open) {
      didInitialFetchRef.current = false;
      fetchingRef.current.clear();
      isFetchingRef.current = false;
      return;
    }
    if (open && isConnected && !didInitialFetchRef.current) {
      didInitialFetchRef.current = true;
      listFiles(true);
    }
  }, [open, isConnected]);

  // Reload when debounced query changes
  useEffect(() => {
    if (open && isConnected) {
      listFiles(true);
    }
  }, [debouncedQuery]);

  // Reload when scope changes
  useEffect(() => {
    if (open && isConnected) {
      listFiles(true);
    }
  }, [scope]);

  // Infinite scroll observer
  useEffect(() => {
    if (!open || !isConnected) return;
    if (observerRef.current) observerRef.current.disconnect();
    let cooldown = false;
    observerRef.current = new IntersectionObserver((entries) => {
      if (cooldown) return;
      if (entries[0].isIntersecting && hasMore && !isListing && nextPageToken) {
        cooldown = true;
        listFiles(false).finally(() => {
          setTimeout(() => { cooldown = false; }, 400);
        });
      }
    }, { root: null, rootMargin: '300px', threshold: 0 });
    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [open, isConnected, hasMore, isListing, nextPageToken, listFiles]);

  // Prefetch thumbnails
  useEffect(() => {
    if (!open || !isConnected || files.length === 0) return;
    const abortController = new AbortController();
    let timeoutId: NodeJS.Timeout;

    const needsApiThumbnail = (f: GooglePresentationFile) => {
      const meta = thumbMeta[f.id];
      return !meta || (meta.url === f.thumbnailLink);
    };

    (async () => {
      if (isFetchingRef.current) return;

      const toPrefetch = files.filter(f => needsApiThumbnail(f) && !fetchingRef.current.has(f.id)).slice(0, 4);
      if (toPrefetch.length === 0) return;

      isFetchingRef.current = true;
      toPrefetch.forEach(f => fetchingRef.current.add(f.id));

      // Seed with Drive thumbnails first
      setThumbMeta(prev => {
        const next = { ...prev } as Record<string, ThumbMeta>;
        toPrefetch.forEach(f => {
          if (!next[f.id] && f.thumbnailLink) {
            next[f.id] = { url: f.thumbnailLink, width: 1600, height: 900 };
          }
        });
        return next;
      });

      try {
        const results = await googleIntegrationApi.getSlidePageThumbnailsBatch(
          toPrefetch.map(f => ({ presentationId: f.id, pageId: 'first' })),
          { size: 'MEDIUM', mime: 'PNG' }
        );
        if (!Array.isArray(results)) return;

        const byId: Record<string, { url?: string; width?: number; height?: number; ok?: boolean }> = {};
        results.forEach((r: any) => {
          const pid = r?.presentationId;
          if (!pid) return;
          const thumbnail = r?.thumbnail;
          if (thumbnail && thumbnail.contentUrl && thumbnail.width && thumbnail.height) {
            byId[pid] = { url: thumbnail.contentUrl, width: thumbnail.width, height: thumbnail.height, ok: true };
          }
        });

        setThumbMeta(prev => {
          const next = { ...prev } as Record<string, ThumbMeta>;
          toPrefetch.forEach((f) => {
            const r = byId[f.id];
            if (r && r.ok && r.url && r.width && r.height) {
              next[f.id] = { url: r.url, width: r.width, height: r.height };
            } else if (!next[f.id] && f.thumbnailLink) {
              next[f.id] = { url: f.thumbnailLink, width: 1600, height: 900 };
            }
          });
          return next;
        });
      } catch {
        setThumbMeta(prev => {
          const next = { ...prev } as Record<string, ThumbMeta>;
          toPrefetch.forEach(f => {
            if (!next[f.id] && f.thumbnailLink) {
              next[f.id] = { url: f.thumbnailLink, width: 1600, height: 900 };
            }
          });
          return next;
        });
      } finally {
        toPrefetch.forEach(f => fetchingRef.current.delete(f.id));
        isFetchingRef.current = false;

        if (!abortController.signal.aborted) {
          timeoutId = setTimeout(() => {
            const remaining = files.filter(f => needsApiThumbnail(f) && !fetchingRef.current.has(f.id));
            if (remaining.length > 0) {
              setThumbMeta(prev => ({ ...prev }));
            }
          }, 500);
        }
      }
    })();

    return () => {
      abortController.abort();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [open, isConnected, files, thumbMeta]);

  // Fetch slide counts
  useEffect(() => {
    if (!open || !isConnected || files.length === 0) return;

    const abortController = new AbortController();
    const needsSlideCount = files.filter(f => slideCountMeta[f.id] === undefined).slice(0, 6);
    if (needsSlideCount.length === 0) return;

    (async () => {
      for (const file of needsSlideCount) {
        if (abortController.signal.aborted) break;
        try {
          const metadata = await googleIntegrationApi.getPresentationMetadata(file.id);
          if (!abortController.signal.aborted) {
            setSlideCountMeta(prev => ({ ...prev, [file.id]: metadata.slideCount }));
          }
        } catch {
          // Ignore errors
        }
        await new Promise(r => setTimeout(r, 200));
      }
    })();

    return () => abortController.abort();
  }, [open, isConnected, files, slideCountMeta]);

  const handleImgError = useCallback(async (f: GooglePresentationFile) => {
    const key = f.id;
    const retries = retryCountsRef.current[key] || 0;
    if (retries >= 2) return;
    retryCountsRef.current[key] = retries + 1;
    try {
      const fresh = await googleIntegrationApi.getSlidePageThumbnail(f.id, 'first', { size: 'MEDIUM', mime: 'PNG' });
      const nocacheUrl = `${fresh.contentUrl}${fresh.contentUrl.includes('?') ? '&' : '?'}ts=${Date.now()}`;
      setThumbMeta(prev => ({ ...prev, [key]: { url: nocacheUrl, width: fresh.width, height: fresh.height } }));
    } catch {
      if (f.thumbnailLink) {
        setThumbMeta(prev => ({ ...prev, [key]: { url: f.thumbnailLink!, width: 1600, height: 900 } }));
      }
    }
  }, []);

  const handleImport = useCallback(async (file: GooglePresentationFile) => {
    setIsImportingId(file.id);
    setImportProgress(null);
    let createdDeckId: string | null = null;

    try {
      // Fetch metadata to check slide count
      let slideCount = slideCountMeta[file.id];
      if (!slideCount) {
        try {
          const metadata = await googleIntegrationApi.getPresentationMetadata(file.id);
          slideCount = metadata.slideCount;
          setSlideCountMeta(prev => ({ ...prev, [file.id]: slideCount }));
        } catch {
          slideCount = 0;
        }
      }

      // Validate slide limit
      if (slideCount > MAX_SLIDES_LIMIT) {
        toast({
          variant: 'destructive',
          title: 'Too many slides',
          description: `This presentation has ${slideCount} slides. Maximum allowed is ${MAX_SLIDES_LIMIT} slides.`
        });
        setIsImportingId(null);
        return;
      }

      // Create placeholder deck for import (with empty slides - will be replaced by imported content)
      const baseDeck = await createDefaultDeck();
      if (!baseDeck || !baseDeck.uuid) throw new Error('Failed to create base deck');
      createdDeckId = baseDeck.uuid;

      const importingName = `${file.name}`;
      // Clear the default slide - it will be replaced by imported slides
      const emptyBaseDeck = { ...baseDeck, name: importingName, slides: [], lastModified: new Date().toISOString() };
      updateDeckData(emptyBaseDeck, { skipBackend: true });
      try { await deckSyncService.saveDeck(emptyBaseDeck as any); } catch {}

      try {
        window.dispatchEvent(new CustomEvent('deck_created', {
          detail: { deckId: baseDeck.uuid, isGenerating: true, isImporting: true, name: importingName, progress: 5 }
        }));
      } catch {}

      onOpenChange(false);
      toast({ title: 'Import started', description: `Importing "${file.name}" (${slideCount} slides)…` });

      const jobId = await googleIntegrationApi.startImportSlides(file.id);

      const job = await googleIntegrationApi.pollJob<{ deck: any }>(jobId, {
        intervalMs: 1500,
        timeoutMs: 300000,
        onProgress: (progress) => {
          setImportProgress(progress);
          try {
            window.dispatchEvent(new CustomEvent('deck_progress', {
              detail: {
                deckId: baseDeck.uuid,
                progress: progress.progress,
                currentSlide: progress.currentSlide,
                totalSlides: progress.totalSlides
              }
            }));
          } catch {}
        }
      });

      const deckJson = (job.result as any)?.deck || job.result;
      if (!deckJson) throw new Error('No deck result returned');

      const sanitizeImportedDeck = (deck: any) => {
        const clone = JSON.parse(JSON.stringify(deck));
        for (const slide of clone.slides || []) {
          if (!Array.isArray(slide.components)) continue;
          slide.components = slide.components.map((comp: any) => {
            if (comp?.type === 'Shape' && comp.props) {
              const fill = comp.props.fill as string | undefined;
              const hasGradient = !!comp.props.gradient;
              if (!hasGradient && typeof fill === 'string') {
                const lower = fill.toLowerCase();
                if (lower === '#000000ff' || lower === '#000000' || lower === 'black' || /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*1(\.0+)?\s*\)/i.test(lower) || /rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/i.test(lower)) {
                  comp.props.fill = '#00000000';
                }
                if (lower === 'transparent') {
                  comp.props.fill = '#00000000';
                }
              }
            }
            return comp;
          });
        }
        return clone;
      };

      const cleanedDeckJson = sanitizeImportedDeck(deckJson);
      // Build final deck - explicitly set slides to imported content only (no default slide)
      const finalDeck = {
        uuid: baseDeck.uuid,
        name: cleanedDeckJson.name || importingName,
        slides: cleanedDeckJson.slides || [],
        size: cleanedDeckJson.size || { width: 1920, height: 1080 },
        lastModified: new Date().toISOString(),
        createdAt: baseDeck.createdAt,
        version: baseDeck.version,
      } as any;

      // Update store and save to backend with imported slides only
      updateDeckData(finalDeck, { skipBackend: false });
      await deckSyncService.saveDeck(finalDeck);

      try {
        window.dispatchEvent(new CustomEvent('deck_progress', {
          detail: { deckId: baseDeck.uuid, progress: 100, currentSlide: 1, totalSlides: 1 }
        }));
        window.dispatchEvent(new CustomEvent('deck_created', {
          detail: { deckId: baseDeck.uuid, isGenerating: false }
        }));
        window.dispatchEvent(new CustomEvent('deck_import_complete', {
          detail: { deckId: baseDeck.uuid, name: cleanedDeckJson.name || importingName }
        }));
        (window as any).__pendingImportMessage = {
          deckId: baseDeck.uuid,
          name: cleanedDeckJson.name || importingName,
          timestamp: Date.now()
        };
      } catch {}

      toast({ title: 'Import complete', description: `Imported "${file.name}"` });
    } catch (e: any) {
      if (createdDeckId) {
        try {
          window.dispatchEvent(new CustomEvent('deck_error', { detail: { deckId: createdDeckId, message: e?.message } }));
        } catch {}
      }
      toast({ variant: 'destructive', title: 'Import failed', description: e?.message || 'Please try again.' });
    } finally {
      setIsImportingId(null);
    }
  }, [createDefaultDeck, updateDeckData, toast, onOpenChange, slideCountMeta]);

  const isFirstLoad = files.length === 0 && isListing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="p-0 border-0 bg-transparent shadow-none outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
        style={{ width: '720px', maxWidth: '95vw' }}
      >
        <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl relative" style={{ width: '720px', maxWidth: '100%' }}>
          {/* Close button */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 z-10 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Orange gradient bar */}
          <div className="h-[3px] bg-gradient-to-r from-[#FF6B00] via-[#FF8533] to-[#FF6B00]" />

          {/* Header */}
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-800">
            <DialogTitle
              className="text-lg text-zinc-900"
              style={{
                fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                fontWeight: 700,
                letterSpacing: '-0.01em'
              }}
            >
              Import from Google Slides
            </DialogTitle>
            <p className="text-sm text-zinc-500 mt-1">
              Select a presentation to import. Maximum {MAX_SLIDES_LIMIT} slides per import.
            </p>
          </DialogHeader>

          {/* Content */}
          <div className="px-6 py-4" style={{ height: '500px' }}>
            {authLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Loader2 className="h-5 w-5 animate-spin text-[#FF6B00]" />
                  Checking connection…
                </div>
              </div>
            ) : !isConnected ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#FF6B00]/10 flex items-center justify-center">
                    <LogIn className="h-8 w-8 text-[#FF6B00]" />
                  </div>
                  <h3 className="text-lg font-semibold text-zinc-900 mb-2">Connect Google Account</h3>
                  <p className="text-sm text-zinc-500 mb-4 max-w-xs">
                    Connect your Google account to import presentations directly from Google Slides.
                  </p>
                  <Button
                    onClick={handleConnect}
                    className="bg-gradient-to-r from-[#FF6B00] to-[#FF8533] hover:from-[#E65D00] hover:to-[#E67420] text-white font-semibold shadow-lg shadow-orange-500/20"
                  >
                    <LogIn className="h-4 w-4 mr-2" />
                    Connect Google
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                {/* Search bar */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1">
                    <Input
                      placeholder="Search presentations…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="h-9 text-sm bg-zinc-50 border-zinc-200 focus:border-[#FF6B00] focus:ring-[#FF6B00]/20"
                    />
                  </div>
                  <Select value={scope} onValueChange={(v) => setScope(v as any)}>
                    <SelectTrigger className="w-[100px] h-9 text-sm bg-zinc-50 border-zinc-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mine">Mine</SelectItem>
                      <SelectItem value="shared">Shared</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => listFiles(true)}
                    disabled={isListing}
                    className="h-9 w-9 text-zinc-400 hover:text-zinc-900"
                  >
                    <RefreshCw className={`h-4 w-4 ${isListing ? 'animate-spin' : ''}`} />
                  </Button>
                </div>

                {/* Connected email */}
                <div className="text-xs text-zinc-400 mb-3">
                  Connected as {connectedEmail || 'your Google account'}
                </div>

                {lastError && (
                  <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 flex items-center justify-between">
                    <span className="text-sm text-red-600">{lastError}</span>
                    <Button size="sm" variant="outline" onClick={handleConnect} className="text-xs">
                      Reconnect
                    </Button>
                  </div>
                )}

                {/* Grid */}
                <div className="flex-1 overflow-y-auto">
                  <div className="grid grid-cols-3 gap-3">
                    {isFirstLoad && Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="rounded-xl overflow-hidden border border-zinc-200 animate-pulse bg-zinc-50">
                        <div style={{ aspectRatio: '16 / 9' }} className="bg-zinc-200" />
                        <div className="p-3 space-y-2">
                          <div className="h-3 bg-zinc-200 rounded w-3/4" />
                          <div className="h-2 bg-zinc-100 rounded w-1/2" />
                        </div>
                      </div>
                    ))}

                    {!isFirstLoad && files.length === 0 && !isListing && (
                      <div className="col-span-3 flex flex-col items-center justify-center py-12 text-zinc-400">
                        <Layers className="h-12 w-12 mb-3 opacity-30" />
                        <p className="text-sm">No presentations found</p>
                      </div>
                    )}

                    {files.map((f) => {
                      const slideCount = slideCountMeta[f.id];
                      const exceedsLimit = slideCount !== undefined && slideCount > MAX_SLIDES_LIMIT;

                      return (
                        <div
                          key={f.id}
                          className={`group rounded-xl overflow-hidden border transition-all ${
                            exceedsLimit
                              ? 'border-red-200 bg-red-50/50 opacity-70'
                              : 'border-zinc-200 bg-white hover:border-[#FF6B00]/50 hover:shadow-md'
                          }`}
                        >
                          {/* Thumbnail */}
                          <div className="relative" style={{ aspectRatio: '16 / 9' }}>
                            {thumbMeta[f.id]?.url || f.thumbnailLink ? (
                              <img
                                src={(thumbMeta[f.id]?.url || f.thumbnailLink)!}
                                alt={f.name}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                onError={() => handleImgError(f)}
                              />
                            ) : (
                              <div className="w-full h-full bg-zinc-100 flex items-center justify-center">
                                <Loader2 className="h-5 w-5 animate-spin text-zinc-300" />
                              </div>
                            )}

                            {/* Slide count badge */}
                            {slideCount !== undefined && (
                              <div className={`absolute bottom-2 right-2 px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 ${
                                exceedsLimit ? 'bg-red-500 text-white' : 'bg-black/60 text-white'
                              }`}>
                                <Layers className="h-3 w-3" />
                                {slideCount}
                              </div>
                            )}

                            {/* Exceeds limit warning */}
                            {exceedsLimit && (
                              <div className="absolute top-2 left-2 right-2">
                                <div className="bg-red-500 text-white text-[10px] font-medium px-2 py-1 rounded flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  Exceeds {MAX_SLIDES_LIMIT} slide limit
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="p-3">
                            <div className="text-sm font-medium text-zinc-900 truncate mb-1" title={f.name}>
                              {f.name}
                            </div>
                            <div className="text-[10px] text-zinc-400 flex items-center gap-2 mb-3">
                              {f.modifiedTime && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {new Date(f.modifiedTime).toLocaleDateString()}
                                </span>
                              )}
                            </div>

                            {/* Import button */}
                            {isImportingId === f.id && importProgress ? (
                              <div className="space-y-1.5">
                                <Progress value={importProgress.progress} className="h-1.5" />
                                <div className="text-[10px] text-zinc-500 text-center">
                                  Slide {importProgress.currentSlide} of {importProgress.totalSlides}
                                </div>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                className={`w-full h-8 text-xs font-semibold ${
                                  exceedsLimit
                                    ? 'bg-zinc-200 text-zinc-500 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-[#FF6B00] to-[#FF8533] hover:from-[#E65D00] hover:to-[#E67420] text-white shadow-sm'
                                }`}
                                onClick={() => handleImport(f)}
                                disabled={isImportingId === f.id || exceedsLimit}
                              >
                                {isImportingId === f.id ? (
                                  <><Loader2 className="h-3 w-3 animate-spin mr-1" />Checking…</>
                                ) : exceedsLimit ? (
                                  'Too Many Slides'
                                ) : (
                                  'Import'
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Sentinel for infinite scroll */}
                    <div ref={sentinelRef} className="col-span-3 h-8 flex items-center justify-center">
                      {hasMore && isListing && files.length > 0 && (
                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading more…
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GoogleSlidesImportModal;
