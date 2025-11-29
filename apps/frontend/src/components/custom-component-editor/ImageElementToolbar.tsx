import React, { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw,
  Sparkles,
  Upload,
  Link,
  Search,
  X,
  Wand2,
  Eraser,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DetectedElement } from './CustomComponentEditOverlay';
import { MediaHub } from '@/components/media/MediaHub';

interface ImageElementToolbarProps {
  element: DetectedElement;
  scale: number;
  onSwap: (newImageUrl: string) => void;
  onAiEdit: (instruction: string) => void;
  onClose: () => void;
}

// Brand colors
const BRAND_ORANGE = '#FF4301';

/**
 * ImageElementToolbar
 *
 * A floating toolbar that appears when an image is selected in a custom component.
 */
export const ImageElementToolbar: React.FC<ImageElementToolbarProps> = ({
  element,
  scale,
  onSwap,
  onAiEdit,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'swap' | 'ai'>('swap');
  const [imageUrl, setImageUrl] = useState('');
  const [aiInstruction, setAiInstruction] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file upload
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { uploadFile } = await import('@/utils/fileUploadUtils');
      const url = await uploadFile(file);
      onSwap(url);
      onClose();
    } catch (error) {
      console.error('Failed to upload image:', error);
    } finally {
      setIsUploading(false);
    }
  }, [onSwap, onClose]);

  // Handle URL submit
  const handleUrlSubmit = useCallback(() => {
    if (imageUrl.trim()) {
      onSwap(imageUrl.trim());
      onClose();
    }
  }, [imageUrl, onSwap, onClose]);

  // Handle AI edit
  const handleAiEdit = useCallback(async (instruction: string) => {
    setIsProcessing(true);
    try {
      await onAiEdit(instruction);
      onClose();
    } catch (error) {
      console.error('AI edit failed:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [onAiEdit, onClose]);

  // Quick AI actions
  const quickActions = [
    { label: 'Remove BG', instruction: 'Remove the background' },
    { label: 'Enhance', instruction: 'Enhance and improve quality' },
    { label: 'Brighten', instruction: 'Make the image brighter' },
  ];

  // Position toolbar near the element
  const toolbarStyle: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(Math.max(element.bounds.y * scale, 60), window.innerHeight - 400),
    left: Math.min(Math.max(element.bounds.x * scale + element.bounds.width * scale + 10, 10), window.innerWidth - 320),
    zIndex: 9999
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -10, scale: 0.95 }}
      style={toolbarStyle}
      className="w-[300px] bg-white rounded-xl border shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 text-white"
        style={{ backgroundColor: BRAND_ORANGE }}
      >
        <span className="text-sm font-semibold">Edit Image</span>
        <button onClick={onClose} className="text-white/80 hover:text-white">
          <X size={16} />
        </button>
      </div>

      {/* Image preview */}
      {element.src && (
        <div className="p-3 border-b bg-gray-50">
          <img
            src={element.src}
            alt={element.alt || 'Selected image'}
            className="w-full h-24 object-contain rounded bg-white"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('swap')}
          className={cn(
            "flex-1 py-2 text-xs font-medium transition-colors",
            activeTab === 'swap'
              ? "text-orange-600 border-b-2 border-orange-500"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          <RefreshCw size={12} className="inline mr-1" />
          Swap
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={cn(
            "flex-1 py-2 text-xs font-medium transition-colors",
            activeTab === 'ai'
              ? "text-orange-600 border-b-2 border-orange-500"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          <Sparkles size={12} className="inline mr-1" />
          AI Edit
        </button>
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        {activeTab === 'swap' && (
          <>
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
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {isUploading ? 'Uploading...' : 'Upload from device'}
            </button>

            {/* URL input */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Link size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Paste image URL..."
                  className="w-full pl-8 pr-2 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
                  onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                />
              </div>
              <button
                onClick={handleUrlSubmit}
                disabled={!imageUrl.trim()}
                className={cn(
                  "px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                  imageUrl.trim()
                    ? "bg-orange-500 text-white hover:bg-orange-600"
                    : "bg-gray-100 text-gray-400"
                )}
              >
                Go
              </button>
            </div>

            {/* Stock image search */}
            <MediaHub
              trigger={
                <button className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-gray-100 text-sm text-gray-700 hover:bg-gray-200 transition-colors">
                  <Search size={14} />
                  Search stock images
                </button>
              }
              onSelect={(url) => {
                if (url && typeof url === 'string') {
                  onSwap(url);
                  onClose();
                }
              }}
            />
          </>
        )}

        {activeTab === 'ai' && (
          <>
            {/* Quick actions */}
            <div className="flex gap-2">
              {quickActions.map(({ label, instruction }) => (
                <button
                  key={label}
                  onClick={() => handleAiEdit(instruction)}
                  disabled={isProcessing}
                  className="flex-1 py-2 px-2 rounded-lg border text-xs text-gray-700 hover:bg-orange-50 hover:border-orange-200 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Custom instruction */}
            <div className="space-y-2">
              <textarea
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
                placeholder="Describe what you want to change..."
                className="w-full h-20 p-2.5 text-xs border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
                disabled={isProcessing}
              />
              <button
                onClick={() => aiInstruction.trim() && handleAiEdit(aiInstruction.trim())}
                disabled={!aiInstruction.trim() || isProcessing}
                className={cn(
                  "w-full py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2",
                  aiInstruction.trim() && !isProcessing
                    ? "bg-orange-500 text-white hover:bg-orange-600"
                    : "bg-gray-100 text-gray-400"
                )}
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Wand2 size={14} />
                    Apply AI Edit
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default ImageElementToolbar;
