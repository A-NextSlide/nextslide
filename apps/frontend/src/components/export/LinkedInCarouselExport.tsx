/**
 * LinkedIn Carousel Export Dialog
 *
 * A standalone dialog component that exports a deck as a LinkedIn-optimized
 * carousel PDF. Can be triggered from any part of the app.
 *
 * Features:
 * - Format selector (Square 1080x1080 or Portrait 1080x1350)
 * - Slide thumbnail preview
 * - Export to PDF with download
 * - Post-export LinkedIn share prompt
 * - Loading state during generation
 */

import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { exportLinkedInCarousel } from '@/services/carouselExportApi';
import { trackLinkedInCarouselExported } from '@/services/analytics';
import {
  Download,
  Loader2,
  CheckCircle2,
  Linkedin,
  Square,
  RectangleVertical,
  FileText,
  ExternalLink,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LinkedInCarouselExportProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when the dialog should close */
  onOpenChange: (open: boolean) => void;
  /** Deck ID */
  deckId: string;
  /** Deck title */
  title: string;
  /** Slide data array */
  slides: any[];
  /** Optional share URL for the deck (used in LinkedIn share) */
  shareUrl?: string;
}

type ExportFormat = 'square' | 'portrait';
type ExportState = 'idle' | 'exporting' | 'done' | 'error';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const LinkedInCarouselExport: React.FC<LinkedInCarouselExportProps> = ({
  open,
  onOpenChange,
  deckId,
  title,
  slides,
  shareUrl,
}) => {
  const [format, setFormat] = useState<ExportFormat>('square');
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Reset state when dialog opens
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setExportState('idle');
        setErrorMessage('');
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  // Trigger PDF export and download
  const handleExport = useCallback(async () => {
    setExportState('exporting');
    setErrorMessage('');

    try {
      const blob = await exportLinkedInCarousel({
        deckId,
        slides,
        title,
        format,
      });

      // Create object URL and trigger download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 80) || 'carousel'}_linkedin_carousel.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportState('done');

      // Track analytics
      trackLinkedInCarouselExported({
        format,
        slideCount: slides.length,
        deckId,
      });
    } catch (err: any) {
      console.error('[CarouselExport] Export failed:', err);
      setErrorMessage(err?.message || 'Export failed. Please try again.');
      setExportState('error');
    }
  }, [deckId, slides, title, format]);

  // Open LinkedIn share page
  const handleShareToLinkedIn = useCallback(() => {
    const url = shareUrl || `https://app.nextslide.ai/p/${deckId}`;
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    window.open(linkedInUrl, '_blank', 'noopener,noreferrer');
  }, [shareUrl, deckId]);

  // Visible slide count for preview (max 6 thumbnails)
  const previewSlides = slides.slice(0, 6);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Linkedin className="h-5 w-5 text-[#0A66C2]" />
            Export as LinkedIn Carousel
          </DialogTitle>
          <DialogDescription>
            Generate a PDF optimized for LinkedIn carousel posts.
            Each slide becomes a page in the PDF.
          </DialogDescription>
        </DialogHeader>

        {/* ---- Format Selector ---- */}
        <div className="space-y-3 pt-2">
          <Label className="text-sm font-medium">Format</Label>
          <RadioGroup
            value={format}
            onValueChange={(v) => setFormat(v as ExportFormat)}
            className="grid grid-cols-2 gap-3"
          >
            {/* Square */}
            <label
              htmlFor="format-square"
              className={`
                flex flex-col items-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-all
                ${format === 'square'
                  ? 'border-[#0A66C2] bg-blue-50 dark:bg-blue-950/30'
                  : 'border-muted hover:border-muted-foreground/30'}
              `}
            >
              <RadioGroupItem value="square" id="format-square" className="sr-only" />
              <Square className="h-8 w-8 text-muted-foreground" />
              <div className="text-center">
                <div className="font-medium text-sm">Square</div>
                <div className="text-xs text-muted-foreground">1080 x 1080</div>
              </div>
            </label>

            {/* Portrait */}
            <label
              htmlFor="format-portrait"
              className={`
                flex flex-col items-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-all
                ${format === 'portrait'
                  ? 'border-[#0A66C2] bg-blue-50 dark:bg-blue-950/30'
                  : 'border-muted hover:border-muted-foreground/30'}
              `}
            >
              <RadioGroupItem value="portrait" id="format-portrait" className="sr-only" />
              <RectangleVertical className="h-8 w-8 text-muted-foreground" />
              <div className="text-center">
                <div className="font-medium text-sm">Portrait</div>
                <div className="text-xs text-muted-foreground">1080 x 1350</div>
              </div>
            </label>
          </RadioGroup>
        </div>

        {/* ---- Slide Preview ---- */}
        <div className="space-y-2 pt-2">
          <Label className="text-sm font-medium">
            Preview ({slides.length} slide{slides.length !== 1 ? 's' : ''})
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {previewSlides.map((slide, idx) => {
              const bgColor = slide.backgroundColor || slide.background_color || '#1a1a2e';
              const isLight = _isLightColor(bgColor);
              const aspect = format === 'portrait' ? 'aspect-[4/5]' : 'aspect-square';

              return (
                <div
                  key={idx}
                  className={`${aspect} rounded-md overflow-hidden border relative`}
                  style={{ backgroundColor: bgColor }}
                >
                  {/* Background image */}
                  {(slide.backgroundImage || slide.background_image) && (
                    <img
                      src={slide.backgroundImage || slide.background_image}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover opacity-60"
                    />
                  )}
                  <div className="relative p-2 flex flex-col h-full">
                    <div
                      className="text-[8px] font-bold leading-tight line-clamp-2"
                      style={{ color: isLight ? '#000' : '#fff' }}
                    >
                      {slide.title || `Slide ${idx + 1}`}
                    </div>
                    <div className="absolute bottom-1 right-1">
                      <span
                        className="text-[7px] opacity-50"
                        style={{ color: isLight ? '#000' : '#fff' }}
                      >
                        {idx + 1}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            {slides.length > 6 && (
              <div className={`${format === 'portrait' ? 'aspect-[4/5]' : 'aspect-square'} rounded-md border flex items-center justify-center bg-muted`}>
                <span className="text-xs text-muted-foreground">
                  +{slides.length - 6} more
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ---- Error Message ---- */}
        {exportState === 'error' && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
            {errorMessage}
          </div>
        )}

        {/* ---- Success / Share Prompt ---- */}
        {exportState === 'done' && (
          <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-4 space-y-3">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium text-sm">PDF downloaded successfully!</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Upload the PDF to a new LinkedIn post. Want to share a link to
              the interactive version too?
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleShareToLinkedIn}
            >
              <Linkedin className="h-4 w-4 text-[#0A66C2]" />
              Share on LinkedIn
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* ---- Actions ---- */}
        <DialogFooter className="pt-2">
          {exportState !== 'done' ? (
            <Button
              onClick={handleExport}
              disabled={exportState === 'exporting' || slides.length === 0}
              className="gap-2 w-full sm:w-auto"
            >
              {exportState === 'exporting' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Export PDF ({slides.length} slides)
                </>
              )}
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={handleExport}
              className="gap-2 w-full sm:w-auto"
            >
              <Download className="h-4 w-4" />
              Download Again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Quick luminance check to decide text colour for preview thumbnails.
 */
function _isLightColor(hex: string): boolean {
  try {
    const cleaned = hex.replace('#', '');
    const expanded =
      cleaned.length === 3
        ? cleaned
            .split('')
            .map((c) => c + c)
            .join('')
        : cleaned;
    const r = parseInt(expanded.slice(0, 2), 16);
    const g = parseInt(expanded.slice(2, 4), 16);
    const b = parseInt(expanded.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
  } catch {
    return false;
  }
}

export default LinkedInCarouselExport;
