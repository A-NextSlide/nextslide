import React, { useCallback } from 'react';
import { CreditWarningDialog } from '@/components/billing/CreditWarningDialog';
import type { ThemeColorPalette } from '@/types/chatBlocks';
import { useConversationalOnboarding } from './hooks/useConversationalOnboarding';
import OnboardingHeader from './components/OnboardingHeader';
import MessageList from './components/MessageList';
import AgentStatusBubble from './components/AgentStatusBubble';
import SkipChatPrompt from './components/SkipChatPrompt';
import ChatInputArea from './components/ChatInputArea';
import GenerationSidebar from './components/GenerationSidebar';
import type { ConversationalOnboardingProps } from './types';

const ConversationalOnboarding: React.FC<ConversationalOnboardingProps> = (props) => {
  const { state, refs, handlers } = useConversationalOnboarding(props);

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

  return (
    <div className="flex h-full w-full">
      <div className="mx-auto flex h-full w-full max-w-6xl gap-6 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
            <OnboardingHeader onCancel={props.onCancel} />

            <div ref={refs.scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-8 space-y-6">
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
                showInlineOutline
                showInlineSlideModeSelection={state.stage === 'slide_mode_selection'}
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

            {state.stage !== 'confirmed' && (
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
