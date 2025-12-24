import html2canvas from 'html2canvas';
import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * OG Image dimensions (optimized for social sharing)
 * Standard OG image size is 1200x630
 */
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const SLIDE_WIDTH = 1920;
const SLIDE_HEIGHT = 1080;

/**
 * Finds a slide element by its ID using the data-slide-id attribute.
 */
export function findSlideElement(slideId: string): HTMLElement | null {
  return document.querySelector(`[data-slide-id="${slideId}"]`) as HTMLElement | null;
}

/**
 * Captures the first slide of a deck as an OG-optimized thumbnail.
 * Handles both regular slides and iframe-based CustomComponents.
 * The image is sized to 1200x630 (standard OG dimensions).
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
    // Wait for rendering to complete
    await new Promise(resolve => setTimeout(resolve, 300));

    let canvas: HTMLCanvasElement;

    // Check for iframe-based CustomComponent
    const iframe = slideContainer.querySelector('iframe[srcdoc]') as HTMLIFrameElement;

    if (iframe && iframe.contentDocument?.body) {
      // CustomComponent: Capture directly from iframe's internal document
      console.log('[OG Capture] Capturing from iframe contentDocument');
      canvas = await html2canvas(iframe.contentDocument.body, {
        scale: OG_WIDTH / SLIDE_WIDTH,
        backgroundColor: '#ffffff',
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        logging: false,
        useCORS: true,
        allowTaint: true,
        imageTimeout: 5000,
      });
    } else {
      // Regular slide: Clone and reset transforms
      console.log('[OG Capture] Capturing regular slide');
      const slideContent = slideContainer.querySelector('div[style*="transform"]') as HTMLElement;

      if (!slideContent) {
        // Fallback: try to capture the container directly
        console.log('[OG Capture] No transform div found, capturing container');
        canvas = await html2canvas(slideContainer, {
          scale: OG_WIDTH / SLIDE_WIDTH,
          backgroundColor: '#ffffff',
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          logging: false,
          useCORS: true,
          allowTaint: true,
          imageTimeout: 5000,
        });
      } else {
        // Clone to avoid modifying the original
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '0';
        tempContainer.style.width = `${SLIDE_WIDTH}px`;
        tempContainer.style.height = `${SLIDE_HEIGHT}px`;
        tempContainer.style.backgroundColor = '#ffffff';
        tempContainer.style.overflow = 'hidden';

        const clone = slideContent.cloneNode(true) as HTMLElement;
        clone.style.transform = 'none';
        clone.style.position = 'relative';
        clone.style.width = `${SLIDE_WIDTH}px`;
        clone.style.height = `${SLIDE_HEIGHT}px`;
        tempContainer.appendChild(clone);
        document.body.appendChild(tempContainer);

        try {
          // Wait for cloned content to render
          await new Promise(resolve => setTimeout(resolve, 100));

          canvas = await html2canvas(tempContainer, {
            scale: OG_WIDTH / SLIDE_WIDTH,
            backgroundColor: '#ffffff',
            width: SLIDE_WIDTH,
            height: SLIDE_HEIGHT,
            logging: false,
            useCORS: true,
            allowTaint: true,
            imageTimeout: 5000,
          });
        } finally {
          document.body.removeChild(tempContainer);
        }
      }
    }

    // Crop to OG dimensions (1200x630)
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = OG_WIDTH;
    finalCanvas.height = OG_HEIGHT;
    const ctx = finalCanvas.getContext('2d');

    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    // Fill with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);

    // Center the slide vertically (crop equally from top/bottom)
    const sourceHeight = canvas.height;
    const sourceWidth = canvas.width;
    const cropAmount = Math.max(0, (sourceHeight - OG_HEIGHT) / 2);

    ctx.drawImage(
      canvas,
      0, cropAmount, sourceWidth, Math.min(sourceHeight, OG_HEIGHT),
      0, 0, OG_WIDTH, OG_HEIGHT
    );

    console.log('[OG Capture] Successfully captured slide');
    return finalCanvas.toDataURL('image/jpeg', 0.9);
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
