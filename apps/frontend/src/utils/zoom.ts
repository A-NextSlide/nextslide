export const ZOOM_LIMITS = {
  min: 65,
  max: 400
};

export const ZOOM_STEP = 10;

export const clampZoom = (value: number) => Math.min(ZOOM_LIMITS.max, Math.max(ZOOM_LIMITS.min, value));
