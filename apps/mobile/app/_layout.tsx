import { useCallback, useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { AnimatedSplash } from "../src/components/AnimatedSplash";

// Prevent auto-hide of native splash
SplashScreen.preventAutoHideAsync();

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.HIGH,
  }),
});

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Hide the native splash screen once our custom one is showing
        await SplashScreen.hideAsync();
      } catch {
        // Ignore
      }
      // Mark app as ready after a brief delay to let WebView start loading
      setTimeout(() => setAppReady(true), 500);
    }
    prepare();
  }, []);

  const handleSplashComplete = useCallback(() => {
    setSplashDone(true);
  }, []);

  return (
    <>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#000" },
          animation: "none",
        }}
      />
      {!splashDone && (
        <AnimatedSplash
          isReady={appReady}
          onAnimationComplete={handleSplashComplete}
        />
      )}
    </>
  );
}
