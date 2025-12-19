import type { ChatMessage, OutlineData, OutlineSlide, ScrapedVideo, UploadedMedia } from '@/services/outlineAgentService';

export interface ActionButton {
  label: string;
  action: string;
}

export interface AttachmentPreview {
  id: string;
  name: string;
  type: string;
  size: number;
  previewUrl?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  buttons?: ActionButton[];
  showSlideModeSelection?: boolean;
  attachments?: AttachmentPreview[];
}

export interface CollectedData {
  topic?: string;
  stylePreferences?: string;
  style?: string;
  slideCount?: number;
  detailLevel?: 'quick' | 'standard' | 'detailed';
  presentationType?: 'simple' | 'detailed';
  slideMode?: 'interactive' | 'static';
  chatHistory?: ChatMessage[];
  themeChanges?: any;
  uploadedFiles?: File[];
  uploadedMedia?: UploadedMedia[];
  slideScreenshots?: string[];
  slides?: OutlineSlide[];
  narrative?: string;
  scrapedVideos?: ScrapedVideo[];
}

export type ConversationStage =
  | 'conversing'
  | 'planning'
  | 'slide_mode_selection'
  | 'confirmed'
  | 'chat';

export interface ConversationalOnboardingProps {
  onComplete: (data: CollectedData) => void;
  onCancel?: () => void;
  initialMessage?: string;
  slideCount?: number;
  onProcessingChange?: (isProcessing: boolean) => void;
  initialUploadedFiles?: File[];
}

export interface UploadedFile {
  file: File;
  previewUrl?: string;
}

export type OutlineFlowState = OutlineData & {
  id?: string;
  slide_screenshots?: string[];
  theme?: any;
};
