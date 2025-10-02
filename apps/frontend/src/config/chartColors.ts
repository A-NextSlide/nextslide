/**
 * Default color palettes for charts
 * These are used as the fallback colors when no custom colors are provided
 */

// Default color palette for charts - matches the colors used in DataTransformers.ts
export const CHART_DEFAULT_COLORS = [
  '#61cdbb', '#97e3d5', '#e8c1a0', '#f47560', '#f1e15b',
  '#e8a838', '#a7cee3', '#b2df8a', '#fb9a99', '#fdbf6f'
];

// Re-export the default colors for components that need them
export const DEFAULT_CHART_COLORS = CHART_DEFAULT_COLORS;

// Theme-based color palettes
export const CHART_COLOR_PALETTES = {
  default: CHART_DEFAULT_COLORS,
  pastel: [
    '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', 
    '#C9BAFF', '#FFBAEC', '#F9CEDF', '#E1F9CE', '#CEF9F4'
  ],
  bold: [
    '#0D47A1', '#B71C1C', '#006064', '#1B5E20', '#4A148C', 
    '#880E4F', '#E65100', '#01579B', '#BF360C', '#004D40'
  ],
  monochrome: [
    '#0D47A1', '#1565C0', '#1976D2', '#1E88E5', '#2196F3', 
    '#42A5F5', '#64B5F6', '#90CAF9', '#BBDEFB', '#E3F2FD'
  ],
  // Custom palette is handled dynamically in the UI
};
