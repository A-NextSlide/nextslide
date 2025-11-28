import React, { useState, useEffect, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Image as ImageIcon, Search, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveSlide } from '@/context/ActiveSlideContext';

interface ImageSlotEditorProps {
  propName: string;
  label: string;
  value: string | null | undefined;
  searchQuery?: string;
  objectFit?: 'cover' | 'contain' | 'fill';
  componentId: string;
  onUpdate: (propName: string, value: string) => void;
  onSave: (propName: string, label: string) => void;
}

/**
 * ImageSlotEditor - A component for selecting images in CustomComponent props
 *
 * Opens the global ImagePicker via a custom event and receives the selected
 * image URL back via another event.
 */
const ImageSlotEditor: React.FC<ImageSlotEditorProps> = ({
  propName,
  label,
  value,
  searchQuery,
  objectFit = 'cover',
  componentId,
  onUpdate,
  onSave,
}) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [localUrl, setLocalUrl] = useState(value || '');
  const { activeSlide } = useActiveSlide();

  // Update local URL when prop value changes externally
  useEffect(() => {
    setLocalUrl(value || '');
  }, [value]);

  // Check if value is a placeholder or empty
  const isPlaceholder = !value ||
    value === 'placeholder' ||
    value === '' ||
    value.includes('placeholder');

  // Handle image selection from the global ImagePicker
  const handleImageSelected = useCallback((event: CustomEvent) => {
    const { componentId: targetComponentId, propName: targetPropName, imageUrl } = event.detail;

    // Only handle events for this specific prop
    if (targetComponentId === componentId && targetPropName === propName) {
      setLocalUrl(imageUrl);
      onUpdate(propName, imageUrl);
      onSave(propName, label);
      setIsSelecting(false);
    }
  }, [componentId, propName, onUpdate, onSave, label]);

  // Listen for image selection events
  useEffect(() => {
    window.addEventListener('customcomponent:image-selected' as any, handleImageSelected);
    return () => {
      window.removeEventListener('customcomponent:image-selected' as any, handleImageSelected);
    };
  }, [handleImageSelected]);

  // Open the image picker
  const openImagePicker = () => {
    if (!activeSlide) return;

    setIsSelecting(true);

    // Dispatch event to open the global ImagePicker
    // The SlideContainer listens for this event
    const event = new CustomEvent('image:select-placeholder', {
      detail: {
        componentId,
        slideId: activeSlide.id,
        propName, // Custom: which prop we're selecting for
        topic: searchQuery,
        searchQuery: searchQuery,
        // Flag to indicate this is for a CustomComponent prop
        isCustomComponentProp: true,
      }
    });
    window.dispatchEvent(event);
  };

  // Clear the image
  const clearImage = () => {
    setLocalUrl('');
    onUpdate(propName, '');
    onSave(propName, label);
  };

  // Handle manual URL input
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalUrl(e.target.value);
  };

  const handleUrlBlur = () => {
    if (localUrl !== value) {
      onUpdate(propName, localUrl);
      onSave(propName, label);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>

      {/* Image Preview */}
      <div
        className={cn(
          "relative w-full h-24 rounded-lg border-2 border-dashed overflow-hidden",
          "flex items-center justify-center cursor-pointer",
          "hover:border-primary/50 hover:bg-accent/5 transition-colors",
          isPlaceholder ? "border-muted-foreground/30 bg-muted/20" : "border-muted"
        )}
        onClick={openImagePicker}
      >
        {isSelecting ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-[10px]">Selecting...</span>
          </div>
        ) : isPlaceholder ? (
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground px-2">
            <ImageIcon className="w-6 h-6" />
            {searchQuery && searchQuery !== 'image' ? (
              <>
                <span className="text-[10px] font-medium text-center">
                  Search: "{searchQuery}"
                </span>
                <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/60">
                  <span>Click to find images</span>
                  {objectFit === 'contain' && (
                    <span className="px-1 py-0.5 bg-muted rounded text-[8px]">contain</span>
                  )}
                </div>
              </>
            ) : (
              <span className="text-[10px]">Click to select image</span>
            )}
          </div>
        ) : (
          <>
            <img
              src={localUrl}
              alt={label}
              className="w-full h-full"
              style={{ objectFit }}
              onError={(e) => {
                // Show placeholder on error
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            {/* Clear button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearImage();
              }}
              className="absolute top-1 right-1 p-1 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </>
        )}
      </div>

      {/* URL Input for manual entry */}
      <div className="flex gap-1">
        <Input
          value={localUrl}
          onChange={handleUrlChange}
          onBlur={handleUrlBlur}
          placeholder="Enter image URL or click above"
          className="h-7 text-[10px] flex-1"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2"
          onClick={openImagePicker}
        >
          <Search className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
};

export default ImageSlotEditor;
