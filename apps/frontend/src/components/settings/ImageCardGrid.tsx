import React, { useState, useCallback, useRef } from 'react';
import { API_CONFIG } from '@/config/environment';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wand2,
  Layers,
  Link2,
  X,
  Loader2,
  Plus,
  Check,
  Image as ImageIcon,
  ChevronDown,
  Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { VirtualElement } from '@/components/custom-component-editor/types';
import { getElementDisplayName } from '@/utils/customComponentLabels';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MediaHub } from '@/components/media/MediaHub';

interface ImageCardGridProps {
  images: VirtualElement[];
  componentId: string;
  onImageUpdate: (elementId: string, newSrc: string) => void;
  onStyleUpdate?: (selector: string, property: string, value: string) => void;
  onSave: (message?: string) => void;
  onRequestHtmlUpdate?: () => void;
}

type ActionType = 'edit' | 'fuse' | 'url' | null;
type ObjectFitType = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';

interface ImageCardProps {
  element: VirtualElement;
  index: number;
  componentId: string;
  isExpanded: boolean;
  expandedAction: ActionType;
  onToggleAction: (elementId: string, action: ActionType) => void;
  onImageUpdate: (elementId: string, newSrc: string) => void;
  onStyleUpdate?: (selector: string, property: string, value: string) => void;
  onSave: (message?: string) => void;
  onRequestHtmlUpdate?: () => void;
}

