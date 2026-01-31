import React, { useState, useCallback, useEffect } from 'react';
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
  Loader2,
  Star,
  Globe,
  Flame,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { gamificationApi, type LeaderboardEntry } from '@/services/gamificationApi';
import { COMMUNITY_CATEGORIES } from '@/services/communityService';
import type { CommunityDeck } from '@/services/communityService';
import MiniSlide from '@/components/deck/MiniSlide';
import CommunityGallery from './CommunityGallery';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';

// ---------------------------------------------------------------------------
// Leaderboard helpers
// ---------------------------------------------------------------------------

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

type PodiumStyle = {
  ring: string;
  glow: string;
  badgeBg: string;
  Icon: React.FC<{ className?: string }>;
};

const PODIUM_CFG: Record<number, PodiumStyle> = {
  1: { ring: 'ring-2 ring-[#FF4301]/60', glow: 'shadow-lg shadow-[#FF4301]/20', badgeBg: 'bg-[#FF4301]', Icon: Crown },
  2: { ring: 'ring-2 ring-[#FF4301]/30', glow: 'shadow-md shadow-[#FF4301]/10', badgeBg: 'bg-[#FF6B3D]', Icon: Medal },
  3: { ring: 'ring-2 ring-[#FF4301]/20', glow: 'shadow-md shadow-[#FF4301]/5', badgeBg: 'bg-[#FF8F6B]', Icon: Trophy },
};

