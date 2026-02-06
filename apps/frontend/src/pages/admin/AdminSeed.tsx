import React, { useState, useEffect, useRef, useCallback } from 'react';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { adminApi } from '@/services/adminApi';
import type { SeoFeaturedDeck, SeoCommunityDeck } from '@/services/adminApi';
import {
  Sprout,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize2,
  X,
  Star,
  Globe,
  Search,
  RefreshCw,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────
type Tab = 'featured' | 'community';

const CATEGORIES = ['all', 'business', 'education', 'marketing', 'creative', 'technology', 'personal'] as const;

// ── Helpers ────────────────────────────────────────────────────────────────
function extractSlideHtml(firstSlide: any): string | null {
  if (!firstSlide) return null;
  const components = firstSlide.components || firstSlide.content?.components || [];
  for (const c of components) {
    if (c.type === 'CustomComponent' && c.props?.render) {
      return c.props.render;
    }
  }
  return null;
}

const IFRAME_IMAGE_HANDLER = `
<style>
img[src="placeholder"], img[src=""], img:not([src]) {
  background: linear-gradient(135deg, rgba(255,67,1,0.12) 0%, rgba(30,41,59,0.25) 100%);
  min-height: 80px;
  border-radius: 8px;
  display: block;
}
</style>
<script>
document.addEventListener('error', function(e) {
  if (e.target.tagName === 'IMG') {
    e.target.style.background = 'linear-gradient(135deg, rgba(255,67,1,0.12), rgba(30,41,59,0.25))';
    e.target.style.minHeight = '80px';
    e.target.style.borderRadius = '8px';
    e.target.style.display = 'block';
    e.target.removeAttribute('src');
  }
}, true);
</script>`;

function injectImageHandler(html: string): string {
  if (!html) return html;
  if (html.includes('</head>')) return html.replace('</head>', IFRAME_IMAGE_HANDLER + '</head>');
  if (html.includes('</body>')) return html.replace('</body>', IFRAME_IMAGE_HANDLER + '</body>');
  return html + IFRAME_IMAGE_HANDLER;
}

// ── Main Component ─────────────────────────────────────────────────────────
const AdminSeed: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('featured');
  const [loading, setLoading] = useState(true);

  // Featured
  const [featured, setFeatured] = useState<SeoFeaturedDeck[]>([]);
  const [expandedFeatured, setExpandedFeatured] = useState<Set<string>>(new Set());

  // Community
  const [community, setCommunity] = useState<SeoCommunityDeck[]>([]);
  const [expandedCommunity, setExpandedCommunity] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Search
  const [search, setSearch] = useState('');

  // Presentation overlay
  const [presentDeck, setPresentDeck] = useState<{ html: string; title: string } | null>(null);

  // ── Fetch data ────────────────────────────────────────────────────────
  const fetchFeatured = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.seoFeaturedDecks();
      setFeatured(res.decks || []);
    } catch (e) {
      console.error('Failed to fetch featured decks', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCommunity = useCallback(async (category?: string) => {
    setLoading(true);
    try {
      const cat = category && category !== 'all' ? category : undefined;
      const res = await adminApi.seoCommunityDecks(cat);
      setCommunity(res.decks || []);
    } catch (e) {
      console.error('Failed to fetch community decks', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'featured') fetchFeatured();
    else fetchCommunity(selectedCategory);
  }, [activeTab, selectedCategory, fetchFeatured, fetchCommunity]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const toggleFeatured = (uuid: string) => {
    setExpandedFeatured(prev => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  const toggleCommunity = (uuid: string) => {
    setExpandedCommunity(prev => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  const expandAll = () => {
    if (activeTab === 'featured') {
      setExpandedFeatured(new Set(filteredFeatured.map(d => d.uuid)));
    } else {
      setExpandedCommunity(new Set(filteredCommunity.map(d => d.deck_uuid)));
    }
  };

  const collapseAll = () => {
    if (activeTab === 'featured') setExpandedFeatured(new Set());
    else setExpandedCommunity(new Set());
  };

  const handleRemoveFeatured = async (uuid: string) => {
    try {
      await adminApi.seoRemoveFeatured(uuid);
      setFeatured(prev => prev.filter(d => d.uuid !== uuid));
    } catch (e) {
      console.error('Failed to remove featured deck', e);
    }
  };

  const handleRemoveCommunity = async (uuid: string) => {
    try {
      await adminApi.seoRemoveCommunity(uuid);
      setCommunity(prev => prev.filter(d => d.deck_uuid !== uuid));
    } catch (e) {
      console.error('Failed to remove community deck', e);
    }
  };

  // ── Filtered lists ────────────────────────────────────────────────────
  const filteredFeatured = featured.filter(d =>
    !search || d.name?.toLowerCase().includes(search.toLowerCase()) || d.description?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredCommunity = community.filter(d =>
    !search || d.title?.toLowerCase().includes(search.toLowerCase())
  );

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'featured', label: 'Featured', count: featured.length },
    { id: 'community', label: 'Community', count: community.length },
  ];

  return (
    <AdminLayoutV2>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sprout className="h-4 w-4 text-[#FF4301]" />
            <h1 className="text-sm font-semibold text-black dark:text-white">Seed Decks</h1>
            <span className="text-[10px] text-[#999] tabular-nums">
              {activeTab === 'featured' ? featured.length : community.length} decks
            </span>
          </div>
          <button
            onClick={() => activeTab === 'featured' ? fetchFeatured() : fetchCommunity(selectedCategory)}
            disabled={loading}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-[#999] hover:text-black dark:hover:text-white hover:bg-[#f5f5f5] dark:hover:bg-[#222] transition-colors"
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {/* Tabs + Search */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-0.5">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                  activeTab === tab.id
                    ? 'bg-[#FF4301] text-white'
                    : 'text-[#999] hover:text-black dark:hover:text-white hover:bg-[#f5f5f5] dark:hover:bg-[#222]'
                )}
              >
                {tab.label}
                <span className="ml-1 opacity-60 tabular-nums">{tab.count}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* Category filter (community only) */}
            {activeTab === 'community' && (
              <div className="flex items-center gap-0.5">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      'px-1.5 py-0.5 rounded text-[9px] transition-colors capitalize',
                      selectedCategory === cat
                        ? 'text-[#FF4301] font-medium bg-[#FF4301]/5'
                        : 'text-[#999] hover:text-[#666]'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#999]" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter..."
                className="w-[160px] pl-7 pr-2 py-1 text-[10px] bg-[#fafafa] dark:bg-[#0a0a0a] border border-[#eaeaea] dark:border-[#333] rounded-md text-black dark:text-white placeholder:text-[#999] focus:outline-none focus:ring-1 focus:ring-[#FF4301]/40"
              />
            </div>
          </div>
        </div>

        {/* Expand / Collapse controls */}
        <div className="flex items-center gap-1">
          <button onClick={expandAll} className="text-[9px] text-[#999] hover:text-[#666] dark:hover:text-[#ccc] transition-colors">
            Expand all
          </button>
          <span className="text-[#ddd] dark:text-[#444]">·</span>
          <button onClick={collapseAll} className="text-[9px] text-[#999] hover:text-[#666] dark:hover:text-[#ccc] transition-colors">
            Collapse
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-[#FF4301]" />
          </div>
        )}

        {/* ── Featured Tab ──────────────────────────────────────────── */}
        {!loading && activeTab === 'featured' && (
          <div className="border border-[#eaeaea] dark:border-[#333] rounded-lg overflow-hidden divide-y divide-[#eaeaea] dark:divide-[#333]">
            {filteredFeatured.length === 0 ? (
              <div className="py-12 text-center">
                <Star className="h-5 w-5 text-[#ddd] dark:text-[#444] mx-auto mb-2" />
                <p className="text-[11px] text-[#999]">No featured decks found</p>
              </div>
            ) : (
              filteredFeatured.map(deck => (
                <DeckRow
                  key={deck.uuid}
                  uuid={deck.uuid}
                  title={deck.name}
                  subtitle={deck.description}
                  slideCount={deck.slide_count}
                  badge={`#${deck.display_order}`}
                  badgeColor="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20"
                  firstSlide={deck.first_slide}
                  expanded={expandedFeatured.has(deck.uuid)}
                  onToggle={() => toggleFeatured(deck.uuid)}
                  onPresent={(html) => setPresentDeck({ html, title: deck.name })}
                  onRemove={() => handleRemoveFeatured(deck.uuid)}
                  meta={deck.is_active ? undefined : 'Inactive'}
                />
              ))
            )}
          </div>
        )}

        {/* ── Community Tab ─────────────────────────────────────────── */}
        {!loading && activeTab === 'community' && (
          <div className="border border-[#eaeaea] dark:border-[#333] rounded-lg overflow-hidden divide-y divide-[#eaeaea] dark:divide-[#333]">
            {filteredCommunity.length === 0 ? (
              <div className="py-12 text-center">
                <Globe className="h-5 w-5 text-[#ddd] dark:text-[#444] mx-auto mb-2" />
                <p className="text-[11px] text-[#999]">No community decks found</p>
              </div>
            ) : (
              filteredCommunity.map(deck => (
                <DeckRow
                  key={deck.deck_uuid}
                  uuid={deck.deck_uuid}
                  title={deck.title}
                  subtitle={deck.category}
                  slideCount={deck.slide_count}
                  badge={deck.category}
                  badgeColor="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20"
                  firstSlide={deck.first_slide}
                  expanded={expandedCommunity.has(deck.deck_uuid)}
                  onToggle={() => toggleCommunity(deck.deck_uuid)}
                  onPresent={(html) => setPresentDeck({ html, title: deck.title })}
                  onRemove={() => handleRemoveCommunity(deck.deck_uuid)}
                  meta={`${deck.view_count} views · ${deck.remix_count} remixes`}
                  tags={deck.tags}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Presentation Overlay ──────────────────────────────────────── */}
      {presentDeck && (
        <PresentationOverlay
          html={presentDeck.html}
          title={presentDeck.title}
          onClose={() => setPresentDeck(null)}
        />
      )}
    </AdminLayoutV2>
  );
};

// ── Deck Row (collapsed/expanded) ──────────────────────────────────────────
const DeckRow: React.FC<{
  uuid: string;
  title: string;
  subtitle?: string;
  slideCount: number;
  badge: string;
  badgeColor: string;
  firstSlide: any;
  expanded: boolean;
  onToggle: () => void;
  onPresent: (html: string) => void;
  onRemove: () => void;
  meta?: string;
  tags?: string[];
}> = ({ uuid, title, subtitle, slideCount, badge, badgeColor, firstSlide, expanded, onToggle, onPresent, onRemove, meta, tags }) => {
  const html = extractSlideHtml(firstSlide);

  return (
    <div className="bg-white dark:bg-[#111]">
      {/* Collapsed row */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#fafafa] dark:hover:bg-[#161616] transition-colors group"
        onClick={onToggle}
      >
        {/* Badge */}
        <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-medium flex-shrink-0 capitalize', badgeColor)}>
          {badge}
        </span>

        {/* Title */}
        <span className="text-[11px] font-medium text-black dark:text-white truncate flex-1 min-w-0">
          {title}
        </span>

        {/* Tags */}
        {tags && tags.length > 0 && (
          <div className="hidden sm:flex items-center gap-0.5 flex-shrink-0">
            {tags.slice(0, 3).map(tag => (
              <span key={tag} className="px-1 py-0 rounded text-[8px] text-[#999] bg-[#f5f5f5] dark:bg-[#222]">{tag}</span>
            ))}
          </div>
        )}

        {/* Slide count */}
        <span className="text-[10px] text-[#999] tabular-nums flex-shrink-0">
          {slideCount} slides
        </span>

        {/* Meta */}
        {meta && (
          <span className="text-[9px] text-[#bbb] dark:text-[#555] flex-shrink-0 hidden sm:inline">
            {meta}
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {html && (
            <button
              onClick={(e) => { e.stopPropagation(); onPresent(html); }}
              className="p-1 rounded hover:bg-[#eee] dark:hover:bg-[#333] transition-colors text-[#999] hover:text-[#FF4301]"
              title="View full size"
            >
              <Maximize2 className="h-2.5 w-2.5" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-[#ccc] dark:text-[#555] hover:text-red-500"
            title="Remove"
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </div>

        {/* Expand chevron */}
        <span className="text-[#ccc] dark:text-[#444] flex-shrink-0">
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </div>

      {/* Expanded: large slide preview */}
      {expanded && (
        <div className="px-3 pb-3 pt-1">
          {html ? (
            <div
              className="cursor-pointer group/slide"
              onClick={() => onPresent(html)}
            >
              <SlidePreview html={html} />
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[9px] text-[#bbb] dark:text-[#555] font-mono truncate">{uuid.slice(0, 8)}...</span>
                <span className="text-[9px] text-[#999] opacity-0 group-hover/slide:opacity-100 transition-opacity inline-flex items-center gap-0.5">
                  <Maximize2 className="h-2 w-2" />
                  Click to enlarge
                </span>
              </div>
            </div>
          ) : (
            <div className="aspect-video bg-[#f5f5f5] dark:bg-[#1a1a1a] rounded-lg flex items-center justify-center border border-[#eaeaea] dark:border-[#333]">
              <p className="text-[10px] text-[#bbb] dark:text-[#555]">No slide preview available</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Slide Preview (responsive iframe) ──────────────────────────────────────
const SlidePreview: React.FC<{ html: string }> = ({ html }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const { width } = el.getBoundingClientRect();
      setScale(width / 1920);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(injectImageHandler(html));
    doc.close();
  }, [html]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden border border-[#eaeaea] dark:border-[#333] hover:border-[#FF4301]/40 transition-colors bg-[#0f172a] relative"
      style={{ aspectRatio: '16/9' }}
    >
      <iframe
        ref={iframeRef}
        className="pointer-events-none border-0 absolute top-0 left-0"
        style={{ width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        tabIndex={-1}
        sandbox="allow-same-origin allow-scripts"
        title="Slide preview"
      />
    </div>
  );
};

// ── Presentation Overlay ───────────────────────────────────────────────────
const PresentationOverlay: React.FC<{
  html: string;
  title: string;
  onClose: () => void;
}> = ({ html, title, onClose }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setScale(Math.min(width / 1920, height / 1080));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(injectImageHandler(html));
    doc.close();
  }, [html]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-black/90 border-b border-white/10 z-10">
        <span className="text-white/60 text-[11px] font-medium truncate max-w-[400px]">{title}</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-white/10 transition-colors text-white/50 hover:text-white">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Slide */}
      <div className="flex-1 flex items-center justify-center p-4 bg-black min-h-0">
        <div
          ref={containerRef}
          className="relative w-full h-full max-w-[1280px]"
          style={{ aspectRatio: '16/9', maxHeight: 'calc(100vh - 60px)' }}
        >
          <div className="absolute inset-0 rounded-lg overflow-hidden shadow-2xl shadow-black/60">
            <iframe
              ref={iframeRef}
              className="border-0"
              style={{ width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: 'top left' }}
              tabIndex={-1}
              sandbox="allow-same-origin allow-scripts"
              title="Full slide"
            />
          </div>
        </div>
      </div>

      {/* Bottom hint */}
      <div className="flex items-center justify-center px-4 py-1.5 bg-black/90 border-t border-white/10">
        <span className="text-[10px] text-white/30">Press Esc to close</span>
      </div>
    </div>
  );
};

export default AdminSeed;
