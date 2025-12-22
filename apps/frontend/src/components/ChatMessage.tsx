import React, { useMemo, useRef, useState, useEffect } from 'react';
import { BROWSER } from '@/utils/browser';
import { Bot, User, ThumbsUp, ThumbsDown, Loader2, CheckCircle2, Image as ImageIcon, FileText, Table, Presentation, File, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COLORS } from '@/utils/colors';
import { Progress } from '@/components/ui/progress';
import ImageCarouselWithLoading from './ImageCarouselWithLoading';
// Removed font optimization button
import { EnhancedDeckProgress } from './deck/EnhancedDeckProgress';
import { GenerationProgress } from './common/GenerationProgress';
import { motion } from 'framer-motion';
import TypewriterText from '@/components/common/TypewriterText';
import ThinkingIndicator from '@/components/common/ThinkingIndicator';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { SlideSnapshotThumbnail } from '@/components/chat/blocks/SlideSnapshotThumbnail';
import { IntegrationMentionBubble } from '@/components/chat';
import { LinkedInSearchResults, type LinkedInProfile } from '@/components/chat/blocks';

export type MessageType = 'ai' | 'user' | 'system';
export type FeedbackType = 'positive' | 'negative' | null;

export interface ChatMessageProps {
  type: MessageType;
  message: string;
  timestamp?: Date;
  isLoading?: boolean;
  onFeedback?: (feedback: FeedbackType) => void;
  metadata?: Record<string, any>;
  inlineBelow?: React.ReactNode;
  /** Edit applied data to render within AI bubble (grouped with message) */
  editAppliedData?: {
    slideSnapshot?: any;
    preEditSnapshot?: any;
    editId?: string;
    editSummary?: string;
    slideNumber?: number | null;
  };
  /** Callback when user selects a LinkedIn profile from search results */
  onSelectLinkedInProfile?: (profile: LinkedInProfile) => void;
  /** Callback when user skips LinkedIn profile selection */
  onSkipLinkedInSelection?: () => void;
  /** Currently selected LinkedIn profile ID */
  selectedLinkedInProfileId?: string;
}


// Known integration names for rendering mentions in messages
const KNOWN_INTEGRATIONS: Record<string, string> = {
  linkedin: 'LinkedIn',
  salesforce: 'Salesforce',
  hubspot: 'HubSpot',
  gmail: 'Gmail',
  notion: 'Notion',
  slack: 'Slack',
  'google-drive': 'Google Drive',
  apollo: 'Apollo',
};

/**
 * Helper function to render text with **bold** markdown and @integration mentions
 */
const renderMarkdown = (text: string): React.ReactNode[] => {
  // First, split by mentions and bold patterns
  const mentionBoldRegex = /(@\w+|\*\*.*?\*\*|\[\[.*?\]\])/g;
  const parts = text.split(mentionBoldRegex);

  return parts.map((part, index) => {
    // Handle bold markdown
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }

    // Handle integration mentions
    if (part.startsWith('@')) {
      const integrationId = part.slice(1).toLowerCase();
      const integrationName = KNOWN_INTEGRATIONS[integrationId];

      if (integrationName) {
        return (
          <IntegrationMentionBubble
            key={index}
            id={integrationId}
            name={integrationName}
            variant="message"
            size="sm"
          />
        );
      }
      // Return as-is if not a known integration
      return <span key={index}>{part}</span>;
    }

    // Handle inline editable tokens (mad libs style)
    if (part.startsWith('[[') && part.endsWith(']]')) {
      return (
        <span key={index} className="underline underline-offset-4 decoration-2 decoration-orange-400">
          {part.slice(2, -2)}
        </span>
      );
    }

    return <span key={index}>{part}</span>;
  });
};

/**
 * Chat message component that displays messages from AI or user
 */
