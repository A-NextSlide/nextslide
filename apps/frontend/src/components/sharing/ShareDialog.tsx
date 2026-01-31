import React, { useState, useCallback, useMemo } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/services/analytics';
import SocialSharePanel from './SocialSharePanel';
import EmbedCodeGenerator from './EmbedCodeGenerator';

// ---------- Types ----------

export interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  shareUrl: string;
  shareCount?: number;
  onShareComplete?: (platform: string) => void;
}

// ---------- Component ----------

export default function ShareDialog({
  open,
  onOpenChange,
  title,
  shareUrl,
  shareCount,
  onShareComplete,
}: ShareDialogProps) {
  const [linkCopied, setLinkCopied] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  // Extract share code from the share URL (e.g. https://nextslide.ai/p/abc123 -> abc123)
  const shareCode = useMemo(() => {
    try {
      const match = shareUrl.match(/\/p\/([A-Za-z0-9_-]+)/);
      return match?.[1] || null;
    } catch {
      return null;
    }
  }, [shareUrl]);

  // Track dialog opened
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        trackEvent('share_dialog_opened', { title });
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, title]
  );

  // Copy the raw link (no UTM - the individual share buttons add UTM)
  const handleCopyRawLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }, [shareUrl]);

  // When a social share completes, show subtle feedback
  const handleShareComplete = useCallback(
    (platform: string) => {
      setShowFeedback(true);
      setTimeout(() => setShowFeedback(false), 4000);
      onShareComplete?.(platform);
    },
    [onShareComplete]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Presentation</DialogTitle>
          <DialogDescription>
            Share &ldquo;{title}&rdquo; with others
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 pt-2">
          {/* --- Share Link Section --- */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              Share link
            </label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={shareUrl}
                className="text-sm text-muted-foreground select-all"
                onFocus={(e) => e.target.select()}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyRawLink}
                className={cn(
                  'shrink-0 transition-colors',
                  linkCopied && 'text-green-600 border-green-600/30 bg-green-50'
                )}
              >
                {linkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* --- Social Share Section --- */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Share on social</p>
            <SocialSharePanel
              title={title}
              shareUrl={shareUrl}
              shareCount={shareCount}
              onShareComplete={handleShareComplete}
            />
          </div>

          {/* --- Embed Section --- */}
          {shareCode && (
            <div className="border-t pt-4">
              <EmbedCodeGenerator shareCode={shareCode} title={title} />
            </div>
          )}

          {/* --- Post-Share Feedback --- */}
          {showFeedback && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-md px-3 py-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
              Nice! We&rsquo;ll notify you when people view it.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
