import React, { useState, useRef, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import GradientPicker from '@/components/GradientPicker';
import { ComponentInstance } from '@/types/components';
import { 
  Image as ImageIcon, Upload, Palette, Settings, ChevronRight, Wand2, 
  Square, Circle, Triangle, Hexagon, Star, Heart, 
  Zap, Move3D, Sparkles, Eye, EyeOff, Layers, Frame, Crop
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { createUploadHandler } from '@/utils/fileUploadUtils';
import { useToast } from '@/hooks/use-toast';
import { debounce } from 'lodash-es';
import { Textarea } from '@/components/ui/textarea';
import { MediaHub } from '@/components/media/MediaHub';
import { useDeckStore } from '@/stores/deckStore';
import { uploadFile } from '@/utils/fileUploadUtils';

// Custom Pentagon icon component
const Pentagon = ({ size = 24, ...props }: { size?: number, [key: string]: any }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polygon points="12,2 21,8.5 18,19 6,19 3,8.5" />
  </svg>
);

// Custom Ellipse icon component (squeezed oval)
const Ellipse = ({ size = 24, ...props }: { size?: number, [key: string]: any }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <ellipse cx="12" cy="12" rx="9" ry="6" />
  </svg>
);

interface ImageSettingsEditorProps {
  component: ComponentInstance;
  onUpdate: (propUpdates: Record<string, any>) => void;
  handlePropChange: (propName: string, value: any, skipHistory?: boolean) => void;
  saveComponentToHistory: (message?: string) => void;
}

const ImageSettingsEditor: React.FC<ImageSettingsEditorProps> = ({
  component,
  onUpdate,
  handlePropChange,
  saveComponentToHistory
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const [imageUrl, setImageUrl] = useState(component.props.src || '');
  const deckData = useDeckStore((s: any) => s.deckData);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isProcessingAi, setIsProcessingAi] = useState(false);
  const [fuseAttachments, setFuseAttachments] = useState<Array<{ name: string; url?: string; mimeType?: string; size?: number; pending?: boolean }>>([]);
  const [isDraggingOverPrompt, setIsDraggingOverPrompt] = useState(false);
  const fuseFileInputRef = useRef<HTMLInputElement>(null);
  const [transparentBg, setTransparentBg] = useState(false);
  
  // Collapsible section states
  const [sectionsOpen, setSectionsOpen] = useState({
    appearance: false,
    filters: false,
    effects: false,
    transform: false,
    animation: false,
    crop: false
  });

  // Handle file upload
  const handleUploadButtonClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    
    setIsUploading(true);
    
    try {
      const uploadHandler = createUploadHandler(
        (url: string) => {
          setImageUrl(url);
          handlePropChange('src', url);
          setIsUploading(false);
          toast({ title: "Image uploaded", description: "Your image has been uploaded successfully.", variant: "default" });
        },
        (error: Error) => {
          setIsUploading(false);
          console.error('Error in upload callback:', error);
          toast({ title: "Upload failed", description: `Error: ${error.message}.`, variant: "destructive" });
        }
      );
      await uploadHandler(file);
    } catch (error) {
      setIsUploading(false);
      console.error('Unexpected error in handleFileChange:', error);
      toast({ title: "Upload failed", description: "An unexpected error occurred.", variant: "destructive" });
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handlePropChange, toast]);

  // Debounced URL update
  const debouncedUrlUpdate = useCallback(
    debounce((url: string) => {
      handlePropChange('src', url);
      saveComponentToHistory("Updated image URL");
    }, 500),
    [handlePropChange, saveComponentToHistory]
  );

  const handleUrlChange = (value: string) => {
    setImageUrl(value);
    debouncedUrlUpdate(value);
  };

  // Helper for transparency pattern
  const getTransparencyPattern = () => `
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%)
  `;

  // ---- AI Edit / Fuse helpers ----
  const stylePrefs = (deckData?.data?.outline?.stylePreferences) || (deckData?.outline?.stylePreferences) || {};
  const inferDeckPurpose = (): 'artistic' | 'educational' | 'business' => {
    try {
      const text = (
        (deckData?.title || '') + ' ' +
        (stylePrefs?.initialIdea || '')
      ).toLowerCase();
      if (/art|portfolio|creative|illustration|design showcase/.test(text)) return 'artistic';
      if (/school|class|lesson|course|education|tutorial|training|workshop/.test(text)) return 'educational';
      if (/business|sales|report|strategy|marketing|finance|pitch|q[1-4]|quarterly/.test(text)) return 'business';
    } catch {}
    return 'business';
  };

  const buildGuidedInstructions = (userInstructions: string) => {
    const purpose = inferDeckPurpose();
    const font = stylePrefs?.font ? `Primary font: ${stylePrefs.font}.` : '';
    const colors = stylePrefs?.colors ? `Use deck colors: background ${stylePrefs.colors.background || ''}, text ${stylePrefs.colors.text || ''}, accent ${stylePrefs.colors.accent1 || ''}.` : '';
    const vibe = stylePrefs?.vibeContext ? `Visual vibe: ${stylePrefs.vibeContext}.` : '';
    const accuracy = (purpose === 'educational' || purpose === 'business')
      ? 'Ensure visuals are factually accurate and appropriate. Avoid invented labels, fake logos, or misleading depictions.'
      : 'Focus on strong composition and clarity.';
    const styleTone = purpose === 'artistic'
      ? 'Make it artistically expressive with tasteful lighting and composition.'
      : purpose === 'educational'
      ? 'Make it clear, didactic, and easy to understand.'
      : 'Make it polished, professional, and presentation-ready.';
    const template = 'Adhere to the slide template feel so the result matches the deck’s look-and-feel.';
    const transparency = transparentBg ? 'If possible, produce a PNG with a transparent background.' : '';
    return [
      userInstructions?.trim() || '',
      styleTone,
      accuracy,
      vibe,
      colors,
      font,
      template,
      transparency,
      `Maintain subject identity consistency across this deck.`
    ].filter(Boolean).join(' ');
  };

  const computeSizeHint = () => {
    const w = Number(component.props.width) || 1024;
    const h = Number(component.props.height) || 576;
    const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
    const targetW = clamp(Math.round(w), 512, 1536);
    const targetH = clamp(Math.round(h), 512, 1536);
    return `${targetW}x${targetH}`;
  };

  const computeAspectRatio = (): string => {
    try {
      const w = Math.max(1, Math.round(Number(component.props.width) || 1024));
      const h = Math.max(1, Math.round(Number(component.props.height) || 576));
      const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
      const g = gcd(w, h) || 1;
      return `${Math.round(w / g)}:${Math.round(h / g)}`;
    } catch {
      return '16:9';
    }
  };

  const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const resolveImageParam = async (src: string): Promise<{ imageUrl?: string; imageBase64?: string }> => {
    const s = (src || '').trim();
    if (!s) return {};
    if (s.startsWith('data:')) {
      return { imageBase64: s };
    }
    // Block non-http(s) custom schemes (e.g., generating://ai-image)
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) && !(s.startsWith('http://') || s.startsWith('https://') || s.startsWith('blob:') || s.startsWith('data:'))) {
      return {};
    }
    if (s.startsWith('blob:')) {
      try {
        const resp = await fetch(s);
        const blob = await resp.blob();
        const dataUrl = await blobToDataUrl(blob);
        return { imageBase64: dataUrl };
      } catch {
        return {};
      }
    }
    if (s.startsWith('/')) {
      // Likely a dev asset; convert to base64 to avoid non-public URL issues
      try {
        const abs = `${window.location.origin}${s}`;
        const resp = await fetch(abs, { credentials: 'include' });
        const blob = await resp.blob();
        const dataUrl = await blobToDataUrl(blob);
        return { imageBase64: dataUrl };
      } catch {
        return {};
      }
    }
    if (s.startsWith('http://') || s.startsWith('https://')) {
      try {
        const u = new URL(s);
        const host = (u.hostname || '').toLowerCase();
        if (host.includes('localhost') || host === '127.0.0.1' || host.endsWith('.local')) {
          // Not publicly fetchable by upstream; convert to base64
          const resp = await fetch(s, { credentials: 'include' });
          const blob = await resp.blob();
          const dataUrl = await blobToDataUrl(blob);
          return { imageBase64: dataUrl };
        }
        // Public URL
        return { imageUrl: s };
      } catch {
        return { imageUrl: s };
      }
    }
    return { imageUrl: s };
  };

  const handleDropOnPrompt = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverPrompt(false);
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/')).slice(0, 3);
    if (files.length === 0) return;
    // Show pending chips immediately
    const pending = files.map(f => ({ name: f.name, size: f.size, mimeType: f.type, pending: true }));
    setFuseAttachments(prev => [...prev, ...pending]);
    try {
      const uploaded = await Promise.all(files.map(async (file) => {
        const url = await uploadFile(file);
        return { name: file.name, size: file.size, mimeType: file.type, url };
      }));
      setFuseAttachments(prev => {
        const next = [...prev];
        // replace first N pending entries with uploaded
        let replaced = 0;
        for (let i = 0; i < next.length && replaced < uploaded.length; i++) {
          if (next[i].pending) {
            next[i] = uploaded[replaced++];
          }
        }
        return next;
      });
      toast({ title: 'Image attached', description: 'Added image for fusion', variant: 'default' });
    } catch (err) {
      setFuseAttachments(prev => prev.filter(a => !a.pending));
      toast({ title: 'Attachment failed', description: 'Could not upload image.', variant: 'destructive' });
    }
  };

  const handlePickFuseFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/')).slice(0, 3);
    if (files.length === 0) return;
    // Reset
    e.target.value = '';
    const pending = files.map(f => ({ name: f.name, size: f.size, mimeType: f.type, pending: true }));
    setFuseAttachments(prev => [...prev, ...pending]);
    try {
      const uploaded = await Promise.all(files.map(async (file) => {
        const url = await uploadFile(file);
        return { name: file.name, size: file.size, mimeType: file.type, url };
      }));
      setFuseAttachments(prev => {
        const next = [...prev];
        let replaced = 0;
        for (let i = 0; i < next.length && replaced < uploaded.length; i++) {
          if (next[i].pending) next[i] = uploaded[replaced++];
        }
        return next;
      });
      toast({ title: 'Image attached', description: 'Added image for fusion', variant: 'default' });
    } catch (err) {
      setFuseAttachments(prev => prev.filter(a => !a.pending));
      toast({ title: 'Attachment failed', description: 'Could not upload image.', variant: 'destructive' });
    }
  };

  const callEditApi = async () => {
    const src = (component.props.src || '').trim();
    if (!src) {
      toast({ title: 'No image selected', description: 'Add or select an image first.', variant: 'destructive' });
      return;
    }
    let effectiveSrc = src;
    if (src.startsWith('generating://')) {
      try {
        // Ensure a stable logo placeholder exists in storage and use it
        const { uploadUrlToFixedPath } = await import('@/utils/fileUploadUtils');
        // Prefer shipping placeholder.svg from public and store as PNG/SVG with stable path
        const localPlaceholderUrl = `${window.location.origin}/placeholder.svg`;
        const path = 'placeholders/logo-placeholder.svg';
        const publicUrl = await uploadUrlToFixedPath(localPlaceholderUrl, 'slide-media', path, 'image/svg+xml', true);
        effectiveSrc = publicUrl;
        handlePropChange('src', publicUrl);
        saveComponentToHistory('Set logo placeholder image');
      } catch (e) {
        toast({ title: 'Placeholder not available', description: 'Could not provision logo placeholder. Upload an image first.', variant: 'destructive' });
        return;
      }
    }
    const instructions = buildGuidedInstructions(aiPrompt);
    const size = computeSizeHint();
    const aspectRatio = computeAspectRatio();
    setIsProcessingAi(true);
    try {
      const { imageUrl, imageBase64 } = await resolveImageParam(effectiveSrc);
      const payload: any = {
        instructions,
        transparentBackground: transparentBg,
        aspectRatio
      };
      if (imageBase64) payload.imageBase64 = imageBase64;
      else if (imageUrl) payload.imageUrl = imageUrl;
      const resp = await fetch('/api/images/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) throw new Error('Edit failed');
      const data = await resp.json();
      const url = data.editedUrl || data.url || data.image_url || data.imageUrl || data.image || '';
      if (!url) throw new Error('No URL in response');
      handlePropChange('src', url);
      if (data.model_used) handlePropChange('aiModel', data.model_used, true);
      if (data.revised_prompt) handlePropChange('aiInterpretation', data.revised_prompt, true);
      saveComponentToHistory('AI edit applied');
      toast({ title: 'Image updated', description: 'Applied AI edit to your image.' });
    } catch (e: any) {
      toast({ title: 'Edit failed', description: e?.message || 'Unable to edit image.', variant: 'destructive' });
    } finally {
      setIsProcessingAi(false);
    }
  };

  const callFuseApi = async () => {
    const imgs: string[] = [];
    const src = (component.props.src || '').trim();
    if (src) imgs.push(src);
    fuseAttachments.forEach(a => { if (a.url) imgs.push(a.url); });
    if (imgs.length < 2) {
      toast({ title: 'Need another image', description: 'Drop or attach at least one more image to fuse.', variant: 'destructive' });
      return;
    }
    const prompt = buildGuidedInstructions(aiPrompt || 'Compose a single cohesive image that blends the inputs naturally.');
    const size = computeSizeHint();
    setIsProcessingAi(true);
    try {
      const resp = await fetch('/api/images/fuse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, images: imgs, size })
      });
      if (!resp.ok) throw new Error('Fusion failed');
      const data = await resp.json();
      const url = data.url || data.image_url || '';
      if (!url) throw new Error('No URL in response');
      handlePropChange('src', url);
      if (data.model_used) handlePropChange('aiModel', data.model_used, true);
      if (data.revised_prompt) handlePropChange('aiInterpretation', data.revised_prompt, true);
      saveComponentToHistory('AI fusion applied');
      toast({ title: 'Image updated', description: 'Fused images into a new result.' });
    } catch (e: any) {
      toast({ title: 'Fusion failed', description: e?.message || 'Unable to fuse images.', variant: 'destructive' });
    } finally {
      setIsProcessingAi(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Media switcher and AI edit/fuse */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Media</Label>
        <div className="flex items-center gap-2 overflow-x-hidden">
          <MediaHub trigger={<Button variant="outline" size="sm" className="h-7 px-2 text-[11px]">Swap media</Button>} onSelect={(url) => {
            if (url && typeof url === 'string') {
              setImageUrl(url);
              handlePropChange('src', url);
              saveComponentToHistory('Changed image source');
            }
          }} />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">AI Edit & Fuse</Label>
        <div
          className={cn(
            "border rounded-md p-2",
            isDraggingOverPrompt ? 'ring-1 ring-orange-400' : ''
          )}
          onDragOver={(e) => { e.preventDefault(); setIsDraggingOverPrompt(true); }}
          onDragLeave={() => setIsDraggingOverPrompt(false)}
          onDrop={handleDropOnPrompt}
        >
          <Textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Describe how to edit this image… (You can also drop images here to fuse)"
            className="min-h-[60px] text-xs resize-none border-none p-0 shadow-none focus-visible:ring-0"
            disabled={isProcessingAi}
          />
          
          {/* Attachments chips */}
          {fuseAttachments.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {fuseAttachments.map((a, idx) => (
                <div key={`${a.name}-${idx}`} className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border', a.pending ? 'bg-orange-50/60 border-orange-300 text-orange-700' : 'bg-muted/40 border-border') }>
                  <span className="truncate max-w-[120px]">{a.pending ? `Processing ${a.name}` : a.name}</span>
                  {!a.pending && (
                    <button className="opacity-70 hover:opacity-100" onClick={() => setFuseAttachments(prev => prev.filter((_, i) => i !== idx))}>×</button>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {/* Suggestions */}
          <div 
            className={cn(
              "flex flex-wrap gap-1 transition-all duration-300 ease-out overflow-hidden",
              aiPrompt ? "opacity-0 max-h-0 mt-0" : "opacity-100 max-h-10 mt-2"
            )}
          >
            {[
              { label: 'remove background', action: () => setAiPrompt(p => (p ? p + ' remove background' : 'Remove background')) },
              { label: 'blur background', action: () => setAiPrompt(p => (p ? p + ' blur background' : 'Blur background')) },
              { 
                label: 'recolor to brand palette', 
                action: () => {
                  const colors = stylePrefs?.colors;
                  const brandColors = colors ? ` using brand colors: ${colors.accent1 || ''} accent, ${colors.background || ''} background, ${colors.text || ''} text` : '';
                  setAiPrompt(p => (p ? p + ` recolor to brand palette${brandColors}` : `Recolor to brand palette${brandColors}`));
                }
              },
              { label: 'clean edges', action: () => setAiPrompt(p => (p ? p + ' clean edges' : 'Clean edges')) }
            ].map(({ label, action }) => (
              <button 
                key={label} 
                type="button" 
                className="px-2 py-0.5 rounded-full border text-[10px] hover:bg-accent hover:border-orange-400/50 transition-colors" 
                onClick={action}
              >
                {label}
              </button>
            ))}
          </div>
          
          {/* Actions row */}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              <Button size="sm" className="h-6 px-3 text-[11px]" disabled={isProcessingAi} onClick={callEditApi}>
                Apply edit
              </Button>
              {fuseAttachments.filter(a => !a.pending).length > 0 && (
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={isProcessingAi} onClick={callFuseApi}>
                  Fuse
                </Button>
              )}
              <input ref={fuseFileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickFuseFiles} />
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => fuseFileInputRef.current?.click()}>
                + Add image
              </Button>
            </div>
          </div>
          
          {/* Transparent BG toggle on its own line */}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t">
            <Switch 
              id="transparent-bg" 
              checked={transparentBg} 
              onCheckedChange={setTransparentBg} 
              className="scale-75 data-[state=checked]:bg-orange-400" 
            />
            <label htmlFor="transparent-bg" className="text-[10px] text-muted-foreground cursor-pointer">
              Transparent background
            </label>
          </div>
        </div>
      </div>

      {/* Image Source Section */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Image Source</Label>
        <div className="flex items-center space-x-2">
          <Input 
            type="text" 
            value={imageUrl} 
            onChange={(e) => handleUrlChange(e.target.value)}
            className="h-8 text-xs flex-1" 
            placeholder="https://..." 
          />
        </div>
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          style={{ display: 'none' }}
        />
        <Button 
          variant="outline" 
          size="sm" 
          className="h-8 text-xs w-full"
          onClick={handleUploadButtonClick}
          disabled={isUploading}
        >
          {isUploading ? (
            <span className="flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Uploading...
            </span>
          ) : (
            <span className="flex items-center">
              <Upload className="w-3 h-3 mr-2" />
              Upload Image
            </span>
          )}
        </Button>
        
        {/* Alt Text */}
        <div className="space-y-1 mt-2">
          <Label className="text-xs">Alt Text</Label>
          <Input 
            type="text" 
            value={component.props.alt || ''} 
            onChange={(e) => handlePropChange('alt', e.target.value)}
            className="h-8 text-xs" 
            placeholder="Describe this image..."
          />
        </div>
        
        {/* Object Fit */}
        <div className="space-y-1">
          <Label className="text-xs">Fit Mode</Label>
          <Select 
            value={component.props.objectFit || 'cover'} 
            onValueChange={(value) => handlePropChange('objectFit', value)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cover">Cover</SelectItem>
              <SelectItem value="contain">Contain</SelectItem>
              <SelectItem value="fill">Fill</SelectItem>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="scale-down">Scale Down</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Crop Section */}
      <Collapsible 
        open={sectionsOpen.crop} 
        onOpenChange={(open) => setSectionsOpen(prev => ({ ...prev, crop: open }))}
      >
        <CollapsibleTrigger showIcon={false} className="flex items-center justify-between w-full py-2 px-2 bg-secondary/50 rounded-md hover:bg-secondary/70 transition-colors">
          <div className="flex items-center gap-1">
            <Crop size={14} />
            <span className="text-xs font-medium">Crop</span>
          </div>
          <ChevronRight size={12} className="transition-transform data-[state=open]:rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-1 py-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1">
              <Button 
                variant="default" 
                size="sm" 
                className="h-7 text-xs"
                onClick={() => {
                  // signal start cropping for this component
                  import('@/stores/editorSettingsStore').then(({ useEditorSettingsStore }) => {
                    useEditorSettingsStore.getState().startImageCrop(component.id);
                  });
                }}
              >Start Crop</Button>
              {!!(component.props.cropRect && (component.props.cropRect.left || component.props.cropRect.top || component.props.cropRect.right || component.props.cropRect.bottom)) && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7 text-xs"
                  onClick={() => {
                    // reset crop
                    handlePropChange('cropRect', { left: 0, top: 0, right: 0, bottom: 0 });
                    saveComponentToHistory('Reset image crop');
                  }}
                >Reset</Button>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Appearance Section */}
      <Collapsible 
        open={sectionsOpen.appearance} 
        onOpenChange={(open) => setSectionsOpen(prev => ({ ...prev, appearance: open }))}
      >
        <CollapsibleTrigger showIcon={false} className="flex items-center justify-between w-full py-2 px-2 bg-secondary/50 rounded-md hover:bg-secondary/70 transition-colors">
          <div className="flex items-center gap-1">
            <Frame size={14} />
            <span className="text-xs font-medium">Appearance</span>
          </div>
          <ChevronRight size={12} className="transition-transform data-[state=open]:rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-1 py-2 space-y-3">
          {/* Border Controls */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Border</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Radius</Label>
                <div className="flex items-center">
                  <Slider 
                    min={0} 
                    max={50} 
                    step={1} 
                    value={[component.props.borderRadius || 0]} 
                    onValueChange={([value]) => handlePropChange('borderRadius', value, true)}
                    onValueCommit={() => saveComponentToHistory("Updated border radius")}
                    className="flex-1" 
                  />
                  <span className="text-xs ml-2 w-8 text-right">{component.props.borderRadius || 0}px</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Width</Label>
                <div className="flex items-center">
                  <Slider 
                    min={0} 
                    max={10} 
                    step={1} 
                    value={[component.props.borderWidth || 0]} 
                    onValueChange={([value]) => handlePropChange('borderWidth', value, true)}
                    onValueCommit={() => saveComponentToHistory("Updated border width")}
                    className="flex-1" 
                  />
                  <span className="text-xs ml-2 w-8 text-right">{component.props.borderWidth || 0}px</span>
                </div>
              </div>
            </div>
            
            {/* Border Color */}
            <div className="flex items-center justify-between">
              <Label className="text-xs">Border Color</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <div
                    className="w-6 h-6 rounded border cursor-pointer"
                    style={{
                      backgroundImage: getTransparencyPattern(),
                      backgroundSize: "8px 8px",
                      backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px"
                    }}
                    onClick={() => saveComponentToHistory("Before changing border color")}
                  >
                    <div
                      className="w-full h-full rounded-sm"
                      style={{ backgroundColor: component.props.borderColor || '#000000' }}
                    />
                  </div>
                </PopoverTrigger>
                <PopoverContent className="p-0" onClick={e => e.stopPropagation()}>
                  <div onClick={e => e.stopPropagation()} className="p-2">
                    <GradientPicker
                      value={component.props.borderColor || '#000000'}
                      onChange={val => handlePropChange('borderColor', val, true)}
                      onChangeComplete={() => saveComponentToHistory("Updated border color")}
                      forceMode="solid"
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Shadow Controls */}
          <div className="space-y-2 border-t pt-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Shadow</Label>
              <Switch 
                checked={component.props.shadow || false}
                onCheckedChange={(checked) => handlePropChange('shadow', checked)}
                className="scale-75 data-[state=checked]:bg-primary" 
              />
            </div>
            
            {component.props.shadow && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Blur</Label>
                    <div className="flex items-center">
                      <Slider 
                        min={0} 
                        max={40} 
                        step={1} 
                        value={[component.props.shadowBlur || 10]} 
                        onValueChange={([value]) => handlePropChange('shadowBlur', value, true)}
                        className="flex-1" 
                      />
                      <span className="text-xs ml-2 w-6 text-right">{component.props.shadowBlur || 10}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Offset X</Label>
                    <div className="flex items-center">
                      <Slider 
                        min={-20} 
                        max={20} 
                        step={1} 
                        value={[component.props.shadowOffsetX || 0]} 
                        onValueChange={([value]) => handlePropChange('shadowOffsetX', value, true)}
                        className="flex-1" 
                      />
                      <span className="text-xs ml-2 w-6 text-right">{component.props.shadowOffsetX || 0}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Offset Y</Label>
                    <div className="flex items-center">
                      <Slider 
                        min={-20} 
                        max={20} 
                        step={1} 
                        value={[component.props.shadowOffsetY || 4]} 
                        onValueChange={([value]) => handlePropChange('shadowOffsetY', value, true)}
                        className="flex-1" 
                      />
                      <span className="text-xs ml-2 w-6 text-right">{component.props.shadowOffsetY || 4}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Shadow Color</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <div
                        className="w-6 h-6 rounded border cursor-pointer"
                        style={{ backgroundColor: component.props.shadowColor || '#0000004D' }}
                      />
                    </PopoverTrigger>
                    <PopoverContent className="p-0">
                      <GradientPicker
                        value={component.props.shadowColor || '#0000004D'}
                        onChange={val => handlePropChange('shadowColor', val, true)}
                        onChangeComplete={() => saveComponentToHistory("Updated shadow color")}
                        forceMode="solid"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Filter Effects Section */}
      <Collapsible 
        open={sectionsOpen.filters} 
        onOpenChange={(open) => setSectionsOpen(prev => ({ ...prev, filters: open }))}
      >
        <CollapsibleTrigger showIcon={false} className="flex items-center justify-between w-full py-2 px-2 bg-secondary/50 rounded-md hover:bg-secondary/70 transition-colors">
          <div className="flex items-center gap-1">
            <Wand2 size={14} />
            <span className="text-xs font-medium">Filters</span>
          </div>
          <ChevronRight size={12} className="transition-transform data-[state=open]:rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-1 py-2 space-y-3">
          {/* Filter Preset */}
          <div className="space-y-1">
            <Label className="text-xs">Filter Preset</Label>
            <Select 
              value={component.props.filterPreset || 'none'} 
              onValueChange={(value) => {
                // First update the filterPreset value
                handlePropChange('filterPreset', value);
                
                // Then apply preset values
                const presets: Record<string, any> = {
                  'none': { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, sepia: 0, hueRotate: 0, blur: 0, invert: 0 },
                  'vintage': { sepia: 30, contrast: 120, brightness: 110 },
                  'noir': { grayscale: 100, contrast: 150 },
                  'vivid': { saturation: 150, contrast: 110 },
                  'muted': { saturation: 50, brightness: 95 },
                  'dramatic': { contrast: 200, brightness: 90 }
                };
                
                if (presets[value]) {
                  // Use a timeout to ensure the filterPreset is updated first
                  setTimeout(() => {
                    // Update all the preset values at once, including filterPreset
                    onUpdate({
                      filterPreset: value,
                      ...presets[value]
                    });
                  }, 0);
                }
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="vintage">Vintage</SelectItem>
                <SelectItem value="noir">Noir</SelectItem>
                <SelectItem value="vivid">Vivid</SelectItem>
                <SelectItem value="muted">Muted</SelectItem>
                <SelectItem value="dramatic">Dramatic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Individual Filter Controls */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Brightness</Label>
              <div className="flex items-center">
                <Slider 
                  min={0} 
                  max={200} 
                  step={1} 
                  value={[component.props.brightness || 100]} 
                  onValueChange={([value]) => handlePropChange('brightness', value, true)}
                  className="flex-1" 
                />
                <span className="text-xs ml-2 w-8 text-right">{component.props.brightness || 100}%</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Contrast</Label>
              <div className="flex items-center">
                <Slider 
                  min={0} 
                  max={200} 
                  step={1} 
                  value={[component.props.contrast || 100]} 
                  onValueChange={([value]) => handlePropChange('contrast', value, true)}
                  className="flex-1" 
                />
                <span className="text-xs ml-2 w-8 text-right">{component.props.contrast || 100}%</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Saturation</Label>
              <div className="flex items-center">
                <Slider 
                  min={0} 
                  max={200} 
                  step={1} 
                  value={[component.props.saturation || 100]} 
                  onValueChange={([value]) => handlePropChange('saturation', value, true)}
                  className="flex-1" 
                />
                <span className="text-xs ml-2 w-8 text-right">{component.props.saturation || 100}%</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Blur</Label>
              <div className="flex items-center">
                <Slider 
                  min={0} 
                  max={10} 
                  step={0.5} 
                  value={[component.props.blur || 0]} 
                  onValueChange={([value]) => handlePropChange('blur', value, true)}
                  className="flex-1" 
                />
                <span className="text-xs ml-2 w-8 text-right">{component.props.blur || 0}px</span>
              </div>
            </div>
          </div>

          {/* Toggle Filters */}
          <div className="grid grid-cols-2 gap-1 pt-2 border-t">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Grayscale</span>
              <div className="flex items-center">
                <Slider 
                  min={0} 
                  max={100} 
                  step={1} 
                  value={[component.props.grayscale || 0]} 
                  onValueChange={([value]) => handlePropChange('grayscale', value, true)}
                  className="w-16" 
                />
                <span className="text-xs ml-2 w-8 text-right">{component.props.grayscale || 0}%</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Sepia</span>
              <div className="flex items-center">
                <Slider 
                  min={0} 
                  max={100} 
                  step={1} 
                  value={[component.props.sepia || 0]} 
                  onValueChange={([value]) => handlePropChange('sepia', value, true)}
                  className="w-16" 
                />
                <span className="text-xs ml-2 w-8 text-right">{component.props.sepia || 0}%</span>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Effects Section */}
      <Collapsible 
        open={sectionsOpen.effects} 
        onOpenChange={(open) => setSectionsOpen(prev => ({ ...prev, effects: open }))}
      >
        <CollapsibleTrigger showIcon={false} className="flex items-center justify-between w-full py-2 px-2 bg-secondary/50 rounded-md hover:bg-secondary/70 transition-colors">
          <div className="flex items-center gap-1">
            <Sparkles size={14} />
            <span className="text-xs font-medium">Effects</span>
          </div>
          <ChevronRight size={12} className="transition-transform data-[state=open]:rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-1 py-2 space-y-3">
          {/* Overlay */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Color & Gradient Overlays</Label>
            <p className="text-xs text-muted-foreground">Add color or gradient layers on top of your image</p>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Color</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <div
                    className="w-6 h-6 rounded border cursor-pointer"
                    style={{
                      backgroundImage: getTransparencyPattern(),
                      backgroundSize: "8px 8px",
                      backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px"
                    }}
                  >
                    <div
                      className="w-full h-full rounded-sm"
                      style={{ backgroundColor: component.props.overlayColor || '#00000000' }}
                    />
                  </div>
                </PopoverTrigger>
                <PopoverContent className="p-0">
                  <GradientPicker
                    value={component.props.overlayColor || '#00000000'}
                    onChange={val => handlePropChange('overlayColor', val, true)}
                    forceMode="solid"
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Opacity</Label>
              <div className="flex items-center">
                <Slider 
                  min={0} 
                  max={100} 
                  step={1} 
                  value={[Math.round((component.props.overlayOpacity || 0) * 100)]} 
                  onValueChange={([value]) => handlePropChange('overlayOpacity', value / 100, true)}
                  className="flex-1" 
                />
                <span className="text-xs ml-2 w-8 text-right">{Math.round((component.props.overlayOpacity || 0) * 100)}%</span>
              </div>
            </div>
            
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Blend Mode</Label>
              <Select 
                value={component.props.overlayBlendMode || 'normal'} 
                onValueChange={(value) => handlePropChange('overlayBlendMode', value)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  {/* Darken group */}
                  <SelectItem value="darken">Darken</SelectItem>
                  <SelectItem value="multiply">Multiply</SelectItem>
                  <SelectItem value="color-burn">Color Burn</SelectItem>
                  {/* Lighten group */}
                  <SelectItem value="lighten">Lighten</SelectItem>
                  <SelectItem value="screen">Screen</SelectItem>
                  <SelectItem value="color-dodge">Color Dodge</SelectItem>
                  {/* Contrast group */}
                  <SelectItem value="overlay">Overlay</SelectItem>
                  <SelectItem value="soft-light">Soft Light</SelectItem>
                  <SelectItem value="hard-light">Hard Light</SelectItem>
                  {/* Inversion group */}
                  <SelectItem value="difference">Difference</SelectItem>
                  <SelectItem value="exclusion">Exclusion</SelectItem>
                  {/* Component group */}
                  <SelectItem value="hue">Hue</SelectItem>
                  <SelectItem value="saturation">Saturation</SelectItem>
                  <SelectItem value="color">Color</SelectItem>
                  <SelectItem value="luminosity">Luminosity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Pattern Overlay */}
            <div className="space-y-1 mt-2">
              <Label className="text-xs text-muted-foreground">Pattern</Label>
              <Select 
                value={component.props.overlayPattern || 'none'} 
                onValueChange={(value) => handlePropChange('overlayPattern', value)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="dots">Dots</SelectItem>
                  <SelectItem value="lines">Diagonal Lines</SelectItem>
                  <SelectItem value="grid">Grid</SelectItem>
                  <SelectItem value="noise">Noise</SelectItem>
                  <SelectItem value="scanlines">Scanlines</SelectItem>
                  <SelectItem value="halftone">Halftone</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {component.props.overlayPattern && component.props.overlayPattern !== 'none' && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Pattern Opacity</Label>
                <div className="flex items-center">
                  <Slider 
                    min={0} 
                    max={100} 
                    step={5} 
                    value={[Math.round((component.props.overlayPatternOpacity || 0.5) * 100)]} 
                    onValueChange={([value]) => handlePropChange('overlayPatternOpacity', value / 100, true)}
                    className="flex-1" 
                  />
                  <span className="text-xs ml-2 w-8 text-right">{Math.round((component.props.overlayPatternOpacity || 0.5) * 100)}%</span>
                </div>
              </div>
            )}
          </div>

          {/* Mask Shape */}
          <div className="space-y-2 border-t pt-2">
            <Label className="text-xs font-medium">Mask Shape</Label>
            <div className="grid grid-cols-4 gap-1">
              {[
                { value: 'none', icon: Square, label: 'None' },
                { value: 'circle', icon: Circle, label: 'Circle' },
                { value: 'ellipse', icon: Ellipse, label: 'Ellipse' },
                { value: 'triangle', icon: Triangle, label: 'Triangle' },
                { value: 'pentagon', icon: Pentagon, label: 'Pentagon' },
                { value: 'hexagon', icon: Hexagon, label: 'Hexagon' },
                { value: 'star', icon: Star, label: 'Star' },
                { value: 'heart', icon: Heart, label: 'Heart' }
              ].map(({ value, icon: Icon, label }) => (
                <Button
                  key={value}
                  variant="outline"
                  size="icon"
                  className={cn(
                    "h-8 w-8",
                    component.props.maskShape === value && "ring-2 ring-primary"
                  )}
                  onClick={() => {
                    handlePropChange('maskShape', value);
                    // When selecting a mask shape (not 'none'), always ensure maskSize is reasonable
                    if (value !== 'none') {
                      // If maskSize is undefined, very small (< 50), or very large (> 150), reset to 100
                      const currentSize = component.props.maskSize;
                      if (!currentSize || currentSize < 50 || currentSize > 150) {
                        handlePropChange('maskSize', 100);
                      }
                    }
                  }}
                  title={label}
                >
                  <Icon size={14} />
                </Button>
              ))}
            </div>
            
            {component.props.maskShape && component.props.maskShape !== 'none' && (
              <div className="space-y-1 mt-2">
                <Label className="text-xs text-muted-foreground">Mask Size</Label>
                <div className="flex items-center">
                  <Slider 
                    min={50} 
                    max={150} 
                    step={1} 
                    value={[component.props.maskSize || 100]} 
                    onValueChange={([value]) => handlePropChange('maskSize', value, true)}
                    className="flex-1" 
                  />
                  <span className="text-xs ml-2 w-8 text-right">{component.props.maskSize || 100}%</span>
                </div>
              </div>
            )}
          </div>

          {/* Special Effects Toggles */}
          <div className="space-y-2 border-t pt-2">
            <div className="grid grid-cols-2 gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Duotone</span>
                <Switch 
                  checked={component.props.duotoneEnabled || false}
                  onCheckedChange={(checked) => handlePropChange('duotoneEnabled', checked)}
                  className="scale-75 data-[state=checked]:bg-primary" 
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Glitch</span>
                <Switch 
                  checked={component.props.glitchEnabled || false}
                  onCheckedChange={(checked) => handlePropChange('glitchEnabled', checked)}
                  className="scale-75 data-[state=checked]:bg-primary" 
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Gradient Overlay</span>
                <Switch 
                  checked={component.props.gradientOverlayEnabled || false}
                  onCheckedChange={(checked) => {
                    handlePropChange('gradientOverlayEnabled', checked);
                    // Set a default opacity if none is set
                    if (checked && (!component.props.overlayOpacity || component.props.overlayOpacity === 0)) {
                      handlePropChange('overlayOpacity', 0.5);
                    }
                  }}
                  className="scale-75 data-[state=checked]:bg-primary" 
                />
              </div>
            </div>
            
            {/* Gradient Overlay Controls */}
            {component.props.gradientOverlayEnabled && (
              <div className="space-y-2 border-t pt-2">
                <Label className="text-xs font-medium">Gradient Overlay Settings</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Start Color</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <div
                          className="w-full h-8 rounded border cursor-pointer"
                          style={{ backgroundColor: component.props.gradientStartColor || '#000000' }}
                        />
                      </PopoverTrigger>
                      <PopoverContent className="p-0">
                        <GradientPicker
                          value={component.props.gradientStartColor || '#000000'}
                          onChange={val => handlePropChange('gradientStartColor', val, true)}
                          forceMode="solid"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">End Color</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <div
                          className="w-full h-8 rounded border cursor-pointer"
                          style={{ backgroundColor: component.props.gradientEndColor || '#ffffff' }}
                        />
                      </PopoverTrigger>
                      <PopoverContent className="p-0">
                        <GradientPicker
                          value={component.props.gradientEndColor || '#ffffff'}
                          onChange={val => handlePropChange('gradientEndColor', val, true)}
                          forceMode="solid"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Direction</Label>
                  <div className="flex items-center">
                    <Slider 
                      min={0} 
                      max={360} 
                      step={15} 
                      value={[component.props.gradientDirection || 0]} 
                      onValueChange={([value]) => handlePropChange('gradientDirection', value, true)}
                      className="flex-1" 
                    />
                    <span className="text-xs ml-2 w-8 text-right">{component.props.gradientDirection || 0}°</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  💡 Tip: Try different blend modes with your gradient for creative effects
                </p>
              </div>
            )}
            
            {/* Additional effect controls */}
            {component.props.duotoneEnabled && (
              <div className="space-y-2 border-t pt-2">
                <Label className="text-xs font-medium">Duotone Settings</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Dark Tone</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <div
                          className="w-full h-8 rounded border cursor-pointer"
                          style={{ backgroundColor: component.props.duotoneDarkColor || '#000000' }}
                        />
                      </PopoverTrigger>
                      <PopoverContent className="p-0">
                        <GradientPicker
                          value={component.props.duotoneDarkColor || '#000000'}
                          onChange={val => handlePropChange('duotoneDarkColor', val, true)}
                          forceMode="solid"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Light Tone</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <div
                          className="w-full h-8 rounded border cursor-pointer"
                          style={{ backgroundColor: component.props.duotoneLightColor || '#ffffff' }}
                        />
                      </PopoverTrigger>
                      <PopoverContent className="p-0">
                        <GradientPicker
                          value={component.props.duotoneLightColor || '#ffffff'}
                          onChange={val => handlePropChange('duotoneLightColor', val, true)}
                          forceMode="solid"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            )}
            
            {component.props.glitchEnabled && (
              <div className="space-y-2 border-t pt-2">
                <Label className="text-xs font-medium">Glitch Settings</Label>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Intensity</Label>
                  <div className="flex items-center">
                    <Slider 
                      min={0} 
                      max={100} 
                      step={5} 
                      value={[component.props.glitchIntensity || 50]} 
                      onValueChange={([value]) => handlePropChange('glitchIntensity', value, true)}
                      className="flex-1" 
                    />
                    <span className="text-xs ml-2 w-8 text-right">{component.props.glitchIntensity || 50}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Transform Section */}
      <Collapsible 
        open={sectionsOpen.transform} 
        onOpenChange={(open) => setSectionsOpen(prev => ({ ...prev, transform: open }))}
      >
        <CollapsibleTrigger showIcon={false} className="flex items-center justify-between w-full py-2 px-2 bg-secondary/50 rounded-md hover:bg-secondary/70 transition-colors">
          <div className="flex items-center gap-1">
            <Move3D size={14} />
            <span className="text-xs font-medium">Transform</span>
          </div>
          <ChevronRight size={12} className="transition-transform data-[state=open]:rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-1 py-2 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Scale</Label>
              <div className="flex items-center">
                <Slider 
                  min={0.5} 
                  max={2} 
                  step={0.1} 
                  value={[component.props.scale || 1]} 
                  onValueChange={([value]) => handlePropChange('scale', value, true)}
                  className="flex-1" 
                />
                <span className="text-xs ml-2 w-8 text-right">{(component.props.scale || 1).toFixed(1)}x</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Rotate</Label>
              <div className="flex items-center">
                <Slider 
                  min={-180} 
                  max={180} 
                  step={1} 
                  value={[component.props.rotate || 0]} 
                  onValueChange={([value]) => handlePropChange('rotate', value, true)}
                  className="flex-1" 
                />
                <span className="text-xs ml-2 w-8 text-right">{component.props.rotate || 0}°</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Skew X</Label>
              <div className="flex items-center">
                <Slider 
                  min={-45} 
                  max={45} 
                  step={1} 
                  value={[component.props.skewX || 0]} 
                  onValueChange={([value]) => handlePropChange('skewX', value, true)}
                  className="flex-1" 
                />
                <span className="text-xs ml-2 w-8 text-right">{component.props.skewX || 0}°</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Skew Y</Label>
              <div className="flex items-center">
                <Slider 
                  min={-45} 
                  max={45} 
                  step={1} 
                  value={[component.props.skewY || 0]} 
                  onValueChange={([value]) => handlePropChange('skewY', value, true)}
                  className="flex-1" 
                />
                <span className="text-xs ml-2 w-8 text-right">{component.props.skewY || 0}°</span>
              </div>
            </div>
          </div>


        </CollapsibleContent>
      </Collapsible>

      {/* Animation Section */}
      <Collapsible 
        open={sectionsOpen.animation} 
        onOpenChange={(open) => setSectionsOpen(prev => ({ ...prev, animation: open }))}
      >
        <CollapsibleTrigger showIcon={false} className="flex items-center justify-between w-full py-2 px-2 bg-secondary/50 rounded-md hover:bg-secondary/70 transition-colors">
          <div className="flex items-center gap-1">
            <Zap size={14} />
            <span className="text-xs font-medium">Animation</span>
          </div>
          <ChevronRight size={12} className="transition-transform data-[state=open]:rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-1 py-2 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Animation Type</Label>
            <Select 
              value={component.props.animationType || 'none'} 
              onValueChange={(value) => {
                // If selecting the same animation, trigger a replay by temporarily setting to none
                if (value === component.props.animationType && value !== 'none') {
                  handlePropChange('animationType', 'none');
                  // Use setTimeout to ensure the change is processed before setting back
                  setTimeout(() => {
                    handlePropChange('animationType', value);
                  }, 50);
                } else {
                  handlePropChange('animationType', value);
                }
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="fade-in">Fade In</SelectItem>
                <SelectItem value="slide-in">Slide In</SelectItem>
                <SelectItem value="zoom-in">Zoom In</SelectItem>
                <SelectItem value="rotate-in">Rotate In</SelectItem>
                <SelectItem value="bounce-in">Bounce In</SelectItem>
                <SelectItem value="flip-in">Flip In</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {component.props.animationType && component.props.animationType !== 'none' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Duration</Label>
                  <div className="flex items-center">
                    <Slider 
                      min={0.1} 
                      max={3} 
                      step={0.1} 
                      value={[component.props.animationDuration || 1]} 
                      onValueChange={([value]) => handlePropChange('animationDuration', value, true)}
                      className="flex-1" 
                    />
                    <span className="text-xs ml-2 w-8 text-right">{(component.props.animationDuration || 1).toFixed(1)}s</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Delay</Label>
                  <div className="flex items-center">
                    <Slider 
                      min={0} 
                      max={2} 
                      step={0.1} 
                      value={[component.props.animationDelay || 0]} 
                      onValueChange={([value]) => handlePropChange('animationDelay', value, true)}
                      className="flex-1" 
                    />
                    <span className="text-xs ml-2 w-8 text-right">{(component.props.animationDelay || 0).toFixed(1)}s</span>
                  </div>
                </div>
              </div>
              

            </>
          )}

          {/* Hover Effect */}
          <div className="space-y-2 border-t pt-2">
            <Label className="text-xs">Hover Effect</Label>
            <Select 
              value={component.props.hoverEffect || 'none'} 
              onValueChange={(value) => handlePropChange('hoverEffect', value)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="zoom">Zoom</SelectItem>
                <SelectItem value="rotate">Rotate</SelectItem>
                <SelectItem value="lift">Lift</SelectItem>
                <SelectItem value="glow">Glow</SelectItem>
                <SelectItem value="blur">Blur</SelectItem>
              </SelectContent>
            </Select>
            
            {component.props.hoverEffect && component.props.hoverEffect !== 'none' && (
              <div className="space-y-1 mt-2">
                <Label className="text-xs text-muted-foreground">Transition Duration</Label>
                <div className="flex items-center">
                  <Slider 
                    min={0.1} 
                    max={1} 
                    step={0.1} 
                    value={[component.props.hoverTransitionDuration || 0.3]} 
                    onValueChange={([value]) => handlePropChange('hoverTransitionDuration', value, true)}
                    className="flex-1" 
                  />
                  <span className="text-xs ml-2 w-8 text-right">{(component.props.hoverTransitionDuration || 0.3).toFixed(1)}s</span>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default ImageSettingsEditor; 