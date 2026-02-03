import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

/**
 * Request push notification permission and return the Expo push token.
 * Returns null if permissions are denied or unavailable.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Physical device required for push notifications
  if (!Device.isDevice) {
    return null;
  }

  // Check existing permissions
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  // Android notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF4301",
    });

    await Notifications.setNotificationChannelAsync("deck-ready", {
      name: "Deck Ready",
      description: "When your presentation is done generating",
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: "#FF4301",
    });

    await Notifications.setNotificationChannelAsync("social", {
      name: "Social",
      description: "Comments, shares, and collaboration",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: projectId ?? undefined,
    });
    return token.data;
  } catch {
    return null;
  }
}

/** Schedule a local notification (e.g., "Deck ready!" after background generation) */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  delaySeconds?: number
) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data ?? {},
      sound: "default",
    },
    trigger: delaySeconds
      ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delaySeconds }
      : null,
  });
}

/** Get the current notification permission status */
export async function getNotificationPermissionStatus(): Promise<string> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/** Get the badge count */
export async function getBadgeCount(): Promise<number> {
  return Notifications.getBadgeCountAsync();
}

/** Set the badge count */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}
