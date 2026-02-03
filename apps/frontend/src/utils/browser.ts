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
  isWebView: boolean;
  isElectron: boolean;
  isNativeApp: boolean;
  isDesktopApp: boolean;
  isMobileApp: boolean;
  appVersion: string | null;
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
      majorVersion: null,
      isWebView: false,
      isElectron: false,
      isNativeApp: false,
      isDesktopApp: false,
      isMobileApp: false,
      appVersion: null,
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
  const isWebView = /NextSlideApp/i.test(ua) || (typeof window !== 'undefined' && !!(window as any).ReactNativeWebView);
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
  const isNativeApp = isWebView || isElectron;
  const isDesktopApp = isElectron;
  const isMobileApp = isWebView && !isElectron;
  const appVersionMatch = ua.match(/NextSlide(?:Desktop|App)\/(\S+)/);
  const appVersion = appVersionMatch ? appVersionMatch[1] : null;
  return { isSafari, isFirefox, isChrome, isIOS, isMac, isMobile, isAndroid, majorVersion, isWebView, isElectron, isNativeApp, isDesktopApp, isMobileApp, appVersion };
}

export const BROWSER = getBrowserInfo();



