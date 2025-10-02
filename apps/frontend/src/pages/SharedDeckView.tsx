import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { shareService } from '@/services/shareService';
import { mockShareService } from '@/services/mockShareService';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Lock, AlertCircle, Edit, Presentation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDeckStore } from '@/stores/deckStore';
import PresentationMode from '@/components/deck/PresentationMode';
import { usePresentationStore } from '@/stores/presentationStore';
import Slide from '@/components/Slide';
import { SlideData } from '@/types/SlideTypes';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import Watermark from '@/components/common/Watermark';
import { NavigationProvider } from '@/context/NavigationContext';
import { EditorStateProvider } from '@/context/EditorStateContext';
import { ActiveSlideProvider } from '@/context/ActiveSlideContext';

const SharedDeckView: React.FC = () => {
  const { shareCode } = useParams<{ shareCode: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [deck, setDeck] = useState<any>(null);
  const [canEdit, setCanEdit] = useState(false);
  
  const enterPresentation = usePresentationStore(state => state.enterPresentation);

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
        console.log('[SharedDeckView] Backend failed, using mock service');
        response = await mockShareService.getPublicDeck(shareCode);
      }
      
      if (response.success && response.data) {
        const { deck: deckData, is_editable, share_info } = response.data;
        
        // Check if the deck requires a password
        if (response.error === 'Password required') {
          setRequiresPassword(true);
          setIsLoading(false);
          return;
        }
        
        // Store whether user can edit (in case they want to switch to edit mode)
        setCanEdit(is_editable);
        
        // Set the deck data
        setDeck(deckData);
        
        // Enter presentation mode automatically
        enterPresentation();
        
        // Track access
        toast({
          title: "Deck loaded",
          description: share_info?.share_type === 'view' 
            ? "You are viewing this deck in presentation mode" 
            : "You can view and edit this deck",
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
      console.error('[SharedDeckView] Error loading deck:', err);
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

  const handleSwitchToEdit = () => {
    if (canEdit) {
      navigate(`/e/${shareCode}`);
    } else {
      toast({
        title: "View-only access",
        description: "You don't have permission to edit this deck",
        variant: "destructive"
      });
    }
  };

  // Function to render slides for presentation mode
  const renderSlide = (slide: SlideData, index: number, scale: number = 1) => {
    // Compute a defensive fallback background similar to editor presentation
    const fallbackBackground = (() => {
      const normalizeHex = (hex: string) => {
        const h = hex.trim();
        if (/^#([0-9a-fA-F]{8})$/.test(h)) {
          const m = h.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
          if (m) {
            const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16), a = parseInt(m[4], 16) / 255;
            return `rgba(${r}, ${g}, ${b}, ${a})`;
          }
        }
        if (/^#([0-9a-fA-F]{4})$/.test(h)) {
          const m = h.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
          if (m) {
            const r = parseInt(m[1] + m[1], 16), g = parseInt(m[2] + m[2], 16), b = parseInt(m[3] + m[3], 16), a = parseInt(m[4] + m[4], 16) / 255;
            return `rgba(${r}, ${g}, ${b}, ${a})`;
          }
        }
        return hex;
      };
      try {
        const components = Array.isArray(slide.components) ? slide.components : [];
        const bg = components.find(c => c && (c.type === 'Background' || (c.id && c.id.toLowerCase().includes('background'))));
        const props: any = bg?.props || {};
        if (typeof props.background === 'string' && props.background.trim()) {
          return props.background as string;
        }
        const gradient = props.gradient || props.style?.background || (props.background && props.background.color ? props.background : null);
        if (typeof gradient === 'string' && gradient) return gradient;
        if (gradient && typeof gradient === 'object' && (Array.isArray((gradient as any).stops) || Array.isArray((gradient as any).colors))) {
          const rawStops = Array.isArray((gradient as any).stops) ? (gradient as any).stops : (gradient as any).colors;
          const stops = rawStops
            .filter((s: any) => s && s.color)
            .map((s: any) => {
              const pos = typeof s.position === 'number' ? (s.position <= 1 ? s.position * 100 : s.position) : undefined;
              const color = typeof s.color === 'string' ? normalizeHex(s.color) : s.color;
              return `${color}${typeof pos === 'number' ? ` ${pos}%` : ''}`;
            })
            .join(', ');
          if (stops) {
            if (gradient.type === 'radial') {
              return `radial-gradient(circle, ${stops})`;
            }
            const angle = typeof gradient.angle === 'number' ? gradient.angle : 180;
            return `linear-gradient(${angle}deg, ${stops})`;
          }
        }
        const directColor = props.backgroundColor || props.color || props.page?.backgroundColor || (slide as any).backgroundColor;
        if (typeof directColor === 'string' && directColor) return normalizeHex(directColor as string);
        const slideBgImg = (slide as any).backgroundImage;
        if (typeof slideBgImg === 'string' && slideBgImg) return `url(${slideBgImg})`;
      } catch {}
      return undefined as string | undefined;
    })();

    return (
      <div className="w-full h-full relative overflow-hidden" style={fallbackBackground ? { background: fallbackBackground, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        <div 
          className="absolute origin-top-left"
          style={{
            width: `${DEFAULT_SLIDE_WIDTH}px`,
            height: `${DEFAULT_SLIDE_HEIGHT}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            ...(fallbackBackground ? { background: fallbackBackground, backgroundSize: 'cover', backgroundPosition: 'center' } : {})
          }}
        >
          <NavigationProvider initialSlideIndex={index} onSlideChange={() => {}}>
            <EditorStateProvider initialEditingState={false}>
              <ActiveSlideProvider>
                <Slide
                  key={slide.id}
                  slide={slide}
                  isActive={true}
                  direction={null}
                  isEditing={false}
                  onSave={() => {}}
                  selectedComponentId={undefined}
                  onComponentSelect={() => {}}
                />
              </ActiveSlideProvider>
            </EditorStateProvider>
          </NavigationProvider>
          {/* Add watermark for view-only decks */}
          {!canEdit && (
            <Watermark 
              text="VIEW ONLY"
              opacity={0.08}
              fontSize={80}
              rotation={-30}
              repeat={true}
            />
          )}
        </div>
      </div>
    );
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

  if (!deck) {
    return null;
  }

  // Render the presentation view
  return (
    <div className="h-screen w-screen overflow-hidden relative">
      {/* Presentation Mode */}
      <PresentationMode
        slides={deck.slides.filter(s => s && s.id && !s.id.startsWith('placeholder-'))}
        currentSlideIndex={0}
        renderSlide={renderSlide}
        isViewOnly={!canEdit}
      />
      
      {/* Optional edit button if user has permissions */}
      {canEdit && (
        <div className="absolute top-4 right-4 z-50">
          <Button
            onClick={handleSwitchToEdit}
            size="sm"
            variant="secondary"
            className="shadow-lg"
          >
            <Edit size={14} className="mr-2" />
            Edit Deck
          </Button>
        </div>
      )}
    </div>
  );
};

export default SharedDeckView; 