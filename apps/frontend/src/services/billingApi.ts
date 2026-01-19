/**
 * Billing API Service
 *
 * Handles all billing-related API calls:
 * - Credit balance
 * - Subscription management
 * - Checkout
 * - Usage stats
 */

import { authService } from './authService';

// Remove trailing /api if present since we add it in the endpoints
// Use empty string in dev so relative URLs work with the proxy from any device
const rawApiBase = import.meta.env.VITE_API_URL || '';
const API_BASE = rawApiBase.replace(/\/api\/?$/, '');

interface CreditBalance {
  remaining_credits: number;
  monthly_credits: number;
  purchased_credits: number;
  used_credits: number;
  plan_id: string;
  plan_name: string;
  period_end: string | null;
  estimated_slides: number;
  estimated_presentations: number;
  // Overage (Pro only)
  overage_credits: number;
  overage_cost_cents: number;
  can_use_overage: boolean;
  // Friends & Family (unlimited credits)
  is_friends_family: boolean;
}

interface UsageStats {
  total_credits_used: number;
  slides_generated: number;
  chats_sent: number;
  edits_made: number;
  period_start: string;
  period_end: string;
}

interface Subscription {
  plan_id: string;
  plan_name: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  features: string[];
}

interface PricingPlan {
  id: string;
  name: string;
  description: string | null;
  monthly_credits: number;
  price_cents: number;
  features: string[];
  estimated_presentations: number;
}

interface CreditCheck {
  has_credits: boolean;
  cost: number;
  remaining: number;
  action: string;
}

interface CheckoutSession {
  session_id: string | null;
  url: string;
  upgraded?: boolean;
  already_subscribed?: boolean;
}

interface PortalSession {
  url: string;
}

interface CreditCosts {
  costs: Record<string, number>;
  descriptions: Record<string, string>;
}

interface Transaction {
  id: string;
  amount: number;
  balance_after: number;
  transaction_type: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

class BillingApi {
  private getHeaders(): Record<string, string> {
    let token: string | null = null;
    try {
      token = authService.getAuthToken();
    } catch (e) {
      console.warn('[BillingApi] Failed to get auth token:', e);
    }
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async getBalance(): Promise<CreditBalance> {
    const response = await fetch(`${API_BASE}/api/billing/balance`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch balance');
    // Safe JSON parsing for Safari compatibility
    const text = await response.text();
    if (!text || !text.trim()) throw new Error('Empty response');
    return JSON.parse(text);
  }

  // Helper for safe JSON parsing (Safari compatibility)
  private async safeJsonParse<T>(response: Response): Promise<T> {
    const text = await response.text();
    if (!text || !text.trim()) throw new Error('Empty response');
    return JSON.parse(text);
  }

  async getUsageStats(): Promise<UsageStats> {
    const response = await fetch(`${API_BASE}/api/billing/usage`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch usage stats');
    return this.safeJsonParse(response);
  }

  async getSubscription(): Promise<Subscription> {
    const response = await fetch(`${API_BASE}/api/billing/subscription`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch subscription');
    return this.safeJsonParse(response);
  }

  async getPricingPlans(): Promise<PricingPlan[]> {
    const response = await fetch(`${API_BASE}/api/billing/plans`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch pricing plans');
    return this.safeJsonParse(response);
  }

  async checkCredits(action: string): Promise<CreditCheck> {
    const response = await fetch(`${API_BASE}/api/billing/check/${action}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to check credits');
    return this.safeJsonParse(response);
  }

  async getTransactions(limit = 50): Promise<Transaction[]> {
    const response = await fetch(`${API_BASE}/api/billing/transactions?limit=${limit}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch transactions');
    return response.json();
  }

  async createCheckout(
    planId: string,
    successUrl?: string,
    cancelUrl?: string
  ): Promise<CheckoutSession> {
    const response = await fetch(`${API_BASE}/api/billing/checkout`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        plan_id: planId,
        success_url: successUrl,
        cancel_url: cancelUrl,
      }),
    });
    if (!response.ok) throw new Error('Failed to create checkout session');
    return response.json();
  }

  async createPortalSession(): Promise<PortalSession> {
    const response = await fetch(`${API_BASE}/api/billing/portal`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to create portal session');
    return response.json();
  }

  async cancelSubscription(reason: string, reasonDetails?: string): Promise<{ status: string }> {
    const response = await fetch(`${API_BASE}/api/billing/cancel`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        reason,
        reason_details: reasonDetails || null,
      }),
    });
    if (!response.ok) throw new Error('Failed to cancel subscription');
    return response.json();
  }

  async getCreditCosts(): Promise<CreditCosts> {
    const response = await fetch(`${API_BASE}/api/billing/costs`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch credit costs');
    return response.json();
  }

  /**
   * Sync subscription from Stripe to database.
   * Call this after checkout success to ensure subscription is updated.
   */
  async syncSubscription(): Promise<{
    synced: boolean;
    plan_id?: string;
    monthly_credits?: number;
    status?: string;
    message?: string;
  }> {
    const response = await fetch(`${API_BASE}/api/billing/sync`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to sync subscription');
    return response.json();
  }
}

export const billingApi = new BillingApi();

export type {
  CreditBalance,
  UsageStats,
  Subscription,
  PricingPlan,
  CreditCheck,
  CheckoutSession,
  PortalSession,
  CreditCosts,
  Transaction,
};
