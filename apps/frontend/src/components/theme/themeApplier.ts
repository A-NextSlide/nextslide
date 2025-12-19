import { Theme } from '@/types/themes';
import { SlideData } from '@/types/SlideTypes';
import { ComponentInstance } from '@/types/components';
import { createDefaultBackground } from '@/utils/componentUtils';
import { generateChartColorPalette, isLightColor } from '@/utils/colorUtils';

export type ThemeSlideUpdate = {
  slideId: string;
  components: ComponentInstance[];
};

type ThemeApplyContext = {
  backgroundColor: string;
  paragraphStyle: Theme['typography']['paragraph'];
  accentColor: string;
  accent2?: string;
  bodyFont: string;
  headingFont: string;
};

const cloneComponents = (components: ComponentInstance[]): ComponentInstance[] => {
  if (typeof structuredClone === 'function') {
    return structuredClone(components);
  }
  return JSON.parse(JSON.stringify(components));
};

const ensureProps = (component: ComponentInstance): Record<string, any> => {
  if (!component.props || typeof component.props !== 'object') {
    component.props = {} as ComponentInstance['props'];
  }
  return component.props as Record<string, any>;
};

const applyBackgroundTheme = (component: ComponentInstance, ctx: ThemeApplyContext) => {
  const props = ensureProps(component);
  props.backgroundColor = ctx.backgroundColor;
  props.color = ctx.backgroundColor;
  props.backgroundType = 'color';
  props.gradient = null;
  if (typeof props.background === 'string') {
    props.background = '';
  }
  if (props.backgroundImageUrl) {
    props.backgroundImageUrl = null;
  }
  if (props.patternType) {
    props.patternType = null;
  }
};

const applyTextTheme = (component: ComponentInstance, ctx: ThemeApplyContext) => {
  const props = ensureProps(component);
  props.fontFamily = ctx.bodyFont;
  props.textColor = ctx.paragraphStyle.color;
};

const applyIconTheme = (component: ComponentInstance, ctx: ThemeApplyContext) => {
  const props = ensureProps(component);
  props.color = ctx.accentColor;
};

const applyLineTheme = (component: ComponentInstance, ctx: ThemeApplyContext) => {
  const props = ensureProps(component);
  props.stroke = ctx.accentColor;
};

const applyWavyLinesTheme = (component: ComponentInstance, ctx: ThemeApplyContext) => {
  const props = ensureProps(component);
  props.lineColor = ctx.accentColor;
};

const applyShapeTheme = (component: ComponentInstance, ctx: ThemeApplyContext) => {
  const props = ensureProps(component);
  props.fill = ctx.accentColor;
};

const applyShapeWithTextTheme = (component: ComponentInstance, ctx: ThemeApplyContext) => {
  const props = ensureProps(component);
  props.fill = ctx.accentColor;
  props.textColor = ctx.paragraphStyle.color;
  props.fontFamily = ctx.bodyFont;
};

const applyChartTheme = (component: ComponentInstance, ctx: ThemeApplyContext) => {
  const props = ensureProps(component);

  const currentBgColor = props.backgroundColor;
  const isTransparent = !currentBgColor ||
    currentBgColor === 'transparent' ||
    currentBgColor === '#00000000' ||
    currentBgColor === 'rgba(0,0,0,0)' ||
    currentBgColor === 'rgba(0, 0, 0, 0)' ||
    (typeof currentBgColor === 'string' &&
      currentBgColor.startsWith('#') &&
      currentBgColor.length === 9 &&
      currentBgColor.endsWith('00'));

  const effectiveChartBg = isTransparent ? ctx.backgroundColor : currentBgColor;
  const dataArr = Array.isArray(props.data) ? props.data : [];
  const inferredCount = dataArr.length > 0 ? dataArr.length : 8;

  try {
    const palette = generateChartColorPalette(
      ctx.accentColor,
      effectiveChartBg,
      Math.max(3, Math.min(24, inferredCount)),
      ctx.paragraphStyle.color
    );
    props.colors = palette;

    if (dataArr.length > 0) {
      if (dataArr[0] && typeof dataArr[0] === 'object' && Array.isArray((dataArr[0] as any).data)) {
        dataArr.forEach((series: any, idx: number) => {
          series.color = palette[idx % palette.length];
        });
      } else {
        dataArr.forEach((item: any, idx: number) => {
          item.color = palette[idx % palette.length];
        });
      }
    }
  } catch {
    props.colors = [ctx.accentColor, ...(props.colors?.slice(1) || [])];
  }

  props.theme = !isLightColor(ctx.backgroundColor) ? 'dark' : 'light';
  props.fontFamily = ctx.bodyFont;

  if (!isTransparent) {
    props.backgroundColor = ctx.backgroundColor;
  }
};

