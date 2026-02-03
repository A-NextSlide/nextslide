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
      // Check if localStorage is available (may not be in private browsing or some WebViews)
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
        return null;
      }

      // Get the session directly from Supabase's storage
      // Supabase stores the session with a project-specific key
      let keys: string[];
      try {
        keys = Object.keys(localStorage);
      } catch (e) {
        // localStorage access denied (private browsing on some mobile browsers)
        console.warn('[AuthService] localStorage not accessible:', e);
        return null;
      }

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
  
  // Track last refresh attempt to avoid hammering the endpoint on repeated failures
  private _lastRefreshAttempt = 0;

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

    // Fall back to sync method (reads localStorage directly)
    const syncToken = this.getAuthToken();
    if (syncToken) return syncToken;

    // Both methods failed — attempt a session refresh as a last resort.
    // This is common on mobile after the app is backgrounded: the in-memory
    // Supabase session is lost and localStorage may be inaccessible, but the
    // refresh_token can still be valid.
    const now = Date.now();
    if (now - this._lastRefreshAttempt > 5000) {
      this._lastRefreshAttempt = now;
      try {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          console.log('[AuthService] Recovered session via token refresh');
          return refreshed;
        }
      } catch (e) {
        console.warn('[AuthService] Token refresh recovery failed:', e);
      }
    }

    return null;
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
    try {
      // Check if localStorage is available before accessing
      if (typeof localStorage === 'undefined') return;

      // Only clear legacy custom localStorage items if they exist
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('nextslide_user');
    } catch (e) {
      console.warn('[AuthService] Failed to clear auth data from localStorage:', e);
    }

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
      // Check if localStorage is available before accessing
      if (typeof localStorage !== 'undefined') {
        // Remove Supabase session/persist keys for current project
        const keys = Object.keys(localStorage);
        for (const key of keys) {
          if (key.startsWith('sb-') && (key.endsWith('-auth-token') || key.endsWith('-persist'))) {
            try { localStorage.removeItem(key); } catch {}
          }
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
      if (typeof window !== 'undefined') {
        window.location.href = redirectTo;
      }
    } catch {}
  }

  /**
   * Get user's onboarding state (all flags)
   */
  async getOnboardingState(): Promise<{
    welcome_shown: boolean;
    presentations_created: number;
    show_ai_hints: boolean;
    tutorial_completed: boolean;
    tutorial_views_count: number;
    overage_confirmed: boolean;
    feature_hints_dismissed: string[];
  } | null> {
    try {
      const token = await this.getAuthTokenAsync();
      if (!token) return null;

      const response = await fetch(this.getAuthUrl('/auth/user/onboarding-state'), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error('[AuthService] Failed to get onboarding state:', response.status);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('[AuthService] Error getting onboarding state:', error);
      return null;
    }
  }

  /**
   * Mark that the welcome message has been shown to the user
   */
  async markWelcomeShown(): Promise<boolean> {
    try {
      const token = await this.getAuthTokenAsync();
      if (!token) return false;

      const response = await fetch(this.getAuthUrl('/auth/user/mark-welcome-shown'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      return response.ok;
    } catch (error) {
      console.error('[AuthService] Error marking welcome shown:', error);
      return false;
    }
  }

  /**
   * Mark an onboarding flag as completed
   * @param flag One of: welcome_shown, tutorial_completed, overage_confirmed
   */
  async markOnboardingFlag(flag: 'welcome_shown' | 'tutorial_completed' | 'overage_confirmed'): Promise<boolean> {
    try {
      const token = await this.getAuthTokenAsync();
      if (!token) return false;

      const response = await fetch(this.getAuthUrl('/auth/user/mark-onboarding-flag'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ flag }),
      });

      return response.ok;
    } catch (error) {
      console.error(`[AuthService] Error marking ${flag}:`, error);
      return false;
    }
  }

  /**
   * Dismiss a feature hint so it won't be shown again
   * @param hintId The ID of the feature hint to dismiss
   */
  async dismissFeatureHint(hintId: string): Promise<boolean> {
    try {
      const token = await this.getAuthTokenAsync();
      if (!token) return false;

      const response = await fetch(this.getAuthUrl('/auth/user/dismiss-feature-hint'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hint_id: hintId }),
      });

      return response.ok;
    } catch (error) {
      console.error('[AuthService] Error dismissing feature hint:', error);
      return false;
    }
  }

  /**
   * Increment the tutorial views count (called when tutorial is shown)
   * Returns the new count
   */
  async incrementTutorialViews(): Promise<number> {
    try {
      const token = await this.getAuthTokenAsync();
      if (!token) return 0;

      const response = await fetch(this.getAuthUrl('/auth/user/increment-tutorial-views'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        return data.tutorial_views_count || 0;
      }
      return 0;
    } catch (error) {
      console.error('[AuthService] Error incrementing tutorial views:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const authService = new AuthService();