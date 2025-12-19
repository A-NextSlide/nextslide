export const normalizeReferenceImages = (images?: string[]): string[] | undefined => {
  if (!Array.isArray(images) || images.length === 0) return undefined;
  const normalized = images
    .map((img) => {
      if (typeof img !== 'string' || img.trim() === '') return null;
      return img.startsWith('data:') ? img : `data:image/png;base64,${img}`;
    })
    .filter(Boolean) as string[];
  return normalized.length > 0 ? normalized : undefined;
};