const applyTableTheme = (component: ComponentInstance, ctx: ThemeApplyContext) => {
  const props = ensureProps(component);
  props.tableStyles = {
    ...(props.tableStyles || {}),
    fontFamily: ctx.bodyFont,
    textColor: ctx.paragraphStyle.color,
    headerBackgroundColor: ctx.accentColor,
    headerTextColor: ctx.paragraphStyle.color
  };
};

const applyCustomComponentTheme = (component: ComponentInstance, ctx: ThemeApplyContext) => {
  const props = ensureProps(component);
  if (!props.props || typeof props.props !== 'object') {
    props.props = {};
  }
  const customProps = props.props as Record<string, any>;
  const secondaryColor = ctx.accent2 || ctx.accentColor;

  props.fontFamily = ctx.bodyFont;
  props.heroFont = ctx.headingFont;
  props.primaryColor = ctx.accentColor;
  props.secondaryColor = secondaryColor;
  props.textColor = ctx.paragraphStyle.color;
  props.backgroundColor = ctx.backgroundColor;

  customProps.color = ctx.accentColor;
  customProps.primaryColor = ctx.accentColor;
  customProps.secondaryColor = secondaryColor;
  customProps.textColor = ctx.paragraphStyle.color;
  customProps.fontFamily = ctx.bodyFont;
  customProps.heroFont = ctx.headingFont;
  if (ctx.backgroundColor) customProps.backgroundColor = ctx.backgroundColor;
};

const applyThemeToComponent = (component: ComponentInstance, ctx: ThemeApplyContext) => {
  switch (component.type) {
    case 'Background':
      applyBackgroundTheme(component, ctx);
      break;
    case 'TiptapTextBlock':
      applyTextTheme(component, ctx);
      break;
    case 'Icon':
      applyIconTheme(component, ctx);
      break;
    case 'Lines':
    case 'Line':
    case 'line':
      applyLineTheme(component, ctx);
      break;
    case 'WavyLines':
      applyWavyLinesTheme(component, ctx);
      break;
    case 'Shape':
      applyShapeTheme(component, ctx);
      break;
    case 'ShapeWithText':
      applyShapeWithTextTheme(component, ctx);
      break;
    case 'Chart':
      applyChartTheme(component, ctx);
      break;
    case 'Table':
      applyTableTheme(component, ctx);
      break;
    case 'CustomComponent':
      applyCustomComponentTheme(component, ctx);
      break;
    default:
      break;
  }
};

const ensureBackgroundComponent = (components: ComponentInstance[], backgroundColor: string): ComponentInstance[] => {
  const hasBackground = components.some((c) => c.type === 'Background');
  if (hasBackground) return components;

  const bgComp = createDefaultBackground(backgroundColor) as ComponentInstance;
  bgComp.props.backgroundColor = backgroundColor;
  bgComp.props.backgroundType = 'color';
  bgComp.props.gradient = null;
  return [bgComp, ...components];
};

export const buildThemeSlideUpdates = (args: {
  theme: Theme;
  slides: SlideData[];
  slideIds: string[];
}): ThemeSlideUpdate[] => {
  const { theme, slides, slideIds } = args;

  if (!theme?.page?.backgroundColor ||
      !theme?.typography?.paragraph?.color ||
      !theme?.typography?.paragraph?.fontFamily ||
      !theme?.accent1) {
    return [];
  }

  const headingFont = theme.typography.heading?.fontFamily || theme.typography.paragraph.fontFamily;
  const ctx: ThemeApplyContext = {
    backgroundColor: theme.page.backgroundColor,
    paragraphStyle: theme.typography.paragraph,
    accentColor: theme.accent1,
    accent2: theme.accent2,
    bodyFont: theme.typography.paragraph.fontFamily,
    headingFont
  };

  const slideById = new Map(slides.map(slide => [slide.id, slide]));
  const updates: ThemeSlideUpdate[] = [];

  slideIds.forEach((slideId) => {
    const slide = slideById.get(slideId);
    if (!slide) return;

    const originalComponents = slide.components || [];
    const updatedComponents = cloneComponents(originalComponents);

    updatedComponents.forEach((component) => {
      applyThemeToComponent(component, ctx);
    });

    const withBackground = ensureBackgroundComponent(updatedComponents, ctx.backgroundColor);
    const changed = JSON.stringify(originalComponents) !== JSON.stringify(withBackground);

    if (changed) {
      updates.push({ slideId, components: withBackground });
    }
  });

  return updates;
};
