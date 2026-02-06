import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Image as ImageIcon,
  X,
  Loader2,
  Wand2,
  Link2,
  Layers,
  Upload,
  Plus,
  ChevronDown,
  Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { useToast } from '@/hooks/use-toast';
import { MediaHub, MediaSource } from '@/components/media/MediaHub';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ImageSlotEditorProps {
  propName: string;
  label: string;
  value: string | null | undefined;
  searchQuery?: string;
  imageMode?: 'ai' | 'search';
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  componentId: string;
  onUpdate: (propName: string, value: string) => void;
  onSave: (propName: string, label: string) => void;
  onObjectFitChange?: (fit: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down') => void;
}

/**
 * ImageSlotEditor - Redesigned image editor for CustomComponent props
 *
 * Features:
 * - Hover overlay action buttons (AI Edit, Fuse, URL)
 * - Object-fit selector overlaid on image
 * - Category-based AI edit suggestions
 * - Clean, minimal UI matching ImageCardGrid design
 */
const ImageSlotEditor: React.FC<ImageSlotEditorProps> = ({
  propName,
  label,
  value,
  searchQuery,
  imageMode,
  objectFit = 'cover',
  componentId,
  onUpdate,
  onSave,
  onObjectFitChange,
}) => {
  const [localUrl, setLocalUrl] = useState(value || '');
  const [isLoading, setIsLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [expandedAction, setExpandedAction] = useState<'edit' | 'fuse' | 'url' | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  const [isMediaHubOpen, setIsMediaHubOpen] = useState(false);
  const [isProcessingAi, setIsProcessingAi] = useState(false);
  const [localFit, setLocalFit] = useState(objectFit);

  // Fuse state
  const [fuseImages, setFuseImages] = useState<Array<{ name: string; url: string }>>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fuseInputRef = useRef<HTMLInputElement>(null);

  const { activeSlide } = useActiveSlide();
  const { toast } = useToast();

  // Update local URL when prop value changes externally
  useEffect(() => {
    setLocalUrl(value || '');
    setImageError(false);
  }, [value]);

  useEffect(() => {
    setLocalFit(objectFit);
  }, [objectFit]);

  // Clean searchQuery of residual search:/generate: prefixes
  const cleanQuery = (searchQuery || '')
    .replace(/^(?:generate:\s*(?:\d+:\d+\s+)?|search:\s*)/i, '')
    .trim() || undefined;

  // Check if value is a placeholder or empty
  const isPlaceholder = !value ||
    value === 'placeholder' ||
    value === '' ||
    value.includes('placeholder');

  // Handle image selection from the global ImagePicker
  const handleImageSelected = useCallback((event: CustomEvent) => {
    const { componentId: targetComponentId, propName: targetPropName, imageUrl } = event.detail;
    if (targetComponentId === componentId && targetPropName === propName) {
      setLocalUrl(imageUrl);
      setImageError(false);
      onUpdate(propName, imageUrl);
      onSave(propName, label);
    }
  }, [componentId, propName, onUpdate, onSave, label]);

  useEffect(() => {
    window.addEventListener('customcomponent:image-selected' as any, handleImageSelected);
    return () => {
      window.removeEventListener('customcomponent:image-selected' as any, handleImageSelected);
    };
  }, [handleImageSelected]);

  // Handle media selection from MediaHub
  const handleMediaSelect = useCallback((url: string) => {
    if (url && typeof url === 'string') {
      setLocalUrl(url);
      setImageError(false);
      onUpdate(propName, url);
      onSave(propName, label);
      toast({ title: 'Image updated' });
    }
  }, [propName, onUpdate, onSave, label, toast]);

  // Clear the image
  const clearImage = () => {
    setLocalUrl('');
    onUpdate(propName, '');
    onSave(propName, label);
  };

  // Handle manual URL input
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalUrl(e.target.value);
    setImageError(false);
  };

  const handleUrlBlur = () => {
    if (localUrl !== value) {
      onUpdate(propName, localUrl);
      onSave(propName, label);
    }
  };

  const handleUrlKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleUrlBlur();
    }
  };

  // Object fit change
  const handleFitChange = (fit: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down') => {
    setLocalFit(fit);
    onObjectFitChange?.(fit);
  };

  // AI Edit functionality
  const callEditApi = async (instructions: string) => {
    if (!localUrl || isPlaceholder) {
      toast({ title: 'No image', description: 'Select an image first.', variant: 'destructive' });
      return;
    }

    setIsProcessingAi(true);
    // Dispatch event to notify slide renderer that processing has started
    window.dispatchEvent(new CustomEvent('image:processing', {
      detail: { componentId, propName, isProcessing: true }
    }));
    try {
      const resp = await fetch('/api/images/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructions,
          imageUrl: localUrl,
          transparentBackground: false,
        })
      });

      const text = await resp.text();
      if (!resp.ok) {
        let detail = text;
        if (text) {
          try {
            const parsed = JSON.parse(text);
            detail = parsed?.error || parsed?.message || text;
          } catch {}
        }
        throw new Error(detail || 'Edit failed');
      }
      if (!text.trim()) {
        throw new Error('Image edit service returned an empty response.');
      }
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Image edit service returned invalid JSON.');
      }
      const url = data.editedUrl || data.url || data.image_url || data.imageUrl || data.image || '';
      if (!url) throw new Error('No URL in response');

      setLocalUrl(url);
      onUpdate(propName, url);
      onSave(propName, label);
      setAiPrompt('');
      toast({ title: 'Image updated' });
    } catch (e: any) {
      toast({ title: 'Edit failed', description: e?.message || 'Unable to edit image.', variant: 'destructive' });
    } finally {
      setIsProcessingAi(false);
      // Dispatch event to notify slide renderer that processing has stopped
      window.dispatchEvent(new CustomEvent('image:processing', {
        detail: { componentId, propName, isProcessing: false }
      }));
    }
  };

  // Fuse functionality
  const handleFuseFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setFuseImages(prev => [...prev, { name: file.name, url: dataUrl }]);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    files.slice(0, 3).forEach(handleFuseFile);
  };

  const handleFuseInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.slice(0, 3 - fuseImages.length).forEach(handleFuseFile);
    e.target.value = '';
  };

  const removeFuseImage = (index: number) => {
    setFuseImages(prev => prev.filter((_, i) => i !== index));
  };

  const callFuseApi = async () => {
    const allImages: string[] = [];
    if (localUrl && !isPlaceholder) allImages.push(localUrl);
    fuseImages.forEach(img => allImages.push(img.url));

    if (allImages.length < 2) {
      toast({ title: 'Need more images', description: 'Add at least 2 images to fuse.', variant: 'destructive' });
      return;
    }

    setIsProcessingAi(true);
    // Dispatch event to notify slide renderer that processing has started
    window.dispatchEvent(new CustomEvent('image:processing', {
      detail: { componentId, propName, isProcessing: true }
    }));
    try {
      const resp = await fetch('/api/images/fuse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt || 'Blend these images into a cohesive composition',
          images: allImages,
        })
      });

      const text = await resp.text();
      if (!resp.ok) {
        let detail = text;
        if (text) {
          try {
            const parsed = JSON.parse(text);
            detail = parsed?.error || parsed?.message || text;
          } catch {}
        }
        throw new Error(detail || 'Fusion failed');
      }
      if (!text.trim()) {
        throw new Error('Image fuse service returned an empty response.');
      }
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Image fuse service returned invalid JSON.');
      }
      const url = data.url || data.imageUrl || '';
      if (!url) throw new Error('No URL in response');

      setLocalUrl(url);
      onUpdate(propName, url);
      onSave(propName, label);
      setFuseImages([]);
      setAiPrompt('');
      toast({ title: 'Images fused successfully' });
    } catch (e: any) {
      toast({ title: 'Fusion failed', description: e?.message, variant: 'destructive' });
    } finally {
      setIsProcessingAi(false);
      // Dispatch event to notify slide renderer that processing has stopped
      window.dispatchEvent(new CustomEvent('image:processing', {
        detail: { componentId, propName, isProcessing: false }
      }));
    }
  };

  const fitOptions = [
    { label: 'Cover', value: 'cover' },
    { label: 'Contain', value: 'contain' },
    { label: 'Fill', value: 'fill' },
    { label: 'Scale Down', value: 'scale-down' },
  ];

  const editCategories = [
    {
      label: 'Adjust',
      suggestions: [
        { label: 'Enhance quality', prompt: 'Enhance lighting, contrast, and clarity' },
        { label: 'Brighten', prompt: 'Make the image brighter and more vibrant' },
        { label: 'Sharpen', prompt: 'Sharpen the image and increase detail' },
        { label: 'Fix colors', prompt: 'Fix color balance and saturation' },
      ],
    },
    {
      label: 'Style',
      suggestions: [
        { label: 'Cinematic', prompt: 'Add cinematic lighting and depth of field' },
        { label: 'Vintage', prompt: 'Apply a vintage film look with warm tones' },
        { label: 'Watercolor', prompt: 'Transform into a watercolor painting style' },
        { label: 'Minimalist', prompt: 'Simplify to a clean minimalist look' },
      ],
    },
    {
      label: 'Remove',
      suggestions: [
        { label: 'Background', prompt: 'Remove the background completely' },
        { label: 'People', prompt: 'Remove all people from the image' },
        { label: 'Text / watermarks', prompt: 'Remove all text and watermarks' },
        { label: 'Distractions', prompt: 'Remove distracting objects from the background' },
      ],
    },
    {
      label: 'Transform',
      suggestions: [
        { label: 'Cartoon', prompt: 'Turn into a cartoon illustration style' },
        { label: 'Blur background', prompt: 'Blur the background, keep subject sharp' },
        { label: 'Black & white', prompt: 'Convert to dramatic black and white' },
        { label: 'Oil painting', prompt: 'Transform into an oil painting style' },
      ],
    },
  ];

  return (
    <div
      className="space-y-1"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ position: 'relative', zIndex: 20000 }}
    >
      {/* Image Card */}
      <div
        className="relative rounded-md overflow-hidden border border-border/50 bg-card"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Image or Placeholder */}
        <div
          onClick={() => !isProcessingAi && setIsMediaHubOpen(true)}
          className={cn(
            "relative w-full h-24 cursor-pointer group",
            "bg-[repeating-conic-gradient(#f0f0f0_0_90deg,#fafafa_90deg_180deg)_0_0/10px_10px]",
            isProcessingAi && "pointer-events-none"
          )}
        >
          {isProcessingAi && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-10">
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span className="text-white text-[9px] mt-0.5 font-medium">Processing...</span>
            </div>
          )}
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : isPlaceholder || imageError ? (
            <div className="flex flex-col items-center justify-center h-full gap-0.5 text-muted-foreground hover:text-foreground transition-colors px-2">
              <div className="flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                {imageMode && (
                  <span className={cn(
                    "text-[7px] font-bold uppercase px-1 py-px rounded shrink-0",
                    imageMode === 'ai'
                      ? "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400"
                      : "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
                  )}>
                    {imageMode === 'ai' ? 'AI' : 'Search'}
                  </span>
                )}
              </div>
              <span className="text-[8px] text-center line-clamp-2 leading-tight">
                {cleanQuery && cleanQuery !== 'image' ? cleanQuery : 'Click to select'}
              </span>
            </div>
          ) : (
            <>
              <img
                key={localUrl}
                src={localUrl}
                alt={label}
                className={cn(
                  "w-full h-full",
                  isProcessingAi && "opacity-50"
                )}
                style={{ objectFit: localFit }}
                onError={() => setImageError(true)}
                onLoad={() => setIsLoading(false)}
              />
              {/* Top bar with label and fit */}
              <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-1 py-0.5 z-[1]">
                <div className="px-1 py-px rounded bg-black/50 backdrop-blur-sm">
                  <span className="text-[8px] text-white font-medium truncate max-w-[100px] block leading-tight">
                    {label}
                  </span>
                </div>
                {onObjectFitChange && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="flex items-center gap-px px-1 py-px rounded bg-black/50 backdrop-blur-sm text-white text-[8px] font-medium hover:bg-black/60 transition-colors"
                      >
                        {fitOptions.find(f => f.value === localFit)?.label || 'Cover'}
                        <ChevronDown className="w-2 h-2" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[72px]" onPointerDownOutside={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                      {fitOptions.map((option) => (
                        <DropdownMenuItem
                          key={option.value}
                          onClick={(e) => { e.stopPropagation(); handleFitChange(option.value as any); }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className={cn(
                            "text-[11px] py-1",
                            localFit === option.value && "bg-orange-50 text-orange-600 dark:bg-orange-500/10"
                          )}
                        >
                          {option.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {!isProcessingAi && (
                <div className={cn(
                  "absolute inset-0 bg-black/0 transition-all duration-150 flex items-center justify-center",
                  isHovered && !expandedAction && "bg-black/35"
                )}>
                  <span className={cn(
                    "text-white text-[9px] font-medium opacity-0 transition-opacity flex items-center gap-1",
                    isHovered && !expandedAction && "opacity-100"
                  )}>
                    <Search className="w-2.5 h-2.5" />
                    Browse
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Action overlay buttons */}
        {(isHovered || expandedAction) && !isProcessingAi && (
          <div className="absolute bottom-1 left-1 right-1 flex gap-0.5 z-[2]">
            {([
              { action: 'edit' as const, icon: Wand2, actionLabel: 'AI' },
              { action: 'fuse' as const, icon: Layers, actionLabel: 'Fuse' },
              { action: 'url' as const, icon: Link2, actionLabel: 'URL' },
            ]).map(({ action, icon: Icon, actionLabel }) => (
              <button
                key={action}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedAction(expandedAction === action ? null : action);
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-0.5 py-1 rounded text-[9px] font-medium transition-all",
                  expandedAction === action
                    ? "bg-orange-500 text-white"
                    : "bg-white/90 text-zinc-700 hover:bg-white backdrop-blur-sm"
                )}
              >
                <Icon className="w-2.5 h-2.5" />
                {actionLabel}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Expanded Action Panel */}
      {expandedAction && (
        <div className="p-1.5 rounded-md border bg-muted/20 space-y-1.5">
          {/* AI Edit Panel */}
          {expandedAction === 'edit' && (
            <>
              {isPlaceholder ? (
                <p className="text-[9px] text-muted-foreground text-center py-2">
                  Select an image first
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-0.5">
                    {editCategories.map((category) => (
                      <div key={category.label} className="relative group/edit" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                        <button
                          disabled={isProcessingAi}
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors flex items-center gap-px",
                            "bg-background border border-border/60 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600 dark:hover:bg-orange-500/10",
                            isProcessingAi && "opacity-50"
                          )}
                        >
                          {category.label}
                          <ChevronDown className="w-2 h-2 opacity-40" />
                        </button>
                        <div className="absolute top-full left-0 pt-0.5 hidden group-hover/edit:block z-50">
                          <div className="bg-popover rounded-md border shadow-lg py-0.5 min-w-[120px]">
                            {category.suggestions.map((s) => (
                              <button
                                key={s.label}
                                onClick={(e) => { e.stopPropagation(); callEditApi(s.prompt); }}
                                onPointerDown={(e) => e.stopPropagation()}
                                disabled={isProcessingAi}
                                className="w-full text-left px-2 py-1 text-[10px] hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-500/10 transition-colors disabled:opacity-50"
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Custom edit instruction..."
                    className="min-h-[36px] text-[10px] resize-none"
                    disabled={isProcessingAi}
                  />
                  <Button
                    size="sm"
                    className="w-full h-6 text-[10px] bg-[#FF4301] hover:bg-[#E63901]"
                    disabled={isProcessingAi || !aiPrompt.trim()}
                    onClick={() => callEditApi(aiPrompt)}
                  >
                    {isProcessingAi ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Apply'}
                  </Button>
                </>
              )}
            </>
          )}

          {/* Fuse Panel */}
          {expandedAction === 'fuse' && (
            <>
              <div className="flex gap-1 flex-wrap">
                {!isPlaceholder && (
                  <div className="relative w-9 h-9 rounded border overflow-hidden bg-muted/30">
                    <img src={localUrl} alt="Current" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <span className="text-[7px] text-white font-medium">Base</span>
                    </div>
                  </div>
                )}
                {fuseImages.map((img, idx) => (
                  <div key={idx} className="relative w-9 h-9 rounded border overflow-hidden bg-muted/30 group">
                    <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeFuseImage(idx)}
                      className="absolute top-0 right-0 p-0.5 rounded-bl bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-2 h-2" />
                    </button>
                  </div>
                ))}
                {fuseImages.length < 3 && (
                  <button
                    onClick={() => fuseInputRef.current?.click()}
                    className="w-9 h-9 rounded border-[1.5px] border-dashed flex items-center justify-center hover:border-orange-300 hover:bg-orange-50/30 dark:hover:bg-orange-500/10 text-muted-foreground hover:text-orange-500"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <Input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="How to combine? (optional)"
                className="h-6 text-[10px]"
                disabled={isProcessingAi}
              />
              <Button
                size="sm"
                className="w-full h-6 text-[10px] bg-[#FF4301] hover:bg-[#E63901]"
                disabled={isProcessingAi || (isPlaceholder && fuseImages.length < 2) || (!isPlaceholder && fuseImages.length < 1)}
                onClick={callFuseApi}
              >
                {isProcessingAi ? <Loader2 className="w-3 h-3 animate-spin" /> : `Fuse ${(isPlaceholder ? 0 : 1) + fuseImages.length}`}
              </Button>
              <input
                ref={fuseInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFuseInputChange}
              />
            </>
          )}

          {/* URL Panel */}
          {expandedAction === 'url' && (
            <>
              <div className="flex gap-1">
                <Input
                  value={localUrl}
                  onChange={handleUrlChange}
                  onBlur={handleUrlBlur}
                  onKeyDown={handleUrlKeyDown}
                  placeholder="Paste image URL..."
                  className="h-6 text-[10px] flex-1"
                />
              </div>
              <p className="text-[8px] text-muted-foreground">
                Or click the image above to browse
              </p>
            </>
          )}
        </div>
      )}

      {/* MediaHub controlled mode for browse */}
      {isMediaHubOpen && (
        <MediaHub
          open={true}
          onClose={() => setIsMediaHubOpen(false)}
          onSelect={(url) => {
            // Intercept generating/failed placeholders — keep MediaHub open
            if (url === 'generating://ai-image' || url === 'failed://ai-image') {
              return;
            }
            handleMediaSelect(url);
            setIsMediaHubOpen(false);
          }}
          defaultSearchTerm={imageMode !== 'ai' && cleanQuery && cleanQuery !== 'image' ? cleanQuery : undefined}
          autoSearch={imageMode !== 'ai' && !!(cleanQuery && cleanQuery !== 'image')}
          defaultTab={imageMode === 'ai' ? 'generate' : 'search'}
          defaultGeneratePrompt={imageMode === 'ai' && cleanQuery && cleanQuery !== 'image' ? cleanQuery : undefined}
        />
      )}
    </div>
  );
};

export default ImageSlotEditor;
