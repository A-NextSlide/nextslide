import { Theme } from '@/types/themes';
import { ComponentInstance } from '@/types/components';

/**
 * Apply theme settings to a specific component based on its type
 * @param component Component to apply theme to
 * @param theme Theme with settings to apply
 * @returns Updated component with theme applied
 */
export function applyThemeToComponent(
  component: ComponentInstance,
  theme: Theme
): ComponentInstance {
  if (!component || !theme) return component;

  // Extract theme values
  const { page, typography, accent1 } = theme;
  const { paragraph } = typography;

  // Clone component to avoid mutations
  const updatedComponent = { ...component, props: { ...component.props } };

  switch (component.type) {
    case 'Background':
      updatedComponent.props.backgroundColor = page.backgroundColor;
      updatedComponent.props.fill = page.backgroundColor;
      break;
      
    case 'TiptapTextBlock':
      updatedComponent.props.fontFamily = paragraph.fontFamily;
      updatedComponent.props.textColor = paragraph.color;
      if (paragraph.fontSize) {
        updatedComponent.props.fontSize = paragraph.fontSize;
      }
      if (paragraph.fontWeight) {
        updatedComponent.props.fontWeight = paragraph.fontWeight;
      }
      break;
      
    case 'Shape':
      updatedComponent.props.fill = accent1;
      break;
      
    case 'Chart':
      updatedComponent.props.accentColor = accent1;
      break;
      
    case 'Table':
      updatedComponent.props.headerColor = accent1;
      updatedComponent.props.textColor = paragraph.color;
      break;
      
    case 'Image':
      // Could apply border color from accent if border enabled
      if (updatedComponent.props.hasBorder) {
        updatedComponent.props.borderColor = accent1;
      }
      break;

    // Add other component types as needed
  }

  return updatedComponent;
}

/**
 * Apply theme to multiple components
 * @param components Array of components to update
 * @param theme Theme to apply
 * @returns New array with updated components
 */
export function applyThemeToComponents(
  components: ComponentInstance[],
  theme: Theme
): ComponentInstance[] {
  if (!components || !theme) return components;
  
  return components.map(component => applyThemeToComponent(component, theme));
}

/**
 * Generate CSS variables for theme to use in stylesheets
 * @param theme Theme to convert to CSS variables
 * @returns Object with CSS variable names and values
 */
export function themeToCssVariables(theme: Theme): Record<string, string> {
  if (!theme) return {};
  
  return {
    '--theme-bg-color': theme.page.backgroundColor,
    '--theme-text-color': theme.typography.paragraph.color,
    '--theme-font-family': theme.typography.paragraph.fontFamily,
    '--theme-accent-color': theme.accent1,
    '--theme-accent-secondary': theme.accent2 || theme.accent1,
    ...(theme.typography.paragraph.fontSize ? { '--theme-font-size': theme.typography.paragraph.fontSize } : {}),
    ...(theme.typography.paragraph.fontWeight ? { '--theme-font-weight': String(theme.typography.paragraph.fontWeight) } : {}),
    ...(theme.typography.heading?.fontFamily ? { '--theme-heading-font-family': theme.typography.heading.fontFamily } : {}),
    ...(theme.typography.heading?.color ? { '--theme-heading-color': theme.typography.heading.color } : {}),
  };
}

/**
 * Apply theme CSS variables to a DOM element
 * @param element DOM element to apply variables to
 * @param theme Theme to apply
 */
export function applyThemeToElement(element: HTMLElement, theme: Theme): void {
  if (!element || !theme) return;
  
  const cssVars = themeToCssVariables(theme);
  
  Object.entries(cssVars).forEach(([key, value]) => {
    element.style.setProperty(key, value);
  });
}