import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw,
  Upload,
  Link,
  X,
  Loader2,
  Wand2,
  Image as ImageIcon,
  Check,
  Layers,
  Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DetectedElement } from './CustomComponentEditOverlay';
import { MediaHub } from '@/components/media/MediaHub';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

interface ImageElementToolbarProps {
  element: DetectedElement;
  scale: number;
  cursorPosition?: { x: number; y: number } | null;
  onSwap: (newImageUrl: string) => void;
  onAiEdit: (instruction: string) => void;
  onClose: () => void;
}

// Brand colors
const BRAND_ORANGE = '#FF4301';

/**
 * ImageElementToolbar - Clean, scrollable image editing toolbar
 * Fixed positioning issues and added proper scrolling
 */
export const ImageElementToolbar: React.FC<ImageElementToolbarProps> = ({
  element,
  scale,
  cursorPosition,
  onSwap,
  onAiEdit,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'swap' | 'edit'>('swap');
  const [imageUrl, setImageUrl] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Handle file upload
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { uploadFile } = await import('@/utils/fileUploadUtils');
      const url = await uploadFile(file);
      onSwap(url);
      toast({ title: 'Image updated', description: 'Image has been replaced.' });
      onClose();
    } catch (error) {
      console.error('Failed to upload image:', error);
      toast({ title: 'Upload failed', description: 'Could not upload image.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  }, [onSwap, onClose, toast]);

  // Handle URL submit
  const handleUrlSubmit = useCallback(() => {
    if (imageUrl.trim()) {
      onSwap(imageUrl.trim());
      toast({ title: 'Image updated', description: 'Image has been replaced.' });
      onClose();
    }
  }, [imageUrl, onSwap, onClose, toast]);

  // Handle AI edit
  const handleAiEdit = useCallback(async (instruction: string) => {
    if (!instruction.trim()) return;
    setIsProcessing(true);
    try {
      await onAiEdit(instruction);
      toast({ title: 'Edit applied', description: 'AI edit has been applied.' });
      onClose();
    } catch (error) {
      console.error('AI edit failed:', error);
      toast({ title: 'Edit failed', description: 'Could not apply AI edit.', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  }, [onAiEdit, onClose, toast]);

  // Quick AI actions
  const quickActions = [
    { label: 'Remove BG', prompt: 'Remove the background, make it transparent' },
    { label: 'Enhance', prompt: 'Enhance and improve quality' },
    { label: 'Brighten', prompt: 'Make the image brighter and more vibrant' },
    { label: 'Cinematic', prompt: 'Add cinematic lighting and shallow depth' },
  ];

  // Calculate optimal position - ensuring toolbar stays visible and doesn't overflow
  const getToolbarPosition = useCallback(() => {
    const toolbarWidth = 300;
    const toolbarMaxHeight = 420;
    const padding = 16;

    // Get iframe bounds
    const iframe = document.querySelector(`iframe[title="Custom Component"]`);
    const iframeRect = iframe?.getBoundingClientRect();

    if (!iframeRect) {
      // Fallback to viewport center if no iframe
      return {
        top: Math.max(padding, (window.innerHeight - toolbarMaxHeight) / 2),
        left: Math.max(padding, (window.innerWidth - toolbarWidth) / 2),
      };
    }

    // Calculate element position in viewport
    const elementLeft = iframeRect.left + element.bounds.x * scale;
    const elementRight = iframeRect.left + (element.bounds.x + element.bounds.width) * scale;
    const elementTop = iframeRect.top + element.bounds.y * scale;
    const elementBottom = iframeRect.top + (element.bounds.y + element.bounds.height) * scale;
    const elementCenterY = (elementTop + elementBottom) / 2;

    // Determine best horizontal position
    let left: number;
    const spaceOnRight = window.innerWidth - elementRight - padding;
    const spaceOnLeft = elementLeft - padding;

    if (spaceOnRight >= toolbarWidth + padding) {
      // Position to the right of element
      left = elementRight + padding;
    } else if (spaceOnLeft >= toolbarWidth + padding) {
      // Position to the left of element
      left = elementLeft - toolbarWidth - padding;
    } else {
      // Center horizontally, but avoid going off-screen
      left = Math.max(padding, Math.min(
        (window.innerWidth - toolbarWidth) / 2,
        window.innerWidth - toolbarWidth - padding
      ));
    }

    // Determine best vertical position - center aligned with element
    let top = elementCenterY - toolbarMaxHeight / 2;

    // Clamp to viewport bounds
    top = Math.max(padding, Math.min(top, window.innerHeight - toolbarMaxHeight - padding));

    return { top, left };
  }, [element.bounds, scale]);

  const position = getToolbarPosition();

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <motion.div
      ref={toolbarRef}
      initial={{ opacity: 0, scale: 0.95, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -8 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      // CRITICAL: Stop all events from bubbling
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 10001,
      }}
      className="w-[300px] max-h-[420px] flex flex-col bg-white rounded-xl border shadow-2xl overflow-hidden"
    >
      {/* Header - Fixed */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gradient-to-r from-gray-50 to-white shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md overflow-hidden border bg-gray-100"
            style={{
              backgroundImage: 'linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)',
              backgroundSize: '6px 6px',
              backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px'
            }}
          >
            {element.src && (
              <img src={element.src} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <span className="text-xs font-medium text-gray-700 truncate max-w-[180px]">
            {element.alt || 'Edit Image'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Tabs - Fixed */}
      <div className="flex border-b shrink-0">
        {[
          { id: 'swap' as const, icon: RefreshCw, label: 'Swap' },
          { id: 'edit' as const, icon: Wand2, label: 'AI Edit' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-all relative",
              activeTab === tab.id
                ? "text-gray-900 bg-orange-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            )}
          >
            <tab.icon size={12} />
            {tab.label}
            {activeTab === tab.id && (
              <motion.div
                layoutId="toolbar-tab-indicator"
                className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                style={{ backgroundColor: BRAND_ORANGE }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-3">
        {activeTab === 'swap' && (
          <>
            {/* MediaHub - Primary action */}
            <div
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <MediaHub
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-10 text-xs font-medium bg-white hover:bg-orange-50 border-2 transition-colors"
                    style={{
                      borderColor: BRAND_ORANGE,
                      color: BRAND_ORANGE
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ImageIcon size={14} className="mr-2" />
                    Browse Media Library
                  </Button>
                }
                onSelect={(url) => {
                  // Intercept generating/failed placeholders — keep MediaHub open
                  if (url === 'generating://ai-image' || url === 'failed://ai-image') {
                    return;
                  }
                  if (url && typeof url === 'string') {
                    onSwap(url);
                    toast({ title: 'Image updated' });
                    onClose();
                  }
                }}
                defaultSearchTerm={element.alt || undefined}
                autoSearch={!!element.alt}
              />
            </div>

            {/* Upload button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-50"
            >
              {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {isUploading ? 'Uploading...' : 'Upload from device'}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-[10px] text-gray-400 uppercase">or paste URL</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* URL input */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Link size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="h-9 pl-8 pr-2 text-xs"
                  onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                />
              </div>
              <Button
                size="sm"
                onClick={handleUrlSubmit}
                disabled={!imageUrl.trim()}
                className="h-9 px-3"
                style={{ backgroundColor: imageUrl.trim() ? BRAND_ORANGE : undefined }}
              >
                <Check size={14} />
              </Button>
            </div>
          </>
        )}

        {activeTab === 'edit' && (
          <>
            {/* Quick actions grid */}
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wide font-medium mb-2 block">
                Quick Actions
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {quickActions.map(({ label, prompt }) => (
                  <button
                    key={label}
                    onClick={() => handleAiEdit(prompt)}
                    disabled={isProcessing}
                    className={cn(
                      "py-2 px-3 rounded-lg border text-xs font-medium transition-all",
                      "bg-white hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-[10px] text-gray-400 uppercase">or describe</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Custom instruction */}
            <div className="space-y-2">
              <Textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe what you want to change..."
                className="min-h-[80px] text-xs resize-none"
                disabled={isProcessing}
              />

              <Button
                onClick={() => aiPrompt.trim() && handleAiEdit(aiPrompt.trim())}
                disabled={!aiPrompt.trim() || isProcessing}
                className="w-full h-9 text-xs font-medium transition-colors"
                style={{ backgroundColor: (!aiPrompt.trim() || isProcessing) ? undefined : BRAND_ORANGE }}
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={14} className="mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Wand2 size={14} className="mr-2" />
                    Apply Edit
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default ImageElementToolbar;
