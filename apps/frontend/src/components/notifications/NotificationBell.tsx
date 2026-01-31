import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Eye, Repeat2, Award, Users, Info, CheckCheck } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/SupabaseAuthContext';
import { notificationApi, type Notification, type NotificationType } from '@/services/notificationApi';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ICON_MAP: Record<NotificationType, React.ElementType> = {
  view: Eye,
  remix: Repeat2,
  badge: Award,
  referral: Users,
  system: Info,
};

const ICON_COLOR_MAP: Record<NotificationType, string> = {
  view: 'text-blue-500',
  remix: 'text-purple-500',
  badge: 'text-amber-500',
  referral: 'text-green-500',
  system: 'text-zinc-500',
};

function formatTimeAgo(dateStr: string): string {
  try {
    const distance = formatDistanceToNowStrict(new Date(dateStr), { addSuffix: false });
    // Shorten "1 minute" to "1m", "2 hours" to "2h", etc.
    return distance
      .replace(/ seconds?/, 's')
      .replace(/ minutes?/, 'm')
      .replace(/ hours?/, 'h')
      .replace(/ days?/, 'd')
      .replace(/ months?/, 'mo')
      .replace(/ years?/, 'y');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 60_000; // 60 seconds

export default function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasNewAnimation, setHasNewAnimation] = useState(false);
  const prevCountRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const count = await notificationApi.getUnreadCount();
      setUnreadCount(count);
      // Trigger animation when count increases
      if (count > prevCountRef.current && prevCountRef.current >= 0) {
        setHasNewAnimation(true);
        setTimeout(() => setHasNewAnimation(false), 1500);
      }
      prevCountRef.current = count;
    } catch {
      // Silently ignore fetch errors during polling
    }
  }, [isAuthenticated]);

  // Fetch full notification list when popover opens
  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const items = await notificationApi.getNotifications();
      setNotifications(items);
    } catch (err) {
      console.error('[NotificationBell] Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Initial load + polling
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchUnreadCount();
    pollTimerRef.current = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isAuthenticated, fetchUnreadCount]);

  // Load full list when popover opens
  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open, fetchNotifications]);

  // Mark single notification read + navigate
  const handleClickNotification = async (n: Notification) => {
    if (!n.read) {
      try {
        await notificationApi.markRead(n.id);
        setNotifications((prev) =>
          prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch { /* ignore */ }
    }

    // Navigate based on type
    if (n.type === 'view' && n.data?.deck_uuid) {
      navigate(`/deck/${n.data.deck_uuid}`);
    } else if (n.type === 'badge') {
      navigate('/profile?tab=notifications');
    }

    setOpen(false);
  };

  // Mark all read
  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('[NotificationBell] Failed to mark all read:', err);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'relative h-8 w-8 rounded-full',
            hasNewAnimation && 'animate-bounce',
          )}
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-[360px] overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            notifications.map((n) => {
              const IconComp = ICON_MAP[n.type] || Info;
              const iconColor = ICON_COLOR_MAP[n.type] || 'text-zinc-500';
              return (
                <button
                  key={n.id}
                  onClick={() => handleClickNotification(n)}
                  className={cn(
                    'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50',
                    !n.read && 'bg-accent/20',
                  )}
                >
                  <div className={cn('mt-0.5 flex-shrink-0 rounded-full p-1.5 bg-muted', iconColor)}>
                    <IconComp className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-xs leading-tight', !n.read && 'font-semibold')}>
                      {n.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {n.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatTimeAgo(n.created_at)} ago
                    </p>
                  </div>
                  {!n.read && (
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <Separator />
        <div className="p-2">
          <button
            onClick={() => {
              navigate('/profile?tab=notifications');
              setOpen(false);
            }}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1.5 transition-colors"
          >
            See all notifications
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
