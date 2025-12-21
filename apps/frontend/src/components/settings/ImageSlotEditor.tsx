import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Image as ImageIcon,
  X,
  Loader2,
  Wand2,
  Link2,
  Layers,
  Maximize,
  Upload,
  Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { useToast } from '@/hooks/use-toast';
import { MediaHub, MediaSource } from '@/components/media/MediaHub';

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

      if (!resp.ok) throw new Error('Edit failed');
      const data = await resp.json();
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

      if (!resp.ok) throw new Error('Fusion failed');
      const data = await resp.json();
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
      className="rounded-md border bg-card/80 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ position: 'relative', zIndex: 20000 }}
    >
      {/* Header with label */}
      <div className="px-2.5 py-1.5 border-b bg-muted/20 flex items-center gap-2">
        <span className="text-[11px] font-medium truncate flex-1">{label}</span>
        {onObjectFitChange && (
          <Select value={localFit} onValueChange={handleFitChange}>
            <SelectTrigger className="h-5 w-auto gap-1 px-1.5 text-[9px] border-0 bg-transparent text-muted-foreground hover:text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cover" className="text-xs">Cover</SelectItem>
              <SelectItem value="contain" className="text-xs">Contain</SelectItem>
              <SelectItem value="fill" className="text-xs">Fill</SelectItem>
              <SelectItem value="none" className="text-xs">None</SelectItem>
              <SelectItem value="scale-down" className="text-xs">Scale Down</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Image Preview */}
      <MediaHub
        trigger={
          <div
            className={cn(
              "relative w-full h-24 cursor-pointer group",
              "bg-[repeating-conic-gradient(#f0f0f0_0_90deg,#fafafa_90deg_180deg)_0_0/16px_16px]",
              isProcessingAi && "pointer-events-none"
            )}
          >
            {isProcessingAi ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-10">
                <Loader2 className="w-6 h-6 animate-spin text-white" />
                <span className="text-white text-[10px] mt-1.5 font-medium">Processing...</span>
              </div>
            ) : null}
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : isPlaceholder || imageError ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground hover:text-foreground transition-colors">
                <ImageIcon className="w-6 h-6" />
                <span className="text-[10px]">
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
                    "w-full h-full transition-transform group-hover:scale-[1.02]",
                    isProcessingAi && "opacity-50"
                  )}
                  style={{ objectFit: localFit }}
                  onError={() => setImageError(true)}
                  onLoad={() => setIsLoading(false)}
                />
                {!isProcessingAi && (
                  <>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        Change
                      </span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); clearImage(); }}
                      className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white transition-all opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
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
      <div className="flex border-b">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[9px] font-medium transition-colors",
              activeTab === tab.id
                ? "text-orange-600 border-b-2 border-orange-500 bg-orange-50/50"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <tab.icon className="w-3 h-3" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-2">
        {/* Source Tab */}
        {activeTab === 'source' && (
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <Input
                value={localUrl}
                onChange={handleUrlChange}
                onBlur={handleUrlBlur}
                onKeyDown={handleUrlKeyDown}
                placeholder="https://..."
                className="h-7 text-[11px] flex-1"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Paste URL or click image above to browse media
            </p>
          </div>
        )}

        {/* AI Edit Tab */}
        {activeTab === 'edit' && (
          <div className="space-y-2">
            {isPlaceholder ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Select an image first to use AI editing
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Make any change to this image..."
                    className="min-h-[52px] text-[11px] resize-none"
                    disabled={isProcessingAi}
                  />
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">Quick edits</span>
                    <div className="flex flex-wrap gap-1">
                      {quickEdits.map((edit) => (
                        <button
                          key={edit.label}
                          type="button"
                          className={cn(
                            "px-2 py-1 rounded-md border text-[9px] font-medium transition-colors",
                            "bg-muted/30 border-muted-foreground/20 hover:bg-muted/60 hover:border-muted-foreground/40",
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
                  </div>
                  <Button
                    size="sm"
                    className="w-full h-6 text-[11px] bg-orange-500 hover:bg-orange-600"
                    disabled={isProcessingAi || !aiPrompt.trim()}
                    onClick={() => callEditApi(aiPrompt)}
                  >
                    {isProcessingAi ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-3 h-3 mr-1.5" />
                        Apply Edit
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Fuse Tab */}
        {activeTab === 'fuse' && (
          <div className="space-y-2">
            {/* Current + Fuse Images Preview */}
            <div className="flex gap-2 flex-wrap">
              {/* Current image thumbnail */}
              {!isPlaceholder && (
                <div className="relative w-10 h-10 rounded border overflow-hidden bg-muted/30">
                  <img src={localUrl} alt="Current" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <span className="text-[8px] text-white font-medium">Base</span>
                  </div>
                </div>
              )}

              {/* Fuse images */}
              {fuseImages.map((img, idx) => (
                <div key={idx} className="relative w-10 h-10 rounded border overflow-hidden bg-muted/30 group">
                  <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeFuseImage(idx)}
                    className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}

              {/* Add more button */}
              {fuseImages.length < 3 && (
                <button
                  onClick={() => fuseInputRef.current?.click()}
                  className={cn(
                    "w-10 h-10 rounded border-2 border-dashed flex items-center justify-center transition-colors",
                    "hover:border-orange-300 hover:bg-orange-50/30 text-muted-foreground hover:text-orange-500"
                  )}
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={cn(
                "border-2 border-dashed rounded-md p-2 text-center transition-colors",
                isDragging ? "border-orange-400 bg-orange-50/50" : "border-muted-foreground/20"
              )}
            >
              <Upload className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground">
                Drop images here or <button onClick={() => fuseInputRef.current?.click()} className="text-orange-500 hover:underline">browse</button>
              </p>
            </div>

            {/* Fuse prompt */}
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="How to combine? (optional)"
              className="min-h-[46px] text-[11px] resize-none"
              disabled={isProcessingAi}
            />

            {/* Fuse button */}
            <Button
              size="sm"
              className="w-full h-6 text-[11px] bg-orange-500 hover:bg-orange-600"
              disabled={isProcessingAi || (isPlaceholder && fuseImages.length < 2) || (!isPlaceholder && fuseImages.length < 1)}
              onClick={callFuseApi}
            >
              {isProcessingAi ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                  Fusing...
                </>
              ) : (
                <>
                  <Layers className="w-3 h-3 mr-1.5" />
                  Fuse {(isPlaceholder ? 0 : 1) + fuseImages.length} Images
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
