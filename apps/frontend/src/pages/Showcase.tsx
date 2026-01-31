import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  X,
  Loader2,
  FileStack,
  Briefcase,
  GraduationCap,
  Megaphone,
  Palette,
  Cpu,
  Heart,
  TrendingUp,
  Sparkles,
  Clock,
  Star,
  Plus,
  ChevronRight,
  Trophy,
  LayoutGrid,
  Crown,
  Medal,
  Eye,
  Copy,
  Flame,
} from 'lucide-react';
import { COMMUNITY_CATEGORIES } from '@/services/communityService';
import { showcaseApi, ShowcaseDeck, ShowcaseFilters } from '@/services/showcaseApi';
import { gamificationApi, type LeaderboardEntry } from '@/services/gamificationApi';
import ShowcaseCard from '@/components/showcase/ShowcaseCard';
import MiniSlide from '@/components/deck/MiniSlide';
import SubmitToShowcaseDialog from '@/components/showcase/SubmitToShowcaseDialog';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { useAuth } from '@/context/SupabaseAuthContext';
import { useToast } from '@/hooks/use-toast';
import { trackEvent } from '@/services/analytics';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_ICONS: Record<string, React.FC<{ className?: string }>> = {
  business: Briefcase,
  education: GraduationCap,
  marketing: Megaphone,
  creative: Palette,
  technology: Cpu,
  personal: Heart,
};

const TAB_CONFIG = [
  { value: 'featured', label: 'Featured', icon: Star },
  { value: 'trending', label: 'Trending', icon: TrendingUp },
  { value: 'new', label: 'New', icon: Clock },
];

const ITEMS_PER_PAGE = 12;

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

