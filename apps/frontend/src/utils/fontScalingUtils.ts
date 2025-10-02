import { DEFAULT_SLIDE_WIDTH } from './deckUtils';

/**
 * Calculates a scaling factor for fonts based on the actual rendered slide size
 * compared to the design slide size.
 * 
 * This ensures that text scales proportionally when the slide is rendered
 * at different sizes, maintaining readability and design consistency.
 * 
 * @returns The scaling factor to apply to font sizes
 */
export function calculateFontScaleFactor(): number {
  // Get the slide container element
  const containerEl = document.getElementById('slide-display-container');
  if (!containerEl) return 1;
  
  // Check for explicit scale factor attribute first (most reliable)
  const scaleFactorAttr = containerEl.getAttribute('data-scale-factor');
  if (scaleFactorAttr) {
    const parsedScaleFactor = parseFloat(scaleFactorAttr);
    if (!isNaN(parsedScaleFactor) && parsedScaleFactor > 0) {
      return parsedScaleFactor;
    }
  }
  
  // Check for explicit thumbnail marker (second most reliable)
  const isThumbnailAttr = containerEl.getAttribute('data-is-thumbnail');
  if (isThumbnailAttr === 'true') {
    // If it's explicitly marked as a thumbnail, don't scale fonts
    return 1;
  }
  
  // Get container dimensions to help identify thumbnails
  const containerWidth = containerEl.offsetWidth;
  
  // If the container is very small (less than 200px), it's likely a thumbnail
  if (containerWidth < 200) {
    return 1; // Don't scale fonts in thumbnails
  }
  
  // Check if this container is inside a ThumbnailNavigator or DeckThumbnail
  // by walking up the parent chain and looking for specific classes
  let isInsideThumbnail = false;
  let parent = containerEl;
  let maxLevels = 15; // Check more parent levels to be sure
  
  while (parent && maxLevels > 0) {
    // Check for the slide-thumbnail-container class which is present in both 
    // ThumbnailNavigator and DeckThumbnail
    if (parent.classList.contains('slide-thumbnail-container')) {
      isInsideThumbnail = true;
      break;
    }
    
    // Also check for any element that might be marked with our data attribute
    if (parent.getAttribute('data-is-thumbnail') === 'true') {
      isInsideThumbnail = true;
      break;
    }
    
    parent = parent.parentElement;
    maxLevels--;
  }
  
  if (isInsideThumbnail) {
    return 1; // Don't scale fonts in thumbnails
  }
  
  // Now continue with regular scale transform check
  
  // Check for CSS scale transforms as a fallback
  parent = containerEl.parentElement;
  maxLevels = 5;
  
  while (parent && maxLevels > 0) {
    const style = window.getComputedStyle(parent);
    const transform = style.transform || '';
    
    // If we find a scale transform with a small value (<0.3), it's likely a thumbnail
    if (transform.includes('scale(') && transform.match(/scale\((0?\.[0-9]+)/)) {
      const scaleMatch = transform.match(/scale\((0?\.[0-9]+)/);
      if (scaleMatch && parseFloat(scaleMatch[1]) < 0.3) {
        return 1; // Don't scale fonts in thumbnails
      }
    }
    
    parent = parent.parentElement;
    maxLevels--;
  }
  
  // If no special markers found, calculate based on container width
  const renderedWidth = containerEl.offsetWidth;
  
  // Use direct measurement if none of the above strategies worked
  return renderedWidth / DEFAULT_SLIDE_WIDTH;
}

/**
 * Applies font scaling to a numeric or string font size value
 * 
 * @param fontSize The original font size (string or number)
 * @param scaleFactor The scaling factor to apply
 * @returns The scaled font size as a string with "px" suffix
 */
export function getScaledFontSize(fontSize: string | number | undefined, scaleFactor: number): string {
  // Handle undefined/null values
  if (fontSize === undefined || fontSize === null) {
    // Default font size
    return `${24 * scaleFactor}px`;
  }
  
  // Convert to number if it's a string
  const size = typeof fontSize === 'string' 
    ? parseFloat(fontSize.replace('px', '')) 
    : fontSize;
  
  // Apply scaling and return with px suffix
  return `${size * scaleFactor}px`;
}