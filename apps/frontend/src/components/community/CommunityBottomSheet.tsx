import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Trophy,
  Crown,
  Medal,
  Eye,
  Copy,
  FileStack,
  Star,
  Globe,
  Flame,
  Layers,
  TrendingUp,
} from 'lucide-react';
import { gamificationApi, type LeaderboardEntry } from '@/services/gamificationApi';
import { COMMUNITY_CATEGORIES } from '@/services/communityService';
import type { CommunityDeck } from '@/services/communityService';
import CommunityGallery from './CommunityGallery';
import { cn } from '@/lib/utils';


const HK = '"HK Grotesk", "Hanken Grotesk", sans-serif';

// ── Helpers ──────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function extractBgStyle(slide: any): React.CSSProperties {
  if (!slide) return { background: '#18181b' };
  const comps = slide.components || [];
  const bg = comps.find(
    (c: any) => c.type === 'Background' || c.id?.toLowerCase().includes('background'),
  );
  if (!bg) return { background: '#18181b' };
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
        return { background: `linear-gradient(${typeof g.angle === 'number' ? g.angle : 180}deg, ${stops})` };
      }
    }
  }
  if (typeof props.gradient === 'string' && props.gradient) return { background: props.gradient };
  const color = props.backgroundColor || props.color || props.style?.background;
  if (color) return { background: color };
  return { background: '#18181b' };
}

// ── Podium config ────────────────────────────────────────────────────────

type PodiumCfg = {
  ring: string;
  badgeBg: string;
  Icon: React.FC<{ className?: string }>;
};

const PODIUM: Record<number, PodiumCfg> = {
  1: { ring: 'ring-[#FF4301]/50', badgeBg: 'bg-[#FF4301]', Icon: Crown },
  2: { ring: 'ring-[#FF4301]/25', badgeBg: 'bg-[#FF6B3D]', Icon: Medal },
  3: { ring: 'ring-[#FF4301]/15', badgeBg: 'bg-[#FF8F6B]', Icon: Trophy },
};

// ── Skeleton ─────────────────────────────────────────────────────────────

const SkeletonHero = () => (
  <div className="w-full aspect-[16/9] rounded-2xl bg-zinc-200/60 dark:bg-zinc-800/60 overflow-hidden">
    <div
      className="w-full h-full"
      style={{
        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)',
        animation: 'shimmer 1.8s ease-in-out infinite',
      }}
    />
  </div>
);

const SkeletonRunner = () => (
  <div className="flex-shrink-0 w-[180px] aspect-[16/9] rounded-xl bg-zinc-200/60 dark:bg-zinc-800/60 overflow-hidden">
    <div
      className="w-full h-full"
      style={{
        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)',
        animation: 'shimmer 1.8s ease-in-out infinite',
      }}
    />
  </div>
);

// ═════════════════════════════════════════════════════════════════════════
// BOTTOM SHEET
// ═════════════════════════════════════════════════════════════════════════

interface CommunityBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onDeckClick?: (deck: CommunityDeck) => void;
}

