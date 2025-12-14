import React, { useState, useCallback, useMemo } from 'react';
import { RotateCcw, Check, Layers } from 'lucide-react';
import MiniSlide from '@/components/deck/MiniSlide';
import { useDeckStore } from '@/stores/deckStore';

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
  /** Pre-edit snapshot for restoration (optional - enables restore button) */
  preEditSnapshot?: {
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
  /** Callback to restore to PRE-edit state (undo the change) - if not provided, uses internal store */
  onRestore?: (slideSnapshot: any) => Promise<void>;
  /** Callback to apply the thumbnail version (post-edit state) - if not provided, uses internal store */
  onApply?: (slideSnapshot: any) => Promise<void>;
  /** Timestamp of the edit */
  timestamp?: Date;
  /** Summary of what was changed */
  summary?: string;
}

export function SlideSnapshotThumbnail({
  slideSnapshot,
  preEditSnapshot,
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

  // Internal restore function - applies snapshot to deck
  // Uses getState() to avoid subscribing to deck changes (prevents re-render on every update)
  const internalRestore = useCallback(async (snapshot: any) => {
    if (!snapshot?.id || !snapshot?.components) {
      console.error('[SlideSnapshotThumbnail] Invalid snapshot for restore');
      return;
    }

    try {
      // Get current deck state without subscribing
      const { deckData, updateDeckData } = useDeckStore.getState();
      const slides = deckData?.slides || [];
      const slideIndex = slides.findIndex((s: any) => s.id === snapshot.id);

      if (slideIndex === -1) {
        console.error('[SlideSnapshotThumbnail] Slide not found:', snapshot.id);
        return;
      }

      // Create updated slides array with the restored slide
      const updatedSlides = [...slides];
      updatedSlides[slideIndex] = {
        ...slides[slideIndex],
        components: snapshot.components
      };

      // Clear any agent edit lock so the restore can take effect
      if (typeof window !== 'undefined') {
        (window as any).__agentEditInProgress = false;
        (window as any).__lastAgentEditTimestamp = 0;
      }

      // Update deck with restored slide
      updateDeckData({
        ...deckData,
        slides: updatedSlides
      }, { skipBackend: false }); // Save to backend

      // Dispatch event to force UI refresh
      window.dispatchEvent(new CustomEvent('deck:restore', {
        detail: { slideId: snapshot.id, slideIndex }
      }));

      console.log('[SlideSnapshotThumbnail] Restored slide:', snapshot.id);
    } catch (error) {
      console.error('[SlideSnapshotThumbnail] Restore failed:', error);
      throw error;
    }
  }, []);

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

  // Restore to PRE-edit state (undo the change)
  const handleRestore = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRestoring) return;

    console.log('[SlideSnapshot] handleRestore called', {
      hasOnRestore: !!onRestore,
      hasPreEditSnapshot: !!preEditSnapshot,
      preEditSnapshotId: preEditSnapshot?.id,
      preEditComponentCount: preEditSnapshot?.components?.length
    });

    // Need either a callback or preEditSnapshot to restore
    if (!onRestore && !preEditSnapshot) {
      console.warn('[SlideSnapshot] No restore callback or preEditSnapshot available');
      return;
    }

    setIsRestoring(true);
    try {
      if (onRestore) {
        console.log('[SlideSnapshot] Using onRestore callback');
        await onRestore(preEditSnapshot || slideSnapshot);
      } else if (preEditSnapshot) {
        console.log('[SlideSnapshot] Using internalRestore with preEditSnapshot');
        await internalRestore(preEditSnapshot);
      }
      setRestored(true);
      setTimeout(() => setRestored(false), 2000);
    } catch (error) {
      console.error('[SlideSnapshot] Restore failed:', error);
    } finally {
      setIsRestoring(false);
    }
  }, [onRestore, preEditSnapshot, slideSnapshot, isRestoring, internalRestore]);

  // Apply the thumbnail version (post-edit state)
  const handleApply = useCallback(async () => {
    if (isApplying) return;

    setIsApplying(true);
    try {
      if (onApply) {
        await onApply(slideSnapshot);
      } else {
        await internalRestore(slideSnapshot);
      }
      setApplied(true);
      setTimeout(() => setApplied(false), 2000);
    } catch (error) {
      console.error('[SlideSnapshot] Apply failed:', error);
    } finally {
      setIsApplying(false);
    }
  }, [onApply, slideSnapshot, isApplying, internalRestore]);

  // Determine if restore is possible
  const canRestore = !!(onRestore || preEditSnapshot);

  if (!slideSnapshot || !slideSnapshot.components) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-col">
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

        {/* Hover overlay - click to apply thumbnail version (always available with internal restore) */}
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
              <span>Applied!</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white text-gray-800 hover:bg-gray-100 transition-colors">
              <RotateCcw className="w-3 h-3" />
              <span>Apply</span>
            </div>
          )}
        </div>

        {/* Version badge */}
        <div className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-medium z-10 ${isLightBg ? 'bg-gray-800/70 text-white' : 'bg-black/50 text-white/80'}`}>
          {timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Snapshot'}
        </div>
      </div>

      {/* Reset button - small text underneath thumbnail, resets to original version */}
      {canRestore && (
        <button
          onClick={handleRestore}
          disabled={isRestoring}
          className={`mt-1 flex items-center gap-1 text-[10px] transition-colors ${
            restored
              ? 'text-green-600 dark:text-green-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          } disabled:opacity-50`}
        >
          {isRestoring ? (
            <>
              <div className="w-3 h-3 border-[1.5px] border-gray-400 border-t-transparent rounded-full animate-spin" />
              <span>Resetting...</span>
            </>
          ) : restored ? (
            <>
              <Check className="w-3 h-3" />
              <span>Reset!</span>
            </>
          ) : (
            <>
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

export default SlideSnapshotThumbnail;
