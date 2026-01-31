import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Send,
  Loader2,
  X,
  Briefcase,
  GraduationCap,
  Megaphone,
  Palette,
  Cpu,
  Heart,
  Check,
} from 'lucide-react';
import { COMMUNITY_CATEGORIES } from '@/services/communityService';
import { showcaseApi } from '@/services/showcaseApi';
import { useToast } from '@/hooks/use-toast';
import { trackEvent } from '@/services/analytics';
import { useReward } from '@/context/RewardContext';
import { cn } from '@/lib/utils';

const CATEGORY_ICONS: Record<string, React.FC<{ className?: string }>> = {
  business: Briefcase,
  education: GraduationCap,
  marketing: Megaphone,
  creative: Palette,
  technology: Cpu,
  personal: Heart,
};

interface SubmitToShowcaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected deck UUID if user is submitting a specific deck */
  deckUuid?: string;
  /** Pre-filled deck name */
  deckName?: string;
  onSuccess?: () => void;
}

export const SubmitToShowcaseDialog: React.FC<SubmitToShowcaseDialogProps> = ({
  open,
  onOpenChange,
  deckUuid: initialDeckUuid,
  deckName: initialDeckName,
  onSuccess,
}) => {
  const { toast } = useToast();
  const { triggerBadgeCheck } = useReward();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [deckUuid, setDeckUuid] = useState(initialDeckUuid || '');
  const [title, setTitle] = useState(initialDeckName || '');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setDeckUuid(initialDeckUuid || '');
      setTitle(initialDeckName || '');
      setDescription('');
      setCategory('');
      setTagInput('');
      setTags([]);
    }
  }, [open, initialDeckUuid, initialDeckName]);

  const handleAddTag = () => {
    const cleaned = tagInput.trim().toLowerCase();
    if (cleaned && !tags.includes(cleaned) && tags.length < 10) {
      setTags([...tags, cleaned]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!deckUuid || !title || !category) {
      toast({
        variant: 'destructive',
        title: 'Missing fields',
        description: 'Please fill in all required fields.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await showcaseApi.submitToShowcase({
        deckUuid,
        title,
        description: description || undefined,
        category,
        tags,
      });

      trackEvent('showcase_submitted', { category });
      triggerBadgeCheck();

      toast({
        title: 'Submitted for review',
        description: 'Your presentation has been submitted. It will appear in the showcase once approved.',
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Submission failed',
        description: error.message || 'Failed to submit to showcase. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = deckUuid && title.trim() && category;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Submit to Showcase</DialogTitle>
          <DialogDescription>
            Share your presentation with the community. It will be reviewed before appearing in the showcase.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          {/* Deck UUID (hidden if pre-set, show input otherwise) */}
          {!initialDeckUuid && (
            <div className="space-y-2">
              <Label htmlFor="deckUuid">Presentation ID</Label>
              <Input
                id="deckUuid"
                value={deckUuid}
                onChange={(e) => setDeckUuid(e.target.value)}
                placeholder="Enter your deck UUID"
                required
              />
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="A descriptive title for the gallery"
              required
              maxLength={100}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe what this presentation is about"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              maxLength={500}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Category *</Label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(COMMUNITY_CATEGORIES).map(([key, cat]) => {
                const IconComponent = CATEGORY_ICONS[key];
                const isSelected = category === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategory(key)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border',
                      isSelected
                        ? `border-transparent text-white shadow-md`
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600',
                    )}
                    style={isSelected ? { backgroundColor: cat.color } : undefined}
                  >
                    {IconComponent && <IconComponent className="h-4 w-4" />}
                    <span>{cat.name}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 ml-auto" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="tags">Tags (up to 10)</Label>
            <div className="flex gap-2">
              <Input
                id="tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Add a tag and press Enter"
                disabled={tags.length >= 10}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddTag}
                disabled={!tagInput.trim() || tags.length >= 10}
                className="flex-shrink-0"
              >
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="px-2 py-0.5 text-xs gap-1 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    onClick={() => handleRemoveTag(tag)}
                  >
                    {tag}
                    <X className="h-3 w-3" />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit for Review
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SubmitToShowcaseDialog;
