/**
 * Sharing API Service
 *
 * Handles all deck-sharing and team invite prompt API calls:
 * - Share a deck with another user
 * - Fetch decks shared with / by the current user
 * - Mark shares as read
 * - Remove shares
 * - Dismiss team invite prompts
 * - Fetch prompt status (which prompts to show)
 */

import { authService } from './authService';
import { extractApiError } from '@/utils/extractErrorMessage';

const rawApiBase = import.meta.env.VITE_API_URL || '';
const API_BASE = rawApiBase.replace(/\/api\/?$/, '');

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface ShareRecord {
  id: string;
  deck_id: string;
  deck_title: string;
  deck_slide_count: number;
  permission: 'view' | 'edit';
  message: string | null;
  is_read: boolean;
  created_at: string;
}

export interface SharedWithMeItem extends ShareRecord {
  shared_by_email: string;
  shared_by_name: string | null;
}

export interface SharedByMeItem extends ShareRecord {
  shared_with_email: string;
  shared_with_name: string | null;
}

export interface PromptInfo {
  eligible: boolean;
  dismissed: boolean;
}

export interface PromptStatus {
  prompts: {
    after_3rd_deck: PromptInfo;
    after_share: PromptInfo;
    after_100_views: PromptInfo;
  };
  stats: {
    deck_count: number;
    share_count: number;
    total_views: number;
  };
}

// -------------------------------------------------------------------
// API Client
// -------------------------------------------------------------------

class SharingApi {
  private getHeaders(): Record<string, string> {
    let token: string | null = null;
    try {
      token = authService.getAuthToken();
    } catch (e) {
      console.warn('[SharingApi] Failed to get auth token:', e);
    }
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /**
   * Share a deck with another user by email.
   */
  async shareDeck(params: {
    deckId: string;
    email: string;
    permission: 'view' | 'edit';
    message?: string;
  }): Promise<{ success: boolean; share?: ShareRecord }> {
    const response = await fetch(`${API_BASE}/api/sharing/share`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        deck_id: params.deckId,
        email: params.email,
        permission: params.permission,
        message: params.message,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractApiError(error.detail, 'Failed to share deck'));
    }
    return response.json();
  }

  /**
   * Get decks shared with the current user.
   */
  async getSharedWithMe(): Promise<{ shares: SharedWithMeItem[] }> {
    const response = await fetch(`${API_BASE}/api/sharing/shared-with-me`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch shared-with-me');
    return response.json();
  }

  /**
   * Get decks the current user has shared.
   */
  async getSharedByMe(): Promise<{ shares: SharedByMeItem[] }> {
    const response = await fetch(`${API_BASE}/api/sharing/shared-by-me`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch shared-by-me');
    return response.json();
  }

  /**
   * Mark a share notification as read.
   */
  async markAsRead(shareId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/api/sharing/${shareId}/read`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to mark share as read');
    return response.json();
  }

  /**
   * Remove a share.
   */
  async removeShare(shareId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/api/sharing/${shareId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to remove share');
    return response.json();
  }

  /**
   * Dismiss a team invite prompt for 7 days.
   */
  async dismissPrompt(promptType: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/api/sharing/dismiss-prompt`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ prompt_type: promptType }),
    });
    if (!response.ok) throw new Error('Failed to dismiss prompt');
    return response.json();
  }

  /**
   * Get which team invite prompts should be shown.
   */
  async getPromptStatus(): Promise<PromptStatus> {
    const response = await fetch(`${API_BASE}/api/sharing/prompt-status`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch prompt status');
    return response.json();
  }
}

export const sharingApi = new SharingApi();
