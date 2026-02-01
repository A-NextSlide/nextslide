import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Eye, Repeat2, Award, Users, Info, CheckCheck, Gift, Check, Sparkles } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/SupabaseAuthContext';
import { useCredits } from '@/context/CreditsContext';
import { notificationApi, type Notification, type NotificationType } from '@/services/notificationApi';

// ---------------------------------------------------------------------------
// Social links config
// ---------------------------------------------------------------------------

const SOCIAL_PLATFORMS = [
  {
    key: 'instagram',
    label: 'Instagram',
    url: 'https://instagram.com/nextslide.ai',
    color: 'from-[#833AB4] via-[#E1306C] to-[#F77737]',
    hoverBg: 'hover:opacity-90',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
      </svg>
    ),
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    url: 'https://linkedin.com/company/nextslideai',
    color: 'from-[#0A66C2] to-[#0A66C2]',
    hoverBg: 'hover:opacity-90',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    ),
  },
  {
    key: 'twitter',
    label: 'X',
    url: 'https://x.com/nextslide_',
    color: 'from-[#000000] to-[#000000]',
    hoverBg: 'hover:opacity-90',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ICON_MAP: Record<NotificationType, React.ElementType> = {
  view: Eye,
  remix: Repeat2,
  badge: Award,
  referral: Users,
  system: Info,
  social_follow: Gift,
};

const ICON_COLOR_MAP: Record<NotificationType, string> = {
  view: 'text-blue-500',
  remix: 'text-purple-500',
  badge: 'text-amber-500',
  referral: 'text-green-500',
  system: 'text-zinc-500',
  social_follow: 'text-orange-500',
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

// ---------------------------------------------------------------------------
// Social Follow Notification Card
// ---------------------------------------------------------------------------

function SocialFollowCard({
  notification,
  onUpdate,
}: {
  notification: Notification;
  onUpdate: (updated: Notification) => void;
}) {
  const { refreshBalance } = useCredits();
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(!!notification.data?.credits_claimed);
  const clicked: string[] = notification.data?.clicked_platforms ?? [];
  const allClicked = SOCIAL_PLATFORMS.every((p) => clicked.includes(p.key));

  const handleSocialClick = async (platform: typeof SOCIAL_PLATFORMS[number]) => {
    // Open the social page
    window.open(platform.url, '_blank', 'noopener');

    // Track the click
    if (!clicked.includes(platform.key)) {
      const updated = await notificationApi.trackSocialClick(platform.key);
      if (updated) onUpdate(updated);
    }
  };

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const result = await notificationApi.claimSocialFollowReward();
      if (result.success) {
        setClaimed(true);
        refreshBalance();
        // Update the local notification state
        onUpdate({
          ...notification,
          read: true,
          data: { ...notification.data, credits_claimed: true },
        });
      }
    } finally {
      setClaiming(false);
    }
  };

  if (claimed) {
    return (
      <div className="px-4 py-3 bg-gradient-to-r from-orange-500/5 to-amber-500/5 border-b">
        <div className="flex items-center gap-2 mb-1">
          <div className="flex-shrink-0 rounded-full p-1.5 bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
            <Check className="h-3.5 w-3.5" />
          </div>
          <p className="text-xs font-semibold text-green-700 dark:text-green-400">
            +25 credits claimed!
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground ml-8">
          Thanks for following us on social media.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 bg-gradient-to-r from-orange-500/5 to-amber-500/5 border-b">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex-shrink-0 rounded-full p-1.5 bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold">Come along for the ride!</p>
        </div>
        {!notification.read && (
          <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
        )}
      </div>

      <p className="text-[11px] text-muted-foreground mb-3 ml-8">
        We're early on an exciting journey — follow us on all 3 and get <span className="font-semibold text-foreground">25 free credits</span>.
      </p>

      {/* Branded buttons */}
      <div className="flex flex-wrap gap-2 ml-8 mb-2">
        {SOCIAL_PLATFORMS.map((platform) => {
          const isClicked = clicked.includes(platform.key);
          return (
            <button
              key={platform.key}
              onClick={(e) => {
                e.stopPropagation();
                handleSocialClick(platform);
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-white transition-all bg-gradient-to-r',
                platform.color,
                platform.hoverBg,
                isClicked && 'ring-2 ring-green-400 ring-offset-1 ring-offset-background',
              )}
            >
              {platform.icon}
              <span>{platform.label}</span>
              {isClicked && <Check className="h-3 w-3 ml-0.5" />}
            </button>
          );
        })}
      </div>

      {/* Claim button */}
      {allClicked && !claimed && (
        <div className="ml-8 mt-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleClaim();
            }}
            disabled={claiming}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-semibold text-white bg-gradient-to-r from-[#FF4301] to-[#FF6B00] hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Gift className="h-3.5 w-3.5" />
            {claiming ? 'Claiming...' : 'Claim 25 Credits'}
          </button>
        </div>
      )}

      {/* Progress hint */}
      {!allClicked && (
        <p className="text-[10px] text-muted-foreground ml-8 mt-1.5">
          {clicked.length}/3 followed
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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
  const socialEnsuredRef = useRef(false);

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

  // Ensure social-follow notification exists on first load
  useEffect(() => {
    if (!isAuthenticated || socialEnsuredRef.current) return;
    socialEnsuredRef.current = true;
    notificationApi.ensureSocialFollow().then(() => {
      fetchUnreadCount();
    }).catch(() => {});
  }, [isAuthenticated, fetchUnreadCount]);

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
    // Don't handle clicks on social_follow type — it has its own buttons
    if (n.type === 'social_follow') return;

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

  // Update a notification in local state (used by SocialFollowCard)
  const handleUpdateNotification = (updated: Notification) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === updated.id ? updated : n)),
    );
    if (updated.read) {
      setUnreadCount((c) => Math.max(0, c - 1));
    }
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

  // Separate social follow from regular notifications and pin it at top
  const socialFollowNotif = notifications.find(
    (n) => n.type === 'social_follow' && !n.data?.credits_claimed,
  );
  const regularNotifications = notifications.filter(
    (n) => !(n.type === 'social_follow' && !n.data?.credits_claimed),
  );

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
        <div>
          {/* Pinned social follow card */}
          {socialFollowNotif && (
            <SocialFollowCard
              notification={socialFollowNotif}
              onUpdate={handleUpdateNotification}
            />
          )}

          {loading && notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : regularNotifications.length === 0 && !socialFollowNotif ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            regularNotifications.map((n) => {
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
