import { useCallback, useEffect, useMemo, useState } from 'react';
import { FONT_CATEGORIES } from '@/registry/library/fonts';
import { FontLoadingService } from '@/services/FontLoadingService';

const buildFallbackGroups = (): Record<string, string[]> => {
  const groups: Record<string, string[]> = {};
  for (const [category, fonts] of Object.entries(FONT_CATEGORIES)) {
    groups[category] = Array.isArray(fonts) ? fonts.map(font => font.name) : [];
  }
  return groups;
};

type FontCatalogOptions = {
  enabled?: boolean;
};

export const useFontCatalog = (options: FontCatalogOptions = {}) => {
  const { enabled = true } = options;
  const fallbackGroups = useMemo(buildFallbackGroups, []);
  const [groups, setGroups] = useState<Record<string, string[]>>(
    FontLoadingService.getDedupedFontGroups?.() || fallbackGroups
  );
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      await FontLoadingService.syncDesignerFonts?.();
    } catch {}
    const nextGroups = FontLoadingService.getDedupedFontGroups?.() || fallbackGroups;
    setGroups(nextGroups);
    setIsLoading(false);
  }, [fallbackGroups]);

  useEffect(() => {
    if (!enabled) return;
    refresh();
  }, [enabled, refresh]);

  return { groups, isLoading, refresh };
};
