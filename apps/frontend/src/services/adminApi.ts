import { supabase } from '@/integrations/supabase/client';
import { API_CONFIG } from '@/config/environment';
import { extractApiError } from '@/utils/extractErrorMessage';

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
  creditsRemaining: number;
  creditsUsed: number;
  creditsTotal: number;
}

export interface UserStats {
  totalActive: number;
  newThisWeek: number;
  adminCount: number;
  verifiedCount: number;
}

export interface UserCredits {
  user_id: string;
  monthly_credits: number;
  purchased_credits: number;
  used_credits: number;
  remaining_credits: number;
  plan_id: string;
  period_end?: string;
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
        creditsRemaining: user.creditsRemaining ?? 0,
        creditsUsed: user.creditsUsed ?? 0,
        creditsTotal: user.creditsTotal ?? 0,
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

  // Get a single deck with all slides for admin preview
  async getDeckWithSlides(deckId: string): Promise<DeckSummary | null> {
    try {
      const response = await this.request<any>(`/admin/decks/${deckId}/full`);
      if (!response) return null;

      return {
        id: response.id || response.uuid,
        uuid: response.uuid || response.id,
        name: response.name,
        description: response.description,
        slideCount: response.slideCount || response.slide_count || (response.slides ? response.slides.length : 0),
        createdAt: response.createdAt || response.created_at,
        updatedAt: response.updatedAt || response.updated_at,
        lastModified: response.lastModified || response.last_modified,
        visibility: response.visibility,
        thumbnailUrl: response.thumbnailUrl,
        size: response.size || { width: 1920, height: 1080 },
        sharing: response.sharing || { isShared: false, sharedWith: 0, shareType: undefined },
        analytics: response.analytics || { viewCount: 0, editCount: 0, shareCount: 0 },
        slides: response.slides || [],
        first_slide: response.first_slide,
        userId: response.user_id || response.userId,
        userEmail: response.userEmail || response.user_email,
        userFullName: response.userFullName || response.user_full_name,
      };
    } catch (error) {
      console.error('Error fetching deck with slides:', error);
      return null;
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

  // Get user credits
  async getUserCredits(userId: string): Promise<UserCredits> {
    try {
      return await this.request<UserCredits>(`/admin/users/${userId}/credits`);
    } catch (error) {
      console.error('Error fetching user credits:', error);
      throw error;
    }
  }

  // Update user credits
  async updateUserCredits(userId: string, updates: {
    monthly_credits?: number;
    purchased_credits?: number;
    used_credits?: number;
  }): Promise<{ success: boolean; message: string; credits: UserCredits }> {
    try {
      return await this.request<{ success: boolean; message: string; credits: UserCredits }>(
        `/admin/users/${userId}/credits`,
        {
          method: 'PUT',
          body: JSON.stringify(updates),
        }
      );
    } catch (error) {
      console.error('Error updating user credits:', error);
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
        throw new Error(extractApiError(errorData.detail, 'Logo upload failed'));
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

  // ==================== Financial Endpoints ====================

  async getFinancialActuals(startDate: string, endDate: string): Promise<FinancialActualsResponse> {
    try {
      const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
      return await this.request<FinancialActualsResponse>(
        `/admin/analytics/financial/actuals?${params.toString()}`
      );
    } catch (error) {
      console.error('Error fetching financial actuals:', error);
      throw error;
    }
  }

  async getUsagePatterns(startDate: string, endDate: string): Promise<UsagePatternsResponse> {
    try {
      const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
      return await this.request<UsagePatternsResponse>(
        `/admin/analytics/financial/usage-patterns?${params.toString()}`
      );
    } catch (error) {
      console.error('Error fetching usage patterns:', error);
      throw error;
    }
  }

  // ==================== Community Endpoints ====================

  async getCommunityQueue(options: {
    status?: 'pending' | 'approved' | 'rejected';
    category?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<CommunityQueueResponse> {
    try {
      const params = new URLSearchParams();
      if (options.status) params.append('status', options.status);
      if (options.category) params.append('category', options.category);
      if (options.page) params.append('page', options.page.toString());
      if (options.limit) params.append('limit', options.limit.toString());
      const query = params.toString() ? `?${params.toString()}` : '';
      return await this.request<CommunityQueueResponse>(`/community/admin/queue${query}`);
    } catch (error) {
      console.error('Error fetching community queue:', error);
      throw error;
    }
  }

  async approveCommunitySubmission(submissionId: string): Promise<{ success: boolean; message: string }> {
    try {
      return await this.request(`/community/admin/${submissionId}/approve`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('Error approving submission:', error);
      throw error;
    }
  }

  async rejectCommunitySubmission(submissionId: string, reason: string): Promise<{ success: boolean; message: string }> {
    try {
      return await this.request(`/community/admin/${submissionId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    } catch (error) {
      console.error('Error rejecting submission:', error);
      throw error;
    }
  }

  async removeCommunityDeck(submissionId: string): Promise<{ success: boolean; message: string }> {
    try {
      return await this.request(`/community/admin/${submissionId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('Error removing community deck:', error);
      throw error;
    }
  }

  async updateCommunityDeck(
    submissionId: string,
    updates: {
      title?: string;
      description?: string;
      category?: string;
      tags?: string[];
    }
  ): Promise<{ success: boolean; message: string; data: CommunitySubmission }> {
    try {
      return await this.request(`/community/admin/${submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    } catch (error) {
      console.error('Error updating community deck:', error);
      throw error;
    }
  }

  async getCommunityStats(): Promise<CommunityStats> {
    try {
      return await this.request<CommunityStats>('/community/admin/stats');
    } catch (error) {
      console.error('Error fetching community stats:', error);
      throw error;
    }
  }

  // Share Viewers / Leads
  async getShareViewers(params?: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<GetShareViewersResponse> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.search) queryParams.append('search', params.search);
      if (params?.sortBy) queryParams.append('sort_by', params.sortBy);
      if (params?.sortOrder) queryParams.append('sort_order', params.sortOrder);

      const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
      return await this.request<GetShareViewersResponse>(`/admin/share-viewers${query}`);
    } catch (error) {
      console.error('Error fetching share viewers:', error);
      throw error;
    }
  }

  async exportShareViewers(search?: string): Promise<Blob> {
    const token = await this.getAuthToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    const queryParams = new URLSearchParams();
    if (search) queryParams.append('search', search);
    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';

    const response = await fetch(`${this.baseUrl}/admin/share-viewers/export${query}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`);
    }

    return response.blob();
  }

  // ==================== Agent Data Agent ====================

  async agentChat(message: string, sessionId: string): Promise<AgentChatResponse> {
    return this.request<AgentChatResponse>('/admin/agent/chat', {
      method: 'POST',
      body: JSON.stringify({ message, session_id: sessionId }),
    });
  }

  async agentConfirm(sessionId: string, actionId: string): Promise<AgentConfirmResponse> {
    return this.request<AgentConfirmResponse>('/admin/agent/confirm', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, action_id: actionId }),
    });
  }

  async agentCancel(sessionId: string, actionId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/admin/agent/cancel', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, action_id: actionId }),
    });
  }

  async agentSchema(): Promise<any> {
    return this.request<any>('/admin/agent/schema');
  }

  // ==================== Growth Dashboard ====================

  async getGrowthStats(): Promise<GrowthStats> {
    const raw = await this.request<any>('/admin/growth/stats');
    return {
      referrals: {
        total_codes: raw.total_referral_codes ?? 0,
        total_signups: raw.total_referral_signups ?? 0,
        total_activated: raw.activated_referrals ?? 0,
        total_credits: raw.total_referral_credits ?? 0,
      },
      gamification: {
        total_badges_earned: raw.total_badges_earned ?? 0,
        active_streaks: raw.active_streaks ?? 0,
      },
      community: {
        pending: raw.community_pending ?? 0,
        approved: raw.community_approved ?? 0,
        rejected: raw.community_rejected ?? 0,
      },
      notifications: { sent_last_7d: raw.notifications_last_7d ?? 0 },
      pqa: { total_domains: raw.total_pqa_domains ?? 0, pqa_domains: raw.total_pqa_domains ?? 0 },
      viral: { shared_decks: 0, embeds: 0 },
    };
  }

  async getGrowthReferrals(): Promise<GrowthReferrals> {
    const raw = await this.request<any>('/admin/growth/referrals');
    return {
      stats: raw.stats ?? { total_codes: 0, total_signups: 0, total_activated: 0, total_credits: 0 },
      top_referrers: (raw.top_referrers ?? []).map((r: any) => ({
        user_id: r.user_id,
        name: r.full_name || r.email || 'Unknown',
        email: r.email || '',
        referral_count: r.referral_count ?? 0,
        credits_earned: r.credits_earned ?? 0,
      })),
      config: raw.config ?? { enabled: true, referee_signup_credits: 25, referrer_activation_credits: 50 },
    };
  }

  async getGrowthGamification(): Promise<GrowthGamification> {
    const raw = await this.request<any>('/admin/growth/gamification');
    return {
      enabled: raw.enabled ?? true,
      badge_stats: raw.badge_stats ?? {
        total_earned: raw.badges?.total_earned ?? 0,
        by_type: raw.badges?.by_type ?? {},
      },
      badge_config: raw.badge_config ?? raw.badges?.credit_config ?? {},
      streak_stats: raw.streak_stats ?? {
        active_streaks: raw.streaks?.total_active ?? 0,
        avg_streak: raw.streaks?.avg_length ?? 0,
      },
      streak_config: raw.streak_config ?? raw.streaks?.milestone_config ?? {},
      reward_config: raw.reward_config ?? {},
      leaderboard_preview: raw.leaderboard_preview ?? (raw.leaderboard ?? []).map((e: any, i: number) => ({
        name: e.full_name || e.email || 'Unknown',
        score: e.views ?? 0,
        rank: i + 1,
      })),
    };
  }

  async getGrowthNotifications(): Promise<GrowthNotifications> {
    const raw = await this.request<any>('/admin/growth/notifications');
    return {
      stats: raw.stats ?? { total_last_7d: 0, by_type: {} },
      preference_stats: raw.preferences ?? {},
      config: {
        enabled: raw.config?.enabled ?? true,
        view_threshold: raw.config?.view_threshold ?? 5,
        email_on_views: raw.config?.email_on_views ?? true,
        weekly_digest_enabled: raw.config?.weekly_digest_enabled ?? true,
      },
    };
  }

  async updateGrowthConfig(key: string, value: any): Promise<{ success: boolean; key: string; value: any }> {
    return this.request<{ success: boolean; key: string; value: any }>('/admin/growth/config', {
      method: 'PUT',
      body: JSON.stringify({ key, value }),
    });
  }

  async sendTestEmail(email: string, template: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/admin/growth/test-email', {
      method: 'POST',
      body: JSON.stringify({ email, template }),
    });
  }

  async getGrowthPqa(): Promise<GrowthPqa> {
    return this.request<GrowthPqa>('/admin/growth/pqa');
  }

  async getGrowthViral(): Promise<GrowthViral> {
    const raw = await this.request<any>('/admin/growth/viral');
    return {
      stats: {
        shared_decks: raw.stats?.shared_decks ?? 0,
        embeds: raw.stats?.embed_views ?? raw.stats?.embeds ?? 0,
        badge_impressions: raw.stats?.badge_impressions ?? 0,
      },
      config: raw.config ?? { badge_enabled: true, embed_enabled: true, og_previews_enabled: true },
    };
  }

  async broadcastNotification(data: {
    title: string;
    message: string;
    image_url?: string;
    target?: string;
    notification_type?: string;
  }): Promise<{ success: boolean; sent_to: number; title: string }> {
    return this.request<{ success: boolean; sent_to: number; title: string }>('/admin/growth/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getNotificationHistory(page = 1, limit = 50): Promise<NotificationHistoryResponse> {
    return this.request<NotificationHistoryResponse>(`/admin/growth/notifications/history?page=${page}&limit=${limit}`);
  }

  // ==================== Seed / Generator ====================

  async seedGenerate(params: {
    topic: string;
    slides?: number;
    style?: string;
  }): Promise<{ deck_id: string; status: string; message: string }> {
    return this.request('/admin/seed/generate', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async seedBatchGenerate(params: {
    prompts: string[];
    slides?: number;
    style?: string;
  }): Promise<{ count: number; decks: { deck_id: string; topic: string; status: string }[]; message: string }> {
    return this.request('/admin/seed/batch-generate', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async seedStatus(deckUuid: string): Promise<SeedStatusResponse> {
    return this.request<SeedStatusResponse>(`/admin/seed/status/${deckUuid}`);
  }

  async seedPushFeatured(params: {
    deck_uuid: string;
    title?: string;
    description?: string;
    display_order?: number;
  }): Promise<{ success: boolean; message: string; share_url?: string }> {
    return this.request('/admin/seed/push-featured', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async seedPushCommunity(params: {
    deck_uuid: string;
    title?: string;
    description?: string;
    category?: string;
    tags?: string[];
  }): Promise<{ success: boolean; message: string; share_url?: string }> {
    return this.request('/admin/seed/push-community', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async seedCreateShare(deckUuid: string): Promise<{ success: boolean; short_code: string; share_url: string }> {
    return this.request(`/admin/seed/create-share/${deckUuid}`, {
      method: 'POST',
    });
  }

  async seedCleanup(): Promise<{ success: boolean; deleted_count: number; skipped_count: number }> {
    return this.request('/admin/seed/cleanup', {
      method: 'DELETE',
    });
  }

  async seedJobs(): Promise<{ jobs: SeedStatusResponse[] }> {
    return this.request('/admin/seed/jobs');
  }

  // ==================== SEO Pages ====================

  async seoPages(): Promise<{
    pages: { slug: string; title: string; communityCategory: string; type: string; communityDeckCount: number }[];
    featuredDecks: { uuid: string; name: string; displayOrder: number }[];
    featuredDeckCount: number;
    communityTotalCount: number;
    categoryCounts: Record<string, number>;
  }> {
    return this.request('/admin/seo/pages');
  }

  async seoFeaturedDecks(): Promise<{ decks: SeoFeaturedDeck[] }> {
    return this.request('/admin/seo/featured-decks');
  }

  async seoCommunityDecks(category?: string): Promise<{ decks: SeoCommunityDeck[] }> {
    const params = category ? `?category=${encodeURIComponent(category)}` : '';
    return this.request(`/admin/seo/community-decks${params}`);
  }

  async seoRemoveFeatured(deckUuid: string): Promise<{ success: boolean }> {
    return this.request(`/admin/seo/featured-deck/${deckUuid}`, { method: 'DELETE' });
  }

  async seoRemoveCommunity(deckUuid: string): Promise<{ success: boolean }> {
    return this.request(`/admin/seo/community-deck/${deckUuid}`, { method: 'DELETE' });
  }

  async seoReorderFeatured(deckUuid: string, newOrder: number): Promise<{ success: boolean }> {
    return this.request('/admin/seo/featured-deck/reorder', {
      method: 'PUT',
      body: JSON.stringify({ deck_uuid: deckUuid, new_order: newOrder }),
    });
  }

  async seoReorderFeaturedBatch(uuids: string[]): Promise<{ success: boolean }> {
    return this.request('/admin/seo/featured-decks/reorder', {
      method: 'PUT',
      body: JSON.stringify({ uuids }),
    });
  }

  async seedReseed(deckUuid: string, source: 'featured' | 'community', slides = 10, style = 'creative'): Promise<{ new_deck_id: string; old_deck_uuid: string; title: string }> {
    return this.request('/admin/seed/reseed', {
      method: 'POST',
      body: JSON.stringify({ deck_uuid: deckUuid, source, slides, style }),
    });
  }

  async seedReseedAll(slides = 10, style = 'creative'): Promise<{ count: number; decks: { new_deck_id: string; old_uuid: string; title: string; source: string }[]; message: string }> {
    return this.request('/admin/seed/reseed-all', {
      method: 'POST',
      body: JSON.stringify({ slides, style }),
    });
  }

  // ==================== Email Control Center ====================

  async getEmailTemplates(category?: string): Promise<{ templates: EmailTemplate[] }> {
    const params = category ? `?category=${category}` : '';
    return this.request(`/admin/email/templates${params}`);
  }

  async getEmailTemplate(id: string): Promise<EmailTemplate> {
    return this.request(`/admin/email/templates/${id}`);
  }

  async createEmailTemplate(data: Partial<EmailTemplate>): Promise<EmailTemplate> {
    return this.request('/admin/email/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateEmailTemplate(id: string, data: Partial<EmailTemplate>): Promise<EmailTemplate> {
    return this.request(`/admin/email/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteEmailTemplate(id: string): Promise<{ deleted: boolean }> {
    return this.request(`/admin/email/templates/${id}`, { method: 'DELETE' });
  }

  async previewEmailTemplate(id: string, variables?: Record<string, string>): Promise<{ html: string; subject: string }> {
    return this.request(`/admin/email/templates/${id}/preview`, {
      method: 'POST',
      body: JSON.stringify({ variables: variables || {} }),
    });
  }

  async sendTestEmail(templateId: string): Promise<{ sent: boolean; to: string }> {
    return this.request(`/admin/email/templates/${templateId}/send-test`, { method: 'POST' });
  }

  async generateEmailAI(data: { prompt: string; existing_html?: string; template_context?: string }): Promise<{ html: string; subject: string }> {
    return this.request('/admin/email/ai/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getEmailCampaigns(): Promise<{ campaigns: EmailCampaign[] }> {
    return this.request('/admin/email/campaigns');
  }

  async createEmailCampaign(data: Partial<EmailCampaign>): Promise<EmailCampaign> {
    return this.request('/admin/email/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateEmailCampaign(id: string, data: Partial<EmailCampaign>): Promise<EmailCampaign> {
    return this.request(`/admin/email/campaigns/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async sendEmailCampaign(id: string): Promise<{ started: boolean; campaign_id: string }> {
    return this.request(`/admin/email/campaigns/${id}/send`, { method: 'POST' });
  }

  async getCampaignRecipientCount(audience: string, audienceConfig?: Record<string, any>): Promise<{ count: number }> {
    return this.request('/admin/email/campaigns/audience-count', {
      method: 'POST',
      body: JSON.stringify({ audience, audience_config: audienceConfig || {} }),
    });
  }

  async getEmailSends(filters?: {
    template_id?: string;
    campaign_id?: string;
    status?: string;
    email?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    limit?: number;
  }): Promise<EmailSendsResponse> {
    const params = new URLSearchParams();
    if (filters?.template_id) params.append('template_id', filters.template_id);
    if (filters?.campaign_id) params.append('campaign_id', filters.campaign_id);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.email) params.append('email', filters.email);
    if (filters?.date_from) params.append('date_from', filters.date_from);
    if (filters?.date_to) params.append('date_to', filters.date_to);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    const qs = params.toString();
    return this.request(`/admin/email/sends${qs ? `?${qs}` : ''}`);
  }

  // ==================== Playground ====================

  async getPlaygroundModels(): Promise<PlaygroundModelInfo[]> {
    const res = await this.request<{ models: PlaygroundModelInfo[] }>('/admin/playground/models');
    return res.models;
  }

  async savePlaygroundRun(data: SavePlaygroundRunRequest): Promise<{ id: string; created_at: string }> {
    return this.request('/admin/playground/runs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async upsertPlaygroundModelResult(
    runId: string,
    modelId: string,
    data: UpsertPlaygroundModelResultRequest
  ): Promise<{ success: boolean }> {
    return this.request(`/admin/playground/runs/${runId}/models/${encodeURIComponent(modelId)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async listPlaygroundRuns(page = 1, limit = 20): Promise<ListPlaygroundRunsResponse> {
    return this.request(`/admin/playground/runs?page=${page}&limit=${limit}`);
  }

  async getPlaygroundRun(runId: string): Promise<PlaygroundRunDetail> {
    return this.request(`/admin/playground/runs/${runId}`);
  }

  async deletePlaygroundRun(runId: string): Promise<{ success: boolean }> {
    return this.request(`/admin/playground/runs/${runId}`, { method: 'DELETE' });
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

export interface FinancialActualsResponse {
  period: { start: string; end: string };
  users: {
    total: number;
    active_30d: number;
    new_this_month: number;
    churned_this_month: number;
  };
  decks: {
    total: number;
    created_this_month: number;
    avg_per_user: number;
    avg_slides_per_deck: number;
    total_slides: number;
  };
  credits: {
    used_this_month: number;
    avg_per_deck: number;
    avg_per_user: number;
  };
  revenue: {
    mrr: number;
    arr: number;
    paid_users: number;
    arpu: number;
  };
  monthly_history: Array<{
    month: string;
    users: number;
    decks: number;
    revenue: number;
    costs: number;
  }>;
}

export interface UsagePatternsResponse {
  avg_decks_per_user: number;
  avg_slides_per_deck: number;
  avg_edits_per_deck: number;
  avg_research_calls_per_deck: number;
  custom_component_rate: number;
  period: { start: string; end: string };
  sample_size: {
    users: number;
    decks: number;
    slides: number;
  };
}

// Community Types
export interface CommunitySubmission {
  id: string;
  deck_uuid: string;
  title: string;
  description?: string;
  category: string;
  tags: string[];
  status: 'pending' | 'approved' | 'rejected';
  slide_count: number;
  first_slide?: any;
  author_name?: string;
  author_email?: string;
  user_id: string;
  submitted_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  rejection_reason?: string;
}

export interface CommunityQueueResponse {
  submissions: CommunitySubmission[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface CommunityStats {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
  total_remixes: number;
  total_views: number;
}

// Share Viewers / Leads Types
export interface ShareViewer {
  id: string;
  email: string;
  name?: string;
  company?: string;
  registered_at: string;
  share_id: string;
  deck_name?: string;
  deck_owner_email?: string;
}

export interface GetShareViewersResponse {
  viewers: ShareViewer[];
  total: number;
  page: number;
  totalPages: number;
}

// Agent types
export interface AgentChatResponse {
  response_type: 'data' | 'confirmation' | 'conversation' | 'error';
  summary: string;
  // Data responses
  columns?: string[];
  rows?: Record<string, any>[];
  row_count?: number;
  truncated?: boolean;
  entity_links?: Record<string, 'user' | 'deck'>;
  // Confirmation responses
  action_id?: string;
  affected_rows?: number;
  operation_type?: string;
  // Conversation responses
  message?: string;
  // Analysis
  analysis?: string;
  // Error responses
  error?: string;
}

export interface AgentConfirmResponse {
  success: boolean;
  affected_rows: number;
  message: string;
  error?: string;
}

export interface SeedStatusResponse {
  deck_id: string;
  name: string;
  status: string;
  message: string;
  progress: number;
  slide_count: number;
  error?: string;
  created_at: string;
}

export interface SeoFeaturedDeck {
  uuid: string;
  name: string;
  description: string;
  slide_count: number;
  display_order: number;
  is_active: boolean;
  first_slide?: any;
  created_at?: string;
  updated_at?: string;
}

export interface SeoCommunityDeck {
  id: string;
  deck_uuid: string;
  title: string;
  category: string;
  tags: string[];
  slide_count: number;
  author_name: string;
  view_count: number;
  remix_count: number;
  approved_at?: string;
  first_slide?: any;
}

export const adminApi = new AdminApi();

// Playground types
export interface PlaygroundModelInfo {
  id: string;
  name: string;
  provider: string;
}

export interface SavePlaygroundRunRequest {
  prompt: string;
  temperature: number;
  slide_mode: string;
  slide_count: number;
  outline: Record<string, any>;
  theme: Record<string, any>;
  theme_summary?: Record<string, any> | null;
  model_ids: string[];
  total_elapsed_seconds?: number | null;
  label?: string | null;
  model_results: Array<{
    model_id: string;
    model_name: string;
    status: string;
    slide_htmls: (string | null)[];
    elapsed_seconds?: number | null;
    error?: string | null;
  }>;
}

export interface UpsertPlaygroundModelResultRequest {
  model_name: string;
  status: string;
  slide_htmls: (string | null)[];
  elapsed_seconds?: number | null;
  error?: string | null;
}

export interface PlaygroundModelResultSummary {
  run_id: string;
  model_id: string;
  model_name: string;
  status: string;
  elapsed_seconds: number | null;
  error: string | null;
}

export interface PlaygroundRunSummary {
  id: string;
  prompt: string;
  temperature: number;
  slide_mode: string;
  slide_count: number;
  model_ids: string[];
  total_elapsed_seconds: number | null;
  label: string | null;
  theme_summary: Record<string, any> | null;
  created_at: string;
  model_results: PlaygroundModelResultSummary[];
}

export interface PlaygroundModelResultFull {
  id: string;
  run_id: string;
  model_id: string;
  model_name: string;
  status: string;
  slide_htmls: (string | null)[];
  elapsed_seconds: number | null;
  error: string | null;
}

export interface PlaygroundRunDetail {
  id: string;
  user_id: string;
  prompt: string;
  temperature: number;
  slide_mode: string;
  slide_count: number;
  outline: Record<string, any>;
  theme: Record<string, any>;
  theme_summary: Record<string, any> | null;
  model_ids: string[];
  total_elapsed_seconds: number | null;
  label: string | null;
  created_at: string;
  model_results: PlaygroundModelResultFull[];
}

export interface ListPlaygroundRunsResponse {
  runs: PlaygroundRunSummary[];
  total: number;
  page: number;
  total_pages: number;
}

// Email Control Center types
export interface EmailTemplate {
  id: string;
  name: string;
  slug: string;
  subject: string;
  category: 'transactional' | 'growth' | 'onboarding' | 'product_updates';
  html_body: string;
  variables: string[];
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface EmailCampaign {
  id: string;
  name: string;
  template_id: string;
  template_name?: string;
  subject_override?: string;
  audience: 'all' | 'pro' | 'free' | 'inactive';
  audience_config: Record<string, any>;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  error_message?: string;
}

export interface EmailSend {
  id: string;
  campaign_id?: string;
  template_id?: string;
  template_name?: string;
  recipient_email: string;
  recipient_user_id?: string;
  subject: string;
  status: 'pending' | 'sent' | 'delivered' | 'bounced' | 'failed';
  resend_id?: string;
  sent_at?: string;
  error_message?: string;
  created_at: string;
}

export interface EmailSendsResponse {
  sends: EmailSend[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// Growth Dashboard types
export interface GrowthStats {
  referrals: { total_codes: number; total_signups: number; total_activated: number; total_credits: number };
  gamification: { total_badges_earned: number; active_streaks: number };
  community: { pending: number; approved: number; rejected: number };
  notifications: { sent_last_7d: number };
  pqa: { total_domains: number; pqa_domains: number };
  viral: { shared_decks: number; embeds: number };
}

export interface GrowthReferrals {
  stats: { total_codes: number; total_signups: number; total_activated: number; total_credits: number };
  top_referrers: Array<{ user_id: string; name: string; email: string; referral_count: number; credits_earned: number }>;
  config: { enabled: boolean; referee_signup_credits: number; referrer_activation_credits: number };
}

export interface GrowthGamification {
  badge_stats: { total_earned: number; by_type: Record<string, number> };
  badge_config: Record<string, number>;
  streak_stats: { active_streaks: number; avg_streak: number };
  streak_config: Record<string, number>;
  reward_config: Record<string, number>;
  leaderboard_preview: Array<{ name: string; score: number; rank: number }>;
}

export interface GrowthNotifications {
  stats: { total_last_7d: number; by_type: Record<string, number> };
  preference_stats: Record<string, number>;
  config: { enabled: boolean; view_threshold: number; email_on_views: boolean; weekly_digest_enabled: boolean };
}

export interface GrowthPqa {
  domains: Array<{ domain: string; user_count: number; total_decks: number; is_pqa: boolean; notified: boolean }>;
  config: { threshold: number; enabled: boolean };
}

export interface GrowthViral {
  stats: { shared_decks: number; embeds: number; badge_impressions: number };
  config: { badge_enabled: boolean; embed_enabled: boolean; og_previews_enabled: boolean };
}

export interface NotificationHistoryResponse {
  notifications: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    data: Record<string, any>;
    created_at: string;
    read: boolean;
    user_id: string;
  }>;
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}