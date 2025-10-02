import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
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
  Filter,
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
    <Card className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer h-full w-full">
      <div 
        className="aspect-video bg-muted relative group"
        onClick={() => handleDeckClick(deck, index)}>
        <DeckThumbnail 
          deck={{
            ...deck,
            slides: deck.slides || []
          } as CompleteDeckData} 
        />
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button size="sm" variant="secondary" asChild>
            <Link to={`/deck/${deck.uuid}`}>
              <Eye className="h-4 w-4 mr-1" />
              View
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold truncate flex-1">{deck.name}</h3>
          <Badge variant="outline" className="ml-2 text-xs">
            {deck.visibility}
          </Badge>
        </div>
        {deck.description && (
          <p className="text-sm text-muted-foreground truncate mb-3">
            {deck.description}
          </p>
        )}
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <User className="h-3 w-3" />
            <span className="truncate">
              {deck.userFullName || 
               deck.userEmail || 
               (deck.userId && deck.userId.length >= 8 ? `User #${deck.userId.slice(0, 8)}` : 
                deck.id && deck.id.length >= 8 ? `User #${deck.id.slice(0, 8)}` : 
                'Unknown User')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-3 w-3" />
            <span>{deck.createdAt && !isNaN(new Date(deck.createdAt).getTime())
              ? format(new Date(deck.createdAt), 'MMM d, yyyy')
              : '-'
            }</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{deck.slideCount} slides</span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {deck.analytics.viewCount}
              </div>
              <div className="flex items-center gap-1">
                <Edit className="h-3 w-3" />
                {deck.analytics.editCount}
              </div>
              <div className="flex items-center gap-1">
                <Share2 className="h-3 w-3" />
                {deck.analytics.shareCount}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const DeckListItem: React.FC<{ deck: DeckSummary; index: number }> = ({ deck, index }) => (
    <div 
      className="w-full grid grid-cols-[auto,1fr,auto] items-center gap-4 p-3 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
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
    <AdminLayout>
      <div className="w-full">
        {/* Header */}
        <div className="mb-8 w-full">
          <h1 className="text-3xl font-bold" style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}>Decks</h1>
          <p className="text-muted-foreground mt-2">
            Browse and manage all platform decks
          </p>
        </div>

        {/* Filters and View Toggle */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6 w-full">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by deck name..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Select value={visibilityFilter} onValueChange={handleVisibilityFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Visibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Decks</SelectItem>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="unlisted">Unlisted</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
            <div className="flex rounded-md shadow-sm">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setViewMode('grid')}
                className="rounded-r-none"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setViewMode('list')}
                className="rounded-l-none"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Decks Display */}
        <Card className="w-full">
          <CardContent className="p-6 w-full">
            {isLoading && !isTransitioning ? (
              viewMode === 'grid' ? (
                <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-8 w-full">
                  {[...Array(24)].map((_, i) => (
                    <Card key={i} className="overflow-hidden h-full">
                      <Skeleton className="aspect-video w-full" />
                      <CardContent className="p-4 space-y-3">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-4 w-4 rounded-full" />
                            <Skeleton className="h-3 w-20" />
                          </div>
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-4 w-4" />
                            <Skeleton className="h-3 w-12" />
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-2">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-6 w-16 rounded-full" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="space-y-4 w-full">
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
              <div className="p-12 text-center">
                <FileStack className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-medium mb-2">No decks found</h3>
                <p className="text-muted-foreground">
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
                  <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-8 w-full">
                    {decks.map((deck, index) => (
                      <DeckGridItem key={deck.id} deck={deck} index={index} />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4 w-full">
                    {decks.map((deck, index) => (
                      <DeckListItem key={deck.id} deck={deck} index={index} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-2 py-4 mt-8">
            <div className="text-sm text-muted-foreground">
              Showing {((currentPage - 1) * (viewMode === 'grid' ? 12 : 20)) + 1} to{' '}
              {Math.min(currentPage * (viewMode === 'grid' ? 12 : 20), totalDecks)} of {totalDecks} decks
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <div className="flex items-center gap-1">
                {[...Array(Math.min(5, totalPages))].map((_, i) => {
                  const page = i + 1;
                  return (
                    <Button
                      key={page}
                      variant={currentPage === page ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className="w-8"
                    >
                      {page}
                    </Button>
                  );
                })}
                {totalPages > 5 && <span className="px-2">...</span>}
                {totalPages > 5 && (
                  <Button
                    variant={currentPage === totalPages ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    className="w-8"
                  >
                    {totalPages}
                  </Button>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

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
    </AdminLayout>
  );
};

export default AdminDecks;