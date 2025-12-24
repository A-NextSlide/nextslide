/**
 * Developer API Service
 *
 * Handles API key management for the Developer API feature.
 */

import { authService } from './authService';
import { API_BASE } from '@/config/environment';

// =============================================================================
// Types
// =============================================================================

export interface BrandSettings {
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  font_family?: string | null;
}

export interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  context_instructions: string | null;
  context_images: string[];
  brand_settings: BrandSettings | null;
  webhook_url: string | null;
  include_edit_link: boolean;
  created_at: string;
  last_used_at: string | null;
  request_count: number;
  is_active: boolean;
}

export interface CreateApiKeyRequest {
  name: string;
  context_instructions?: string | null;
  context_images?: string[];
  brand_settings?: BrandSettings | null;
  webhook_url?: string | null;
  include_edit_link?: boolean;
}

export interface CreateApiKeyResponse {
  api_key: string; // Full key - shown only once!
  key_details: ApiKey;
}

export interface UpdateApiKeyRequest {
  name?: string;
  context_instructions?: string | null;
  context_images?: string[];
  brand_settings?: BrandSettings | null;
  webhook_url?: string | null;
  include_edit_link?: boolean;
}

export interface ImageUploadResponse {
  url: string;
  path: string;
}

export interface DeveloperStatus {
  has_access: boolean;
  plan_id: string;
  plan_name: string;
  message: string;
}

// =============================================================================
// API Client
// =============================================================================

class DeveloperApiService {
  private getHeaders(): Record<string, string> {
    let token: string | null = null;
    try {
      token = authService.getAuthToken();
    } catch {
      // Ignore
    }
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /**
   * Check if the current user has access to the Developer API
   */
  async getStatus(): Promise<DeveloperStatus> {
    const response = await fetch(`${API_BASE}/developer/status`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to get developer status');
    }

    return response.json();
  }

  /**
   * List all API keys for the current user
   */
  async listApiKeys(): Promise<ApiKey[]> {
    const response = await fetch(`${API_BASE}/developer/keys`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Pro subscription required');
      }
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to list API keys');
    }

    return response.json();
  }

  /**
   * Create a new API key
   * @returns The full API key (shown only once!) and key details
   */
  async createKey(request: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
    const response = await fetch(`${API_BASE}/developer/keys`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Pro subscription required');
      }
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to create API key');
    }

    return response.json();
  }

  /**
   * Get a single API key by ID
   */
  async getKey(keyId: string): Promise<ApiKey> {
    const response = await fetch(`${API_BASE}/developer/keys/${keyId}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to get API key');
    }

    return response.json();
  }

  /**
   * Update an API key's settings
   */
  async updateKey(keyId: string, updates: UpdateApiKeyRequest): Promise<ApiKey> {
    const response = await fetch(`${API_BASE}/developer/keys/${keyId}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to update API key');
    }

    return response.json();
  }

  /**
   * Delete an API key permanently
   */
  async deleteKey(keyId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/developer/keys/${keyId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to delete API key');
    }
  }

  /**
   * Revoke an API key (soft delete)
   */
  async revokeKey(keyId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/developer/keys/${keyId}/revoke`, {
      method: 'POST',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to revoke API key');
    }
  }

  /**
   * Upload a context image for an API key
   */
  async uploadImage(keyId: string, file: File): Promise<ImageUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    let token: string | null = null;
    try {
      token = authService.getAuthToken();
    } catch {
      // Ignore
    }

    const response = await fetch(`${API_BASE}/developer/keys/${keyId}/images`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to upload image');
    }

    return response.json();
  }

  /**
   * Delete a context image from an API key
   */
  async deleteImage(keyId: string, imagePath: string): Promise<void> {
    const response = await fetch(
      `${API_BASE}/developer/keys/${keyId}/images/${encodeURIComponent(imagePath)}`,
      {
        method: 'DELETE',
        headers: this.getHeaders(),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to delete image');
    }
  }
}

// Singleton export
export const developerApiService = new DeveloperApiService();
