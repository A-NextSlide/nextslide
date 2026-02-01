import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Unlock, ArrowRight, Pencil, Sparkles, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import type { SlideData } from '@/types/SlideTypes';
import MiniSlide from '@/components/deck/MiniSlide';
import { Button } from '@/components/ui/button';
import { BROWSER } from '@/utils/browser';

interface ToolSlideViewerProps {
  slides: SlideData[];
  lockedAfter: number;
  onSignup: () => void;
  onReset: () => void;
  /** When true, all slides are unlocked and CTA goes to the editor instead of signup. */
  allUnlocked?: boolean;
}

export default function ToolSlideViewer({
  slides,
  lockedAfter,
  onSignup,
  onReset,
  allUnlocked = false,
}: ToolSlideViewerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();

  const selectedSlide = slides[selectedIndex];
  const isLocked = !allUnlocked && selectedIndex >= lockedAfter;
  const lockedCount = allUnlocked ? 0 : Math.max(0, slides.length - lockedAfter);

  const handlePrev = () => setSelectedIndex((i) => Math.max(0, i - 1));
  const handleNext = () => setSelectedIndex((i) => Math.min(slides.length - 1, i + 1));

  return (
    <div className="space-y-4">
      {/* Main slide viewer */}
      <div className="relative">
        {/* Navigation arrows */}
        {selectedIndex > 0 && (
          <button
            onClick={handlePrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-30 bg-white/90 hover:bg-white rounded-full p-1.5 shadow-md transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-zinc-700" />
          </button>
        )}
        {selectedIndex < slides.length - 1 && (
          <button
            onClick={handleNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-30 bg-white/90 hover:bg-white rounded-full p-1.5 shadow-md transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-zinc-700" />
          </button>
        )}

        {/* Slide */}
        <div className="aspect-[16/9] rounded-xl overflow-hidden border border-zinc-200 bg-zinc-50 relative">
          {selectedSlide && (
            <MiniSlide
              slide={selectedSlide}
              responsive
              forceRender
              interactive={!isLocked && !BROWSER.isMobile}
              isLocked={isLocked}
              className="w-full h-full"
            />
          )}

          {/* Locked overlay for main view */}
          {isLocked && (
            <div className="absolute inset-0 flex items-center justify-center z-20">
              <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl px-6 py-6 max-w-xs text-center border border-zinc-100">
                <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-gradient-to-br from-[#FF4301] to-[#E63901] flex items-center justify-center">
                  <Lock className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-base font-bold text-zinc-900 mb-1">
                  {lockedCount} more {lockedCount === 1 ? 'slide' : 'slides'} ready
                </h3>
                <p className="text-sm text-zinc-500 mb-4">
                  Unlock every slide, customize the design, and export to PowerPoint — free
                </p>
                <Button
                  className="w-full bg-gradient-to-r from-[#FF4301] to-[#E63901] hover:from-[#E63901] hover:to-[#CC3200] text-white font-semibold py-2.5 rounded-xl"
                  onClick={() => navigate('/signup')}
                >
                  <Unlock className="w-4 h-4 mr-2" />
                  Unlock all slides — it's free
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Slide counter */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full z-10">
          {selectedIndex + 1} / {slides.length}
        </div>
      </div>

      {/* Thumbnail strip */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
        {slides.map((slide, i) => {
          const thumbLocked = !allUnlocked && i >= lockedAfter;
          const isSelected = i === selectedIndex;

          return (
            <button
              key={slide.id || i}
              onClick={() => setSelectedIndex(i)}
              className={`flex-shrink-0 w-[120px] aspect-[16/9] rounded-lg overflow-hidden border-2 transition-all ${
                isSelected
                  ? 'border-[#FF4301] ring-1 ring-[#FF4301]/30'
                  : 'border-zinc-200 hover:border-zinc-300'
              }`}
            >
              <MiniSlide
                slide={slide}
                responsive
                forceRender
                isLocked={thumbLocked}
                className="w-full h-full"
              />
            </button>
          );
        })}
      </div>

      {/* CTA section */}
      <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
        {allUnlocked ? (
          <Button
            className="w-full sm:flex-1 bg-gradient-to-r from-[#FF4301] to-[#E63901] hover:from-[#E63901] hover:to-[#CC3200] text-white font-semibold py-5 rounded-xl shadow-lg shadow-orange-500/20"
            onClick={onSignup}
          >
            Edit in NextSlide
            <Pencil className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button
            className="w-full sm:flex-1 bg-gradient-to-r from-[#FF4301] to-[#E63901] hover:from-[#E63901] hover:to-[#CC3200] text-white font-semibold py-5 rounded-xl shadow-lg shadow-orange-500/20"
            onClick={() => navigate('/signup')}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Unlock all slides & export to PowerPoint
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 transition-colors py-2"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Try another file
        </button>
      </div>
    </div>
  );
}
