import { useCallback } from 'react';
import type { ChatMessage } from '@/services/outlineAgentService';
import { generateSlideContent } from '@/services/outlineAgentService';
import type { OutlinePreviewData } from '@/types/chatBlocks';
import type { OutlineFlowState } from '../types';
import { buildFileContentContext, MIN_OUTLINE_CONTENT_LENGTH } from '../utils/outline';

interface UseSlideContentLoaderOptions {
  outlineBlock: OutlinePreviewData | null;
  outlineFlow: OutlineFlowState | null;
  chatHistory: ChatMessage[];
  fileAnalysisContext?: string | null;
}

export const useSlideContentLoader = ({
  outlineBlock,
  outlineFlow,
  chatHistory,
  fileAnalysisContext,
}: UseSlideContentLoaderOptions) => {
  const truncateText = (text: string, maxChars: number) => {
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}...\n[Truncated]`;
  };

  return useCallback(async (slideId: string, slideIndex: number) => {
    const slide = outlineBlock?.slides[slideIndex];
    if (!slide) {
      return { content: '', keyPoints: [], generationContext: '' };
    }

    const content = slide.content?.trim() || '';
    const keyPoints = slide.keyPoints || [];
    const isDetailed = keyPoints.length > 0 && content.length >= MIN_OUTLINE_CONTENT_LENGTH;

    const fileContent = buildFileContentContext({
      fileAnalysisContext,
      uploadedMedia: outlineFlow?.uploadedMedia,
      chatHistory,
    });

    const conversationContext = chatHistory
      .map((message) => `${message.role}: ${message.content}`)
      .slice(-4)
      .join('\n');

    const researchContext = outlineFlow?.research_context
      ? truncateText(outlineFlow.research_context, 3000)
      : '';
    const referenceContext = outlineFlow?.scraped_context
      ? truncateText(outlineFlow.scraped_context, 4000)
      : '';
    const citationContext = outlineFlow?.research_citations?.length
      ? outlineFlow.research_citations.slice(0, 6).join('\n')
      : '';

    const presentationContext = [
      conversationContext,
      researchContext ? `Research:\n${researchContext}` : '',
      referenceContext ? `Website Content:\n${referenceContext}` : '',
      citationContext ? `Citations:\n${citationContext}` : '',
    ]
      .map((part) => part.trim())
      .filter(Boolean)
      .join('\n\n');

    const generationContext = [
      presentationContext ? `Presentation Context:\n${presentationContext}` : '',
      fileContent ? `File Context:\n${fileContent}` : '',
    ]
      .map((part) => part.trim())
      .filter(Boolean)
      .join('\n\n');

    if (slide.isContentEdited || (slide.isContentLoaded && isDetailed) || isDetailed) {
      return {
        content,
        keyPoints,
        generationContext,
      };
    }

    try {
      const result = await generateSlideContent({
        slide_title: slide.title,
        slide_index: slideIndex,
        total_slides: outlineBlock?.slides.length || 0,
        presentation_topic: outlineFlow?.topic || outlineBlock?.title || '',
        presentation_context: presentationContext,
        existing_key_points: slide.keyPoints,
        file_content: fileContent,
      });

      return {
        content: result.content,
        keyPoints: result.key_points,
        generationContext,
      };
    } catch (error) {
      console.error('Failed to generate slide content:', error);
      return { content: '', keyPoints: slide.keyPoints || [], generationContext };
    }
  }, [chatHistory, fileAnalysisContext, outlineBlock, outlineFlow]);
};
