import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import {
  Search,
  X,
  FileStack,
  Briefcase,
  GraduationCap,
  Megaphone,
  Palette,
  Cpu,
  Heart,
  ChevronDown,
  Sparkles,
} from 'lucide-react';

const CATEGORY_ICONS = {
  Briefcase,
  GraduationCap,
  Megaphone,
  Palette,
  Cpu,
  Heart,
} as const;

import {
  communityService,
  CommunityDeck,
  CategoryCount,
  COMMUNITY_CATEGORIES,
} from '@/services/communityService';
import CommunityDeckCard from './CommunityDeckCard';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/SupabaseAuthContext';
import { useIsMobile } from '@/hooks/use-mobile';

const HK = '"HK Grotesk", "Hanken Grotesk", sans-serif';

interface CommunityGalleryProps {
  variant?: 'landing' | 'app';
  maxItems?: number;
  showSearch?: boolean;
  showFilters?: boolean;
  onDeckClick?: (deck: CommunityDeck) => void;
  className?: string;
}

// ── Skeleton card ──────────────────────────────────────────────────────────
const SkeletonCard: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('aspect-[16/9] w-full rounded-xl overflow-hidden', className)}>
    <div className="relative w-full h-full bg-zinc-100 dark:bg-zinc-800/80">
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)',
          animation: 'shimmer 1.8s ease-in-out infinite',
        }}
      />
      <div className="absolute bottom-3 left-3 right-12 space-y-1.5">
        <div className="h-3 w-3/4 rounded bg-zinc-200/50 dark:bg-zinc-700/50" />
        <div className="h-2 w-1/2 rounded bg-zinc-200/30 dark:bg-zinc-700/30" />
      </div>
    </div>
  </div>
);

