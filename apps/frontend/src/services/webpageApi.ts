/**
 * Webpage Publishing API Service
 * Handles all API calls for the presentation-as-webpage publishing feature.
 */
import { API_ENDPOINTS } from '@/config/apiEndpoints';
import { authService } from '@/services/authService';
import { extractApiError } from '@/utils/extractErrorMessage';

// ============================================================================
// Types
// ============================================================================

export interface WebpageSettings {
  show_navigation?: boolean;
  lead_capture_enabled?: boolean;
  auto_scroll?: boolean;
}

export interface PublishedWebpage {
  id: string;
  deck_id: string;
  user_id: string;
  slug: string;
  title: string;
  description?: string;
  slides_data: any[];
  settings: WebpageSettings;
  is_published: boolean;
  view_count: number;
  lead_count: number;
  created_at: string;
  updated_at: string;
}

export interface PublishWebpagePayload {
  deck_id: string;
  slug: string;
  title: string;
  description?: string;
  slides_data: any[];
  settings?: WebpageSettings;
}

export interface UpdateWebpagePayload {
  slug?: string;
  title?: string;
  description?: string;
  settings?: WebpageSettings;
  slides_data?: any[];
}

export interface WebpageLead {
  id: string;
  email: string;
  name?: string;
  created_at: string;
}

export interface SlugCheckResult {
  valid: boolean;
  available?: boolean;
  error?: string;
}

// ============================================================================
// Service
// ============================================================================

class WebpageApiService {
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

  // --------------------------------------------------------------------------
  // Authenticated Endpoints
  // --------------------------------------------------------------------------

  /**
   * Publish a deck as a webpage
   */
  async publishWebpage(payload: PublishWebpagePayload): Promise<{ success: boolean; webpage: PublishedWebpage }> {
    const url = `${this.getBaseUrl()}/api/webpages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractApiError(error.detail, 'Failed to publish webpage'));
    }

    return response.json();
  }

  /**
   * List user's published webpages
   */
  async listWebpages(): Promise<PublishedWebpage[]> {
    const url = `${this.getBaseUrl()}/api/webpages`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch webpages');
    }

    const data = await response.json();
    return data.webpages || [];
  }

  /**
   * Update a webpage's settings
   */
  async updateWebpage(webpageId: string, payload: UpdateWebpagePayload): Promise<{ success: boolean; webpage: PublishedWebpage }> {
    const url = `${this.getBaseUrl()}/api/webpages/${webpageId}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractApiError(error.detail, 'Failed to update webpage'));
    }

    return response.json();
  }

  /**
   * Unpublish a webpage
   */
  async unpublishWebpage(webpageId: string): Promise<{ success: boolean }> {
    const url = `${this.getBaseUrl()}/api/webpages/${webpageId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractApiError(error.detail, 'Failed to unpublish webpage'));
    }

    return response.json();
  }

  /**
   * Get leads for a webpage
   */
  async getLeads(webpageId: string): Promise<WebpageLead[]> {
    const url = `${this.getBaseUrl()}/api/webpages/${webpageId}/leads`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch leads');
    }

    const data = await response.json();
    return data.leads || [];
  }

  /**
   * Check slug availability
   */
  async checkSlug(slug: string): Promise<SlugCheckResult> {
    const url = `${this.getBaseUrl()}/api/webpages/check-slug/${encodeURIComponent(slug)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      return { valid: false, error: 'Failed to check slug' };
    }

    return response.json();
  }

  // --------------------------------------------------------------------------
  // Public Endpoints
  // --------------------------------------------------------------------------

  /**
   * Get a published webpage by slug (public)
   */
  async getWebpageBySlug(slug: string): Promise<PublishedWebpage> {
    const url = `${this.getBaseUrl()}/api/webpages/by-slug/${encodeURIComponent(slug)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getPublicHeaders(),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('WEBPAGE_NOT_FOUND');
      }
      throw new Error('Failed to fetch webpage');
    }

    return response.json();
  }

  /**
   * Record a webpage view (public)
   */
  async recordView(slug: string): Promise<void> {
    const url = `${this.getBaseUrl()}/api/webpages/${encodeURIComponent(slug)}/view`;
    try {
      await fetch(url, {
        method: 'POST',
        headers: this.getPublicHeaders(),
      });
    } catch {
      // Don't throw on view recording failure
    }
  }

  /**
   * Submit a lead (public)
   */
  async submitLead(slug: string, email: string, name?: string): Promise<{ success: boolean }> {
    const url = `${this.getBaseUrl()}/api/webpages/${encodeURIComponent(slug)}/lead`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getPublicHeaders(),
      body: JSON.stringify({ email, name }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractApiError(error.detail, 'Failed to submit'));
    }

    return response.json();
  }
}

export const webpageApi = new WebpageApiService();
