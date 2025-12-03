/**
 * Style Mutator - Generates CSS style mutations for element positioning
 *
 * Different CSS positioning strategies require different approaches:
 * - absolute: Direct top/left/width/height
 * - relative: Use transform for movement
 * - flex/grid items: Only width/height (movement changes order)
 * - static: Convert to relative + transform
 */

import { Bounds, PositioningStrategy, VirtualElement } from './types';

/**
 * Parse existing transform to extract translate values
 */
function parseExistingTransform(transform: string): { x: number; y: number } {
  if (!transform || transform === 'none') {
    return { x: 0, y: 0 };
  }

  // Match translate(Xpx, Ypx) or translate(Xpx) or translateX/translateY
  const translateMatch = transform.match(/translate\(([^,]+)(?:,\s*([^)]+))?\)/);
  if (translateMatch) {
    const x = parseFloat(translateMatch[1]) || 0;
    const y = parseFloat(translateMatch[2] || '0') || 0;
    return { x, y };
  }

  // Match matrix(a, b, c, d, tx, ty) - tx and ty are the translation values
  const matrixMatch = transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([^,]+),\s*([^)]+)\)/);
  if (matrixMatch) {
    const x = parseFloat(matrixMatch[1]) || 0;
    const y = parseFloat(matrixMatch[2]) || 0;
    return { x, y };
  }

  return { x: 0, y: 0 };
}

/**
 * Generate CSS style properties to apply a new position/size to an element
 *
 * @param element - The virtual element with original bounds and positioning strategy
 * @param newBounds - The new bounds in iframe coordinates
 * @returns CSS properties to apply
 */
export function generateStyleMutation(
  element: VirtualElement,
  newBounds: Bounds
): Record<string, string> {
  const originalBounds = element.iframeBounds;

  // Parse existing transform to get current translation
  const existingTransform = parseExistingTransform(element.computedStyle?.transform || '');

  // The iframeBounds from getBoundingClientRect INCLUDES the existing transform
  // So we need to calculate the delta from visual position, then ADD to existing transform
  // Delta represents how much we've moved from the VISUAL position
  const deltaX = newBounds.x - originalBounds.x;
  const deltaY = newBounds.y - originalBounds.y;

  // Total transform = existing transform + new delta
  const totalTranslateX = existingTransform.x + deltaX;
  const totalTranslateY = existingTransform.y + deltaY;
  const hasMovement = Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5;
  const hasSizeChange =
    Math.abs(newBounds.width - originalBounds.width) > 0.5 ||
    Math.abs(newBounds.height - originalBounds.height) > 0.5;

  // For transform, check if total transform is non-zero (including existing)
  const hasTransform = Math.abs(totalTranslateX) > 0.5 || Math.abs(totalTranslateY) > 0.5;

  switch (element.positioningStrategy) {
    case 'absolute':
      // For absolute positioning, use transform for movement to avoid coordinate system issues
      // getBoundingClientRect returns viewport coords but top/left are relative to offset parent
      // Using transform avoids this mismatch and prevents jumping
      const absStyles: Record<string, string> = {};

      if (hasMovement || hasTransform) {
        absStyles.transform = `translate(${Math.round(totalTranslateX)}px, ${Math.round(totalTranslateY)}px)`;
      }
      if (hasSizeChange) {
        absStyles.width = `${Math.round(newBounds.width)}px`;
        absStyles.height = `${Math.round(newBounds.height)}px`;
      }

      return absStyles;

    case 'relative':
      // Relative positioning: use transform for movement
      const relStyles: Record<string, string> = {};

      if (hasMovement || hasTransform) {
        relStyles.transform = `translate(${Math.round(totalTranslateX)}px, ${Math.round(totalTranslateY)}px)`;
      }
      if (hasSizeChange) {
        relStyles.width = `${Math.round(newBounds.width)}px`;
        relStyles.height = `${Math.round(newBounds.height)}px`;
      }

      return relStyles;

    case 'flex-item':
    case 'grid-item':
      // Flex/grid items: only width/height can be changed
      // Position is determined by the layout, but we can still use transform for visual feedback
      const flexStyles: Record<string, string> = {};

      if (hasMovement || hasTransform) {
        // Apply transform for visual feedback during drag, will be reset on drop
        flexStyles.transform = `translate(${Math.round(totalTranslateX)}px, ${Math.round(totalTranslateY)}px)`;
      }
      if (hasSizeChange) {
        flexStyles.width = `${Math.round(newBounds.width)}px`;
        flexStyles.height = `${Math.round(newBounds.height)}px`;
        flexStyles.flexShrink = '0';
        flexStyles.flexGrow = '0';
        flexStyles.flexBasis = 'auto';
      }

      return flexStyles;

    case 'static':
    default:
      // Static elements: convert to relative + transform for movement
      const staticStyles: Record<string, string> = {};

      if (hasMovement || hasTransform) {
        staticStyles.position = 'relative';
        staticStyles.transform = `translate(${Math.round(totalTranslateX)}px, ${Math.round(totalTranslateY)}px)`;
      }
      if (hasSizeChange) {
        staticStyles.width = `${Math.round(newBounds.width)}px`;
        staticStyles.height = `${Math.round(newBounds.height)}px`;
      }

      return staticStyles;
  }
}

