export const normalizeReferenceImages = (images?: string[]): string[] | undefined => {
  if (!Array.isArray(images) || images.length === 0) return undefined;
  const normalized = images
    .map((img) => {
      if (typeof img !== 'string' || img.trim() === '') return null;
      const trimmed = img.trim();
      if (trimmed.startsWith('data:')) return null;
      if (/^https?:\/\//i.test(trimmed)) return trimmed;
      return null;
    })
    .filter(Boolean) as string[];
  return normalized.length > 0 ? normalized : undefined;
};
