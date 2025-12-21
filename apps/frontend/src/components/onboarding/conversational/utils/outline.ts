import type { ChatMessage, OutlineData } from '@/services/outlineAgentService';
import type { OutlinePreviewData } from '@/types/chatBlocks';
import { normalizeDeckTitle } from '@/utils/normalizeDeckTitle';

export const MIN_OUTLINE_CONTENT_LENGTH = 120;

export const createOutlineSlideId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `slide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const BULLET_REGEX = /^(\d+\.|[-*]|\u2022)\s+/;
const normalizeTitle = (value?: string) => (value || '').trim().toLowerCase();

export const hasSlideTitleOverlap = (
  currentSlides: Array<{ title?: string }>,
  incomingSlides: Array<{ title?: string }>
) => {
  const currentTitles = new Set(
    currentSlides
      .map((slide) => normalizeTitle(slide.title))
      .filter(Boolean)
  );
  const incomingTitles = incomingSlides
    .map((slide) => normalizeTitle(slide.title))
    .filter(Boolean);

  if (currentTitles.size === 0 || incomingTitles.length === 0) {
    return true;
  }

  return incomingTitles.some((title) => currentTitles.has(title));
};

const coerceStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n|;/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const extractKeyPointsFromContent = (content?: string) => {
  if (!content) return [];
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => BULLET_REGEX.test(line))
    .map((line) => line.replace(BULLET_REGEX, '').trim())
    .filter(Boolean);
};

const resolveSlideContent = (slide: Record<string, any>) => {
  const candidates = [
    slide.content,
    slide.context,
    slide.description,
    slide.summary,
    slide.notes,
  ];
  const content = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
  return content ? content.trim() : '';
};

const resolveSlideKeyPoints = (slide: Record<string, any>, content?: string) => {
  const candidates = [
    slide.key_points,
    slide.keyPoints,
    slide.keypoints,
    slide.bullets,
    slide.points,
  ];
  for (const candidate of candidates) {
    const points = coerceStringArray(candidate);
    if (points.length > 0) {
      return points;
    }
  }
  return extractKeyPointsFromContent(content);
};

const normalizeUpdatedSlides = (updatedSlides?: OutlineData['updated_slides']) => {
  if (!updatedSlides || updatedSlides.length === 0) return [];
  return [...updatedSlides]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((slide) => ({
      title: slide.title,
      subtitle: slide.subtitle,
      key_points: slide.key_points,
    }));
};

export const extractOutlineSlides = (outlineData: OutlineData) => {
  if (outlineData.slides && outlineData.slides.length > 0) {
    return outlineData.slides;
  }
  const updatedSlides = normalizeUpdatedSlides(outlineData.updated_slides);
  return updatedSlides;
};

export const buildOutlinePreview = (outlineData: OutlineData): OutlinePreviewData | null => {
  const sourceSlides = extractOutlineSlides(outlineData);

  return {
    outlineId: `outline-${Date.now()}`,
    title: normalizeDeckTitle(outlineData.title || outlineData.topic) || 'Your Presentation',
    slides: sourceSlides.map((slide) => {
      const slideRecord = slide as Record<string, any>;
      const content = resolveSlideContent(slideRecord);
      const keyPoints = resolveSlideKeyPoints(slideRecord, content);
      const isContentLoaded = keyPoints.length > 0 && content.length >= MIN_OUTLINE_CONTENT_LENGTH;

      return {
        ...slideRecord,
        id: createOutlineSlideId(),
        title: slide.title,
        subtitle: slide.subtitle,
        content,
        keyPoints,
        generationContext: slideRecord.generationContext,
        isContentLoaded,
        isContentEdited: false,
        assignedVideo: slide.assignedVideo,
        taggedMedia: slide.taggedMedia,
      };
    }),
  };
};

const pickPreferredTitle = (existing?: string, incoming?: string) => {
  const current = (existing || '').trim();
  const next = (incoming || '').trim();
  if (!next) return current;
  if (!current) return next;
  if (current.toLowerCase() === 'untitled' || current.toLowerCase() === 'new slide') {
    return next;
  }
  return current;
};

const pickPreferredContent = (existing?: string, incoming?: string) => {
  const current = (existing || '').trim();
  const next = (incoming || '').trim();
  if (!next) return current;
  if (!current) return next;
  return next.length > current.length ? next : current;
};

const pickPreferredKeyPoints = (existing?: string[], incoming?: string[]) => {
  const current = Array.isArray(existing) ? existing : [];
  const next = Array.isArray(incoming) ? incoming : [];
  if (next.length === 0) return current;
  if (current.length === 0) return next;
  if (next.length > current.length) return next;
  return current;
};

export const mergeOutlinePreview = (
  outlineData: OutlineData,
  existingPreview?: OutlinePreviewData | null,
  options?: { allowReplace?: boolean }
): OutlinePreviewData | null => {
  const freshPreview = buildOutlinePreview(outlineData);
  const allowReplace = options?.allowReplace ?? true;
  if (!existingPreview) return freshPreview;
  if (freshPreview.slides.length === 0 && existingPreview.slides.length > 0) {
    return {
      ...existingPreview,
      title: freshPreview.title || existingPreview.title,
    };
  }
  if (allowReplace && !hasSlideTitleOverlap(existingPreview.slides, freshPreview.slides)) {
    return freshPreview;
  }

  const maxSlides = Math.max(existingPreview.slides.length, freshPreview.slides.length);
  const mergedSlides = Array.from({ length: maxSlides }).map((_, index) => {
    const incoming = freshPreview.slides[index];
    const current = existingPreview.slides[index];

    if (!incoming && current) return current;
    if (incoming && !current) return incoming;
    if (!incoming || !current) return null;

    const mergedTitle = pickPreferredTitle(current.title, incoming.title);
    const mergedContent = pickPreferredContent(current.content, incoming.content);
    const mergedKeyPoints = pickPreferredKeyPoints(current.keyPoints, incoming.keyPoints);
    const mergedIsContentLoaded = Boolean(
      current.isContentLoaded ||
      incoming.isContentLoaded ||
      (mergedContent.length >= MIN_OUTLINE_CONTENT_LENGTH && mergedKeyPoints.length > 0)
    );
    const mergedIsContentEdited = Boolean(current.isContentEdited);
    const mergedGenerationContext = incoming.generationContext ?? current.generationContext;

    return {
      ...incoming,
      id: current.id,
      title: mergedTitle,
      content: mergedContent,
      keyPoints: mergedKeyPoints,
      generationContext: mergedGenerationContext,
      isContentLoaded: mergedIsContentLoaded,
      isContentEdited: mergedIsContentEdited,
      assignedVideo: incoming.assignedVideo || current.assignedVideo,
      taggedMedia: incoming.taggedMedia || current.taggedMedia,
    };
  }).filter((slide): slide is NonNullable<typeof slide> => slide !== null);

  return {
    ...freshPreview,
    outlineId: existingPreview.outlineId,
    title: freshPreview.title || existingPreview.title,
    slides: mergedSlides,
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
