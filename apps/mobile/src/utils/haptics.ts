import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const isHapticsAvailable = Platform.OS === "ios" || Platform.OS === "android";

/** Light tap - for selections, toggles */
export function hapticLight() {
  if (!isHapticsAvailable) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Medium tap - for confirms, navigation */
export function hapticMedium() {
  if (!isHapticsAvailable) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** Heavy tap - for destructive actions */
export function hapticHeavy() {
  if (!isHapticsAvailable) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

/** Success notification */
export function hapticSuccess() {
  if (!isHapticsAvailable) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Warning notification */
export function hapticWarning() {
  if (!isHapticsAvailable) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}

/** Error notification */
export function hapticError() {
  if (!isHapticsAvailable) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}

/** Selection tick */
export function hapticSelection() {
  if (!isHapticsAvailable) return;
  Haptics.selectionAsync();
}

/** Dispatch haptic by style name (used by WebView bridge messages) */
export function hapticByStyle(style: string) {
  switch (style) {
    case "light":
      return hapticLight();
    case "medium":
      return hapticMedium();
    case "heavy":
      return hapticHeavy();
    case "success":
      return hapticSuccess();
    case "warning":
      return hapticWarning();
    case "error":
      return hapticError();
    case "selection":
      return hapticSelection();
    default:
      return hapticLight();
  }
}
