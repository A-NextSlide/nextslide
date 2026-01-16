import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { SlideData } from '@/types/SlideTypes';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';

/**
 * Forces all CSS animations and transitions to their end state
 * Also removes backdrop-filter which can't be rendered by screenshot libraries
 */
function forceAnimationsToEndState(element: HTMLElement): () => void {
  const originalStyles = new Map<HTMLElement, string>();

  const processElement = (el: HTMLElement) => {
    const computed = window.getComputedStyle(el);
    let needsRestore = false;

    // Handle animations
    if (computed.animationName && computed.animationName !== 'none') {
      if (!originalStyles.has(el)) {
        originalStyles.set(el, el.style.cssText);
      }
      needsRestore = true;
      el.style.animationPlayState = 'paused';
      el.style.animationDelay = '-9999s';
      el.style.animationFillMode = 'forwards';
    }

    // Handle transitions
    if (computed.transitionDuration && computed.transitionDuration !== '0s') {
      if (!originalStyles.has(el)) {
        originalStyles.set(el, el.style.cssText);
      }
      needsRestore = true;
      el.style.transitionDuration = '0s';
    }

    // CRITICAL: Remove backdrop-filter which can't be rendered by html-to-image/html2canvas
    // This causes the gray blocks!
    const backdropFilter = computed.getPropertyValue('backdrop-filter') ||
                           computed.getPropertyValue('-webkit-backdrop-filter');
    if (backdropFilter && backdropFilter !== 'none') {
      if (!originalStyles.has(el)) {
        originalStyles.set(el, el.style.cssText);
      }
      needsRestore = true;
      el.style.backdropFilter = 'none';
      el.style.setProperty('-webkit-backdrop-filter', 'none');
      // Make the background more opaque to compensate for lost blur effect
      const bgColor = computed.backgroundColor;
      if (bgColor && bgColor.includes('rgba')) {
        // Increase opacity of semi-transparent backgrounds
        const match = bgColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
        if (match) {
          const [, r, g, b, a] = match;
          const newAlpha = Math.min(1, parseFloat(a) + 0.3);
          el.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${newAlpha})`;
        }
      }
    }
  };

  element.querySelectorAll('*').forEach((el) => processElement(el as HTMLElement));
  processElement(element);

  return () => {
    originalStyles.forEach((css, el) => {
      el.style.cssText = css;
    });
  };
}

/**
 * Wait for a condition with timeout
 */
function waitFor(condition: () => boolean, maxWait: number = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const check = () => {
      if (condition()) {
        resolve(true);
        return;
      }
      if (Date.now() - startTime > maxWait) {
        resolve(false);
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

/**
 * Wait for stylesheets to load in an iframe
 */
async function waitForStylesheets(iframeDoc: Document, maxWait: number = 1000): Promise<void> {
  const links = Array.from(iframeDoc.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
  if (links.length === 0) return;

  const promises = links.map((link) => {
    return new Promise<void>((resolve) => {
      if ((link as any).sheet) {
        resolve();
        return;
      }
      const onLoad = () => { link.removeEventListener('load', onLoad); resolve(); };
      const onError = () => { link.removeEventListener('error', onError); resolve(); };
      link.addEventListener('load', onLoad);
      link.addEventListener('error', onError);
    });
  });

  const timeout = new Promise<void>((resolve) => setTimeout(resolve, maxWait));
  await Promise.race([Promise.all(promises), timeout]);
}

/**
 * Wait for all fonts to load (both main document and inside iframes)
 */
async function waitForFonts(element: HTMLElement, maxWait: number = 2000): Promise<void> {
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, maxWait));

  // Wait for main document fonts
  const mainFonts = document.fonts.ready;

  // Find iframes and wait for their fonts
  const iframePromises: Promise<void>[] = [];
  const iframes = element.querySelectorAll('iframe');

  for (const iframe of Array.from(iframes)) {
    try {
      const iframeDoc = (iframe as HTMLIFrameElement).contentDocument;
      if (iframeDoc) {
        // Wait for stylesheets briefly
        await waitForStylesheets(iframeDoc, 1000);

        // Then wait for fonts
        if (iframeDoc.fonts) {
          iframePromises.push(iframeDoc.fonts.ready.then(() => {}));
        }
      }
    } catch (e) {
      // Cross-origin iframe, skip
    }
  }

  await Promise.race([
    Promise.all([mainFonts, ...iframePromises]),
    timeout
  ]);
}

/**
 * Wait for images to load
 */
async function waitForImages(element: HTMLElement, maxWait: number = 1500): Promise<void> {
  const images = Array.from(element.querySelectorAll('img'));

  // Also get images from iframes
  const iframes = element.querySelectorAll('iframe');
  iframes.forEach((iframe) => {
    try {
      const iframeDoc = (iframe as HTMLIFrameElement).contentDocument;
      if (iframeDoc) {
        images.push(...Array.from(iframeDoc.querySelectorAll('img')));
      }
    } catch (e) {
      // Cross-origin
    }
  });

  if (images.length === 0) return;

  return new Promise((resolve) => {
    let loaded = 0;
    const timeout = setTimeout(() => resolve(), maxWait);

    const checkDone = () => {
      loaded++;
      if (loaded >= images.length) {
        clearTimeout(timeout);
        resolve();
      }
    };

    images.forEach((img) => {
      if (img.complete && img.naturalHeight > 0) {
        checkDone();
      } else {
        img.onload = checkDone;
        img.onerror = checkDone;
      }
    });
  });
}

/**
 * Find the slide element in the DOM
 */
function findSlideElement(slideId: string): HTMLElement | null {
  const element = document.querySelector(`[data-slide-id="${slideId}"]`) as HTMLElement;
  if (element) return element;
  return document.querySelector('[data-slide-id]') as HTMLElement;
}

/**
 * Get the slide element for overlay positioning
 */
function getSlideElement(): HTMLElement | null {
  // First try to find the actual slide container with data-slide-id
  const slideEl = document.querySelector('[data-slide-id]') as HTMLElement;
  if (slideEl) return slideEl;

  // Fallback to slide-container class
  return document.querySelector('.slide-container') as HTMLElement;
}

/**
 * Remove backdrop-filter from cloned element (causes gray blocks in html2canvas)
 */
function removeBackdropFilter(element: HTMLElement): void {
  const removeFromEl = (el: HTMLElement) => {
    const computed = window.getComputedStyle(el);
    const backdrop = computed.getPropertyValue('backdrop-filter') ||
                     computed.getPropertyValue('-webkit-backdrop-filter');
    if (backdrop && backdrop !== 'none') {
      el.style.backdropFilter = 'none';
      el.style.setProperty('-webkit-backdrop-filter', 'none');
      // Increase background opacity to compensate
      const bg = computed.backgroundColor;
      if (bg && bg.includes('rgba')) {
        const match = bg.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
        if (match) {
          const [, r, g, b, a] = match;
          const newAlpha = Math.min(1, parseFloat(a) + 0.4);
          el.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${newAlpha})`;
        }
      }
    }
  };

  element.querySelectorAll('*').forEach(el => removeFromEl(el as HTMLElement));
  removeFromEl(element);
}

