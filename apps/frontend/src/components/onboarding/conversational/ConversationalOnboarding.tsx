import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CreditWarningDialog } from '@/components/billing/CreditWarningDialog';
import type { ThemeColorPalette } from '@/types/chatBlocks';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useConversationalOnboarding } from './hooks/useConversationalOnboarding';
import OnboardingHeader from './components/OnboardingHeader';
import MessageList from './components/MessageList';
import AgentStatusBubble from './components/AgentStatusBubble';
import SkipChatPrompt from './components/SkipChatPrompt';
import ChatInputArea from './components/ChatInputArea';
import OutlineThemeBlocks from './components/OutlineThemeBlocks';
import SlideModeSelection from './components/SlideModeSelection';
import GenerationSidebar from './components/GenerationSidebar';
import type { ConversationalOnboardingProps } from './types';

const ConversationalOnboarding: React.FC<ConversationalOnboardingProps> = (props) => {
  const { state, refs, handlers } = useConversationalOnboarding(props);
  const isMobileView = useIsMobile();
  const [mobileTab, setMobileTab] = useState<'chat' | 'plan'>('chat');

  const showSkipChat = !state.isAgentTyping &&
    !state.isProcessing &&
    !state.generationStatus.canGenerate &&
    !state.generationStatus.needsBrandConfirmation &&
    !state.generationStatus.needsFileImageConfirmation &&
    (state.stage === 'conversing' || state.stage === 'chat') &&
    state.messages.filter((message) => message.role === 'user').length >= 1;

  const handleThemeColorChange = useCallback((key: 'background' | 'text' | 'accent', hex: string) => {
    const map: Record<'background' | 'text' | 'accent', keyof ThemeColorPalette> = {
      background: 'primary_background',
      text: 'primary_text',
      accent: 'accent_1',
    };
    handlers.handleThemeColorChange(map[key], hex);
  }, [handlers]);

  useEffect(() => {
    if (!isMobileView) {
      setMobileTab('chat');
    }
  }, [isMobileView]);

  const planAvailable = useMemo(() => (
    Boolean(state.outlineBlock || state.themeBlock) ||
    state.generationStatus.hasOutline ||
    state.stage === 'slide_mode_selection' ||
    state.isOutlinePrefetching ||
    state.isThemeLoading
  ), [
    state.generationStatus.hasOutline,
    state.isOutlinePrefetching,
    state.isThemeLoading,
    state.outlineBlock,
    state.themeBlock,
    state.stage,
  ]);

  const isPlanView = isMobileView && mobileTab === 'plan';
  const readinessLabel = state.generationStatus.isBlocking
    ? 'Loading'
    : (state.generationStatus.canGenerate ? 'Ready' : 'Gathering');

  return (
    <div className="flex h-full w-full">
      <div className="mx-auto flex h-full w-full max-w-6xl gap-6 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
            <OnboardingHeader onCancel={props.onCancel} />

            {isMobileView && (
              <div className="lg:hidden border-b border-zinc-200 dark:border-zinc-800 px-4 py-2">
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-zinc-100/80 dark:bg-zinc-900/60 p-1">
                  <button
                    type="button"
                    onClick={() => setMobileTab('chat')}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                      mobileTab === 'chat'
                        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-white"
                        : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                    )}
                  >
                    Chat
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileTab('plan')}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                      mobileTab === 'plan'
                        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-white"
                        : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
                      !planAvailable && "opacity-70"
                    )}
                  >
                    Outline &amp; Theme
                  </button>
                </div>
              </div>
            )}

            <div
              ref={refs.scrollContainerRef}
              className={cn(
                "flex-1 overflow-y-auto",
                isMobileView ? "px-3 py-4" : "px-4 py-8"
              )}
            >
              {isPlanView ? (
                <div className="space-y-4">
                  <section className="rounded-2xl border border-zinc-200/70 bg-white/95 dark:bg-zinc-900/80 dark:border-zinc-800/70 p-4 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.4)]">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        Generate
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-500">
                        {readinessLabel}
                      </span>
                    </div>
                    <SlideModeSelection
                      isProcessing={state.isProcessing}
                      isBlocking={state.generationStatus.isBlocking}
                      blockingLabel={state.generationStatus.blockingLabel}
                      isLocked={!state.generationStatus.canGenerate && !state.generationStatus.isBlocking}
                      lockedLabel={state.generationStatus.lockedLabel}
                      onSelect={handlers.handleSlideModeSelect}
                      onContinueChat={handlers.handleContinueChat}
                      showContinueChat={false}
                      compact
                    />
                    {showSkipChat && (
                      <SkipChatPrompt
                        onSkip={handlers.handleSkipChat}
                        label="Skip chat and auto-draft"
                        helperText="We will infer anything missing."
                        className="items-start text-left mt-3"
                      />
                    )}
                  </section>

                  <section className="rounded-2xl border border-zinc-200/70 bg-white/95 dark:bg-zinc-900/80 dark:border-zinc-800/70 p-4 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        Outline &amp; Theme
                      </span>
                      <span className="text-[10px] font-medium text-zinc-400">
                        {planAvailable ? 'Editable' : 'Pending'}
                      </span>
                    </div>
                    {planAvailable ? (
                      <div className="mt-3">
                        <OutlineThemeBlocks
                          outlineBlock={state.outlineBlock}
                          themeBlock={state.themeBlock}
                          isProcessing={state.isProcessing}
                          isThemeLoading={state.isThemeLoading}
                          isOutlinePrefetching={state.isOutlinePrefetching}
                          onSlideEdit={handlers.handleSlideEdit}
                          onSlideAdd={handlers.handleSlideAdd}
                          onSlideDelete={handlers.handleSlideDelete}
                          onSlideReorder={handlers.handleSlideReorder}
                          onLoadContent={handlers.handleLoadContent}
                          onThemeColorChange={handleThemeColorChange}
                          onThemeFontChange={handlers.handleThemeFontChange}
                          onThemeLogoChange={handlers.handleThemeLogoChange}
                          onBrandNameChange={handlers.handleBrandNameChange}
                          dense
                          outlineClassName="rounded-2xl"
                          themeClassName="rounded-2xl max-w-none sm:max-w-[360px]"
                        />
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-zinc-500 leading-relaxed">
                        Your outline and theme will appear here as soon as they are ready.
                      </p>
                    )}
                  </section>
                </div>
              ) : (
                <div className="space-y-6">
                  <MessageList
                    messages={state.messages}
                    stage={state.stage}
                    outlineBlock={state.outlineBlock}
                    themeBlock={state.themeBlock}
                    isProcessing={state.isProcessing}
                    isThemeLoading={state.isThemeLoading}
                    isOutlinePrefetching={state.isOutlinePrefetching}
                    onAction={handlers.handleAction}
                    onSlideEdit={handlers.handleSlideEdit}
                    onSlideAdd={handlers.handleSlideAdd}
                    onSlideDelete={handlers.handleSlideDelete}
                    onSlideReorder={handlers.handleSlideReorder}
                    onLoadContent={handlers.handleLoadContent}
                    onThemeColorChange={handleThemeColorChange}
                    onThemeFontChange={handlers.handleThemeFontChange}
                    onThemeLogoChange={handlers.handleThemeLogoChange}
                    onBrandNameChange={handlers.handleBrandNameChange}
                    onSlideModeSelect={handlers.handleSlideModeSelect}
                    onContinueChat={handlers.handleContinueChat}
                    onClarificationConfirm={handlers.handleClarificationConfirm}
                    onClarificationEdit={handlers.handleClarificationEdit}
                    showInlineOutline={!isMobileView}
                    showInlineSlideModeSelection={!isMobileView && state.stage === 'slide_mode_selection'}
                    inlineControlsClassName="lg:hidden"
                  />

                  {state.isAgentTyping && (
                    <AgentStatusBubble
                      thinkingSteps={state.thinkingSteps}
                      streamingText={state.streamingText}
                      statusMessage={state.statusMessage}
                      statusPhase={state.statusPhase}
                    />
                  )}

                  {showSkipChat && <SkipChatPrompt onSkip={handlers.handleSkipChat} className="lg:hidden" />}

                  <div ref={refs.messagesEndRef} />
                </div>
              )}
            </div>

            {state.stage !== 'confirmed' && !isPlanView && (
              <ChatInputArea
                input={state.input}
                onInputChange={handlers.handleInputChange}
                onKeyDown={handlers.handleKeyPress}
                inputRef={refs.inputRef}
                fileInputRef={refs.fileInputRef}
                isProcessing={state.isProcessing}
                isAgentTyping={state.isAgentTyping}
                isDraggingOver={state.isDraggingOver}
                uploadedFiles={state.uploadedFiles}
                onRemoveFile={handlers.handleRemoveFile}
                onFileUpload={handlers.handleFileUpload}
                onOpenFileDialog={handlers.openFileDialog}
                onSend={handlers.handleSendMessage}
                onVoiceTranscript={handlers.handleVoiceTranscript}
                mentionState={state.mentionState}
                selectedMentions={state.selectedMentions}
                onMentionSelect={handlers.handleMentionSelect}
                onMentionClose={handlers.closeMentionPopover}
                onMentionRemove={handlers.removeMention}
                onDragOver={handlers.handleDragOver}
                onDragLeave={handlers.handleDragLeave}
                onDrop={handlers.handleDrop}
              />
            )}
          </div>
        </div>

        <GenerationSidebar
          outlineBlock={state.outlineBlock}
          themeBlock={state.themeBlock}
          isProcessing={state.isProcessing}
          isThemeLoading={state.isThemeLoading}
          isOutlinePrefetching={state.isOutlinePrefetching}
          generationStatus={state.generationStatus}
          showSkipChat={showSkipChat}
          onSkipChat={handlers.handleSkipChat}
          onSlideModeSelect={handlers.handleSlideModeSelect}
          onSlideEdit={handlers.handleSlideEdit}
          onSlideAdd={handlers.handleSlideAdd}
          onSlideDelete={handlers.handleSlideDelete}
          onSlideReorder={handlers.handleSlideReorder}
          onLoadContent={handlers.handleLoadContent}
          onThemeColorChange={handleThemeColorChange}
          onThemeFontChange={handlers.handleThemeFontChange}
          onThemeLogoChange={handlers.handleThemeLogoChange}
          onBrandNameChange={handlers.handleBrandNameChange}
        />
      </div>

      {state.creditWarningData && (
        <CreditWarningDialog
          open={state.showCreditWarning}
          onClose={handlers.closeCreditWarning}
          remainingCredits={state.creditWarningData.remaining}
          requiredCredits={state.creditWarningData.required}
          slideCount={state.creditWarningData.slideCount}
          planName={state.creditWarningData.planName}
          mode={state.creditWarningData.mode}
          onProceed={handlers.confirmCreditWarning}
        />
      )}
    </div>
  );
};

export default ConversationalOnboarding;
