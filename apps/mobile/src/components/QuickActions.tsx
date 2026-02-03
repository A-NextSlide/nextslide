import { useEffect } from "react";
import * as QuickActions from "expo-quick-actions";
import { Platform } from "react-native";

/**
 * Hook to register home screen quick actions (3D Touch / long-press shortcuts).
 * Call this once in the root layout.
 */
export function useQuickActions(
  onAction: (action: { id: string; params?: Record<string, string> }) => void
) {
  useEffect(() => {
    // Register static quick actions
    QuickActions.setItems([
      {
        id: "new-deck",
        title: "New Presentation",
        subtitle: "Create with AI",
        icon: Platform.OS === "ios" ? "symbol:plus.rectangle.fill" : undefined,
      },
      {
        id: "my-decks",
        title: "My Decks",
        subtitle: "Open recent",
        icon: Platform.OS === "ios" ? "symbol:rectangle.stack.fill" : undefined,
      },
    ]);
  }, []);

  // Listen for quick action triggers
  useEffect(() => {
    const subscription = QuickActions.addListener((event) => {
      if (event?.id) {
        onAction({ id: event.id, params: event.params });
      }
    });
    return () => subscription?.remove();
  }, [onAction]);
}

/** Route map for quick actions → web app paths */
export const QUICK_ACTION_ROUTES: Record<string, string> = {
  "new-deck": "/create",
  "my-decks": "/decks",
};
