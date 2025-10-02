import html2canvas from 'html2canvas';
import domtoimage from 'dom-to-image';
import { toast } from 'sonner';
import { RenderResponse } from './rendererWebSocket';

/**
 * Forces the browser to think the page is visible even when it's in a background tab
 * This helps with rendering interactive components that might pause in the background
 */
function forcePageVisibility() {
  // Save original values
  const originalHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden') || 
                         { get: () => false };
  const originalVisibilityState = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState') || 
                                  { get: () => 'visible' };
  
  // Override document.hidden
  Object.defineProperty(Document.prototype, 'hidden', {
    get: function() {
      return false;
    }
  });
  
  // Override document.visibilityState
  Object.defineProperty(Document.prototype, 'visibilityState', {
    get: function() {
      return 'visible';
    }
  });
  
  // Return function to restore original behavior if needed
  return function restorePageVisibility() {
    Object.defineProperty(Document.prototype, 'hidden', originalHidden);
    Object.defineProperty(Document.prototype, 'visibilityState', originalVisibilityState);
  };
}

/**
 * Ensures requestAnimationFrame and other timing functions continue to work in background tabs
 * and headless browsers by implementing a polyfill if needed
 */
function ensureAnimationFrames() {
  // Save original implementations
  const originalRAF = window.requestAnimationFrame;
  const originalCAF = window.cancelAnimationFrame;
  
  // If we're in a backgrounded tab or headless browser, the native requestAnimationFrame
  // might be throttled or not called at all. Implement a setTimeout-based polyfill.
  let active = false;
  
  function installRAFPolyfill() {
    if (active) return;
    active = true;
    
    window.requestAnimationFrame = function(callback) {
      return window.setTimeout(() => {
        callback(performance.now());
      }, 16); // ~60fps
    };
    
    window.cancelAnimationFrame = function(id) {
      return window.clearTimeout(id);
    };
  }
  
  function restoreRAF() {
    if (!active) return;
    active = false;
    
    window.requestAnimationFrame = originalRAF;
    window.cancelAnimationFrame = originalCAF;
  }

  // Check if we're in a background tab
  if (document.hidden) {
    installRAFPolyfill();
  }
  
  // Listen for visibility changes
  const visibilityHandler = () => {
    if (document.hidden) {
      installRAFPolyfill();
    } else {
      restoreRAF();
    }
  };
  
  document.addEventListener('visibilitychange', visibilityHandler);
  
  // Return cleanup function
  return () => {
    document.removeEventListener('visibilitychange', visibilityHandler);
    restoreRAF();
  };
}

/**
 * Ensures that timing functions like setTimeout and setInterval run at full speed
 * even in background tabs where browsers would normally throttle them
 */
