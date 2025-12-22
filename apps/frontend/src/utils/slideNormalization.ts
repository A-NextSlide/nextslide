import { DEFAULT_SLIDE_HEIGHT, DEFAULT_SLIDE_WIDTH } from '@/utils/deckUtils';
import type { SlideData } from '@/types/SlideTypes';
import type { ComponentInstance } from '@/types/components';

export type SlideSize = { width: number; height: number };

const isValidSize = (width?: number | null, height?: number | null) => {
  return (
    typeof width === 'number' &&
    typeof height === 'number' &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 100 &&
    height > 100
  );
};

const coerceNumber = (value: any, axisSize?: number): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (axisSize && value > 0 && value <= 1) {
      return value * axisSize;
    }
    return value;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith('%') && axisSize) {
    const percentValue = Number(trimmed.slice(0, -1));
    if (Number.isFinite(percentValue)) {
      return (percentValue / 100) * axisSize;
    }
    return null;
  }
  const cleaned = trimmed.replace(/px$/i, '');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  if (axisSize && parsed > 0 && parsed <= 1) {
    return parsed * axisSize;
  }
  return parsed;
};

const extractBackgroundSize = (slide: SlideData | null | undefined, fallbackSize: SlideSize): SlideSize | null => {
  const components = slide?.components || [];
  const background = components.find(
    (component) => component?.type === 'Background' || component?.id?.toLowerCase?.().includes?.('background')
  );
  if (!background) return null;

  const props: any = background.props || {};
  const sizeFromProps = props.size && typeof props.size === 'object' ? props.size : null;
  const sizeFromComponent = (background as any).size && typeof (background as any).size === 'object' ? (background as any).size : null;

  const width = coerceNumber(props.width, fallbackSize.width)
    ?? coerceNumber(sizeFromProps?.width, fallbackSize.width)
    ?? coerceNumber((background as any).width, fallbackSize.width)
    ?? coerceNumber(sizeFromComponent?.width, fallbackSize.width);
  const height = coerceNumber(props.height, fallbackSize.height)
    ?? coerceNumber(sizeFromProps?.height, fallbackSize.height)
    ?? coerceNumber((background as any).height, fallbackSize.height)
    ?? coerceNumber(sizeFromComponent?.height, fallbackSize.height);

  if (isValidSize(width, height)) {
    return { width: width as number, height: height as number };
  }
  return null;
};

export const resolveSlideSize = (
  slide: SlideData | null | undefined,
  fallbackSize?: SlideSize
): SlideSize => {
  const fallback: SlideSize = isValidSize(fallbackSize?.width, fallbackSize?.height)
    ? (fallbackSize as SlideSize)
    : { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT };
  const fromBackground = extractBackgroundSize(slide, fallback);
  if (fromBackground) return fromBackground;

  const slideSize = (slide as any)?.size;
  if (isValidSize(slideSize?.width, slideSize?.height)) {
    return { width: slideSize.width, height: slideSize.height };
  }

  return fallback;
};

const normalizeComponentGeometry = (component: ComponentInstance, slideSize: SlideSize): ComponentInstance => {
  const props: any = component?.props && typeof component.props === 'object' ? { ...component.props } : {};

  const rawPosition = props.position || (component as any).position;
  const posX = coerceNumber(rawPosition?.x, slideSize.width)
    ?? coerceNumber(props.x, slideSize.width)
    ?? coerceNumber((component as any).x, slideSize.width);
  const posY = coerceNumber(rawPosition?.y, slideSize.height)
    ?? coerceNumber(props.y, slideSize.height)
    ?? coerceNumber((component as any).y, slideSize.height);
  if (posX !== null || posY !== null) {
    props.position = { x: posX ?? 0, y: posY ?? 0 };
  }

  const rawSize = props.size || (component as any).size;
  const width = coerceNumber(props.width, slideSize.width)
    ?? coerceNumber(rawSize?.width, slideSize.width)
    ?? coerceNumber((component as any).width, slideSize.width);
  const height = coerceNumber(props.height, slideSize.height)
    ?? coerceNumber(rawSize?.height, slideSize.height)
    ?? coerceNumber((component as any).height, slideSize.height);
  if (width !== null) props.width = width;
  if (height !== null) props.height = height;
  if (!props.size && width !== null && height !== null) {
    props.size = { width, height };
  }

  if (component?.type === 'Background') {
    try {
      const styles = (component as any).styles || (component as any).style || {};
      const nestedBg = props.background || {};
      const colorCandidate =
        styles?.background?.color ||
        styles?.backgroundColor ||
        styles?.color ||
        nestedBg?.color ||
        props.backgroundColor ||
        props.color;
      if (colorCandidate && !props.backgroundColor) {
        props.backgroundColor = colorCandidate;
        if (!props.backgroundType || props.backgroundType === 'solid') {
          props.backgroundType = 'color';
        }
      }
    } catch {}
  }

  return {
    ...component,
    props,
    position: (component as any).position || props.position,
    size: (component as any).size || props.size
  };
};

export const normalizeSlideForRender = (
  slide: SlideData | null | undefined,
  fallbackSize?: SlideSize
): { slide: SlideData; slideSize: SlideSize } | null => {
  if (!slide) return null;
  const slideSize = resolveSlideSize(slide, fallbackSize);
  const components = Array.isArray(slide.components)
    ? slide.components.map((component) => normalizeComponentGeometry(component as ComponentInstance, slideSize))
    : [];

  return {
    slide: {
      ...slide,
      components
    },
    slideSize
  };
};
