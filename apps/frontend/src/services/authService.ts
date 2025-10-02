import { API_CONFIG } from '@/config/environment';
import { supabase } from '@/integrations/supabase/client';

/**
 * Simplified Auth Service
 * This service only handles token retrieval for API calls.
 * All authentication operations (sign in, sign up, etc.) are handled by Supabase.
 */
class AuthService {
  private baseUrl = API_CONFIG.BASE_URL;
  
  /**
   * Get the authentication token for API calls
   * Uses Supabase's built-in session management only
   */
  getAuthToken(): string | null {
    try {
      // Get the session directly from Supabase's storage
      // Supabase stores the session with a project-specific key
      const keys = Object.keys(localStorage);
      
      // Find the Supabase auth token key
      const authKey = keys.find(key => 
        key.startsWith('sb-') && key.endsWith('-auth-token')
      );
      
      if (authKey) {
        const sessionData = localStorage.getItem(authKey);
        if (sessionData) {
          try {
            const session = JSON.parse(sessionData);
            if (session && session.access_token) {
              return session.access_token;
            }
          } catch (e) {
            console.error('[AuthService] Failed to parse session data:', e);
          }
        }
      }
      
      return null;
    } catch (e) {
      console.error('[AuthService] Failed to get auth token:', e);
      return null;
    }
  }
  
  /**
   * Get auth token asynchronously from Supabase (more reliable)
   */
  async getAuthTokenAsync(): Promise<string | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {

        return session.access_token;
      }
    } catch (e) {
      console.error('[AuthService] Failed to get async session:', e);
    }
    
    // Fall back to sync method
    return this.getAuthToken();
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.getAuthToken();
  }
  
  /**
   * Check if token is expired
   */
  isTokenExpired(): boolean {
    const token = this.getAuthToken();
    if (!token) return true;
    
    try {
      // Decode JWT to check expiration
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiresAt = payload.exp * 1000; // Convert to milliseconds
      const now = Date.now();
      const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
      
      return now >= (expiresAt - bufferTime);
    } catch (error) {
      console.error('Error checking token expiration:', error);
      return true; // Assume expired if can't decode
    }
  }

  /**
   * Get the correct auth URL based on environment
   * Used by services that need to call auth endpoints
   */
  getAuthUrl(endpoint: string): string {
    // In production, remove the /api prefix for auth endpoints
    if (import.meta.env.PROD && this.baseUrl.includes('/api')) {
      return this.baseUrl.replace('/api', '') + endpoint;
    }
    // In development, auth endpoints are proxied correctly
    return `/api${endpoint}`;
  }
  
  /**
   * Refresh the token using Supabase
   */
  async refreshToken(): Promise<string | null> {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.error('[AuthService] Token refresh failed:', error);
        return null;
      }
      
      return data.session?.access_token || null;
        } catch (error) {
      console.error('[AuthService] Token refresh error:', error);
      return null;
    }
  }
  
  /**
   * Clear all authentication data
   * Note: This should only be called when explicitly signing out
   * Don't call this on temporary errors or token refresh failures
   */
  clearAllAuthData(): void {
    // Only clear legacy custom localStorage items if they exist
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('nextslide_user');
    
    // Important: We don't clear Supabase's session data here
    // Supabase manages its own session persistence
    // Only supabase.auth.signOut() should clear the Supabase session
  }

  /**
   * Hard reset authentication when session is irrecoverably invalid
   * - Signs out from Supabase (best effort)
   * - Clears Supabase auth storage keys (sb-*-auth-token, sb-*-persist)
   * - Clears legacy custom auth entries
   * - Redirects to login
   */
  async hardResetAuth(options?: { redirect?: string }): Promise<void> {
    const redirectTo = options?.redirect ?? '/login';
    try {
      await supabase.auth.signOut();
    } catch (error) {
      // Best-effort sign out; continue cleanup
      console.warn('[AuthService] supabase.auth.signOut failed during hard reset:', error);
    }

    try {
      // Remove Supabase session/persist keys for current project
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith('sb-') && (key.endsWith('-auth-token') || key.endsWith('-persist'))) {
          try { localStorage.removeItem(key); } catch {}
        }
      }
    } catch (e) {
      console.warn('[AuthService] Failed to clear Supabase auth storage keys:', e);
    }

    // Clear our legacy entries
    try {
      this.clearAllAuthData();
    } catch {}

    // Force navigation to login to obtain a clean session
    try {
      window.location.href = redirectTo;
    } catch {}
  }
}

// Export singleton instance
export const authService = new AuthService();