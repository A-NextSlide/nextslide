/** Notification channel categories */
export type NotificationChannel =
  | 'deck-ready'
  | 'deck-shared'
  | 'comment'
  | 'achievement'
  | 'weekly-digest'
  | 'product-update'
  | 'tip'
  | 'collaboration'
  ;

export interface NotificationPreference {
  channel: NotificationChannel;
  label: string;
  description: string;
  push: boolean;
  email: boolean;
  inApp: boolean;
  category: 'activity' | 'social' | 'marketing';
}

export interface NotificationPayload {
  id: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  data?: {
    deckId?: string;
    route?: string;
    actionUrl?: string;
    imageUrl?: string;
  };
  sentAt: string;
  readAt?: string;
}

export interface PushSubscription {
  id: string;
  userId: string;
  platform: 'ios' | 'android' | 'web' | 'desktop';
  token: string;
  deviceName?: string;
  lastActive: string;
  createdAt: string;
}

/** Default notification preferences for new users */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreference[] = [
  { channel: 'deck-ready', label: 'Deck Ready', description: 'When your presentation is done generating', push: true, email: false, inApp: true, category: 'activity' },
  { channel: 'deck-shared', label: 'Deck Shared', description: 'When someone shares a deck with you', push: true, email: true, inApp: true, category: 'social' },
  { channel: 'comment', label: 'Comments', description: 'New comments on your presentations', push: true, email: false, inApp: true, category: 'social' },
  { channel: 'achievement', label: 'Achievements', description: 'Badges and milestones unlocked', push: true, email: false, inApp: true, category: 'activity' },
  { channel: 'weekly-digest', label: 'Weekly Digest', description: 'Summary of your weekly activity', push: false, email: true, inApp: false, category: 'marketing' },
  { channel: 'product-update', label: 'Product Updates', description: 'New features and improvements', push: false, email: true, inApp: true, category: 'marketing' },
  { channel: 'tip', label: 'Tips & Tricks', description: 'Helpful tips to improve your presentations', push: false, email: false, inApp: true, category: 'marketing' },
  { channel: 'collaboration', label: 'Collaboration', description: 'Team invites and shared workspace updates', push: true, email: true, inApp: true, category: 'social' },
];
