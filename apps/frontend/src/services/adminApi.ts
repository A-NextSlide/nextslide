import { supabase } from '@/integrations/supabase/client';
import { API_CONFIG } from '@/config/environment';

// Types
export interface UserSummary {
  id: string;
  email: string;
  fullName?: string;
  createdAt: string;
  lastActive?: string;
  deckCount: number;
  storageUsed: number;
  status: 'active' | 'suspended' | 'deleted';
  role: 'user' | 'admin' | 'super_admin';
  isAdmin: boolean;
  emailVerified: boolean;
}

export interface UserStats {
  totalActive: number;
  newThisWeek: number;
  adminCount: number;
  verifiedCount: number;
}

export interface GetUsersResponse {
  users: UserSummary[];
  total: number;
  page: number;
  totalPages: number;
  stats: UserStats;
}

export interface UserDetail {
  user: {
    id: string;
    email: string;
    emailConfirmedAt?: string;
    fullName?: string;
    avatarUrl?: string;
    createdAt: string;
    updatedAt: string;
    lastSignInAt?: string;
    provider: 'email' | 'google';
    role: string;
    status: string;
    metadata: Record<string, any>;
  };
  metrics: {
    totalDecks: number;
    publicDecks: number;
    privateDecks: number;
    totalSlides: number;
    storageUsed: number;
    collaborations: number;
    lastActiveAt: string;
    averageSessionDuration: number;
    totalSessions: number;
    loginCount: number;
  };
  recentActivity: Activity[];
}

export interface Activity {
  id: string;
  type: string;
  details: Record<string, any>;
  createdAt: string;
}

export interface DeckSummary {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  slideCount: number;
  createdAt: string;
  updatedAt: string;
  lastModified: string;
  visibility: 'private' | 'public' | 'unlisted';
  thumbnailUrl?: string;
  size: {
    width: number;
    height: number;
    totalBytes?: number;
  };
  sharing: {
    isShared: boolean;
    sharedWith: number;
    shareType?: 'view' | 'edit';
  };
  analytics: {
    viewCount: number;
    editCount: number;
    shareCount: number;
  };
  // Added for thumbnail rendering
  slides?: any[];
  first_slide?: any;
  // User info
  userId: string;
  userEmail: string;
  userFullName: string;
}

export interface AnalyticsOverview {
  users: {
    total: number;
    active24h: number;
    active7d: number;
    active30d: number;
    growthRate: number;
    newToday: number;
    newThisWeek: number;
    newThisMonth: number;
  };
  decks: {
    total: number;
    createdToday: number;
    createdThisWeek: number;
    createdThisMonth: number;
    averagePerUser: number;
    totalSlides: number;
    averageSlidesPerDeck: number;
  };
  storage: {
    totalUsed: number;
    averagePerUser: number;
    averagePerDeck: number;
  };
  collaboration: {
    activeSessions: number;
    totalCollaborations: number;
    averageCollaboratorsPerDeck: number;
  };
  activity: {
    loginsToday: number;
    apiCallsToday: number;
    errorRate: number;
  };
}

class AdminApi {
  private baseUrl: string;

  constructor() {
    // Use dedicated admin API if provided; otherwise use the centralized app API base
    const env: any = (import.meta as any).env || {};
    const fallback = API_CONFIG.BASE_URL; // '/api' in dev (proxied to 9090), prod absolute
    this.baseUrl = (env.VITE_ADMIN_API_URL || fallback).replace(/\/$/, '');
  }