/**
 * Generate CSS for resize-only operation (no position change)
 */
export function generateResizeStyles(
  newWidth: number,
  newHeight: number
): Record<string, string> {
  return {
    width: `${Math.round(newWidth)}px`,
    height: `${Math.round(newHeight)}px`,
  };
}

/**
 * Generate CSS for move-only operation (no size change)
 */
export function generateMoveStyles(
  element: VirtualElement,
  newX: number,
  newY: number
): Record<string, string> {
  const originalBounds = element.iframeBounds;
  const deltaX = newX - originalBounds.x;
  const deltaY = newY - originalBounds.y;

  // Parse existing transform and accumulate
  const existingTransform = parseExistingTransform(element.computedStyle?.transform || '');
  const totalTranslateX = existingTransform.x + deltaX;
  const totalTranslateY = existingTransform.y + deltaY;

  // Use transform for all positioning strategies to avoid coordinate system issues
  switch (element.positioningStrategy) {
    case 'absolute':
    case 'relative':
      return {
        transform: `translate(${Math.round(totalTranslateX)}px, ${Math.round(totalTranslateY)}px)`,
      };

    case 'static':
      return {
        position: 'relative',
        transform: `translate(${Math.round(totalTranslateX)}px, ${Math.round(totalTranslateY)}px)`,
      };

    case 'flex-item':
    case 'grid-item':
      // Apply transform for visual feedback, position determined by layout
      return {
        transform: `translate(${Math.round(totalTranslateX)}px, ${Math.round(totalTranslateY)}px)`,
      };

    default:
      return {};
  }
}

/**
 * Convert style object to inline style string
 */
export function stylesToString(styles: Record<string, string>): string {
  return Object.entries(styles)
    .map(([key, value]) => `${camelToKebab(key)}: ${value}`)
    .join('; ');
}

/**
 * Convert camelCase to kebab-case
 */
function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Merge new styles into an existing inline style string
 */
export function mergeInlineStyles(
  existingStyle: string,
  newStyles: Record<string, string>
): string {
  // Parse existing styles
  const existingParsed: Record<string, string> = {};
  if (existingStyle) {
    existingStyle.split(';').forEach(part => {
      const [key, value] = part.split(':').map(s => s.trim());
      if (key && value) {
        existingParsed[key] = value;
      }
    });
  }

  // Merge new styles (converting camelCase keys to kebab-case)
  Object.entries(newStyles).forEach(([key, value]) => {
    existingParsed[camelToKebab(key)] = value;
  });

  // Convert back to string
  return Object.entries(existingParsed)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');
}

/**
 * Apply style mutation to HTML source
 * This updates the inline styles of an element in the HTML string
 *
 * @param html - The HTML source
 * @param selector - CSS selector to find the element (data-ns-id attribute)
 * @param styles - New styles to apply
 * @returns Updated HTML string
 */
export function applyStyleMutationToHtml(
  html: string,
  selector: string,
  styles: Record<string, string>
): string {
  // Extract the data-ns-id value from selector like '[data-ns-id="text-0"]'
  const idMatch = selector.match(/data-ns-id="([^"]+)"/);
  if (!idMatch) return html;

  const nsId = idMatch[1];

  // Find the element in the HTML by looking for data-ns-id attribute
  // This is tricky because the attribute might not exist in the original HTML
  // We need to find the element by its position/content

  // For now, we'll use a more robust approach: find elements with style attribute
  // and update them, or add style attribute if missing

  // Simple regex approach for inline style update
  // This looks for the element tag with data-ns-id and updates its style
  const styleString = stylesToString(styles);

  // Pattern to find element with this ns-id and capture its tag and attributes
  const elementPattern = new RegExp(
    `(<[^>]*\\s)style="([^"]*)"([^>]*data-ns-id="${nsId}"[^>]*>)`,
    'i'
  );

  const match = html.match(elementPattern);
  if (match) {
    // Element has existing style, merge with new styles
    const existingStyle = match[2];
    const mergedStyle = mergeInlineStyles(existingStyle, styles);
    return html.replace(elementPattern, `$1style="${mergedStyle}"$3`);
  }

  // Try pattern where data-ns-id comes before style
  const elementPattern2 = new RegExp(
    `(<[^>]*data-ns-id="${nsId}"[^>]*)style="([^"]*)"([^>]*>)`,
    'i'
  );

  const match2 = html.match(elementPattern2);
  if (match2) {
    const existingStyle = match2[2];
    const mergedStyle = mergeInlineStyles(existingStyle, styles);
    return html.replace(elementPattern2, `$1style="${mergedStyle}"$3`);
  }

  // Element doesn't have style attribute, need to add it
  // This is more complex as the data-ns-id is added dynamically by the edit script
  // For persisted changes, we need to find the element differently

  // For now, return unchanged - the style will be applied via postMessage
  // and the HTML update will need a more sophisticated approach
  return html;
}

/**
 * Determine if an element can be dragged based on its positioning
 */
export function canElementBeDragged(strategy: PositioningStrategy): boolean {
  return strategy === 'absolute' || strategy === 'relative' || strategy === 'static';
}

/**
 * Determine if an element can be resized
 */
export function canElementBeResized(strategy: PositioningStrategy): boolean {
  // All positioning strategies support resize
  return true;
}
