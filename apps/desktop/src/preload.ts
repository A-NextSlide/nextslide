import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // Clipboard
  clipboard: {
    writeText: (text: string) => ipcRenderer.invoke("clipboard:writeText", text),
    readText: () => ipcRenderer.invoke("clipboard:readText"),
  },
  // Window management
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
    isFullScreen: () => ipcRenderer.invoke("window:isFullScreen"),
    setFullScreen: (flag: boolean) => ipcRenderer.invoke("window:setFullScreen", flag),
    onMaximizeChange: (callback: (maximized: boolean) => void) => {
      const handler = (_event: any, maximized: boolean) => callback(maximized);
      ipcRenderer.on("window:maximizeChanged", handler);
      return () => ipcRenderer.removeListener("window:maximizeChanged", handler);
    },
  },
  // App info
  app: {
    getInfo: () => ipcRenderer.invoke("app:getInfo"),
    getVersion: () => ipcRenderer.invoke("app:getVersion"),
    checkForUpdates: () => ipcRenderer.invoke("app:checkForUpdates"),
  },
  // Navigation
  navigate: {
    to: (path: string) => ipcRenderer.invoke("navigate:to", path),
    back: () => ipcRenderer.invoke("navigate:back"),
    forward: () => ipcRenderer.invoke("navigate:forward"),
    reload: () => ipcRenderer.invoke("navigate:reload"),
  },
  // Notifications
  notifications: {
    show: (title: string, body: string) => ipcRenderer.invoke("notifications:show", title, body),
  },
  // Share / External
  external: {
    openUrl: (url: string) => ipcRenderer.invoke("external:openUrl", url),
  },
  // System
  system: {
    platform: process.platform,
    onDeepLink: (callback: (url: string) => void) => {
      const handler = (_event: any, url: string) => callback(url);
      ipcRenderer.on("deeplink:received", handler);
      return () => ipcRenderer.removeListener("deeplink:received", handler);
    },
  },
});
