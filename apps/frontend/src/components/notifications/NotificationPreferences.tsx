import React, { useState, useEffect, useCallback } from 'react';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/SupabaseAuthContext';
import { notificationApi, type NotificationPreferences as Prefs } from '@/services/notificationApi';
import { toast } from '@/hooks/use-toast';

/**
 * NotificationPreferences
 *
 * Renders toggle switches for each notification preference and auto-saves
 * when a toggle is changed. Designed to be embedded inside the Profile page
 * under the Notifications tab.
 */
export default function NotificationPreferences() {
  const { isAuthenticated } = useAuth();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Load preferences
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await notificationApi.getPreferences();
        if (!cancelled) setPrefs(data);
      } catch (err) {
        console.error('[NotificationPreferences] Failed to load:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // Toggle a single preference
  const handleToggle = useCallback(
    async (key: keyof Pick<Prefs, 'email_on_views' | 'email_weekly_digest' | 'email_on_badges' | 'in_app_notifications'>) => {
      if (!prefs) return;
      const newValue = !prefs[key];

      // Optimistic update
      setPrefs((prev) => (prev ? { ...prev, [key]: newValue } : prev));
      setSavingKey(key);

      try {
        const updated = await notificationApi.updatePreferences({ [key]: newValue });
        setPrefs(updated);
      } catch (err) {
        // Revert on error
        setPrefs((prev) => (prev ? { ...prev, [key]: !newValue } : prev));
        toast({
          title: 'Failed to save',
          description: 'Could not update your notification preferences. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setSavingKey(null);
      }
    },
    [prefs],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading preferences...
      </div>
    );
  }

  if (!prefs) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Unable to load notification preferences.
      </p>
    );
  }

  const items: {
    key: keyof Pick<Prefs, 'email_on_views' | 'email_weekly_digest' | 'email_on_badges' | 'in_app_notifications'>;
    label: string;
    description: string;
  }[] = [
    {
      key: 'email_on_views',
      label: 'Email me when my presentations are viewed',
      description: 'Receive an email when your presentations reach view milestones',
    },
    {
      key: 'email_weekly_digest',
      label: 'Send me weekly activity digest',
      description: 'A summary of your presentation views and activity every week',
    },
    {
      key: 'email_on_badges',
      label: 'Notify me about badge unlocks',
      description: 'Get notified when you earn new badges and achievements',
    },
    {
      key: 'in_app_notifications',
      label: 'In-app notifications',
      description: 'Show notification bell and real-time alerts in the app',
    },
  ];

  return (
    <div className="space-y-6 max-w-lg">
      {items.map((item, idx) => (
        <React.Fragment key={item.key}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="font-medium text-sm">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            <div className="relative flex items-center">
              {savingKey === item.key && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground mr-2" />
              )}
              <Switch
                checked={prefs[item.key]}
                onCheckedChange={() => handleToggle(item.key)}
                disabled={savingKey !== null}
              />
            </div>
          </div>
          {idx < items.length - 1 && <Separator />}
        </React.Fragment>
      ))}
    </div>
  );
}
