import { Theme } from '@/types/themes';
import { FontApiService } from '@/services/FontApiService';
import { normalizeThemeWeights } from '@/utils/themeTypography';

type HuemintResult = {
  palette: string[];
};

const buildTemperature = () => {
  const varietySeed = `${Date.now()}-${Math.random()}`;
  const seedHash = Math.abs(varietySeed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0));
  return 1.0 + (seedHash % 5) * 0.1;
};

const requestHuemintPalettes = async (): Promise<HuemintResult[]> => {
  const adjacencyMatrix = [
    '0', '60', '50',
    '60', '0', '50',
    '50', '50', '0'
  ];

  const jsonData = {
    mode: 'transformer',
    num_colors: 3,
    temperature: buildTemperature().toString(),
    num_results: 10,
    adjacency: adjacencyMatrix,
    palette: ['-', '-', '-']
  };

  const response = await fetch('https://api.huemint.com/color', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(jsonData)
  });

  if (!response.ok) {
    throw new Error(`Huemint API error: ${response.statusText}`);
  }

  const data = await response.json();
  return Array.isArray(data?.results) ? data.results : [];
};

const recommendFonts = async (deckTitle: string, keywords: string[], vibe?: string) => {
  try {
    const rec = await FontApiService.recommend({
      deck_title: deckTitle,
      vibe: vibe?.trim() || '',
      content_keywords: keywords
    });
    const headingFont = rec?.hero?.[0]?.name;
    const bodyFont = rec?.body?.[0]?.name;

    const preload = Array.from(new Set([headingFont, bodyFont].filter(Boolean))) as string[];
    for (const family of preload) {
      await FontApiService.findAndLoadByFamily(family, '400');
    }

    return { headingFont, bodyFont };
  } catch {
    return { headingFont: undefined, bodyFont: undefined };
  }
};

export const generateHuemintThemes = async (options: {
  currentTheme: Theme;
  deckTitle: string;
  keywords: string[];
  vibe?: string;
}): Promise<Theme[]> => {
  const { currentTheme, deckTitle, keywords, vibe } = options;

  const results = await requestHuemintPalettes();
  const { headingFont, bodyFont } = await recommendFonts(deckTitle, keywords, vibe);

  const currentParagraph = currentTheme.typography.paragraph;
  const appliedBodyFont = bodyFont || currentParagraph.fontFamily;
  const appliedHeadingFont = headingFont ||
    currentTheme.typography.heading?.fontFamily ||
    currentParagraph.fontFamily;

  return results.map((result, index) => normalizeThemeWeights({
    id: `generated-${Date.now()}-${index}`,
    name: `Generated ${index + 1}`,
    page: { backgroundColor: result.palette[0] },
    typography: {
      paragraph: {
        fontFamily: appliedBodyFont,
        fontSize: currentParagraph.fontSize,
        fontWeight: currentParagraph.fontWeight,
        color: result.palette[1]
      },
      heading: {
        fontFamily: appliedHeadingFont,
        color: result.palette[1],
        fontWeight: 700
      }
    },
    accent1: result.palette[2],
    accent2: currentTheme.accent2,
    isCustom: true
  }));
};
