import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
// Card imports removed - using admin-styled divs
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Search,
  Grid3X3,
  List,
  FileStack,
  User,
  Calendar,
  Eye,
  Edit,
  Share2,
  MoreVertical,
  Download,
  Trash2,
  ExternalLink,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { adminApi, DeckSummary } from '@/services/adminApi';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import DeckPreviewModal from '@/components/admin/DeckPreviewModal';
import DeckThumbnail from '@/components/deck/DeckThumbnail';
import { CompleteDeckData } from '@/types/DeckTypes';

// ---------------------------------------------------------------------------
// Shared design tokens (match AdminServices)
// ---------------------------------------------------------------------------
const sectionHeading = "text-[10px] font-bold uppercase tracking-wider text-[#FF4301]";
const cardClass = "bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl";

type ViewMode = 'grid' | 'list';

const AdminDecks: React.FC = () => {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDecks, setTotalDecks] = useState(0);
  const [selectedDeck, setSelectedDeck] = useState<DeckSummary | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewDeckIndex, setPreviewDeckIndex] = useState(0);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [prevDependencies, setPrevDependencies] = useState({ currentPage, searchQuery, visibilityFilter });

  useEffect(() => {
    // Only use transition if it's a page change, not initial load or filter change
    const isPageChange = prevDependencies.currentPage !== currentPage && 
                        prevDependencies.searchQuery === searchQuery && 
                        prevDependencies.visibilityFilter === visibilityFilter;
    
    setPrevDependencies({ currentPage, searchQuery, visibilityFilter });
    fetchDecks(isPageChange);
  }, [currentPage, searchQuery, visibilityFilter]);

  const fetchDecks = async (showTransition = false) => {
    try {
      if (showTransition) {
        setIsTransitioning(true);
      } else {
        setIsLoading(true);
      }
      
      const response = await adminApi.getAllDecks({
        page: currentPage,
        limit: viewMode === 'grid' ? 12 : 20,
        search: searchQuery,
        visibility: visibilityFilter === 'all' ? undefined : visibilityFilter,
      });

      setDecks(response.decks);
      setTotalPages(response.totalPages);
      setTotalDecks(response.total);
    } catch (error) {
      console.error('Error fetching decks:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load decks',
      });
    } finally {
      setIsLoading(false);
      setIsTransitioning(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleVisibilityFilter = (value: string) => {
    setVisibilityFilter(value);
    setCurrentPage(1);
  };

  const handleDeleteDeck = async () => {
    if (!selectedDeck) return;

    try {
      await adminApi.deleteDeck(selectedDeck.id);
      toast({
        title: 'Success',
        description: 'Deck deleted successfully',
      });
      fetchDecks();
      setShowDeleteDialog(false);
      setSelectedDeck(null);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete deck',
      });
    }
  };

  const openDeleteDialog = (deck: DeckSummary) => {
    setSelectedDeck(deck);
    setShowDeleteDialog(true);
  };

  const handleDeckClick = (deck: DeckSummary, index: number) => {
    setPreviewDeckIndex(index);
    setPreviewModalOpen(true);
  };

  const DeckGridItem: React.FC<{ deck: DeckSummary; index: number }> = ({ deck, index }) => (
    <div
      className="relative aspect-[16/10] rounded-xl overflow-hidden cursor-pointer group shadow-sm hover:shadow-md transition-shadow"
      onClick={() => handleDeckClick(deck, index)}
    >
      {/* Thumbnail */}
      <DeckThumbnail
        deck={{
          ...deck,
          slides: deck.slides || []
        } as CompleteDeckData}
      />

      {/* Visibility badge */}
      <Badge
        variant="secondary"
        className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 bg-black/60 text-white backdrop-blur-sm border-0"
      >
        {deck.visibility}
      </Badge>

      {/* Bottom gradient overlay with metadata */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent pt-8 pb-2 px-3">
        <h3 className="font-medium text-sm text-white truncate">{deck.name}</h3>
        <div className="flex items-center justify-between text-[11px] text-white/80 mt-0.5">
          <span className="truncate max-w-[50%]">
            {deck.userFullName ||
             deck.userEmail ||
             (deck.userId && deck.userId.length >= 8 ? `#${deck.userId.slice(0, 8)}` : 'Unknown')}
          </span>
          <span className="flex-shrink-0">{deck.slideCount} slides</span>
        </div>
        <div className="flex items-center justify-between text-[10px] text-white/60 mt-1">
          <span>{deck.createdAt && !isNaN(new Date(deck.createdAt).getTime())
            ? format(new Date(deck.createdAt), 'MMM d')
            : '-'
          }</span>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-0.5" title="Views">
              <Eye className="h-2.5 w-2.5" />
              {deck.analytics.viewCount}
            </span>
            <span className="flex items-center gap-0.5" title="Edits">
              <Edit className="h-2.5 w-2.5" />
              {deck.analytics.editCount}
            </span>
            <span className="flex items-center gap-0.5" title="Shares">
              <Share2 className="h-2.5 w-2.5" />
              {deck.analytics.shareCount}
            </span>
          </div>
        </div>
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );

  const DeckListItem: React.FC<{ deck: DeckSummary; index: number }> = ({ deck, index }) => (
    <div
      className="w-full grid grid-cols-[auto,1fr,auto] items-center gap-3 p-2.5 border border-[#eaeaea] dark:border-[#333] rounded-xl hover:bg-[#fafafa] dark:hover:bg-[#161616] transition-colors cursor-pointer"
      onClick={() => handleDeckClick(deck, index)}>
      
      {/* Thumbnail */}
      <div className="w-28 aspect-video bg-muted rounded flex-shrink-0 overflow-hidden">
        <DeckThumbnail 
          deck={{ ...deck, slides: deck.slides || [] } as CompleteDeckData} 
        />
      </div>

      {/* Deck Info */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-medium truncate">{deck.name}</h3>
          <Badge variant="outline" className="text-xs flex-shrink-0">
            {deck.visibility}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground truncate">
                                  <span className="truncate">
                                    By {deck.userFullName || 
                                       deck.userEmail || 
                                       (deck.userId && deck.userId.length >= 8 ? `User #${deck.userId.slice(0, 8)}` : 'Unknown')}
                                  </span>
          <span>•</span>
          <span className="flex-shrink-0">{deck.slideCount} slides</span>
          <span>•</span>
          <span className="truncate">Modified {deck.lastModified && !isNaN(new Date(deck.lastModified).getTime())
            ? formatDistanceToNow(new Date(deck.lastModified), { addSuffix: true })
            : 'recently'
          }</span>
        </div>
      </div>

      {/* Actions and Stats */}
      <div className="flex items-center gap-6">
        <div className="hidden md:flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1" title="Views">
            <Eye className="h-4 w-4" />
            <span>{deck.analytics.viewCount}</span>
          </div>
          <div className="flex items-center gap-1" title="Edits">
            <Edit className="h-4 w-4" />
            <span>{deck.analytics.editCount}</span>
          </div>
          <div className="flex items-center gap-1" title="Shares">
            <Share2 className="h-4 w-4" />
            <span>{deck.analytics.shareCount}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild onClick={(e) => e.stopPropagation()}>
            <Link to={`/deck/${deck.uuid}`}>
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem asChild>
                <Link to={`/deck/${deck.uuid}`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open in Editor
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Download className="mr-2 h-4 w-4" />
                Export
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="text-destructive"
                onClick={() => openDeleteDialog(deck)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );

  return (
    <AdminLayoutV2>
      <div className="w-full space-y-3">
        {/* ── Page header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold uppercase tracking-wider" style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>
              Decks
            </h1>
            <span className="text-[11px] font-mono text-[#666] dark:text-[#888]">
              {totalDecks}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex rounded-lg border border-[#eaeaea] dark:border-[#333] overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={cn("p-1.5 transition-colors", viewMode === 'grid' ? "bg-[#FF4301] text-white" : "text-[#888] hover:bg-[#f5f5f5] dark:hover:bg-[#222]")}
              >
                <Grid3X3 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn("p-1.5 transition-colors", viewMode === 'list' ? "bg-[#FF4301] text-white" : "text-[#888] hover:bg-[#f5f5f5] dark:hover:bg-[#222]")}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Filters ── */}
        <section>
          <h2 className={sectionHeading} style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Filters</h2>
          <div className="flex gap-2 mt-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#999]" />
            <Input
              placeholder="Search by deck name..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9 h-9 text-sm bg-white dark:bg-[#111] border-[#eaeaea] dark:border-[#333]"
            />
          </div>
          <Select value={visibilityFilter} onValueChange={handleVisibilityFilter}>
            <SelectTrigger className="w-[120px] h-9 text-[11px] border-[#eaeaea] dark:border-[#333]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="private">Private</SelectItem>
              <SelectItem value="unlisted">Unlisted</SelectItem>
            </SelectContent>
          </Select>
          </div>
        </section>

        {/* ── Gallery ── */}
        <section>
          <h2 className={sectionHeading} style={{ fontFamily: '"HK Grotesk Wide", sans-serif' }}>Gallery</h2>
          <div className="mt-1.5">
            {isLoading && !isTransitioning ? (
              viewMode === 'grid' ? (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {[...Array(24)].map((_, i) => (
                    <Skeleton key={i} className="aspect-[16/10] w-full rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2 w-full">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="grid grid-cols-[auto,1fr,auto] items-center gap-4 p-3 border rounded-lg w-full">
                      <Skeleton className="w-28 h-[63px] rounded" />
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="hidden md:flex items-center gap-4">
                          <Skeleton className="h-5 w-8" />
                          <Skeleton className="h-5 w-8" />
                          <Skeleton className="h-5 w-8" />
                        </div>
                        <Skeleton className="h-8 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : decks.length === 0 ? (
              <div className="py-16 text-center">
                <FileStack className="h-10 w-10 mx-auto mb-3 text-[#ccc] dark:text-[#555]" />
                <h3 className="text-sm font-medium mb-1">No decks found</h3>
                <p className="text-xs text-[#888]">
                  {searchQuery || visibilityFilter !== 'all'
                    ? 'Try adjusting your filters'
                    : 'No decks have been created yet'}
                </p>
              </div>
            ) : (
              <div className={cn(
                "transition-opacity duration-200",
                isTransitioning ? "opacity-50" : "opacity-100"
              )}>
                {viewMode === 'grid' ? (
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {decks.map((deck, index) => (
                      <DeckGridItem key={deck.id} deck={deck} index={index} />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2 w-full">
                    {decks.map((deck, index) => (
                      <DeckListItem key={deck.id} deck={deck} index={index} />
                    ))}
                  </div>
                )}
              </div>
            )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#888]">
              {((currentPage - 1) * (viewMode === 'grid' ? 12 : 20)) + 1}–{Math.min(currentPage * (viewMode === 'grid' ? 12 : 20), totalDecks)} of {totalDecks}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 rounded border border-[#eaeaea] dark:border-[#333] hover:bg-[#f5f5f5] dark:hover:bg-[#222] disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                const page = i + 1;
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={cn(
                      "w-7 h-7 rounded transition-colors",
                      currentPage === page
                        ? "bg-[#FF4301] text-white font-medium"
                        : "border border-[#eaeaea] dark:border-[#333] hover:bg-[#f5f5f5] dark:hover:bg-[#222]"
                    )}
                  >
                    {page}
                  </button>
                );
              })}
              {totalPages > 5 && <span className="px-1 text-[#999]">...</span>}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2 py-1 rounded border border-[#eaeaea] dark:border-[#333] hover:bg-[#f5f5f5] dark:hover:bg-[#222] disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
        </section>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the deck
                "{selectedDeck?.name}" and all its {selectedDeck?.slideCount} slides.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground"
                onClick={handleDeleteDeck}
              >
                Delete Deck
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Deck Preview Modal */}
        <DeckPreviewModal
          isOpen={previewModalOpen}
          onClose={() => setPreviewModalOpen(false)}
          decks={decks}
          currentIndex={previewDeckIndex}
          onNavigate={setPreviewDeckIndex}
        />
      </div>
    </AdminLayoutV2>
  );
};

export default AdminDecks;