  // Helper to get auth token
  private async getAuthToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  }

  // Helper to make authenticated requests
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // First attempt with current token
    const token = await this.getAuthToken();
    if (!token) {
      throw new Error('No authentication token available');
    }
    if (import.meta.env.DEV && endpoint.startsWith('/admin')) {
      const method = (options.method || 'GET').toString().toUpperCase();
      console.log(`[AdminApi] ${method} ${this.baseUrl}${endpoint}`);
    }
    const makeFetch = (bearer: string) => fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${bearer}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    let response = await makeFetch(token);
    if (import.meta.env.DEV && endpoint.startsWith('/admin')) {
      console.log(`[AdminApi] Response ${response.status} ${response.statusText} for ${endpoint}`);
    }
    if (response.status === 401) {
      // Attempt refresh once
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data.session?.access_token) {
        response = await makeFetch(data.session.access_token);
        if (import.meta.env.DEV && endpoint.startsWith('/admin')) {
          console.log(`[AdminApi] Retry after refresh -> ${response.status} ${response.statusText} for ${endpoint}`);
        }
      }
    }

    if (response.status === 401) {
      // Final fallback: force logout so app can re-auth cleanly
      try { await supabase.auth.signOut(); } catch {}
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      let errorPayload: any = null;
      try {
        errorPayload = await response.json();
      } catch (e) {
        const textError = await response.text();
        throw new Error(`API Error (${response.status}): ${textError}`);
      }
      const errorMessage = errorPayload?.detail?.message || errorPayload?.error_description || errorPayload?.message || 'Unknown API error';
      const customError: any = new Error(`API Error (${response.status}): ${errorMessage}`);
      customError.response = { data: errorPayload };
      throw customError;
    }

    return response.json();
  }

  // Check if current user has admin access
  async checkAdminAccess(): Promise<{ isAdmin: boolean; role: string }> {
    try {
      const raw = await this.request<any>('/admin/check');
      // Normalize different possible response shapes
      const role: string | undefined = raw?.role || raw?.user?.role || raw?.data?.role;
      const isAdminFlag: boolean = Boolean(
        raw?.isAdmin === true ||
        raw?.is_admin === true ||
        (role && (role === 'admin' || role === 'super_admin' || role === 'superadmin'))
      );
      const normalized = { isAdmin: isAdminFlag, role: role || (isAdminFlag ? 'admin' : 'user') };
      if (import.meta.env.DEV) {
        console.log('[AdminApi] Normalized admin check:', normalized, 'raw:', raw);
      }
      return normalized;
    } catch (error) {
      console.error('Error checking admin access:', error);
      return { isAdmin: false, role: 'user' };
    }
  }

  // Get all users with pagination and filters
  async getUsers(params?: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<GetUsersResponse> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.search) queryParams.append('search', params.search);
      // Map frontend field names to database column names
      const sortFieldMap: Record<string, string> = {
        'createdAt': 'created_at',
        'lastActiveAt': 'last_active_at',
        'email': 'email',
        'role': 'role'
      };
      
      if (params?.sortBy) {
        const dbField = sortFieldMap[params.sortBy] || params.sortBy;
        queryParams.append('sort_by', dbField);
      }
      if (params?.sortOrder) queryParams.append('sort_order', params.sortOrder);

      const response = await this.request<any>(`/admin/users?${queryParams.toString()}`);
      
      // Map backend response to our frontend interface
      const users: UserSummary[] = response.users.map((user: any) => ({
        id: user.id,
        email: user.email,
        fullName: user.fullName || user.full_name, // Handle both field names
        createdAt: user.createdAt || user.created_at,
        lastActive: user.lastActive || user.last_active || user.updated_at,
        deckCount: user.deckCount || user.total_decks || 0,
        storageUsed: user.storageUsed || user.storage_used || 0,
        status: user.status || 'active',
        role: user.role || 'user',
        isAdmin: user.isAdmin || user.is_admin || user.role === 'admin',
        emailVerified: user.emailVerified || user.email_verified || false,
      }));

      // Map stats from backend response
      const stats: UserStats = response.stats ? {
        totalActive: response.stats.totalActive || 0,
        newThisWeek: response.stats.newThisWeek || 0,
        adminCount: response.stats.adminCount || 0,
        verifiedCount: response.stats.verifiedCount || 0,
      } : {
        totalActive: 0,
        newThisWeek: 0,
        adminCount: 0,
        verifiedCount: 0,
      };

      return {
        users,
        total: response.total,
        page: response.page,
        totalPages: response.totalPages || Math.ceil(response.total / (params?.limit || 20)),
        stats,
      };
    } catch (error) {
      console.error('Error fetching users:', error);
      // Return empty data on error
      return {
        users: [],
        total: 0,
        page: 1,
        totalPages: 0,
        stats: {
          totalActive: 0,
          newThisWeek: 0,
          adminCount: 0,
          verifiedCount: 0,
        },
      };
    }
  }

    // Get user details
  async getUserDetail(userId: string): Promise<UserDetail> {
    try {
      const response = await this.request<any>(`/admin/users/${userId}`);
      console.log('API Response for getUserDetail:', response);

      if (!response || !response.id) {
        throw new Error('User data not found in API response');
      }

      // The API returns a flat user object. We need to structure it as a UserDetail object.
      return {
        user: {
          id: response.id,
          email: response.email,
          emailConfirmedAt: response.emailConfirmedAt,
          fullName: response.fullName,
          avatarUrl: response.avatarUrl,
          createdAt: response.createdAt,
          updatedAt: response.updatedAt,
          lastSignInAt: response.lastSignInAt,
          provider: response.provider,
          role: response.role,
          status: response.status,
          metadata: response.metadata || {},
        },
        // Metrics and recentActivity may not be part of this specific endpoint response,
        // so we provide default values.
        metrics: response.metrics || {
          totalDecks: 0,
          publicDecks: 0,
          privateDecks: 0,
          totalSlides: 0,
          storageUsed: 0,
          collaborations: 0,
          lastActiveAt: response.lastSignInAt,
          averageSessionDuration: 0,
          totalSessions: 0,
          loginCount: 0,
        },
        recentActivity: response.recentActivity || [],
      };
    } catch (error) {
      console.error('Error fetching user detail:', error);
      throw error;
    }
  }

  // Get user's decks
  async getUserDecks(
    userId: string,
    params?: {
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<{ decks: DeckSummary[]; total: number; page: number; totalPages: number }> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.sortBy) queryParams.append('sort_by', params.sortBy);
      if (params?.sortOrder) queryParams.append('sort_order', params.sortOrder);

      const response = await this.request<any>(`/admin/users/${userId}/decks?${queryParams.toString()}`);
      
      // Map backend response to our frontend interface
      const decks: DeckSummary[] = response.decks.map((deck: any) => ({
        id: deck.id,
        uuid: deck.uuid || deck.id,
        name: deck.name,
        description: deck.description,
        slideCount: deck.slideCount || deck.slide_count || (deck.slides ? deck.slides.length : 0),
        createdAt: deck.createdAt || deck.created_at,
        updatedAt: deck.updatedAt || deck.updated_at,
        lastModified: deck.lastModified || deck.last_modified,
        visibility: deck.visibility,
        thumbnailUrl: deck.thumbnailUrl,
        size: deck.size || { width: 1920, height: 1080 },
        sharing: deck.sharing || {
          isShared: false,
          sharedWith: 0,
          shareType: undefined,
        },
        analytics: deck.analytics || {
          viewCount: 0,
          editCount: 0,
          shareCount: 0,
        },
        // Preserve slides and first_slide for thumbnail rendering
        slides: deck.slides,
        first_slide: deck.first_slide,
        // User info
        userId: deck.user_id || deck.userId,
        userEmail: deck.userEmail || deck.user_email,
        userFullName: deck.userFullName || deck.user_full_name,
      }));

      return {
        decks,
        total: response.total || 0,
        page: response.page || params?.page || 1,
        totalPages: response.totalPages || 0,
      };
    } catch (error) {
      console.error('Error fetching user decks:', error);
      return { decks: [], total: 0, page: 1, totalPages: 0 };
    }
  }

  // Get all decks
  async getAllDecks(params?: {
    page?: number;
    limit?: number;
    search?: string;
    userId?: string;
    visibility?: string;
  }): Promise<{ decks: DeckSummary[]; total: number; page: number; totalPages: number }> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.search) queryParams.append('search', params.search);
      if (params?.userId) queryParams.append('user_id', params.userId);
      if (params?.visibility) queryParams.append('visibility', params.visibility);

      const response = await this.request<any>(`/admin/decks?${queryParams.toString()}`);
      
      // Map backend response to our frontend interface
      const decks: DeckSummary[] = response.decks.map((deck: any) => ({
        id: deck.id,
        uuid: deck.uuid || deck.id,
        name: deck.name,
        description: deck.description,
        slideCount: deck.slideCount || deck.slide_count || (deck.slides ? deck.slides.length : 0),
        createdAt: deck.createdAt || deck.created_at,
        updatedAt: deck.updatedAt || deck.updated_at,
        lastModified: deck.lastModified || deck.last_modified,
        visibility: deck.visibility,
        thumbnailUrl: deck.thumbnailUrl,
        size: deck.size || { width: 1920, height: 1080 },
        sharing: deck.sharing || {
          isShared: false,
          sharedWith: 0,
          shareType: undefined,
        },
        analytics: deck.analytics || {
          viewCount: 0,
          editCount: 0,
          shareCount: 0,
        },
        // Preserve slides and first_slide for thumbnail rendering
        slides: deck.slides,
        first_slide: deck.first_slide,
        // User info
        userId: deck.user_id || deck.userId,
        userEmail: deck.userEmail || deck.user_email,
        userFullName: deck.userFullName || deck.user_full_name,
      }));

      return {
        decks,
        total: response.total || 0,
        page: response.page || params?.page || 1,
        totalPages: response.totalPages || 0,
      };
    } catch (error) {
      console.error('Error fetching all decks:', error);
      return { decks: [], total: 0, page: 1, totalPages: 0 };
    }
  }

  // Get user trends for the past week (legacy)
  async getUserTrends(): Promise<Array<{ date: string; signups: number; logins: number }>> {
    try {
      const response = await this.request<any>('/admin/analytics/user-trends');
      return response.trends || [];
    } catch (error) {
      console.error('Error fetching user trends:', error);
      return [];
    }
  }

  // Get deck creation trends for the past week (legacy)
  async getDeckTrends(): Promise<Array<{ date: string; created: number }>> {
    try {
      const response = await this.request<any>('/admin/analytics/deck-trends');
      return response.trends || [];
    } catch (error) {
      console.error('Error fetching deck trends:', error);
      return [];
    }
  }

  // Get analytics overview (legacy)
  async getAnalyticsOverview(): Promise<AnalyticsOverview> {
    try {
      return await this.request<AnalyticsOverview>('/admin/analytics/overview');
    } catch (error) {
      console.error('Error fetching analytics overview:', error);
      return {
        users: { total: 0, active24h: 0, active7d: 0, active30d: 0, growthRate: 0, newToday: 0, newThisWeek: 0, newThisMonth: 0 },
        decks: { total: 0, createdToday: 0, createdThisWeek: 0, createdThisMonth: 0, averagePerUser: 0, totalSlides: 0, averageSlidesPerDeck: 0 },
        storage: { totalUsed: 0, averagePerUser: 0, averagePerDeck: 0 },
        collaboration: { activeSessions: 0, totalCollaborations: 0, averageCollaboratorsPerDeck: 0 },
        activity: { loginsToday: 0, apiCallsToday: 0, errorRate: 0 },
      };
    }
  }

  // ==================== NEW COMPREHENSIVE ANALYTICS API ====================

  // Get comprehensive overview with date range and comparison
  async getAnalyticsOverviewV2(startDate: string, endDate: string, compare = true): Promise<any> {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate, compare: String(compare) });
    return this.request<any>(`/admin/analytics/overview?${params.toString()}`);
  }

  // Get user time series data
  async getUserTimeseries(
    startDate: string,
    endDate: string,
    granularity: 'hour' | 'day' | 'week' | 'month' = 'day',
    metric: 'signups' | 'logins' | 'active' | 'cumulative' = 'signups'
  ): Promise<any> {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate, granularity, metric });
    return this.request<any>(`/admin/analytics/timeseries/users?${params.toString()}`);
  }

  // Get deck time series data
  async getDeckTimeseries(
    startDate: string,
    endDate: string,
    granularity: 'hour' | 'day' | 'week' | 'month' = 'day',
    metric: 'created' | 'cumulative' | 'slides' = 'created'
  ): Promise<any> {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate, granularity, metric });
    return this.request<any>(`/admin/analytics/timeseries/decks?${params.toString()}`);
  }

  // Get credit time series data
  async getCreditTimeseries(
    startDate: string,
    endDate: string,
    granularity: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<any> {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate, granularity });
    return this.request<any>(`/admin/analytics/timeseries/credits?${params.toString()}`);
  }

  // Get user segments
  async getUserSegments(
    startDate: string,
    endDate: string,
    segmentBy: 'activity' | 'plan' | 'role' | 'signup_source' = 'activity'
  ): Promise<any> {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate, segment_by: segmentBy });
    return this.request<any>(`/admin/analytics/users/segments?${params.toString()}`);
  }

  // Get cohort retention analysis
  async getUserCohorts(
    startDate: string,
    endDate: string,
    cohortSize: 'day' | 'week' | 'month' = 'week'
  ): Promise<any> {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate, cohort_size: cohortSize });
    return this.request<any>(`/admin/analytics/users/cohorts?${params.toString()}`);
  }

  // Get top users by metric
  async getTopUsers(
    startDate: string,
    endDate: string,
    metric: 'decks' | 'credits' | 'logins' | 'shares' = 'decks',
    limit = 20
  ): Promise<any> {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate, metric, limit: String(limit) });
    return this.request<any>(`/admin/analytics/users/top?${params.toString()}`);
  }

  // Get content distribution analytics
  async getContentDistribution(startDate: string, endDate: string): Promise<any> {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    return this.request<any>(`/admin/analytics/content/distribution?${params.toString()}`);
  }

  // Get sharing analytics
  async getSharingAnalytics(startDate: string, endDate: string): Promise<any> {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    return this.request<any>(`/admin/analytics/content/sharing?${params.toString()}`);
  }

  // Get credit breakdown
  async getCreditBreakdown(startDate: string, endDate: string): Promise<any> {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    return this.request<any>(`/admin/analytics/credits/breakdown?${params.toString()}`);
  }

  // Get recent activity feed
  async getRecentActivity(limit = 50): Promise<any> {
    const params = new URLSearchParams({ limit: String(limit) });
    return this.request<any>(`/admin/analytics/activity/recent?${params.toString()}`);
  }

  // Export analytics data
  async exportAnalytics(startDate: string, endDate: string, format: 'json' | 'csv' = 'json'): Promise<any> {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate, format });
    return this.request<any>(`/admin/analytics/export?${params.toString()}`);
  }

  // User actions
  async updateUser(userId: string, updates: {
    status?: 'active' | 'suspended';
    role?: 'user' | 'admin';
    metadata?: Record<string, any>;
  }): Promise<{ success: boolean; user: UserSummary }> {
    try {
      const response = await this.request<any>(`/admin/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      return {
        success: true,
        user: response.user,
      };
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  async performUserAction(userId: string, action: {
    action: 'suspend' | 'reactivate' | 'delete' | 'hard_delete' | 'reset_password' | 'clear_sessions';
    reason?: string;
  }): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const response = await this.request<any>(`/admin/users/${userId}/actions`, {
        method: 'POST',
        body: JSON.stringify(action),
      });
      return {
        success: response.success,
        message: response.message,
        data: response.data,
      };
    } catch (error) {
      console.error('Error performing user action:', error);
      throw error;
    }
  }

  // Deck actions
  async deleteDeck(deckId: string): Promise<{ success: boolean; message: string }> {
    const { error } = await supabase
      .from('decks')
      .delete()
      .eq('id', deckId);

    if (error) throw error;

    return {
      success: true,
      message: 'Deck deleted successfully',
    };
  }

  // ==================== Brand Management ====================

  async getBrands(params?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{ brands: Brand[]; total: number; page: number; totalPages: number }> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.search) queryParams.append('search', params.search);

      const response = await this.request<any>(`/admin/brands?${queryParams.toString()}`);

      return {
        brands: response.brands,
        total: response.total || 0,
        page: response.page || params?.page || 1,
        totalPages: response.totalPages || 0,
      };
    } catch (error) {
      console.error('Error fetching brands:', error);
      return { brands: [], total: 0, page: 1, totalPages: 0 };
    }
  }

  async updateBrand(brandId: string, apiResponse: any): Promise<{ success: boolean; message: string; brand: Brand }> {
    try {
      const response = await this.request<any>(`/admin/brands/${brandId}`, {
        method: 'PUT',
        body: JSON.stringify({ api_response: apiResponse }),
      });

      return response;
    } catch (error) {
      console.error('Error updating brand:', error);
      throw error;
    }
  }

  async deleteBrand(brandId: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.request<any>(`/admin/brands/${brandId}`, {
        method: 'DELETE',
      });

      return response;
    } catch (error) {
      console.error('Error deleting brand:', error);
      throw error;
    }
  }

  async uploadBrandFont(
    brandId: string,
    fontName: string,
    variant: string,
    file: File
  ): Promise<{ success: boolean; message: string; font: any }> {
    try {
      const token = await this.getAuthToken();
      if (!token) throw new Error('Not authenticated');

      const formData = new FormData();
      formData.append('font_name', fontName);
      formData.append('variant', variant);
      formData.append('file', file);

      const response = await fetch(`${this.baseUrl}/admin/brands/${brandId}/fonts/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Error uploading brand font:', error);
      throw error;
    }
  }

  async uploadBrandLogo(
    brandId: string,
    file: File
  ): Promise<{ success: boolean; message: string; logo: { url: string; path: string; size: number } }> {
    try {
      const token = await this.getAuthToken();
      if (!token) throw new Error('Not authenticated');

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${this.baseUrl}/admin/brands/${brandId}/logo/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Logo upload failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Error uploading brand logo:', error);
      throw error;
    }
  }

  async deleteBrandFont(
    brandId: string,
    fontName: string,
    variant: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const encodedFontName = encodeURIComponent(fontName);
      const encodedVariant = encodeURIComponent(variant);
      const response = await this.request<any>(
        `/admin/brands/${brandId}/fonts/${encodedFontName}/${encodedVariant}`,
        { method: 'DELETE' }
      );

      return response;
    } catch (error) {
      console.error('Error deleting brand font:', error);
      throw error;
    }
  }

  async fetchBrandFromBrandfetch(
    identifier: string
  ): Promise<{ success: boolean; message: string; action: string; brand: Brand }> {
    try {
      const response = await this.request<any>('/admin/brands/fetch', {
        method: 'POST',
        body: JSON.stringify({ identifier }),
      });

      return response;
    } catch (error) {
      console.error('Error fetching brand from Brandfetch:', error);
      throw error;
    }
  }

  // ==================== Service Health ====================

  async getServicesHealth(): Promise<ServiceHealthResponse> {
    try {
      return await this.request<ServiceHealthResponse>('/admin/services/health');
    } catch (error) {
      console.error('Error fetching services health:', error);
      throw error;
    }
  }

  async getServicesUsage(): Promise<{ usage: Record<string, any>; checked_at: string }> {
    try {
      return await this.request<any>('/admin/services/usage');
    } catch (error) {
      console.error('Error fetching services usage:', error);
      throw error;
    }
  }

  async getServicesConfig(): Promise<ModelConfigResponse> {
    try {
      return await this.request<ModelConfigResponse>('/admin/services/config');
    } catch (error) {
      console.error('Error fetching services config:', error);
      throw error;
    }
  }

  async getCosts(startDate?: string, endDate?: string): Promise<CostsResponse> {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      const query = params.toString() ? `?${params.toString()}` : '';
      return await this.request<CostsResponse>(`/admin/costs${query}`);
    } catch (error) {
      console.error('Error fetching costs:', error);
      throw error;
    }
  }

  async getCostEstimate(decksPerDay: number = 10, slidesPerDeck: number = 10): Promise<CostEstimateResponse> {
    try {
      return await this.request<CostEstimateResponse>(
        `/admin/costs/estimate?decks_per_day=${decksPerDay}&slides_per_deck=${slidesPerDeck}`
      );
    } catch (error) {
      console.error('Error fetching cost estimate:', error);
      throw error;
    }
  }
}

