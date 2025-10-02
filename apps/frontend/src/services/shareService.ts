import { API_ENDPOINTS } from '@/config/apiEndpoints';
import { authService } from '@/services/authService';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ShareLink {
  id: string;
  short_code: string;
  share_type: 'view' | 'edit';
  full_url: string;
  expires_at: string | null;
  created_at: string;
  access_count?: number;
  last_accessed_at?: string | null;
  is_active?: boolean;
}

export interface CreateShareLinkRequest {
  share_type: 'view' | 'edit';
  expires_in_hours?: number;
  metadata?: Record<string, any>;
}

export interface ShareLinkResponse {
  id: string;
  short_code: string;
  share_type: 'view' | 'edit';
  full_url: string;
  expires_at: string | null;
  created_at: string;
}

export interface PublicDeckResponse {
  deck: any;
  share_info: {
    share_type: 'view' | 'edit';
    accessed_at: string;
  };
  is_editable: boolean;
  access_recorded: boolean;
}

export interface ShareStatistics {
  access_count: number;
  last_accessed_at: string | null;
  created_at: string;
  expires_at: string | null;
}

export interface ShareAnalytics {
  totalViews: number;
  uniqueVisitors: number;
  averageTimeSpent: number; // in seconds
  viewsByDate: { date: string; views: number }[];
  viewsByHour: { hour: number; views: number }[];
  deviceTypes: { desktop: number; mobile: number; tablet: number };
  topLocations: { country: string; city: string; views: number }[];
  slideEngagement: { slideNumber: number; views: number; avgTime: number }[];
  referrers: { source: string; views: number }[];
  recentViews: {
    timestamp: string;
    location: string;
    device: string;
    duration: number;
    slidesViewed: number;
  }[];
}

export interface CollaboratorResponse {
  share_link: ShareLink;
  collaborator_email: string;
  collaborator_exists: boolean;
  invitation_sent?: boolean;
  invitation_error?: string | null;
  user_id?: string | null;
  message: string;
}

class ShareService {
  private getAuthHeaders(): HeadersInit {
    const token = authService.getAuthToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
  }

  async createShareLink(deckUuid: string, request: CreateShareLinkRequest): Promise<ApiResponse<ShareLinkResponse>> {
    try {
      const url = `${API_ENDPOINTS.BASE_URL}/decks/${deckUuid}/share`;
      const body = JSON.stringify(request);
      
      
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body
      });

      const data = await response.json();
      
      console.log('[ShareService] Share link response:', {
        status: response.status,
        data
      });
      
      if (!response.ok) {
        return {
          success: false,
          error: data.error || data.message || 'Failed to create share link'
        };
      }

