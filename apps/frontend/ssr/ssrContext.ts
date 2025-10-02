import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '../src/utils/deckUtils';
/**
 * Server-Side Rendering Context
 * 
 * This utility provides an explicit flag for SSR mode that doesn't rely on
 * environment detection, which can be unreliable with JSDOM.
 */

// A reliable flag that indicates we are in SSR mode
let _isServerSideRendering = false;

/**
 * Set the SSR mode flag
 * This should be called at the beginning of the SSR process
 */
export function enableSSRMode(): void {
  _isServerSideRendering = true;
}

/**
 * Disable SSR mode flag
 * This can be called after SSR is complete
 */
export function disableSSRMode(): void {
  _isServerSideRendering = false;
}

/**
 * Check if we're currently in SSR mode
 * This is more reliable than using `typeof window === 'undefined'`
 * with JSDOM
 */
export function isSSR(): boolean {
  return _isServerSideRendering;
}

/**
 * Reset SSR mode to default (false)
 */
export function resetSSRMode(): void {
  _isServerSideRendering = false;
}

/**
 * Get the scale factor for the slide display
 * This is used to scale the slide display to the correct size
 */
export function getSlideDisplayScaleFactor(): number{
    // Min slide width is 800px, but actual display width can be larger
    return 800 / DEFAULT_SLIDE_WIDTH;
}

// Export a default object with all functions
export default {
  enableSSRMode,
  disableSSRMode,
  isSSR,
  resetSSRMode,
  getSlideDisplayScaleFactor
}; 


// <div 
// id="slide-display-container"
// className={`slide-container relative bg-secondary/20 rounded-md overflow-hidden flex-shrink-0 border border-border/30 ${isEditing ? 'editing-mode' : ''}`}
// data-slide-id={slides[currentSlideIndex]?.id || 'unknown'}
// data-slide-width={DEFAULT_SLIDE_WIDTH}
// data-slide-height={DEFAULT_SLIDE_HEIGHT}
// style={{
//   width: '800px',
//   height: `${800 * (DEFAULT_SLIDE_HEIGHT / DEFAULT_SLIDE_WIDTH)}px`,
//   maxWidth: '100%',
//   aspectRatio: `${DEFAULT_SLIDE_WIDTH} / ${DEFAULT_SLIDE_HEIGHT}`,
//   pointerEvents: 'all',
//   position: 'relative',
//   transformOrigin: 'center center',
//   // Don't set cursor here to allow crosshair to work when creating shapes
// }}
// onClick={handleBackgroundClick}
// onDoubleClick={handleDoubleClick}
// >