// ---------------------------------------------------------------------------
// Bottom Sheet
// ---------------------------------------------------------------------------

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
  const isMobile = useIsMobile();

  // Leaderboard state
  const [lbPeriod, setLbPeriod] = useState<'weekly' | 'all_time'>('weekly');
  const [lbMetric, setLbMetric] = useState<'views' | 'remixes'>('views');

  const { data: leaderboardData, isLoading: lbLoading } = useQuery({
    queryKey: ['leaderboard', lbPeriod, lbMetric],
    queryFn: () => gamificationApi.getLeaderboard(lbPeriod, lbMetric, 10),
    staleTime: 60_000,
    enabled: isOpen,
  });

  const podiumEntries = leaderboardData?.entries.slice(0, 3) || [];
  const runnerEntries = leaderboardData?.entries.slice(3) || [];

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className={cn(
          'h-[92vh] rounded-t-3xl p-0 overflow-hidden border-0',
          'flex flex-col bg-zinc-50 dark:bg-zinc-950'
        )}
      >
        {/* Gradient top accent */}
        <div className="h-0.5 bg-gradient-to-r from-orange-500 via-pink-500 to-violet-500 shrink-0" />

        {/* Pull indicator */}
        <div className="flex justify-center pt-2 shrink-0">
          <div className="w-10 h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full" />
        </div>

        {/* Header — compact single line */}
        <div className="px-5 pt-1.5 pb-2 shrink-0 bg-zinc-50 dark:bg-zinc-950">
          <SheetHeader className="text-left space-y-0">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-orange-400 to-pink-500">
                <Flame className="h-4 w-4 text-white" />
              </div>
              <SheetTitle
                className="text-lg bg-gradient-to-r from-zinc-900 via-zinc-700 to-zinc-900 dark:from-white dark:via-zinc-200 dark:to-white bg-clip-text text-transparent"
                style={{ fontFamily: '"HK Grotesk", "Hanken Grotesk", sans-serif', fontWeight: 800, letterSpacing: '-0.02em' }}
              >
                Community
              </SheetTitle>
              <SheetDescription className="sr-only">
                Community presentations
              </SheetDescription>
            </div>
          </SheetHeader>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {isOpen && (
            <>
            <div className="max-w-3xl mx-auto">
              {/* ============================================================ */}
              {/* LEADERBOARD SECTION                                           */}
              {/* ============================================================ */}
              <section className="relative">
                <div className="h-px bg-gradient-to-r from-transparent via-[#FF4301]/40 to-transparent" />

                <div className="bg-gradient-to-b from-[#FF4301]/[0.04] via-orange-50/30 to-zinc-50 dark:from-zinc-900 dark:via-zinc-900/80 dark:to-zinc-950 px-5 py-3">

                  {/* Section header + toggles — single row */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center h-6 w-6 rounded-md bg-[#FF4301]">
                        <Trophy className="h-3.5 w-3.5 text-white" />
                      </div>
                      <h2
                        className="text-sm font-bold text-zinc-900 dark:text-white"
                        style={{ fontFamily: '"HK Grotesk", "Hanken Grotesk", sans-serif' }}
                      >
                        Top Presentations
                      </h2>
                    </div>

                    {/* Toggles row */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* Period */}
                      <div className="flex bg-white dark:bg-zinc-800 rounded-lg p-0.5 shadow-sm border border-zinc-200 dark:border-zinc-700">
                        {([['weekly', 'This Week'], ['all_time', 'All Time']] as const).map(([p, label]) => (
                          <button
                            key={p}
                            onClick={() => setLbPeriod(p)}
                            className={cn(
                              'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all',
                              lbPeriod === p
                                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm'
                                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700',
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {/* Metric */}
                      <div className="flex bg-white dark:bg-zinc-800 rounded-lg p-0.5 shadow-sm border border-zinc-200 dark:border-zinc-700">
                        {([['views', 'Most Viewed', Eye], ['remixes', 'Most Remixed', Copy]] as const).map(([m, label, Icon]) => (
                          <button
                            key={m}
                            onClick={() => setLbMetric(m as 'views' | 'remixes')}
                            className={cn(
                              'flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all',
                              lbMetric === m
                                ? 'bg-[#FF4301]/10 dark:bg-[#FF4301]/20 text-[#FF4301] shadow-sm'
                                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700',
                            )}
                          >
                            <Icon className="h-3 w-3" />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Leaderboard content */}
                  {lbLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-[#FF4301]" />
                    </div>
                  ) : podiumEntries.length > 0 ? (
                    <div className="space-y-3">
                      {/* #1 — full-width hero card */}
                      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                        <LbCard entry={podiumEntries[0]} rank={1} onClick={() => navigate(`/community/${podiumEntries[0].id}`)} />
                      </motion.div>

                      {/* #2 and #3 side by side */}
                      {podiumEntries.length >= 2 && (
                        <div className="grid grid-cols-2 gap-3">
                          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
                            <LbCard entry={podiumEntries[1]} rank={2} onClick={() => navigate(`/community/${podiumEntries[1].id}`)} />
                          </motion.div>
                          {podiumEntries[2] && (
                            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                              <LbCard entry={podiumEntries[2]} rank={3} onClick={() => navigate(`/community/${podiumEntries[2].id}`)} />
                            </motion.div>
                          )}
                        </div>
                      )}

                      {/* Runner strip (#4+) */}
                      {runnerEntries.length > 0 && (
                        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1 pt-1">
                          {runnerEntries.map((entry, idx) => (
                            <motion.div
                              key={entry.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.15 + idx * 0.03 }}
                              className="flex-shrink-0 w-[200px]"
                            >
                              <RunnerCard entry={entry} onClick={() => navigate(`/community/${entry.id}`)} />
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-center text-sm text-zinc-400 py-6">No rankings yet for this period.</p>
                  )}
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-orange-300/30 to-transparent" />
              </section>

            </div>

              {/* ============================================================ */}
              {/* GALLERY (full width)                                          */}
              {/* ============================================================ */}
              <div className="px-5 pt-3 pb-6">
                <div className="flex items-center gap-1.5 mb-3">
                  <Globe className="h-4 w-4 text-violet-500" />
                  <h2
                    className="text-sm font-bold text-zinc-900 dark:text-white"
                    style={{ fontFamily: '"HK Grotesk", "Hanken Grotesk", sans-serif' }}
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

// ---------------------------------------------------------------------------
// Leaderboard Card (podium top 3)
// ---------------------------------------------------------------------------

interface LbCardProps {
  entry: LeaderboardEntry;
  rank: number;
  onClick: () => void;
}

const LbCard: React.FC<LbCardProps> = ({ entry, rank, onClick }) => {
  const cfg = PODIUM_CFG[rank] || PODIUM_CFG[3];
  const category = COMMUNITY_CATEGORIES[entry.category as keyof typeof COMMUNITY_CATEGORIES];
  const isGold = rank === 1;

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative rounded-xl overflow-hidden cursor-pointer group transition-all duration-300',
        cfg.ring, cfg.glow,
        'bg-white dark:bg-zinc-900',
        isGold && 'hover:shadow-[#FF4301]/25',
      )}
    >
      {/* Thumbnail */}
      <div className="relative w-full aspect-[16/9] overflow-hidden">
        <div className="absolute inset-0 w-full h-full pointer-events-none">
          {entry.first_slide ? (
            <MiniSlide slide={entry.first_slide} className="w-full h-full" />
          ) : (
            <div className="flex items-center justify-center h-full bg-zinc-100 dark:bg-zinc-800">
              <FileStack className="h-6 w-6 text-zinc-300 dark:text-zinc-600" />
            </div>
          )}
        </div>

        {/* Rank badge */}
        <div className="absolute top-1.5 left-1.5 z-10 pointer-events-none">
          <div className={cn(
            'flex items-center justify-center rounded-full shadow-lg',
            cfg.badgeBg,
            isGold ? 'h-7 w-7' : 'h-6 w-6',
          )}>
            <cfg.Icon className={cn('text-white', isGold ? 'h-4 w-4' : 'h-3 w-3')} />
          </div>
        </div>

        {/* Featured badge */}
        {entry.is_featured && (
          <div className="absolute top-1.5 right-1.5 z-10">
            <Badge className="bg-[#FF4301] hover:bg-[#FF4301] text-white text-[9px] font-semibold shadow-sm px-1.5 py-0 gap-0.5">
              <Star className="h-2 w-2 fill-current" />
              Featured
            </Badge>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent h-2/3 pointer-events-none" />

        {/* Title + author */}
        <div className="absolute inset-x-0 bottom-0 px-2 pb-2 pt-4 z-10">
          <p className={cn('font-bold text-white truncate', isGold ? 'text-xs' : 'text-[11px]')} title={entry.title}>
            {entry.title}
          </p>
          <p className="text-[10px] text-white/60 truncate">{entry.author_name || 'Anonymous'}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="px-2 py-1.5 flex items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" />{formatCount(entry.view_count)}</span>
        <span className="flex items-center gap-0.5"><Copy className="h-2.5 w-2.5" />{formatCount(entry.remix_count)}</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Runner Card (#4-10)
// ---------------------------------------------------------------------------

interface RunnerCardProps {
  entry: LeaderboardEntry;
  onClick: () => void;
}

const RunnerCard: React.FC<RunnerCardProps> = ({ entry, onClick }) => {
  const category = COMMUNITY_CATEGORIES[entry.category as keyof typeof COMMUNITY_CATEGORIES];

  return (
    <div
      onClick={onClick}
      className="relative rounded-lg overflow-hidden cursor-pointer group ring-1 ring-zinc-200 dark:ring-zinc-700 hover:ring-zinc-300 dark:hover:ring-zinc-600 hover:shadow-md transition-all bg-white dark:bg-zinc-900"
    >
      <div className="relative w-full aspect-[16/9] overflow-hidden">
        <div className="absolute inset-0 w-full h-full pointer-events-none">
          {entry.thumbnail_url ? (
            <img src={entry.thumbnail_url} alt={entry.title} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="flex items-center justify-center h-full bg-zinc-100 dark:bg-zinc-800">
              <FileStack className="h-4 w-4 text-zinc-300 dark:text-zinc-600" />
            </div>
          )}
        </div>

        {/* Rank */}
        <div className="absolute top-1.5 left-1.5 z-10 pointer-events-none">
          <div className="flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-[#FF4301]/90 backdrop-blur-sm shadow-sm">
            <span className="text-[9px] font-bold text-white">#{entry.rank}</span>
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

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent h-1/2 pointer-events-none" />

        <div className="absolute inset-x-0 bottom-0 px-2 pb-1.5 pt-3 z-10">
          <p className="text-[11px] font-semibold text-white truncate">{entry.title}</p>
        </div>
      </div>

      <div className="px-2 py-1.5 flex items-center gap-2 text-[10px] text-zinc-400 dark:text-zinc-500">
        <span className="flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" />{formatCount(entry.view_count)}</span>
        <span className="flex items-center gap-0.5"><Copy className="h-2.5 w-2.5" />{formatCount(entry.remix_count)}</span>
      </div>
    </div>
  );
};

export default CommunityBottomSheet;