      return {
        success: true,
        data
      };
    } catch (error) {
      console.error('[ShareService] Error creating share link:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async getShareLinks(deckUuid: string): Promise<ApiResponse<ShareLink[]>> {
    try {
      const url = `${API_ENDPOINTS.BASE_URL}/decks/${deckUuid}/shares`;
      const headers = this.getAuthHeaders();
      
      console.log('[ShareService] Fetching share links:', {
        url,
        hasAuth: !!authService.getAuthToken()
      });
      
      const response = await fetch(url, {
        headers
      });

      const data = await response.json();
      
      console.log('[ShareService] Share links response:', {
        status: response.status,
        data,
        dataType: typeof data,
        isArray: Array.isArray(data),
        hasSharesProperty: data && typeof data === 'object' && 'shares' in data
      });
      
      if (!response.ok) {
        return {
          success: false,
          error: data.error || data.message || 'Failed to fetch share links'
        };
      }

      // Handle different possible response formats
      let shares: ShareLink[] = [];
      
      if (Array.isArray(data)) {
        // Direct array response
        shares = data;
      } else if (data && typeof data === 'object') {
        // Object response - try common property names
        if (Array.isArray(data.shares)) {
          shares = data.shares;
        } else if (Array.isArray(data.share_links)) {
          shares = data.share_links;
        } else if (Array.isArray(data.data)) {
          shares = data.data;
        } else if (Array.isArray(data.items)) {
          shares = data.items;
        } else if (Array.isArray(data.results)) {
          shares = data.results;
        } else {
          // If no array found, log the structure for debugging
          console.warn('[ShareService] Unexpected response structure:', data);
          shares = [];
        }
      }

      return {
        success: true,
        data: shares
      };
    } catch (error) {
      console.error('[ShareService] Error fetching share links:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async revokeShareLink(shareId: string): Promise<ApiResponse<void>> {
    try {
      const response = await fetch(`${API_ENDPOINTS.BASE_URL}/decks/shares/${shareId}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        const data = await response.json();
        return {
          success: false,
          error: data.error || 'Failed to revoke share link'
        };
      }

      return {
        success: true,
        data: undefined
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async getShareStatistics(shareId: string): Promise<ApiResponse<ShareStatistics>> {
    try {
      const response = await fetch(`${API_ENDPOINTS.BASE_URL}/decks/shares/${shareId}/stats`, {
        headers: this.getAuthHeaders()
      });

      const data = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Failed to fetch share statistics'
        };
      }

      return {
        success: true,
        data
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async getShareAnalytics(shareId: string): Promise<ApiResponse<ShareAnalytics>> {
    try {
      const response = await fetch(`${API_ENDPOINTS.BASE_URL}/decks/shares/${shareId}/analytics`, {
        headers: this.getAuthHeaders()
      });

      const data = await response.json();
      
      console.log('[ShareService] Analytics response:', data);
      
      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Failed to fetch share analytics'
        };
      }

      return {
        success: true,
        data
      };
    } catch (error) {
      console.error('[ShareService] Error fetching analytics:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async addCollaborator(deckUuid: string, email: string, permissions: string[] = ['view', 'edit']): Promise<ApiResponse<CollaboratorResponse>> {
    try {
      const response = await fetch(`${API_ENDPOINTS.BASE_URL}/decks/${deckUuid}/collaborators`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ email, permissions })
      });

      const data = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: data.message || data.error || 'Failed to add collaborator'
        };
      }

      return {
        success: true,
        data
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async getCollaborators(deckUuid: string): Promise<ApiResponse<Array<{ user_id: string; email: string; role?: string }>>> {
    try {
      const response = await fetch(`${API_ENDPOINTS.BASE_URL}/decks/${deckUuid}/collaborators`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to list collaborators' } as any;
      }
      return { success: true, data } as any;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      } as any;
    }
  }

  async getPublicDeck(shortCode: string): Promise<ApiResponse<PublicDeckResponse>> {
    try {
      const response = await fetch(`${API_ENDPOINTS.BASE_URL}/public/deck/${shortCode}`);

      const data = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Failed to access shared deck'
        };
      }

      return {
        success: true,
        data
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async duplicatePublicDeck(shortCode: string): Promise<ApiResponse<{ deck_id: string }>> {
    try {
      const response = await fetch(`${API_ENDPOINTS.BASE_URL}/public/deck/${shortCode}/duplicate`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Failed to duplicate deck'
        };
      }

      return {
        success: true,
        data
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  getShareUrl(shortCode: string, shareType: 'view' | 'edit'): string {
    const baseUrl = window.location.origin;
    const path = shareType === 'view' ? `/p/${shortCode}` : `/e/${shortCode}`;
    return `${baseUrl}${path}`;
  }

  async getSharedDecks(filter: 'shared' | 'all' = 'shared'): Promise<ApiResponse<any[]>> {
    try {
      // Build auth endpoint base by stripping trailing /api for environments where auth routes live at root
      const baseForAuth = API_ENDPOINTS.BASE_URL.replace(/\/$/, '').replace(/\/api$/, '');
      const url = `${baseForAuth}/auth/decks?filter=${encodeURIComponent(filter)}`;
      
      console.log('[ShareService] Fetching shared decks:', {
        url,
        filter,
        hasAuth: !!authService.getAuthToken()
      });
      
      const response = await fetch(url, {
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        // Handle errors
        if (response.status === 404 || response.status === 401) {
          console.log('[ShareService] User not authenticated or no shared decks available');
          return {
            success: true,
            data: []
          };
        }
        
        // Try to parse JSON, but handle HTML responses gracefully
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          try {
            const data = await response.json();
            return {
              success: false,
              error: data.error || data.message || 'Failed to fetch shared decks'
            };
          } catch (e) {
            console.error('[ShareService] Failed to parse error response:', e);
          }
        }
        
        return {
          success: false,
          error: `Server error: ${response.status} ${response.statusText}`
        };
      }

      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('[ShareService] Unexpected response type:', contentType);
        return {
          success: false,
          error: 'Invalid response from server. Please try again later.'
        };
      }

      const data = await response.json();
      console.log('[ShareService] Shared decks response:', data);
      
      // Handle different response formats
      const decks = Array.isArray(data) ? data : (data.decks || data.data || []);
      
      return {
        success: true,
        data: decks
      };
    } catch (error) {
      console.error('[ShareService] Error fetching shared decks:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }
}

export const shareService = new ShareService();