const PODIUM_RANK: Record<number, {
  ring: string;
  glow: string;
  badgeBg: string;
  Icon: React.FC<{ className?: string }>;
}> = {
  1: { ring: 'ring-2 ring-amber-400/70', glow: 'shadow-lg shadow-amber-400/25', badgeBg: 'bg-gradient-to-br from-amber-400 to-yellow-500', Icon: Crown },
  2: { ring: 'ring-2 ring-gray-300/60', glow: 'shadow-md shadow-gray-400/10', badgeBg: 'bg-gradient-to-br from-gray-300 to-gray-400', Icon: Medal },
  3: { ring: 'ring-2 ring-orange-400/60', glow: 'shadow-md shadow-orange-400/15', badgeBg: 'bg-gradient-to-br from-orange-400 to-amber-500', Icon: Trophy },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const Showcase: React.FC = () => {
  const { category: categoryParam } = useParams<{ category?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  // Gallery state
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'featured');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(categoryParam || null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [remixingId, setRemixingId] = useState<string | null>(null);
  const [upvotingId, setUpvotingId] = useState<string | null>(null);

  // Leaderboard state
  const [lbPeriod, setLbPeriod] = useState<'weekly' | 'all_time'>('weekly');
  const [lbMetric, setLbMetric] = useState<'views' | 'remixes'>('views');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ---- Queries ----

  const filters: ShowcaseFilters = {
    category: selectedCategory || undefined,
    sort: activeTab === 'trending' ? 'trending' : activeTab === 'new' ? 'newest' : undefined,
    tab: activeTab as ShowcaseFilters['tab'],
    search: debouncedSearch || undefined,
    limit: ITEMS_PER_PAGE,
    offset: 0,
  };

  const { data: showcaseData, isLoading, isFetching } = useQuery({
    queryKey: ['showcase', activeTab, selectedCategory, debouncedSearch],
    queryFn: () => showcaseApi.getShowcase(filters),
    staleTime: 30_000,
  });

  const { data: leaderboardData } = useQuery({
    queryKey: ['leaderboard', lbPeriod, lbMetric],
    queryFn: () => gamificationApi.getLeaderboard(lbPeriod, lbMetric, 10),
    staleTime: 60_000,
  });

  // Analytics
  useEffect(() => {
    trackEvent('showcase_viewed', { category: selectedCategory || 'all', tab: activeTab });
  }, [activeTab, selectedCategory]);

  useEffect(() => {
    if (debouncedSearch) trackEvent('showcase_search', { query: debouncedSearch });
  }, [debouncedSearch]);

  // ---- Mutations ----

  const loadMoreMutation = useMutation({
    mutationFn: async () => {
      const currentDecks = showcaseData?.decks || [];
      return showcaseApi.getShowcase({ ...filters, offset: currentDecks.length });
    },
    onSuccess: (newData) => {
      queryClient.setQueryData(
        ['showcase', activeTab, selectedCategory, debouncedSearch],
        (old: any) => (old ? { ...newData, decks: [...old.decks, ...newData.decks] } : newData),
      );
    },
  });

  // ---- Handlers ----

  const handleUpvote = useCallback(async (deck: ShowcaseDeck) => {
    if (!isAuthenticated) { setShowAuthDialog(true); return; }
    setUpvotingId(deck.id);
    try {
      const result = await showcaseApi.toggleUpvote(deck.id);
      trackEvent('showcase_upvoted', { deckId: deck.id });
      queryClient.setQueryData(
        ['showcase', activeTab, selectedCategory, debouncedSearch],
        (old: any) => {
          if (!old) return old;
          return { ...old, decks: old.decks.map((d: ShowcaseDeck) => d.id === deck.id ? { ...d, hasUpvoted: result.upvoted, upvoteCount: result.upvoteCount } : d) };
        },
      );
    } catch (error: any) {
      if (error.message === 'AUTH_REQUIRED') setShowAuthDialog(true);
      else toast({ variant: 'destructive', title: 'Error', description: 'Failed to update upvote' });
    } finally {
      setUpvotingId(null);
    }
  }, [isAuthenticated, activeTab, selectedCategory, debouncedSearch, queryClient, toast]);

  const handleRemix = useCallback(async (deck: ShowcaseDeck) => {
    if (!isAuthenticated) { setShowAuthDialog(true); return; }
    setRemixingId(deck.id);
    try {
      const result = await showcaseApi.remixDeck(deck.id);
      trackEvent('showcase_remixed', { deckId: deck.id });
      toast({ title: 'Remixed!', description: `"${result.deckName}" has been added to your presentations` });
      navigate(`/app?deck=${result.deckUuid}`);
    } catch (error: any) {
      if (error.message === 'AUTH_REQUIRED') setShowAuthDialog(true);
      else toast({ variant: 'destructive', title: 'Remix failed', description: error.message || 'Failed to remix deck' });
    } finally {
      setRemixingId(null);
    }
  }, [isAuthenticated, navigate, toast]);

  const handleView = useCallback((deck: ShowcaseDeck) => navigate(`/community/${deck.id}`), [navigate]);
  const handleCategoryClick = (cat: string | null) => setSelectedCategory((prev) => (prev === cat ? null : cat));
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('tab', tab); return next; });
  };

  // ---- Derived ----

  const decks = showcaseData?.decks || [];
  const hasMore = showcaseData?.hasMore || false;
  const hasActiveFilters = !!searchQuery || !!selectedCategory;

  const podiumEntries = leaderboardData?.entries.slice(0, 3) || [];
  const runnerEntries = leaderboardData?.entries.slice(3) || [];
  const showLeaderboard = podiumEntries.length > 0 && !searchQuery && !selectedCategory;

  // ---- Render ----

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">

      {/* ================================================================ */}
      {/* HERO                                                             */}
      {/* ================================================================ */}
      <section className="relative overflow-hidden">
        {/* Animated gradient blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-1/2 -left-1/4 w-3/4 h-full rounded-full bg-gradient-to-r from-orange-200/60 to-pink-200/60 dark:from-orange-900/15 dark:to-pink-900/15 blur-3xl animate-pulse" style={{ animationDuration: '6s' }} />
          <div className="absolute -bottom-1/2 -right-1/4 w-3/4 h-full rounded-full bg-gradient-to-l from-violet-200/60 to-blue-200/60 dark:from-violet-900/15 dark:to-blue-900/15 blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-1/2 h-1/2 rounded-full bg-gradient-to-t from-amber-200/40 to-transparent dark:from-amber-900/10 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8 sm:pt-14 sm:pb-10">
          <div className="text-center max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-100/80 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 text-sm font-semibold mb-4 backdrop-blur-sm"
            >
              <Flame className="h-4 w-4" />
              Community Showcase
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-zinc-900 dark:text-white tracking-tight"
              style={{ fontFamily: '"HK Grotesk", "Hanken Grotesk", sans-serif' }}
            >
              Discover amazing{' '}
              <span className="bg-gradient-to-r from-orange-500 via-pink-500 to-violet-500 bg-clip-text text-transparent">
                presentations
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mt-3 text-base sm:text-lg text-zinc-600 dark:text-zinc-400 max-w-xl mx-auto"
            >
              Browse, upvote, and remix community creations. Get inspired and share your own.
            </motion.p>

            {/* Search */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mt-6 max-w-xl mx-auto relative"
            >
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
              <Input
                placeholder="Search presentations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 pr-10 h-12 rounded-full bg-white/90 dark:bg-zinc-900/90 border-zinc-200 dark:border-zinc-700 shadow-sm backdrop-blur-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-base"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </motion.div>

            {isAuthenticated && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                <Button
                  onClick={() => setShowSubmitDialog(true)}
                  className="mt-4 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white shadow-md"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Submit Your Presentation
                </Button>
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* LEADERBOARD                                                      */}
      {/* ================================================================ */}
      {showLeaderboard && (
        <section className="relative">
          {/* Gradient accent line */}
          <div className="h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

          <div className="bg-gradient-to-b from-amber-50/60 via-orange-50/30 to-zinc-50 dark:from-zinc-900 dark:via-zinc-900/80 dark:to-zinc-950">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

              {/* Section header + toggles */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-md shadow-amber-500/20">
                    <Trophy className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2
                      className="text-xl font-bold text-zinc-900 dark:text-white"
                      style={{ fontFamily: '"HK Grotesk", "Hanken Grotesk", sans-serif' }}
                    >
                      Top Presentations
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">The community's best, ranked</p>
                  </div>
                </div>

                {/* Toggles */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Period */}
                  <div className="flex bg-white dark:bg-zinc-800 rounded-lg p-0.5 shadow-sm border border-zinc-200 dark:border-zinc-700">
                    {([['weekly', 'This Week'], ['all_time', 'All Time']] as const).map(([p, label]) => (
                      <button
                        key={p}
                        onClick={() => setLbPeriod(p)}
                        className={cn(
                          'px-3 py-1.5 rounded-md text-xs font-semibold transition-all',
                          lbPeriod === p
                            ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm'
                            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200',
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
                          'flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all',
                          lbMetric === m
                            ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 shadow-sm'
                            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200',
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ----- Podium (desktop: #2 #1 #3, mobile: stacked) ----- */}
              {podiumEntries.length >= 3 ? (
                <div className="hidden sm:grid grid-cols-3 gap-5 items-end mb-6">
                  {/* #2 — left, offset down */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="pt-10"
                  >
                    <PodiumCard entry={podiumEntries[1]} rank={2} onClick={() => navigate(`/community/${podiumEntries[1].id}`)} />
                  </motion.div>
                  {/* #1 — center, full height */}
                  <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0 }}
                  >
                    <PodiumCard entry={podiumEntries[0]} rank={1} onClick={() => navigate(`/community/${podiumEntries[0].id}`)} />
                  </motion.div>
                  {/* #3 — right, offset down more */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="pt-14"
                  >
                    <PodiumCard entry={podiumEntries[2]} rank={3} onClick={() => navigate(`/community/${podiumEntries[2].id}`)} />
                  </motion.div>
                </div>
              ) : (
                <div className="hidden sm:grid grid-cols-3 gap-5 mb-6">
                  {podiumEntries.map((entry, idx) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.06 }}
                    >
                      <PodiumCard entry={entry} rank={entry.rank} onClick={() => navigate(`/community/${entry.id}`)} />
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Mobile podium — stacked */}
              <div className="sm:hidden space-y-3 mb-6">
                {podiumEntries.map((entry, idx) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.06 }}
                  >
                    <PodiumCard entry={entry} rank={entry.rank} onClick={() => navigate(`/community/${entry.id}`)} />
                  </motion.div>
                ))}
              </div>

              {/* ----- Runner-up strip (#4-10) ----- */}
              {runnerEntries.length > 0 && (
                <div className={cn(
                  'flex gap-3 pb-2',
                  isMobile ? 'overflow-x-auto -mx-4 px-4 scrollbar-hide' : 'overflow-x-auto',
                )}>
                  {runnerEntries.map((entry, idx) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + idx * 0.04 }}
                      className="flex-shrink-0"
                      style={{ width: isMobile ? '200px' : undefined, flex: isMobile ? undefined : '1 1 0%', minWidth: isMobile ? undefined : '140px' }}
                    >
                      <RunnerCard entry={entry} onClick={() => navigate(`/community/${entry.id}`)} />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bottom gradient line */}
          <div className="h-px bg-gradient-to-r from-transparent via-orange-300/40 to-transparent" />
        </section>
      )}

      {/* ================================================================ */}
      {/* GALLERY                                                          */}
      {/* ================================================================ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Section header */}
        <div className="flex items-center gap-2 mb-5">
          <Sparkles className="h-5 w-5 text-violet-500" />
          <h2
            className="text-lg font-bold text-zinc-900 dark:text-white"
            style={{ fontFamily: '"HK Grotesk", "Hanken Grotesk", sans-serif' }}
          >
            Browse All
          </h2>
        </div>

        {/* Category Chips */}
        <div
          className={cn(
            'flex gap-2 mb-6',
            isMobile ? 'overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide' : 'flex-wrap',
          )}
        >
          <button
            onClick={() => handleCategoryClick(null)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 flex-shrink-0',
              'hover:scale-105 active:scale-95',
              !selectedCategory
                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-md'
                : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700',
            )}
          >
            <LayoutGrid className="h-4 w-4" />
            All
          </button>
          {Object.entries(COMMUNITY_CATEGORIES).map(([key, value]) => {
            const isSelected = selectedCategory === key;
            const IconComponent = CATEGORY_ICONS[key];
            return (
              <button
                key={key}
                onClick={() => handleCategoryClick(key)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 flex-shrink-0',
                  'hover:scale-105 active:scale-95',
                  isSelected
                    ? `bg-gradient-to-r ${value.gradient} text-white shadow-lg`
                    : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700',
                )}
                style={isSelected ? { boxShadow: `0 4px 14px ${value.color}40` } : undefined}
              >
                {IconComponent && <IconComponent className="h-4 w-4" />}
                <span>{value.name}</span>
              </button>
            );
          })}
          {hasActiveFilters && (
            <button
              onClick={() => { setSearchQuery(''); setSelectedCategory(null); }}
              className="flex items-center gap-1 px-3 py-2 rounded-full text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
            >
              Clear
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="mb-6">
          <TabsList className="bg-white dark:bg-zinc-800/50 rounded-lg p-1 border border-zinc-200 dark:border-zinc-700">
            {TAB_CONFIG.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="rounded-md px-4 py-2 text-sm font-medium data-[state=active]:bg-zinc-900 data-[state=active]:text-white data-[state=active]:dark:bg-zinc-600 data-[state=active]:shadow-sm gap-1.5"
              >
                <Icon className="h-4 w-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Results info */}
        {!isLoading && showcaseData && (
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {showcaseData.total === 0
                ? 'No presentations found'
                : `${showcaseData.total} presentation${showcaseData.total !== 1 ? 's' : ''}`}
              {selectedCategory && (
                <span> in <span className="font-medium text-zinc-700 dark:text-zinc-300">{COMMUNITY_CATEGORIES[selectedCategory as keyof typeof COMMUNITY_CATEGORIES]?.name || selectedCategory}</span></span>
              )}
              {debouncedSearch && (
                <span> matching "<span className="font-medium text-zinc-700 dark:text-zinc-300">{debouncedSearch}</span>"</span>
              )}
            </p>
          </div>
        )}

        {/* Loading */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="relative">
              <div className="absolute inset-0 bg-orange-500/20 rounded-full blur-xl animate-pulse" />
              <Loader2 className="relative h-8 w-8 text-orange-500 animate-spin" />
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-6">Loading showcase...</p>
          </div>
        ) : decks.length === 0 ? (
          /* Empty state */
          <div className="py-20 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-700 mb-4">
              <FileStack className="h-8 w-8 text-zinc-400" />
            </div>
            <p
              className="text-lg font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
              style={{ fontFamily: '"HK Grotesk", "Hanken Grotesk", sans-serif' }}
            >
              No presentations found
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">
              {hasActiveFilters ? 'Try adjusting your search or filters' : 'Be the first to share your creation!'}
            </p>
            {hasActiveFilters ? (
              <Button variant="outline" className="rounded-full" onClick={() => { setSearchQuery(''); setSelectedCategory(null); }}>
                Clear all filters
              </Button>
            ) : isAuthenticated ? (
              <Button className="rounded-full bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white" onClick={() => setShowSubmitDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Submit a Presentation
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            {/* Deck Grid */}
            <motion.div
              className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              layout
            >
              <AnimatePresence mode="popLayout">
                {decks.map((deck) => (
                  <ShowcaseCard
                    key={deck.id}
                    deck={deck}
                    onUpvote={handleUpvote}
                    onRemix={handleRemix}
                    onView={handleView}
                    isRemixing={remixingId === deck.id}
                    isUpvoting={upvotingId === deck.id}
                  />
                ))}
              </AnimatePresence>
            </motion.div>

            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center pt-10">
                <Button
                  variant="outline"
                  size="lg"
                  className="rounded-full px-8"
                  onClick={() => loadMoreMutation.mutate()}
                  disabled={loadMoreMutation.isPending}
                >
                  {loadMoreMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading...</>
                  ) : (
                    <>Load More<ChevronRight className="h-4 w-4 ml-1" /></>
                  )}
                </Button>
              </div>
            )}
          </>
        )}

        {/* Background refresh indicator */}
        {isFetching && !isLoading && (
          <div className="fixed bottom-6 right-6 z-50">
            <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-white dark:bg-zinc-800 shadow-lg border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />
              Updating...
            </div>
          </div>
        )}
      </section>

      {/* Dialogs */}
      <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} initialMode="signup" onSuccess={() => setShowAuthDialog(false)} />
      <SubmitToShowcaseDialog
        open={showSubmitDialog}
        onOpenChange={setShowSubmitDialog}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['showcase'] })}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Podium Card — used for top 3 entries
// ---------------------------------------------------------------------------

interface PodiumCardProps {
  entry: LeaderboardEntry;
  rank: number;
  onClick: () => void;
}

const PodiumCard: React.FC<PodiumCardProps> = ({ entry, rank, onClick }) => {
  const cfg = PODIUM_RANK[rank] || PODIUM_RANK[3];
  const category = COMMUNITY_CATEGORIES[entry.category as keyof typeof COMMUNITY_CATEGORIES];
  const isGold = rank === 1;

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative rounded-xl overflow-hidden cursor-pointer group transition-all duration-300',
        cfg.ring,
        cfg.glow,
        'hover:shadow-xl bg-white dark:bg-zinc-900',
        isGold && 'hover:shadow-amber-400/30',
      )}
    >
      {/* Thumbnail */}
      <div className={cn('relative w-full overflow-hidden', isGold ? 'aspect-[4/3]' : 'aspect-[16/9]')}>
        <div className="absolute inset-0 w-full h-full">
          {entry.first_slide ? (
            <MiniSlide slide={entry.first_slide} className="w-full h-full" />
          ) : (
            <div className="flex items-center justify-center h-full bg-zinc-100 dark:bg-zinc-800">
              <FileStack className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
            </div>
          )}
        </div>

        {/* Rank badge */}
        <div className="absolute top-2.5 left-2.5 z-10">
          <div className={cn('flex items-center justify-center rounded-full shadow-lg', cfg.badgeBg, isGold ? 'h-9 w-9' : 'h-7 w-7')}>
            <cfg.Icon className={cn('text-white', isGold ? 'h-5 w-5' : 'h-3.5 w-3.5')} />
          </div>
        </div>

        {/* Featured badge */}
        {entry.is_featured && (
          <div className="absolute top-2.5 right-2.5 z-10">
            <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-[10px] font-semibold shadow-sm px-1.5 py-0.5 gap-0.5">
              <Star className="h-2.5 w-2.5 fill-current" />
              Featured
            </Badge>
          </div>
        )}

        {/* Category badge */}
        {!entry.is_featured && (
          <div className="absolute top-2.5 right-2.5 z-10">
            <Badge
              variant="secondary"
              className="text-[10px] font-medium backdrop-blur-md border-0 shadow-sm px-1.5 py-0.5"
              style={{ backgroundColor: `${category?.color || '#71717a'}dd`, color: 'white' }}
            >
              {category?.name || entry.category}
            </Badge>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent h-2/3 pointer-events-none" />

        {/* Title + author overlay */}
        <div className="absolute inset-x-0 bottom-0 px-3 pb-2.5 pt-6 z-10">
          <h3 className={cn('font-bold text-white truncate', isGold ? 'text-sm' : 'text-xs')} title={entry.title}>
            {entry.title}
          </h3>
          <p className="text-[11px] text-white/70 truncate mt-0.5">{entry.author_name || 'Anonymous'}</p>
        </div>

        {/* Hover shimmer */}
        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      </div>

      {/* Stats footer */}
      <div className="px-3 py-2 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900">
        <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{formatCount(entry.view_count)}</span>
        <span className="flex items-center gap-1"><Copy className="h-3 w-3" />{formatCount(entry.remix_count)}</span>
        <span className="flex items-center gap-1 ml-auto"><FileStack className="h-3 w-3" />{entry.slide_count} slides</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Runner Card — compact card for entries #4-10
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
      className="relative rounded-lg overflow-hidden cursor-pointer group ring-1 ring-zinc-200 dark:ring-zinc-700 hover:ring-zinc-300 dark:hover:ring-zinc-600 hover:shadow-md transition-all duration-200 bg-white dark:bg-zinc-900"
    >
      {/* Thumbnail */}
      <div className="relative w-full aspect-[16/9] overflow-hidden">
        <div className="absolute inset-0 w-full h-full">
          {entry.first_slide ? (
            <MiniSlide slide={entry.first_slide} className="w-full h-full" />
          ) : (
            <div className="flex items-center justify-center h-full bg-zinc-100 dark:bg-zinc-800">
              <FileStack className="h-5 w-5 text-zinc-300 dark:text-zinc-600" />
            </div>
          )}
        </div>

        {/* Rank badge */}
        <div className="absolute top-1.5 left-1.5 z-10">
          <div className="flex items-center justify-center h-5 w-5 rounded-full bg-zinc-800/80 backdrop-blur-sm shadow-sm">
            <span className="text-[10px] font-bold text-white">#{entry.rank}</span>
          </div>
        </div>

        {/* Category dot */}
        <div className="absolute bottom-1.5 right-1.5 z-10">
          <div
            className="h-2.5 w-2.5 rounded-full shadow-sm"
            style={{ backgroundColor: category?.color || '#71717a' }}
            title={category?.name || entry.category}
          />
        </div>

        {/* Gradient */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent h-1/2 pointer-events-none" />

        {/* Title */}
        <div className="absolute inset-x-0 bottom-0 px-2 pb-1.5 pt-3 z-10">
          <p className="text-[11px] font-semibold text-white truncate">{entry.title}</p>
        </div>
      </div>

      {/* Mini stats */}
      <div className="px-2 py-1.5 flex items-center gap-2 text-[10px] text-zinc-400 dark:text-zinc-500">
        <span className="flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" />{formatCount(entry.view_count)}</span>
        <span className="flex items-center gap-0.5"><Copy className="h-2.5 w-2.5" />{formatCount(entry.remix_count)}</span>
      </div>
    </div>
  );
};

export default Showcase;
