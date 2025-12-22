import { DEFAULT_SLIDE_HEIGHT, DEFAULT_SLIDE_WIDTH } from '@/utils/deckUtils';
import type { SlideData } from '@/types/SlideTypes';
import type { ComponentInstance } from '@/types/components';

export type SlideSize = { width: number; height: number };

type CoordinateMode = 'absolute' | 'percent';

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

const toNumber = (value: any): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/px$/i, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const coerceNumber = (value: any, axisSize?: number, allowPercentRange: boolean = false): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (axisSize && value > 0 && value <= 1) {
      return value * axisSize;
    }
    if (axisSize && allowPercentRange && value > 1 && value <= 100) {
      return (value / 100) * axisSize;
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
  if (axisSize && allowPercentRange && parsed > 1 && parsed <= 100) {
    return (parsed / 100) * axisSize;
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

const detectCoordinateMode = (components: ComponentInstance[]): CoordinateMode => {
  let sampleCount = 0;
  let percentLike = 0;
  let absoluteLike = 0;

  const scanValue = (value: any) => {
    const numeric = toNumber(value);
    if (numeric === null) return;
    sampleCount += 1;
    if (numeric > 100) {
      absoluteLike += 1;
    } else if (numeric > 0) {
      percentLike += 1;
    }
  };

  components.forEach((component) => {
    const isBackground =
      component?.type === 'Background' ||
      (component?.id && component.id.toLowerCase().includes('background'));
    if (isBackground) {
      return;
    }
    const props: any = component?.props || {};
    const pos = props.position || (component as any).position;
    const size = props.size || (component as any).size;

    scanValue(pos?.x);
    scanValue(pos?.y);
    scanValue(props.x);
    scanValue(props.y);
    scanValue(size?.width);
    scanValue(size?.height);
    scanValue(props.width);
    scanValue(props.height);
    scanValue((component as any).width);
    scanValue((component as any).height);
  });

  if (!sampleCount) return 'absolute';
  if (absoluteLike > 0) return 'absolute';
  if (percentLike >= 4 && percentLike / sampleCount >= 0.7) {
    return 'percent';
  }
  return 'absolute';
};

const normalizeComponentGeometry = (
  component: ComponentInstance,
  slideSize: SlideSize,
  coordinateMode: CoordinateMode
): ComponentInstance => {
  const props: any = component?.props && typeof component.props === 'object' ? { ...component.props } : {};
  const allowPercentRange = coordinateMode === 'percent';

  const rawPosition = props.position || (component as any).position;
  const posX = coerceNumber(rawPosition?.x, slideSize.width, allowPercentRange)
    ?? coerceNumber(props.x, slideSize.width, allowPercentRange)
    ?? coerceNumber((component as any).x, slideSize.width, allowPercentRange);
  const posY = coerceNumber(rawPosition?.y, slideSize.height, allowPercentRange)
    ?? coerceNumber(props.y, slideSize.height, allowPercentRange)
    ?? coerceNumber((component as any).y, slideSize.height, allowPercentRange);
  if (posX !== null || posY !== null) {
    props.position = { x: posX ?? 0, y: posY ?? 0 };
  }

  const rawSize = props.size || (component as any).size;
  const width = coerceNumber(props.width, slideSize.width, allowPercentRange)
    ?? coerceNumber(rawSize?.width, slideSize.width, allowPercentRange)
    ?? coerceNumber((component as any).width, slideSize.width, allowPercentRange);
  const height = coerceNumber(props.height, slideSize.height, allowPercentRange)
    ?? coerceNumber(rawSize?.height, slideSize.height, allowPercentRange)
    ?? coerceNumber((component as any).height, slideSize.height, allowPercentRange);
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

  let normalizedComponent: ComponentInstance = {
    ...component,
    props,
    position: (component as any).position || props.position,
    size: (component as any).size || props.size
  };

  if (normalizedComponent?.type === 'TiptapTextBlock') {
    const texts = (normalizedComponent.props as any)?.texts;
    if (texts && !(texts.type === 'doc' && texts.content)) {
      let normalizedTexts: any;

      if (Array.isArray(texts)) {
        const content: any[] = [];
        texts.forEach((item: any) => {
          if (item && item.type === 'paragraph' && typeof item.content === 'string') {
            content.push({
              type: 'paragraph',
              content: [{ type: 'text', text: item.content, style: item.style || {} }]
            });
          } else if (item && item.type === 'heading' && typeof item.content === 'string') {
            content.push({
              type: 'paragraph',
              content: [{ type: 'text', text: item.content, style: item.style || {} }]
            });
          } else if (item && typeof item.text === 'string') {
            content.push({
              type: 'paragraph',
              content: [{ type: 'text', text: item.text, style: item.style || {} }]
            });
          } else if (typeof item === 'string') {
            content.push({
              type: 'paragraph',
              content: [{ type: 'text', text: item, style: {} }]
            });
          }
        });
        normalizedTexts = {
          type: 'doc',
          content: content.length > 0 ? content : [
            { type: 'paragraph', content: [{ type: 'text', text: '', style: {} }] }
          ]
        };
      } else if (typeof texts === 'string') {
        normalizedTexts = {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: texts, style: {} }] }
          ]
        };
      } else {
        let fallbackText = '';
        if (texts && typeof texts === 'object' && !Array.isArray(texts)) {
          if ((texts as any).text) fallbackText = String((texts as any).text);
          else if ((texts as any).content) fallbackText = String((texts as any).content);
          else if ((texts as any).value) fallbackText = String((texts as any).value);
        }
        normalizedTexts = {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: fallbackText || 'Text content', style: {} }] }
          ]
        };
      }

      normalizedComponent = {
        ...normalizedComponent,
        props: {
          ...(normalizedComponent.props as any),
          texts: normalizedTexts
        }
      };
    }
  }

  return normalizedComponent;
};

const parseSlideInput = (slide: SlideData | string | null | undefined): SlideData | null => {
  if (!slide) return null;
  if (typeof slide === 'string') {
    try {
      return JSON.parse(slide);
    } catch {
      return null;
    }
  }
  return slide as SlideData;
};

export const normalizeSlideForRender = (
  slideInput: SlideData | string | null | undefined,
  fallbackSize?: SlideSize
): { slide: SlideData; slideSize: SlideSize } | null => {
  const slide = parseSlideInput(slideInput);
  if (!slide) return null;
  const slideSize = resolveSlideSize(slide, fallbackSize);
  let rawComponents: any = (slide as any).components;
  if (typeof rawComponents === 'string') {
    try {
      rawComponents = JSON.parse(rawComponents);
    } catch {
      rawComponents = [];
    }
  }
  const componentArray = Array.isArray(rawComponents) ? rawComponents : [];
  const coordinateMode = detectCoordinateMode(componentArray);
  const components = componentArray.map((component) =>
    normalizeComponentGeometry(component as ComponentInstance, slideSize, coordinateMode)
  );

  return {
    slide: {
      ...slide,
      components
    },
    slideSize
  };
};
