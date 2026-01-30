import React, { useState, useEffect, lazy, Component, ErrorInfo, ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { ThemeProvider } from "./context/ThemeContext";
import { SupabaseAuthProvider } from "./context/SupabaseAuthContext";
import { useAuth } from "./context/SupabaseAuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import "./styles/theme.css";
import "./styles/ComponentBounds.css";
import FontPreloader from "./components/FontPreloader";
import DeckList from "./pages/DeckList";
import NotFound from "./pages/NotFound";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ResetPassword from "./pages/ResetPassword";
import Profile from "./pages/Profile";
import TeamInvite from "./pages/TeamInvite";
import EmailVerification from "./pages/EmailVerification";
import AuthCallback from "./pages/AuthCallback";
// AgentOutlineView removed - using existing outline page
import { ComponentStateProvider } from './context/CustomComponentStateContext';
import SlideEditor from './components/SlideEditor';
import { RegistryProvider, useRegistry } from './context/RegistryContext';
import { CompleteDeckData } from './types/DeckTypes';
import TestCollaboration from './yjs/TestCollaboration';
import SlideTagging from './pages/SlideTagging';
import SharedDeckView from './pages/SharedDeckView';
import SharedDeckEdit from './pages/SharedDeckEdit';
import CommunityDeckView from './pages/CommunityDeckView';
import { API_CONFIG } from './config/environment';
import { DeckStoreInitializer } from './components/DeckStoreInitializer';
// Removed font optimization hook
import { useEnsureUserRecord } from './hooks/useEnsureUserRecord';
const DevPerformanceHUD = import.meta.env.PROD ? null : React.lazy(() => import('./components/dev/PerformanceHUD'));

// Admin imports
import AdminUsers from './pages/admin/AdminUsers';
import AdminUserDetail from './pages/admin/AdminUserDetail';
import AdminDecks from './pages/admin/AdminDecks';
import AdminCommunity from './pages/admin/AdminCommunity';
import AdminBrands from './pages/admin/AdminBrands';
import AdminServices from './pages/admin/AdminServices';
import AdminCosts from './pages/admin/AdminCosts';
import AdminAnalytics from './pages/admin/AdminAnalytics';
import AdminAgent from './pages/admin/AdminAgent';
import AdminIntegrations from './pages/admin/AdminIntegrations';
import AdminLeads from './pages/admin/AdminLeads';
import AdminProtectedRoute from './components/AdminProtectedRoute';
import TemporaryPasswordGate from './components/TemporaryPasswordGate';
import SmartGallery from './pages/SmartGallery';
import Pricing from './pages/Pricing';
import DeveloperAPI from './pages/DeveloperAPI';
import Help from './pages/Help';
import { CreditsProvider } from './context/CreditsContext';
import { OnboardingProvider } from './context/OnboardingContext';
import UpgradePrompt from './components/billing/UpgradePrompt';
import { RewardProvider } from './context/RewardContext';

// Component to initialize font optimization
// Removed FontOptimizationInitializer

// Component to ensure user record exists
function UserRecordInitializer() {
  useEnsureUserRecord();
  return null;
}


// Extend window interface for debug commands
declare global {
  interface Window {
    showFontPerformance?: () => void;
  }
}

// Initialize TypeBox registry
import './registry';
import { useDeckStore } from './stores/deckStore';

// Global Error Boundary to catch and display mobile crashes
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class GlobalErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // Log to console for debugging
    console.error('[GlobalErrorBoundary] Caught error:', error);
    console.error('[GlobalErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const isMobile = typeof window !== 'undefined' &&
        (window.innerWidth <= 768 || 'ontouchstart' in window);

      return (
        <div style={{
          padding: '20px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          maxWidth: '100vw',
          overflowX: 'hidden',
        }}>
          <h1 style={{ color: '#dc2626', fontSize: '24px', marginBottom: '16px' }}>
            Something went wrong
          </h1>
          <p style={{ marginBottom: '16px', color: '#666' }}>
            {isMobile ? 'Mobile' : 'Desktop'} error detected. Please try refreshing the page.
          </p>
          <details style={{ marginBottom: '16px' }}>
            <summary style={{ cursor: 'pointer', color: '#2563eb' }}>Error details</summary>
            <pre style={{
              background: '#f3f4f6',
              padding: '12px',
              borderRadius: '8px',
              overflow: 'auto',
              fontSize: '12px',
              marginTop: '8px',
            }}>
              {this.state.error?.message}
              {'\n\n'}
              {this.state.error?.stack}
            </pre>
          </details>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#2563eb',
              color: 'white',
              padding: '12px 24px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Lazy load the Renderer component only when needed
const LazyRenderer = lazy(() => import('./pages/Renderer'));

// Create a new client with default options
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

// Default sync config
const syncConfig = {
  enabled: true,
  autoSyncInterval: 30000,
  useRealtimeSubscription: true
};

// Scroll to top on route change
const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

// Component to monitor deck changes
const DeckMonitor = ({ onChange }: { onChange: (data: CompleteDeckData) => void }) => {
  const deckData = useDeckStore(state => state.deckData);

  // Use effect to call onChange when deckData changes
  useEffect(() => {
    onChange(deckData);
  }, [deckData, onChange]);

  return null;
};

// Silent component to monitor server and registry status
const ServerMonitor = () => {
  const { serverConnected, serverHasRegistry } = useRegistry();
  const [prevConnected, setPrevConnected] = useState<boolean | null>(null);
  const [prevHasRegistry, setPrevHasRegistry] = useState<boolean | null>(null);

  // Log server connection and registry status changes
  useEffect(() => {
    const timestamp = new Date().toISOString();
    const currentStatus = {
      connected: serverConnected ? 'YES' : 'NO',
      registryLoaded: serverHasRegistry ? 'YES' : 'NO',
      timestamp
    };

    // Always show status in dev tools using a styled console log
    // console.log(
    //   `%c🔌 Server: ${currentStatus.connected} | 📚 Registry: ${currentStatus.registryLoaded} | ⏱️ ${timestamp.split('T')[1].split('.')[0]}`,
    //   `color: ${serverConnected ? 'green' : 'red'}; font-weight: bold; background-color: ${serverHasRegistry ? '#e6ffe6' : '#fff0f0'}; padding: 2px 5px; border-radius: 3px;`
    // );

    // Alert about changes
    if (prevConnected !== null && prevConnected !== serverConnected) {
      // console.log(
      //   `%cServer connection ${serverConnected ? 'ESTABLISHED' : 'LOST'}`,
      //   'color: white; background-color: ' + (serverConnected ? 'green' : 'red') + '; padding: 3px 8px; font-weight: bold; border-radius: 3px;'
      // );
    }

    if (prevHasRegistry !== null && prevHasRegistry !== serverHasRegistry) {
      // console.log(
      //   `%cRegistry ${serverHasRegistry ? 'LOADED' : 'MISSING'} on server`,
      //   'color: white; background-color: ' + (serverHasRegistry ? 'blue' : 'orange') + '; padding: 3px 8px; font-weight: bold; border-radius: 3px;'
      // );
    }

    // Update previous state
    setPrevConnected(serverConnected);
    setPrevHasRegistry(serverHasRegistry);
  }, [serverConnected, serverHasRegistry, prevConnected, prevHasRegistry]);

  return null;
};

// Wrapper component to handle conditional collaboration
const AppContent = () => {
  const location = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const { session } = useAuth();

  // Collaboration disabled at App level - controlled per-component in SlideEditor
  // This prevents unnecessary WebSocket connections for solo users
  const isCollaborationEnabled = false;

  // Initialize debug tools in development mode
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      // Add font performance command to debug console
      window.showFontPerformance = () => {
        import('./utils/performanceMonitor').then(monitor => {
          monitor.logFontMetrics(50); // Show fonts that took over 50ms to load
        });
      };

      // Expose store for debugging
      (window as any).useDeckStore = useDeckStore;
      // console.log('🔧 Debug: useDeckStore exposed to window object');
    }
  }, []);

  // This handler is now for logging purposes only
  const handleDeckDataChange = (deckData: CompleteDeckData) => {
    // console.log(`Deck data updated, now contains ${deckData.slides.length} slides`);
  };

  const handleSyncUpdate = (isSyncing: boolean, lastSyncTime: Date | null) => {
    // console.log(`Sync state: ${isSyncing ? 'Syncing' : 'Idle'}, last sync: ${lastSyncTime?.toLocaleTimeString() || 'never'}`);
  };

  const handleEditingChange = (editing: boolean) => {
    setIsEditing(editing);
    // console.log(`Edit mode changed to ${editing}`);
  };

  // Removed extra admin check here to avoid duplicates

  return (
    <RegistryProvider>
      <ScrollToTop />
      <ServerMonitor />
      <ComponentStateProvider>
        {/* Font optimization removed */}
        {/* Preload only system fonts */}
        <FontPreloader />
        {/* Initialize the deck store early in the component tree */}
        <DeckStoreInitializer
          syncEnabled={syncConfig.enabled}
          useRealtimeSubscription={syncConfig.useRealtimeSubscription}
          autoSyncInterval={syncConfig.autoSyncInterval}
          onSyncUpdate={handleSyncUpdate}
          collaborationEnabled={isCollaborationEnabled}
          collaborationUrl={import.meta.env.VITE_WEBSOCKET_URL || API_CONFIG.WEBSOCKET_URL}
        />
        {/* Our custom theme provider */}
        <ThemeProvider>
          {/* Monitor for deck data changes */}
          <DeckMonitor onChange={handleDeckDataChange} />
          <TemporaryPasswordGate enabled={false} password={import.meta.env.VITE_TEMP_GATE_PASSWORD || 'NextBeta'}>
            <Routes>
              {/* Legacy alias: redirect settings/integrations to admin integrations page */}
              <Route path="/settings/integrations" element={<RouteRedirect to="/admin/integrations" />} />
              {/* Redirect old /integrations to admin */}
              <Route path="/integrations" element={<RouteRedirect to="/admin/integrations" />} />
              <Route path="/" element={<Landing />} />
              <Route
                path="/app"
                element={
                  <ProtectedRoute>
                    <DeckList />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/login"
                element={
                  <ProtectedRoute requireAuth={false}>
                    <Login />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/signup"
                element={
                  <ProtectedRoute requireAuth={false}>
                    <Signup />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/deck/:deckId"
                element={
                  <ProtectedRoute>
                    <SlideEditor />
                  </ProtectedRoute>
                }
              />
              {/* Outline View route - removed, using embedded outline in DeckList */}
              {/* Google Slides JSON Test route */}
              <Route
                path="/slide-tagging"
                element={
                  <ProtectedRoute>
                    <SlideTagging />
                  </ProtectedRoute>
                }
              />
              {/* Yjs collaboration test route */}
              <Route
                path="/collaboration-test"
                element={
                  <ProtectedRoute>
                    <React.Suspense fallback={<div>Loading collaboration test...</div>}>
                      <TestCollaboration />
                    </React.Suspense>
                  </ProtectedRoute>
                }
              />
              {/* Add renderer route, only available when RENDERER env var is set */}
              {import.meta.env.VITE_RENDERER === 'true' && (
                <Route
                  path="/renderer"
                  element={
                    <React.Suspense fallback={<div>Loading renderer...</div>}>
                      <LazyRenderer />
                    </React.Suspense>
                  }
                />
              )}
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/team"
                element={<Navigate to="/profile?tab=team" replace />}
              />
              {/* Team invitation acceptance */}
              <Route
                path="/team/invite/:token"
                element={<TeamInvite />}
              />
              {/* Shared deck routes */}
              <Route
                path="/p/:shareCode"
                element={<SharedDeckView />}
              />
              <Route
                path="/e/:shareCode"
                element={<SharedDeckEdit />}
              />
              {/* Community deck view route */}
              <Route
                path="/community/:deckId"
                element={<CommunityDeckView />}
              />
              {/* Email verification route */}
              <Route
                path="/verify-email/:token"
                element={<EmailVerification />}
              />
              <Route
                path="/verify-email/pending"
                element={<EmailVerification />}
              />
              {/* Auth Callback route */}
              <Route
                path="/auth-callback"
                element={<AuthCallback />}
              />
              {/* Reset Password route */}
              <Route
                path="/reset-password"
                element={
                  <ProtectedRoute>
                    <ResetPassword />
                  </ProtectedRoute>
                }
              />
              {/* Admin routes - Agent is now the main dashboard */}
              <Route
                path="/admin"
                element={
                  <AdminProtectedRoute>
                    <AdminAgent />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/overview"
                element={
                  <AdminProtectedRoute>
                    <AdminAnalytics />
                  </AdminProtectedRoute>
                }
              />
              {/* Redirect old analytics path to overview */}
              <Route
                path="/admin/analytics"
                element={<Navigate to="/admin/overview" replace />}
              />
              <Route
                path="/admin/users"
                element={
                  <AdminProtectedRoute>
                    <AdminUsers />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/users/:userId"
                element={
                  <AdminProtectedRoute>
                    <AdminUserDetail />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/decks"
                element={
                  <AdminProtectedRoute>
                    <AdminDecks />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/community"
                element={
                  <AdminProtectedRoute>
                    <AdminCommunity />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/integrations"
                element={
                  <AdminProtectedRoute>
                    <AdminIntegrations />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/brands"
                element={
                  <AdminProtectedRoute>
                    <AdminBrands />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/services"
                element={
                  <AdminProtectedRoute>
                    <AdminServices />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/costs"
                element={
                  <AdminProtectedRoute>
                    <AdminCosts />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/leads"
                element={
                  <AdminProtectedRoute>
                    <AdminLeads />
                  </AdminProtectedRoute>
                }
              />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/smart-gallery" element={<SmartGallery />} />
              <Route path="/developers" element={<DeveloperAPI />} />
              <Route path="/help" element={<Help />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </TemporaryPasswordGate>
        </ThemeProvider>
      </ComponentStateProvider>
    </RegistryProvider>
  );
};

function App() {
  const [isReady, setIsReady] = useState(false);

  // Clear stale deck IDs from session storage on app load
  useEffect(() => {
    try {
      // Check if sessionStorage is available (may not be in private browsing)
      if (typeof sessionStorage === 'undefined') return;

      // Clear any stale deck IDs that might cause loading errors
      const staleDeckId = sessionStorage.getItem('lastEditedDeckId');
      if (staleDeckId) {
        // Check if it's been more than 24 hours since last edit
        const lastEditTimestamp = sessionStorage.getItem('lastEditedDeckTimestamp');
        if (lastEditTimestamp) {
          const timeSinceEdit = Date.now() - new Date(lastEditTimestamp).getTime();
          const twentyFourHours = 24 * 60 * 60 * 1000;
          if (timeSinceEdit > twentyFourHours) {
            console.log('Clearing stale deck ID from session storage:', staleDeckId);
            sessionStorage.removeItem('lastEditedDeckId');
            sessionStorage.removeItem('lastEditedDeckTimestamp');
            sessionStorage.removeItem('pendingDeckId');
            sessionStorage.removeItem('pendingDeckUrl');
          }
        }
      }
    } catch (e) {
      // sessionStorage not available (private browsing on some mobile browsers)
      console.warn('[App] sessionStorage not accessible:', e);
    }
  }, []);

  // Optimize initial render by loading critical resources
  useEffect(() => {
    // This effect is now empty as the initialization is moved to AppContent
  }, []);

  return (
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <NextThemesProvider attribute="class" defaultTheme="light" enableSystem>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <SupabaseAuthProvider>
                <CreditsProvider>
                  <OnboardingProvider>
                    <RewardProvider>
                      <UserRecordInitializer />
                      <AppContent />
                      <UpgradePrompt />
                      {DevPerformanceHUD ? (
                        <React.Suspense fallback={null}>
                          <DevPerformanceHUD />
                        </React.Suspense>
                      ) : null}
                    </RewardProvider>
                  </OnboardingProvider>
                </CreditsProvider>
              </SupabaseAuthProvider>
            </BrowserRouter>
          </TooltipProvider>
        </NextThemesProvider>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  );
};

export default App;

// Simple redirect element for route aliases
function RouteRedirect({ to }: { to: string }) {
  const location = useLocation();
  useEffect(() => {
    window.history.replaceState({}, "", to);
  }, [to, location]);
  return null;
}
