import React, { useState, useEffect, useRef, useCallback } from 'react';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Trash2, Loader2, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FontApiService } from '@/services/FontApiService';
import { FontLoadingService } from '@/services/FontLoadingService';
import { getFontFamilyWithFallback } from '@/utils/fontUtils';

interface FontEntry {
  id: string;
  name: string;
  source: string;
  category: string;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Shared design tokens (match AdminBrands / AdminServices)
// ---------------------------------------------------------------------------
const sectionHeading = "text-[10px] font-bold uppercase tracking-wider text-[#FF4301]";
const cardClass = "bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl";

// ---------------------------------------------------------------------------
// LazyFontPreview — renders a font name in its actual typeface once visible
// ---------------------------------------------------------------------------
const LazyFontPreview: React.FC<{ fontName: string }> = ({ fontName }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [loaded, setLoaded] = useState(FontLoadingService.isFontLoaded(fontName));

  useEffect(() => {
    if (loaded) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          FontLoadingService.loadFont(fontName)
            .then(() => setLoaded(true))
            .catch(() => setLoaded(true));
          observer.disconnect();
        }
      },
      { rootMargin: '200px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fontName, loaded]);

  return (
    <span
      ref={ref}
      className={cn("text-lg leading-tight transition-opacity", loaded ? "opacity-100" : "opacity-30")}
      style={{
        fontFamily: loaded ? getFontFamilyWithFallback(fontName) : 'system-ui, sans-serif',
      }}
    >
      {fontName}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Source filter values
// ---------------------------------------------------------------------------
const SOURCE_FILTERS = ['All', 'pixelbuddha', 'designer', 'google', 'system'] as const;

const sourceLabel = (s: string) => {
  switch (s) {
    case 'pixelbuddha': return 'PixelBuddha';
    case 'designer': return 'Designer';
    case 'google': return 'Google';
    case 'system': return 'System';
    default: return s;
  }
};

const sourceBadgeClass = (s: string) => {
  switch (s) {
    case 'pixelbuddha': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
    case 'designer': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'google': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    case 'system': return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    default: return '';
  }
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
const AdminFonts: React.FC = () => {
  const [fonts, setFonts] = useState<FontEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('All');
  const [deleteTarget, setDeleteTarget] = useState<FontEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch all fonts on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const list = await FontApiService.listFonts(undefined, undefined, 5000, 0, false);
        setFonts(list as FontEntry[]);
      } catch (e) {
        console.error('Failed to load fonts', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Client-side filtering
  const filtered = fonts.filter((f) => {
    if (sourceFilter !== 'All' && f.source !== sourceFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!f.name.toLowerCase().includes(q) && !f.id.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Source counts
  const sourceCounts: Record<string, number> = {};
  for (const f of fonts) {
    sourceCounts[f.source] = (sourceCounts[f.source] || 0) + 1;
  }

  // Delete handler
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await FontApiService.deleteFont(deleteTarget.id);
      setFonts((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e: any) {
      console.error('Failed to delete font', e);
      alert(e.message || 'Failed to delete font');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  return (
    <AdminLayoutV2>
      <div className="w-full space-y-3">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1
              className="text-sm font-bold uppercase tracking-wider"
              style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}
            >
              Fonts
            </h1>
            <span className="text-[11px] font-mono text-[#666] dark:text-[#888]">
              {loading ? '...' : fonts.length}
            </span>
          </div>
        </div>

        {/* Search */}
        <section>
          <h2 className={sectionHeading} style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Search</h2>
          <div className="relative mt-1.5">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#999]" />
            <Input
              placeholder="Search fonts by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm bg-white dark:bg-[#111] border-[#eaeaea] dark:border-[#333]"
            />
          </div>
        </section>

        {/* Source filter pills */}
        <section>
          <h2 className={sectionHeading} style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Source</h2>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {SOURCE_FILTERS.map((s) => {
              const isActive = sourceFilter === s;
              const count = s === 'All' ? fonts.length : (sourceCounts[s] || 0);
              if (s !== 'All' && count === 0) return null;
              return (
                <button
                  key={s}
                  onClick={() => setSourceFilter(s)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium transition-all",
                    isActive
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-border"
                  )}
                >
                  {s === 'All' ? 'All' : sourceLabel(s)}
                  <span className="ml-1.5 opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Font grid */}
        <section>
          <h2 className={sectionHeading} style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
            Font Library
            {!loading && <span className="ml-1.5 text-[#999] font-normal normal-case">{filtered.length} shown</span>}
          </h2>

          <div className={cn(cardClass, "mt-1.5 overflow-hidden")}>
            <ScrollArea className="h-[calc(100vh-300px)]">
              {loading ? (
                <div className="py-16 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading fonts...
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Type className="h-12 w-12 text-muted-foreground mb-4 opacity-40" />
                  <h3 className="text-sm font-semibold">No fonts found</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {searchQuery ? 'Try adjusting your search' : 'No fonts loaded'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[#eaeaea] dark:bg-[#333]">
                  {filtered.map((font) => (
                    <div
                      key={font.id}
                      className="bg-white dark:bg-[#111] p-4 flex flex-col gap-2 group"
                    >
                      {/* Font preview */}
                      <div className="min-h-[40px] flex items-end">
                        <LazyFontPreview fontName={font.name} />
                      </div>

                      {/* Meta row */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border-0", sourceBadgeClass(font.source))}>
                          {sourceLabel(font.source)}
                        </Badge>
                        {font.category && font.category !== 'unknown' && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {font.category}
                          </Badge>
                        )}
                      </div>

                      {/* Tags */}
                      {font.tags && font.tags.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {font.tags.slice(0, 4).map((tag) => (
                            <span key={tag} className="text-[10px] text-muted-foreground">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* ID + delete */}
                      <div className="flex items-center justify-between mt-auto pt-1">
                        <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[70%]" title={font.id}>
                          {font.id}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 hover:bg-red-50 transition-opacity"
                          onClick={() => setDeleteTarget(font)}
                          title="Delete font"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </section>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Font</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong> ({deleteTarget?.id})?
              This removes it from the font registry. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayoutV2>
  );
};

export default AdminFonts;
