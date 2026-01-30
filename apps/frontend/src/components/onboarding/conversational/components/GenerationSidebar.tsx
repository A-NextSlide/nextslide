import React from 'react';
import type { OutlinePreviewData, OutlineSlidePreview, ThemeEditorData } from '@/types/chatBlocks';
import OutlineThemeBlocks from './OutlineThemeBlocks';

interface GenerationStatus {
  canGenerate: boolean;
  hasOutline: boolean;
  needsBrandConfirmation: boolean;
  needsFileImageConfirmation: boolean;
  isBlocking: boolean;
  blockingLabel: string;
  lockedLabel: string;
}

interface GenerationSidebarProps {
  outlineBlock: OutlinePreviewData | null;
  themeBlock: ThemeEditorData | null;
  isProcessing: boolean;
  isThemeLoading: boolean;
  isOutlinePrefetching: boolean;
  generationStatus: GenerationStatus;
  showSkipChat: boolean;
  onSkipChat: () => void;
  onSlideModeSelect: (mode: 'interactive' | 'static') => void;
  onSlideEdit: (slideId: string, updates: Partial<OutlineSlidePreview>) => void;
  onSlideAdd: () => void;
  onSlideDelete: (slideId: string) => void;
  onSlideReorder: (fromIndex: number, toIndex: number) => void;
  onLoadContent: (slideId: string, slideIndex: number) => Promise<{ content: string; keyPoints?: string[] }>;
  onThemeColorChange: (key: 'background' | 'text' | 'accent', hex: string) => void;
  onThemeFontChange: (type: 'heading' | 'body', font: string) => void;
  onThemeLogoChange: (url: string | null) => void;
  onBrandNameChange: (name: string) => void;
}

const GenerationSidebar: React.FC<GenerationSidebarProps> = ({
  outlineBlock,
  themeBlock,
  isProcessing,
  isThemeLoading,
  isOutlinePrefetching,
  generationStatus,
  showSkipChat,
  onSkipChat,
  onSlideModeSelect,
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
  const hasBlocks = Boolean(outlineBlock || themeBlock);
  const readinessLabel = generationStatus.isBlocking
    ? 'Loading'
    : (generationStatus.canGenerate ? 'Ready' : 'Gathering');
  const showGeneratedCards = generationStatus.hasOutline;

  if (!showGeneratedCards) {
    return (
      <aside className="hidden lg:flex w-[360px] flex-col h-full overflow-hidden" />
    );
  }

  return (
    <aside className="hidden lg:flex w-[360px] flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto pb-6 pt-6 px-1 scrollbar-hide">
        <div className="space-y-6">
          {/* Outline & Theme Section */}
          <section className="relative overflow-visible rounded-[28px] border-none bg-transparent">
            {/* Note: Removed card container styles to let children expand naturally for unified scrolling if needed, 
                 or we can keep the card style but ensure internal scrolling is disabled in favor of this parent scroll.
                 User asked for unified scrolling of the whole panel. 
             */}

            {hasBlocks ? (
              <div className="relative pb-4">
                <OutlineThemeBlocks
                  outlineBlock={outlineBlock}
                  themeBlock={themeBlock}
                  isProcessing={isProcessing}
                  isThemeLoading={isThemeLoading}
                  isOutlinePrefetching={isOutlinePrefetching}
                  onSlideEdit={onSlideEdit}
                  onSlideAdd={onSlideAdd}
                  onSlideDelete={onSlideDelete}
                  onSlideReorder={onSlideReorder}
                  onLoadContent={onLoadContent}
                  onThemeColorChange={onThemeColorChange}
                  onThemeFontChange={onThemeFontChange}
                  onThemeLogoChange={onThemeLogoChange}
                  onBrandNameChange={onBrandNameChange}
                  dense
                  outlineClassName=""
                  themeClassName="rounded-2xl border-zinc-200/80 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.4)]"
                />
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </aside>
  );
};

export default GenerationSidebar;
