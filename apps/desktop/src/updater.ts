import { autoUpdater } from "electron-updater";
import { BrowserWindow, dialog, ipcMain } from "electron";

let updateAvailable = false;

export function initAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    updateAvailable = true;
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send("updater:available", {
        version: info.version,
      });
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      dialog
        .showMessageBox(win, {
          type: "info",
          title: "Update Ready",
          message: `NextSlide ${info.version} has been downloaded.`,
          detail: "The update will be installed when you restart the app.",
          buttons: ["Restart Now", "Later"],
          defaultId: 0,
        })
        .then(({ response }) => {
          if (response === 0) {
            autoUpdater.quitAndInstall();
          }
        });
    }
  });

  autoUpdater.on("error", (err) => {
    // Silently log update errors - don't bother the user
    console.error("Auto-updater error:", err.message);
  });

  // IPC handler for manual check
  ipcMain.handle("app:checkForUpdates", async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return {
        available: updateAvailable,
        version: result?.updateInfo?.version ?? null,
      };
    } catch {
      return { available: false, version: null };
    }
  });

  // Check on startup after a delay
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 10_000);
}
