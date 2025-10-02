/**
 * Application color constants
 * Central place for all color values used across the application
 */

// Primary brand colors
export const COLORS = {
  // Brand accent colors
  SUGGESTION_PINK: "#FF4301", // Brand Orange (was Rose-600)
  ACCENT_PURPLE: "#8B5CF6",
  ACCENT_BLUE: "#3B82F6",
  
  // UI colors
  BACKGROUND_DARK: "#09090B",
  FOREGROUND_LIGHT: "#F9FAFB",
  
  // Status colors
  SUCCESS: "#10B981",
  ERROR: "#EF4444",
  WARNING: "#F59E0B",
  INFO: "#3B82F6",
  
  // Border colors
  BORDER_LIGHT: "#929292",
  BORDER_DARK: "#343A40"
};

/**
 * Get CSS variables object from colors
 * @returns Object with CSS variable name/value pairs
 */
export function getColorCSSVariables() {
  return {
    "--color-suggestion-pink": COLORS.SUGGESTION_PINK,
    "--color-accent-purple": COLORS.ACCENT_PURPLE,
    "--color-accent-blue": COLORS.ACCENT_BLUE,
    "--color-background-dark": COLORS.BACKGROUND_DARK,
    "--color-foreground-light": COLORS.FOREGROUND_LIGHT,
    "--color-success": COLORS.SUCCESS,
    "--color-error": COLORS.ERROR,
    "--color-warning": COLORS.WARNING,
    "--color-info": COLORS.INFO,
    "--color-border-light": COLORS.BORDER_LIGHT,
    "--color-border-dark": COLORS.BORDER_DARK
  };
} 