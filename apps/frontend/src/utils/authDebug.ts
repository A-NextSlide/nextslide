/**
 * Auth debugging utilities
 * Only loaded in development environment
 */
import { authService } from '@/services/authService';
import { supabase } from '@/integrations/supabase/client';

// Expose auth utilities to window for debugging
if (import.meta.env.DEV) {
  (window as any).authDebug = {
    getSession: async () => {
      const { data, error } = await supabase.auth.getSession();
      console.log('Current session:', data);
      if (error) console.error('Session error:', error);
      return data;
    },
    
    getUser: async () => {
      const { data, error } = await supabase.auth.getUser();
      console.log('Current user:', data);
      if (error) console.error('User error:', error);
      return data;
    },
    
    getToken: () => {
      const token = authService.getAuthToken();
      console.log('Current token:', token);
      return token;
    },
    
    isAuthenticated: () => {
      const isAuth = authService.isAuthenticated();
      console.log('Is authenticated:', isAuth);
      return isAuth;
    },
    
    checkTokenExpiry: () => {
      const isExpired = authService.isTokenExpired();
      console.log('Token expired:', isExpired);
      return isExpired;
    },
    
    refreshToken: async () => {
      console.log('Attempting token refresh...');
      const newToken = await authService.refreshToken();
      console.log('New token:', newToken);
      return newToken;
    },
    
    forceRefresh: async () => {
      console.log('Force refreshing session...');
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.error('Force refresh failed:', error);
        return null;
      }
      console.log('Session refreshed:', data.session);
      window.location.reload();
      return data.session;
    },
    
    signOut: async () => {
      console.log('Signing out...');
      await authService.signOut();
      console.log('Signed out successfully');
    }
  };
  
  
}

export {};