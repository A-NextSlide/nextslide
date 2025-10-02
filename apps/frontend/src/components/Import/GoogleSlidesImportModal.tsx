import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { googleIntegrationApi, GooglePresentationFile } from '@/services/googleIntegrationApi';
import { useDeckStore } from '@/stores/deckStore';
import { useNavigate } from 'react-router-dom';
import { Loader2, LogIn, RefreshCw, FileText, Clock, User as UserIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { deckSyncService } from '@/lib/deckSyncService';

interface GoogleSlidesImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GoogleSlidesImportModal: React.FC<GoogleSlidesImportModalProps> = ({ open, onOpenChange }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
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
  const retryCountsRef = useRef<Record<string, number>>({});
  const fetchingRef = useRef<Set<string>>(new Set());
  const isFetchingRef = useRef<boolean>(false);

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
    } catch (e: any) {
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
      // Temporary hotfix: don't pass redirectUri until backend uses it only in state
      const url = await googleIntegrationApi.initiateAuth();
      window.location.href = url;
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed to start Google auth', description: e.message || 'Please try again.' });
    }
  }, [toast]);

  const listFiles = useCallback(async (reset: boolean = true) => {
    if (!isConnected) return;
    if (!reset && !nextPageToken) return; // don't refetch first page repeatedly
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

  // Load first page on open (once per open)
  useEffect(() => {
    if (!open) {
      didInitialFetchRef.current = false;
      fetchingRef.current.clear(); // Clear fetching set when modal closes
      isFetchingRef.current = false; // Reset fetching flag
      return;
    }
    if (open && isConnected && !didInitialFetchRef.current) {
      didInitialFetchRef.current = true;
      listFiles(true);
    }
  }, [open, isConnected]);

  // Reload when debounced query changes (only if modal is open)
  useEffect(() => {
    if (open && isConnected) {
      listFiles(true);
    }
  }, [debouncedQuery]);

  // Reload when scope changes (only if modal is open)
  useEffect(() => {
    if (open && isConnected) {
      listFiles(true);
    }
  }, [scope]);

  // Infinite scroll observer (throttled)
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

  // Prefetch per-page thumbnails for the first few items (batch for speed)
  useEffect(() => {
    if (!open || !isConnected || files.length === 0) return;
    const abortController = new AbortController();
    let timeoutId: NodeJS.Timeout;

    // Find files that need thumbnails and aren't already being fetched
    const needsApiThumbnail = (f: GooglePresentationFile) => {
      const meta = thumbMeta[f.id];
      // Need API thumbnail if no meta, or if it's using the low-res Drive thumbnail
      return !meta || (meta.url === f.thumbnailLink);
    };
    
    console.log('[Thumbnails] Files:', files.length, 'Current thumbMeta:', Object.keys(thumbMeta).length);

    (async () => {
      // Prevent multiple simultaneous fetches
      if (isFetchingRef.current) {
        console.log('[Thumbnails] Already fetching, skipping');
        return;
      }
      
      const toPrefetch = files.filter(f => needsApiThumbnail(f) && !fetchingRef.current.has(f.id)).slice(0, 4);
      console.log('[Thumbnails] To prefetch:', toPrefetch.map(f => f.name));
      if (toPrefetch.length === 0) {
        console.log('[Thumbnails] Nothing to prefetch');
        return;
      }
      
      isFetchingRef.current = true;
      
      // Mark these as being fetched
      toPrefetch.forEach(f => fetchingRef.current.add(f.id));
      
      // Seed UI with Drive thumbnails first if available to avoid spinner
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
        // Fetch a smaller batch of MEDIUM PNG thumbnails for faster loading
        console.log('[Thumbnails] Calling API for:', toPrefetch.map(f => f.id));
        const results = await googleIntegrationApi.getSlidePageThumbnailsBatch(
          toPrefetch.map(f => ({ presentationId: f.id, pageId: 'first' })),
          { size: 'MEDIUM', mime: 'PNG' }
        );
        console.log('[Thumbnails] API response:', results);
        if (!Array.isArray(results)) {
          console.log('[Thumbnails] Invalid results format');
          return;
        }
        const byId: Record<string, { url?: string; width?: number; height?: number; ok?: boolean }> = {};
        results.forEach((r: any) => {
          const pid = r?.presentationId;
          if (!pid) return;
          
          // Parse the response structure
          const thumbnail = r?.thumbnail;
          if (thumbnail && thumbnail.contentUrl && thumbnail.width && thumbnail.height) {
            byId[pid] = { 
              url: thumbnail.contentUrl, 
              width: thumbnail.width, 
              height: thumbnail.height, 
              ok: true 
            };
          }
        });
        console.log('[Thumbnails] API results:', Object.keys(byId).length, 'successful');
        setThumbMeta(prev => {
          const next = { ...prev } as Record<string, ThumbMeta>;
          toPrefetch.forEach((f) => {
            const r = byId[f.id];
            if (r && r.ok && r.url && r.width && r.height) {
              next[f.id] = { url: r.url, width: r.width, height: r.height };
            } else if (!next[f.id] && f.thumbnailLink) {
              // Fallback to Drive thumbnail if API result not ok
              next[f.id] = { url: f.thumbnailLink, width: 1600, height: 900 };
            }
          });
          return next;
        });
      } catch (error) {
        console.error('[Thumbnails] API error:', error);
        // Silent; UI will fallback to Drive thumbnails where available
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
        // Remove from fetching set
        toPrefetch.forEach(f => fetchingRef.current.delete(f.id));
        isFetchingRef.current = false;
        
        // Check if there are more to fetch after a small delay
        if (!abortController.signal.aborted) {
          timeoutId = setTimeout(() => {
            const remaining = files.filter(f => needsApiThumbnail(f) && !fetchingRef.current.has(f.id));
            if (remaining.length > 0) {
              // Trigger a re-render to fetch the next batch
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

  const handleImgError = useCallback(async (f: GooglePresentationFile) => {
    const key = f.id;
    const retries = retryCountsRef.current[key] || 0;
    if (retries >= 2) return; // avoid infinite retries
    retryCountsRef.current[key] = retries + 1;
    try {
      const fresh = await googleIntegrationApi.getSlidePageThumbnail(f.id, 'first', { size: 'MEDIUM', mime: 'PNG' });
      const nocacheUrl = `${fresh.contentUrl}${fresh.contentUrl.includes('?') ? '&' : '?'}ts=${Date.now()}`;
      setThumbMeta(prev => ({ ...prev, [key]: { url: nocacheUrl, width: fresh.width, height: fresh.height } }));
    } catch {
      // fallback to drive thumb if available
      if (f.thumbnailLink) {
        setThumbMeta(prev => ({ ...prev, [key]: { url: f.thumbnailLink!, width: 1600, height: 900 } }));
      }
    }
  }, []);

  const handleImport = useCallback(async (file: GooglePresentationFile) => {
    setIsImportingId(file.id);
    let createdDeckId: string | null = null;
    try {
      // 1) Create placeholder deck immediately and announce to deck list
      const baseDeck = await createDefaultDeck();
      if (!baseDeck || !baseDeck.uuid) throw new Error('Failed to create base deck');
      createdDeckId = baseDeck.uuid;

      // Update its name quickly so backend has a meaningful title during import
      const importingName = `${file.name}`;
      updateDeckData({ ...baseDeck, name: importingName, lastModified: new Date().toISOString() }, { skipBackend: true });
      try { await deckSyncService.saveDeck({ ...baseDeck, name: importingName, lastModified: new Date().toISOString() } as any); } catch {}

      // Announce placeholder so DeckList shows loading card
      try {
        window.dispatchEvent(new CustomEvent('deck_created', {
          detail: { deckId: baseDeck.uuid, isGenerating: true, isImporting: true, name: importingName, progress: 5 }
        }));
      } catch {}

      // Close modal immediately
      onOpenChange(false);
      toast({ title: 'Import started', description: `Importing "${file.name}"…` });

      // 2) Start import job and poll in background
      const jobId = await googleIntegrationApi.startImportSlides(file.id);

      // Spinner-only design: no periodic progress events

      const job = await googleIntegrationApi.pollJob<{ deck: any }>(jobId, { intervalMs: 1500, timeoutMs: 180000 });
      const deckJson = (job.result as any)?.deck || job.result;
      if (!deckJson) throw new Error('No deck result returned');

      // 3) Sanitize and save into the created deck
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
      const finalDeck = {
        ...baseDeck,
        uuid: baseDeck.uuid,
        name: cleanedDeckJson.name || importingName,
        slides: cleanedDeckJson.slides || [],
        lastModified: new Date().toISOString(),
      } as any;

      updateDeckData(finalDeck, { skipBackend: true });
      await deckSyncService.saveDeck(finalDeck);

      // 4) Notify deck list to replace placeholder
      try {
        // Ensure any loading state turns off immediately
        window.dispatchEvent(new CustomEvent('deck_progress', {
          detail: { deckId: baseDeck.uuid, progress: 100, currentSlide: 1, totalSlides: 1 }
        }));
        window.dispatchEvent(new CustomEvent('deck_created', {
          detail: { deckId: baseDeck.uuid, isGenerating: false }
        }));
        // Announce import completion for chat suggestion (font optimization)
        window.dispatchEvent(new CustomEvent('deck_import_complete', {
          detail: { deckId: baseDeck.uuid, name: cleanedDeckJson.name || importingName }
        }));
        try {
          // Stash a pending message in case user opens the deck later
          (window as any).__pendingImportMessage = {
            deckId: baseDeck.uuid,
            name: cleanedDeckJson.name || importingName,
            timestamp: Date.now()
          };
        } catch {}
      } catch {}

      toast({ title: 'Import complete', description: `Imported "${file.name}"` });
    } catch (e: any) {
      // Notify of error so placeholder updates
      if (createdDeckId) {
        try {
          window.dispatchEvent(new CustomEvent('deck_error', { detail: { deckId: createdDeckId, message: e?.message } }));
        } catch {}
      }
      toast({ variant: 'destructive', title: 'Import failed', description: e?.message || 'Please try again.' });
    } finally {
      // Nothing to clean up for spinner-only design
      setIsImportingId(null);
    }
  }, [createDefaultDeck, updateDeckData, toast, onOpenChange]);

  const isFirstLoad = files.length === 0 && isListing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Import from Google Slides</DialogTitle>
          <DialogDescription>Connect your Google account, search your Drive presentations, and import a deck.</DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-6">
          {authLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking connection…</div>
          ) : !isConnected ? (
            <div className="border rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Connect your Google account</div>
                <div className="text-xs text-muted-foreground">Enable listing and importing your Google Slides.</div>
              </div>
              <Button size="sm" onClick={handleConnect} className="gap-2"><LogIn className="h-4 w-4" /> Connect</Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs text-muted-foreground">Connected as {connectedEmail || 'your Google account'}</div>
                <Button variant="ghost" size="icon" onClick={() => listFiles(true)} aria-label="Refresh">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <Input
                  placeholder="Search presentations by title…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <Select value={scope} onValueChange={(v) => setScope(v as any)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Mine" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mine">Mine</SelectItem>
                    <SelectItem value="shared">Shared</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={() => listFiles(true)} disabled={isListing}>{isListing ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" />Searching…</>) : 'Search'}</Button>
              </div>
              {lastError && (
                <div className="mb-3 text-xs text-red-600 flex items-center justify-between">
                  <span className="truncate pr-2">{lastError}</span>
                  <Button size="sm" variant="outline" onClick={handleConnect}>Reconnect Google</Button>
                </div>
              )}
              <div className="grid grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto pr-1">
                {isFirstLoad && Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="border rounded-lg overflow-hidden animate-pulse">
                    <div className="aspect-[4/3] bg-muted/40" />
                    <div className="p-3 space-y-2">
                      <div className="h-3 bg-muted/40 rounded w-3/4" />
                      <div className="h-2 bg-muted/30 rounded w-1/2" />
                    </div>
                  </div>
                ))}
                {!isFirstLoad && files.length === 0 && !isListing && (
                  <div className="col-span-3 text-sm text-muted-foreground">No presentations found.</div>
                )}
                {files.map((f) => (
                  <div key={f.id} className="group relative border rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
                    <div
                      className="w-full bg-muted/30 flex items-center justify-center overflow-hidden"
                      style={{ aspectRatio: thumbMeta[f.id] ? `${thumbMeta[f.id].width} / ${thumbMeta[f.id].height}` : '16 / 9' }}
                    >
                      {thumbMeta[f.id]?.url || f.thumbnailLink ? (
                        <img
                          src={(thumbMeta[f.id]?.url || f.thumbnailLink)!}
                          width={thumbMeta[f.id]?.width || 1600}
                          height={thumbMeta[f.id]?.height || 900}
                          alt={f.name}
                          className="w-full h-full object-contain"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={() => handleImgError(f)}
                        />
                      ) : (
                        <div className="flex flex-col items-center text-muted-foreground">
                          <Loader2 className="h-6 w-6 animate-spin" />
                          <span className="text-xs mt-2">Preview loading…</span>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="text-sm font-medium truncate" title={f.name}>{f.name}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-2">
                        {f.modifiedTime && (
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(f.modifiedTime).toLocaleString()}</span>
                        )}
                        {f.owners?.[0]?.emailAddress && (
                          <span className="inline-flex items-center gap-1"><UserIcon className="h-3 w-3" />{f.owners[0].emailAddress}</span>
                        )}
                      </div>
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" onClick={() => handleImport(f)} disabled={isImportingId === f.id}>
                          {isImportingId === f.id ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" />Importing…</>) : 'Import'}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {/* Sentinel */}
                <div ref={sentinelRef} className="col-span-3 h-8 flex items-center justify-center">
                  {hasMore && isListing && files.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading more…
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GoogleSlidesImportModal;


