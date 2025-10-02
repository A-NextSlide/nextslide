import React, { useMemo, useRef, useState, useEffect } from 'react';
import { BROWSER } from '@/utils/browser';
import { Bot, User, ThumbsUp, ThumbsDown, Loader2, CheckCircle2, Sparkles, Palette, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COLORS } from '@/utils/colors';
import { Progress } from '@/components/ui/progress';
import ImageCarouselWithLoading from './ImageCarouselWithLoading';
// Removed font optimization button
import { EnhancedDeckProgress } from './deck/EnhancedDeckProgress';
import { GenerationProgress } from './common/GenerationProgress';
import { motion } from 'framer-motion';
import TypewriterText from '@/components/common/TypewriterText';

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
}

// Helper function to get icon based on stage/type
const getStageIcon = (stage?: string, type?: string) => {
  // Check type first for more specific icons
  if (type) {
    switch (type) {
      case 'theme_and_style_generated':
      case 'style_analysis_complete':
      case 'final_palette':
        return <Palette className="w-4 h-4 text-orange-500" />;
      case 'slide_started':
      case 'slide_generated':
      case 'slide_completed':
      case 'component_generated':
        return <Layers className="w-4 h-4 text-orange-500" />;
      case 'images_search_started':
      case 'topic_images_found':
      case 'slide_images_found':
      case 'slide_images_ready':
      case 'images_ready_for_selection':
      case 'images_collected':
      case 'images_collection_complete':
        return <Sparkles className="w-4 h-4 text-orange-500" />;
    }
  }
  
  // Fall back to stage-based icons
  switch (stage) {
    case 'palette_found':
    case 'design_system_ready':
      return <Palette className="w-4 h-4 text-orange-500" />;
    case 'slide_started':
    case 'slide_completed':
      return <Layers className="w-4 h-4 text-orange-500" />;
    case 'image_collection':
      return <Sparkles className="w-4 h-4 text-orange-500" />;
    default:
      return <Sparkles className="w-4 h-4 text-orange-500" />;
  }
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
}) => {
  const [feedback, setFeedback] = useState<FeedbackType>(null);
  const isToolRow = metadata?.type === 'agent_tool';
  const isPlanRow = metadata?.type === 'agent_plan';
  const isEditAppliedRow = metadata?.type === 'edit_applied';
  const isCompactMetaRow = Boolean(
    metadata?.compactRow ||
    isPlanRow ||
    isToolRow ||
    // Only compact agent progress rows; deck generation streaming should keep full padding
    (metadata?.type === 'progress' && !metadata?.isStreamingUpdate) ||
    metadata?.type === 'agent_selection' ||
    isEditAppliedRow
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
  if (!isLoading && !isStreamingMessage) {
    if (safeMessage.trim().length === 0) {
      return null;
    }
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
          <div className="max-w-[80%] rounded-lg px-4 py-3 glass-panel border border-[#929292]">
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
            <div className="max-w-[80%] rounded-lg px-4 py-3 glass-panel border border-[#929292]">
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
  if ((type === 'ai' || type === 'system') && isNumericOnlyMessage && !isStreamingMessage) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex w-full items-start animate-fade-in min-w-0',
        type === 'user' ? 'justify-end' : 'justify-start',
        isCompactMetaRow ? 'mb-1' : 'mb-4'
      )}
    >
      {type !== 'user' && !isCompactMetaRow && (
        <div className="flex-shrink-0 mr-3">
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
          isCompactMetaRow ? 'px-2 py-0.5 ml-11' : 'px-4 py-3',
          type === 'user'
            ? 'bg-transparent text-foreground border-2 border-zinc-700 dark:border-[#929292] max-w-[80%]'
            : type === 'system'
            ? (metadata?.type === 'agent_plan' || metadata?.type === 'agent_tool' || metadata?.type === 'agent_selection' || metadata?.type === 'edit_applied' || metadata?.type === 'progress')
              ? 'bg-transparent max-w-[80%]'
              : 'bg-muted max-w-[80%]'
            : isStreamingMessage && !isCompleted
            ? 'border border-[#929292] bg-transparent w-full'
            : 'glass-panel border border-[#929292] max-w-[80%]'
        )}
        style={bubbleStyleWithSafariFix}
      >
        <div className="flex flex-col">
          <div className="text-sm min-w-0">
            {isLoading ? (
              <div className="flex items-center space-x-2" style={{ minHeight: '24px' }}>
                <div className="w-2 h-2 rounded-full bg-current animate-pulse"></div>
                <div className="w-2 h-2 rounded-full bg-current animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 rounded-full bg-current animate-pulse" style={{ animationDelay: '0.4s' }}></div>
              </div>
            ) : isStreamingMessage ? (
              <div className="space-y-2 min-w-0 w-full" style={{ minHeight: '24px' }}>
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-start gap-2 min-w-0">
                    {/* Only show icon if message doesn't already have an emoji */}
                    {!primaryMessage.match(/^[🎨📐⏳✅🎉❌]/) && getStageIcon(metadata?.stage, metadata?.type)}
                    <span className={cn(
                       "font-medium flex-1 break-words min-w-0",
                      isCompleted ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400"
                    )}>
                      {(/^\d+$/.test(primaryMessage.trim())) ? '' : primaryMessage}
                    </span>
                    {isCompleted && !primaryMessage.includes('🎉') && <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />}
                  </div>
                  
                </div>
                
                {/* Special rendering for images_collected events */}
                {metadata?.type === 'images_collected' && metadata?.images_by_slide && (() => {

                  return (
                    <div className="mt-2">
                      <ImageCarouselWithLoading 
                        slides={metadata.images_by_slide}
                        totalImages={metadata.total_images || 0}
                        isLoading={metadata.isLoading !== false}
                        showDuration={metadata.showDuration || 10000}
                        maxPreviewImages={10}
                      />
                    </div>
                  );
                })()}
                
                {/* Enhanced progress display for streaming messages */}
                {metadata?.progress !== undefined && metadata?.type !== 'images_collected' && !isCompleted && (
                  <div className="mt-3 w-full" style={{ minWidth: 0 }}>
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
                  <div className="mt-3 w-full" style={{ minWidth: 0 }}>
                    {inlineBelow}
                  </div>
                )}

                {/* Font optimization removed */}
                
                
                {/* Slide info - only show if not already in message */}
                {metadata?.slideTitle && Number.isFinite(metadata?.slideIndex) && metadata?.slideIndex! >= 0 && !primaryMessage.includes(metadata.slideTitle) && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Slide {(metadata.slideIndex || 0) + 1}: {metadata.slideTitle}
                  </div>
                )}
              </div>
            ) : (
              <div className="whitespace-pre-wrap break-words text-sm">
                {/* Compact, styled agent rows */}
                {metadata?.type === 'agent_plan' ? (
                  <div className="flex items-start max-w-full text-[11px] gap-2 flex-wrap whitespace-normal break-words min-w-0" style={planStyle}>
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                      <span>Planning</span>
                    </span>
                    {/* Flip-swap between Analyze context and Select tools */}
                    <motion.div layout className="flex items-center gap-2 flex-wrap min-w-0 break-words">
                      {(() => {
                        const rawSteps: string[] = (metadata?.steps || []) as string[];
                        const idxAnalyze = rawSteps.findIndex(s => s.toLowerCase().includes('analy') && s.toLowerCase().includes('context'));
                        const idxSelect = rawSteps.findIndex(s => s.toLowerCase().includes('select') && s.toLowerCase().includes('tool'));
                        let steps = [...rawSteps];
                        if (idxAnalyze !== -1 && idxSelect !== -1 && idxAnalyze < idxSelect) {
                          // swap the two for nicer progression visual
                          const tmp = steps[idxAnalyze];
                          steps[idxAnalyze] = steps[idxSelect];
                          steps[idxSelect] = tmp;
                        }
                        return steps.map((s, i) => (
                          <motion.span
                            layout
                            key={`${s}-${i}`}
                            initial={{ rotateX: 90, opacity: 0 }}
                            animate={{ rotateX: 0, opacity: 1 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 22, mass: 0.6, delay: i * 0.03 }}
                            className="break-words whitespace-normal max-w-full"
                          >
                            {i > 0 ? '· ' : ''}{s}
                          </motion.span>
                        ));
                      })()}
                    </motion.div>
                  </div>
                 ) : metadata?.type === 'agent_tool' ? (
                  <div className="inline-flex items-center max-w-full text-[11px] gap-2">
                    <span className="text-xs text-muted-foreground">{message}</span>
                  </div>
                 ) : metadata?.type === 'agent_selection' ? (
                  <div className="inline-flex items-center max-w-full text-[11px] gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border border-orange-300/60 dark:border-orange-700/60">{message}</span>
                  </div>
                ) : metadata?.type === 'edit_proposed' ? (
                  <div className="inline-flex items-center max-w-full px-2 py-1 rounded-md text-[11px]" style={proposedStyle}>
                    {message}
                  </div>
                ) : metadata?.type === 'edit_applied' ? (
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
                ) : metadata?.type === 'spacer' ? (
                  <div className="h-2" />
                ) : metadata?.type === 'progress' ? (
                  <div className="inline-flex items-center max-w-full text-[11px] text-muted-foreground">
                    {message}
                  </div>
                ) : (
                  <>{primaryMessage}</>
                )}
              </div>
            )}
            

          </div>

          {/* Timestamp/feedback hidden for compact agent rows */}
          {!(metadata?.compactRow) && safeMessage.trim().length > 0 && !/^\d+$/.test(safeMessage.trim()) && (
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-muted-foreground">
                {formattedTime}
              </span>

              {type === 'ai' && !isLoading && onFeedback && !isStreamingMessage && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleFeedback('positive')}
                    className={cn(
                      'p-1 rounded hover:bg-muted transition-colors',
                      feedback === 'positive' && 'text-green-600'
                    )}
                    aria-label="Good response"
                  >
                    <ThumbsUp size={14} />
                  </button>
                  <button
                    onClick={() => handleFeedback('negative')}
                    className={cn(
                      'p-1 rounded hover:bg-muted transition-colors',
                      feedback === 'negative' && 'text-red-600'
                    )}
                    aria-label="Bad response"
                  >
                    <ThumbsDown size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Small tags for selections/attachments on user messages */}
          {type === 'user' && (((metadata?.selectionsPreview?.length ?? 0) > 0) || ((metadata?.attachmentNames?.length ?? 0) > 0)) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {(metadata?.selectionsPreview || []).map((s: any) => (
                <span key={`sel-${s.id}`} className="px-2 py-0.5 rounded-full text-[10px] border border-neutral-300/70 dark:border-neutral-700 bg-neutral-900/5 dark:bg-white/10">
                  {s.label}
                </span>
              ))}
              {(metadata?.attachmentNames || []).map((n: string, i: number) => (
                <span key={`att-${i}`} className="px-2 py-0.5 rounded-full text-[10px] border border-neutral-300/70 dark:border-neutral-700 bg-neutral-900/5 dark:bg-white/10">
                  {n}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {type === 'user' && (
        <div className="flex-shrink-0 ml-3">
          <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
            <User size={18} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
