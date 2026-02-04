/**
 * Profile API Service
 *
 * Handles all public profile and creator page API calls:
 * - Public profile retrieval
 * - Profile updates
 * - Username setting
 * - Follow / unfollow
 * - Followers / following lists
 * - User presentations
 */

import { authService } from './authService';
import { extractApiError } from '@/utils/extractErrorMessage';

const rawApiBase = import.meta.env.VITE_API_URL || '';
const API_BASE = rawApiBase.replace(/\/api\/?$/, '');

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface SocialLinks {
  linkedin?: string;
  twitter?: string;
  website?: string;
  [key: string]: string | undefined;
}

export interface ProfileStats {
  total_presentations: number;
  total_views: number;
  total_remixes: number;
  follower_count: number;
  following_count: number;
  streak_count: number;
}

export interface PublicProfile {
  id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  social_links: SocialLinks;
  creator_tier: string;
  created_at: string;
  stats: ProfileStats;
  is_following: boolean;
}

export interface OwnProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  social_links: SocialLinks;
  is_profile_public: boolean;
  hide_watermark: boolean;
  creator_tier: string;
  created_at: string;
}

export interface ProfileUpdateData {
  bio?: string;
  social_links?: SocialLinks;
  is_profile_public?: boolean;
  avatar_url?: string;
  hide_watermark?: boolean;
}

export interface FollowUser {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  creator_tier: string;
  followed_at: string;
}

export interface ProfilePresentation {
  uuid: string;
  name: string;
  slide_count: number;
  first_slide: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface PresentationsResponse {
  presentations: ProfilePresentation[];
  total: number;
  has_more: boolean;
}

// -------------------------------------------------------------------
// API Client
// -------------------------------------------------------------------

class ProfileApi {
  private getHeaders(): Record<string, string> {
    let token: string | null = null;
    try {
      token = authService.getAuthToken();
    } catch (e) {
      console.warn('[ProfileApi] Failed to get auth token:', e);
    }
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private getPublicHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }

  // ----------------------------------------------------------------
  // Own Profile (auth required)
  // ----------------------------------------------------------------

  /**
   * Get the current user's own profile data for editing.
   */
  async getOwnProfile(): Promise<OwnProfile> {
    const response = await fetch(`${API_BASE}/api/profiles/me`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch own profile');
    return response.json();
  }

  /**
   * Update the current user's profile.
   */
  async updateProfile(data: ProfileUpdateData): Promise<{ success: boolean; profile?: OwnProfile; error?: string }> {
    const response = await fetch(`${API_BASE}/api/profiles/me`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, error: extractApiError(err.detail, 'Update failed') };
    }
    return response.json();
  }

  /**
   * Set or update username.
   */
  async setUsername(username: string): Promise<{ success: boolean; username?: string; error?: string }> {
    const response = await fetch(`${API_BASE}/api/profiles/me/username`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ username }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, error: extractApiError(err.detail, 'Failed to set username') };
    }
    return response.json();
  }

  // ----------------------------------------------------------------
  // Public Profile
  // ----------------------------------------------------------------

  /**
   * Get a public profile by username.
   */
  async getPublicProfile(username: string): Promise<PublicProfile | null> {
    const response = await fetch(`${API_BASE}/api/profiles/${encodeURIComponent(username)}`, {
      headers: this.getHeaders(), // send auth if available for is_following
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Failed to fetch profile');
    return response.json();
  }

  /**
   * Get a user's public presentations.
   */
  async getUserPresentations(
    username: string,
    limit = 20,
    offset = 0,
  ): Promise<PresentationsResponse> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    const response = await fetch(
      `${API_BASE}/api/profiles/${encodeURIComponent(username)}/presentations?${params}`,
      { headers: this.getPublicHeaders() },
    );
    if (!response.ok) throw new Error('Failed to fetch presentations');
    return response.json();
  }

  // ----------------------------------------------------------------
  // Follow / Unfollow
  // ----------------------------------------------------------------

  /**
   * Follow a user.
   */
  async followUser(username: string): Promise<{ success: boolean; error?: string }> {
    const response = await fetch(
      `${API_BASE}/api/profiles/${encodeURIComponent(username)}/follow`,
      {
        method: 'POST',
        headers: this.getHeaders(),
      },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, error: extractApiError(err.detail, 'Failed to follow') };
    }
    return response.json();
  }

  /**
   * Unfollow a user.
   */
  async unfollowUser(username: string): Promise<{ success: boolean; error?: string }> {
    const response = await fetch(
      `${API_BASE}/api/profiles/${encodeURIComponent(username)}/follow`,
      {
        method: 'DELETE',
        headers: this.getHeaders(),
      },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, error: extractApiError(err.detail, 'Failed to unfollow') };
    }
    return response.json();
  }

  // ----------------------------------------------------------------
  // Followers / Following
  // ----------------------------------------------------------------

  /**
   * Get a user's followers.
   */
  async getFollowers(username: string): Promise<FollowUser[]> {
    const response = await fetch(
      `${API_BASE}/api/profiles/${encodeURIComponent(username)}/followers`,
      { headers: this.getPublicHeaders() },
    );
    if (!response.ok) throw new Error('Failed to fetch followers');
    const data = await response.json();
    return data.followers ?? [];
  }

  /**
   * Get list of users a user is following.
   */
  async getFollowing(username: string): Promise<FollowUser[]> {
    const response = await fetch(
      `${API_BASE}/api/profiles/${encodeURIComponent(username)}/following`,
      { headers: this.getPublicHeaders() },
    );
    if (!response.ok) throw new Error('Failed to fetch following');
    const data = await response.json();
    return data.following ?? [];
  }
}

export const profileApi = new ProfileApi();
