import { apiClient } from './apiClient';

export interface JobResponse<T = any> {
  id?: string;
  jobId?: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  result?: T;
  error?: string;
}

async function startImportPptx(params: { fileUrl: string; fileName?: string; deckId?: string }) {
  const res = await apiClient.post<{ jobId: string }>(`/import/pptx`, params);
  if (!res.ok) throw new Error(res.error || 'Failed to start PPTX import');
  return (res.data as any).jobId as string;
}

async function getJob(jobId: string) {
  const res = await apiClient.get<JobResponse>(`/jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) throw new Error(res.error || 'Failed to get job');
  return res.data as JobResponse;
}

async function pollJob<T = any>(jobId: string, opts: { intervalMs?: number; timeoutMs?: number } = {}) {
  const intervalMs = opts.intervalMs ?? 1500;
  const timeoutMs = opts.timeoutMs ?? 180000;
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

export const pptxImportApi = {
  startImportPptx,
  getJob,
  pollJob,
};

export default pptxImportApi;


