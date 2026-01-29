import html2canvas from 'html2canvas';
import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import { captureTinySlideScreenshot } from './slideScreenshot';

/**
 * OG Image dimensions (optimized for social sharing)
 * Standard OG image size is 1200x630
 */
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/**
 * Native slide dimensions
 */
const NATIVE_WIDTH = 1920;
const NATIVE_HEIGHT = 1080;

/**
 * Finds a slide element by its ID using the data-slide-id attribute.
 * Prefers main editing slides over thumbnails.
 * Excludes empty overlay elements (pointer-events-none, no children).
 */
export function findSlideElement(slideId: string): HTMLElement | null {
  // First, try to find the main editing slide (not in a thumbnail context)
  const allSlides = document.querySelectorAll(`[data-slide-id="${slideId}"]`);

  if (allSlides.length === 0) {
    return null;
  }

  // Find the best slide element - must have children and not be an overlay
  let bestSlide: HTMLElement | null = null;
  let bestArea = 0;

  allSlides.forEach((el) => {
    const element = el as HTMLElement;
    const rect = element.getBoundingClientRect();
    const area = rect.width * rect.height;

    // Skip very small thumbnails (less than 200x100)
    if (rect.width < 200 || rect.height < 100) {
      return;
    }

    // Skip empty overlay elements (no children = no content to capture)
    if (element.children.length === 0) {
      console.log('[findSlideElement] Skipping empty element:', element.className);
      return;
    }

    // Skip pointer-events-none overlays
    const style = window.getComputedStyle(element);
    if (style.pointerEvents === 'none' && element.innerHTML.length < 100) {
      console.log('[findSlideElement] Skipping pointer-events-none overlay:', element.className);
      return;
    }

    if (area > bestArea) {
      bestArea = area;
      bestSlide = element;
    }
  });

  if (bestSlide) {
    console.log('[findSlideElement] Found slide with', bestSlide.children.length, 'children');
  }

  // Fall back to first match if no good candidate found
  return bestSlide || (allSlides[0] as HTMLElement);
}

/**
 * Finds any slide element in the DOM, preferring larger ones.
 * Excludes empty overlay elements.
 */
export function findAnySlideElement(): HTMLElement | null {
  const allSlides = document.querySelectorAll('[data-slide-id]');

  if (allSlides.length === 0) {
    return null;
  }

  // Find the largest slide element with actual content
  let bestSlide: HTMLElement | null = null;
  let bestArea = 0;

  allSlides.forEach((el) => {
    const element = el as HTMLElement;
    const rect = element.getBoundingClientRect();
    const area = rect.width * rect.height;

    // Skip very small thumbnails
    if (rect.width < 200 || rect.height < 100) {
      return;
    }

    // Skip empty overlay elements
    if (element.children.length === 0) {
      return;
    }

    // Skip pointer-events-none overlays
    const style = window.getComputedStyle(element);
    if (style.pointerEvents === 'none' && element.innerHTML.length < 100) {
      return;
    }

    if (area > bestArea) {
      bestArea = area;
      bestSlide = element;
    }
  });

  return bestSlide || (allSlides[0] as HTMLElement);
}

/**
 * Waits for all images within an element to load
 */
async function waitForImages(element: HTMLElement, timeout = 5000): Promise<void> {
  const images = element.querySelectorAll('img');
  const promises: Promise<void>[] = [];

  images.forEach((img) => {
    if (!img.complete) {
      promises.push(
        new Promise((resolve) => {
          const timer = setTimeout(resolve, timeout);
          img.onload = () => {
            clearTimeout(timer);
            resolve();
          };
          img.onerror = () => {
            clearTimeout(timer);
            resolve();
          };
        })
      );
    }
  });

  await Promise.all(promises);
}

/**
 * Captures a slide as an OG-optimized thumbnail.
 * Uses the proven captureTinySlideScreenshot function and scales up to OG dimensions.
 *
 * @param slideElementOrId - Either an HTMLElement or a slide ID string
 */