const CommunityGallery: React.FC<CommunityGalleryProps> = ({
  variant = 'app',
  maxItems,
  showSearch = true,
  showFilters = true,
  onDeckClick,
  className,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [decks, setDecks] = useState<CommunityDeck[]>([]);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  // Use ref for page to avoid re-render cascades on Load More
  const pageRef = useRef(1);

  // Remix state
  const [remixingId, setRemixingId] = useState<string | null>(null);

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch decks — stable callback that reads page from ref
  const fetchDecks = useCallback(
    async (loadMore = false) => {
      try {
        if (loadMore) {
          setIsLoadingMore(true);
        } else {
          setIsLoading(true);
        }
        const nextPage = loadMore ? pageRef.current + 1 : 1;
        const limit = maxItems || 12;
        const response = await communityService.getDecks({
          search: debouncedSearch || undefined,
          category: selectedCategory || undefined,
          page: nextPage,
          limit,
        });
        pageRef.current = nextPage;
        if (loadMore) {
          setDecks((prev) => [...prev, ...response.decks]);
        } else {
          setDecks(response.decks);
        }
        setHasMore(response.hasMore);
        setTotal(response.total);
      } catch (error) {
        console.error('Error fetching community decks:', error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load community slides' });
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [debouncedSearch, selectedCategory, maxItems],
  );

  // Fetch categories once
  useEffect(() => {
    communityService.getCategories().then(setCategories).catch(console.error);
  }, []);

  // Re-fetch when search/category changes
  useEffect(() => {
    pageRef.current = 1;
    fetchDecks();
  }, [fetchDecks]);

  // Stable refs so callbacks never change identity
  const userRef = useRef(user);
  userRef.current = user;

  const handleView = useCallback(
    (deck: CommunityDeck) => navigate(`/community/${deck.id}`),
    [navigate],
  );

  const handleRemix = useCallback(
    async (deck: CommunityDeck) => {
      if (!userRef.current) {
        toast({ title: 'Sign in required', description: 'Please sign in to remix slides' });
        navigate('/login');
        return;
      }
      try {
        setRemixingId(deck.id);
        const result = await communityService.remixDeck(deck.id);
        toast({ title: 'Remixed!', description: `"${result.deckName}" has been added to your slides` });
        navigate(`/app?deck=${result.deckUuid}`);
      } catch {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to remix deck' });
      } finally {
        setRemixingId(null);
      }
    },
    [navigate],
  );

  const viewHandler = useMemo(
    () => onDeckClick || handleView,
    [onDeckClick, handleView],
  );

  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategory((prev) => (prev === categoryName ? null : categoryName));
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory(null);
  };

  const hasActiveFilters = searchQuery || selectedCategory;

  return (
    <div className={cn('space-y-5', className)}>
      {/* ── Search & Filters ─────────────────────────────────────────── */}
      {(showSearch || showFilters) && (
        <div className="space-y-3">
          {showSearch && (
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Search presentations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10 h-11 rounded-xl bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-700/80 focus:ring-2 focus:ring-[#FF4301]/20 focus:border-[#FF4301]/50 text-sm"
                style={{ fontFamily: HK }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {showFilters && (
            <div
              className={cn(
                'flex gap-1.5',
                isMobile ? 'overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide' : 'flex-wrap',
              )}
            >
              {Object.entries(COMMUNITY_CATEGORIES).map(([key, value]) => {
                const cat = categories.find((c) => c.name === key);
                const isSelected = selectedCategory === key;
                const IconComponent = CATEGORY_ICONS[value.icon as keyof typeof CATEGORY_ICONS];
                return (
                  <button
                    key={key}
                    onClick={() => handleCategoryClick(key)}
                    className={cn(
                      'relative px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all duration-200 flex-shrink-0',
                      'flex items-center gap-1.5 active:scale-95',
                      isSelected
                        ? 'text-white shadow-md'
                        : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80',
                    )}
                    style={{
                      fontFamily: HK,
                      ...(isSelected
                        ? { backgroundColor: value.color, boxShadow: `0 4px 12px ${value.color}33` }
                        : {}),
                    }}
                  >
                    <IconComponent className="h-3.5 w-3.5" />
                    <span>{value.name}</span>
                    <span
                      className={cn(
                        'min-w-[1.25rem] px-1 py-px rounded text-[10px] font-bold text-center',
                        isSelected
                          ? 'bg-white/25 text-white'
                          : 'bg-zinc-200/80 dark:bg-zinc-700/80 text-zinc-500 dark:text-zinc-500',
                      )}
                    >
                      {cat?.count ?? 0}
                    </span>
                  </button>
                );
              })}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1 flex-shrink-0"
                  style={{ fontFamily: HK }}
                >
                  Clear
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Loading skeleton ──────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : decks.length === 0 ? (
        /* ── Empty state ───────────────────────────────────────────── */
        <div className="py-16 flex flex-col items-center text-center">
          <div className="relative mb-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-700 flex items-center justify-center">
              <FileStack className="h-7 w-7 text-zinc-400" />
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#FF4301]/10 flex items-center justify-center">
              <Sparkles className="h-2.5 w-2.5 text-[#FF4301]" />
            </div>
          </div>
          <p className="text-base font-bold text-zinc-700 dark:text-zinc-300" style={{ fontFamily: HK }}>
            {hasActiveFilters ? 'No matches found' : 'Nothing here yet'}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs">
            {hasActiveFilters
              ? 'Try different keywords or clear your filters'
              : 'Community presentations will appear here soon'}
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold bg-[#FF4301] text-white hover:bg-[#E63901] transition-colors"
              style={{ fontFamily: HK }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* ── Deck grid ────────────────────────────────────────────── */}
          <div
            className={cn(
              'grid gap-3',
              variant === 'landing'
                ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
            )}
          >
            {decks.map((deck) => (
              <CommunityDeckCard
                key={deck.id}
                deck={deck}
                onRemix={handleRemix}
                onView={viewHandler}
                isRemixing={remixingId === deck.id}
                showRemixButton={variant === 'app'}
              />
            ))}
          </div>

          {/* ── Load more ─────────────────────────────────────────────── */}
          {hasMore && !maxItems && (
            <div className="flex flex-col items-center gap-2 pt-4">
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500" style={{ fontFamily: HK }}>
                Showing {decks.length} of {total}
              </p>
              <button
                onClick={() => fetchDecks(true)}
                disabled={isLoadingMore}
                className={cn(
                  'inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all',
                  'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300',
                  'hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-[0.97]',
                  'disabled:opacity-50',
                )}
                style={{ fontFamily: HK }}
              >
                {isLoadingMore ? (
                  <>
                    <div className="h-3.5 w-3.5 border-2 border-zinc-300 dark:border-zinc-600 border-t-[#FF4301] rounded-full animate-spin" />
                    Loading
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" />
                    Load more
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default React.memo(CommunityGallery);
