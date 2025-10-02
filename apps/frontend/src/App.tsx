import React, { useState, useEffect, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
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
import Profile from "./pages/Profile";
import TeamSettings from "./pages/TeamSettings";
import EmailVerification from "./pages/EmailVerification";
import AuthCallback from "./pages/AuthCallback";
import { ComponentStateProvider } from './context/CustomComponentStateContext';
import SlideEditor from './components/SlideEditor';
import { RegistryProvider, useRegistry } from './context/RegistryContext';
import { CompleteDeckData } from './types/DeckTypes';
import TestCollaboration from './yjs/TestCollaboration';
import SlideTagging from './pages/SlideTagging';
import SharedDeckView from './pages/SharedDeckView';
import SharedDeckEdit from './pages/SharedDeckEdit';
import { API_CONFIG } from './config/environment';
import { DeckStoreInitializer } from './components/DeckStoreInitializer';
// Removed font optimization hook
import { useEnsureUserRecord } from './hooks/useEnsureUserRecord';
const DevPerformanceHUD = import.meta.env.PROD ? null : React.lazy(() => import('./components/dev/PerformanceHUD'));

// Admin imports
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminUserDetail from './pages/admin/AdminUserDetail';
import AdminDecks from './pages/admin/AdminDecks';
import AdminAnalytics from './pages/admin/AdminAnalytics';
import AdminProtectedRoute from './components/AdminProtectedRoute';
import TemporaryPasswordGate from './components/TemporaryPasswordGate';

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
  
  // Only enable collaboration on editor routes, not on deck list or other pages
  const collaborationDisabledRoutes = ['/slide-tagging', '/renderer', '/', '/collaboration-test'];
  const isCollaborationEnabled = !collaborationDisabledRoutes.some(route => 
    route === '/' ? location.pathname === '/' : location.pathname.startsWith(route)
  );
  
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
          <TemporaryPasswordGate enabled={import.meta.env.VITE_ENABLE_TEMP_GATE !== 'false'} password={import.meta.env.VITE_TEMP_GATE_PASSWORD || 'NextBeta'}>
          <Routes>
            {/* Legacy alias: redirect settings/integrations to profile integrations */}
            <Route path="/settings/integrations" element={<RouteRedirect to="/profile?tab=integrations" />} />
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
              element={
                <ProtectedRoute>
                  <TeamSettings />
                </ProtectedRoute>
              } 
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
            {/* Admin routes */}
            <Route
              path="/admin"
              element={
                <AdminProtectedRoute>
                  <AdminDashboard />
                </AdminProtectedRoute>
              }
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
              path="/admin/analytics"
              element={
                <AdminProtectedRoute>
                  <AdminAnalytics />
                </AdminProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
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
  }, []);
  
  // Optimize initial render by loading critical resources
  useEffect(() => {
    // This effect is now empty as the initialization is moved to AppContent
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <NextThemesProvider attribute="class" defaultTheme="light" enableSystem>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <SupabaseAuthProvider>
              <UserRecordInitializer />
              <AppContent />
              {DevPerformanceHUD ? (
                <React.Suspense fallback={null}>
                  <DevPerformanceHUD />
                </React.Suspense>
              ) : null}
            </SupabaseAuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </NextThemesProvider>
    </QueryClientProvider>
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
