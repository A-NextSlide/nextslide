import { useCallback, useEffect, useState } from "react";
import { nativeBridge, type AppInfo } from "../utils/nativeBridge";
import { BROWSER } from "../utils/browser";

/** Whether the app is running inside a native shell */
export function useIsNativeApp() {
  return BROWSER.isNativeApp;
}

/** Whether the app is running in the desktop Electron shell */
export function useIsDesktopApp() {
  return BROWSER.isDesktopApp;
}

/** Whether the app is running in the mobile WebView shell */
export function useIsMobileApp() {
  return BROWSER.isMobileApp;
}

/** Get app info (version, name, platform) from the native shell */
export function useAppInfo() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    nativeBridge.getAppInfo().then(setAppInfo);
  }, []);

  return appInfo;
}

/** Copy text to clipboard via native bridge */
export function useNativeCopy() {
  return useCallback((text: string) => nativeBridge.copyText(text), []);
}

/** Trigger haptic feedback */
export function useHaptic() {
  return useCallback(
    (style: "light" | "medium" | "heavy" | "success" | "warning" | "error" | "selection" = "light") => {
      nativeBridge.haptic(style);
    },
    []
  );
}

/** Native share sheet */
export function useNativeShare() {
  return useCallback(
    (data: { url?: string; title?: string; text?: string }) => nativeBridge.share(data),
    []
  );
}

/** Open URL in system browser */
export function useOpenExternal() {
  return useCallback((url: string) => nativeBridge.openExternal(url), []);
}

/** Desktop window maximize state tracking */
export function useWindowMaximized() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!BROWSER.isDesktopApp) return;
    nativeBridge.window.isMaximized().then(setMaximized);
    const cleanup = nativeBridge.window.onMaximizeChange(setMaximized);
    return cleanup;
  }, []);

  return maximized;
}

/** Check for app updates (desktop only) */
export function useCheckForUpdates() {
  return useCallback(() => {
    if (BROWSER.isDesktopApp) {
      nativeBridge.checkForUpdates();
    }
  }, []);
}
