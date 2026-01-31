/**
 * SharedWithMeSection
 *
 * A standalone section/card for the dashboard that lists decks
 * shared with the current user. Designed to be dropped into the
 * DeckList page sidebar or as a tab.
 *
 * Features:
 * - Lists decks shared with current user
 * - Shows deck title, sharer info, date, permission badge
 * - Unread indicator (blue dot) for new shares
 * - Click-to-open navigates to the deck (view or edit)
 * - "Mark all as read" button
 * - Empty state when no shares exist
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Pencil, CheckCheck, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sharingApi, type SharedWithMeItem } from '@/services/sharingApi';
import { trackSharedDeckViewed } from '@/services/analytics';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SharedWithMeSection: React.FC = () => {
  const navigate = useNavigate();
  const [shares, setShares] = useState<SharedWithMeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch shares on mount
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await sharingApi.getSharedWithMe();
        if (!cancelled) {
          setShares(data.shares);
        }
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mark all as read
  const handleMarkAllRead = useCallback(async () => {
    const unread = shares.filter((s) => !s.is_read);
    if (unread.length === 0) return;

    // Optimistic update
    setShares((prev) => prev.map((s) => ({ ...s, is_read: true })));

    // Fire API calls
    await Promise.allSettled(unread.map((s) => sharingApi.markAsRead(s.id)));
  }, [shares]);

  // Click a share to open the deck
  const handleShareClick = useCallback(
    async (share: SharedWithMeItem) => {
      // Mark as read
      if (!share.is_read) {
        setShares((prev) =>
          prev.map((s) => (s.id === share.id ? { ...s, is_read: true } : s)),
        );
        sharingApi.markAsRead(share.id).catch(() => {});
      }

      trackSharedDeckViewed({ deckId: share.deck_id, shareId: share.id });

      // Navigate based on permission
      if (share.permission === 'edit') {
        navigate(`/deck/${share.deck_id}`);
      } else {
        navigate(`/deck/${share.deck_id}`);
      }
    },
    [navigate],
  );

  // ---------- Render ----------

  const unreadCount = shares.filter((s) => !s.is_read).length;

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border/60 bg-background p-4">
        <div className="flex items-center gap-2 mb-3">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Shared with me</span>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-md bg-muted/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-background p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Shared with me</span>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 text-[10px] font-semibold rounded-full bg-blue-500 text-white">
              {unreadCount}
            </span>
          )}
        </div>

        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={handleMarkAllRead}
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" />
            Mark all read
          </Button>
        )}
      </div>

      {/* List */}
      {shares.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No presentations shared with you yet</p>
        </div>
      ) : (
        <div className="space-y-1">
          {shares.map((share) => (
            <button
              key={share.id}
              onClick={() => handleShareClick(share)}
              className="w-full flex items-start gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/50 transition-colors group"
            >
              {/* Unread dot */}
              <div className="mt-1.5 flex-shrink-0">
                {!share.is_read ? (
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                ) : (
                  <div className="h-2 w-2" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm leading-tight truncate ${
                    !share.is_read ? 'font-semibold text-foreground' : 'text-foreground/80'
                  }`}
                >
                  {share.deck_title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {share.shared_by_name || share.shared_by_email}
                  {share.message ? ` -- "${share.message}"` : ''}
                </p>
              </div>

              {/* Meta */}
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {formatRelativeDate(share.created_at)}
                </span>
                <span
                  className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                    share.permission === 'edit'
                      ? 'bg-amber-500/10 text-amber-600'
                      : 'bg-blue-500/10 text-blue-600'
                  }`}
                >
                  {share.permission === 'edit' ? (
                    <>
                      <Pencil className="h-2.5 w-2.5" /> Edit
                    </>
                  ) : (
                    <>
                      <Eye className="h-2.5 w-2.5" /> View
                    </>
                  )}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SharedWithMeSection;
