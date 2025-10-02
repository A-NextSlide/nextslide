import { apiClient } from './apiClient';
import { CompleteDeckData } from '@/types/DeckTypes';

export interface GoogleAuthStatus {
  connected: boolean;
  email?: string;
  scopes?: string[];
}

export interface GooglePresentationFile {
  id: string;
  name: string;
  modifiedTime?: string;
  owners?: Array<{ emailAddress?: string }>;
  thumbnailLink?: string;
}

export interface JobResponse<T = any> {
  id?: string;
  jobId?: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  result?: T;
  error?: string;
}

// Simple in-memory thumbnail cache (30-minute URL TTL is handled server-side)
const pageThumbnailCache = new Map<string, { width: number; height: number; contentUrl: string }>();

async function getAuthStatus() {
  const res = await apiClient.get<GoogleAuthStatus>('/google/auth/status', { noHardResetOn401: true });
  if (!res.ok) throw new Error(res.error || 'Failed to get Google auth status');
  return res.data as GoogleAuthStatus;
}

async function initiateAuth(redirectUri?: string) {
  const query = redirectUri ? `?redirectUri=${encodeURIComponent(redirectUri)}` : '';
  const res = await apiClient.get<{ url: string }>(`/google/auth/init${query}`, { noHardResetOn401: true });
  if (!res.ok) throw new Error(res.error || 'Failed to initiate Google auth');
  return (res.data as any).url as string;
}

async function disconnect() {
  const res = await apiClient.post<{ success: boolean }>(`/google/auth/disconnect`, undefined, { noHardResetOn401: true });
  if (!res.ok) throw new Error(res.error || 'Failed to disconnect Google');
  return res.data;
}

async function listPresentations(params?: { query?: string; pageToken?: string; pageSize?: number; scope?: 'all' | 'mine' | 'shared' }) {
  const qp: string[] = [];
  if (params?.query) qp.push(`query=${encodeURIComponent(params.query)}`);
  if (params?.pageToken) qp.push(`pageToken=${encodeURIComponent(params.pageToken)}`);
  if (typeof params?.pageSize === 'number') qp.push(`pageSize=${encodeURIComponent(String(params.pageSize))}`);
  if (params?.scope) qp.push(`scope=${encodeURIComponent(params.scope)}`);
  const qs = qp.length ? `?${qp.join('&')}` : '';
  const res = await apiClient.get<{ files: GooglePresentationFile[]; nextPageToken?: string }>(`/google/drive/presentations${qs}`, { noHardResetOn401: true });
  if (!res.ok) throw new Error(res.error || 'Failed to list presentations');
  return res.data as { files: GooglePresentationFile[]; nextPageToken?: string };
}

async function startImportSlides(presentationId: string) {
  const res = await apiClient.post<{ jobId: string }>(`/import/slides`, { presentationId });
  if (!res.ok) throw new Error(res.error || 'Failed to start import');
  return (res.data as any).jobId as string;
}

async function getJob(jobId: string) {
  const res = await apiClient.get<JobResponse>(`/jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) throw new Error(res.error || 'Failed to get job');
  return res.data as JobResponse;
}

async function pollJob<T = any>(jobId: string, opts: { intervalMs?: number; timeoutMs?: number } = {}) {
  const intervalMs = opts.intervalMs ?? 1500;
  const timeoutMs = opts.timeoutMs ?? 120000;
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const job = await getJob(jobId);
    if (job.status === 'SUCCEEDED') return job as JobResponse<T>;
    if (job.status === 'FAILED') throw new Error(job.error || 'Job failed');
    if (Date.now() - start > timeoutMs) throw new Error('Job timed out');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function exportSlidesEditable(deck: CompleteDeckData, options?: { title?: string; createNew?: boolean }) {
  const res = await apiClient.post<{ jobId: string }>(`/export/slides/editable`, { deck, options });
  if (!res.ok) throw new Error(res.error || 'Failed to start export (editable)');
  return (res.data as any).jobId as string;
}

async function exportSlidesImages(deck: CompleteDeckData, options?: { title?: string }) {
  const res = await apiClient.post<{ jobId: string }>(`/export/slides/images`, { deck, options });
  if (!res.ok) throw new Error(res.error || 'Failed to start export (images)');
  return (res.data as any).jobId as string;
}

export const googleIntegrationApi = {
  getAuthStatus,
  initiateAuth,
  disconnect,
  listPresentations,
  startImportSlides,
  getJob,
  pollJob,
  exportSlidesEditable,
  exportSlidesImages,
  async getSlidePageThumbnailsBatch(
    items: Array<{ presentationId: string; pageId: string }>,
    options: { size?: 'SMALL' | 'MEDIUM' | 'LARGE'; mime?: 'PNG' | 'JPEG' } = {}
  ): Promise<Array<{
    index: number;
    presentationId: string;
    pageId: string;
    status: 'ok' | 'error';
    width?: number;
    height?: number;
    contentUrl?: string;
    error?: string;
  }>> {
    if (!Array.isArray(items) || items.length === 0) return [];
    const size = options.size || 'MEDIUM';
    const mime = options.mime || 'PNG';
    const res = await apiClient.post<any>(`/google/slides/thumbnails:batch`, { items, size, mime }, { noHardResetOn401: true });
    if (!res.ok || !res.data) throw new Error(res.error || 'Failed to fetch slide thumbnails batch');
    const payload: any = res.data;
    const results: Array<any> = Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.thumbnails)
        ? payload.thumbnails
        : Array.isArray(payload)
          ? payload
          : [];
    // Populate individual cache entries for quicker follow-up single fetches
    results.forEach((r: any) => {
      const contentUrl = r?.thumbnail?.contentUrl || r?.contentUrl || r?.url;
      const width = r?.thumbnail?.width ?? r?.width;
      const height = r?.thumbnail?.height ?? r?.height;
      const pageKey = r?.resolvedPageId || r?.pageId;
      if (r && r.presentationId && pageKey && contentUrl && width && height) {
        const cacheKey = `${r.presentationId}:${pageKey}:${size}:${mime}`;
        pageThumbnailCache.set(cacheKey, { width, height, contentUrl });
      }
    });
    return results;
  },
  async getSlidePageThumbnail(
    presentationId: string,
    pageId: string,
    options: { size?: 'SMALL' | 'MEDIUM' | 'LARGE'; mime?: 'PNG' | 'JPEG' } = {}
  ): Promise<{ width: number; height: number; contentUrl: string }> {
    const size = options.size || 'MEDIUM';
    const mime = options.mime || 'PNG';
    const cacheKey = `${presentationId}:${pageId}:${size}:${mime}`;
    const cached = pageThumbnailCache.get(cacheKey);
    if (cached) return cached;

    const qs = new URLSearchParams({ size, mime });
    const endpoint = `/google/slides/${encodeURIComponent(presentationId)}/pages/${encodeURIComponent(pageId)}/thumbnail?${qs}`;
    const res = await apiClient.get<{ width: number; height: number; contentUrl: string }>(endpoint, { noHardResetOn401: true });
    if (!res.ok || !res.data) throw new Error(res.error || 'Failed to fetch slide thumbnail');
    pageThumbnailCache.set(cacheKey, res.data);
    return res.data;
  }
};

export default googleIntegrationApi;


