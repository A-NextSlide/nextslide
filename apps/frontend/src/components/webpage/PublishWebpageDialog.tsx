import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { webpageApi, type PublishedWebpage, type WebpageSettings } from '@/services/webpageApi';
import { trackWebpagePublished } from '@/services/analytics';
import {
  Loader2,
  Globe,
  Copy,
  Check,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ============================================================================
// Types
// ============================================================================

interface PublishWebpageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: string;
  deckTitle: string;
  deckDescription?: string;
  slidesData: any[];
  /** If provided, we are editing an existing published webpage */
  existingWebpage?: PublishedWebpage | null;
  onPublished?: (webpage: PublishedWebpage) => void;
}

// ============================================================================
// Component
// ============================================================================

export default function PublishWebpageDialog({
  open,
  onOpenChange,
  deckId,
  deckTitle,
  deckDescription,
  slidesData,
  existingWebpage,
  onPublished,
}: PublishWebpageDialogProps) {
  const { toast } = useToast();

  // Form state
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [showNavigation, setShowNavigation] = useState(true);
  const [leadCaptureEnabled, setLeadCaptureEnabled] = useState(true);

  // Slug validation state
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [slugError, setSlugError] = useState('');
  const slugCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Publishing state
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishedWebpage, setPublishedWebpage] = useState<PublishedWebpage | null>(null);
  const [copied, setCopied] = useState(false);

  const isEditing = !!existingWebpage;

  // Initialize form when dialog opens
  useEffect(() => {
    if (open) {
      if (existingWebpage) {
        setSlug(existingWebpage.slug);
        setTitle(existingWebpage.title);
        setDescription(existingWebpage.description || '');
        const settings = existingWebpage.settings || {};
        setShowNavigation(settings.show_navigation !== false);
        setLeadCaptureEnabled(settings.lead_capture_enabled !== false);
        setSlugStatus('available');
      } else {
        // Generate slug from title
        const generatedSlug = generateSlug(deckTitle);
        setSlug(generatedSlug);
        setTitle(deckTitle);
        setDescription(deckDescription || '');
        setShowNavigation(true);
        setLeadCaptureEnabled(true);
        setSlugStatus('idle');
      }
      setPublished(false);
      setPublishedWebpage(null);
      setCopied(false);
    }
  }, [open, existingWebpage, deckTitle, deckDescription]);

  // Debounced slug availability check
  const checkSlugAvailability = useCallback((value: string) => {
    if (slugCheckTimer.current) {
      clearTimeout(slugCheckTimer.current);
    }

    // Basic local validation
    if (value.length < 3) {
      setSlugStatus('invalid');
      setSlugError('Must be at least 3 characters');
      return;
    }

    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(value) && value.length >= 3) {
      setSlugStatus('invalid');
      setSlugError('Only lowercase letters, numbers, and hyphens allowed');
      return;
    }

    // If editing and slug hasn't changed, skip check
    if (isEditing && existingWebpage?.slug === value) {
      setSlugStatus('available');
      setSlugError('');
      return;
    }

    setSlugStatus('checking');
    setSlugError('');

    slugCheckTimer.current = setTimeout(async () => {
      try {
        const result = await webpageApi.checkSlug(value);
        if (result.valid) {
          setSlugStatus('available');
          setSlugError('');
        } else {
          setSlugStatus(result.available === false ? 'taken' : 'invalid');
          setSlugError(result.error || 'Invalid slug');
        }
      } catch {
        setSlugStatus('invalid');
        setSlugError('Could not check availability');
      }
    }, 400);
  }, [isEditing, existingWebpage]);

  // Handle slug input change
  const handleSlugChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/--+/g, '-');
    setSlug(sanitized);
    if (sanitized.length > 0) {
      checkSlugAvailability(sanitized);
    } else {
      setSlugStatus('idle');
      setSlugError('');
    }
  };

  // Publish / Update handler
  const handlePublish = async () => {
    if (slugStatus !== 'available' || !title.trim() || !slug.trim()) return;

    setPublishing(true);

    try {
      const settings: WebpageSettings = {
        show_navigation: showNavigation,
        lead_capture_enabled: leadCaptureEnabled,
      };

      let result: { success: boolean; webpage: PublishedWebpage };

      if (isEditing && existingWebpage) {
        result = await webpageApi.updateWebpage(existingWebpage.id, {
          slug,
          title: title.trim(),
          description: description.trim() || undefined,
          settings,
          slides_data: slidesData,
        });
      } else {
        result = await webpageApi.publishWebpage({
          deck_id: deckId,
          slug,
          title: title.trim(),
          description: description.trim() || undefined,
          slides_data: slidesData,
          settings,
        });
        trackWebpagePublished({ deckId, slug });
      }

      setPublished(true);
      setPublishedWebpage(result.webpage);
      onPublished?.(result.webpage);

      toast({
        title: isEditing ? 'Webpage updated' : 'Webpage published!',
        description: `Your presentation is live at /s/${slug}`,
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to publish webpage',
        variant: 'destructive',
      });
    } finally {
      setPublishing(false);
    }
  };

  // Copy link
  const handleCopyLink = () => {
    const url = `${window.location.origin}/s/${slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const previewUrl = `/s/${slug}`;
  const fullUrl = `${window.location.origin}${previewUrl}`;
  const canPublish = slugStatus === 'available' && title.trim().length > 0 && slug.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-500" />
            {isEditing ? 'Update Published Webpage' : 'Publish as Webpage'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update your published webpage settings.'
              : 'Turn your presentation into a beautiful scrollable webpage.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Slug Input */}
          <div className="space-y-2">
            <Label htmlFor="slug">URL Slug</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">/s/</span>
              <div className="relative flex-1">
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="my-presentation"
                  maxLength={60}
                  className="pr-8"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  {slugStatus === 'checking' && (
                    <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                  )}
                  {slugStatus === 'available' && (
                    <Check className="h-4 w-4 text-emerald-500" />
                  )}
                  {(slugStatus === 'taken' || slugStatus === 'invalid') && (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>
            </div>
            {slugError && (
              <p className="text-xs text-red-500">{slugError}</p>
            )}
            {slugStatus === 'available' && (
              <p className="text-xs text-emerald-600">
                {fullUrl}
              </p>
            )}
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Presentation title"
              maxLength={200}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of your presentation"
              maxLength={500}
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Settings Toggles */}
          <div className="space-y-4 pt-2 border-t">
            <h4 className="text-sm font-medium">Settings</h4>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="nav-dots" className="text-sm">Navigation dots</Label>
                <p className="text-xs text-muted-foreground">Show progress dots on the right side</p>
              </div>
              <Switch
                id="nav-dots"
                checked={showNavigation}
                onCheckedChange={setShowNavigation}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="lead-capture" className="text-sm">Lead capture form</Label>
                <p className="text-xs text-muted-foreground">Collect emails at the end of the page</p>
              </div>
              <Switch
                id="lead-capture"
                checked={leadCaptureEnabled}
                onCheckedChange={setLeadCaptureEnabled}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {published && (
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={handleCopyLink}
                className="flex-1 sm:flex-auto"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-1.5" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-1.5" />
                    Copy Link
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open(previewUrl, '_blank')}
                className="flex-1 sm:flex-auto"
              >
                <ExternalLink className="h-4 w-4 mr-1.5" />
                View
              </Button>
            </div>
          )}

          <Button
            onClick={handlePublish}
            disabled={!canPublish || publishing}
          >
            {publishing ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : null}
            {isEditing ? 'Update' : 'Publish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Utility: Generate a URL slug from a title
// ============================================================================

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60)
    || 'my-presentation';
}
