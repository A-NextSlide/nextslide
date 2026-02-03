/**
 * Community Slides Service
 * Handles all community-related API calls
 */
import { API_ENDPOINTS } from '@/config/apiEndpoints';
import { authService } from '@/services/authService';
import { extractApiError } from '@/utils/extractErrorMessage';

// ============================================================================
// Types
// ============================================================================

export interface CommunityDeck {
  id: string;
  deckUuid?: string;
  title: string;
  description?: string;
  category: string;
  tags: string[];
  slideCount: number;
  firstSlide?: any;
  thumbnailUrl?: string | null;
  authorName?: string;
  remixCount: number;
  viewCount: number;
  approvedAt?: string;
  submittedAt?: string;
}

export interface CommunityDeckDetail extends CommunityDeck {
  slides: any[];
  theme?: any;
}

export interface CommunityDecksResponse {
  decks: CommunityDeck[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface CommunityFilters {
  search?: string;
  category?: string;
  tag?: string;
  page?: number;
  limit?: number;
}

export interface SubmitRequest {
  deckUuid: string;
  title: string;
  description?: string;
  category: 'business' | 'education' | 'marketing' | 'creative' | 'technology' | 'personal';
  tags: string[];
}

export interface CommunitySubmission {
  id: string;
  deckUuid: string;
  title: string;
  description?: string;
  category: string;
  tags: string[];
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  submittedAt: string;
  reviewedAt?: string;
}

export interface CategoryCount {
  name: string;
  displayName: string;
  count: number;
}

export interface SubmissionStatus {
  submitted: boolean;
  id?: string;
  status?: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  submittedAt?: string;
  reviewedAt?: string;
}

// Category display names, colors, and icons
export const COMMUNITY_CATEGORIES = {
  business: { name: 'Business', color: '#3B82F6', gradient: 'from-blue-500 to-cyan-400', icon: 'Briefcase' },
  education: { name: 'Education', color: '#10B981', gradient: 'from-emerald-500 to-teal-400', icon: 'GraduationCap' },
  marketing: { name: 'Marketing', color: '#F59E0B', gradient: 'from-amber-500 to-orange-400', icon: 'Megaphone' },
  creative: { name: 'Creative', color: '#EC4899', gradient: 'from-pink-500 to-rose-400', icon: 'Palette' },
  technology: { name: 'Technology', color: '#8B5CF6', gradient: 'from-violet-500 to-purple-400', icon: 'Cpu' },
  personal: { name: 'Personal', color: '#6366F1', gradient: 'from-indigo-500 to-blue-400', icon: 'Heart' },
} as const;

// ============================================================================
// Service
// ============================================================================

class CommunityService {
  private getBaseUrl(): string {
    // Use the same base URL pattern as other services
    return API_ENDPOINTS.BASE_URL.replace('/api', '');
  }

  private getAuthHeaders(): HeadersInit {
    const token = authService.getAuthToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private getPublicHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
    };
  }

  // --------------------------------------------------------------------------
  // Public Endpoints (No Auth Required)
  // --------------------------------------------------------------------------

  /**
   * Get list of approved community decks
   */
  async getDecks(filters: CommunityFilters = {}): Promise<CommunityDecksResponse> {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.category) params.set('category', filters.category);
    if (filters.tag) params.set('tag', filters.tag);
    if (filters.page) params.set('page', filters.page.toString());
    if (filters.limit) params.set('limit', filters.limit.toString());

    const url = `${this.getBaseUrl()}/api/community/decks?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getPublicHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch community decks');
    }

    const data = await response.json();
    return {
      decks: (data.decks || []).map(this.transformDeck),
      total: data.total || 0,
      page: data.page || 1,
      limit: data.limit || 12,
      hasMore: data.has_more || false,
    };
  }

  /**
   * Get a single community deck with full slides
   */
  async getDeckById(id: string): Promise<CommunityDeckDetail> {
    const url = `${this.getBaseUrl()}/api/community/decks/${id}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getPublicHeaders(),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Community deck not found');
      }
      throw new Error('Failed to fetch community deck');
    }

    const data = await response.json();
    return {
      ...this.transformDeck(data),
      slides: data.slides || [],
      theme: data.theme,
    };
  }

  /**
   * Get category list with counts
   */
  async getCategories(): Promise<CategoryCount[]> {
    const url = `${this.getBaseUrl()}/api/community/categories`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getPublicHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch categories');
    }

    const data = await response.json();
    return (data || []).map((cat: any) => ({
      name: cat.name,
      displayName: cat.display_name,
      count: cat.count,
    }));
  }

  // --------------------------------------------------------------------------
  // Authenticated User Endpoints
  // --------------------------------------------------------------------------

  /**
   * Submit a deck to the community
   */
  async submitDeck(request: SubmitRequest): Promise<{ submissionId: string }> {
    const url = `${this.getBaseUrl()}/api/community/submit`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        deck_uuid: request.deckUuid,
        title: request.title,
        description: request.description,
        category: request.category,
        tags: request.tags,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractApiError(error.detail, 'Failed to submit deck'));
    }

    const data = await response.json();
    return { submissionId: data.submission_id };
  }

  /**
   * Remix (duplicate) a community deck to user's account
   */
  async remixDeck(id: string): Promise<{ deckUuid: string; deckName: string }> {
    const url = `${this.getBaseUrl()}/api/community/decks/${id}/remix`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractApiError(error.detail, 'Failed to remix deck'));
    }

    const data = await response.json();
    return {
      deckUuid: data.deck_uuid,
      deckName: data.deck_name,
    };
  }

  /**
   * Get user's own submissions
   */
  async getMySubmissions(): Promise<CommunitySubmission[]> {
    const url = `${this.getBaseUrl()}/api/community/my-submissions`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch submissions');
    }

    const data = await response.json();
    return (data || []).map((sub: any) => ({
      id: sub.id,
      deckUuid: sub.deck_uuid,
      title: sub.title,
      description: sub.description,
      category: sub.category,
      tags: sub.tags || [],
      status: sub.status,
      rejectionReason: sub.rejection_reason,
      submittedAt: sub.submitted_at,
      reviewedAt: sub.reviewed_at,
    }));
  }

  /**
   * Withdraw a pending submission
   */
  async withdrawSubmission(id: string): Promise<void> {
    const url = `${this.getBaseUrl()}/api/community/submissions/${id}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractApiError(error.detail, 'Failed to withdraw submission'));
    }
  }

  /**
   * Check if a deck has been submitted to the community
   */
  async getSubmissionStatus(deckUuid: string): Promise<SubmissionStatus> {
    const url = `${this.getBaseUrl()}/api/community/submission-status/${deckUuid}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to check submission status');
    }

    const data = await response.json();
    if (!data.submitted) {
      return { submitted: false };
    }

    return {
      submitted: true,
      id: data.id,
      status: data.status,
      rejectionReason: data.rejection_reason,
      submittedAt: data.submitted_at,
      reviewedAt: data.reviewed_at,
    };
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  private transformDeck(deck: any): CommunityDeck {
    const deckUuid: string | undefined = deck.deck_uuid || undefined;

    // Resolve thumbnail: prefer API value, then construct from bucket path
    let thumbnailUrl: string | null = deck.thumbnail_url || null;
    if (!thumbnailUrl && deckUuid) {
      const base = import.meta.env.VITE_SUPABASE_URL || 'https://auth.nextslide.ai';
      thumbnailUrl = `${base}/storage/v1/object/public/thumbnails/thumbnails/${deckUuid}_s0.png`;
    }

    return {
      id: deck.id,
      deckUuid,
      title: deck.title,
      description: deck.description,
      category: deck.category,
      tags: deck.tags || [],
      slideCount: deck.slide_count || 0,
      firstSlide: deck.first_slide,
      thumbnailUrl,
      authorName: deck.author_name,
      remixCount: deck.remix_count || 0,
      viewCount: deck.view_count || 0,
      approvedAt: deck.approved_at,
      submittedAt: deck.submitted_at,
    };
  }
}

export const communityService = new CommunityService();
