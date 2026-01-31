/**
 * ShareDeckDialog
 *
 * A dialog that lets a user share a specific deck with another person.
 * Features:
 * - Email input with validation
 * - Permission selector (View / Edit)
 * - Optional message textarea
 * - "Share" button
 * - List of people already shared with (with remove option)
 * - Uses shadcn Dialog, Input, Select, Button, Textarea
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Send, Trash2, Eye, Pencil, Loader2, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { sharingApi, type SharedByMeItem } from '@/services/sharingApi';
import { trackDeckSharedWithUser } from '@/services/analytics';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ShareDeckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: string;
  deckTitle?: string;
}

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ShareDeckDialog: React.FC<ShareDeckDialogProps> = ({
  open,
  onOpenChange,
  deckId,
  deckTitle,
}) => {
  // Form state
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Existing shares for this deck
  const [existingShares, setExistingShares] = useState<SharedByMeItem[]>([]);
  const [isLoadingShares, setIsLoadingShares] = useState(false);

  // Load existing shares when dialog opens
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const load = async () => {
      setIsLoadingShares(true);
      try {
        const data = await sharingApi.getSharedByMe();
        if (!cancelled) {
          // Filter to shares for this deck
          setExistingShares(data.shares.filter((s) => s.deck_id === deckId));
        }
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setIsLoadingShares(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open, deckId]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setEmail('');
      setPermission('view');
      setMessage('');
      setError(null);
      setSuccess(null);
    }
  }, [open]);

  // Share handler
  const handleShare = useCallback(async () => {
    setError(null);
    setSuccess(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError('Please enter an email address');
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsSending(true);
    try {
      await sharingApi.shareDeck({
        deckId,
        email: trimmedEmail,
        permission,
        message: message.trim() || undefined,
      });

      trackDeckSharedWithUser({ deckId, permission });

      setSuccess(`Shared with ${trimmedEmail}`);
      setEmail('');
      setMessage('');

      // Refresh the list
      const data = await sharingApi.getSharedByMe();
      setExistingShares(data.shares.filter((s) => s.deck_id === deckId));
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to share. Please try again.';
      setError(errorMessage);
    } finally {
      setIsSending(false);
    }
  }, [email, permission, message, deckId]);

  // Remove share handler
  const handleRemoveShare = useCallback(
    async (shareId: string) => {
      // Optimistic update
      setExistingShares((prev) => prev.filter((s) => s.id !== shareId));

      try {
        await sharingApi.removeShare(shareId);
      } catch {
        // Revert on failure -- re-fetch
        const data = await sharingApi.getSharedByMe();
        setExistingShares(data.shares.filter((s) => s.deck_id === deckId));
      }
    },
    [deckId],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Share Presentation
          </DialogTitle>
          {deckTitle && (
            <DialogDescription className="truncate">{deckTitle}</DialogDescription>
          )}
        </DialogHeader>

        {/* Form */}
        <div className="space-y-3 mt-2">
          {/* Email */}
          <div>
            <label htmlFor="share-email" className="text-xs font-medium text-muted-foreground">
              Email address
            </label>
            <Input
              id="share-email"
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
                setSuccess(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleShare();
              }}
              className="mt-1"
            />
          </div>

          {/* Permission */}
          <div>
            <label htmlFor="share-permission" className="text-xs font-medium text-muted-foreground">
              Permission
            </label>
            <Select
              value={permission}
              onValueChange={(v) => setPermission(v as 'view' | 'edit')}
            >
              <SelectTrigger id="share-permission" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">
                  <span className="flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" /> Can view
                  </span>
                </SelectItem>
                <SelectItem value="edit">
                  <span className="flex items-center gap-1.5">
                    <Pencil className="h-3.5 w-3.5" /> Can edit
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Message */}
          <div>
            <label htmlFor="share-message" className="text-xs font-medium text-muted-foreground">
              Message (optional)
            </label>
            <Textarea
              id="share-message"
              placeholder="Check out this presentation..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              className="mt-1 resize-none"
            />
          </div>

          {/* Error / Success */}
          {error && <p className="text-xs text-red-500">{error}</p>}
          {success && <p className="text-xs text-green-600">{success}</p>}

          {/* Share button */}
          <Button
            onClick={handleShare}
            disabled={isSending || !email.trim()}
            className="w-full"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Share
          </Button>
        </div>

        {/* Existing shares */}
        {(existingShares.length > 0 || isLoadingShares) && (
          <div className="mt-4 pt-4 border-t border-border/60">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Already shared with
            </p>

            {isLoadingShares ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-8 rounded bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {existingShares.map((share) => (
                  <div
                    key={share.id}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/30"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-foreground truncate">
                        {share.shared_with_name || share.shared_with_email}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                          share.permission === 'edit'
                            ? 'bg-amber-500/10 text-amber-600'
                            : 'bg-blue-500/10 text-blue-600'
                        }`}
                      >
                        {share.permission === 'edit' ? 'Edit' : 'View'}
                      </span>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500"
                      onClick={() => handleRemoveShare(share.id)}
                      title="Remove access"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ShareDeckDialog;
