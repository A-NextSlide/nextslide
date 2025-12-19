import { useCallback } from 'react';
import type { ChatMessage } from '@/services/outlineAgentService';
import { generateSlideContent } from '@/services/outlineAgentService';
import type { OutlinePreviewData } from '@/types/chatBlocks';
import type { OutlineFlowState } from '../types';
import { buildFileContentContext } from '../utils/outline';

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
  return useCallback(async (slideId: string, slideIndex: number) => {
    const slide = outlineBlock?.slides[slideIndex];
    if (!slide) {
      return { content: '', keyPoints: [] };
    }

    if (slide.isContentLoaded || slide.content) {
      return { content: slide.content || '', keyPoints: slide.keyPoints || [] };
    }

    const fileContent = buildFileContentContext({
      fileAnalysisContext,
      uploadedMedia: outlineFlow?.uploadedMedia,
      chatHistory,
    });

    try {
      const result = await generateSlideContent({
        slide_title: slide.title,
        slide_index: slideIndex,
        total_slides: outlineBlock?.slides.length || 0,
        presentation_topic: outlineFlow?.topic || outlineBlock?.title || '',
        presentation_context: chatHistory
          .map((message) => `${message.role}: ${message.content}`)
          .slice(-3)
          .join('\n'),
        existing_key_points: slide.keyPoints,
        file_content: fileContent,
      });

      return {
        content: result.content,
        keyPoints: result.key_points,
      };
    } catch (error) {
      console.error('Failed to generate slide content:', error);
      return { content: '', keyPoints: slide.keyPoints || [] };
    }
  }, [chatHistory, fileAnalysisContext, outlineBlock, outlineFlow]);
};
