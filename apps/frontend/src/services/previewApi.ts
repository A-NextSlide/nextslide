/**
 * Preview API client for the "Try Without Signup" landing page experience.
 *
 * Calls the unauthenticated POST /api/preview/generate endpoint
 * and handles errors / rate limiting gracefully.
 */

import { API_CONFIG } from '@/config/environment';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreviewSlide {
  title: string;
  content: string;
  locked: boolean;
}

export interface PreviewResult {
  id: string;
  title: string;
  slides: PreviewSlide[];
}

export interface PreviewError {
  error: string;
  message: string;
  remaining?: number;
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

/**
 * Generate a lightweight slide outline preview without authentication.
 * Rate limited to 3 requests per IP per hour on the backend.
 */
export async function generatePreview(prompt: string): Promise<PreviewResult> {
  const baseUrl = API_CONFIG.BASE_URL.replace(/\/$/, '');
  const url = `${baseUrl}/preview/generate`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    // Try to parse structured error from backend
    let errorData: PreviewError | null = null;
    try {
      const raw = await response.json();
      // FastAPI wraps HTTPException detail in a "detail" key
      errorData = (raw?.detail ?? raw) as PreviewError;
    } catch {
      // ignore parse failures
    }

    if (response.status === 429) {
      throw new PreviewRateLimitError(
        errorData?.message || 'Rate limit exceeded. Sign up for unlimited access!',
        errorData?.remaining ?? 0,
      );
    }

    throw new PreviewGenerationError(
      errorData?.message || `Preview generation failed (${response.status})`,
    );
  }

  return (await response.json()) as PreviewResult;
}

// ---------------------------------------------------------------------------
// Custom error classes
// ---------------------------------------------------------------------------

export class PreviewRateLimitError extends Error {
  public remaining: number;

  constructor(message: string, remaining: number) {
    super(message);
    this.name = 'PreviewRateLimitError';
    this.remaining = remaining;
  }
}

export class PreviewGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreviewGenerationError';
  }
}
