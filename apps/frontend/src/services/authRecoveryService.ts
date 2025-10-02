/**
 * Auth Recovery Service
 * Provides utilities for recovering from authentication issues
 */
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/services/authService';

class AuthRecoveryService {
  private isRecovering = false;
  private lastRecoveryAttempt = 0;
  private readonly RECOVERY_COOLDOWN = 5000; // 5 seconds between recovery attempts
  private isSetup = false; // Track if auto-recovery is already set up

  /**
   * Check authentication state and attempt recovery if needed
   * @returns {Promise<boolean>} True if auth is valid or was recovered
   */
  async checkAndRecoverAuth(): Promise<boolean> {
    // Prevent multiple simultaneous recovery attempts
    if (this.isRecovering) {
      console.log('[Auth Recovery] Recovery already in progress');
      return false;
    }

    // Prevent too frequent recovery attempts
    const now = Date.now();
    if (now - this.lastRecoveryAttempt < this.RECOVERY_COOLDOWN) {
      console.log('[Auth Recovery] Too soon since last recovery attempt');
      return false;
    }

    this.isRecovering = true;
    this.lastRecoveryAttempt = now;

    try {
      // First check if we have a valid session
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('[Auth Recovery] Error getting session:', error);
        return false;
      }
      
      if (!session) {
        console.log('[Auth Recovery] No active session found');
        return false;
      }
      
      // Check if the token is expired or expiring soon
      const expiresAt = session.expires_at;
      const currentTime = Math.floor(Date.now() / 1000);
      
      if (expiresAt && currentTime >= expiresAt - 60) { // Refresh if expiring in 1 minute
        console.log('[Auth Recovery] Token expiring soon, attempting refresh...');
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError) {
          console.error('[Auth Recovery] Failed to refresh session:', refreshError);
          return false;
        }
        
        if (refreshData.session) {
          console.log('[Auth Recovery] Session refreshed successfully');
          return true;
        }
      }
      
      console.log('[Auth Recovery] Session is valid');
      return true;
    } catch (error) {
      console.error('[Auth Recovery] Unexpected error:', error);
      return false;
    } finally {
      this.isRecovering = false;
    }
  }

  /**
   * Set up automatic auth recovery on visibility change
   */
  setupAutoRecovery() {
    // Prevent multiple setups
    if (this.isSetup) {
      console.log('[Auth Recovery] Auto-recovery already set up, skipping');
      return;
    }
    
    this.isSetup = true;
    
    // Recover auth when tab becomes visible
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        console.log('[Auth Recovery] Tab became visible, checking auth...');
        await this.checkAndRecoverAuth();
      }
    });

    // Recover auth on online event
    window.addEventListener('online', async () => {
      console.log('[Auth Recovery] Network connection restored, checking auth...');
      await this.checkAndRecoverAuth();
    });

    // Periodic auth check (every 5 minutes)
    setInterval(async () => {
      const token = authService.getAuthToken();
      if (token) {
        await this.checkAndRecoverAuth();
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Force a session refresh
   * Use this when you need to manually recover from auth issues
   */
  async forceRefresh(): Promise<boolean> {
    try {
      console.log('[Auth Recovery] Forcing session refresh...');
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        console.error('[Auth Recovery] Force refresh failed:', error);
        return false;
      }
      
      if (data.session) {
        console.log('[Auth Recovery] Force refresh successful');
        // Reload the page to ensure all components get the new session
        window.location.reload();
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[Auth Recovery] Force refresh error:', error);
      return false;
    }
  }
}

// Export singleton instance
export const authRecoveryService = new AuthRecoveryService();

// Make recovery utilities available in development
if (import.meta.env.DEV) {
  (window as any).authRecovery = {
    check: () => authRecoveryService.checkAndRecoverAuth(),
    forceRefresh: () => authRecoveryService.forceRefresh(),
  };
}