export interface Brand {
  id: string;
  identifier: string;
  normalized_identifier: string;
  api_response: {
    brand_name?: string;
    domain?: string;
    logos?: any;
    colors?: {
      primary?: Array<{ hex: string; type?: string }>;
      [key: string]: any;
    };
    fonts?: any;
    [key: string]: any;
  };
  success: boolean;
  created_at: string;
  hit_count: number;
  last_accessed_at: string;
}

export interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'down' | 'unknown';
  latency_ms?: number;
  last_checked: string;
  details?: Record<string, any>;
  error?: string;
}

export interface ServiceHealthResponse {
  overall_status: string;
  services: ServiceStatus[];
  checked_at: string;
}

export interface ModelConfig {
  model: string;
  description: string;
  provider?: string;
  enabled?: boolean;
}

export interface ModelConfigResponse {
  models: Record<string, ModelConfig>;
  feature_flags: Record<string, boolean>;
  error?: string;
}

export interface ModelPricing {
  input: number;
  output: number;
  provider: string;
  per_request?: number;
}

export interface ProviderCostInfo {
  source: 'api' | 'estimated' | 'no_api_key' | 'no_admin_key' | 'no_billing_api' | 'api_error' | 'error' | 'unavailable';
  total_usd?: number;
  data?: any[];
  usage?: {
    by_model?: any[];
    total_input_tokens?: number;
    total_output_tokens?: number;
  };
  total_entries?: number;
  note?: string;
  error?: string;
  setup_url?: string;
  console_url?: string;
  estimated?: boolean;
}

export interface CostsResponse {
  period: {
    start: string;
    end: string;
  };
  providers: Record<string, ProviderCostInfo>;
  total_estimated_usd: number;
  data_source: 'api' | 'estimated';
  model_pricing: Record<string, ModelPricing>;
  estimation_note?: string;
  setup_instructions?: Record<string, string>;
}

export interface CostBreakdownItem {
  operation: string;
  model: string;
  provider: string;
  calls_per_month: number;
  cost_usd: number;
}

export interface CostEstimateResponse {
  input: {
    decks_per_day: number;
    slides_per_deck: number;
    decks_per_month: number;
    slides_per_month: number;
  };
  breakdown: CostBreakdownItem[];
  total_monthly_usd: number;
  by_provider: Record<string, number>;
}

export const adminApi = new AdminApi();