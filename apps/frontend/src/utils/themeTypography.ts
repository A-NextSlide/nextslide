import { Theme } from '@/types/themes';

const DEFAULT_BODY_WEIGHT = 400;
const DEFAULT_HEADING_WEIGHT = 700;

const toWeightNumber = (value?: number | string): number | undefined => {
  if (value === undefined || value === null) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const ensureWeightHierarchy = (body?: number | string, heading?: number | string) => {
  let bodyWeight = toWeightNumber(body) ?? DEFAULT_BODY_WEIGHT;
  let headingWeight = toWeightNumber(heading) ?? DEFAULT_HEADING_WEIGHT;

  if (headingWeight <= bodyWeight) {
    const boosted = Math.min(900, bodyWeight + 200);
    if (boosted > bodyWeight) {
      headingWeight = boosted;
    } else {
      bodyWeight = Math.max(100, headingWeight - 200);
    }
  }

  return { bodyWeight, headingWeight };
};

export const normalizeThemeWeights = (theme: Theme): Theme => {
  if (!theme?.typography?.paragraph) return theme;

  const { bodyWeight, headingWeight } = ensureWeightHierarchy(
    theme.typography.paragraph.fontWeight,
    theme.typography.heading?.fontWeight
  );

  const nextTypography = {
    ...theme.typography,
    paragraph: {
      ...theme.typography.paragraph,
      fontWeight: bodyWeight
    }
  };

  if (theme.typography.heading) {
    nextTypography.heading = {
      ...theme.typography.heading,
      fontWeight: headingWeight
    };
  }

  return {
    ...theme,
    typography: nextTypography
  };
};
