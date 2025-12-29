import React, { useEffect, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, X, Loader2, FileStack } from 'lucide-react';
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search community slides..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-9 pr-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* Category Filters */}
          {showFilters && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(COMMUNITY_CATEGORIES).map(([key, value]) => {
                const cat = categories.find((c) => c.name === key);
                const isSelected = selectedCategory === key;
                return (
                  <Badge
                    key={key}
                    variant={isSelected ? 'default' : 'outline'}
                    className={cn(
                      'cursor-pointer transition-colors',
                      isSelected && 'ring-2 ring-offset-2'
                    )}
                    style={{
                      backgroundColor: isSelected ? value.color : 'transparent',
                      borderColor: value.color,
                      color: isSelected ? 'white' : value.color,
                    }}
                    onClick={() => handleCategoryClick(key)}
                  >
                    {value.name}
                    {cat && cat.count > 0 && (
                      <span className="ml-1 opacity-75">({cat.count})</span>
                    )}
                  </Badge>
                );
              })}
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="text-xs h-6"
                >
                  Clear filters
                </Button>
              )}
            </div>
          )}
        </div>
      )}


      {/* Loading State */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(maxItems || 8)].map((_, i) => (
            <div key={i} className="rounded-lg overflow-hidden">
              <Skeleton className="aspect-video w-full" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : decks.length === 0 ? (
        <div className="py-12 text-center">
          <FileStack className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 mb-2">No community slides found</p>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Deck Grid */}
          <div
            className={cn(
              'grid gap-4',
              variant === 'landing'
                ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            )}
          >
            {decks.map((deck) => (
              <CommunityDeckCard
                key={deck.id}
                deck={deck}
                onRemix={handleRemix}
                onView={onDeckClick || handleView}
                isRemixing={remixingId === deck.id}
                showRemixButton={variant === 'app'}
              />
            ))}
          </div>

          {/* Load More */}
          {hasMore && !maxItems && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => fetchDecks(true)}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load More'
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CommunityGallery;
