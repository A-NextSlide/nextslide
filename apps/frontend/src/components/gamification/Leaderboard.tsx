/**
 * Leaderboard
 *
 * Displays a ranked grid of top community decks.
 * Supports tabs for "This Week" / "All Time" and "Most Viewed" / "Most Remixed".
 * Top 3 entries get podium styling; entries 4-10 render in a 4-column grid.
 * Each card is clickable and navigates to the community deck page.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, Medal, Crown, Eye, Copy, FileStack, Loader2, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { gamificationApi, type LeaderboardResponse, type LeaderboardEntry } from '@/services/gamificationApi';
import { COMMUNITY_CATEGORIES } from '@/services/communityService';
import MiniSlide from '@/components/deck/MiniSlide';
import { cn } from '@/lib/utils';

type Period = 'weekly' | 'all_time';
type Metric = 'views' | 'remixes';

const METRIC_LABELS: Record<Metric, { label: string; icon: React.ReactNode }> = {
  views: { label: 'Most Viewed', icon: <Eye className="w-3.5 h-3.5" /> },
  remixes: { label: 'Most Remixed', icon: <Copy className="w-3.5 h-3.5" /> },
};

function formatCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

const RANK_ICONS: Record<number, React.ReactNode> = {
  1: <Crown className="w-4 h-4 text-amber-500" />,
  2: <Medal className="w-4 h-4 text-gray-400" />,
  3: <Trophy className="w-4 h-4 text-orange-500" />,
};

interface LeaderboardProps {
  className?: string;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ className = '' }) => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>('weekly');
  const [metric, setMetric] = useState<Metric>('views');
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const result = await gamificationApi.getLeaderboard(period, metric, 10);
      setData(result);
    } catch (err) {
      console.error('[Leaderboard] Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  }, [period, metric]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const topThree = data?.entries.slice(0, 3) || [];
  const rest = data?.entries.slice(3) || [];

  return (
    <div className={cn('rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden', className)}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-5 h-5 text-amber-500" />
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Leaderboard
          </h3>
        </div>

        {/* Period tabs */}
        <div className="flex gap-1 mb-2">
          {([['weekly', 'This Week'], ['all_time', 'All Time']] as const).map(([p, label]) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                period === p
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Metric tabs */}
        <div className="flex gap-1">
          {(Object.entries(METRIC_LABELS) as [Metric, typeof METRIC_LABELS[Metric]][]).map(
            ([m, { label, icon }]) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                  metric === m
                    ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                    : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300',
                )}
              >
                {icon}
                {label}
              </button>
            ),
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-3 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
          </div>
        ) : data && data.entries.length > 0 ? (
          <>
            {/* Top 3 podium */}
            {topThree.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {topThree.map((entry, idx) => (
                  <LeaderboardDeckCard
                    key={entry.id}
                    entry={entry}
                    index={idx}
                    variant="podium"
                    onClick={() => navigate(`/community/${entry.id}`)}
                  />
                ))}
              </div>
            )}

            {/* Entries 4-10 grid */}
            {rest.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {rest.map((entry, idx) => (
                  <LeaderboardDeckCard
                    key={entry.id}
                    entry={entry}
                    index={idx + 3}
                    variant="grid"
                    onClick={() => navigate(`/community/${entry.id}`)}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-10 text-zinc-400 dark:text-zinc-500 text-sm">
            No data yet for this period.
          </div>
        )}
      </div>
    </div>
  );
};

interface LeaderboardDeckCardProps {
  entry: LeaderboardEntry;
  index: number;
  variant: 'podium' | 'grid';
  onClick: () => void;
}

