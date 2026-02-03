/**
 * Unified native bridge for communicating with desktop (Electron) and mobile (React Native) shells.
 * Falls back to no-ops or web APIs when running in a regular browser.
 */

import { BROWSER } from './browser';

// ============================================================
// Types
// ============================================================

export interface AppInfo {
  version: string;
  name: string;
  platform: string;
}

export interface NativeBridge {
  /** Whether a native bridge is available */
  readonly isAvailable: boolean;
  /** Which platform: 'electron' | 'webview' | 'web' */
  readonly platform: 'electron' | 'webview' | 'web';

  // Clipboard
  copyText(text: string): Promise<boolean>;

  // Haptics (mobile only, no-op on desktop/web)
  haptic(style: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection'): void;

  // Share (uses native share sheet on mobile, fallback to clipboard on desktop/web)
  share(data: { url?: string; title?: string; text?: string }): Promise<boolean>;

  // Navigation
  navigate(path: string): void;

  // Window management (desktop only)
  window: {
    minimize(): void;
    maximize(): void;
    close(): void;
    isMaximized(): Promise<boolean>;
    setFullScreen(flag: boolean): void;
    onMaximizeChange(callback: (maximized: boolean) => void): () => void;
  };

  // App info
  getAppInfo(): Promise<AppInfo | null>;

  // External URLs
  openExternal(url: string): void;

  // Notifications
  showNotification(title: string, body: string): void;

  // Request notification permission (mobile)
  requestNotificationPermission(): void;

  // Update check (desktop only)
  checkForUpdates(): Promise<void>;
}

// ============================================================
// Electron Bridge
// ============================================================

function createElectronBridge(): NativeBridge {
  const api = (window as any).electronAPI;

  const bridge: NativeBridge = {
    isAvailable: true,
    platform: 'electron',

    async copyText(text: string): Promise<boolean> {
      try {
        await api.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    },

    haptic(): void {
      /* no-op on desktop */
    },

    async share(data: { url?: string; title?: string; text?: string }): Promise<boolean> {
      // Desktop: copy link to clipboard as fallback
      if (data.url) {
        return bridge.copyText(data.url);
      }
      return false;
    },

    navigate(path: string): void {
      window.location.href = path;
    },

    window: {
      minimize(): void {
        api.window.minimize();
      },
      maximize(): void {
        api.window.maximize();
      },
      close(): void {
        api.window.close();
      },
      async isMaximized(): Promise<boolean> {
        return api.window.isMaximized?.() ?? false;
      },
      setFullScreen(flag: boolean): void {
        api.window.setFullScreen?.(flag);
      },
      onMaximizeChange(callback: (maximized: boolean) => void): () => void {
        return api.window.onMaximizeChange?.(callback) ?? (() => {});
      },
    },

    async getAppInfo(): Promise<AppInfo | null> {
      try {
        return await api.app.getInfo();
      } catch {
        return null;
      }
    },

    openExternal(url: string): void {
      api.external?.openUrl(url) ?? window.open(url, '_blank');
    },

    showNotification(title: string, body: string): void {
      api.notifications?.show(title, body);
    },

    requestNotificationPermission(): void {
      /* handled at OS level for desktop */
    },

    async checkForUpdates(): Promise<void> {
      try {
        await api.app.checkForUpdates?.();
      } catch {
        /* ignore */
      }
    },
  };

  return bridge;
}

// ============================================================
// React Native WebView Bridge
// ============================================================

function createWebViewBridge(): NativeBridge {
  const postMessage = (msg: Record<string, unknown>): void => {
    try {
      (window as any).ReactNativeWebView?.postMessage(JSON.stringify(msg));
    } catch {
      /* ignore */
    }
  };

  return {
    isAvailable: true,
    platform: 'webview',

    async copyText(text: string): Promise<boolean> {
      postMessage({ type: 'clipboard-write', text });
      return true;
    },

    haptic(style: string): void {
      postMessage({ type: 'haptic', style });
    },

    async share(data: { url?: string; title?: string; text?: string }): Promise<boolean> {
      postMessage({ type: 'share', data });
      return true;
    },

    navigate(path: string): void {
      postMessage({ type: 'navigate', route: path });
    },

    window: {
      minimize(): void {},
      maximize(): void {},
      close(): void {},
      async isMaximized(): Promise<boolean> {
        return false;
      },
      setFullScreen(): void {},
      onMaximizeChange(): () => void {
        return () => {};
      },
    },

    async getAppInfo(): Promise<AppInfo | null> {
      return null;
    },

    openExternal(url: string): void {
      postMessage({ type: 'open-url', url });
    },

    showNotification(title: string, body: string): void {
      postMessage({ type: 'notification', title, body });
    },

    requestNotificationPermission(): void {
      postMessage({ type: 'notification-permission', action: 'request' });
    },

    async checkForUpdates(): Promise<void> {
      /* handled by app stores */
    },
  };
}

// ============================================================
// Web Fallback Bridge
// ============================================================

function createWebBridge(): NativeBridge {
  const bridge: NativeBridge = {
    isAvailable: false,
    platform: 'web',

    async copyText(text: string): Promise<boolean> {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    },

    haptic(): void {},

    async share(data: { url?: string; title?: string; text?: string }): Promise<boolean> {
      if (navigator.share) {
        try {
          await navigator.share({ url: data.url, title: data.title, text: data.text });
          return true;
        } catch {
          return false;
        }
      }
      if (data.url) return bridge.copyText(data.url);
      return false;
    },

    navigate(path: string): void {
      window.location.href = path;
    },

    window: {
      minimize(): void {},
      maximize(): void {},
      close(): void {},
      async isMaximized(): Promise<boolean> {
        return false;
      },
      setFullScreen(flag: boolean): void {
        if (flag) document.documentElement.requestFullscreen?.();
        else document.exitFullscreen?.();
      },
      onMaximizeChange(): () => void {
        return () => {};
      },
    },

    async getAppInfo(): Promise<AppInfo | null> {
      return null;
    },

    openExternal(url: string): void {
      window.open(url, '_blank', 'noopener,noreferrer');
    },

    showNotification(title: string, body: string): void {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    },

    requestNotificationPermission(): void {
      if ('Notification' in window) {
        Notification.requestPermission();
      }
    },

    async checkForUpdates(): Promise<void> {},
  };

  return bridge;
}

// ============================================================
// Singleton Export
// ============================================================

function createBridge(): NativeBridge {
  if (BROWSER.isElectron) return createElectronBridge();
  if (BROWSER.isWebView) return createWebViewBridge();
  return createWebBridge();
}

/** Singleton native bridge instance */
export const nativeBridge = createBridge();
