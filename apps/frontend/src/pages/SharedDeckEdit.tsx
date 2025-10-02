import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { shareService } from '@/services/shareService';
import { mockShareService } from '@/services/mockShareService';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Lock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDeckStore } from '@/stores/deckStore';

const SharedDeckEdit: React.FC = () => {
  const { shareCode } = useParams<{ shareCode: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  
  // Get deck store methods
  const updateDeckData = useDeckStore(state => state.updateDeckData);
  const initialize = useDeckStore(state => state.initialize);

  useEffect(() => {
    if (shareCode) {
      loadSharedDeck();
    }
  }, [shareCode]);

  const loadSharedDeck = async (withPassword?: string) => {
    if (!shareCode) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Try to load the deck using the share code
      let response = await shareService.getPublicDeck(shareCode);
      
      // Fallback to mock service if backend fails
      if (!response.success && response.error?.includes('401')) {
        console.log('[SharedDeckEdit] Backend failed, using mock service');
        response = await mockShareService.getPublicDeck(shareCode);
      }
      
      if (response.success && response.data) {
        const { deck: deckData, is_editable } = response.data;
        
        // Check if the deck requires a password
        if (response.error === 'Password required') {
          setRequiresPassword(true);
          setIsLoading(false);
          return;
        }
        
        // Check if user has edit permissions
        if (!is_editable) {
          setError('You only have view permissions for this deck. Redirecting to view mode...');
          setTimeout(() => {
            navigate(`/p/${shareCode}`);
          }, 2000);
          return;
        }
        
        // Load the deck into the store
        updateDeckData(deckData, { skipBackend: true });
        
        // Initialize the store with the deck
        if (deckData.uuid) {
          initialize({ 
            deckId: deckData.uuid,
            syncEnabled: true,
            collaborationEnabled: true
          });
        }
        
        // Navigate to the editor with the deck loaded
        navigate(`/deck/${deckData.uuid || deckData.id}`, {
          state: { 
            sharedAccess: true,
            shareCode: shareCode
          }
        });
        
        // Track access
        toast({
          title: "Deck loaded",
          description: "You can now edit this shared deck",
        });
      } else {
        setError(response.error || 'Failed to load shared deck');
        
        // Handle specific error cases
        if (response.error?.includes('expired')) {
          setError('This share link has expired');
        } else if (response.error?.includes('not found')) {
          setError('This share link is invalid or has been revoked');
        } else if (response.error?.includes('limit reached')) {
          setError('This share link has reached its usage limit');
        }
      }
    } catch (err) {
      console.error('[SharedDeckEdit] Error loading deck:', err);
      setError('Failed to load the shared deck. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    
    setIsVerifying(true);
    try {
      // TODO: Call password verification endpoint
      // For now, we'll reload with the password
      await loadSharedDeck(password);
      
      if (!requiresPassword) {
        // Password was correct
      } else {
        toast({
          title: "Invalid password",
          description: "Please check the password and try again",
          variant: "destructive"
        });
      }
    } finally {
      setIsVerifying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 size={48} className="animate-spin mx-auto mb-4 text-primary" />
          <p className="text-lg text-muted-foreground">Loading shared deck...</p>
        </div>
      </div>
    );
  }

  if (requiresPassword) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock size={24} className="text-primary" />
            </div>
            <CardTitle>Password Required</CardTitle>
            <CardDescription>
              This deck is password protected. Please enter the password to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <Input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                disabled={isVerifying}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/')}
                  disabled={isVerifying}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isVerifying || !password.trim()}
                  className="flex-1"
                >
                  {isVerifying ? (
                    <>
                      <Loader2 size={14} className="mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Submit'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={24} className="text-destructive" />
            </div>
            <CardTitle>Unable to Load Deck</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-6">{error}</p>
            <Button onClick={() => navigate('/')} variant="outline">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Should not reach here as we navigate away after loading
  return null;
};

export default SharedDeckEdit; 