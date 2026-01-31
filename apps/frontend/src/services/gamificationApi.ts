/**
 * Gamification API Service
 *
 * Handles all gamification-related API calls:
 * - Badge queries and checks
 * - Streak tracking
 * - Leaderboard data
 */

import { authService } from './authService';
import { extractApiError } from '@/utils/extractErrorMessage';

const rawApiBase = import.meta.env.VITE_API_URL || '';
const API_BASE = rawApiBase.replace(/\/api\/?$/, '');

// ============================================================================
// Types
// ============================================================================

export interface BadgeDefinition {
  badge_type: string;
  name: string;
  description: string;
  credits: number;
  icon: string;
  category: string;
  earned: boolean;
  earned_at: string | null;
}

export interface EarnedBadge {
  id: string;
  badge_type: string;
  earned_at: string;
  credits_awarded: number;
  name: string;
  description: string;
  icon: string;
  category: string;
}

export interface BadgesResponse {
  earned: EarnedBadge[];
  all_badges: BadgeDefinition[];
  total_earned: number;
  total_available: number;
}

export interface CheckBadgesResponse {
  newly_awarded: EarnedBadge[];
  count: number;
}

export interface StreakData {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  streak_credits_claimed: Record<string, string>;
  next_milestone?: number | null;
  next_milestone_credits?: number;
  days_until_next?: number | null;
}

export interface CheckInResponse extends StreakData {
  is_new_day: boolean;
  newly_awarded_badges: EarnedBadge[];
}

export interface ClaimRewardResponse {
  success: boolean;
  credits_awarded?: number;
  milestone?: number;
  error?: string;
}

export interface LeaderboardEntry {
  rank: number;
  id: number;
  deck_uuid: string;
  title: string;
  description: string | null;
  category: string;
  tags: string[];
  slide_count: number;
  first_slide: any | null;
  thumbnail_url: string | null;
  author_name: string;
  view_count: number;
  remix_count: number;
  upvote_count: number;
  is_featured: boolean;
  approved_at: string | null;
  score: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  period: string;
  metric: string;
}

// ============================================================================
// API Client
// ============================================================================

class GamificationApi {
  private getHeaders(): Record<string, string> {
    let token: string | null = null;
    try {
      token = authService.getAuthToken();
    } catch (e) {
      console.warn('[GamificationApi] Failed to get auth token:', e);
    }
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private async safeJsonParse<T>(response: Response): Promise<T> {
    const text = await response.text();
    if (!text || !text.trim()) throw new Error('Empty response');
    return JSON.parse(text);
  }

  // ------ Badges ------

  async getBadges(): Promise<BadgesResponse> {
    const response = await fetch(`${API_BASE}/api/gamification/badges`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch badges');
    return this.safeJsonParse(response);
  }

  async checkBadges(): Promise<CheckBadgesResponse> {
    const response = await fetch(`${API_BASE}/api/gamification/check-badges`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to check badges');
    return this.safeJsonParse(response);
  }

  // ------ Streak ------

  async getStreak(): Promise<StreakData> {
    const response = await fetch(`${API_BASE}/api/gamification/streak`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch streak');
    return this.safeJsonParse(response);
  }

  async checkIn(): Promise<CheckInResponse> {
    const response = await fetch(`${API_BASE}/api/gamification/streak/check-in`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to check in');
    return this.safeJsonParse(response);
  }

  async claimStreakReward(milestone: number): Promise<ClaimRewardResponse> {
    const response = await fetch(`${API_BASE}/api/gamification/streak/claim/${milestone}`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const errorData = await this.safeJsonParse<{ detail?: string }>(response);
      throw new Error(extractApiError(errorData.detail, 'Failed to claim reward'));
    }
    return this.safeJsonParse(response);
  }

  // ------ Status ------

  async getStatus(): Promise<{ enabled: boolean }> {
    const response = await fetch(`${API_BASE}/api/gamification/status`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch gamification status');
    return this.safeJsonParse(response);
  }

  // ------ Leaderboard ------

  async getLeaderboard(
    period: 'weekly' | 'all_time' = 'weekly',
    metric: 'views' | 'remixes' = 'views',
    limit: number = 10,
  ): Promise<LeaderboardResponse> {
    const params = new URLSearchParams({
      period,
      metric,
      limit: String(limit),
    });
    const response = await fetch(`${API_BASE}/api/gamification/leaderboard?${params}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch leaderboard');
    return this.safeJsonParse(response);
  }
}

export const gamificationApi = new GamificationApi();
