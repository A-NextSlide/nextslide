import React from 'react';
import { cn } from '@/lib/utils';
import { Palette } from 'lucide-react';
import type { OutlinePreviewData, OutlineSlidePreview, ThemeEditorData } from '@/types/chatBlocks';
import DropdownOutlineChatBlock from '@/components/chat/blocks/DropdownOutlineChatBlock';
import ThemeChatBlock from '@/components/chat/blocks/ThemeChatBlock';

interface OutlineThemeBlocksProps {
  outlineBlock: OutlinePreviewData | null;
  themeBlock: ThemeEditorData | null;
  isProcessing: boolean;
  isThemeLoading: boolean;
  isOutlinePrefetching: boolean;
  dense?: boolean;
  className?: string;
  outlineClassName?: string;
  themeClassName?: string;
  onSlideEdit: (slideId: string, updates: Partial<OutlineSlidePreview>) => void;
  onSlideAdd: () => void;
  onSlideDelete: (slideId: string) => void;
  onSlideReorder: (fromIndex: number, toIndex: number) => void;
  onLoadContent: (
    slideId: string,
    slideIndex: number
  ) => Promise<{ content: string; keyPoints?: string[]; generationContext?: string }>;
  onThemeColorChange: (key: 'background' | 'text' | 'accent', hex: string) => void;
  onThemeFontChange: (type: 'heading' | 'body', font: string) => void;
  onThemeLogoChange: (url: string | null) => void;
  onBrandNameChange: (name: string) => void;
}

// Helper to determine if any slides are currently being updated
const hasUpdatingSlides = (outlineBlock: OutlinePreviewData | null): boolean => {
  if (!outlineBlock?.slides) return false;
  return outlineBlock.slides.some(slide => slide.isUpdating);
};

const OutlineThemeBlocks: React.FC<OutlineThemeBlocksProps> = ({
  outlineBlock,
  themeBlock,
  isProcessing,
  isThemeLoading,
  isOutlinePrefetching,
  dense = false,
  className,
  outlineClassName,
  themeClassName,
  onSlideEdit,
  onSlideAdd,
  onSlideDelete,
  onSlideReorder,
  onLoadContent,
  onThemeColorChange,
  onThemeFontChange,
  onThemeLogoChange,
  onBrandNameChange,
}) => {
  if (!outlineBlock && !themeBlock) return null;

  const stackedBlocks = Boolean(outlineBlock && themeBlock);

  // Determine if outline is fully loading vs per-slide updates
  const isFullOutlineLoading = isProcessing || isOutlinePrefetching || outlineBlock?.isLoading === true;
  const slidesAreUpdating = hasUpdatingSlides(outlineBlock);

  // Only show the overlay if full outline is loading (not for per-slide updates)
  const outlineLoadingLabel = outlineBlock?.loadingMessage ||
    (isOutlinePrefetching ? 'Generating your outline...' : 'Creating your structure...');

  // Outline is editable unless fully loading (per-slide updates keep other slides editable)
  const isOutlineEditable = !isFullOutlineLoading;

  // Theme editability
  const isThemeUpdating = outlineBlock?.isThemeUpdating || isThemeLoading;
  const isThemeEditable = !isThemeUpdating;
  const themeLoadingLabel = themeBlock?.loadingMessage || (isThemeUpdating ? 'Updating theme...' : undefined);

  return (
    <div
      className={cn(
        dense ? 'flex flex-col' : 'mt-4 mb-3 flex flex-col',
        'animate-in fade-in slide-in-from-bottom-2 duration-300',
        stackedBlocks ? 'gap-3' : 'gap-3',
        className
      )}
    >
      {/* Theme Block - Always Expanded */}
      {themeBlock && (
        <div className={cn(
          "relative rounded-2xl overflow-hidden border border-zinc-200/80 dark:border-zinc-800/80 bg-white/95 dark:bg-zinc-900/90 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.45)]",
          "before:content-[''] before:absolute before:inset-0 before:rounded-2xl before:bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.12),transparent_55%)] before:pointer-events-none",
          themeClassName
        )}>
          {/* Header */}
          <div className="relative z-10 w-full flex items-center justify-between px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-zinc-400" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
                Theme
              </span>
              {themeBlock.branding?.brandName && (
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                  · {themeBlock.branding.brandName}
                </span>
              )}
            </div>
            {isThemeUpdating && (
              <span className="text-[10px] text-orange-500 animate-pulse">{themeLoadingLabel || 'Loading...'}</span>
            )}
          </div>

          {/* Theme Editor */}
          <ThemeChatBlock
            className="border-0 shadow-none rounded-none"
            data={{
              colors: {
                background: themeBlock.colors.primary_background,
                text: themeBlock.colors.primary_text,
                accent: themeBlock.colors.accent_1,
                accent2: themeBlock.colors.accent_2,
              },
              fonts: {
                heading: themeBlock.typography.headingFont,
                body: themeBlock.typography.bodyFont,
              },
              logo: themeBlock.branding?.logoUrl,
              brandName: themeBlock.branding?.brandName || themeBlock.vibeContext,
            }}
            onColorChange={onThemeColorChange}
            onFontChange={onThemeFontChange}
            onLogoChange={onThemeLogoChange}
            onBrandNameChange={onBrandNameChange}
            isEditable={isThemeEditable}
            isLoading={isThemeLoading}
            loadingLabel={themeLoadingLabel}
            hideHeader
          />
        </div>
      )}

      {/* 1. Outline Block (Second) */}
      {outlineBlock && (
        <DropdownOutlineChatBlock
          className={[
            outlineClassName,
          ].filter(Boolean).join(' ')}
          data={outlineBlock}
          onSlideEdit={onSlideEdit}
          onSlideAdd={onSlideAdd}
          onSlideDelete={onSlideDelete}
          onSlideReorder={onSlideReorder}
          onLoadContent={onLoadContent}
          isEditable={isOutlineEditable}
          // Only show full loading overlay when entire outline is loading, not for per-slide updates
          isLoading={isFullOutlineLoading}
          loadingLabel={outlineLoadingLabel}
        />
      )}
    </div>
  );
};

export default OutlineThemeBlocks;
