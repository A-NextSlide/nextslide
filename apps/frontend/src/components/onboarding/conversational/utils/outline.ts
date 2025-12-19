import type { ChatMessage, OutlineData } from '@/services/outlineAgentService';
import type { OutlinePreviewData } from '@/types/chatBlocks';

export const createOutlineSlideId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `slide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const buildOutlinePreview = (outlineData: OutlineData): OutlinePreviewData | null => {
  if (!outlineData.slides || outlineData.slides.length === 0) {
    return null;
  }

  return {
    outlineId: `outline-${Date.now()}`,
    title: outlineData.topic || 'Your Presentation',
    slides: outlineData.slides.map((slide) => ({
      id: createOutlineSlideId(),
      title: slide.title,
      subtitle: slide.subtitle,
      keyPoints: slide.key_points,
      content: slide.content,
      isContentLoaded: Boolean(slide.content),
      assignedVideo: slide.assignedVideo,
      taggedMedia: slide.taggedMedia,
    })),
  };
};

export const buildFileContentContext = ({
  fileAnalysisContext,
  uploadedMedia,
  chatHistory,
}: {
  fileAnalysisContext?: string | null;
  uploadedMedia?: Array<{ name?: string; type?: string }>;
  chatHistory: ChatMessage[];
}) => {
  const fileContentParts: string[] = [];

  if (fileAnalysisContext) {
    fileContentParts.push(`File Analysis:\n${fileAnalysisContext}`);
  }

  if (uploadedMedia && uploadedMedia.length > 0) {
    const mediaInfo = uploadedMedia
      .map((media) => `- ${media.name || 'file'} (${media.type || 'unknown'})`)
      .join('\n');
    fileContentParts.push(`Uploaded Files:\n${mediaInfo}`);
  }

  const fileRelatedMessages = chatHistory
    .filter((message) =>
      message.content.toLowerCase().includes('file') ||
      message.content.toLowerCase().includes('upload') ||
      message.content.toLowerCase().includes('document')
    )
    .slice(-2)
    .map((message) => `${message.role}: ${message.content}`);

  if (fileRelatedMessages.length > 0) {
    fileContentParts.push(`User Instructions:\n${fileRelatedMessages.join('\n')}`);
  }

  return fileContentParts.length > 0 ? fileContentParts.join('\n\n') : undefined;
};