const LeaderboardDeckCard: React.FC<LeaderboardDeckCardProps> = ({ entry, index, variant, onClick }) => {
  const category = COMMUNITY_CATEGORIES[entry.category as keyof typeof COMMUNITY_CATEGORIES];
  const isPodium = variant === 'podium';

  const slideBg = entry.first_slide?.background?.color
    || entry.first_slide?.style?.backgroundColor
    || undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="group relative cursor-pointer"
      onClick={onClick}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
    >
      <div
        className={cn(
          'relative overflow-hidden rounded-lg transition-all duration-200',
          'ring-1 ring-zinc-200 dark:ring-zinc-700',
          'hover:ring-zinc-300 dark:hover:ring-zinc-600',
          'hover:shadow-md',
          'bg-white dark:bg-zinc-900',
        )}
      >
        {/* Thumbnail */}
        <div className="relative w-full aspect-[16/9] overflow-hidden">
          <div className="absolute inset-0 w-full h-full">
            {entry.first_slide ? (
              <MiniSlide
                slide={entry.first_slide}
                className="w-full h-full"
              />
            ) : (
              <div
                className="flex items-center justify-center h-full"
                style={{ backgroundColor: slideBg || '#f4f4f5' }}
              >
                <FileStack className="h-6 w-6 text-zinc-300 dark:text-zinc-600" />
              </div>
            )}
          </div>

          {/* Rank badge overlay - top left */}
          <div className="absolute top-1.5 left-1.5 z-10">
            <div
              className={cn(
                'flex items-center justify-center rounded-full shadow-sm',
                isPodium ? 'h-6 w-6' : 'h-5 w-5',
                entry.rank === 1 && 'bg-amber-500',
                entry.rank === 2 && 'bg-gray-400',
                entry.rank === 3 && 'bg-orange-500',
                entry.rank > 3 && 'bg-zinc-700/80 backdrop-blur-sm',
              )}
            >
              {entry.rank <= 3 ? (
                <span className="text-white">{RANK_ICONS[entry.rank]}</span>
              ) : (
                <span className="text-[10px] font-bold text-white">#{entry.rank}</span>
              )}
            </div>
          </div>

          {/* Featured badge */}
          {entry.is_featured && (
            <div className="absolute top-1.5 right-1.5 z-10">
              <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-[10px] font-semibold shadow-sm px-1.5 py-0 gap-0.5">
                <Star className="h-2.5 w-2.5 fill-current" />
                Featured
              </Badge>
            </div>
          )}

          {/* Category badge - bottom right of thumbnail */}
          <div className="absolute bottom-1.5 right-1.5 z-10">
            <Badge
              variant="secondary"
              className="text-[10px] font-medium backdrop-blur-md border-0 shadow-sm px-1.5 py-0"
              style={{
                backgroundColor: `${category?.color || '#71717a'}dd`,
                color: 'white',
              }}
            >
              {category?.name || entry.category}
            </Badge>
          </div>

          {/* Gradient overlay */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent h-1/2 pointer-events-none" />

          {/* Title overlay */}
          <div className="absolute inset-x-0 bottom-0 px-2 pb-1.5 pt-4 z-10">
            <h4
              className={cn(
                'font-semibold text-white truncate',
                isPodium ? 'text-xs' : 'text-[11px]',
              )}
              title={entry.title}
            >
              {entry.title}
            </h4>
          </div>
        </div>

        {/* Card footer */}
        <div className="px-2 py-1.5 space-y-1">
          {/* Author */}
          <div className="flex items-center gap-1.5">
            <div
              className="flex items-center justify-center h-4 w-4 rounded-full text-[8px] font-bold text-white flex-shrink-0"
              style={{ backgroundColor: category?.color || '#71717a' }}
            >
              {(entry.author_name || '?')[0].toUpperCase()}
            </div>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
              {entry.author_name || 'Anonymous'}
            </span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-2 text-[10px] text-zinc-400 dark:text-zinc-500">
            <span className="flex items-center gap-0.5">
              <Eye className="h-3 w-3" />
              {formatCount(entry.view_count)}
            </span>
            <span className="flex items-center gap-0.5">
              <Copy className="h-3 w-3" />
              {formatCount(entry.remix_count)}
            </span>
            <span className="flex items-center gap-0.5">
              <FileStack className="h-3 w-3" />
              {entry.slide_count}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default Leaderboard;
