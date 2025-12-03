import React, { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw,
  Upload,
  Link,
  X,
  Loader2,
  Eraser,
  Wand2,
  Image as ImageIcon
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
 * ImageElementToolbar - Clean, compact image editing toolbar
 * Appears when clicking on an image within a CustomComponent
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
  ];

  // Position toolbar at top-right of the selected element, shift left if needed to stay in slide
  const getToolbarPosition = () => {
    const toolbarWidth = 320;
    const toolbarHeight = 380;
    const padding = 12;

    // Get element and iframe position in viewport coordinates
    const iframe = document.querySelector(`iframe[title="Custom Component"]`);
    const iframeRect = iframe?.getBoundingClientRect();

    const elementRight = (iframeRect?.left || 0) + element.bounds.x + element.bounds.width;
    const elementTop = (iframeRect?.top || 0) + element.bounds.y;

    // Use iframe right edge as the boundary (not viewport) to avoid overlapping sidebar
    const maxRight = iframeRect?.right || window.innerWidth;

    // Position at top-right corner of element
    let left = elementRight + padding;
    let top = elementTop;

    // If it would go past the slide area, shift left just enough to fit
    if (left + toolbarWidth > maxRight) {
      left = maxRight - toolbarWidth - padding;
    }

    // Ensure left doesn't go past the left edge of the iframe
    const minLeft = iframeRect?.left || padding;
    if (left < minLeft) {
      left = minLeft;
    }

    // Ensure top stays within viewport
    top = Math.max(padding, Math.min(top, window.innerHeight - toolbarHeight - padding));

    return { top, left };
  };

  const position = getToolbarPosition();

  return (
    <motion.div
      initial={{ opacity: 0, x: -10, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -10, scale: 0.95 }}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 9999
      }}
      className="w-[320px] bg-white rounded-xl border shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gray-50">
        <span className="text-sm font-medium text-gray-700">Edit Image</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Image preview */}
      {element.src && (
        <div className="p-3 border-b bg-gray-50/50">
          <div
            className="w-full h-20 rounded-lg overflow-hidden bg-white border"
            style={{
              backgroundImage: 'linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)',
              backgroundSize: '8px 8px',
              backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px'
            }}
          >
            <img
              src={element.src}
              alt={element.alt || 'Selected image'}
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('swap')}
          className={cn(
            "flex-1 py-2.5 text-xs font-medium transition-all relative",
            activeTab === 'swap'
              ? "text-gray-900"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          <RefreshCw size={12} className="inline mr-1.5" />
          Swap
          {activeTab === 'swap' && (
            <motion.div
              layoutId="tab-indicator"
              className="absolute bottom-0 left-0 right-0 h-0.5"
              style={{ backgroundColor: BRAND_ORANGE }}
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab('edit')}
          className={cn(
            "flex-1 py-2.5 text-xs font-medium transition-all relative",
            activeTab === 'edit'
              ? "text-gray-900"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          <Wand2 size={12} className="inline mr-1.5" />
          AI Edit
          {activeTab === 'edit' && (
            <motion.div
              layoutId="tab-indicator"
              className="absolute bottom-0 left-0 right-0 h-0.5"
              style={{ backgroundColor: BRAND_ORANGE }}
            />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        {activeTab === 'swap' && (
          <>
            {/* MediaHub - Primary action */}
            <MediaHub
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-9 text-xs font-medium bg-white hover:bg-orange-50"
                  style={{
                    borderColor: BRAND_ORANGE,
                    borderWidth: '2px',
                    color: BRAND_ORANGE
                  }}
                >
                  <ImageIcon size={14} className="mr-2" />
                  Browse Images
                </Button>
              }
              onSelect={(url) => {
                if (url && typeof url === 'string') {
                  onSwap(url);
                  toast({ title: 'Image updated', description: 'Image has been replaced.' });
                  onClose();
                }
              }}
              defaultSearchTerm={element.alt || undefined}
              autoSearch={!!element.alt}
            />

            {/* Upload */}
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
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 text-xs text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {isUploading ? 'Uploading...' : 'Upload from device'}
            </button>

            {/* URL input */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Link size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Paste image URL..."
                  className="h-8 pl-8 pr-2 text-xs"
                  onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleUrlSubmit}
                disabled={!imageUrl.trim()}
                className="h-8 px-3 text-xs"
              >
                Go
              </Button>
            </div>
          </>
        )}

        {activeTab === 'edit' && (
          <>
            {/* Quick actions */}
            <div className="flex gap-1.5">
              {quickActions.map(({ label, prompt }) => (
                <button
                  key={label}
                  onClick={() => handleAiEdit(prompt)}
                  disabled={isProcessing}
                  className="flex-1 py-1.5 px-2 rounded-lg border text-[11px] font-medium text-gray-600 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600 transition-colors disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Custom instruction */}
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Describe what you want to change..."
              className="min-h-[70px] text-xs resize-none"
              disabled={isProcessing}
            />

            <Button
              onClick={() => aiPrompt.trim() && handleAiEdit(aiPrompt.trim())}
              disabled={!aiPrompt.trim() || isProcessing}
              className="w-full h-8 text-xs font-medium"
              style={{ backgroundColor: !aiPrompt.trim() || isProcessing ? undefined : BRAND_ORANGE }}
            >
              {isProcessing ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                'Apply Edit'
              )}
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default ImageElementToolbar;
