/**
 * Analytics API Service
 *
 * Handles all presentation analytics API calls:
 * - View tracking (when someone views a shared deck)
 * - Slide engagement tracking (time spent per slide)
 * - Fetching per-deck and aggregate analytics
 */

import { authService } from './authService';

// Use empty string in dev so relative URLs work with the proxy
const rawApiBase = import.meta.env.VITE_API_URL || '';
const API_BASE = rawApiBase.replace(/\/api\/?$/, '');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ViewsOverTimeEntry {
  date: string;
  views: number;
}

export interface SlideEngagement {
  slide_index: number;
  total_time_ms: number;
  avg_time_ms: number;
  view_count: number;
  unique_viewers?: number;
}

export interface GeoEntry {
  name: string;
  views: number;
}

export interface DeckAnalytics {
  total_views: number;
  unique_viewers: number;
  avg_duration_ms: number;
  views_over_time: ViewsOverTimeEntry[];
  top_slides: SlideEngagement[];
  device_breakdown: Record<string, number>;
  source_breakdown: Record<string, number>;
  geography: {
    countries: GeoEntry[];
    cities: GeoEntry[];
  };
}

export interface PopularDeck {
  deck_uuid: string;
  name: string;
  views: number;
}

export interface WeeklyTrend {
  week: string;
  views: number;
}

export interface AggregateDashboard {
  total_views: number;
  total_unique_viewers: number;
  most_popular_decks: PopularDeck[];
  weekly_trend: WeeklyTrend[];
}

// ---------------------------------------------------------------------------
// Auth headers helper
// ---------------------------------------------------------------------------

function getAuthHeaders(): Record<string, string> {
  let token: string | null = null;
  try {
    token = authService.getAuthToken();
  } catch {
    // Not authenticated - some endpoints are public
  }
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ---------------------------------------------------------------------------
// Debounce helper to batch rapid slide-change events
// ---------------------------------------------------------------------------

let pendingSlideEngagements: Array<{
  deck_uuid: string;
  slide_index: number;
  session_id: string;
  time_spent_ms: number;
}> = [];

let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushSlideEngagement() {
  if (pendingSlideEngagements.length === 0) return;

  const toSend = [...pendingSlideEngagements];
  pendingSlideEngagements = [];

  // Group by deck_uuid + session_id and send batch
  const grouped = new Map<string, typeof toSend>();
  for (const item of toSend) {
    const key = `${item.deck_uuid}:${item.session_id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  for (const [, items] of grouped) {
    const first = items[0];
    const body = {
      deck_uuid: first.deck_uuid,
      session_id: first.session_id,
      slides: items.map((i) => ({
        slide_index: i.slide_index,
        time_spent_ms: i.time_spent_ms,
      })),
    };

    // Fire and forget - use navigator.sendBeacon for reliability on page unload
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    const url = `${API_BASE}/api/analytics/track-slide-batch`;

    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url, blob);
    } else {
      fetch(url, { method: 'POST', body: blob, keepalive: true }).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Track a presentation view.
 * Called when someone opens a shared deck link.
 */
export function trackView(
  deckUuid: string,
  source?: string,
  platform?: string,
  sessionId?: string,
  deviceType?: string,
): void {
  const body = {
    deck_uuid: deckUuid,
    session_id: sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    source: source || 'direct',
    platform: platform || undefined,
    device_type: deviceType || detectDeviceType(),
  };

  fetch(`${API_BASE}/api/analytics/track-view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch((err) => {
    console.warn('[analyticsApi] Failed to track view:', err);
  });
}

/**
 * Track time spent on a single slide.
 * Debounced and batched for efficiency.
 */
export function trackSlideEngagement(
  deckUuid: string,
  slideIndex: number,
  timeSpentMs: number,
  sessionId: string,
): void {
  if (timeSpentMs < 100) return; // Ignore very short interactions

  pendingSlideEngagements.push({
    deck_uuid: deckUuid,
    slide_index: slideIndex,
    session_id: sessionId,
    time_spent_ms: Math.min(timeSpentMs, 600000),
  });

  // Flush after 5 seconds of inactivity, or every 30 seconds
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushSlideEngagement, 5000);

  // Also flush if we have accumulated many items
  if (pendingSlideEngagements.length >= 20) {
    flushSlideEngagement();
  }
}

/**
 * Force flush any pending slide engagement data.
 * Call this on page unload.
 */
export function flushPendingEngagement(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushSlideEngagement();
}

/**
 * Fetch per-deck analytics. Requires authentication.
 */
export async function getDeckAnalytics(
  deckUuid: string,
  period: string = '30d',
): Promise<DeckAnalytics> {
  const response = await fetch(
    `${API_BASE}/api/analytics/deck/${deckUuid}?period=${period}`,
    { headers: getAuthHeaders() },
  );
  if (!response.ok) {
    const msg = await response.text().catch(() => 'Unknown error');
    throw new Error(`Failed to fetch deck analytics: ${msg}`);
  }
  return response.json();
}

/**
 * Fetch slide-by-slide engagement for a deck. Requires authentication.
 */
export async function getSlideEngagement(
  deckUuid: string,
  period: string = '30d',
): Promise<{ slides: SlideEngagement[] }> {
  const response = await fetch(
    `${API_BASE}/api/analytics/deck/${deckUuid}/slides?period=${period}`,
    { headers: getAuthHeaders() },
  );
  if (!response.ok) {
    throw new Error('Failed to fetch slide engagement');
  }
  return response.json();
}

/**
 * Fetch aggregate analytics for the current user. Requires authentication.
 */
export async function getAggregateDashboard(
  period: string = '30d',
): Promise<AggregateDashboard> {
  const response = await fetch(
    `${API_BASE}/api/analytics/dashboard?period=${period}`,
    { headers: getAuthHeaders() },
  );
  if (!response.ok) {
    throw new Error('Failed to fetch aggregate dashboard');
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectDeviceType(): string {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobile|Android|iPhone/i.test(ua)) return 'mobile';
  return 'desktop';
}

/**
 * Parse UTM parameters from current URL.
 * Returns source and platform if present.
 */
export function parseUtmParams(): { source?: string; platform?: string } {
  try {
    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get('utm_source');
    const utmMedium = params.get('utm_medium');

    let source: string | undefined;
    let platform: string | undefined;

    if (utmMedium) {
      if (['social', 'email', 'cpc', 'organic'].includes(utmMedium)) {
        source = utmMedium === 'cpc' ? 'search' : utmMedium;
      } else {
        source = utmMedium;
      }
    }

    if (utmSource) {
      // Map common UTM sources to platform names
      const platformMap: Record<string, string> = {
        linkedin: 'linkedin',
        twitter: 'twitter',
        facebook: 'facebook',
        whatsapp: 'whatsapp',
        email: 'email',
        google: 'google',
      };
      platform = platformMap[utmSource.toLowerCase()] || utmSource;
      if (!source) {
        source = platform === 'google' ? 'search' : 'social';
      }
    }

    return { source, platform };
  } catch {
    return {};
  }
}
