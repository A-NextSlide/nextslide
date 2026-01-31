/**
 * Template Gallery API Service
 *
 * Handles all template-related API calls for the Template Gallery feature.
 */
import { API_ENDPOINTS } from '@/config/apiEndpoints';
import { authService } from '@/services/authService';

// ============================================================================
// Types
// ============================================================================

export interface Template {
  id: string;
  slug: string;
  title: string;
  description?: string;
  category: string;
  tags: string[];
  thumbnailUrl?: string;
  useCount: number;
  createdAt?: string;
}

export interface TemplateDetail extends Template {
  deckData: Record<string, any>;
}

export interface TemplatesResponse {
  templates: Template[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface TemplateFilters {
  category?: string;
  search?: string;
  sort?: 'popular' | 'newest';
  page?: number;
  limit?: number;
}

export interface TemplateCategoryCount {
  name: string;
  displayName: string;
  count: number;
}

export interface UseTemplateResult {
  success: boolean;
  slug: string;
  title: string;
  category: string;
  deckData: Record<string, any>;
}

// ============================================================================
// Category metadata (colors + gradients for the frontend)
// ============================================================================

export const TEMPLATE_CATEGORIES: Record<string, {
  name: string;
  color: string;
  gradient: string;
  icon: string;
}> = {
  business:    { name: 'Business',      color: '#3B82F6', gradient: 'from-blue-500 to-cyan-400',      icon: 'Briefcase' },
  sales:       { name: 'Sales',         color: '#F59E0B', gradient: 'from-amber-500 to-orange-400',   icon: 'TrendingUp' },
  marketing:   { name: 'Marketing',     color: '#A855F7', gradient: 'from-purple-500 to-fuchsia-400', icon: 'Megaphone' },
  finance:     { name: 'Finance',       color: '#10B981', gradient: 'from-emerald-500 to-teal-400',   icon: 'DollarSign' },
  education:   { name: 'Education',     color: '#06B6D4', gradient: 'from-cyan-500 to-sky-400',       icon: 'GraduationCap' },
  technology:  { name: 'Technology',    color: '#6366F1', gradient: 'from-indigo-500 to-violet-400',  icon: 'Cpu' },
  creative:    { name: 'Creative',      color: '#EC4899', gradient: 'from-pink-500 to-rose-400',      icon: 'Palette' },
  consulting:  { name: 'Consulting',    color: '#8B5CF6', gradient: 'from-violet-500 to-purple-400',  icon: 'LineChart' },
  research:    { name: 'Research',      color: '#14B8A6', gradient: 'from-teal-500 to-emerald-400',   icon: 'Search' },
  hr:          { name: 'HR & Training', color: '#F97316', gradient: 'from-orange-500 to-amber-400',   icon: 'Users' },
};

// ============================================================================
// Service
// ============================================================================

class TemplateApiService {
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
    return { 'Content-Type': 'application/json' };
  }

  // --------------------------------------------------------------------------
  // Public Endpoints
  // --------------------------------------------------------------------------

  /**
   * List templates with optional filters
   */
  async getTemplates(filters: TemplateFilters = {}): Promise<TemplatesResponse> {
    const params = new URLSearchParams();
    if (filters.category) params.set('category', filters.category);
    if (filters.search) params.set('search', filters.search);
    if (filters.sort) params.set('sort', filters.sort);
    if (filters.page) params.set('page', filters.page.toString());
    if (filters.limit) params.set('limit', filters.limit.toString());

    const url = `${this.getBaseUrl()}/api/templates?${params.toString()}`;
    const response = await fetch(url, { method: 'GET', headers: this.getPublicHeaders() });

    if (!response.ok) {
      throw new Error('Failed to fetch templates');
    }

    const data = await response.json();
    return {
      templates: (data.templates || []).map(this.transformTemplate),
      total: data.total || 0,
      page: data.page || 1,
      limit: data.limit || 20,
      hasMore: data.has_more || false,
    };
  }

  /**
   * Get a single template by slug
   */
  async getTemplate(slug: string): Promise<TemplateDetail> {
    const url = `${this.getBaseUrl()}/api/templates/${slug}`;
    const response = await fetch(url, { method: 'GET', headers: this.getPublicHeaders() });

    if (!response.ok) {
      if (response.status === 404) throw new Error('Template not found');
      throw new Error('Failed to fetch template');
    }

    const data = await response.json();
    return {
      ...this.transformTemplate(data),
      deckData: data.deck_data || {},
    };
  }

  /**
   * Get category list with counts
   */
  async getCategories(): Promise<TemplateCategoryCount[]> {
    const url = `${this.getBaseUrl()}/api/templates/categories`;
    const response = await fetch(url, { method: 'GET', headers: this.getPublicHeaders() });

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

  /**
   * Use a template (requires auth). Returns the deck data to load in editor.
   */
  async useTemplate(slug: string): Promise<UseTemplateResult> {
    const url = `${this.getBaseUrl()}/api/templates/${slug}/use`;
    const response = await fetch(url, { method: 'POST', headers: this.getAuthHeaders() });

    if (!response.ok) {
      if (response.status === 401) throw new Error('Please sign in to use templates');
      throw new Error('Failed to use template');
    }

    const data = await response.json();
    return {
      success: data.success,
      slug: data.slug,
      title: data.title,
      category: data.category,
      deckData: data.deck_data || {},
    };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private transformTemplate(raw: any): Template {
    return {
      id: raw.id,
      slug: raw.slug,
      title: raw.title,
      description: raw.description,
      category: raw.category,
      tags: raw.tags || [],
      thumbnailUrl: raw.thumbnail_url,
      useCount: raw.use_count || 0,
      createdAt: raw.created_at,
    };
  }
}

export const templateApi = new TemplateApiService();