export async function captureOGThumbnail(
  slideElementOrId: HTMLElement | string
): Promise<string | null> {
  // Resolve slide element if a string ID was passed
  const slideContainer = typeof slideElementOrId === 'string'
    ? findSlideElement(slideElementOrId)
    : slideElementOrId;

  if (!slideContainer) {
    console.warn('[OG Capture] Slide element not found');
    return null;
  }

  try {
    const slideId = slideContainer.getAttribute('data-slide-id') || 'unknown';
    console.log('[OG Capture] Starting capture for slide:', slideId);
    console.log('[OG Capture] Element:', slideContainer.tagName, slideContainer.className);
    console.log('[OG Capture] Children count:', slideContainer.children.length);

    // Use the PROVEN working captureTinySlideScreenshot function
    // This captures slides correctly including backgrounds, text, and components
    console.log('[OG Capture] Using captureTinySlideScreenshot (proven working)');
    const tinyDataUrl = await captureTinySlideScreenshot(slideContainer);

    if (!tinyDataUrl) {
      console.warn('[OG Capture] captureTinySlideScreenshot returned null');
      return null;
    }

    console.log('[OG Capture] Got tiny screenshot, scaling up to OG dimensions');

    // Load the tiny screenshot into an image
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load captured image'));
      img.src = tinyDataUrl;
    });

    console.log('[OG Capture] Tiny image size:', img.width, 'x', img.height);

    // Create final OG-sized canvas (1200x630)
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = OG_WIDTH;
    finalCanvas.height = OG_HEIGHT;
    const finalCtx = finalCanvas.getContext('2d');

    if (!finalCtx) {
      throw new Error('Could not get canvas context');
    }

    // Fill with white background first (for letterboxing)
    finalCtx.fillStyle = '#ffffff';
    finalCtx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);

    // Calculate how to fit the captured slide into OG dimensions
    const sourceWidth = img.width;
    const sourceHeight = img.height;
    const sourceAspect = sourceWidth / sourceHeight;
    const targetAspect = OG_WIDTH / OG_HEIGHT;

    let drawWidth: number;
    let drawHeight: number;
    let offsetX: number;
    let offsetY: number;

    if (sourceAspect > targetAspect) {
      // Source is wider (16:9 slide vs 1.9:1 OG) - fit to width, letterbox vertically
      drawWidth = OG_WIDTH;
      drawHeight = OG_WIDTH / sourceAspect;
      offsetX = 0;
      offsetY = (OG_HEIGHT - drawHeight) / 2;
    } else {
      // Source is taller - fit to height, letterbox horizontally
      drawHeight = OG_HEIGHT;
      drawWidth = OG_HEIGHT * sourceAspect;
      offsetX = (OG_WIDTH - drawWidth) / 2;
      offsetY = 0;
    }

    // Draw the captured slide centered in the OG canvas (scaled up from tiny)
    finalCtx.drawImage(
      img,
      0, 0, sourceWidth, sourceHeight,
      offsetX, offsetY, drawWidth, drawHeight
    );

    const dataUrl = finalCanvas.toDataURL('image/jpeg', 0.92);
    console.log('[OG Capture] Final image size:', Math.round(dataUrl.length / 1024), 'KB');

    // Store for debugging
    (window as any).__lastOGCapture = dataUrl;
    console.log('[OG Capture] 💡 Run window.open(__lastOGCapture) to view the captured image');

    return dataUrl;
  } catch (error) {
    console.error('[OG Capture] Failed to capture:', error);
    return null;
  }
}

/**
 * Uploads an OG thumbnail to Supabase storage.
 * Returns the public URL of the uploaded image.
 */
export async function uploadOGThumbnail(
  dataUrl: string,
  shortCode: string
): Promise<string | null> {
  try {
    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // Create a unique filename
    const filename = `og/${shortCode}_${uuidv4().substring(0, 8)}.jpg`;

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('slide-media')
      .upload(filename, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      console.error('[OG Upload] Upload failed:', error.message);
      return null;
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('slide-media')
      .getPublicUrl(filename);

    console.log('[OG Upload] Uploaded successfully:', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error) {
    console.error('[OG Upload] Failed to upload:', error);
    return null;
  }
}

/**
 * Captures and uploads an OG thumbnail for a shared deck.
 * This is the main function to call when creating a share link.
 */
export async function generateShareOGImage(
  slideElement: HTMLElement,
  shortCode: string
): Promise<string | null> {
  // Capture the thumbnail
  const dataUrl = await captureOGThumbnail(slideElement);

  if (!dataUrl) {
    return null;
  }

  // Upload to storage
  const publicUrl = await uploadOGThumbnail(dataUrl, shortCode);

  return publicUrl;
}

/**
 * Attempts to capture the first slide from the current deck.
 * Searches for any available slide element in the DOM.
 */
export async function captureFirstSlideOG(shortCode: string): Promise<string | null> {
  const slideElement = findAnySlideElement();

  if (!slideElement) {
    console.warn('[OG Capture] No slide element found in DOM');
    return null;
  }

  return generateShareOGImage(slideElement, shortCode);
}
