// Simple browser and platform detection helpers
// Keep this lightweight and side-effect free.

export type BrowserInfo = {
  isSafari: boolean;
  isFirefox: boolean;
  isChrome: boolean;
  isIOS: boolean;
  isMac: boolean;
  isMobile: boolean;
  isAndroid: boolean;
  majorVersion: number | null;
};

function parseMajorVersion(ua: string): number | null {
  try {
    // Try Safari version
    const safariMatch = ua.match(/version\/(\d+)/i);
    if (safariMatch) return parseInt(safariMatch[1], 10);
    // Try Chrome/Chromium
    const chromeMatch = ua.match(/chrome\/(\d+)/i);
    if (chromeMatch) return parseInt(chromeMatch[1], 10);
    // Try Firefox
    const ffMatch = ua.match(/firefox\/(\d+)/i);
    if (ffMatch) return parseInt(ffMatch[1], 10);
  } catch {}
  return null;
}

export function getBrowserInfo(): BrowserInfo {
  if (typeof navigator === 'undefined') {
    return {
      isSafari: false,
      isFirefox: false,
      isChrome: false,
      isIOS: false,
      isMac: false,
      isMobile: false,
      isAndroid: false,
      majorVersion: null
    };
  }
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator as any).platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1;
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid || /webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua) ||
    (typeof window !== 'undefined' && 'ontouchstart' in window && window.innerWidth < 768);
  const isSafari = /safari/i.test(ua) && !/chrome|chromium|crios|android/i.test(ua);
  const isFirefox = /firefox/i.test(ua);
  const isChrome = /chrome|chromium|crios/i.test(ua) && !/edg|edge/i.test(ua);
  const isMac = /Mac|Macintosh/.test(ua);
  const majorVersion = parseMajorVersion(ua);
  return { isSafari, isFirefox, isChrome, isIOS, isMac, isMobile, isAndroid, majorVersion };
}

export const BROWSER = getBrowserInfo();



