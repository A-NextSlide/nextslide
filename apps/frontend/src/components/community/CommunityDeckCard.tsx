import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Eye, Loader2, Layers } from 'lucide-react';
import { CommunityDeck, COMMUNITY_CATEGORIES } from '@/services/communityService';
import { cn } from '@/lib/utils';
const HK = '"HK Grotesk", "Hanken Grotesk", sans-serif';

interface CommunityDeckCardProps {
  deck: CommunityDeck;
  onRemix?: (deck: CommunityDeck) => void;
  onView?: (deck: CommunityDeck) => void;
  isRemixing?: boolean;
  showRemixButton?: boolean;
  className?: string;
}

/**
 * Extract background CSS from slide component data.
 * Used as a lightweight fallback when no PNG thumbnail exists.
 */
function extractBgStyle(slide: any): React.CSSProperties {
  if (!slide) return { background: '#27272a' };
  const comps = slide.components || [];
  const bg = comps.find(
    (c: any) => c.type === 'Background' || c.id?.toLowerCase().includes('background'),
  );
  if (!bg) return { background: '#27272a' };
  const props: any = bg.props || {};

  if (props.gradient && typeof props.gradient === 'object') {
    const g = props.gradient;
    const rawStops = g.stops || g.colors || [];
    if (rawStops.length > 0) {
      const stops = rawStops
        .filter((s: any) => s?.color)
        .map((s: any, i: number, arr: any[]) => {
          let pos = s.position ?? (i / Math.max(1, arr.length - 1)) * 100;
          if (pos <= 1 && arr.every((st: any) => (st.position ?? 0) <= 1)) pos *= 100;
          return `${s.color} ${pos}%`;
        })
        .join(', ');
      if (stops) {
        if (g.type === 'radial') return { background: `radial-gradient(circle, ${stops})` };
        const angle = typeof g.angle === 'number' ? g.angle : 180;
        return { background: `linear-gradient(${angle}deg, ${stops})` };
      }
    }
  }
  if (typeof props.gradient === 'string' && props.gradient) return { background: props.gradient };
  const color = props.backgroundColor || props.color || props.style?.background;
  if (color) return { background: color };
  return { background: '#27272a' };
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

const CommunityDeckCard: React.FC<CommunityDeckCardProps> = ({
  deck,
  onRemix,
  onView,
  isRemixing = false,
  showRemixButton = true,
  className,
}) => {
  const category = COMMUNITY_CATEGORIES[deck.category as keyof typeof COMMUNITY_CATEGORIES];
  const thumbnailUrl = deck.thumbnailUrl || null;
  const bgStyle = useMemo(() => extractBgStyle(deck.firstSlide), [deck.firstSlide]);

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    onView?.(deck);
  };

  return (
    <div
      className={cn('group relative cursor-pointer', className)}
      onClick={handleCardClick}
    >
      {/* Card container */}
      <div
        className={cn(
          'relative aspect-[16/9] w-full overflow-hidden rounded-xl',
          'ring-1 ring-black/[0.06] dark:ring-white/[0.08]',
        )}
      >
        {/* ── Layer 0: Background gradient fallback ────────────────────── */}
        <div className="absolute inset-0" style={bgStyle} />

        {/* ── Layer 1: Static PNG thumbnail ────────────────────────────── */}
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}

        {/* ── Gradient scrim at bottom ─────────────────────────────────── */}
        <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-black/80 via-black/40 to-transparent z-[3] pointer-events-none" />

        {/* ── Category pill (top-left) ─────────────────────────────────── */}
        <div className="absolute top-2.5 left-2.5 z-[4]">
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase"
            style={{
              fontFamily: HK,
              backgroundColor: `${category?.color}dd`,
              color: 'white',
              letterSpacing: '0.06em',
            }}
          >
            {category?.name || deck.category}
          </span>
        </div>

        {/* ── Slide count (top-right) ──────────────────────────────────── */}
        <div className="absolute top-2.5 right-2.5 z-[4]">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-white/80 bg-black/40">
            <Layers className="h-3 w-3" />
            {deck.slideCount}
          </span>
        </div>

        {/* ── Bottom metadata ──────────────────────────────────────────── */}
        <div className="absolute inset-x-0 bottom-0 px-3 pb-2.5 pt-6 z-[4]">
          <h3
            className="text-[13px] font-bold text-white truncate leading-tight"
            title={deck.title}
            style={{ fontFamily: HK }}
          >
            {deck.title}
          </h3>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-white/60" style={{ fontFamily: HK }}>
            {deck.authorName && (
              <span className="truncate max-w-[45%]">{deck.authorName}</span>
            )}
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {formatCount(deck.viewCount)}
            </span>
            <span className="flex items-center gap-1">
              <Copy className="h-3 w-3" />
              {formatCount(deck.remixCount)}
            </span>
          </div>
        </div>

        {/* ── Remix button (desktop hover) ─────────────────────────────── */}
        {showRemixButton && onRemix && (
          <Button
            size="sm"
            className={cn(
              'absolute bottom-2.5 right-2.5 z-[5] h-7 px-2.5',
              'bg-white hover:bg-zinc-50 text-zinc-900 text-[11px] font-semibold shadow-lg',
            )}
            style={{ fontFamily: HK }}
            onClick={(e) => {
              e.stopPropagation();
              onRemix(deck);
            }}
            disabled={isRemixing}
          >
            {isRemixing ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Remixing
              </>
            ) : (
              <>
                <Copy className="h-3 w-3 mr-1" />
                Remix
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

export default React.memo(CommunityDeckCard);
