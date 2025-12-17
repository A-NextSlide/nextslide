/**
 * Integrations API service
 *
 * Handles communication with the integrations backend
 * for connecting and managing external services.
 */

import { apiClient } from './apiClient';

// ==================
// Types
// ==================

export interface IntegrationInfo {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  capabilities: string[];
  connected: boolean;
  connection_id?: string;
  connected_at?: string;
  account_email?: string;
  account_name?: string;
  status?: string;
}

export interface IntegrationCategory {
  id: string;
  name: string;
}

export interface IntegrationsResponse {
  integrations: IntegrationInfo[];
  categories: IntegrationCategory[];
}

export interface ConnectSessionResponse {
  token: string;
}

export interface IntegrationStatus {
  connected: boolean;
  provider: string;
  connection_id?: string;
  account_email?: string;
  account_name?: string;
  status?: string;
  nango_status?: string;
  created_at?: string;
  last_used_at?: string;
  error?: string;
}

// ==================
// API Functions
// ==================

/**
 * Get all available integrations (no auth required)
 */
export async function getAvailableIntegrations(category?: string): Promise<IntegrationsResponse> {
  const params = category ? `?category=${category}` : '';
  const response = await apiClient.get<IntegrationsResponse>(
    `/api/integrations/available${params}`,
    { skipAuth: true }
  );

  if (!response.ok) {
    throw new Error(response.error || 'Failed to fetch integrations');
  }

  return response.data!;
}

/**
 * Get user's integrations with connection status
 */
export async function getUserIntegrations(): Promise<IntegrationsResponse> {
  const response = await apiClient.get<IntegrationsResponse>('/api/integrations');

  if (!response.ok) {
    throw new Error(response.error || 'Failed to fetch user integrations');
  }

  return response.data!;
}

/**
 * Create a connect session for the OAuth flow
 */
export async function createConnectSession(
  integrations?: string[]
): Promise<ConnectSessionResponse> {
  const response = await apiClient.post<ConnectSessionResponse>(
    '/api/integrations/session',
    { integrations }
  );

  if (!response.ok) {
    throw new Error(response.error || 'Failed to create connect session');
  }

  return response.data!;
}

/**
 * Disconnect an integration
 */
export async function disconnectIntegration(provider: string): Promise<void> {
  const response = await apiClient.delete(`/api/integrations/${provider}`);

  if (!response.ok) {
    throw new Error(response.error || 'Failed to disconnect integration');
  }
}

/**
 * Get detailed status for a specific integration
 */
export async function getIntegrationStatus(provider: string): Promise<IntegrationStatus> {
  const response = await apiClient.get<IntegrationStatus>(
    `/api/integrations/${provider}/status`
  );

  if (!response.ok) {
    throw new Error(response.error || 'Failed to get integration status');
  }

  return response.data!;
}

/**
 * Create a reconnect session for an expired integration
 */
export async function createReconnectSession(
  provider: string
): Promise<ConnectSessionResponse> {
  const response = await apiClient.post<ConnectSessionResponse>(
    `/api/integrations/${provider}/reconnect`
  );

  if (!response.ok) {
    throw new Error(response.error || 'Failed to create reconnect session');
  }

  return response.data!;
}

// ==================
// Helper Functions
// ==================

/**
 * Get icon component name for an integration
 */
export function getIntegrationIcon(icon: string): string {
  const iconMap: Record<string, string> = {
    salesforce: 'cloud',
    hubspot: 'target',
    pipedrive: 'trending-up',
    linkedin: 'linkedin',
    twitter: 'twitter',
    gmail: 'mail',
    outlook: 'mail',
    'google-calendar': 'calendar',
    'google-drive': 'hard-drive',
    dropbox: 'dropbox',
    onedrive: 'cloud',
    notion: 'file-text',
    confluence: 'book',
    slack: 'slack',
    discord: 'message-circle',
    teams: 'users',
    asana: 'check-square',
    linear: 'layers',
    jira: 'clipboard',
    trello: 'trello',
    github: 'github',
    figma: 'figma',
    'google-analytics': 'bar-chart',
    zoom: 'video',
    youtube: 'youtube',
  };

  return iconMap[icon] || 'plug';
}

/**
 * Get category display info
 */