function ensureTimers() {
  // Store original implementations
  const originalSetTimeout = window.setTimeout;
  const originalClearTimeout = window.clearTimeout;
  const originalSetInterval = window.setInterval;
  const originalClearInterval = window.clearInterval;
  
  // We'll use a Web Worker to bypass throttling if possible
  let worker: Worker | null = null;
  let overrideActive = false;
  
  try {
    // Create a worker that will post messages back at the requested intervals
    const workerCode = `
      const timers = new Map();
      
      self.onmessage = function(e) {
        const { type, id, delay } = e.data;
        
        if (type === 'setTimeout') {
          const timeoutId = setTimeout(() => {
            self.postMessage({ type: 'timeout', id });
            timers.delete(id);
          }, delay);
          timers.set(id, timeoutId);
        }
        else if (type === 'setInterval') {
          const intervalId = setInterval(() => {
            self.postMessage({ type: 'interval', id });
          }, delay);
          timers.set(id, intervalId);
        }
        else if (type === 'clearTimeout' || type === 'clearInterval') {
          const timerId = timers.get(id);
          if (timerId) {
            if (type === 'clearTimeout') clearTimeout(timerId);
            else clearInterval(timerId);
            timers.delete(id);
          }
        }
      };
    `;
    
    // Create a blob URL for the worker
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const blobURL = URL.createObjectURL(blob);
    worker = new Worker(blobURL);
    
    // Create maps to store callbacks
    const timeoutCallbacks = new Map();
    const intervalCallbacks = new Map();
    let nextTimerId = 1;
    
    // Listen for messages from the worker
    worker.onmessage = (e) => {
      const { type, id } = e.data;
      
      if (type === 'timeout') {
        const callback = timeoutCallbacks.get(id);
        if (callback) {
          callback();
          timeoutCallbacks.delete(id);
        }
      }
      else if (type === 'interval') {
        const callback = intervalCallbacks.get(id);
        if (callback) {
          callback();
        }
      }
    };
    
    // Instead of directly overriding window functions, we'll store them for use in captureSlide
    const workerSetTimeout = function(callback: TimerHandler, delay?: number, ...args: any[]): number {
      if (delay === undefined) delay = 0;
      
      // For very short timeouts or if args are passed, use the original setTimeout
      if (delay < 10 || args.length > 0) {
        return originalSetTimeout(callback, delay, ...args);
      }
      
      const id = nextTimerId++;
      timeoutCallbacks.set(id, typeof callback === 'function' ? 
        () => (callback as Function)(...args) : 
        () => eval(callback as string));
      
      worker.postMessage({ type: 'setTimeout', id, delay });
      return id;
    };
    
    const workerClearTimeout = function(id: number): void {
      if (timeoutCallbacks.has(id)) {
        worker.postMessage({ type: 'clearTimeout', id });
        timeoutCallbacks.delete(id);
      } else {
        originalClearTimeout(id);
      }
    };
    
    const workerSetInterval = function(callback: TimerHandler, delay?: number, ...args: any[]): number {
      if (delay === undefined) delay = 0;
      
      // For very short intervals or if args are passed, use the original setInterval
      if (delay < 10 || args.length > 0) {
        return originalSetInterval(callback, delay, ...args);
      }
      
      const id = nextTimerId++;
      intervalCallbacks.set(id, typeof callback === 'function' ? 
        () => (callback as Function)(...args) : 
        () => eval(callback as string));
      
      worker.postMessage({ type: 'setInterval', id, delay });
      return id;
    };
    
    const workerClearInterval = function(id: number): void {
      if (intervalCallbacks.has(id)) {
        worker.postMessage({ type: 'clearInterval', id });
        intervalCallbacks.delete(id);
      } else {
        originalClearInterval(id);
      }
    };
    
    // Function to activate our timer overrides
    function activateTimerOverrides() {
      if (overrideActive) return;
      overrideActive = true;
      
      // Now override the window functions
      window.setTimeout = workerSetTimeout as typeof window.setTimeout;
      window.clearTimeout = workerClearTimeout as typeof window.clearTimeout;
      window.setInterval = workerSetInterval as typeof window.setInterval;
      window.clearInterval = workerClearInterval as typeof window.clearInterval;
    }
    
    // If we're in a background tab, activate right away
    if (document.hidden) {
      activateTimerOverrides();
    }
    
    // Return a function to restore original behavior
    return function restoreTimers() {
      if (!overrideActive) return;
      overrideActive = false;
      
      window.setTimeout = originalSetTimeout;
      window.clearTimeout = originalClearTimeout;
      window.setInterval = originalSetInterval;
      window.clearInterval = originalClearInterval;
      
      if (worker) {
        worker.terminate();
        worker = null;
      }
    };
  } catch (e) {
    // If Web Worker setup fails, return a no-op function
    return function() {};
  }
}

/**
 * Activates all strategies to ensure proper rendering of interactive components
 * in backgrounded tabs or headless browsers
 */
