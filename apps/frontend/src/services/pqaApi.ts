/**
 * PQA (Product Qualified Account) API Service
 *
 * Handles API calls for enterprise PQA detection and upgrade prompts:
 * - PQA status checks
 * - Upgrade prompt lifecycle (show / dismiss / convert)
 * - Enterprise feature gating
 */

import { authService } from './authService';

// Remove trailing /api if present since we add it in the endpoints
const rawApiBase = import.meta.env.VITE_API_URL || '';
const API_BASE = rawApiBase.replace(/\/api\/?$/, '');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PqaStatus {
  is_pqa: boolean;
  domain: string;
  user_count: number;
  company_name: string;
}

export interface PqaPromptStatus {
  should_show: boolean;
  prompt_type: string;
  domain: string;
  user_count: number;
  company_name?: string;
  reason?: string;
}

export interface EnterpriseFeatures {
  plan_id: string;
  features: {
    brand_kit: boolean;
    team_templates: boolean;
    team_analytics: boolean;
    brand_colors?: boolean;
  };
  locked_features: Array<{
    feature: string;
    required_plan: string;
  }>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class PqaApi {
  private getHeaders(): Record<string, string> {
    let token: string | null = null;
    try {
      token = authService.getAuthToken();
    } catch (e) {
      console.warn('[PqaApi] Failed to get auth token:', e);
    }
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  // Helper for safe JSON parsing (Safari compatibility)
  private async safeJsonParse<T>(response: Response): Promise<T> {
    const text = await response.text();
    if (!text || !text.trim()) throw new Error('Empty response');
    return JSON.parse(text);
  }

  /**
   * Check if the current user's domain qualifies as PQA.
   */
  async getPqaStatus(): Promise<PqaStatus> {
    const response = await fetch(`${API_BASE}/api/pqa/status`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch PQA status');
    return this.safeJsonParse(response);
  }

  /**
   * Check if upgrade prompt should be shown to the current user.
   */
  async getPromptStatus(): Promise<PqaPromptStatus> {
    const response = await fetch(`${API_BASE}/api/pqa/prompt-status`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch prompt status');
    return this.safeJsonParse(response);
  }

  /**
   * Dismiss a PQA upgrade prompt.
   */
  async dismissPrompt(promptType: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/api/pqa/dismiss-prompt`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ prompt_type: promptType }),
    });
    if (!response.ok) throw new Error('Failed to dismiss prompt');
    return this.safeJsonParse(response);
  }

  /**
   * Record that a PQA user has converted (upgraded).
   */
  async recordConversion(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/api/pqa/convert`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to record conversion');
    return this.safeJsonParse(response);
  }

  /**
   * Get available enterprise features for the current user's plan.
   */
  async getEnterpriseFeatures(): Promise<EnterpriseFeatures> {
    const response = await fetch(`${API_BASE}/api/pqa/enterprise-features`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch enterprise features');
    return this.safeJsonParse(response);
  }
}

export const pqaApi = new PqaApi();
