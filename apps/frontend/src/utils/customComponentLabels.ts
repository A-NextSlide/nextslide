import { VirtualElement } from '@/components/custom-component-editor/types';

const GENERIC_LABELS = new Set([
  'image',
  'img',
  'photo',
  'picture',
  'graphic',
  'icon',
  'logo',
  'figure',
  'background'
]);

const isGenericLabel = (label?: string | null): boolean => {
  if (!label) return true;
  const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!normalized) return true;
  if (GENERIC_LABELS.has(normalized)) return true;
  if (/^(image|img|photo|picture)\s*\d+$/.test(normalized)) return true;
  return false;
};

const getFilenameFromUrl = (src?: string | null): string | null => {
  if (!src) return null;
  try {
    const cleaned = src.split('?')[0].split('#')[0];
    const parts = cleaned.split('/');
    const last = parts[parts.length - 1] || '';
    const decoded = decodeURIComponent(last);
    if (!decoded) return null;
    return decoded.replace(/\.[a-z0-9]+$/i, '');
  } catch {
    return null;
  }
};

export const getElementDisplayName = (element: VirtualElement, index?: number): string => {
  const candidate = element.label || element.alt || element.textContent;
  if (candidate && !isGenericLabel(candidate)) {
    return candidate.length > 40 ? `${candidate.slice(0, 40)}...` : candidate;
  }

  if (element.type === 'image') {
    const filename = getFilenameFromUrl(element.src);
    if (filename) return filename;
    if (typeof index === 'number') return `Image ${index + 1}`;
    return 'Image';
  }

  if (element.type === 'text') {
    const text = (element.textContent || '').trim();
    if (text) return text.length > 40 ? `${text.slice(0, 40)}...` : text;
    return 'Text';
  }

  if (element.type === 'container') {
    return element.tagName ? `${element.tagName} container` : 'Container';
  }

  return element.tagName || 'Element';
};

export const getImagePropLabel = (name: string, value?: string | null, index?: number): string => {
  const baseLabel = name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();

  if (!isGenericLabel(baseLabel)) {
    return baseLabel;
  }

  const filename = getFilenameFromUrl(value);
  if (filename) return filename;

  if (typeof index === 'number') return `Image ${index + 1}`;

  return 'Image';
};

export const isGenericImageLabel = isGenericLabel;
