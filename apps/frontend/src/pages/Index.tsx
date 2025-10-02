import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import SlideEditor from '@/components/SlideEditor';
import { AlertCircle, Database } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { deckSyncService } from '@/lib/deckSyncService';
import { useDeckStore } from '@/stores/deckStore';
import LoadingDisplay from '@/components/common/LoadingDisplay';

/**
 * Editor page for a specific deck
 */
const Index: React.FC = () => {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
  const [loadingTime, setLoadingTime] = useState(0);
  
  // Check if this is a newly generated deck
  const isNewDeck = searchParams.get('new') === 'true';
  
  // Get the updateDeckData function from the store
  const updateDeckData = useDeckStore(state => state.updateDeckData);
  const deckData = useDeckStore(state => state.deckData);

  useEffect(() => {
    const startTime = Date.now();
    const loadingTimer = setInterval(() => {
      setLoadingTime(Date.now() - startTime);
    }, 1000);

    try {
    
      
      // Check backend connection
      const checkSupabaseConnection = async () => {
        try {
    
          // Use a simple health check endpoint instead of querying Supabase directly
          const response = await fetch('/api/health');
          
          if (!response.ok) {
            setSupabaseStatus('unavailable');
          } else {
            setSupabaseStatus('available');
            
            // If we have a deckId, load that specific deck
            if (deckId) {
              try {
                // First check if the deck exists using the new endpoint
                const checkResponse = await fetch('/api/deck-check', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ deck_id: deckId })
                });
                
                const checkData = await checkResponse.json();
                
                if (!checkData.exists) {
                  // For new decks, wait a bit and retry once
                  if (isNewDeck) {

                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Retry the check
                    const retryResponse = await fetch('/api/deck-check', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ deck_id: deckId })
                    });
                    
                    const retryData = await retryResponse.json();
                    if (!retryData.exists) {
                      setError(`Deck with ID ${deckId} not found after retry.`);

                      return;
                    }
                  } else {
                    setError(`Deck with ID ${deckId} not found.`);

                    return;
                  }
                }
                
                // Now load the deck since we know it exists
                // Remove redundant deck loading - initialize will handle it
                // Clear the store first to prevent showing old deck data
                if (isNewDeck || deckId !== useDeckStore.getState().deckData.uuid) {
                  // Don't reset store - just let initialize handle the deck loading
                }
                
                // Initialize the store with the deck ID - this will load the deck
                useDeckStore.getState().initialize({ 
                  deckId: deckId, 
                  syncEnabled: true, 
                  useRealtimeSubscription: true,
                  isNewDeck: isNewDeck  // Pass the new deck flag
                });
                
              } catch (deckError) {
                setError('Failed to load the requested deck. Please try again.');
              }
            } else {
              // No deckId provided, redirect back to deck list
              navigate('/app');
            }
          }
        } catch (err) {
          setSupabaseStatus('unavailable');
        }
      };
      
      // Run checks
      checkSupabaseConnection().finally(() => {
        setIsLoaded(true);
        clearInterval(loadingTimer);
      });
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsLoaded(true);
      clearInterval(loadingTimer);
    }

    return () => {
      clearInterval(loadingTimer);
    };
  }, [deckId, navigate, updateDeckData, isNewDeck]);
  
  // Check deck data silently - store initialization handles loading
  useEffect(() => {
    // No need to log this on every render - store initializer handles it
  }, [deckData]);
  

  
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-bold text-red-500 mb-4">Error Loading Deck</h1>
        <p className="text-gray-700">{error}</p>
        <Button className="mt-4" onClick={() => navigate('/app')}>
          Return to Deck List
        </Button>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen flex flex-col">
      {isLoaded ? (
        <SlideEditor />
      ) : (
        <LoadingDisplay message={isNewDeck ? 'Initializing your presentation...' : 'Loading deck...'} />
      )}
      
      {/* Supabase Status Indicator */}
      {supabaseStatus === 'checking' && isLoaded && (
        <div className="fixed bottom-4 right-4 bg-blue-100 border border-blue-300 p-3 rounded-md shadow-md">
          <div className="flex items-center">
            <Database size={16} className="text-blue-500 mr-2" />
            <h3 className="font-semibold text-blue-800">Checking Database Connection</h3>
          </div>
          <p className="text-sm text-blue-700">
            Verifying database connection...
          </p>
        </div>
      )}
      
      {supabaseStatus === 'unavailable' && isLoaded && (
        <div className="fixed bottom-4 right-4 w-96 max-w-[90vw]">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Database Connection Error</AlertTitle>
            <AlertDescription>
              Could not connect to the database. Your changes may not be saved.
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
};

export default Index;