const ImageCard: React.FC<ImageCardProps> = ({
  element,
  index,
  componentId,
  isExpanded,
  expandedAction,
  onToggleAction,
  onImageUpdate,
  onStyleUpdate,
  onSave,
  onRequestHtmlUpdate,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [fuseImages, setFuseImages] = useState<Array<{ name: string; url: string }>>([]);
  const [fusePrompt, setFusePrompt] = useState('');
  const [objectFit, setObjectFit] = useState<ObjectFitType>(
    (element.computedStyle?.objectFit as ObjectFitType) || 'cover'
  );
  const fuseInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Use label for JS array images, otherwise standard display name
  const displayName = element.isJsArrayImage && element.label
    ? element.label
    : getElementDisplayName(element, index);
  const hasImage = element.src && !element.src.includes('placeholder') && element.src.startsWith('http');

  // Clean alt text of residual search:/generate: prefixes
  const cleanAlt = (element.alt || '')
    .replace(/^(?:generate:\s*(?:\d+:\d+\s+)?|search:\s*)/i, '')
    .trim() || undefined;

  // Handle object-fit change
  const handleObjectFitChange = (fit: ObjectFitType) => {
    setObjectFit(fit);
    if (onStyleUpdate) {
      onStyleUpdate(element.selector, 'objectFit', fit);
      onRequestHtmlUpdate?.();
      onSave('Changed image fit');
    }
  };

  // Handle image selection from MediaHub
  const handleImageSelect = useCallback((url: string) => {
    setIsProcessing(true);

    // Dispatch processing event so iframe shows loading overlay too
    window.dispatchEvent(new CustomEvent('image:processing', {
      detail: { componentId, propName: element.id, isProcessing: true }
    }));

    onImageUpdate(element.id, url);
    onSave('Changed image');

    // Preload the image, then clear loading state
    const img = new Image();
    const done = () => {
      setIsProcessing(false);
      window.dispatchEvent(new CustomEvent('image:processing', {
        detail: { componentId, propName: element.id, isProcessing: false }
      }));
    };
    img.onload = done;
    img.onerror = done;
    img.src = url;
  }, [element.id, componentId, onImageUpdate, onSave]);

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const { uploadFile } = await import('@/utils/fileUploadUtils');
      const url = await uploadFile(file);
      handleImageSelect(url);
    } catch (error) {
      console.error('Upload failed:', error);
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  // AI Edit API call
  const callEditApi = async (instructions: string) => {
    if (!element.src || !hasImage) {
      toast({ title: 'No image', description: 'Select an image first.', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    window.dispatchEvent(new CustomEvent('image:processing', {
      detail: { componentId, propName: element.id, isProcessing: true }
    }));

    try {
      const resp = await fetch(`${API_CONFIG.BASE_URL}/images/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructions,
          imageUrl: element.src,
          transparentBackground: false,
        })
      });

      const text = await resp.text();
      if (!resp.ok) {
        let detail = text;
        try { detail = JSON.parse(text)?.error || text; } catch {}
        throw new Error(detail || 'Edit failed');
      }

      const data = JSON.parse(text);
      const url = data.editedUrl || data.url || data.image_url || data.imageUrl || '';
      if (!url) throw new Error('No URL in response');

      onImageUpdate(element.id, url);
      onSave('AI edited image');
      setAiPrompt('');
      onToggleAction(element.id, null);
      toast({ title: 'Image updated' });
    } catch (e: any) {
      toast({ title: 'Edit failed', description: e?.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
      window.dispatchEvent(new CustomEvent('image:processing', {
        detail: { componentId, propName: element.id, isProcessing: false }
      }));
    }
  };

  // Fuse API call
  const callFuseApi = async () => {
    const allImages: string[] = [];
    if (hasImage) allImages.push(element.src!);
    fuseImages.forEach(img => allImages.push(img.url));

    if (allImages.length < 2) {
      toast({ title: 'Need more images', description: 'Add at least 2 images to fuse.', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    window.dispatchEvent(new CustomEvent('image:processing', {
      detail: { componentId, propName: element.id, isProcessing: true }
    }));

    try {
      const resp = await fetch(`${API_CONFIG.BASE_URL}/images/fuse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fusePrompt || 'Blend these images into a cohesive composition',
          images: allImages,
        })
      });

      const text = await resp.text();
      if (!resp.ok) throw new Error(JSON.parse(text)?.error || 'Fusion failed');

      const data = JSON.parse(text);
      const url = data.url || data.imageUrl || '';
      if (!url) throw new Error('No URL in response');

      onImageUpdate(element.id, url);
      onSave('Fused images');
      setFuseImages([]);
      setFusePrompt('');
      onToggleAction(element.id, null);
      toast({ title: 'Images fused' });
    } catch (e: any) {
      toast({ title: 'Fusion failed', description: e?.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
      window.dispatchEvent(new CustomEvent('image:processing', {
        detail: { componentId, propName: element.id, isProcessing: false }
      }));
    }
  };

  // Handle URL submit
  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onImageUpdate(element.id, urlInput.trim());
      onSave('Updated image URL');
      setUrlInput('');
      onToggleAction(element.id, null);
      toast({ title: 'Image updated' });
    }
  };

  // Handle fuse file upload
  const handleFuseFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setFuseImages(prev => [...prev.slice(0, 2), { name: file.name, url: e.target?.result as string }]);
    };
    reader.readAsDataURL(file);
  };

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

  const fitOptions: { value: ObjectFitType; label: string }[] = [
    { value: 'cover', label: 'Cover' },
    { value: 'contain', label: 'Contain' },
    { value: 'fill', label: 'Fill' },
    { value: 'none', label: 'None' },
    { value: 'scale-down', label: 'Scale Down' },
  ];

  return (
    <div className="space-y-1">
      {/* Image Card */}
      <div
        className="relative rounded-md overflow-hidden border border-border/50 bg-card"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Image or Placeholder — wrapped in MediaHub popover trigger */}
        <MediaHub
          trigger={
            <div
              className={cn(
                "relative w-full h-24 cursor-pointer group",
                "bg-[repeating-conic-gradient(#f5f5f5_0_90deg,#fafafa_90deg_180deg)_0_0/10px_10px]"
              )}
            >
              {isProcessing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20">
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span className="text-white text-[9px] mt-0.5 font-medium">Processing...</span>
                </div>
              )}

              {hasImage ? (
                <>
                  <img
                    src={element.src}
                    alt={displayName}
                    className="w-full h-full"
                    style={{ objectFit }}
                  />
                  <div className={cn(
                    "absolute inset-0 bg-black/0 transition-all duration-150 flex items-center justify-center",
                    isHovered && !isExpanded && "bg-black/35"
                  )}>
                    <span className={cn(
                      "text-white text-[9px] font-medium opacity-0 transition-opacity flex items-center gap-1",
                      isHovered && !isExpanded && "opacity-100"
                    )}>
                      <Search className="w-2.5 h-2.5" />
                      Browse
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-0.5 text-muted-foreground group-hover:text-foreground transition-colors px-2">
                  <div className="flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                    {element.imageMode && (
                      <span className={cn(
                        "text-[7px] font-bold uppercase px-1 py-px rounded shrink-0",
                        element.imageMode === 'ai'
                          ? "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400"
                          : "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
                      )}>
                        {element.imageMode === 'ai' ? 'AI' : 'Search'}
                      </span>
                    )}
                  </div>
                  <span className="text-[8px] text-center line-clamp-2 leading-tight">
                    {cleanAlt && cleanAlt !== 'Image' ? cleanAlt : 'Click to select'}
                  </span>
                </div>
              )}
            </div>
          }
          onSelect={(url) => {
            // Intercept generating/failed placeholders — show processing overlay
            if (url === 'generating://ai-image') {
              setIsProcessing(true);
              window.dispatchEvent(new CustomEvent('image:processing', {
                detail: { componentId, propName: element.id, isProcessing: true }
              }));
              return;
            }
            if (url === 'failed://ai-image') {
              setIsProcessing(false);
              window.dispatchEvent(new CustomEvent('image:processing', {
                detail: { componentId, propName: element.id, isProcessing: false }
              }));
              return;
            }
            if (url && typeof url === 'string') {
              handleImageSelect(url);
            }
          }}
          defaultSearchTerm={element.imageMode !== 'ai' && cleanAlt && cleanAlt !== 'Image' ? cleanAlt : undefined}
          defaultTab={element.imageMode === 'ai' ? 'generate' : 'search'}
          defaultGeneratePrompt={element.imageMode === 'ai' && cleanAlt && cleanAlt !== 'Image' ? cleanAlt : undefined}
        />

        {/* Top bar with label and fit */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-1 py-0.5">
          <div className="px-1 py-px rounded bg-black/50 backdrop-blur-sm">
            <span className="text-[8px] text-white font-medium truncate max-w-[100px] block leading-tight">
              {displayName}
            </span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-px px-1 py-px rounded bg-black/50 backdrop-blur-sm text-white text-[8px] font-medium hover:bg-black/60 transition-colors"
              >
                {fitOptions.find(f => f.value === objectFit)?.label || 'Cover'}
                <ChevronDown className="w-2 h-2" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[72px]" onPointerDownOutside={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              {fitOptions.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={(e) => { e.stopPropagation(); handleObjectFitChange(option.value); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={cn(
                    "text-[11px] py-1",
                    objectFit === option.value && "bg-orange-50 text-orange-600 dark:bg-orange-500/10"
                  )}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Action overlay buttons */}
        <AnimatePresence>
          {(isHovered || isExpanded) && !isProcessing && (
            <motion.div
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 3 }}
              transition={{ duration: 0.12 }}
              className="absolute bottom-1 left-1 right-1 flex gap-0.5"
            >
              {[
                { action: 'edit' as ActionType, icon: Wand2, label: 'AI' },
                { action: 'fuse' as ActionType, icon: Layers, label: 'Fuse' },
                { action: 'url' as ActionType, icon: Link2, label: 'URL' },
              ].map(({ action, icon: Icon, label }) => (
                <button
                  key={action}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleAction(element.id, expandedAction === action ? null : action);
                  }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-0.5 py-1 rounded text-[9px] font-medium transition-all",
                    expandedAction === action
                      ? "bg-orange-500 text-white"
                      : "bg-white/90 text-zinc-700 hover:bg-white backdrop-blur-sm"
                  )}
                >
                  <Icon className="w-2.5 h-2.5" />
                  {label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Expanded Action Panel */}
      <AnimatePresence>
        {isExpanded && expandedAction && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="p-1.5 rounded-md border bg-muted/20 space-y-1.5">
              {/* AI Edit Panel */}
              {expandedAction === 'edit' && (
                <>
                  {!hasImage ? (
                    <p className="text-[9px] text-muted-foreground text-center py-2">
                      Select an image first
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-0.5">
                        {editCategories.map((category) => (
                          <div key={category.label} className="relative group/edit" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                            <button
                              disabled={isProcessing}
                              className={cn(
                                "px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors flex items-center gap-px",
                                "bg-background border border-border/60 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600 dark:hover:bg-orange-500/10",
                                isProcessing && "opacity-50"
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
                                    disabled={isProcessing}
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
                        className="min-h-[44px] text-[10px] resize-none"
                        disabled={isProcessing}
                      />
                      <Button
                        size="sm"
                        className="w-full h-6 text-[10px] bg-[#FF4301] hover:bg-[#E63901]"
                        disabled={isProcessing || !aiPrompt.trim()}
                        onClick={() => callEditApi(aiPrompt)}
                      >
                        {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Apply'}
                      </Button>
                    </>
                  )}
                </>
              )}

              {/* Fuse Panel */}
              {expandedAction === 'fuse' && (
                <>
                  <div className="flex gap-1 flex-wrap">
                    {hasImage && (
                      <div className="relative w-9 h-9 rounded border overflow-hidden">
                        <img src={element.src} alt="Base" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <span className="text-[7px] text-white font-medium">Base</span>
                        </div>
                      </div>
                    )}
                    {fuseImages.map((img, idx) => (
                      <div key={idx} className="relative w-9 h-9 rounded border overflow-hidden group">
                        <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                        <button
                          onClick={() => setFuseImages(prev => prev.filter((_, i) => i !== idx))}
                          className="absolute top-0 right-0 p-0.5 rounded-bl bg-black/60 text-white opacity-0 group-hover:opacity-100"
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
                    value={fusePrompt}
                    onChange={(e) => setFusePrompt(e.target.value)}
                    placeholder="How to combine? (optional)"
                    className="h-6 text-[10px]"
                    disabled={isProcessing}
                  />
                  <Button
                    size="sm"
                    className="w-full h-6 text-[10px] bg-[#FF4301] hover:bg-[#E63901]"
                    disabled={isProcessing || fuseImages.length < (hasImage ? 1 : 2)}
                    onClick={callFuseApi}
                  >
                    {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : `Fuse ${(hasImage ? 1 : 0) + fuseImages.length} Images`}
                  </Button>
                  <input
                    ref={fuseInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      Array.from(e.target.files || []).slice(0, 3 - fuseImages.length).forEach(handleFuseFile);
                      e.target.value = '';
                    }}
                  />
                </>
              )}

              {/* URL Panel */}
              {expandedAction === 'url' && (
                <>
                  <div className="flex gap-1">
                    <Input
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="Paste image URL..."
                      className="h-6 text-[10px] flex-1"
                      onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 w-6 p-0"
                      disabled={!urlInput.trim()}
                      onClick={handleUrlSubmit}
                    >
                      <Check className="w-2.5 h-2.5" />
                    </Button>
                  </div>
                  <p className="text-[8px] text-muted-foreground">
                    Or click the image above to browse
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

/**
 * ImageCardGrid - Full-width list of image cards with overlay actions
 */
const ImageCardGrid: React.FC<ImageCardGridProps> = ({
  images,
  componentId,
  onImageUpdate,
  onStyleUpdate,
  onSave,
  onRequestHtmlUpdate,
}) => {
  const [expandedState, setExpandedState] = useState<{ elementId: string; action: ActionType } | null>(null);

  const handleToggleAction = useCallback((elementId: string, action: ActionType) => {
    if (action === null || (expandedState?.elementId === elementId && expandedState?.action === action)) {
      setExpandedState(null);
    } else {
      setExpandedState({ elementId, action });
    }
  }, [expandedState]);

  if (images.length === 0) {
    return (
      <div className="text-center py-3 text-muted-foreground">
        <ImageIcon className="w-4 h-4 mx-auto mb-1 opacity-40" />
        <p className="text-[9px]">No images detected</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 pt-1.5">
      {images.map((element, index) => (
        <ImageCard
          key={element.id}
          element={element}
          index={index}
          componentId={componentId}
          isExpanded={expandedState?.elementId === element.id}
          expandedAction={expandedState?.elementId === element.id ? expandedState.action : null}
          onToggleAction={handleToggleAction}
          onImageUpdate={onImageUpdate}
          onStyleUpdate={onStyleUpdate}
          onSave={onSave}
          onRequestHtmlUpdate={onRequestHtmlUpdate}
        />
      ))}
    </div>
  );
};

export default ImageCardGrid;
