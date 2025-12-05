import React, { useEffect, useState, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { shareService } from '@/services/shareService';
import { mockShareService } from '@/services/mockShareService';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Lock, AlertCircle, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDeckStore } from '@/stores/deckStore';
import PresentationMode from '@/components/deck/PresentationMode';
import { usePresentationStore } from '@/stores/presentationStore';
import { useReturnBannerStore } from '@/stores/returnBannerStore';
import { SlideData } from '@/types/SlideTypes';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import Watermark from '@/components/common/Watermark';
import { NavigationProvider } from '@/context/NavigationContext';
import { ComponentRenderer } from '@/renderers/ComponentRenderer';
import { ActiveSlideProvider } from '@/context/ActiveSlideContext';
import { EditorStateProvider } from '@/context/EditorStateContext';

// Error boundary to catch component rendering errors and prevent page crashes
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class SlideErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[SlideErrorBoundary] Error rendering slide:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="w-full h-full flex items-center justify-center bg-gray-100">
          <div className="text-center p-4">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Unable to display slide</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

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
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  // Email gate state
  const [requiresEmail, setRequiresEmail] = useState(false);
  const [viewerEmail, setViewerEmail] = useState('');
  const [viewerName, setViewerName] = useState('');
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [deckName, setDeckName] = useState('');

  const isPresenting = usePresentationStore(state => state.isPresenting);
  const enterPresentation = usePresentationStore(state => state.enterPresentation);
  const setPendingPresentation = useReturnBannerStore(state => state.setPendingPresentation);

  // Track if we've loaded the deck (to distinguish exit from initial load)
  const hasLoadedDeck = useRef(false);

  // View tracking refs
  const sessionIdRef = useRef<string>(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const viewStartTimeRef = useRef<number>(Date.now());
  const slideTimesRef = useRef<Map<number, number>>(new Map()); // slideIndex -> time spent in ms
  const currentSlideStartRef = useRef<number>(Date.now());
  const lastSlideIndexRef = useRef<number>(0);

  // Track time spent on current slide
  const trackSlideTime = (slideIndex: number) => {
    const now = Date.now();
    const timeSpent = now - currentSlideStartRef.current;

    // Add time to the previous slide
    const prevSlideIndex = lastSlideIndexRef.current;
    const existingTime = slideTimesRef.current.get(prevSlideIndex) || 0;
    slideTimesRef.current.set(prevSlideIndex, existingTime + timeSpent);

    // Reset for new slide
    currentSlideStartRef.current = now;
    lastSlideIndexRef.current = slideIndex;
  };

  // Send tracking data to server
  const sendTrackingData = () => {
    if (!shareCode || !hasLoadedDeck.current) return;

    // Track time on current slide before sending
    trackSlideTime(lastSlideIndexRef.current);

    // Convert map to array
    const slideViews = Array.from(slideTimesRef.current.entries()).map(([slideIndex, timeSpentMs]) => ({
      slideIndex,
      timeSpentMs
    }));

    const durationSeconds = Math.floor((Date.now() - viewStartTimeRef.current) / 1000);

    shareService.updateViewSession(shareCode, sessionIdRef.current, slideViews, durationSeconds);
  };

  // When presentation mode exits (user clicks X or presses Escape), redirect to landing with banner
  useEffect(() => {
    if (hasLoadedDeck.current && !isPresenting && deck && shareCode) {
      // Send final tracking data before leaving
      sendTrackingData();

      // User exited the presentation - redirect to landing with return banner
      setPendingPresentation(shareCode, deck.name || 'your presentation');
      navigate('/');
    }
  }, [isPresenting, deck, shareCode, navigate, setPendingPresentation]);

  // Track slide changes
  useEffect(() => {
    if (hasLoadedDeck.current) {
      trackSlideTime(currentSlideIndex);
    }
  }, [currentSlideIndex]);

  // Periodically send tracking data (every 30 seconds)
  useEffect(() => {
    if (!hasLoadedDeck.current || !shareCode) return;

    const interval = setInterval(() => {
      sendTrackingData();
    }, 30000);

    // Also send on page unload
    const handleBeforeUnload = () => {
      sendTrackingData();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [shareCode]);

  useEffect(() => {
    if (shareCode) {
      checkEmailRequirement();
    }
  }, [shareCode]);

  const checkEmailRequirement = async () => {
    if (!shareCode) return;

    setIsLoading(true);
    try {
      const response = await shareService.checkEmailRequired(shareCode);
      if (response.success && response.data) {
        setDeckName(response.data.deck_name);
        if (response.data.require_email) {
          // Check if we already have a viewer_id in session storage
          let storedViewerId: string | null = null;
          try {
            if (typeof sessionStorage !== 'undefined') {
              storedViewerId = sessionStorage.getItem(`viewer_${shareCode}`);
            }
          } catch (e) {
            // sessionStorage not available
          }
          if (storedViewerId) {
            // Already registered, load the deck
            loadSharedDeck();
          } else {
            // Need to collect email first
            setRequiresEmail(true);
            setIsLoading(false);
          }
        } else {
          // No email required, load directly
          loadSharedDeck();
        }
      } else {
        // Fall back to loading deck directly (old links without metadata)
        loadSharedDeck();
      }
    } catch (err) {
      // Fall back to loading deck directly
      loadSharedDeck();
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewerEmail.trim() || !shareCode) return;

    setIsSubmittingEmail(true);
    try {
      const response = await shareService.registerViewer(shareCode, viewerEmail, viewerName || undefined);
      if (response.success && response.data) {
        // Store viewer_id in session storage so they don't have to re-enter
        try {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(`viewer_${shareCode}`, response.data.viewer_id);
          }
        } catch (e) {
          // sessionStorage not available
        }
        setRequiresEmail(false);
        loadSharedDeck();
      } else {
        toast({
          title: "Error",
          description: response.error || "Failed to register. Please try again.",
          variant: "destructive"
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "An error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmittingEmail(false);
    }
  };

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

        // Set the deck data locally
        setDeck(deckData);

        // Also load into the deckStore so navigation works (without saving to backend)
        const { updateDeckData } = useDeckStore.getState();
        updateDeckData(deckData, { skipBackend: true });

        // Mark that we've loaded the deck (for exit detection)
        hasLoadedDeck.current = true;

        // Start view tracking session
        let viewerId: string | null = null;
        try {
          if (typeof sessionStorage !== 'undefined') {
            viewerId = sessionStorage.getItem(`viewer_${shareCode}`);
          }
        } catch (e) {
          // sessionStorage not available
        }
        const deviceType = /Mobile|Android|iPhone/i.test(navigator.userAgent)
          ? (/iPad|Tablet/i.test(navigator.userAgent) ? 'tablet' : 'mobile')
          : 'desktop';

        shareService.startViewSession(shareCode, sessionIdRef.current, viewerId || undefined, deviceType);
        viewStartTimeRef.current = Date.now();
        currentSlideStartRef.current = Date.now();

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

  // Helper to extract background from slide
  const getSlideBackground = (slide: SlideData): string | undefined => {
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
    return undefined;
  };

  // Memoized renderSlide function to prevent re-creation on each render
  // This is critical for mobile performance and preventing crashes
  const renderSlide = React.useCallback((slide: SlideData, index: number, scale: number = 1, isThumbnail: boolean = false) => {
    const fallbackBackground = getSlideBackground(slide);
    const components = Array.isArray(slide.components) ? slide.components : [];

    // For thumbnails, use a much simpler rendering approach to avoid crashes on mobile
    if (isThumbnail) {
      return (
        <div
          className="w-full h-full relative overflow-hidden"
          style={fallbackBackground ? { background: fallbackBackground, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: '#f0f0f0' }}
        >
          {/* Simple thumbnail - just show background and slide number */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl font-bold text-black/20">{index + 1}</span>
          </div>
        </div>
      );
    }

    return (
      <SlideErrorBoundary
        fallback={
          <div
            className="w-full h-full relative overflow-hidden flex items-center justify-center"
            style={fallbackBackground ? { background: fallbackBackground, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: '#f0f0f0' }}
          >
            <div className="text-center p-4">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-2" />
              <p className="text-gray-600">Unable to display slide</p>
            </div>
          </div>
        }
      >
        <div className="w-full h-full relative overflow-hidden" style={fallbackBackground ? { background: fallbackBackground, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{
              width: `${DEFAULT_SLIDE_WIDTH}px`,
              height: `${DEFAULT_SLIDE_HEIGHT}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              // Use will-change for better GPU compositing on mobile
              willChange: 'transform',
              ...(fallbackBackground ? { background: fallbackBackground, backgroundSize: 'cover', backgroundPosition: 'center' } : {})
            }}
          >
            {/* Render components - providers are at the top level now */}
            {/* isEditing and slideId come from context (EditorStateProvider/ActiveSlideProvider) */}
            {components.map((component) => {
              if (!component || !component.id) return null;
              try {
                return (
                  <ComponentRenderer
                    key={component.id}
                    component={component}
                    isSelected={false}
                    onSelect={() => {}}
                    allComponents={components}
                    isThumbnail={false}
                  />
                );
              } catch (err) {
                console.error(`[SharedDeckView] Error rendering component ${component.id}:`, err);
                return null;
              }
            })}
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
      </SlideErrorBoundary>
    );
  }, [canEdit]);

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

  // Email gate UI
  if (requiresEmail) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4 bg-gradient-to-b from-zinc-900 to-zinc-950">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">
            {/* Orange accent line */}
            <div className="h-1 bg-gradient-to-r from-[#FF6B00] via-[#FF8533] to-[#FF6B00]" />

            <div className="p-6">
              {/* Header */}
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-[#FF6B00]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg viewBox="0 0 64 64" width={24} height={24}>
                    <path d="M8 8 L56 56" stroke="#FF4301" strokeWidth={11} strokeLinecap="round" />
                    <path d="M56 8 L8 56" stroke="#FF4301" strokeWidth={11} strokeLinecap="round" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-zinc-900 mb-1">
                  {deckName || 'Presentation'}
                </h2>
                <p className="text-sm text-zinc-500">
                  Enter your email to view this presentation
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleEmailSubmit} className="space-y-3">
                <div>
                  <Input
                    type="email"
                    placeholder="Your email"
                    value={viewerEmail}
                    onChange={(e) => setViewerEmail(e.target.value)}
                    autoFocus
                    disabled={isSubmittingEmail}
                    className="h-10 text-sm"
                    required
                  />
                </div>
                <div>
                  <Input
                    type="text"
                    placeholder="Your name (optional)"
                    value={viewerName}
                    onChange={(e) => setViewerName(e.target.value)}
                    disabled={isSubmittingEmail}
                    className="h-10 text-sm"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isSubmittingEmail || !viewerEmail.trim()}
                  className="w-full h-10 bg-gradient-to-r from-[#FF6B00] to-[#FF8533] hover:from-[#E65D00] hover:to-[#E67420] text-white font-semibold shadow-lg shadow-orange-500/20"
                >
                  {isSubmittingEmail ? (
                    <>
                      <Loader2 size={14} className="mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    'View Presentation'
                  )}
                </Button>
              </form>

              {/* Privacy note */}
              <p className="text-[10px] text-zinc-400 text-center mt-4">
                Your email will only be shared with the presenter
              </p>
            </div>
          </div>
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
  // CRITICAL: EditorStateProvider and ActiveSlideProvider are at the top level
  // to prevent re-creation on each render which causes mobile crashes
  return (
    <div
      className="w-screen overflow-hidden relative touch-manipulation"
      style={{
        height: '100dvh',
        // Prevent pull-to-refresh and overscroll on mobile
        overscrollBehavior: 'none',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* Presentation Mode */}
      <NavigationProvider
        initialSlideIndex={0}
        onSlideChange={(index) => setCurrentSlideIndex(index)}
      >
        <EditorStateProvider initialEditingState={false}>
          <ActiveSlideProvider>
            <PresentationMode
              slides={deck.slides.filter(s => s && s.id && !s.id.startsWith('placeholder-'))}
              currentSlideIndex={currentSlideIndex}
              renderSlide={renderSlide}
              isViewOnly={!canEdit}
              alwaysShowControls={true}
            />
          </ActiveSlideProvider>
        </EditorStateProvider>

        {/* Optional edit button if user has permissions */}
        {canEdit && (
          <div className="absolute top-4 right-4 z-50">
            <Button
              onClick={handleSwitchToEdit}
              size="sm"
              variant="secondary"
              className="shadow-lg min-w-[44px] min-h-[44px] touch-manipulation"
            >
              <Edit size={14} className="mr-2" />
              Edit Deck
            </Button>
          </div>
        )}
      </NavigationProvider>
    </div>
  );
};

export default SharedDeckView; 