import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { authService } from '@/services/authService';
import { authRecoveryService } from '@/services/authRecoveryService';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  adminRole: string | null;
  isAdminLoading: boolean;
  refreshAdminStatus: () => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const SupabaseAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [isAdminLoading, setIsAdminLoading] = useState<boolean>(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const hasCheckedAdminRef = useRef<boolean>(false);
  const lastCheckedUserIdRef = useRef<string | null>(null);
  const checkingPromiseRef = useRef<Promise<void> | null>(null);

  // Lazy import to avoid circular deps during SSR
  const loadAdminApi = async () => (await import('@/services/adminApi')).adminApi;

  const refreshAdminStatus = async () => {
    // Coalesce concurrent calls
    if (checkingPromiseRef.current) {
      try { await checkingPromiseRef.current; } catch {}
      return;
    }
    if (!session?.user) {
      setIsAdmin(false);
      setAdminRole(null);
      return;
    }
    setIsAdminLoading(true);
    const run = (async () => {
      try {
        console.log('[Auth] Checking admin access for user:', session.user.id, session.user.email);
        let result: { isAdmin: boolean; role?: string } | null = null;

        // Primary: direct fetch to backend endpoint
        try {
          const { data: { session: current } } = await supabase.auth.getSession();
          const token = current?.access_token;
          if (!token) throw new Error('Missing auth token for admin check');
          const response = await fetch('/api/admin/check', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          if (response.ok) {
            const raw = await response.json();
            result = {
              isAdmin: Boolean(
                raw?.isAdmin === true ||
                raw?.is_admin === true ||
                (raw?.role && (raw.role === 'admin' || raw.role === 'super_admin' || raw.role === 'superadmin'))
              ),
              role: raw?.role || (raw?.isAdmin ? 'admin' : 'user')
            };
          } else {
            console.warn('[Auth] Direct admin check failed with status:', response.status);
          }
        } catch (directErr) {
          console.warn('[Auth] Direct admin check error:', directErr);
        }

        // Fallback: use adminApi abstraction
        if (!result) {
          try {
            const adminApi = await loadAdminApi();
            result = await adminApi.checkAdminAccess();
          } catch (libErr) {
            console.warn('[Auth] adminApi check failed as fallback:', libErr);
          }
        }

        console.log('[Auth] Admin check result:', result);
        setIsAdmin(result?.isAdmin === true);
        setAdminRole(result?.role || null);
      } catch (e) {
        console.error('[Auth] refreshAdminStatus failed:', e);
        setIsAdmin(false);
        setAdminRole(null);
      } finally {
        setIsAdminLoading(false);
        checkingPromiseRef.current = null;
      }
    })();
    checkingPromiseRef.current = run;
    await run;
  };

  useEffect(() => {
    // Set up automatic auth recovery (only once)
    authRecoveryService.setupAutoRecovery();
    
    // Get initial session
    console.log('[Auth] Getting initial session...');
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('[Auth] Error getting session:', error);
        // Don't clear auth data on session errors - Supabase will handle recovery
      }
      
      console.log('[Auth] Session loaded:', !!session);
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      // Defer admin check to UI flow (DeckList/UserMenu) to avoid competing with initial deck load
      
      // If we have a session, check if it needs refresh
      if (session && authService.isTokenExpired()) {
  
        supabase.auth.refreshSession().then(({ data: refreshData, error: refreshError }) => {
          if (refreshError) {
            console.error('[Auth] Token refresh failed:', refreshError);
            // Don't automatically clear session or redirect on refresh errors
            // Supabase will retry automatically with autoRefreshToken enabled
          } else if (refreshData.session) {
    
            setSession(refreshData.session);
            setUser(refreshData.session.user);
          }
        });
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {

      setSession(session);
      setUser(session?.user ?? null);
      
      // Handle auth events
      switch (_event) {
        case 'SIGNED_IN':
          // Defer admin role resolution to post-load UI triggers
          break;
        case 'SIGNED_OUT':

          // Only clear custom auth data on explicit sign out
          authService.clearAllAuthData();
          // Reset admin state
          setIsAdmin(false);
          setAdminRole(null);
          hasCheckedAdminRef.current = false;
          lastCheckedUserIdRef.current = null;
          navigate('/');
          break;
        case 'TOKEN_REFRESHED':
          // Do not re-check admin on token refresh to avoid extra calls
          break;
        case 'USER_UPDATED':

          break;
      }
    });

    // Set up visibility change listener to refresh token when returning to app
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {

        supabase.auth.getSession().then(({ data: { session }, error }) => {
          if (error || !session) {
  
            return;
          }
          
          // Check if token needs refresh
          if (authService.isTokenExpired()) {
  
            supabase.auth.refreshSession();
          }
        });
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [navigate]);

  // Do not auto-check admin on user changes; let views trigger explicitly

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
          emailRedirectTo: `${window.location.origin}/auth-callback`,
        }
      });

      if (error) throw error;

      if (data.user && !data.session) {
        // Email confirmation required
        navigate('/verify-email/pending');
      } else if (data.session) {
        // Auto-confirmed, redirect to app
        toast({
          title: "Account created successfully!",
          description: "Welcome to Next.Slide!",
        });
        navigate('/app');
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Sign up failed",
        description: error.message || "An error occurred during sign up",
      });
      throw error;
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      toast({
        title: "Welcome back!",
        description: "Successfully signed in.",
      });

      // Navigation will be handled by onAuthStateChange
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Sign in failed",
        description: error.message || "Invalid email or password",
      });
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth-callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      });

      if (error) throw error;

      // User will be redirected to Google
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Google sign in failed",
        description: error.message || "An error occurred",
      });
      throw error;
    }
  };

  const signInWithMagicLink = async (email: string) => {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth-callback`,
        }
      });

      if (error) throw error;

      // Success - email sent
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to send magic link",
        description: error.message || "Please try again",
      });
      throw error;
    }
  };

  const signOut = async () => {
    try {
      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      
      if (error && error.message !== 'User not found') {
        console.warn('Supabase signOut error:', error);
        // Don't throw - we still want to complete the logout
      }

      // The onAuthStateChange listener will handle:
      // - Clearing auth data via authService.clearAllAuthData()
      // - Navigation to home page
      // This prevents duplicate clearing and ensures proper cleanup

      toast({
        title: "Signed out",
        description: "You have been successfully signed out.",
      });
    } catch (error: any) {
      console.error('Sign out error:', error);
      
      // On error, manually clear and redirect
      authService.clearAllAuthData();
      setUser(null);
      setSession(null);
      navigate('/');
      
      toast({
        variant: "destructive",
        title: "Sign out completed with warnings",
        description: "You have been signed out, but there was an issue with the server.",
      });
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth-callback?type=recovery`,
      });

      if (error) throw error;

      toast({
        title: "Password reset email sent",
        description: "Check your email for the reset link.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Password reset failed",
        description: error.message || "An error occurred",
      });
      throw error;
    }
  };

  const updatePassword = async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      toast({
        title: "Password updated",
        description: "Your password has been successfully updated.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Password update failed",
        description: error.message || "An error occurred",
      });
      throw error;
    }
  };

  const value = {
    user,
    session,
    isAuthenticated: !!session,
    isLoading,
    isAdmin,
    adminRole,
    isAdminLoading,
    refreshAdminStatus,
    signUp,
    signIn,
    signInWithGoogle,
    signInWithMagicLink,
    signOut,
    resetPassword,
    updatePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};