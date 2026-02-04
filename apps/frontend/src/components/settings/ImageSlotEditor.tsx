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
  Maximize,
  Upload,
  Plus,
  ChevronDown
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
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  componentId: string;
  onUpdate: (propName: string, value: string) => void;
  onSave: (propName: string, label: string) => void;
  onObjectFitChange?: (fit: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down') => void;
}

type TabType = 'source' | 'edit' | 'fuse';

/**
 * ImageSlotEditor - Redesigned image editor for CustomComponent props
 *
 * Features:
 * - Tabbed interface: Source | AI Edit | Fuse
 * - Object-fit selector
 * - Image fuse with drag-drop
 * - Clean, minimal UI
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
  onObjectFitChange,
}) => {
  const [localUrl, setLocalUrl] = useState(value || '');
  const [isLoading, setIsLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('edit');
  const [aiPrompt, setAiPrompt] = useState('');
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

  const tabs = [
    { id: 'edit' as TabType, label: 'AI Edit', icon: Wand2 },
    { id: 'fuse' as TabType, label: 'Fuse', icon: Layers },
    { id: 'source' as TabType, label: 'URL', icon: Link2 },
  ];

  const fitOptions = [
    { label: 'Cover', value: 'cover' },
    { label: 'Contain', value: 'contain' },
    { label: 'Fill', value: 'fill' },
    { label: 'None', value: 'none' },
    { label: 'Scale Down', value: 'scale-down' },
  ];

  const quickEdits = [
    { label: 'Enhance', prompt: 'Enhance lighting, contrast, and clarity' },
    { label: 'BG Remove', prompt: 'Remove the background and keep the subject clean' },
    { label: 'Cinematic', prompt: 'Add cinematic lighting and shallow depth of field' },
    { label: 'B&W', prompt: 'Convert to a clean black and white look' },
    { label: 'Warm', prompt: 'Warm the tones and add a soft glow' },
    { label: 'Minimal', prompt: 'Simplify the image with a clean, minimal style' },
  ];

  return (
    <div
      className="rounded-md border border-border/60 bg-card/80 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ position: 'relative', zIndex: 20000 }}
    >
      {/* Image Preview */}
      <MediaHub
        trigger={
          <div
            className={cn(
              "relative w-full h-20 cursor-pointer group",
              "bg-[repeating-conic-gradient(#f0f0f0_0_90deg,#fafafa_90deg_180deg)_0_0/10px_10px]",
              isProcessingAi && "pointer-events-none"
            )}
          >
            {isProcessingAi ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-10">
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span className="text-white text-[9px] mt-0.5 font-medium">Processing...</span>
              </div>
            ) : null}
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : isPlaceholder || imageError ? (
              <div className="flex flex-col items-center justify-center h-full gap-1 text-muted-foreground hover:text-foreground transition-colors">
                <ImageIcon className="w-4 h-4" />
                <span className="text-[9px]">
                  {searchQuery && searchQuery !== 'image' ? `"${searchQuery}"` : 'Click to select'}
                </span>
              </div>
            ) : (
              <>
                <img
                  key={localUrl}
                  src={localUrl}
                  alt={label}
                  className={cn(
                    "w-full h-full transition-transform group-hover:scale-[1.01]",
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
                          className="flex items-center gap-px px-1 py-px rounded bg-black/50 backdrop-blur-sm text-white text-[8px] font-medium hover:bg-black/60 transition-colors"
                        >
                          {fitOptions.find(f => f.value === localFit)?.label || 'Cover'}
                          <ChevronDown className="w-2 h-2" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[72px]">
                        {fitOptions.map((option) => (
                          <DropdownMenuItem
                            key={option.value}
                            onClick={() => handleFitChange(option.value as any)}
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
                  <>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <span className="text-white text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        Change
                      </span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); clearImage(); }}
                      className="absolute bottom-1 right-1 p-0.5 rounded-full bg-black/60 hover:bg-black/80 text-white transition-all opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        }
        onSelect={handleMediaSelect}
        defaultSearchTerm={searchQuery && searchQuery !== 'image' ? searchQuery : undefined}
        autoSearch={!!(searchQuery && searchQuery !== 'image')}
      />

      {/* Tabs */}
      <div className="flex border-b border-border/40">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 py-1 text-[9px] font-medium transition-colors",
              activeTab === tab.id
                ? "text-orange-600 border-b-[1.5px] border-orange-500 bg-orange-50/40 dark:bg-orange-500/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            <tab.icon className="w-2.5 h-2.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-1.5">
        {/* Source Tab */}
        {activeTab === 'source' && (
          <div className="space-y-1">
            <Input
              value={localUrl}
              onChange={handleUrlChange}
              onBlur={handleUrlBlur}
              onKeyDown={handleUrlKeyDown}
              placeholder="https://..."
              className="h-6 text-[10px] flex-1"
            />
            <p className="text-[8px] text-muted-foreground">
              Paste URL or click image above to browse
            </p>
          </div>
        )}

        {/* AI Edit Tab */}
        {activeTab === 'edit' && (
          <div className="space-y-1.5">
            {isPlaceholder ? (
              <p className="text-[10px] text-muted-foreground text-center py-2">
                Select an image first
              </p>
            ) : (
              <>
                <Textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Make any change to this image..."
                  className="min-h-[40px] text-[10px] resize-none"
                  disabled={isProcessingAi}
                />
                <div className="flex flex-wrap gap-0.5">
                  {quickEdits.map((edit) => (
                    <button
                      key={edit.label}
                      type="button"
                      className={cn(
                        "px-1.5 py-0.5 rounded border text-[8px] font-medium transition-colors",
                        "bg-muted/20 border-border/60 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600 dark:hover:bg-orange-500/10",
                        isProcessingAi && "opacity-50 pointer-events-none"
                      )}
                      onClick={() => {
                        setAiPrompt(edit.prompt);
                        if (!isProcessingAi) {
                          callEditApi(edit.prompt);
                        }
                      }}
                    >
                      {edit.label}
                    </button>
                  ))}
                </div>
                <Button
                  size="sm"
                  className="w-full h-5 text-[10px] bg-[#FF4301] hover:bg-[#E63901]"
                  disabled={isProcessingAi || !aiPrompt.trim()}
                  onClick={() => callEditApi(aiPrompt)}
                >
                  {isProcessingAi ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      <Wand2 className="w-2.5 h-2.5 mr-1" />
                      Apply
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        )}

        {/* Fuse Tab */}
        {activeTab === 'fuse' && (
          <div className="space-y-1.5">
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

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={cn(
                "border-[1.5px] border-dashed rounded p-1.5 text-center transition-colors",
                isDragging ? "border-orange-400 bg-orange-50/50 dark:bg-orange-500/10" : "border-border/50"
              )}
            >
              <Upload className="w-3 h-3 mx-auto mb-0.5 text-muted-foreground" />
              <p className="text-[8px] text-muted-foreground">
                Drop or <button onClick={() => fuseInputRef.current?.click()} className="text-orange-500 hover:underline">browse</button>
              </p>
            </div>

            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="How to combine? (optional)"
              className="min-h-[36px] text-[10px] resize-none"
              disabled={isProcessingAi}
            />

            <Button
              size="sm"
              className="w-full h-5 text-[10px] bg-[#FF4301] hover:bg-[#E63901]"
              disabled={isProcessingAi || (isPlaceholder && fuseImages.length < 2) || (!isPlaceholder && fuseImages.length < 1)}
              onClick={callFuseApi}
            >
              {isProcessingAi ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <>
                  <Layers className="w-2.5 h-2.5 mr-1" />
                  Fuse {(isPlaceholder ? 0 : 1) + fuseImages.length}
                </>
              )}
            </Button>

            <input
              ref={fuseInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFuseInputChange}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageSlotEditor;
