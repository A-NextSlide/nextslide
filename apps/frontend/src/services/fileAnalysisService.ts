/**
 * File Analysis Service
 * Uses Anthropic Claude via backend API to analyze uploaded files
 */

import { API_CONFIG } from '../config/environment';

export interface FileInput {
  id: string;
  name: string;
  type: string;
  content?: string; // Base64 encoded
  url?: string;
  size?: number;
}

export interface FileAnalysisResult {
  file_id: string;
  filename: string;
  file_type: string;
  analysis: string;
  summary: string;
  suggestions: string[];
  extracted_data?: Record<string, any>;
  preview_url?: string;
}

export interface FileAnalysisResponse {
  success: boolean;
  results: FileAnalysisResult[];
  combined_analysis: string;
  message: string;
  /** Total pages in the original PDF (only set for PDFs). */
  total_pages?: number | null;
  /** Pages actually analyzed (capped at 3 for free preview). */
  pages_analyzed?: number | null;
}

export interface ChatWithFilesResponse {
  success: boolean;
  response: string;
  file_analyses: string[];
  error?: string;
}

/**
 * Convert a File object to base64 string
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Analyze files using Claude
 */
export async function analyzeFiles(
  files: FileInput[],
  context?: string
): Promise<FileAnalysisResponse> {
  const response = await fetch(`${API_CONFIG.CHAT_URL.replace('/api/chat', '')}/api/files/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files,
      context: context || '',
    }),
  });

  if (!response.ok) {
    throw new Error(`Analysis failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Chat with files - send a message along with files for Claude to analyze
 */
export async function chatWithFiles(
  message: string,
  files: FileInput[],
  chatHistory: Array<{ role: string; content: string }> = []
): Promise<ChatWithFilesResponse> {
  const response = await fetch(`${API_CONFIG.CHAT_URL.replace('/api/chat', '')}/api/files/chat-with-files`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      files,
      chat_history: chatHistory,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Check if a file type is supported for analysis
 */
export function isFileSupported(file: File): boolean {
  const supportedTypes = [
    // Images
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    // Documents
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/html',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    // Spreadsheets
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // Presentations
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ];

  // Check by MIME type
  if (supportedTypes.includes(file.type)) {
    return true;
  }

  // Check by extension
  const ext = file.name.toLowerCase().split('.').pop();
  const supportedExtensions = [
    'png', 'jpg', 'jpeg', 'gif', 'webp',
    'pdf', 'txt', 'md', 'html',
    'doc', 'docx',
    'csv', 'xls', 'xlsx',
    'ppt', 'pptx'
  ];

  return supportedExtensions.includes(ext || '');
}

/**
 * Get file type category for UI display
 */
export function getFileCategory(file: File | { name: string; type: string }): 'image' | 'document' | 'spreadsheet' | 'presentation' | 'unknown' {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (type.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg)$/.test(name)) {
    return 'image';
  }

  if (
    type === 'application/pdf' ||
    type.includes('word') ||
    type === 'text/plain' ||
    /\.(pdf|doc|docx|txt|md)$/.test(name)
  ) {
    return 'document';
  }

  if (
    type.includes('excel') ||
    type.includes('spreadsheet') ||
    type === 'text/csv' ||
    /\.(csv|xls|xlsx)$/.test(name)
  ) {
    return 'spreadsheet';
  }

  if (
    type.includes('powerpoint') ||
    type.includes('presentation') ||
    /\.(ppt|pptx)$/.test(name)
  ) {
    return 'presentation';
  }

  return 'unknown';
}

/**
 * Get an icon name for a file type
 */
export function getFileIcon(file: File | { name: string; type: string }): string {
  const category = getFileCategory(file);

  switch (category) {
    case 'image':
      return 'image';
    case 'document':
      return 'file-text';
    case 'spreadsheet':
      return 'table';
    case 'presentation':
      return 'presentation';
    default:
      return 'file';
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Create a preview URL for an image file
 */
export function createImagePreview(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return null;
  }
  return URL.createObjectURL(file);
}

/**
 * Revoke a preview URL to free memory
 */
export function revokeImagePreview(url: string): void {
  URL.revokeObjectURL(url);
}
