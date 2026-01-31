import React, { useState, useCallback } from 'react';
import { Check, Copy, Mail, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/services/analytics';

// ---------- Types ----------

export interface SocialSharePanelProps {
  title: string;
  shareUrl: string; // base URL like https://nextslide.ai/p/{code}
  shareCount?: number;
  onShareComplete?: (platform: string) => void;
  className?: string;
}

type Platform = 'linkedin' | 'twitter' | 'email' | 'whatsapp' | 'copy_link';

// ---------- UTM helpers ----------

function urlWithUtm(base: string, platform: string): string {
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}utm_source=share&utm_medium=${platform}&utm_campaign=deck_share`;
}

// ---------- Brand SVG Icons ----------
// Using inline SVGs for brand icons because Lucide does not include brand logos.

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function XTwitterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ---------- Platform Share Actions ----------

function openShareWindow(url: string, platform: string): void {
  // Standard social share window dimensions
  const w = 600;
  const h = 500;
  const left = Math.round((window.screen.width - w) / 2);
  const top = Math.round((window.screen.height - h) / 2);

  window.open(
    url,
    `share_${platform}`,
    `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`
  );
}

// ---------- Component ----------

export default function SocialSharePanel({
  title,
  shareUrl,
  shareCount,
  onShareComplete,
  className,
}: SocialSharePanelProps) {
  const [copied, setCopied] = useState(false);

  const trackShare = useCallback(
    (platform: Platform) => {
      trackEvent('social_share_clicked', { platform });
    },
    []
  );

  const completeShare = useCallback(
    (platform: Platform) => {
      trackEvent('social_share_completed', { platform });
      onShareComplete?.(platform);
    },
    [onShareComplete]
  );

  // --- LinkedIn ---
  const handleLinkedIn = useCallback(() => {
    trackShare('linkedin');
    const link = urlWithUtm(shareUrl, 'linkedin');
    const text = `I just created "${title}" with AI on NextSlide`;
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}&title=${encodeURIComponent(text)}`;
    openShareWindow(url, 'linkedin');
    completeShare('linkedin');
  }, [title, shareUrl, trackShare, completeShare]);

  // --- X / Twitter ---
  const handleTwitter = useCallback(() => {
    trackShare('twitter');
    const link = urlWithUtm(shareUrl, 'twitter');
    const text = `Made "${title}" in seconds with AI`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}&via=NextSlideAI`;
    openShareWindow(url, 'twitter');
    completeShare('twitter');
  }, [title, shareUrl, trackShare, completeShare]);

  // --- Email ---
  const handleEmail = useCallback(() => {
    trackShare('email');
    const link = urlWithUtm(shareUrl, 'email');
    const subject = `Check out "${title}" - made with NextSlide`;
    const body = `I wanted to share this presentation with you:\n\n${title}\n\n${link}\n\nCreated with NextSlide - AI-Powered Presentations`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    completeShare('email');
  }, [title, shareUrl, trackShare, completeShare]);

  // --- WhatsApp ---
  const handleWhatsApp = useCallback(() => {
    trackShare('whatsapp');
    const link = urlWithUtm(shareUrl, 'whatsapp');
    const text = `Check out "${title}" - made with NextSlide AI\n${link}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    openShareWindow(url, 'whatsapp');
    completeShare('whatsapp');
  }, [title, shareUrl, trackShare, completeShare]);

  // --- Copy Link ---
  const handleCopyLink = useCallback(async () => {
    trackShare('copy_link');
    const link = urlWithUtm(shareUrl, 'copy_link');
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      completeShare('copy_link');
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = link;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      completeShare('copy_link');
    }
  }, [shareUrl, trackShare, completeShare]);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Share buttons row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* LinkedIn */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleLinkedIn}
          className="gap-2 text-[#0A66C2] border-[#0A66C2]/30 hover:bg-[#0A66C2]/10"
          aria-label="Share on LinkedIn"
        >
          <LinkedInIcon className="h-4 w-4" />
          <span className="hidden sm:inline">LinkedIn</span>
        </Button>

        {/* X / Twitter */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleTwitter}
          className="gap-2 text-foreground border-border hover:bg-accent"
          aria-label="Share on X"
        >
          <XTwitterIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Post</span>
        </Button>

        {/* WhatsApp */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleWhatsApp}
          className="gap-2 text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/10"
          aria-label="Share on WhatsApp"
        >
          <WhatsAppIcon className="h-4 w-4" />
          <span className="hidden sm:inline">WhatsApp</span>
        </Button>

        {/* Email */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleEmail}
          className="gap-2"
          aria-label="Share via Email"
        >
          <Mail className="h-4 w-4" />
          <span className="hidden sm:inline">Email</span>
        </Button>

        {/* Copy Link */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyLink}
          className={cn(
            'gap-2 transition-colors',
            copied && 'text-green-600 border-green-600/30 bg-green-50'
          )}
          aria-label="Copy link"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              <span className="hidden sm:inline">Copy Link</span>
            </>
          )}
        </Button>
      </div>

      {/* Share count */}
      {typeof shareCount === 'number' && shareCount > 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Share2 className="h-3 w-3" />
          Shared {shareCount} {shareCount === 1 ? 'time' : 'times'}
        </p>
      )}
    </div>
  );
}
