import React from 'react';
import type { OutlinePreviewData, OutlineSlidePreview, ThemeEditorData } from '@/types/chatBlocks';
import OutlineThemeBlocks from './OutlineThemeBlocks';
import SlideModeSelection from './SlideModeSelection';
import SkipChatPrompt from './SkipChatPrompt';

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
  const readinessLabel = generationStatus.canGenerate ? 'Ready' : 'Gathering';

  return (
    <aside className="hidden lg:flex w-[360px] flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto pb-6 pt-6 px-1 scrollbar-hide">
        <div className="space-y-6">
          {/* 1. Generate / Buttons Section (Now First) */}
          <section className="relative overflow-hidden rounded-[28px] border border-zinc-200/70 bg-white/95 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.45)] px-4 py-4 before:content-[''] before:absolute before:inset-0 before:rounded-[28px] before:bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_60%)] before:pointer-events-none">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Generate
              </div>
              <span className="text-[10px] font-semibold text-orange-500 uppercase tracking-[0.2em]">
                {readinessLabel}
              </span>
            </div>

            <div className="mt-3">
              <SlideModeSelection
                isProcessing={isProcessing}
                isBlocking={generationStatus.isBlocking}
                blockingLabel={generationStatus.blockingLabel}
                isLocked={!generationStatus.canGenerate && !generationStatus.isBlocking}
                lockedLabel={generationStatus.lockedLabel}
                onSelect={onSlideModeSelect}
                onContinueChat={() => undefined}
                showContinueChat={false}
              />
            </div>

            {showSkipChat && (
              <div className="mt-4">
                <SkipChatPrompt
                  onSkip={onSkipChat}
                  label="Skip chat and auto-draft"
                  helperText="We will infer anything missing."
                  className="items-start text-left"
                />
              </div>
            )}

            <p className="mt-4 text-[11px] text-zinc-500 leading-relaxed">
              Keep chatting to refine your outline. Generate whenever you are ready.
            </p>
          </section>

          {/* 2. Outline & Theme Section (Now Second) */}
          <section className="relative overflow-visible rounded-[28px] border-none bg-transparent">
            {/* Note: Removed card container styles to let children expand naturally for unified scrolling if needed, 
                 or we can keep the card style but ensure internal scrolling is disabled in favor of this parent scroll.
                 User asked for unified scrolling of the whole panel. 
             */}

            {/* Slightly modified header to match the new flow */}
            <div className="relative px-2 pb-2 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Outline & Theme
              </div>
              <span className="text-[10px] font-medium text-zinc-400">
                {hasBlocks ? 'Editable' : 'Pending'}
              </span>
            </div>

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
            ) : (
              <div className="relative pb-4">
                <div className="rounded-2xl border border-dashed border-zinc-200/80 bg-zinc-50/80 px-4 py-6 text-sm text-zinc-500">
                  Your outline and theme will appear here as soon as the agent drafts them.
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </aside>
  );
};

export default GenerationSidebar;