export function getCategoryInfo(category: string): { label: string; color: string } {
  const categoryMap: Record<string, { label: string; color: string }> = {
    crm: { label: 'CRM', color: 'blue' },
    social: { label: 'Social', color: 'purple' },
    email: { label: 'Email', color: 'red' },
    calendar: { label: 'Calendar', color: 'green' },
    storage: { label: 'Storage', color: 'yellow' },
    docs: { label: 'Docs', color: 'orange' },
    communication: { label: 'Communication', color: 'pink' },
    project: { label: 'Project', color: 'indigo' },
    dev_tools: { label: 'Dev Tools', color: 'gray' },
    hr: { label: 'HR', color: 'teal' },
    accounting: { label: 'Accounting', color: 'emerald' },
    marketing: { label: 'Marketing', color: 'rose' },
    support: { label: 'Support', color: 'sky' },
    analytics: { label: 'Analytics', color: 'violet' },
    video: { label: 'Video', color: 'fuchsia' },
  };

  return categoryMap[category] || { label: category, color: 'gray' };
}

/**
 * Group integrations by category
 */
export function groupByCategory(
  integrations: IntegrationInfo[]
): Record<string, IntegrationInfo[]> {
  return integrations.reduce((acc, integration) => {
    const category = integration.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(integration);
    return acc;
  }, {} as Record<string, IntegrationInfo[]>);
}

/**
 * Filter to just connected integrations
 */
export function getConnectedIntegrations(
  integrations: IntegrationInfo[]
): IntegrationInfo[] {
  return integrations.filter((i) => i.connected);
}


// ==================
// Enabled Integrations (for @ mentions)
// ==================

export interface EnabledIntegration {
  id: string;
  name: string;
  icon: string;
  description: string;
  capabilities: string[];
}

/**
 * Get system-enabled integrations for @ mentions
 */
export async function getEnabledIntegrations(): Promise<EnabledIntegration[]> {
  const response = await apiClient.get<{ integrations: EnabledIntegration[] }>(
    '/api/integrations/enabled'
  );

  if (!response.ok) {
    throw new Error(response.error || 'Failed to fetch enabled integrations');
  }

  return response.data?.integrations || [];
}


// ==================
// LinkedIn Search
// ==================

export interface LinkedInSearchParams {
  query?: string;
  name?: string;
  company?: string;
  title?: string;
  location?: string;
  linkedin_url?: string;
  page?: number;
  per_page?: number;
}

export interface LinkedInProfile {
  name: string;
  title?: string;
  company?: string;
  linkedin_url?: string;
  location?: string;
}

export interface LinkedInSearchResponse {
  profiles: LinkedInProfile[];
  page: number;
  per_page: number;
}

/**
 * Search LinkedIn profiles via Apollo
 */
export async function searchLinkedIn(
  params: LinkedInSearchParams
): Promise<LinkedInSearchResponse> {
  const response = await apiClient.post<LinkedInSearchResponse>(
    '/api/integrations/linkedin/search',
    params
  );

  if (!response.ok) {
    throw new Error(response.error || 'LinkedIn search failed');
  }

  return response.data!;
}


// ==================
// Admin Integration Settings
// ==================

export interface IntegrationSettings {
  id: string;
  name: string;
  description: string;
  icon: string;
  provider: string;
  requires_user_connection: boolean;
  capabilities: string[];
  enabled: boolean;
  config: Record<string, unknown>;
}

/**
 * Get all integrations with admin settings
 */
export async function getAllIntegrationsAdmin(): Promise<IntegrationSettings[]> {
  const response = await apiClient.get<{ integrations: IntegrationSettings[] }>(
    '/api/integrations/admin/all'
  );

  if (!response.ok) {
    throw new Error(response.error || 'Failed to fetch integrations');
  }

  return response.data?.integrations || [];
}

/**
 * Update integration settings (admin)
 */
export async function updateIntegrationSettings(
  integrationId: string,
  settings: { enabled?: boolean; config?: Record<string, unknown> }
): Promise<void> {
  const response = await apiClient.patch(
    `/api/integrations/admin/${integrationId}`,
    settings
  );

  if (!response.ok) {
    throw new Error(response.error || 'Failed to update integration');
  }
}
