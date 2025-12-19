export interface SelectedElement {
  elementId: string;
  elementType?: string | null;
  slideId?: string | null;
  label: string;
  overlaps: string[];
  bounds?: { x: number; y: number; width: number; height: number } | null;
}

export interface PendingAttachment {
  name: string;
  type: string;
  size: number;
  file: File;
  previewUrl?: string;
}

export interface RegisteredAttachment {
  name: string;
  mimeType: string;
  size: number;
  url: string;
  attachmentId?: string;
  previewUrl?: string;
  file?: File;
  type?: string;
}

export type Attachment = PendingAttachment | RegisteredAttachment;
