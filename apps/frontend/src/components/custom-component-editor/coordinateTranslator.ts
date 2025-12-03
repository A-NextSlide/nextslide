/**
 * CoordinateTranslator - Handles coordinate transformation between iframe and parent viewport
 *
 * The custom component renders in an iframe at a "design" size (e.g., 800x600)
 * but the iframe is displayed scaled within the parent viewport.
 * This class handles the translation between coordinate spaces.
 */

import { Bounds } from './types';

export class CoordinateTranslator {
  private iframeRect: DOMRect;
  private scale: number;
  private designWidth: number;
  private designHeight: number;
  private iframeScroll: { x: number; y: number };

  constructor(iframe: HTMLIFrameElement | null, designWidth: number, designHeight: number = 0) {
    this.designWidth = designWidth;
    this.designHeight = designHeight;
    this.scale = 1;
    this.iframeRect = new DOMRect(0, 0, designWidth, designHeight || designWidth * 0.75);
    this.iframeScroll = { x: 0, y: 0 };

    if (iframe) {
      this.update(iframe);
    }
  }

  /**
   * Update the translator with current iframe state
   * Call this whenever the iframe moves, resizes, or scrolls
   */
  update(iframe: HTMLIFrameElement): void {
    this.iframeRect = iframe.getBoundingClientRect();

    // Calculate scale: how much the iframe is scaled from design size
    this.scale = this.iframeRect.width / this.designWidth;

    // Track iframe scroll position
    try {
      this.iframeScroll = {
        x: iframe.contentWindow?.scrollX || 0,
        y: iframe.contentWindow?.scrollY || 0,
      };
    } catch {
      // Cross-origin iframe, assume no scroll
      this.iframeScroll = { x: 0, y: 0 };
    }
  }

  /**
   * Convert iframe-local coordinates to parent viewport coordinates
   * Use this to position overlay UI elements
   *
   * @param iframeBounds - Rectangle in iframe coordinate space
   * @returns Rectangle in parent viewport coordinate space
   */
  iframeToParent(iframeBounds: Bounds): Bounds {
    return {
      x: this.iframeRect.left + (iframeBounds.x - this.iframeScroll.x) * this.scale,
      y: this.iframeRect.top + (iframeBounds.y - this.iframeScroll.y) * this.scale,
      width: iframeBounds.width * this.scale,
      height: iframeBounds.height * this.scale,
    };
  }

  /**
   * Convert parent viewport coordinates to iframe-local coordinates
   * Use this when translating mouse positions to iframe space
   *
   * @param parentBounds - Rectangle in parent viewport coordinate space
   * @returns Rectangle in iframe coordinate space
   */
  parentToIframe(parentBounds: Bounds): Bounds {
    return {
      x: ((parentBounds.x - this.iframeRect.left) / this.scale) + this.iframeScroll.x,
      y: ((parentBounds.y - this.iframeRect.top) / this.scale) + this.iframeScroll.y,
      width: parentBounds.width / this.scale,
      height: parentBounds.height / this.scale,
    };
  }

  /**
   * Convert a mouse position in parent viewport to iframe coordinates
   *
   * @param clientX - Mouse X in viewport
   * @param clientY - Mouse Y in viewport
   * @returns Position in iframe coordinate space
   */
  mouseToIframe(clientX: number, clientY: number): { x: number; y: number } {
    return {
      x: ((clientX - this.iframeRect.left) / this.scale) + this.iframeScroll.x,
      y: ((clientY - this.iframeRect.top) / this.scale) + this.iframeScroll.y,
    };
  }

  /**
   * Convert a delta (movement) from parent coordinates to iframe coordinates
   * Use this for drag operations
   *
   * @param dx - Delta X in parent viewport pixels
   * @param dy - Delta Y in parent viewport pixels
   * @returns Delta in iframe pixels
   */
  deltaToIframe(dx: number, dy: number): { dx: number; dy: number } {
    return {
      dx: dx / this.scale,
      dy: dy / this.scale,
    };
  }

  /**
   * Convert a delta from iframe coordinates to parent viewport coordinates
   *
   * @param dx - Delta X in iframe pixels
   * @param dy - Delta Y in iframe pixels
   * @returns Delta in parent viewport pixels
   */
  deltaToParent(dx: number, dy: number): { dx: number; dy: number } {
    return {
      dx: dx * this.scale,
      dy: dy * this.scale,
    };
  }

  /**
   * Get the current scale factor
   */
  getScale(): number {
    return this.scale;
  }

  /**
   * Get the iframe's bounding rect in parent viewport
   */
  getIframeRect(): DOMRect {
    return this.iframeRect;
  }

  /**
   * Get the design dimensions
   */
  getDesignSize(): { width: number; height: number } {
    return {
      width: this.designWidth,
      height: this.designHeight || this.designWidth * 0.75,
    };
  }

  /**
   * Check if a point (in parent viewport coordinates) is inside the iframe
   */
  isPointInIframe(clientX: number, clientY: number): boolean {
    return (
      clientX >= this.iframeRect.left &&
      clientX <= this.iframeRect.right &&
      clientY >= this.iframeRect.top &&
      clientY <= this.iframeRect.bottom
    );
  }

  /**
   * Clamp bounds to stay within the iframe area
   *
   * @param bounds - Bounds in iframe coordinates
   * @returns Clamped bounds
   */
  clampToIframe(bounds: Bounds): Bounds {
    const maxX = this.designWidth - bounds.width;
    const maxY = (this.designHeight || this.designWidth * 0.75) - bounds.height;

    return {
      x: Math.max(0, Math.min(bounds.x, maxX)),
      y: Math.max(0, Math.min(bounds.y, maxY)),
      width: Math.max(20, Math.min(bounds.width, this.designWidth)),
      height: Math.max(20, Math.min(bounds.height, this.designHeight || this.designWidth * 0.75)),
    };
  }
}

/**
 * Create a new CoordinateTranslator instance
 * Convenience factory function
 */
export function createCoordinateTranslator(
  iframe: HTMLIFrameElement | null,
  designWidth: number,
  designHeight?: number
): CoordinateTranslator {
  return new CoordinateTranslator(iframe, designWidth, designHeight);
}