/**
 * Capture slide using html2canvas with 2x scale for better font rendering
 */
async function captureSlide(
  slideContainer: HTMLElement,
  targetWidth: number,
  targetHeight: number
): Promise<string> {
  // Check for iframe with srcDoc (CustomComponent)
  const iframe = slideContainer.querySelector('iframe[srcdoc]') as HTMLIFrameElement;

  if (iframe && iframe.contentDocument?.body) {
    const iframeDoc = iframe.contentDocument;
    const iframeBody = iframeDoc.body;

    // Wait for stylesheets
    await waitForStylesheets(iframeDoc, 1500);

    // Wait for iframe fonts
    try {
      await iframeDoc.fonts.ready;
    } catch (e) {
      // Ignore
    }

    // Wait for images
    await waitForImages(iframeBody as HTMLElement, 2000);

    // Force animations to end state
    const restore = forceAnimationsToEndState(iframeBody as HTMLElement);

    // Brief wait for styles to apply
    await new Promise(r => setTimeout(r, 150));

    try {
      // Capture at 2x scale for crisp fonts, then resize down
      const canvas = await html2canvas(iframeBody, {
        width: targetWidth,
        height: targetHeight,
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        onclone: (clonedDoc) => {
          removeBackdropFilter(clonedDoc.body);
        }
      });

      // Resize to target dimensions for smaller file size
      const resizedCanvas = document.createElement('canvas');
      resizedCanvas.width = targetWidth;
      resizedCanvas.height = targetHeight;
      const ctx = resizedCanvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
      }

      return resizedCanvas.toDataURL('image/jpeg', 0.92);
    } finally {
      restore();
    }
  }

  // Non-iframe slide - capture the slide container directly
  const restore = forceAnimationsToEndState(slideContainer);
  await document.fonts.ready;
  await new Promise(r => setTimeout(r, 100));

  try {
    // Capture at 2x scale for crisp fonts
    const canvas = await html2canvas(slideContainer, {
      width: targetWidth,
      height: targetHeight,
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      onclone: (clonedDoc, clonedEl) => {
        removeBackdropFilter(clonedEl);
      }
    });

    // Resize to target dimensions
    const resizedCanvas = document.createElement('canvas');
    resizedCanvas.width = targetWidth;
    resizedCanvas.height = targetHeight;
    const ctx = resizedCanvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
    }

    return resizedCanvas.toDataURL('image/jpeg', 0.92);
  } finally {
    restore();
  }
}