function activateInteractiveRenderingStrategies() {
  // Combine all our strategies
  const restoreVisibility = forcePageVisibility();
  const restoreRAF = ensureAnimationFrames();
  const restoreTimers = ensureTimers();
  
  // Also pause any media elements that might interfere with capturing
  const mediaElements = document.querySelectorAll<HTMLMediaElement>('video, audio');
  const playingMedia: HTMLMediaElement[] = [];
  
  // Pause any playing media and remember which ones were playing
  mediaElements.forEach(media => {
    if (!media.paused) {
      playingMedia.push(media);
      media.pause();
    }
  });
  
  // Return a single function to clean up all strategies
  return function cleanup() {
    restoreVisibility();
    restoreRAF();
    restoreTimers();
    
    // Resume any media that was playing before
    playingMedia.forEach(media => {
      try {
        media.play().catch(() => {/* Ignore errors */});
      } catch (e) {
        // Ignore errors
      }
    });
  };
}

/**
 * Captures a slide element and returns HTML and screenshot data
 */
export async function captureSlide(
  slideElement: HTMLElement,
  slideId: string,
  slideIndex: number,
  totalSlides: number
): Promise<RenderResponse | null> {
  if (!slideElement) {
    return null;
  }

  // Activate strategies to ensure proper rendering of interactive components
  const cleanupStrategies = activateInteractiveRenderingStrategies();

  try {
    // First try html2canvas (generally better with text and fonts)
    let screenshotUrl = '';
    try {
      // Use a higher scale for better quality
      const canvas = await html2canvas(slideElement, {
        scale: 1, // Reduced from 2 to decrease screenshot size
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#FFFFFF',
        logging: false, // Disable logging to reduce console spam
        onclone: (documentClone) => {
          // Also make the cloned document appear visible for html2canvas
          const doc = documentClone as Document;
          Object.defineProperty(doc, 'hidden', { value: false });
          Object.defineProperty(doc, 'visibilityState', { value: 'visible' });
        }
      });
      
      screenshotUrl = canvas.toDataURL('image/png');
    } catch (html2canvasError) {
      // Fallback to dom-to-image
      try {
        screenshotUrl = await domtoimage.toPng(slideElement, {
          bgcolor: '#FFFFFF',
          style: {
            transform: 'none',
          }
        });
      } catch (domToImageError) {
        console.error('Both screenshot methods failed');
        throw new Error('Both screenshot methods failed');
      }
    }

    // Get the HTML content
    const htmlContent = slideElement.outerHTML;

    // Create the response
    const renderResponse: RenderResponse = {
      slideId,
      html: htmlContent,
      screenshot: screenshotUrl,
    };

    toast.success(`Slide ${slideIndex + 1} captured successfully`);
    return renderResponse;
  } catch (error) {
    console.error('Error capturing slide:', error);
    toast.error(`Failed to capture slide ${slideIndex + 1}`);
    return null;
  } finally {
    // Clean up all strategies
    cleanupStrategies();
  }
}

/**
 * Checks if a slide element is ready for capture
 */
export function isSlideReady(slideContainer: HTMLElement | null, slideId: string): boolean {
  if (!slideContainer) {
    return false;
  }
  
  // First check if the container has the correct data attribute
  const containerSlideId = slideContainer.getAttribute('data-slide-id');
  if (containerSlideId !== slideId) {
    return false;
  }
  
  // Then check if there's content inside
  const hasContent = slideContainer.children.length > 0;
  const rect = slideContainer.getBoundingClientRect();
  const hasSize = rect.width > 0 && rect.height > 0;
  
  return hasContent && hasSize;
}

/**
 * Waits for a slide to be ready with a timeout
 */
export function waitForSlideReady(
  checkReadyFn: () => boolean, 
  maxWaitTime: number = 5000
): Promise<boolean> {
  return new Promise((resolve) => {
    // Check immediately first
    if (checkReadyFn()) {
      resolve(true);
      return;
    }
    
    const startTime = Date.now();
    
    const checkInterval = setInterval(() => {
      // Check if slide is ready
      if (checkReadyFn()) {
        clearInterval(checkInterval);
        resolve(true);
        return;
      }
      
      // Check if we've exceeded the maximum wait time
      if (Date.now() - startTime > maxWaitTime) {
        clearInterval(checkInterval);
        resolve(false);
      }
    }, 100);
  });
} 