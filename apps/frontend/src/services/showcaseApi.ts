/**
 * Showcase API Service
 * Handles all showcase gallery API calls including upvotes, filtering, and remix.
 */
import { API_ENDPOINTS } from '@/config/apiEndpoints';
import { authService } from '@/services/authService';
import { extractApiError } from '@/utils/extractErrorMessage';

// ============================================================================
// Types
// ============================================================================

export interface ShowcaseDeck {
  id: string;
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
  upvoteCount: number;
  isFeatured: boolean;
  hasUpvoted: boolean;
  approvedAt?: string;
  submittedAt?: string;
}

export interface ShowcaseListResponse {
  decks: ShowcaseDeck[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ShowcaseFilters {
  category?: string;
  sort?: 'trending' | 'newest' | 'most_popular' | 'most_remixed';
  tab?: 'featured' | 'trending' | 'new';
  search?: string;
  limit?: number;
  offset?: number;
}

export interface UpvoteResponse {
  success: boolean;
  upvoted: boolean;
  upvoteCount: number;
}

export interface RemixResponse {
  success: boolean;
  deckUuid: string;
  deckName: string;
}

// ============================================================================
// Service
// ============================================================================

class ShowcaseApiService {
  private getBaseUrl(): string {
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

  private getOptionalAuthHeaders(): HeadersInit {
    const token = authService.getAuthToken();
    if (token) {
      return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };
    }
    return { 'Content-Type': 'application/json' };
  }

  private transformDeck(deck: any): ShowcaseDeck {
    return {
      id: deck.id,
      title: deck.title,
      description: deck.description,
      category: deck.category,
      tags: deck.tags || [],
      slideCount: deck.slide_count || 0,
      firstSlide: deck.first_slide,
      thumbnailUrl: deck.thumbnail_url || null,
      authorName: deck.author_name,
      remixCount: deck.remix_count || 0,
      viewCount: deck.view_count || 0,
      upvoteCount: deck.upvote_count || 0,
      isFeatured: deck.is_featured || false,
      hasUpvoted: deck.has_upvoted || false,
      approvedAt: deck.approved_at,
      submittedAt: deck.submitted_at,
    };
  }

  // --------------------------------------------------------------------------
  // Showcase Listing
  // --------------------------------------------------------------------------

  /**
   * Get showcase decks with filtering, sorting, and pagination
   */
  async getShowcase(filters: ShowcaseFilters = {}): Promise<ShowcaseListResponse> {
    const params = new URLSearchParams();
    if (filters.category) params.set('category', filters.category);
    if (filters.sort) params.set('sort', filters.sort);
    if (filters.tab) params.set('tab', filters.tab);
    if (filters.search) params.set('search', filters.search);
    if (filters.limit) params.set('limit', filters.limit.toString());
    if (filters.offset !== undefined) params.set('offset', filters.offset.toString());

    const url = `${this.getBaseUrl()}/api/community/showcase?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getOptionalAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch showcase');
    }

    const data = await response.json();
    return {
      decks: (data.decks || []).map((d: any) => this.transformDeck(d)),
      total: data.total || 0,
      limit: data.limit || 12,
      offset: data.offset || 0,
      hasMore: data.has_more || false,
    };
  }

  /**
   * Get top 5 most upvoted this week
   */
  async getWeeklyTop(): Promise<ShowcaseDeck[]> {
    const url = `${this.getBaseUrl()}/api/community/showcase/weekly-top`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getOptionalAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch weekly top');
    }

    const data = await response.json();
    return (data || []).map((d: any) => this.transformDeck(d));
  }

  // --------------------------------------------------------------------------
  // Upvotes
  // --------------------------------------------------------------------------

  /**
   * Toggle upvote on a deck (upvote if not upvoted, remove if already upvoted)
   */
  async toggleUpvote(deckId: string): Promise<UpvoteResponse> {
    const url = `${this.getBaseUrl()}/api/community/${deckId}/upvote`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('AUTH_REQUIRED');
      }
      throw new Error('Failed to toggle upvote');
    }

    const data = await response.json();
    return {
      success: data.success,
      upvoted: data.upvoted,
      upvoteCount: data.upvote_count,
    };
  }

  /**
   * Check if current user has upvoted a specific deck
   */
  async getUpvoteStatus(deckId: string): Promise<boolean> {
    const url = `${this.getBaseUrl()}/api/community/${deckId}/upvote-status`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.has_upvoted || false;
  }

  // --------------------------------------------------------------------------
  // Remix
  // --------------------------------------------------------------------------

  /**
   * Remix (duplicate) a deck to user's account
   */
  async remixDeck(deckId: string): Promise<RemixResponse> {
    const url = `${this.getBaseUrl()}/api/community/decks/${deckId}/remix`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('AUTH_REQUIRED');
      }
      const error = await response.json().catch(() => ({}));
      throw new Error(extractApiError(error.detail, 'Failed to remix deck'));
    }

    const data = await response.json();
    return {
      success: data.success,
      deckUuid: data.deck_uuid,
      deckName: data.deck_name,
    };
  }

  // --------------------------------------------------------------------------
  // Submit
  // --------------------------------------------------------------------------

  /**
   * Submit a presentation to the showcase
   */
  async submitToShowcase(data: {
    deckUuid: string;
    title: string;
    description?: string;
    category: string;
    tags: string[];
  }): Promise<{ submissionId: string }> {
    const url = `${this.getBaseUrl()}/api/community/submit`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        deck_uuid: data.deckUuid,
        title: data.title,
        description: data.description,
        category: data.category,
        tags: data.tags,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('AUTH_REQUIRED');
      }
      const error = await response.json().catch(() => ({}));
      throw new Error(extractApiError(error.detail, 'Failed to submit to showcase'));
    }

    const result = await response.json();
    return { submissionId: result.submission_id };
  }
}

export const showcaseApi = new ShowcaseApiService();
