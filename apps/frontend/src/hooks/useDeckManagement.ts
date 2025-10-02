import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { deckSyncService } from '@/lib/deckSyncService';
import { CompleteDeckData } from '@/types/DeckTypes';
import { useToast } from '@/hooks/use-toast';
import { useDeckStore } from '@/stores/deckStore';
import { authService } from '@/services/authService';
import { useAuth } from '@/context/SupabaseAuthContext';

export interface UseDeckManagementReturn {
  decks: CompleteDeckData[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  authError: boolean;
  deckToDelete: string | null;
  isDeleting: boolean;
  hasMore: boolean;
  loadDecks: () => Promise<void>; // Exposed for potential manual refresh
  loadMoreDecks: () => Promise<void>; // Load next page
  handleCreateDeck: () => Promise<void>;
  handleEditDeck: (deck: CompleteDeckData) => Promise<void>;
  handleShowDeleteDialog: (deckId: string, event: React.MouseEvent) => void;
  handleConfirmDelete: () => Promise<void>;
  handleCancelDelete: () => void;
  setDecks: React.Dispatch<React.SetStateAction<CompleteDeckData[]>>;
}

export const useDeckManagement = (): UseDeckManagementReturn => {
  const [decks, setDecks] = useState<CompleteDeckData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [deckToDelete, setDeckToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentOffset, setCurrentOffset] = useState(0);
  
  // Add creation guard ref
  const isCreatingRef = useRef(false);
  // Guard to prevent multiple rapid calls to handleEditDeck
  const isEditingRef = useRef(false);
  // Guard to prevent duplicate loadMore calls
  const isLoadingMoreRef = useRef(false);
  
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  
  const storeCreateDefaultDeck = useDeckStore(state => state.createDefaultDeck);
  const storeUpdateDeckData = useDeckStore(state => state.updateDeckData); 
  const storeDeleteDeck = useDeckStore(state => state.deleteDeck);
  const storeCleanupRealtimeSubscription = useDeckStore.getState().cleanupRealtimeSubscription;
  const storeReset = useDeckStore.getState().resetStore;

  const loadDecks = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setAuthError(false);
      console.log('[useDeckManagement] Loading initial decks...');
      
      // Wait for auth to be ready by getting token asynchronously
      const token = await authService.getAuthTokenAsync();
      if (!token) {
        console.log('[useDeckManagement] No auth token available, user not authenticated');
        setDecks([]);
        setHasMore(false);
        setAuthError(true);
        setIsLoading(false);
        return;
      }
      
      const result = await deckSyncService.getAllDecks(20, 0);
      console.log('[useDeckManagement] Loaded decks:', result.decks.length, result);
      
      // Debug: Check the structure of returned decks
      if (result.decks.length > 0) {
        console.log('[useDeckManagement] First deck structure:', {
          uuid: result.decks[0].uuid,
          id: (result.decks[0] as any).id,
          name: result.decks[0].name,
          keys: Object.keys(result.decks[0])
        });
      }
      
      setDecks(result.decks);
      setHasMore(result.has_more);
      setCurrentOffset(result.decks.length);
    } catch (err) {
      console.error('Error loading decks:', err);
      // Don't set error for auth-related issues, just keep the list empty
      if (err instanceof Error && err.message.includes('auth')) {
        setDecks([]);
        setHasMore(false);
        setAuthError(true);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load presentations. Please try again later.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMoreDecks = useCallback(async () => {
    // Prevent duplicate calls
    if (isLoadingMoreRef.current || !hasMore) return;
    
    try {
      isLoadingMoreRef.current = true;
      setIsLoadingMore(true);
      console.log('[useDeckManagement] Loading more decks from offset:', currentOffset);
      const result = await deckSyncService.getAllDecks(20, currentOffset);
      console.log('[useDeckManagement] Loaded more decks:', result.decks.length);
      
      if (result.decks.length > 0) {
        setDecks(prev => [...prev, ...result.decks]);
        setCurrentOffset(prev => prev + result.decks.length);
        setHasMore(result.has_more);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Error loading more decks:', err);
      toast({
        title: "Error loading more presentations",
        description: "Please try again later.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingMore(false);
      isLoadingMoreRef.current = false;
    }
  }, [currentOffset, hasMore, toast]);

  // Function to add a newly created deck to the list
  const addNewDeck = useCallback(async (deckId: string) => {
    try {
      console.log('[useDeckManagement] Adding new deck to list:', deckId);
      // Fetch the specific deck details
      const newDeck = await deckSyncService.getFullDeck(deckId);
      if (newDeck) {
        // Replace placeholder if exists; otherwise add to beginning
        setDecks(prev => {
          const index = prev.findIndex(d => d.uuid === newDeck.uuid);
          if (index !== -1) {
            const copy = [...prev];
            copy[index] = newDeck;
            return copy;
          }
          return [newDeck, ...prev];
        });
      }
    } catch (err) {
      console.error('Error adding new deck to list:', err);
    }
  }, []);

  useEffect(() => {
    // Wait for auth to be loaded before trying to load decks
    if (!isAuthLoading) {
      if (isAuthenticated) {
        // Add a small delay to ensure auth token is properly set
        const timer = setTimeout(() => {
          loadDecks();
        }, 100);
        return () => clearTimeout(timer);
      } else {
        // If not authenticated, clear decks and set loading to false
        setDecks([]);
        setIsLoading(false);
        setHasMore(false);
      }
    }
  }, [loadDecks, isAuthLoading, isAuthenticated]);

  // Listen for deck creation events to update the list in real-time
  useEffect(() => {
    const handleDeckCreated = (event: CustomEvent) => {
      const { deckId, isGenerating, progress = 0, totalSlides = 0, isImporting = false, name } = event.detail;
      if (deckId) {
        // For generating decks, add a placeholder immediately
        if (isGenerating) {
          setDecks(prev => {
            // Check if deck already exists to avoid duplicates
            const exists = prev.some(d => d.uuid === deckId);
            if (exists) return prev;
            
            // Create a placeholder deck with generation status
            const placeholderDeck: CompleteDeckData = {
              uuid: deckId,
              name: name || (isImporting ? 'Importing presentation…' : 'Generating presentation...'),
              description: "",
              slides: [],
              data: {
                generationProgress: progress,
                totalSlides: totalSlides,
                isGenerating: true,
                isImporting: isImporting
              },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              lastModified: new Date().toISOString(),
              version: 1,
              size: { width: 1920, height: 1080 }
            };
            
            return [placeholderDeck, ...prev];
          });
        } else {
          // Replace placeholder and clear loading state quickly
          setDecks(prev => prev.map(d => d.uuid === deckId ? { ...d, data: { ...(d.data || {}), isGenerating: false, isImporting: false } } as any : d));
          // Fetch the complete deck
          addNewDeck(deckId);
        }
      }
    };
    
    const handleDeckProgress = (event: CustomEvent) => {
      const { deckId, currentSlide, totalSlides, progress } = event.detail;
      if (deckId) {
        setDecks(prev => prev.map(deck => {
          if (deck.uuid === deckId) {
            const isImporting = deck.data?.isImporting;
            if (isImporting) {
              return {
                ...deck,
                data: {
                  ...deck.data,
                  generationProgress: progress,
                  currentSlide: currentSlide,
                  totalSlides: totalSlides,
                  isGenerating: progress < 100,
                  isImporting: true
                }
              } as any;
            } else {
              const validNumbers = Number.isFinite(Number(currentSlide)) && Number.isFinite(Number(totalSlides)) && currentSlide > 0 && totalSlides > 0;
              return {
                ...deck,
                ...(validNumbers ? { name: `Generating slide ${currentSlide} of ${totalSlides}...` } : {}),
                data: {
                  ...deck.data,
                  generationProgress: progress,
                  currentSlide: currentSlide,
                  totalSlides: totalSlides,
                  isGenerating: progress < 100
                }
              };
            }
          }
          return deck;
        }));
        
        // If progress is 100%, fetch the complete deck
        if (progress >= 100) {
          setTimeout(() => addNewDeck(deckId), 1000); // Delay to ensure deck is saved
        }
      }
    };

    window.addEventListener('deck_created', handleDeckCreated as EventListener);
    window.addEventListener('deck_progress', handleDeckProgress as EventListener);
    const handleDeckError = (event: CustomEvent) => {
      const { deckId, message } = event.detail || {};
      if (!deckId) return;
      setDecks(prev => prev.map(deck => {
        if (deck.uuid === deckId) {
          return {
            ...deck,
            name: 'Import failed',
            data: {
              ...deck.data,
              isGenerating: false,
              isImporting: false,
              error: message || 'Import failed'
            }
          } as any;
        }
        return deck;
      }));
    };
    window.addEventListener('deck_error', handleDeckError as EventListener);
    return () => {
      window.removeEventListener('deck_created', handleDeckCreated as EventListener);
      window.removeEventListener('deck_progress', handleDeckProgress as EventListener);
      window.removeEventListener('deck_error', handleDeckError as EventListener);
    };
  }, [addNewDeck]);

  const handleCreateDeck = async () => {
    // Guard against duplicate creation
    if (isCreatingRef.current) {
      console.log('[useDeckManagement] Deck creation already in progress, ignoring duplicate call');
      return;
    }
    
    isCreatingRef.current = true;
    
    try {
      const newDeck = await storeCreateDefaultDeck();
      toast({
        title: "Deck created",
        description: "Your new presentation has been created successfully.",
      });
      navigate(`/deck/${newDeck.uuid}`);
    } catch (err) {
      console.error('Error creating deck:', err);
      toast({
        title: "Error creating presentation",
        description: "There was an error creating your presentation. Please try again.",
        variant: "destructive",
      });
      setError(err instanceof Error ? err.message : 'Unknown error during creation');
    } finally {
      // Reset the guard after a delay to allow for subsequent creation
      setTimeout(() => {
        isCreatingRef.current = false;
      }, 1000);
    }
  };

  const handleEditDeck = async (deck: CompleteDeckData) => {
    // Guard against multiple rapid calls
    if (isEditingRef.current) {
      console.log('[useDeckManagement] Edit already in progress, ignoring duplicate call');
      return;
    }
    
    isEditingRef.current = true;
    
    try {
      // Clean up realtime subscription but don't reset store
      storeCleanupRealtimeSubscription();
      
      console.log('[useDeckManagement] handleEditDeck called with deck:', { 
        uuid: deck?.uuid, 
        id: (deck as any)?.id,
        name: deck?.name,
        fullDeck: deck 
      });
      
      if (!deck || !deck.uuid) {
        console.error('[useDeckManagement] Invalid deck data for editing - missing uuid');
        toast({
          title: "Error loading deck",
          description: "The selected deck data is invalid.",
          variant: "destructive"
        });
        return;
      }

      
      console.log(`[useDeckManagement] Loading full deck data for ${deck.uuid}`);
      const latestDeck = await deckSyncService.getFullDeck(deck.uuid);
      if (!latestDeck) throw new Error(`Failed to load deck ${deck.uuid}`);
      if (!Array.isArray(latestDeck.slides) || latestDeck.slides.length === 0) {
        console.warn(`[useDeckManagement] Deck ${deck.uuid} has no slides, might be corrupted`);
        toast({
          title: "Warning",
          description: "This presentation might be corrupted (no slides found).",
          variant: "destructive"
        });
      }
      storeUpdateDeckData(latestDeck);
      sessionStorage.setItem('lastEditedDeckId', latestDeck.uuid);
      sessionStorage.setItem('lastEditedDeckTimestamp', new Date().toISOString());
      setTimeout(() => navigate(`/deck/${latestDeck.uuid}`), 100);
    } catch (err) {
      console.error(`[useDeckManagement] Error loading deck: ${err}`);
      toast({
        title: "Error loading presentation",
        description: "Failed to load the latest version. Please try again.",
        variant: "destructive",
        duration: 5000
      });
      setError(err instanceof Error ? err.message : 'Unknown error during edit prep');
    } finally {
      // Reset the guard after a delay to allow navigation to complete
      setTimeout(() => {
        isEditingRef.current = false;
      }, 500);
    }
  };
  
  const handleShowDeleteDialog = (deckId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setDeckToDelete(deckId);
  };

  const handleConfirmDelete = async () => {
    if (!deckToDelete) return;
    setIsDeleting(true);
    try {
      const success = await storeDeleteDeck(deckToDelete);
      if (success) {
        setDecks(prevDecks => prevDecks.filter(d => d.uuid !== deckToDelete)); // Ensure correct variable name
        toast({
          title: "Presentation deleted",
          description: "Your presentation has been deleted successfully."
        });
      } else {
        toast({
          title: "Error deleting presentation",
          description: "There was an error deleting your presentation. Please try again.",
          variant: "destructive"
        });
        setError('Failed to delete presentation from store');
      }
    } catch (err) {
      console.error('Error deleting deck:', err);
      toast({
        title: "Error deleting presentation",
        description: "There was an error deleting your presentation. Please try again.",
        variant: "destructive"
      });
      setError(err instanceof Error ? err.message : 'Unknown error during deletion');
    } finally {
      setIsDeleting(false);
      setDeckToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setDeckToDelete(null);
  };

  return {
    decks,
    isLoading,
    isLoadingMore,
    error,
    authError,
    deckToDelete,
    isDeleting,
    hasMore,
    loadDecks,
    loadMoreDecks,
    handleCreateDeck,
    handleEditDeck,
    handleShowDeleteDialog,
    handleConfirmDelete,
    handleCancelDelete,
    setDecks 
  };
}; 