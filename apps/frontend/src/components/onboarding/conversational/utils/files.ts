import { fileToBase64 } from '@/services/fileAnalysisService';
import type { FileAttachment } from '@/services/outlineAgentService';
import type { AttachmentPreview, UploadedFile } from '../types';

export const buildAttachmentPreviews = (files: UploadedFile[]): AttachmentPreview[] => {
  return files.map((file, index) => ({
    id: `file-${Date.now()}-${index}`,
    name: file.file.name,
    type: file.file.type || 'application/octet-stream',
    size: file.file.size,
    previewUrl: file.previewUrl,
  }));
};

export const convertUploadsToAttachments = async (files: UploadedFile[]): Promise<FileAttachment[]> => {
  return Promise.all(
    files.map(async (file, index) => {
      const content = await fileToBase64(file.file);
      return {
        id: `file-${Date.now()}-${index}`,
        name: file.file.name,
        type: file.file.type || 'application/octet-stream',
        content,
        size: file.file.size,
      };
    })
  );
};
