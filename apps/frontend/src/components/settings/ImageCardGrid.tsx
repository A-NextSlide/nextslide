import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  Search,
  Upload
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
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { SearchTab } from '@/components/media/SearchTab';

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
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false);
  const [dialogSearchToken, setDialogSearchToken] = useState(0);
  const fuseInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Use label for JS array images, otherwise standard display name
  const displayName = element.isJsArrayImage && element.label
    ? element.label
    : getElementDisplayName(element, index);
  const hasImage = element.src && !element.src.includes('placeholder') && element.src.startsWith('http');

  // Reset search token when dialog opens
  useEffect(() => {
    if (isMediaDialogOpen) {
      setDialogSearchToken(prev => prev + 1);
    }
  }, [isMediaDialogOpen]);

  // Handle object-fit change
  const handleObjectFitChange = (fit: ObjectFitType) => {
    setObjectFit(fit);
    if (onStyleUpdate) {
      onStyleUpdate(element.selector, 'objectFit', fit);
      onRequestHtmlUpdate?.();
      onSave('Changed image fit');
    }
  };

  // Handle image selection from dialog
  const handleImageSelect = useCallback((url: string) => {
    // Close dialog immediately - force unmount by setting state in microtask
    setIsMediaDialogOpen(false);
    setIsProcessing(true);

    // Dispatch processing event so iframe shows loading overlay too
    window.dispatchEvent(new CustomEvent('image:processing', {
      detail: { componentId, propName: element.id, isProcessing: true }
    }));

    // Defer the actual update to next tick so dialog closes first
    requestAnimationFrame(() => {
      onImageUpdate(element.id, url);
      onRequestHtmlUpdate?.();
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
    });
  }, [element.id, componentId, onImageUpdate, onRequestHtmlUpdate, onSave]);

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
      const resp = await fetch('/api/images/edit', {
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
      onRequestHtmlUpdate?.();
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
      const resp = await fetch('/api/images/fuse', {
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
      onRequestHtmlUpdate?.();
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
      onRequestHtmlUpdate?.();
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

  const quickEdits = [
    { label: 'Enhance', prompt: 'Enhance lighting, contrast, and clarity' },
    { label: 'Remove BG', prompt: 'Remove background, keep subject clean' },
    { label: 'Cinematic', prompt: 'Add cinematic lighting and depth' },
  ];

  const fitOptions: { value: ObjectFitType; label: string }[] = [
    { value: 'cover', label: 'Cover' },
    { value: 'contain', label: 'Contain' },
    { value: 'fill', label: 'Fill' },
    { value: 'none', label: 'None' },
    { value: 'scale-down', label: 'Scale Down' },
  ];

  return (
    <div className="space-y-1.5">
      {/* Image Card - Full Width, Taller */}
      <div
        className="relative rounded-lg overflow-hidden border border-border/50 bg-card"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Image or Placeholder - Taller (h-28) */}
        <div
          onClick={() => setIsMediaDialogOpen(true)}
          className={cn(
            "relative w-full h-28 cursor-pointer group",
            "bg-[repeating-conic-gradient(#f5f5f5_0_90deg,#fafafa_90deg_180deg)_0_0/12px_12px]"
          )}
        >
          {isProcessing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20">
              <Loader2 className="w-5 h-5 animate-spin text-white" />
              <span className="text-white text-[9px] mt-1 font-medium">Processing...</span>
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
              {/* Hover overlay */}
              <div className={cn(
                "absolute inset-0 bg-black/0 transition-all duration-200 flex items-center justify-center",
                isHovered && !isExpanded && "bg-black/40"
              )}>
                <span className={cn(
                  "text-white text-[10px] font-medium opacity-0 transition-opacity flex items-center gap-1",
                  isHovered && !isExpanded && "opacity-100"
                )}>
                  <Search className="w-3 h-3" />
                  Click to browse
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-1 text-muted-foreground group-hover:text-foreground transition-colors">
              <ImageIcon className="w-5 h-5" />
              <span className="text-[9px]">Click to select</span>
            </div>
          )}
        </div>

        {/* Top bar with label and fit dropdown */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-1.5 py-1">
          {/* Label badge */}
          <div className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm">
            <span className="text-[9px] text-white font-medium truncate max-w-[120px] block">
              {displayName}
            </span>
          </div>

          {/* Object-fit dropdown - show for all images */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-white text-[9px] font-medium hover:bg-black/70 transition-colors"
              >
                {fitOptions.find(f => f.value === objectFit)?.label || 'Cover'}
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[80px]">
              {fitOptions.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => handleObjectFitChange(option.value)}
                  className={cn(
                    "text-xs",
                    objectFit === option.value && "bg-orange-50 text-orange-600"
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
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="absolute bottom-1.5 left-1.5 right-1.5 flex gap-1"
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
                    "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] font-medium transition-all",
                    expandedAction === action
                      ? "bg-orange-500 text-white shadow-sm"
                      : "bg-white/90 text-gray-700 hover:bg-white hover:shadow-sm backdrop-blur-sm"
                  )}
                >
                  <Icon className="w-3 h-3" />
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
            className="overflow-hidden"
          >
            <div className="p-2 rounded-lg border bg-muted/30 space-y-2">
              {/* AI Edit Panel */}
              {expandedAction === 'edit' && (
                <>
                  {!hasImage ? (
                    <p className="text-[10px] text-muted-foreground text-center py-2">
                      Select an image first
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1">
                        {quickEdits.map(({ label, prompt }) => (
                          <button
                            key={label}
                            onClick={() => callEditApi(prompt)}
                            disabled={isProcessing}
                            className={cn(
                              "px-2.5 py-1.5 rounded text-[10px] font-medium transition-colors",
                              "bg-white border hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600",
                              isProcessing && "opacity-50"
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <Textarea
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder="Custom edit instruction..."
                        className="min-h-[52px] text-[11px] resize-none"
                        disabled={isProcessing}
                      />
                      <Button
                        size="sm"
                        className="w-full h-7 text-[11px] bg-orange-500 hover:bg-orange-600"
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
                  <div className="flex gap-1.5 flex-wrap">
                    {hasImage && (
                      <div className="relative w-10 h-10 rounded border overflow-hidden">
                        <img src={element.src} alt="Base" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <span className="text-[8px] text-white font-medium">Base</span>
                        </div>
                      </div>
                    )}
                    {fuseImages.map((img, idx) => (
                      <div key={idx} className="relative w-10 h-10 rounded border overflow-hidden group">
                        <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                        <button
                          onClick={() => setFuseImages(prev => prev.filter((_, i) => i !== idx))}
                          className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                    {fuseImages.length < 3 && (
                      <button
                        onClick={() => fuseInputRef.current?.click()}
                        className="w-10 h-10 rounded border-2 border-dashed flex items-center justify-center hover:border-orange-300 hover:bg-orange-50/30 text-muted-foreground hover:text-orange-500"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <Input
                    value={fusePrompt}
                    onChange={(e) => setFusePrompt(e.target.value)}
                    placeholder="How to combine? (optional)"
                    className="h-7 text-[11px]"
                    disabled={isProcessing}
                  />
                  <Button
                    size="sm"
                    className="w-full h-7 text-[11px] bg-orange-500 hover:bg-orange-600"
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
                  <div className="flex gap-1.5">
                    <Input
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="Paste image URL..."
                      className="h-7 text-[11px] flex-1"
                      onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      disabled={!urlInput.trim()}
                      onClick={handleUrlSubmit}
                    >
                      <Check className="w-3 h-3" />
                    </Button>
                  </div>
                  <p className="text-[9px] text-muted-foreground">
                    Or click the image above to browse media
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Media Selection Dialog - Instant mount/unmount (no exit animation) */}
      {isMediaDialogOpen && (
        <Dialog open onOpenChange={(open) => { if (!open) setIsMediaDialogOpen(false); }}>
          <DialogContent
            className="p-0 border-0 bg-transparent shadow-2xl w-full max-w-[95vw] sm:max-w-[480px] duration-0 data-[state=closed]:duration-0"
            aria-describedby={undefined}
          >
            <DialogTitle className="sr-only">Select Image</DialogTitle>
            <DialogDescription className="sr-only">
              Search or upload an image for {displayName}
            </DialogDescription>
            <div className="bg-white rounded-2xl overflow-hidden border border-zinc-200 shadow-xl w-full flex flex-col max-h-[85vh]">
              {/* Orange gradient top bar */}
              <div className="h-[3px] bg-gradient-to-r from-[#FF6B00] via-[#FF8533] to-[#FF6B00] shrink-0" />

              {/* Header */}
              <div className="px-4 py-3 border-b border-zinc-100 shrink-0">
                <h2
                  className="text-base text-zinc-900"
                  style={{
                    fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                    fontWeight: 700,
                    letterSpacing: '-0.01em'
                  }}
                >
                  Select Image
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Search or upload an image for {displayName}
                </p>
              </div>

              {/* Upload option */}
              <div className="px-4 py-3 border-b border-zinc-100 bg-zinc-50/50 shrink-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-zinc-300 hover:border-orange-400 hover:bg-orange-50/50 text-sm text-zinc-600 hover:text-orange-600 transition-all"
                >
                  <Upload className="w-4 h-4" />
                  Upload from device
                </button>
              </div>

              {/* Search Tab - with fixed height for scrolling */}
              <div className="flex-1 overflow-hidden flex flex-col min-h-0" style={{ height: '400px' }}>
                <div className="flex-1 overflow-y-auto p-4">
                  <SearchTab
                    onSelect={(url, type) => {
                      if (url && typeof url === 'string') {
                        handleImageSelect(url);
                      }
                    }}
                    defaultSearchTerm={element.alt && element.alt !== 'Image' ? element.alt : undefined}
                    autoSearchToken={dialogSearchToken}
                  />
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
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
      <div className="text-center py-4 text-muted-foreground">
        <ImageIcon className="w-6 h-6 mx-auto mb-1.5 opacity-50" />
        <p className="text-[10px]">No images detected</p>
        <p className="text-[9px] mt-1">Click refresh to re-scan</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
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