/**
 * Create overlay positioned over the slide area
 */
function createOverlay(slideCount: number): { overlay: HTMLElement; updateProgress: (current: number) => void } {
  const slideEl = getSlideElement();

  const overlay = document.createElement('div');

  if (slideEl) {
    const rect = slideEl.getBoundingClientRect();
    overlay.style.cssText = `
      position: fixed;
      top: ${rect.top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      background: rgba(255, 255, 255, 0.98);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, sans-serif;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    `;
  } else {
    // Fallback to center of screen
    overlay.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 40px 60px;
      background: rgba(255, 255, 255, 0.98);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, sans-serif;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    `;
  }

  overlay.innerHTML = `
    <div style="text-align: center;">
      <div style="font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #333;">Generating PDF</div>
      <div style="font-size: 14px; color: #666;" id="pdf-progress">Preparing...</div>
      <div style="margin-top: 16px; width: 200px; height: 4px; background: #e0e0e0; border-radius: 2px; overflow: hidden;">
        <div id="pdf-progress-bar" style="width: 0%; height: 100%; background: #3b82f6; transition: width 0.3s;"></div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const progressEl = overlay.querySelector('#pdf-progress') as HTMLElement;
  const progressBar = overlay.querySelector('#pdf-progress-bar') as HTMLElement;

  const updateProgress = (current: number) => {
    if (progressEl) progressEl.textContent = `Slide ${current} of ${slideCount}`;
    if (progressBar) progressBar.style.width = `${(current / slideCount) * 100}%`;
  };

  return { overlay, updateProgress };
}

/**
 * Main export function - captures visible slides and exports to PDF
 */
export async function exportDeckToPDF(
  slides: SlideData[],
  deckName: string,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  if (!slides || slides.length === 0) {
    throw new Error('No slides to export');
  }

  const slideSize = { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT };

  // Create PDF
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [slideSize.width, slideSize.height],
    hotfixes: ['px_scaling']
  });

  // Navigation helper - fast slide switching
  const navigateToSlide = (index: number): Promise<void> => {
    return new Promise((resolve) => {
      window.dispatchEvent(new CustomEvent('pdf-export:navigate', {
        detail: { slideIndex: index }
      }));
      // Quick wait for navigation and React re-render
      setTimeout(resolve, 600);
    });
  };

  // Store current slide to restore later
  const currentSlideElement = document.querySelector('[data-slide-id]');
  const originalSlideId = currentSlideElement?.getAttribute('data-slide-id');

  // Create overlay
  const { overlay, updateProgress } = createOverlay(slides.length);

  try {
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      onProgress?.(i + 1, slides.length);
      updateProgress(i + 1);

      console.log(`[PDF Export] Processing slide ${i + 1}/${slides.length}`);

      // Navigate to slide
      await navigateToSlide(i);

      // Wait for slide element to appear
      const found = await waitFor(() => {
        const el = findSlideElement(slide.id);
        return el !== null;
      }, 1500);

      if (!found) {
        console.warn(`[PDF Export] Could not find slide ${i + 1}`);
        continue;
      }

      const slideElement = findSlideElement(slide.id);
      if (!slideElement) continue;

      // Wait for fonts (both main and iframe)
      await waitForFonts(slideElement, 2000);

      // Wait for images
      await waitForImages(slideElement, 1500);

      // Brief settle time
      await new Promise((r) => setTimeout(r, 100));

      // Capture the slide
      console.log(`[PDF Export] Capturing slide ${i + 1}`);
      const imgData = await captureSlide(slideElement, slideSize.width, slideSize.height);

      // Check if capture is valid (not blank)
      if (imgData.length < 1000) {
        console.warn(`[PDF Export] Slide ${i + 1} capture seems too small, may be blank`);
      }

      // Add page (except first)
      if (i > 0) {
        pdf.addPage([slideSize.width, slideSize.height], 'landscape');
      }

      // Add image (JPEG format)
      pdf.addImage(imgData, 'JPEG', 0, 0, slideSize.width, slideSize.height);
      console.log(`[PDF Export] Added slide ${i + 1} to PDF`);
    }

    // Restore original slide
    if (originalSlideId) {
      const originalIndex = slides.findIndex(s => s.id === originalSlideId);
      if (originalIndex >= 0) {
        await navigateToSlide(originalIndex);
      }
    }

    // Save
    const sanitizedName = deckName.replace(/[^a-zA-Z0-9-_\s]/g, '').trim() || 'presentation';
    pdf.save(`${sanitizedName}.pdf`);
    console.log('[PDF Export] PDF saved');

  } finally {
    document.body.removeChild(overlay);
  }
}
