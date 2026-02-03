import { TouchBar, BrowserWindow } from "electron";

const { TouchBarButton, TouchBarSpacer } = TouchBar;

/**
 * Set up macOS Touch Bar with quick actions.
 * No-ops gracefully on non-macOS platforms.
 */
export function initTouchBar(win: BrowserWindow) {
  if (process.platform !== "darwin") return;

  try {
    const newDeck = new TouchBarButton({
      label: "➕ New Deck",
      backgroundColor: "#FF4301",
      click: () => {
        win.webContents.executeJavaScript(
          'window.location.href = "https://nextslide.ai/create"'
        );
      },
    });

    const myDecks = new TouchBarButton({
      label: "📂 My Decks",
      click: () => {
        win.webContents.executeJavaScript(
          'window.location.href = "https://nextslide.ai/decks"'
        );
      },
    });

    const home = new TouchBarButton({
      label: "🏠 Home",
      click: () => {
        win.webContents.executeJavaScript(
          'window.location.href = "https://nextslide.ai"'
        );
      },
    });

    const touchBar = new TouchBar({
      items: [
        home,
        new TouchBarSpacer({ size: "small" }),
        newDeck,
        new TouchBarSpacer({ size: "small" }),
        myDecks,
      ],
    });

    win.setTouchBar(touchBar);
  } catch {
    // TouchBar not available, ignore
  }
}
