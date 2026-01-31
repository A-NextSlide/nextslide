/**
 * Notification API Service
 *
 * Handles all notification-related API calls:
 * - Fetching notifications
 * - Unread count
 * - Marking as read
 * - Notification preferences
 */

import { authService } from './authService';

const rawApiBase = import.meta.env.VITE_API_URL || '';
const API_BASE = rawApiBase.replace(/\/api\/?$/, '');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType = 'view' | 'remix' | 'badge' | 'referral' | 'system';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, any>;
  read: boolean;
  created_at: string;
}

export interface NotificationPreferences {
  user_id: string;
  email_on_views: boolean;
  email_weekly_digest: boolean;
  email_on_badges: boolean;
  in_app_notifications: boolean;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class NotificationApi {
  private getHeaders(): Record<string, string> {
    let token: string | null = null;
    try {
      token = authService.getAuthToken();
    } catch (e) {
      console.warn('[NotificationApi] Failed to get auth token:', e);
    }
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /**
   * Fetch notifications for the current user.
   */
  async getNotifications(unreadOnly = false): Promise<Notification[]> {
    const params = new URLSearchParams();
    if (unreadOnly) params.set('unread_only', 'true');
    const qs = params.toString() ? `?${params}` : '';

    const res = await fetch(`${API_BASE}/api/notifications${qs}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch notifications: ${res.status}`);
    const data = await res.json();
    return data.notifications ?? [];
  }

  /**
   * Get the number of unread notifications.
   */
  async getUnreadCount(): Promise<number> {
    const res = await fetch(`${API_BASE}/api/notifications/count`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch unread count: ${res.status}`);
    const data = await res.json();
    return data.count ?? 0;
  }

  /**
   * Mark a single notification as read.
   */
  async markRead(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/notifications/${id}/read`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to mark notification read: ${res.status}`);
  }

  /**
   * Mark all notifications as read.
   */
  async markAllRead(): Promise<void> {
    const res = await fetch(`${API_BASE}/api/notifications/read-all`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to mark all read: ${res.status}`);
  }

  /**
   * Get notification preferences.
   */
  async getPreferences(): Promise<NotificationPreferences> {
    const res = await fetch(`${API_BASE}/api/notifications/preferences`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch preferences: ${res.status}`);
    return res.json();
  }

  /**
   * Update notification preferences.
   */
  async updatePreferences(
    prefs: Partial<Pick<NotificationPreferences, 'email_on_views' | 'email_weekly_digest' | 'email_on_badges' | 'in_app_notifications'>>,
  ): Promise<NotificationPreferences> {
    const res = await fetch(`${API_BASE}/api/notifications/preferences`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(prefs),
    });
    if (!res.ok) throw new Error(`Failed to update preferences: ${res.status}`);
    return res.json();
  }
}

export const notificationApi = new NotificationApi();
