import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, Palette } from 'lucide-react';
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
  // Theme block is collapsed by default
  const [isThemeExpanded, setIsThemeExpanded] = useState(false);

  if (!outlineBlock && !themeBlock) return null;

  const stackedBlocks = Boolean(outlineBlock && themeBlock);
  const outlineLoadingLabel = isOutlinePrefetching ? 'Generating your outline...' : 'Creating your structure...';
  const isOutlineEditable = !isProcessing && !isOutlinePrefetching;
  const isThemeEditable = !isThemeLoading;
  const themeLoadingLabel = themeBlock?.loadingMessage || (isThemeLoading ? 'Updating theme...' : undefined);

  return (
    <div
      className={cn(
        dense ? 'flex flex-col' : 'mt-4 mb-3 flex flex-col',
        'animate-in fade-in slide-in-from-bottom-2 duration-300',
        stackedBlocks ? 'gap-3' : 'gap-3',
        className
      )}
    >
      {/* Theme Block Toggle Header + Content */}
      {themeBlock && (
        <div className={cn(
          "relative rounded-2xl overflow-hidden border border-zinc-200/80 dark:border-zinc-800/80 bg-white/95 dark:bg-zinc-900/90 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.45)]",
          "before:content-[''] before:absolute before:inset-0 before:rounded-2xl before:bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.12),transparent_55%)] before:pointer-events-none",
          themeClassName
        )}>
          {/* Toggle Header */}
          <button
            onClick={() => setIsThemeExpanded(!isThemeExpanded)}
            className="relative z-10 w-full flex items-center justify-between px-3 py-2.5 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 transition-colors"
          >
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
            <div className="flex items-center gap-2">
              {isThemeLoading && (
                <span className="text-[10px] text-orange-500 animate-pulse">Loading...</span>
              )}
              <span className="text-[10px] font-medium text-zinc-400">
                {isThemeExpanded ? 'Editable' : 'Click to edit'}
              </span>
              {isThemeExpanded ? (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              )}
            </div>
          </button>

          {/* Collapsed Preview - show color bars */}
          {!isThemeExpanded && !isThemeLoading && (
            <div className="relative z-10 flex h-8 border-t border-zinc-200/80 dark:border-zinc-800/80">
              <div className="flex-1" style={{ backgroundColor: themeBlock.colors.primary_background }} />
              <div className="flex-1" style={{ backgroundColor: themeBlock.colors.accent_1 }} />
              <div className="flex-1" style={{ backgroundColor: themeBlock.colors.primary_text }} />
            </div>
          )}

          {/* Expanded Theme Editor */}
          {isThemeExpanded && (
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
          )}
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
          isLoading={isProcessing || isOutlinePrefetching}
          loadingLabel={outlineLoadingLabel}
        />
      )}
    </div>
  );
};

export default OutlineThemeBlocks;