const CommunityBottomSheet: React.FC<CommunityBottomSheetProps> = ({
  isOpen,
  onClose,
  onDeckClick,
}) => {
  const navigate = useNavigate();

  const [lbPeriod, setLbPeriod] = useState<'weekly' | 'all_time'>('weekly');
  const [lbMetric, setLbMetric] = useState<'views' | 'remixes'>('views');

  const { data: leaderboardData, isLoading: lbLoading } = useQuery({
    queryKey: ['leaderboard', lbPeriod, lbMetric],
    queryFn: () => gamificationApi.getLeaderboard(lbPeriod, lbMetric, 10),
    staleTime: 60_000,
    enabled: isOpen,
  });

  const heroEntry = leaderboardData?.entries[0] || null;
  const podiumEntries = leaderboardData?.entries.slice(1, 3) || [];
  const runnerEntries = leaderboardData?.entries.slice(3) || [];

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className={cn(
          'h-[92vh] rounded-t-3xl p-0 overflow-hidden border-0',
          'flex flex-col bg-white dark:bg-zinc-950',
        )}
      >
        {/* Accent bar */}
        <div className="h-[3px] bg-gradient-to-r from-[#FF4301] via-[#FF6B3D] to-[#FF4301] shrink-0" />

        {/* Pull handle */}
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-9 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 pb-3 shrink-0">
          <SheetHeader className="text-left space-y-0">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-[#FF4301]">
                <Flame className="h-4 w-4 text-white" />
              </div>
              <SheetTitle
                className="text-lg text-zinc-900 dark:text-white"
                style={{ fontFamily: HK, fontWeight: 800, letterSpacing: '-0.03em' }}
              >
                Community
              </SheetTitle>
              <SheetDescription className="sr-only">Community presentations</SheetDescription>
            </div>
          </SheetHeader>
        </div>

        {/* ── Scrollable content ──────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {isOpen && (
            <>
              {/* ═══ LEADERBOARD ═══ */}
              <section className="px-5 pb-5">
                <div className="max-w-3xl mx-auto">
                  {/* Section header + toggles */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-[#FF4301]" />
                      <h2
                        className="text-sm font-bold text-zinc-900 dark:text-white"
                        style={{ fontFamily: HK }}
                      >
                        Top Presentations
                      </h2>
                    </div>

                    {/* Compact toggle pills */}
                    <div className="flex items-center gap-1">
                      <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
                        {([['weekly', 'Week'], ['all_time', 'All']] as const).map(([p, label]) => (
                          <button
                            key={p}
                            onClick={() => setLbPeriod(p)}
                            className={cn(
                              'px-2 py-1 rounded-md text-[11px] font-semibold transition-all',
                              lbPeriod === p
                                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                                : 'text-zinc-500 dark:text-zinc-400',
                            )}
                            style={{ fontFamily: HK }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
                        {([['views', Eye], ['remixes', Copy]] as const).map(([m, Icon]) => (
                          <button
                            key={m}
                            onClick={() => setLbMetric(m as 'views' | 'remixes')}
                            className={cn(
                              'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-all',
                              lbMetric === m
                                ? 'bg-[#FF4301]/10 text-[#FF4301] shadow-sm'
                                : 'text-zinc-500 dark:text-zinc-400',
                            )}
                            style={{ fontFamily: HK }}
                          >
                            <Icon className="h-3 w-3" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Leaderboard content */}
                  {lbLoading ? (
                    <div className="space-y-3">
                      <SkeletonHero />
                      <div className="flex gap-3 overflow-hidden">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <SkeletonRunner key={i} />
                        ))}
                      </div>
                    </div>
                  ) : heroEntry ? (
                    <div className="space-y-3">
                      {/* ── #1 Hero card ──────────────────────────────── */}
                      <HeroCard
                        entry={heroEntry}
                        onClick={() => navigate(`/community/${heroEntry.id}`)}
                      />

                      {/* ── #2 & #3 side by side ──────────────────────── */}
                      {podiumEntries.length > 0 && (
                        <div className="grid grid-cols-2 gap-3">
                          {podiumEntries.map((entry, idx) => (
                            <PodiumCard
                              key={entry.id}
                              entry={entry}
                              rank={idx + 2}
                              onClick={() => navigate(`/community/${entry.id}`)}
                            />
                          ))}
                        </div>
                      )}

                      {/* ── Runners strip (#4+) ──────────────────────── */}
                      {runnerEntries.length > 0 && (
                        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                          {runnerEntries.map((entry) => (
                            <div key={entry.id} className="flex-shrink-0 w-[180px]">
                              <RunnerCard
                                entry={entry}
                                onClick={() => navigate(`/community/${entry.id}`)}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-8 text-center">
                      <p className="text-sm text-zinc-400" style={{ fontFamily: HK }}>
                        No rankings yet for this period
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {/* Divider */}
              <div className="mx-5 h-px bg-zinc-200/70 dark:bg-zinc-800" />

              {/* ═══ GALLERY ═══ */}
              <div className="px-5 pt-4 pb-8">
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="h-4 w-4 text-zinc-400" />
                  <h2
                    className="text-sm font-bold text-zinc-900 dark:text-white"
                    style={{ fontFamily: HK }}
                  >
                    Browse All
                  </h2>
                </div>
                <CommunityGallery
                  variant="app"
                  showSearch
                  showFilters
                  onDeckClick={onDeckClick}
                />
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// HERO CARD (#1 — large editorial spread)
// ═════════════════════════════════════════════════════════════════════════

const HeroCard: React.FC<{ entry: LeaderboardEntry; onClick: () => void }> = ({
  entry,
  onClick,
}) => {
  const category = COMMUNITY_CATEGORIES[entry.category as keyof typeof COMMUNITY_CATEGORIES];
  const bgStyle = useMemo(() => extractBgStyle(entry.first_slide), [entry.first_slide]);

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative w-full overflow-hidden rounded-2xl cursor-pointer',
        'ring-2 ring-[#FF4301]/40',
        'shadow-lg shadow-[#FF4301]/[0.08]',
      )}
    >
      {/* Thumbnail area */}
      <div className="relative w-full aspect-[16/9] overflow-hidden">
        {/* Background fallback */}
        <div className="absolute inset-0" style={bgStyle} />

        {/* PNG thumbnail */}
        {entry.thumbnail_url && (
          <img
            src={entry.thumbnail_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}

        {/* Scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none" />

        {/* Crown badge */}
        <div className="absolute top-3 left-3 z-10">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#FF4301] shadow-lg shadow-[#FF4301]/30">
            <Crown className="h-3.5 w-3.5 text-white" />
            <span className="text-[11px] font-bold text-white" style={{ fontFamily: HK }}>#1</span>
          </div>
        </div>

        {/* Featured badge */}
        {entry.is_featured && (
          <div className="absolute top-3 right-3 z-10">
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/40">
              <Star className="h-3 w-3 text-[#FF4301] fill-[#FF4301]" />
              <span className="text-[10px] font-bold text-white" style={{ fontFamily: HK }}>Featured</span>
            </div>
          </div>
        )}

        {/* Bottom content */}
        <div className="absolute inset-x-0 bottom-0 px-4 pb-3.5 pt-8 z-10">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p
                className="text-base sm:text-lg font-extrabold text-white truncate leading-tight"
                title={entry.title}
                style={{ fontFamily: HK, letterSpacing: '-0.02em' }}
              >
                {entry.title}
              </p>
              <p
                className="text-[12px] text-white/50 mt-0.5 truncate"
                style={{ fontFamily: HK }}
              >
                by {entry.author_name || 'Anonymous'}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 text-[12px] text-white/60" style={{ fontFamily: HK }}>
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {formatCount(entry.view_count)}
              </span>
              <span className="flex items-center gap-1">
                <Copy className="h-3 w-3" />
                {formatCount(entry.remix_count)}
              </span>
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3" />
                {entry.slide_count}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// PODIUM CARD (#2, #3)
// ═════════════════════════════════════════════════════════════════════════

const PodiumCard: React.FC<{ entry: LeaderboardEntry; rank: number; onClick: () => void }> = ({
  entry,
  rank,
  onClick,
}) => {
  const cfg = PODIUM[rank] || PODIUM[3];
  const bgStyle = useMemo(() => extractBgStyle(entry.first_slide), [entry.first_slide]);

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative overflow-hidden rounded-xl cursor-pointer',
        'ring-1', cfg.ring,
        'bg-white dark:bg-zinc-900',
      )}
    >
      <div className="relative w-full aspect-[16/9] overflow-hidden">
        <div className="absolute inset-0" style={bgStyle} />
        {entry.thumbnail_url && (
          <img src={entry.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent pointer-events-none" />

        {/* Rank badge */}
        <div className="absolute top-2 left-2 z-10">
          <div className={cn('flex items-center justify-center h-6 w-6 rounded-full shadow-md', cfg.badgeBg)}>
            <cfg.Icon className="h-3 w-3 text-white" />
          </div>
        </div>

        {/* Bottom content */}
        <div className="absolute inset-x-0 bottom-0 px-2.5 pb-2 pt-5 z-10">
          <p
            className="text-[12px] font-bold text-white truncate leading-tight"
            title={entry.title}
            style={{ fontFamily: HK }}
          >
            {entry.title}
          </p>
          <p className="text-[10px] text-white/50 truncate mt-px" style={{ fontFamily: HK }}>
            {entry.author_name || 'Anonymous'}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="px-2.5 py-1.5 flex items-center gap-2.5 text-[10px] text-zinc-500 dark:text-zinc-400" style={{ fontFamily: HK }}>
        <span className="flex items-center gap-0.5">
          <Eye className="h-2.5 w-2.5" />
          {formatCount(entry.view_count)}
        </span>
        <span className="flex items-center gap-0.5">
          <Copy className="h-2.5 w-2.5" />
          {formatCount(entry.remix_count)}
        </span>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// RUNNER CARD (#4-10)
// ═════════════════════════════════════════════════════════════════════════

const RunnerCard: React.FC<{ entry: LeaderboardEntry; onClick: () => void }> = ({
  entry,
  onClick,
}) => {
  const category = COMMUNITY_CATEGORIES[entry.category as keyof typeof COMMUNITY_CATEGORIES];
  const bgStyle = useMemo(() => extractBgStyle(entry.first_slide), [entry.first_slide]);

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative overflow-hidden rounded-xl cursor-pointer',
        'ring-1 ring-zinc-200/80 dark:ring-zinc-700/80',
        'bg-white dark:bg-zinc-900',
      )}
    >
      <div className="relative w-full aspect-[16/9] overflow-hidden">
        <div className="absolute inset-0" style={bgStyle} />
        {entry.thumbnail_url && (
          <img src={entry.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent h-1/2 mt-auto pointer-events-none" />

        {/* Rank pill */}
        <div className="absolute top-1.5 left-1.5 z-10">
          <div className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-md bg-[#FF4301] shadow-sm">
            <span className="text-[9px] font-bold text-white" style={{ fontFamily: HK }}>#{entry.rank}</span>
          </div>
        </div>

        {/* Category dot */}
        <div className="absolute bottom-1.5 right-1.5 z-10">
          <div
            className="h-2.5 w-2.5 rounded-full shadow-sm ring-1 ring-white/20"
            style={{ backgroundColor: category?.color || '#71717a' }}
            title={category?.name || entry.category}
          />
        </div>

        <div className="absolute inset-x-0 bottom-0 px-2 pb-1.5 pt-3 z-10">
          <p className="text-[11px] font-semibold text-white truncate" style={{ fontFamily: HK }}>
            {entry.title}
          </p>
        </div>
      </div>

      <div className="px-2 py-1.5 flex items-center gap-2 text-[10px] text-zinc-400 dark:text-zinc-500" style={{ fontFamily: HK }}>
        <span className="flex items-center gap-0.5">
          <Eye className="h-2.5 w-2.5" />
          {formatCount(entry.view_count)}
        </span>
        <span className="flex items-center gap-0.5">
          <Copy className="h-2.5 w-2.5" />
          {formatCount(entry.remix_count)}
        </span>
      </div>
    </div>
  );
};

export default CommunityBottomSheet;
