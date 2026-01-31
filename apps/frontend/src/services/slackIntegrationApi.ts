import { apiClient } from './apiClient';

export interface SlackStatus {
  connected: boolean;
  team_name?: string;
  team_id?: string;
}

async function getStatus(): Promise<SlackStatus> {
  const res = await apiClient.get<SlackStatus>('/slack/user/status', { noHardResetOn401: true });
  if (!res.ok) throw new Error(res.error || 'Failed to get Slack status');
  return res.data as SlackStatus;
}

async function getInstallUrl(): Promise<string> {
  const res = await apiClient.get<{ url: string }>('/slack/oauth/install', { noHardResetOn401: true });
  if (!res.ok) throw new Error(res.error || 'Failed to get install URL');
  return (res.data as { url: string }).url;
}

async function disconnect(): Promise<{ success: boolean }> {
  const res = await apiClient.post<{ success: boolean }>('/slack/user/disconnect', undefined, { noHardResetOn401: true });
  if (!res.ok) throw new Error(res.error || 'Failed to disconnect Slack');
  return res.data as { success: boolean };
}

export const slackIntegrationApi = {
  getStatus,
  getInstallUrl,
  disconnect,
};

export default slackIntegrationApi;
