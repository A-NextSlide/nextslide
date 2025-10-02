/**
 * Quick auth check utility
 * Only loaded in development environment
 */
import { authService } from '@/services/authService';
import { authRecoveryService } from '@/services/authRecoveryService';
import { supabase } from '@/integrations/supabase/client';

export function quickAuthCheck() {
  const isAuth = authService.isAuthenticated();
  const token = authService.getAuthToken();
  
  // Parse JWT to get more details
  let tokenDetails = null;
  if (token) {
    try {
      const parts = token.split('.');
      const payload = JSON.parse(atob(parts[1]));
      tokenDetails = {
        email: payload.email,
        sub: payload.sub,
        exp: new Date(payload.exp * 1000).toISOString(),
        iss: payload.iss,
        isExpired: authService.isTokenExpired()
      };
    } catch (e) {
      // Ignore parse errors
    }
  }
  
  return {
    isAuthenticated: isAuth,
    hasToken: !!token,
    tokenLength: token?.length || 0,
    timestamp: new Date().toISOString(),
    ...(tokenDetails && { tokenDetails })
  };
}

/**
 * Force refresh the authentication session
 * Useful when returning to the app after being away
 */
export async function forceRefreshSession() {
  
  
  try {
    // First, check if we have a session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {

      authService.clearAllAuthData();
      window.location.href = '/';
      return null;
    }
    
    // Try to refresh the session
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    
    if (refreshError) {
      console.error('[Auth] Force refresh failed:', refreshError);
      authService.clearAllAuthData();
      window.location.href = '/';
      return null;
    }
    
    if (refreshData.session) {
  
      // Force a page reload to ensure all components get the new token
      window.location.reload();
      return refreshData.session;
    }
    
    return null;
  } catch (error) {
    console.error('[Auth] Unexpected error during force refresh:', error);
    authService.clearAllAuthData();
    window.location.href = '/';
    return null;
  }
}

// Run a quick auth check on load
if (import.meta.env.DEV) {
  const checkAuth = async () => {
    const result = quickAuthCheck();
    
    
    // Check if token is expired
    const token = authService.getAuthToken();
    if (token && authService.isTokenExpired()) {
      console.warn('⚠️ Auth token is expired!');
    }
  };
  
  // Run check on load
  checkAuth();
  
  // Also run check when window gets focus
  window.addEventListener('focus', checkAuth);
  
  // Expose to window for manual checks
  (window as any).quickAuthCheck = quickAuthCheck;
  (window as any).forceRefreshSession = forceRefreshSession;
  (window as any).recoverAuth = () => authRecoveryService.checkAndRecoverAuth();
}

export {};