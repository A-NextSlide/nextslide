import React from 'react';
import { cn } from '@/lib/utils';
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
  if (!outlineBlock && !themeBlock) return null;

  const stackedBlocks = Boolean(outlineBlock && themeBlock);
  const outlineLoadingLabel = isOutlinePrefetching ? 'Generating your outline...' : 'Creating your structure...';
  const isOutlineEditable = !isProcessing && !isOutlinePrefetching;
  const isThemeEditable = Boolean(themeBlock?.isEditable) && !isThemeLoading;
  const themeLoadingLabel = themeBlock?.loadingMessage || (isThemeLoading ? 'Updating theme...' : undefined);

  return (
    <div
      className={cn(
        dense ? 'flex flex-col' : 'mt-4 mb-3 flex flex-col',
        'animate-in fade-in slide-in-from-bottom-2 duration-300',
        stackedBlocks ? 'gap-3' : 'gap-3', // Always gap-3 for separation now that they are reordered
        className
      )}
    >
      {/* 2. Theme Block (First) */}
      {themeBlock && (
        <ThemeChatBlock
          className={[
            // Remove round-b-none logic since we want them separate or reordered cleanly
            themeClassName,
          ].filter(Boolean).join(' ')}
          data={{
            colors: {
              background: themeBlock.colors.primary_background,
              text: themeBlock.colors.primary_text,
              accent: themeBlock.colors.accent_1,
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
        />
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
