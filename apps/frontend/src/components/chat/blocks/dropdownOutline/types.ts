import type { OutlinePreviewData, OutlineSlidePreview } from '@/types/chatBlocks';

export type OutlineSlide = OutlineSlidePreview;
export type DropdownOutlineBlockData = Pick<OutlinePreviewData, 'title' | 'slides'>;

export interface SlideContentResponse {
  content: string;
  keyPoints?: string[];
  generationContext?: string;
}

export type OutlineEditField = {
  slideId: string;
  field: 'title' | 'keyPoint' | 'content';
  keyPointIndex?: number;
};

export interface DropdownOutlineChatBlockProps {
  data: DropdownOutlineBlockData;
  onSlideEdit?: (slideId: string, updates: Partial<OutlineSlide>) => void;
  onSlideAdd?: () => void;
  onSlideDelete?: (slideId: string) => void;
  onSlideReorder?: (fromIndex: number, toIndex: number) => void;
  onLoadContent?: (slideId: string, slideIndex: number) => Promise<SlideContentResponse>;
  isEditable?: boolean;
  isLoading?: boolean;
  loadingLabel?: string;
  className?: string;
}
