import { API_CONFIG } from '@/config/environment';
import { authService } from './authService';

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  status: number;
  ok: boolean;
}

export interface ApiRequestOptions extends RequestInit {
  skipAuth?: boolean;
  isAuthEndpoint?: boolean;
  // If true, do not hard reset/logout on 401. Caller will handle re-auth UI.
  noHardResetOn401?: boolean;
}

/**
 * Centralized API Client
 * Handles all API requests with consistent authentication and error handling
 */
class ApiClient {
  private baseUrl: string;
  
  constructor() {
    this.baseUrl = API_CONFIG.BASE_URL;
  }
  
  /**
   * Get the correct URL for auth endpoints based on environment
   */
  private getAuthUrl(endpoint: string): string {
    // In production, remove the /api prefix for auth endpoints
    if (import.meta.env.PROD && this.baseUrl.includes('/api')) {
      return this.baseUrl.replace('/api', '') + endpoint;
    }
    // In development, auth endpoints are proxied correctly
    return `/api${endpoint}`;
  }
  
  /**
   * Get the correct URL for regular API endpoints
   */
  private getApiUrl(endpoint: string): string {
    // If it's an absolute URL, return as-is
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return endpoint;
    }
    
    // If it starts with /api, return as-is (for development proxy)
    if (endpoint.startsWith('/api')) {
      return endpoint;
    }
    
    // Otherwise, prepend the base URL
    return `${this.baseUrl}${endpoint}`;
  }
  
  /**
   * Get headers with authentication
   */
  private getHeaders(skipAuth: boolean = false): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (!skipAuth) {
      const token = authService.getAuthToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    
    return headers;
  }
  
  /**
   * Handle API response and errors
   */
  private async handleResponse<T>(response: Response, context?: { noHardResetOn401?: boolean }): Promise<ApiResponse<T>> {
    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    
    if (!response.ok) {
      // Handle authentication errors
      if (response.status === 401) {
        // Try to refresh token once regardless of local expiry guess.
        try {
          const newToken = await authService.refreshToken();
          if (newToken) {
            // Throw special error to trigger retry with new token
            throw new Error('TOKEN_REFRESHED');
          }
        } catch (refreshError) {
          console.error('[ApiClient] Token refresh failed:', refreshError);
        }
        // If refresh did not yield a token, optionally avoid hard reset if caller wants to handle it
        if (context?.noHardResetOn401) {
          return { ok: false, status: 401, error: 'Unauthorized' };
        }
        await authService.hardResetAuth();
        return { ok: false, status: 401, error: 'Unauthorized' };
      }
      
      // Parse error response
      let errorMessage = `API Error: ${response.status} ${response.statusText}`;
      if (isJson) {
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.detail || errorData.error || errorMessage;
        } catch {
          // Ignore JSON parse errors
        }
      }
      
      return {
        error: errorMessage,
        status: response.status,
        ok: false
      };
    }
    
    // Parse successful response
    if (isJson) {
      const data = await response.json();
      return {
        data,
        status: response.status,
        ok: true
      };
    }
    
    // Non-JSON response
    const text = await response.text();
    return {
      data: text as any,
      status: response.status,
      ok: true
    };
  }
  
  /**
   * Make an authenticated API request
   */
  async request<T>(
    endpoint: string,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const { skipAuth = false, isAuthEndpoint = false, noHardResetOn401 = false, ...fetchOptions } = options;
    
    // Determine the correct URL
    const url = isAuthEndpoint ? this.getAuthUrl(endpoint) : this.getApiUrl(endpoint);
    
    try {
      // Make the request
      const response = await fetch(url, {
        ...fetchOptions,
        headers: {
          ...this.getHeaders(skipAuth),
          ...fetchOptions.headers,
        },
      });
      
      return await this.handleResponse<T>(response, { noHardResetOn401 });
    } catch (error) {
      // Handle token refresh retry
      if (error instanceof Error && error.message === 'TOKEN_REFRESHED') {
        // Retry the request with new token
        const response = await fetch(url, {
          ...fetchOptions,
          headers: {
            ...this.getHeaders(skipAuth),
            ...fetchOptions.headers,
          },
        });
        
        // Delegate retry response handling (including optional no-logout behavior)
        return await this.handleResponse<T>(response, { noHardResetOn401 });
      }
      
      // Handle other errors
      if (error instanceof Error) {
        return {
          error: error.message,
          status: 0,
          ok: false
        };
      }
      
      return {
        error: 'An unknown error occurred',
        status: 0,
        ok: false
      };
    }
  }
  
  /**
   * Convenience methods for common HTTP verbs
   */
  async get<T>(endpoint: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }
  
  async post<T>(endpoint: string, body?: any, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  
  async put<T>(endpoint: string, body?: any, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  
  async delete<T>(endpoint: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export type
export type { ApiClient }; 