const ChatMessage: React.FC<ChatMessageProps> = ({
  type,
  message,
  timestamp = new Date(),
  isLoading = false,
  onFeedback,
  metadata,
  inlineBelow,
  editAppliedData,
  onSelectLinkedInProfile,
  onSkipLinkedInSelection,
  selectedLinkedInProfileId,
}) => {
  const [feedback, setFeedback] = useState<FeedbackType>(null);
  const isToolRow = metadata?.type === 'agent_tool';
  const isPlanRow = metadata?.type === 'agent_plan';
  const isEditAppliedRow = metadata?.type === 'edit_applied';
  const isCompletionRow = metadata?.type === 'generation_complete' || metadata?.stage === 'generation_complete';
  const isCompactMetaRow = Boolean(
    metadata?.compactRow ||
    // Note: isPlanRow and isToolRow are NOT compact anymore - we show full planning-style text
    // Only compact agent progress rows; deck generation streaming should keep full padding
    (metadata?.type === 'progress' && !metadata?.isStreamingUpdate) ||
    metadata?.type === 'agent_selection' ||
    isEditAppliedRow ||
    isCompletionRow
  );
  
  // Debug logging for images_collected events
  if (metadata?.type === 'images_collected') {
    // Removed debug logging
  }
  
  // Format time safely (guard against invalid Date)
  const safeTimestamp = ((): Date => {
    if (timestamp instanceof Date && !isNaN(timestamp.getTime())) return timestamp;
    const parsed = new Date(timestamp as any);
    return parsed instanceof Date && !isNaN(parsed.getTime()) ? parsed : new Date();
  })();

  const formattedTime = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric'
  }).format(safeTimestamp);

  const handleFeedback = (newFeedback: FeedbackType) => {
    // Toggle feedback if clicking on the same button
    const updatedFeedback = feedback === newFeedback ? null : newFeedback;
    setFeedback(updatedFeedback);
    
    if (onFeedback) {
      onFeedback(updatedFeedback);
    }
  };

  // Check if this is a streaming progress message
  const isStreamingMessage = metadata?.stage || metadata?.progress !== undefined || metadata?.type === 'images_collected' || metadata?.isStreamingUpdate === true;

  // Compute message flags before any memoized styles that depend on them
  const safeMessage = typeof message === 'string' ? message : '';
  const isNumericOnlyMessage = /^\d+$/.test(safeMessage.trim());
  const isCompleted = safeMessage.includes('Your presentation is ready!') ||
                     metadata?.type === 'generation_complete' || 
                     metadata?.type === 'deck_complete' || 
                     metadata?.type === 'deck_rendered' ||
                     metadata?.type === 'import_complete' ||
                     metadata?.progress === 100;
  const isImagesMessage = metadata?.type === 'images_collected';

  const bubbleStyle: React.CSSProperties = React.useMemo(() => {
    // Make streaming/progress rows span the full chat width
    if (isStreamingMessage && !isCompleted) {
      return { width: '100%' };
    }
    // Normal bubbles: clamp for readability and wrap long tokens
    return { maxWidth: 560, wordBreak: 'break-word', overflowWrap: 'anywhere' };
  }, [isStreamingMessage, isCompleted]);

  // Safari fix: disable glass blur on AI bubbles to avoid black top gradient artifact
  const shouldUseGlass = type !== 'user' && type !== 'system' && !(isStreamingMessage && !isCompleted);
  const bubbleStyleWithSafariFix: React.CSSProperties = React.useMemo(() => {
    if (BROWSER.isSafari && shouldUseGlass) {
      return {
        ...bubbleStyle,
        WebkitBackdropFilter: 'none',
        backdropFilter: 'none',
        backgroundImage: 'none',
        backgroundColor: 'rgba(255,255,255,0.06)'
      } as React.CSSProperties;
    }
    return bubbleStyle;
  }, [bubbleStyle, shouldUseGlass]);

  const planStyle: React.CSSProperties = {
    borderColor: 'transparent',
    background: 'transparent',
    fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
    fontWeight: 600,
    letterSpacing: '0.2px'
  };
  const toolStyle: React.CSSProperties = {
    borderColor: 'transparent',
    background: 'transparent',
    fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
    fontWeight: 600
  };
  const errorToolStyle: React.CSSProperties = {
    borderColor: 'rgba(220,38,38,0.6)',
    background: 'rgba(220,38,38,0.06)',
    color: 'rgb(220,38,38)',
    fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
    fontWeight: 700
  };
  const proposedStyle: React.CSSProperties = {
    borderColor: 'rgba(245,158,11,0.7)',
    background: 'rgba(245,158,11,0.08)',
    fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
    fontWeight: 700
  };
  const appliedStyle: React.CSSProperties = {
    borderColor: 'rgba(34,197,94,0.7)',
    background: 'rgba(34,197,94,0.08)',
    fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
    fontWeight: 700
  };
  
  
  // Hide truly empty messages unless we're explicitly showing a loader or a streaming/progress UI
  // BUT: don't hide if we have editAppliedData with a slideSnapshot to display
  if (!isLoading && !isStreamingMessage && !metadata?.isCreditsExhausted) {
    if (safeMessage.trim().length === 0 && !editAppliedData?.slideSnapshot) {
      return null;
    }
  }

  // Handle credits exhausted message with upgrade CTA
  if (metadata?.isCreditsExhausted) {
    return (
      <div className="flex w-full mb-3 items-start animate-fade-in justify-start">
        <div className="flex-shrink-0 mr-3">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-600 flex items-center justify-center">
            <Zap size={18} />
          </div>
        </div>
        <div className="flex-1 max-w-[85%]">
          <div className="rounded-xl px-4 py-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
              You've run out of credits
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
              Upgrade your plan to continue creating amazing presentations.
            </p>
            <UpgradeButton />
          </div>
        </div>
      </div>
    );
  }

  // Removed debug logging for font optimization button


  // Split completion message if needed
  let primaryMessage = safeMessage;
  let secondaryMessage = '';
  let editorInstructions = '';
  
  if (isCompleted) {
    if (safeMessage.includes('Your presentation is ready!')) {
      primaryMessage = 'Your presentation is ready!';
      secondaryMessage = ''; // Clear any secondary message
    } else {
      // If it's a completion message but doesn't have the expected format,
      // just show it as a green message
      primaryMessage = message;
    }
  }

  // For completion messages, return special layout
  if (isCompleted && secondaryMessage) {
    return (
      <div className="space-y-2">
        {/* Green completion message */}
        <div className="flex w-full mb-2 items-start animate-fade-in justify-start">
          <div className="flex-shrink-0 mr-3">
            <div className="w-8 h-8 rounded-full text-white flex items-center justify-center" style={{ backgroundColor: COLORS.SUGGESTION_PINK }}>
              <Bot size={18} />
            </div>
          </div>
          <div className="max-w-[80%] rounded-lg px-3 py-2 glass-panel border border-[#929292] shadow-none">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                {primaryMessage}
              </span>
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            </div>
            
            {/* Font optimization removed */}
            
            {/* Timestamp with gap */}
            <div className="mt-3">
              <span className="text-xs text-muted-foreground">{formattedTime}</span>
            </div>
          </div>
        </div>
        
        {/* Normal message bubble with secondary message */}
        {secondaryMessage && (
          <div className="flex w-full mb-2 items-start animate-fade-in justify-start">
            <div className="flex-shrink-0 mr-3">
              <div className="w-8 h-8" /> {/* Spacer */}
            </div>
            <div className="max-w-[80%] rounded-lg px-3 py-2 glass-panel border border-[#929292] shadow-none">
              <div className="text-sm whitespace-pre-wrap">
                {secondaryMessage.split('Press E or double-click').map((part, index) => {
                  if (index === 0) {
                    return <span key={index}>{part}</span>;
                  } else {
                    return (
                      <span key={index}>
                        <br />
                        <span className="text-xs" style={{ color: COLORS.SUGGESTION_PINK }}>
                          Press E or double-click{part}
                        </span>
                      </span>
                    );
                  }
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Hide stray numeric-only messages for AI/system (prevents lone "0")
  // BUT: don't hide if we have editAppliedData with a slideSnapshot to display
  if ((type === 'ai' || type === 'system') && isNumericOnlyMessage && !isStreamingMessage && !editAppliedData?.slideSnapshot) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex w-full items-start animate-fade-in min-w-0',
        type === 'user' ? 'justify-end' : 'justify-start',
        (isCompactMetaRow || isToolRow || isPlanRow) ? 'mb-1' : 'mb-2'
      )}
    >
      {type !== 'user' && !isCompactMetaRow && !isPlanRow && !isToolRow && (
        <div className="flex-shrink-0 mr-2">
          <div className={cn(
            "w-8 h-8 rounded-full text-white flex items-center justify-center"
          )} style={{ backgroundColor: COLORS.SUGGESTION_PINK }}>
            {/* Show icon only for the first row of the agent flow; hide for compact agent rows */}
            {metadata?.compactRow ? null : (
              isStreamingMessage && !isCompleted && !isImagesMessage ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Bot size={18} />
              )
            )}
          </div>
        </div>
      )}

      <div
        className={cn(
          'rounded-lg text-left break-words overflow-x-hidden min-w-0',
          // ml-10 aligns compact rows under the avatar (w-8) + mr-2 spacing
          isCompactMetaRow ? 'px-2 py-0.5 ml-10' : 'px-3 py-2',
          type === 'user'
            ? 'bg-transparent text-foreground border border-zinc-700/70 dark:border-[#929292]/80 max-w-[80%]'
            : type === 'system'
            ? (metadata?.type === 'agent_plan' || metadata?.type === 'agent_tool' || metadata?.type === 'agent_selection' || metadata?.type === 'edit_applied' || metadata?.type === 'progress' || metadata?.type === 'generation_complete' || metadata?.type === 'linkedin_profiles' || metadata?.stage === 'generation_complete')
              ? 'bg-transparent max-w-[80%]'
              : 'bg-muted max-w-[80%]'
            : isCompletionRow
            ? 'bg-transparent max-w-[80%]'
            : isStreamingMessage && !isCompleted
            ? 'border border-[#929292] bg-transparent w-full'
            : 'glass-panel border border-[#929292] max-w-[80%] shadow-none'
        )}
        style={bubbleStyleWithSafariFix}
      >
        <div className="flex flex-col">
          <div className="text-[12px] leading-snug min-w-0">
            {isLoading ? (
              <div style={{ minHeight: '20px' }}>
                <ThinkingIndicator
                  customText={safeMessage && safeMessage.trim().length > 0 ? safeMessage : undefined}
                  size="sm"
                />
              </div>
            ) : isStreamingMessage ? (
              <div className="space-y-1 min-w-0 w-full" style={{ minHeight: '20px' }}>
                {/* Subtle, on-brand status display */}
                {metadata?.thinkingPhase && !(metadata?.progress !== undefined && metadata?.type !== 'images_collected' && !isCompleted) && (
                  <div className="flex items-start gap-1.5 min-w-0">
                    <ThinkingIndicator
                      customText={
                        metadata.thinkingPhase === 'researching' ? 'Searching the web' :
                        metadata.thinkingPhase === 'scraping' ? 'Reading page' :
                        metadata.thinkingPhase === 'processing' ? 'Processing results' :
                        metadata.thinkingPhase === 'analyzing' ? 'Analyzing' :
                        metadata.thinkingPhase === 'generating' ? 'Creating outline' :
                        undefined
                      }
                      size="sm"
                    />
                    {/* Additional context from message */}
                    {(() => {
                      const cleanedMessage = primaryMessage
                        .replace(/^[🔍📄✓🧠💭🤔✨🎯📎⚠️]\s*/, '')
                        .replace(/^(Searching the web for|Reading website|Reading page|Processing results|Analyzing|Creating outline|Thinking|Got it! Now thinking|Found info! Processing|Couldn't find info online, winging it)\s*/i, '')
                        .trim();
                      return cleanedMessage ? (
                        <span className="text-[12px] text-muted-foreground">{cleanedMessage}</span>
                      ) : null;
                    })()}
                  </div>
                )}

                {/* Fallback for non-thinking streaming messages */}
                {!metadata?.thinkingPhase && !(metadata?.progress !== undefined && metadata?.type !== 'images_collected' && !isCompleted) && (
                  <div className="flex items-center gap-2 min-w-0">
                    {!isCompleted && (
                      <span
                        className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0"
                        style={{ backgroundColor: '#FF4301' }}
                      />
                    )}
                    {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
                    <span className={cn(
                      "text-[12px] flex-1 break-words min-w-0",
                      isCompleted ? "text-green-600 dark:text-green-400" : "text-foreground/80"
                    )}>
                      {(/^\d+$/.test(primaryMessage.trim())) ? '' : primaryMessage}
                    </span>
                  </div>
                )}

                {/* Special rendering for images_collected events */}
                {metadata?.type === 'images_collected' && metadata?.images_by_slide && (
                  <div className="mt-1.5">
                    <ImageCarouselWithLoading
                      slides={metadata.images_by_slide}
                      totalImages={metadata.total_images || 0}
                      isLoading={metadata.isLoading !== false}
                      showDuration={metadata.showDuration || 10000}
                      maxPreviewImages={10}
                    />
                  </div>
                )}

                {/* LinkedIn profile search results */}
                {metadata?.type === 'linkedin_profiles' && (
                  <div className="mt-2 -mx-1">
                    <LinkedInSearchResults
                      query={metadata.query || ''}
                      profiles={metadata.profiles || []}
                      isLoading={metadata.isLoading}
                      selectedProfileId={selectedLinkedInProfileId}
                      onSelectProfile={onSelectLinkedInProfile}
                      onSkip={onSkipLinkedInSelection}
                    />
                  </div>
                )}

                {/* Enhanced progress display for streaming messages */}
                {metadata?.progress !== undefined && metadata?.type !== 'images_collected' && !isCompleted && (
                  <div className="mt-2 w-full" style={{ minWidth: 0 }}>
                    <EnhancedDeckProgress
                      phase={metadata.phase || metadata.stage || 'status_update'}
                      progress={metadata.progress}
                      message={primaryMessage}
                      currentSlide={metadata.slideIndex}
                      totalSlides={metadata.slidesTotal}
                      slidesInProgress={metadata.slidesInProgress}
                      completedSlides={metadata.completedSlides}
                      errors={metadata.errors}
                      substep={metadata.substep}
                    />
                  </div>
                )}

                {/* Inline custom content (e.g., Theme & assets panel) */}
                {inlineBelow && (
                  <div className="mt-2 w-full" style={{ minWidth: 0 }}>
                    {inlineBelow}
                  </div>
                )}

                {/* Slide info - only show if not already in message */}
                {metadata?.slideTitle && Number.isFinite(metadata?.slideIndex) && metadata?.slideIndex! >= 0 && !primaryMessage.includes(metadata.slideTitle) && (
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Slide {(metadata.slideIndex || 0) + 1}: {metadata.slideTitle}
                  </div>
                )}
              </div>
            ) : (
              <div
                className="whitespace-pre-wrap break-words text-[12px] leading-snug"
              >
                {/* Compact, styled agent rows */}
                {metadata?.type === 'agent_plan' ? (
                  <div className="flex flex-col gap-1 max-w-full text-[10px] whitespace-normal break-words min-w-0" style={planStyle}>
                    <span className="inline-flex items-center gap-1 text-muted-foreground text-[9px]">
                      <span className="w-1 h-1 rounded-full bg-orange-500 animate-pulse" />
                      <span>Reviewing slide</span>
                    </span>
                    {/* Show full planning text for each step */}
                    <motion.div layout className="flex flex-col gap-0.5 min-w-0">
                      {(() => {
                        const rawSteps: string[] = (metadata?.steps || []) as string[];
                        return rawSteps.map((s, i) => (
                          <motion.div
                            layout
                            key={`${s}-${i}`}
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 22, mass: 0.6, delay: i * 0.05 }}
                            className="break-words whitespace-normal text-[10px] text-foreground/70 pl-2 border-l border-orange-500/30"
                          >
                            {s}
                          </motion.div>
                        ));
                      })()}
                    </motion.div>
                  </div>
                 ) : metadata?.type === 'agent_tool' ? (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 22, mass: 0.6 }}
                    className="flex items-center gap-1 max-w-full text-[10px] whitespace-normal break-words min-w-0 pl-2 border-l border-orange-500/30"
                    style={planStyle}
                  >
                    <span className="w-1 h-1 rounded-full bg-orange-500 animate-pulse flex-shrink-0" />
                    <span className="text-foreground/70">{message}</span>
                  </motion.div>
                 ) : metadata?.type === 'agent_selection' ? (
                  <div className="inline-flex items-center max-w-full text-[11px] gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border border-orange-300/60 dark:border-orange-700/60">{message}</span>
                  </div>
                ) : metadata?.type === 'edit_proposed' ? (
                  <div className="inline-flex items-center max-w-full px-2 py-1 rounded-md text-[11px]" style={proposedStyle}>
                    {message}
                  </div>
                ) : metadata?.type === 'edit_applied' ? (
                  <div className="flex flex-col gap-2">
                    {/* Edit applied header */}
                    <div className="inline-flex items-center max-w-full gap-2 text-[11px]" style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}>
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full ring-1 ring-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="w-3 h-3" />
                      </span>
                      <TypewriterText
                        text={safeMessage.replace(/^✅\s*/, '').toUpperCase()}
                        delay={22}
                        className="text-[11px] font-extrabold tracking-wide text-[#FF4301] dark:text-[#FF4301]"
                        fontSizePx={12}
                        fontWeight={900}
                        uppercase={true}
                        cursorColor={COLORS.SUGGESTION_PINK}
                      />
                    </div>
                    {/* Slide thumbnail for restore */}
                    {metadata?.slideSnapshot && (
                      <SlideSnapshotThumbnail
                        slideSnapshot={metadata.slideSnapshot}
                        preEditSnapshot={metadata.preEditSnapshot}
                        editId={metadata.editId}
                        onApply={metadata.onApply}
                        onRestore={metadata.onRestore}
                        timestamp={timestamp}
                        summary={metadata.editSummary}
                      />
                    )}
                  </div>
                ) : metadata?.type === 'spacer' ? (
                  <div className="h-2" />
                ) : metadata?.type === 'progress' ? (
                  <div className="inline-flex items-center max-w-full text-[11px] text-muted-foreground">
                    {message}
                  </div>
                ) : isCompletionRow ? (
                  <div className="inline-flex items-center gap-2 text-[11px]" style={{ fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif' }}>
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full ring-1 ring-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400">
                      <CheckCircle2 className="w-3 h-3" />
                    </span>
                    <span className="font-semibold tracking-wide text-green-600 dark:text-green-400">
                      Ready to edit
                    </span>
                  </div>
                ) : metadata?.type === 'linkedin_profiles' ? (
                  // LinkedIn profile search results (non-streaming)
                  <div className="flex flex-col gap-2">
                    <TypewriterText
                      text={primaryMessage}
                      delay={12}
                      uppercase={false}
                      fontSizePx={12}
                      fontWeight={400}
                      fontFamily="inherit"
                      cursorColor={COLORS.SUGGESTION_PINK}
                      renderMarkdown={true}
                    />
                    <div className="mt-2 -mx-1">
                      <LinkedInSearchResults
                        query={metadata.query || ''}
                        profiles={metadata.profiles || []}
                        isLoading={metadata.isLoading}
                        selectedProfileId={selectedLinkedInProfileId}
                        onSelectProfile={onSelectLinkedInProfile}
                        onSkip={onSkipLinkedInSelection}
                      />
                    </div>
                  </div>
                ) : type === 'ai' ? (
                  metadata?.streamed ? (
                    <>{renderMarkdown(primaryMessage)}</>
                  ) : (
                    <TypewriterText
                      text={primaryMessage}
                      delay={18}
                      uppercase={false}
                      fontSizePx={12}
                      fontWeight={400}
                      fontFamily="inherit"
                      cursorColor={COLORS.SUGGESTION_PINK}
                      renderMarkdown={true}
                    />
                  )
                ) : (
                  <>{renderMarkdown(primaryMessage)}</>
                )}
              </div>
            )}

            {/* Edit Applied section - rendered within AI bubble */}
            {type === 'ai' && editAppliedData?.slideSnapshot && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="mt-3 pt-3 border-t border-gray-200/50 dark:border-gray-700/50"
              >
                {/* Slide X - Edit Applied label */}
                <div className="flex items-center gap-1.5 mb-2">
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  <span className="text-[10px] font-medium text-green-600 dark:text-green-400">
                    {editAppliedData.slideNumber ? `Slide ${editAppliedData.slideNumber}` : 'Slide'} — Edit Applied
                  </span>
                </div>

                {/* Thumbnail with restore button */}
                <div className="flex items-start gap-2">
                  <SlideSnapshotThumbnail
                    slideSnapshot={editAppliedData.slideSnapshot}
                    preEditSnapshot={editAppliedData.preEditSnapshot}
                    editId={editAppliedData.editId}
                    timestamp={timestamp}
                    summary={editAppliedData.editSummary}
                  />
                </div>
              </motion.div>
            )}

          </div>

          {/* Timestamp/feedback hidden for compact agent rows */}
          {!(metadata?.compactRow) && safeMessage.trim().length > 0 && !/^\d+$/.test(safeMessage.trim()) && (
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[9px] text-muted-foreground/70">
                {formattedTime}
              </span>

              {type === 'ai' && !isLoading && onFeedback && !isStreamingMessage && (
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => handleFeedback('positive')}
                    className={cn(
                      'p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground/50 hover:text-muted-foreground',
                      feedback === 'positive' && 'text-green-600'
                    )}
                    aria-label="Good response"
                  >
                    <ThumbsUp size={10} />
                  </button>
                  <button
                    onClick={() => handleFeedback('negative')}
                    className={cn(
                      'p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground/50 hover:text-muted-foreground',
                      feedback === 'negative' && 'text-red-600'
                    )}
                    aria-label="Bad response"
                  >
                    <ThumbsDown size={10} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Integration mentions on user messages */}
          {type === 'user' && (metadata?.integrationMentions?.length ?? 0) > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(metadata?.integrationMentions || []).map((mention: { id: string; name: string }) => (
                <IntegrationMentionBubble
                  key={`mention-${mention.id}`}
                  id={mention.id}
                  name={mention.name}
                  variant="message"
                  size="sm"
                />
              ))}
            </div>
          )}

          {/* Selections on user messages */}
          {type === 'user' && (metadata?.selectionsPreview?.length ?? 0) > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {(metadata?.selectionsPreview || []).map((s: any) => (
                <span key={`sel-${s.id}`} className="px-2 py-0.5 rounded-full text-[10px] border border-neutral-300/70 dark:border-neutral-700 bg-neutral-900/5 dark:bg-white/10">
                  {s.label}
                </span>
              ))}
            </div>
          )}

          {/* File attachments with nice preview */}
          {type === 'user' && (metadata?.attachments?.length ?? 0) > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(metadata?.attachments || []).map((att: any, i: number) => {
                const isImage = att.type?.startsWith('image/') || att.mimeType?.startsWith('image/');
                const previewUrl = att.previewUrl || att.url;
                const filename = att.name || `File ${i + 1}`;
                const ext = filename.split('.').pop()?.toLowerCase() || '';

                // Determine file category and icon
                const isDoc = ['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext);
                const isSheet = ['csv', 'xls', 'xlsx'].includes(ext);
                const isPpt = ['ppt', 'pptx'].includes(ext);

                const FileIcon = isImage ? ImageIcon
                  : isDoc ? FileText
                  : isSheet ? Table
                  : isPpt ? Presentation
                  : File;

                const iconBg = isImage ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600'
                  : isDoc ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'
                  : isSheet ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                  : isPpt ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600'
                  : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600';

                return (
                  <div
                    key={`att-${i}`}
                    className="flex items-center gap-2 rounded-lg border border-neutral-300/70 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 overflow-hidden"
                  >
                    {isImage && previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={filename}
                        className="w-12 h-12 object-cover"
                      />
                    ) : (
                      <div className={`w-10 h-10 flex items-center justify-center ${iconBg}`}>
                        <FileIcon size={18} />
                      </div>
                    )}
                    <div className="pr-3 py-1">
                      <span className="text-xs font-medium truncate block max-w-[120px]">{filename}</span>
                      {att.size && (
                        <span className="text-[10px] text-muted-foreground">
                          {att.size < 1024 ? `${att.size} B` :
                           att.size < 1024 * 1024 ? `${(att.size / 1024).toFixed(1)} KB` :
                           `${(att.size / (1024 * 1024)).toFixed(1)} MB`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Fallback: Simple attachment names if no full attachment data */}
          {type === 'user' && !(metadata?.attachments?.length) && (metadata?.attachmentNames?.length ?? 0) > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {(metadata?.attachmentNames || []).map((n: string, i: number) => (
                <span key={`att-name-${i}`} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border border-neutral-300/70 dark:border-neutral-700 bg-neutral-900/5 dark:bg-white/10">
                  <File size={10} />
                  {n}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {type === 'user' && (
        <div className="flex-shrink-0 ml-2">
          <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
            <User size={18} />
          </div>
        </div>
      )}
    </div>
  );
};

// Helper component for upgrade button with navigation
const UpgradeButton: React.FC = () => {
  const navigate = useNavigate();
  return (
    <Button
      size="sm"
      onClick={() => navigate('/pricing')}
      className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-8"
    >
      <Zap className="h-3 w-3 mr-1.5" />
      Upgrade Plan
    </Button>
  );
};

export default ChatMessage;
