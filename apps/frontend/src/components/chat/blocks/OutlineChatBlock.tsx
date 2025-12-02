/**
 * OutlineChatBlock
 * Single card view with prev/next navigation
 * Shows full slide content like the main outline page
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import ChatBlockContainer from './ChatBlockContainer';

export interface OutlineSlide {
  id: string;
  title: string;
  subtitle?: string;
  keyPoints?: string[];
  content?: string;
}

export interface OutlineBlockData {
  title: string;
  slides: OutlineSlide[];
}

interface OutlineChatBlockProps {
  data: OutlineBlockData;
  onSlideEdit?: (slideId: string, updates: Partial<OutlineSlide>) => void;
  onSlideAdd?: () => void;
  onSlideDelete?: (slideId: string) => void;
  isEditable?: boolean;
  className?: string;
}

const OutlineChatBlock: React.FC<OutlineChatBlockProps> = ({
  data,
  onSlideEdit,
  onSlideAdd,
  onSlideDelete,
  isEditable = true,
  className,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingContent, setIsEditingContent] = useState(false);

  const currentSlide = data.slides[currentIndex];
  const hasMultipleSlides = data.slides.length > 1;

  const goToPrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : data.slides.length - 1));
    setIsEditingTitle(false);
    setIsEditingContent(false);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev < data.slides.length - 1 ? prev + 1 : 0));
    setIsEditingTitle(false);
    setIsEditingContent(false);
  };

  // Build content from key_points or content field
  const getSlideContent = (slide: OutlineSlide): string => {
    if (slide.content) return slide.content;
    if (slide.keyPoints && slide.keyPoints.length > 0) {
      return slide.keyPoints.map(kp => `• ${kp}`).join('\n');
    }
    return '';
  };

  if (!currentSlide) {
    return (
      <ChatBlockContainer className={cn("w-full max-w-[420px]", className)}>
        <div className="p-4 text-center text-zinc-500 dark:text-zinc-400 text-sm">
          No slides in outline
        </div>
      </ChatBlockContainer>
    );
  }

  return (
    <ChatBlockContainer variant="accent" className={cn("w-full max-w-[420px]", className)}>
      {/* Header with slide count and navigation */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-orange-200/50 dark:border-orange-800/30 bg-gradient-to-r from-orange-50 to-white dark:from-orange-950/30 dark:to-zinc-900">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wide">
            Slide Outline
          </span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {data.slides.length} slides
          </span>
        </div>

        {/* Navigation arrows */}
        {hasMultipleSlides && (
          <div className="flex items-center gap-1">
            <button
              onClick={goToPrev}
              className="p-1 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-600 dark:text-orange-400 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 min-w-[40px] text-center">
              {currentIndex + 1} / {data.slides.length}
            </span>
            <button
              onClick={goToNext}
              className="p-1 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-600 dark:text-orange-400 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Slide Card */}
      <div className="p-4">
        <div className="rounded-lg border-2 border-orange-200 dark:border-orange-800/50 bg-white dark:bg-zinc-900 overflow-hidden">
          {/* Slide number badge + title */}
          <div className="flex items-start gap-3 p-3 border-b border-zinc-100 dark:border-zinc-800">
            <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 text-white text-sm font-bold shadow-sm">
              {currentIndex + 1}
            </span>
            <div className="flex-1 min-w-0">
              {isEditingTitle && isEditable ? (
                <input
                  autoFocus
                  className="w-full text-sm font-semibold bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-400"
                  value={currentSlide.title}
                  onChange={(e) => onSlideEdit?.(currentSlide.id, { title: e.target.value })}
                  onBlur={() => setIsEditingTitle(false)}
                  onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
                />
              ) : (
                <h3
                  className={cn(
                    "text-sm font-semibold text-zinc-800 dark:text-zinc-200 leading-tight",
                    isEditable && "cursor-pointer hover:text-orange-600 dark:hover:text-orange-400"
                  )}
                  onClick={() => isEditable && setIsEditingTitle(true)}
                >
                  {currentSlide.title || 'Untitled Slide'}
                </h3>
              )}
              {currentSlide.subtitle && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {currentSlide.subtitle}
                </p>
              )}
            </div>

            {/* Actions */}
            {isEditable && (
              <div className="flex gap-1">
                <button
                  onClick={() => setIsEditingContent(!isEditingContent)}
                  className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-orange-500 transition-colors"
                  title="Edit content"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {data.slides.length > 1 && (
                  <button
                    onClick={() => onSlideDelete?.(currentSlide.id)}
                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-400 hover:text-red-500 transition-colors"
                    title="Delete slide"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-3 min-h-[100px] max-h-[200px] overflow-y-auto">
            {isEditingContent && isEditable ? (
              <textarea
                autoFocus
                className="w-full min-h-[80px] text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded p-2 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                value={getSlideContent(currentSlide)}
                onChange={(e) => {
                  // Parse back to key_points if it looks like bullet points
                  const lines = e.target.value.split('\n');
                  const keyPoints = lines
                    .map(l => l.replace(/^[•\-*]\s*/, '').trim())
                    .filter(Boolean);
                  onSlideEdit?.(currentSlide.id, {
                    content: e.target.value,
                    keyPoints
                  });
                }}
                onBlur={() => setIsEditingContent(false)}
              />
            ) : (
              <div
                className={cn(
                  "text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed",
                  isEditable && "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded p-1 -m-1 transition-colors"
                )}
                onClick={() => isEditable && setIsEditingContent(true)}
              >
                {getSlideContent(currentSlide) || (
                  <span className="text-zinc-400 italic">Click to add content...</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Slide dots + Add button */}
        <div className="flex items-center justify-center gap-2 mt-3">
          {/* Slide indicator dots */}
          <div className="flex gap-1">
            {data.slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setCurrentIndex(idx);
                  setIsEditingTitle(false);
                  setIsEditingContent(false);
                }}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  idx === currentIndex
                    ? "bg-orange-500 w-4"
                    : "bg-zinc-300 dark:bg-zinc-600 hover:bg-orange-300"
                )}
              />
            ))}
          </div>

          {/* Add slide button */}
          {isEditable && (
            <button
              onClick={() => {
                onSlideAdd?.();
                // Navigate to the new slide
                setTimeout(() => setCurrentIndex(data.slides.length), 100);
              }}
              className="ml-2 flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 font-medium transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          )}
        </div>
      </div>
    </ChatBlockContainer>
  );
};

export default OutlineChatBlock;
