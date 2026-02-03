/** NextSlide brand design tokens for the mobile app */

export const BRAND_COLORS = {
  accent: "#FF4301",
  accentLight: "#FF6B3D",
  accentDark: "#CC3600",
  background: "#000000",
  surface: "#0A0A0A",
  surfaceElevated: "#141414",
  surfaceBorder: "#1E1E1E",
  text: "#FFFFFF",
  textSecondary: "#999999",
  textMuted: "#666666",
  error: "#FF3B30",
  success: "#34C759",
  warning: "#FF9500",
} as const;

export const BRAND_SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const BRAND_RADIUS = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const BRAND_TYPOGRAPHY = {
  fontFamily: "HKGroteskWide",
  fontFamilyBody: "Inter",
  heading: {
    fontWeight: "900" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  body: {
    fontWeight: "400" as const,
    letterSpacing: 0,
  },
} as const;

export const BRAND_SHADOWS = {
  sm: {
    shadowColor: "#FF4301",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: "#FF4301",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: "#FF4301",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: {
    shadowColor: "#FF4301",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
} as const;
