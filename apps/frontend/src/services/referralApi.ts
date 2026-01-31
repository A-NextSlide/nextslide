/**
 * Referral API Service
 *
 * Handles all referral-related API calls:
 * - Referral code retrieval
 * - Referral stats
 * - Referral list
 * - Referral tracking (signup)
 * - Referral code lookup (public)
 */

import { authService } from './authService';

const rawApiBase = import.meta.env.VITE_API_URL || '';
const API_BASE = rawApiBase.replace(/\/api\/?$/, '');

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface ReferralCode {
  code: string;
  referral_url: string;
}

export interface ReferralStats {
  code: string;
  referral_url: string;
  total_referrals: number;
  total_signups: number;
  total_activated: number;
  total_credits_earned: number;
}

export interface ReferralListItem {
  id: string;
  referee_email: string;
  status: 'signed_up' | 'activated' | 'rewarded';
  referrer_credits_awarded: number;
  referee_credits_awarded: number;
  created_at: string;
  activated_at: string | null;
  rewarded_at: string | null;
}

export interface ReferralLookup {
  code: string;
  referrer_name: string;
}

// -------------------------------------------------------------------
// API Client
// -------------------------------------------------------------------

class ReferralApi {
  private getHeaders(): Record<string, string> {
    let token: string | null = null;
    try {
      token = authService.getAuthToken();
    } catch (e) {
      console.warn('[ReferralApi] Failed to get auth token:', e);
    }
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /**
   * Check if user already has a referral code (no auto-create).
   * Returns null if no code exists.
   */
  async getMyCode(): Promise<ReferralCode | null> {
    const response = await fetch(`${API_BASE}/api/referral/my-code`, {
      headers: this.getHeaders(),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Failed to check referral code');
    return response.json();
  }

  /**
   * Get or create the current user's referral code.
   */
  async getReferralCode(): Promise<ReferralCode> {
    const response = await fetch(`${API_BASE}/api/referral/code`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch referral code');
    return response.json();
  }

  /**
   * Get referral dashboard stats.
   */
  async getReferralStats(): Promise<ReferralStats> {
    const response = await fetch(`${API_BASE}/api/referral/stats`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch referral stats');
    return response.json();
  }

  /**
   * Get list of referrals.
   */
  async getReferralList(): Promise<{ referrals: ReferralListItem[] }> {
    const response = await fetch(`${API_BASE}/api/referral/list`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch referral list');
    return response.json();
  }

  /**
   * Track a referral signup (called after signup with a stored referral code).
   */
  async trackReferralSignup(
    refereeId: string,
    referralCode: string,
  ): Promise<{ success: boolean; referral_id?: string }> {
    const response = await fetch(`${API_BASE}/api/referral/track`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        referee_id: refereeId,
        referral_code: referralCode,
      }),
    });
    if (!response.ok) {
      console.warn('[ReferralApi] Track referral failed:', response.status);
      return { success: false };
    }
    return response.json();
  }

  /**
   * Create a referral code, optionally with a custom code.
   */
  async createReferralCode(customCode?: string): Promise<ReferralCode> {
    const response = await fetch(`${API_BASE}/api/referral/create`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ custom_code: customCode || null }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || 'Failed to create referral code');
    }
    return response.json();
  }

  /**
   * Public: look up a referral code (no auth required).
   */
  async lookupReferralCode(code: string): Promise<ReferralLookup | null> {
    const response = await fetch(`${API_BASE}/api/referral/lookup/${encodeURIComponent(code)}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) return null;
    return response.json();
  }
}

export const referralApi = new ReferralApi();
