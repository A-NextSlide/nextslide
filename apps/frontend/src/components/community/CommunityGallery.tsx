import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Input } from '@/components/ui/input';
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
import CommunityDeckCardPlaceholder from './CommunityDeckCardPlaceholder';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/SupabaseAuthContext';
import { useCommunityThumbnailCache } from '@/hooks/useCommunityThumbnailCache';
import { BROWSER } from '@/utils/browser';
import { useIsMobile } from '@/hooks/use-mobile';

interface CommunityGalleryProps {
  variant?: 'landing' | 'app';
  maxItems?: number;
  showSearch?: boolean;
  showFilters?: boolean;
  onDeckClick?: (deck: CommunityDeck) => void;
  className?: string;
}

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
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  // Remix state
  const [remixingId, setRemixingId] = useState<string | null>(null);

  // Thumbnail caching for mobile performance
  const { getCachedThumbnail, hasCachedThumbnail, captureThumbnail, cacheVersion } = useCommunityThumbnailCache();
  const thumbnailRefsMapRef = useRef<Map<string, HTMLDivElement>>(new Map());

  // Mobile: render all items live, MiniSlide self-virtualizes content
  // No render queue needed — just always render
  const hasCachedThumbnailRef = useRef(hasCachedThumbnail);
  hasCachedThumbnailRef.current = hasCachedThumbnail;

  // Always render — MiniSlide self-virtualizes its content via IntersectionObserver
  const shouldRenderThumbnail = useCallback((_deckId: string): boolean => {
    return true;
  }, []);

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch decks
  const fetchDecks = useCallback(async (loadMore = false) => {
    try {
      if (loadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      const currentPage = loadMore ? page + 1 : 1;
      const limit = maxItems || 12;

      const response = await communityService.getDecks({
        search: debouncedSearch || undefined,
        category: selectedCategory || undefined,
        page: currentPage,
        limit,
      });

      if (loadMore) {
        setDecks((prev) => [...prev, ...response.decks]);
      } else {
        setDecks(response.decks);
      }

      setPage(currentPage);
      setHasMore(response.hasMore);
      setTotal(response.total);
    } catch (error) {
      console.error('Error fetching community decks:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load community slides',
      });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [debouncedSearch, selectedCategory, maxItems, page]);

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      const cats = await communityService.getCategories();
      setCategories(cats);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchDecks();
    fetchCategories();
  }, []);

  // Refetch when filters change
  useEffect(() => {
    fetchDecks();
  }, [debouncedSearch, selectedCategory]);

  // Handle view - navigate to presentation view
  const handleView = (deck: CommunityDeck) => {
    // Navigate to community presentation view
    navigate(`/community/${deck.id}`);
  };

  // Handle remix
  const handleRemix = async (deck: CommunityDeck) => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to remix slides',
      });
      navigate('/login');
      return;
    }

    try {
      setRemixingId(deck.id);
      const result = await communityService.remixDeck(deck.id);
      toast({
        title: 'Remixed!',
        description: `"${result.deckName}" has been added to your slides`,
      });
      // Navigate to the new deck in the app
      navigate(`/app?deck=${result.deckUuid}`);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to remix deck',
      });
    } finally {
      setRemixingId(null);
    }
  };

  // Handle category click
  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategory((prev) => (prev === categoryName ? null : categoryName));
    setPage(1);
  };

  // Clear filters
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory(null);
    setPage(1);
  };

  const hasActiveFilters = searchQuery || selectedCategory;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search and Filters */}
      {(showSearch || showFilters) && (
        <div className="space-y-3">
          {/* Search */}
          {showSearch && (
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Search for slides..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-11 pr-10 h-12 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                style={{ fontFamily: '"HK Grotesk", "Hanken Grotesk", sans-serif' }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* Category Filters */}
          {showFilters && (
            <div className={cn(
              "flex gap-2",
              isMobile
                ? "overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide"
                : "flex-wrap"
            )}>
              {Object.entries(COMMUNITY_CATEGORIES).map(([key, value]) => {
                const cat = categories.find((c) => c.name === key);
                const isSelected = selectedCategory === key;
                const IconComponent = CATEGORY_ICONS[value.icon as keyof typeof CATEGORY_ICONS];
                return (
                  <button
                    key={key}
                    onClick={() => handleCategoryClick(key)}
                    className={cn(
                      'group relative px-4 py-2 rounded-full font-semibold text-sm transition-all duration-200',
                      'hover:scale-105 active:scale-95 flex-shrink-0',
                      isSelected
                        ? `bg-gradient-to-r ${value.gradient} text-white shadow-lg`
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    )}
                    style={{
                      fontFamily: '"HK Grotesk", "Hanken Grotesk", sans-serif',
                      boxShadow: isSelected ? `0 4px 14px ${value.color}40` : undefined,
                    }}
                  >
                    <span className="flex items-center gap-1.5">
                      <IconComponent className={cn(
                        'h-4 w-4 transition-transform duration-200',
                        isSelected ? 'scale-110' : 'group-hover:scale-110'
                      )} />
                      <span>{value.name}</span>
                      <span className={cn(
                        'ml-0.5 min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-xs font-bold text-center',
                        isSelected
                          ? 'bg-white/25 text-white'
                          : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                      )}>
                        {cat?.count ?? 0}
                      </span>
                    </span>
                  </button>
                );
              })}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="px-3 py-2 rounded-full text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1"
                  style={{ fontFamily: '"HK Grotesk", "Hanken Grotesk", sans-serif' }}
                >
                  Clear all
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      )}


      {/* Loading State */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative">
            <div className="absolute inset-0 bg-orange-500/20 rounded-full blur-xl animate-pulse" />
            <Loader2 className="relative h-8 w-8 text-orange-500 animate-spin" />
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-6">
            Loading community slides...
          </p>
        </div>
      ) : decks.length === 0 ? (
        <div className="py-16 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-700 mb-4">
            <FileStack className="h-8 w-8 text-zinc-400" />
          </div>
          <p
            className="text-lg font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
            style={{ fontFamily: '"HK Grotesk", "Hanken Grotesk", sans-serif' }}
          >
            No slides found
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            {hasActiveFilters ? 'Try adjusting your filters' : 'Check back soon for new community slides!'}
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-4 py-2 rounded-full text-sm font-medium bg-gradient-to-r from-orange-500 to-pink-500 text-white hover:opacity-90 transition-opacity"
              style={{ fontFamily: '"HK Grotesk", "Hanken Grotesk", sans-serif' }}
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Deck Grid */}
          <div
            className={cn(
              'grid gap-4',
              variant === 'landing'
                ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            )}
          >
            {decks.map((deck) => {
              // Get cached thumbnail for mobile performance
              const cachedUrl = BROWSER.isMobile ? getCachedThumbnail(deck.id) : null;

              // On mobile, show placeholder if not ready to render yet
              if (BROWSER.isMobile && !shouldRenderThumbnail(deck.id)) {
                return (
                  <CommunityDeckCardPlaceholder
                    key={deck.id}
                    deck={deck}
                    onView={onDeckClick || handleView}
                  />
                );
              }

              return (
                <CommunityDeckCard
                  key={deck.id}
                  deck={deck}
                  onRemix={handleRemix}
                  onView={onDeckClick || handleView}
                  isRemixing={remixingId === deck.id}
                  showRemixButton={variant === 'app'}
                  cachedThumbnailUrl={cachedUrl}
                  onThumbnailRef={(el) => {
                    if (el && deck.id) {
                      thumbnailRefsMapRef.current.set(deck.id, el);
                    } else if (deck.id) {
                      thumbnailRefsMapRef.current.delete(deck.id);
                    }
                  }}
                />
              );
            })}
          </div>

          {/* Load More */}
          {hasMore && !maxItems && (
            <div className="flex justify-center pt-6">
              <button
                onClick={() => fetchDecks(true)}
                disabled={isLoadingMore}
                className="px-6 py-3 rounded-full text-sm font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
                style={{ fontFamily: '"HK Grotesk", "Hanken Grotesk", sans-serif' }}
              >
                {isLoadingMore ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </span>
                ) : (
                  'Load more slides'
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CommunityGallery;
