import React, { useState, useCallback, useMemo } from 'react';
import { RotateCcw, Check, Layers } from 'lucide-react';
import MiniSlide from '@/components/deck/MiniSlide';

interface SlideSnapshotThumbnailProps {
  /** The slide data at the time of the edit (post-edit state shown in thumbnail) */
  slideSnapshot: {
    id: string;
    title?: string;
    components: Array<{
      id: string;
      type: string;
      props: any;
    }>;
  };
  /** Edit ID for restoration */
  editId?: string;
  /** Callback to restore to PRE-edit state (undo the change) */
  onRestore?: (slideSnapshot: any) => Promise<void>;
  /** Callback to apply the thumbnail version (post-edit state) */
  onApply?: (slideSnapshot: any) => Promise<void>;
  /** Timestamp of the edit */
  timestamp?: Date;
  /** Summary of what was changed */
  summary?: string;
}

export function SlideSnapshotThumbnail({
  slideSnapshot,
  editId,
  onRestore,
  onApply,
  timestamp,
  summary
}: SlideSnapshotThumbnailProps) {
  const [isRestoring, setIsRestoring] = useState(false);
  const [restored, setRestored] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  // Convert slideSnapshot to SlideData format for MiniSlide
  const slideData = useMemo(() => {
    if (!slideSnapshot?.components) return null;
    return {
      id: slideSnapshot.id,
      title: slideSnapshot.title || 'Snapshot',
      components: slideSnapshot.components.map(c => ({
        id: c.id,
        type: c.type,
        props: c.props,
        slideId: slideSnapshot.id
      }))
    };
  }, [slideSnapshot]);

  // Extract background color for fallback
  const bgComponent = slideSnapshot?.components?.find((c: any) => c.type === 'Background');
  let bgColor = '#2d3748';
  if (bgComponent?.props?.backgroundColor) bgColor = bgComponent.props.backgroundColor;
  else if (bgComponent?.props?.color) bgColor = bgComponent.props.color;

  // Determine if background is light (for text contrast)
  const isLightBg = useMemo(() => {
    const hex = bgColor.replace('#', '');
    if (hex.length !== 6) return false;
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5;
  }, [bgColor]);

  const handleRestore = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRestore || isRestoring) return;

    setIsRestoring(true);
    try {
      await onRestore(slideSnapshot);
      setRestored(true);
      setTimeout(() => setRestored(false), 2000);
    } catch (error) {
      console.error('[SlideSnapshot] Restore failed:', error);
    } finally {
      setIsRestoring(false);
    }
  }, [onRestore, slideSnapshot, isRestoring]);

  // Apply the thumbnail version (post-edit state)
  const handleApply = useCallback(async () => {
    if (!onApply || isApplying) return;

    setIsApplying(true);
    try {
      await onApply(slideSnapshot);
      setApplied(true);
      setTimeout(() => setApplied(false), 2000);
    } catch (error) {
      console.error('[SlideSnapshot] Apply failed:', error);
    } finally {
      setIsApplying(false);
    }
  }, [onApply, slideSnapshot, isApplying]);

  if (!slideSnapshot || !slideSnapshot.components) {
    return null;
  }

  return (
    <div className="mt-2 flex items-start gap-2">
      {/* Thumbnail container */}
      <div className="relative w-48 aspect-video rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 transition-all hover:border-blue-400 hover:shadow-md group">
        {/* Render slide using MiniSlide */}
        {slideData ? (
          <div className="w-full h-full pointer-events-none">
            <MiniSlide
              slide={slideData as any}
              responsive={true}
              className="w-full h-full"
            />
          </div>
        ) : (
          /* Fallback: show background color with info */
          <div
            className={`w-full h-full flex flex-col items-center justify-center ${isLightBg ? 'text-gray-700' : 'text-white/80'}`}
            style={{ backgroundColor: bgColor }}
          >
            <Layers className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-medium">Previous Version</span>
          </div>
        )}

        {/* Hover overlay - click to apply thumbnail version */}
        {onApply && (
          <div
            onClick={handleApply}
            className={`absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 z-10 cursor-pointer ${
              isApplying || applied ? 'opacity-100 bg-black/40' : ''
            }`}
          >
            {isApplying ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : applied ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-500 text-white">
                <Check className="w-3 h-3" />
                <span>Restored!</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white text-gray-800 hover:bg-gray-100 transition-colors">
                <RotateCcw className="w-3 h-3" />
                <span>Restore</span>
              </div>
            )}
          </div>
        )}

        {/* Version badge */}
        <div className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-medium z-10 ${isLightBg ? 'bg-gray-800/70 text-white' : 'bg-black/50 text-white/80'}`}>
          {timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Snapshot'}
        </div>
      </div>

      {/* Undo button - always visible, restores to PRE-edit state */}
      {onRestore && (
        <button
          onClick={handleRestore}
          disabled={isRestoring}
          title={restored ? 'Undone!' : 'Undo this edit'}
          className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all ${
            restored
              ? 'bg-green-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200'
          } disabled:opacity-50`}
        >
          {isRestoring ? (
            <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : restored ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <RotateCcw className="w-3.5 h-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

export default SlideSnapshotThumbnail;
