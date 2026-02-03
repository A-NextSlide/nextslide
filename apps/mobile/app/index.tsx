import { useRef, useState, useCallback, useEffect } from "react";
import {
  BackHandler,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type {
  WebViewNavigation,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewMessageEvent,
} from "react-native-webview";
import { useFocusEffect } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import * as Notifications from "expo-notifications";

import { BRAND_COLORS } from "../src/constants/brand";
import { hapticByStyle, hapticSuccess, hapticMedium } from "../src/utils/haptics";
import { INJECTED_BRIDGE_JS, INJECTED_PRELOAD_JS, type BridgeMessage } from "../src/utils/nativeBridge";
import { registerForPushNotifications } from "../src/utils/notifications";
import { LoadingSkeleton } from "../src/components/LoadingSkeleton";
import { ErrorScreen, type ErrorType } from "../src/components/ErrorScreen";
import { useQuickActions, QUICK_ACTION_ROUTES } from "../src/components/QuickActions";

const APP_URL = process.env.EXPO_PUBLIC_APP_URL || "https://nextslide.ai";
const APP_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NextSlideApp/1.0";

const ALLOWED_DOMAINS = [
  "nextslide.ai",
  "challenges.cloudflare.com",
  "google.com",
  "supabase.co",
  "github.com",
  "appleid.apple.com",
];

// Extract the APP_URL hostname so local dev URLs are always allowed
const APP_HOSTNAME = (() => {
  try { return new URL(APP_URL).hostname; } catch { return ""; }
})();

function isAllowedUrl(url: string): boolean {
  if (url.startsWith("about:") || url.startsWith("data:") || url.startsWith("blob:")) {
    return true;
  }
  try {
    const { hostname } = new URL(url);
    if (hostname === APP_HOSTNAME) return true;
    return ALLOWED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function isOAuthUrl(url: string): boolean {
  try {
    return new URL(url).pathname.includes("/auth/v1/authorize");
  } catch {
    return false;
  }
}

function getErrorType(event: WebViewErrorEvent | WebViewHttpErrorEvent): ErrorType {
  const ne = event.nativeEvent;
  if ("statusCode" in ne && ne.statusCode >= 500) return "server";
  if ("description" in ne) {
    const desc = (ne.description || "").toLowerCase();
    if (desc.includes("net::") || desc.includes("nsurl") || desc.includes("network")) {
      return "offline";
    }
  }
  return "generic";
}

export default function Index() {
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [error, setError] = useState<{ type: ErrorType; title?: string; description?: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Pre-warm system browser for faster OAuth
  useEffect(() => {
    WebBrowser.warmUpAsync();
    return () => { WebBrowser.coolDownAsync(); };
  }, []);

  // Register for push notifications on mount
  useEffect(() => {
    registerForPushNotifications();
  }, []);

  // Handle notification taps → navigate WebView
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = response.notification.request.content.data?.route;
      if (route && typeof route === "string") {
        webViewRef.current?.injectJavaScript(
          `window.location.href = ${JSON.stringify(APP_URL + route)}; true;`
        );
      }
    });
    return () => subscription.remove();
  }, []);

  // Quick actions (home screen shortcuts)
  useQuickActions(
    useCallback((action) => {
      const route = QUICK_ACTION_ROUTES[action.id];
      if (route) {
        webViewRef.current?.injectJavaScript(
          `window.location.href = ${JSON.stringify(APP_URL + route)}; true;`
        );
      }
    }, [])
  );

  // OAuth in system browser
  const handleOAuthInSystemBrowser = useCallback(async (url: string) => {
    try {
      // Use custom scheme so ASWebAuthenticationSession (iOS) / Chrome Custom Tabs
      // (Android) can detect the redirect and hand control back to the app.
      const callbackUrl = "nextslide://auth-callback";
      const result = await WebBrowser.openAuthSessionAsync(url, callbackUrl);
      if (result.type === "success" && result.url) {
        // Convert scheme URL back to HTTPS for WebView navigation.
        // result.url is "nextslide://auth-callback#access_token=..." — extract the
        // fragment (or query string) and append it to the web auth-callback URL so
        // the existing AuthCallback page can process the tokens.
        const hashIdx = result.url.indexOf('#');
        const queryIdx = result.url.indexOf('?');
        let suffix = '';
        if (hashIdx !== -1) suffix = result.url.substring(hashIdx);
        else if (queryIdx !== -1) suffix = result.url.substring(queryIdx);
        const webUrl = APP_URL + "/auth-callback" + suffix;
        webViewRef.current?.injectJavaScript(
          `window.location.href = ${JSON.stringify(webUrl)}; true;`
        );
      }
    } catch {
      webViewRef.current?.injectJavaScript(
        `window.location.href = ${JSON.stringify(url)}; true;`
      );
    }
  }, []);

  // Android hardware back
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return;
      const onBackPress = () => {
        if (canGoBack && webViewRef.current) {
          webViewRef.current.goBack();
          return true;
        }
        return false;
      };
      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => subscription.remove();
    }, [canGoBack])
  );

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
  };

  const handleShouldStartLoadWithRequest = (event: WebViewNavigation) => {
    const { url } = event;
    if (isOAuthUrl(url)) {
      handleOAuthInSystemBrowser(url);
      return false;
    }
    if (isAllowedUrl(url)) return true;
    Linking.openURL(url);
    return false;
  };

  const handleLoadEnd = () => {
    setIsLoading(false);
    setRefreshing(false);
    hapticSuccess();
  };

  const handleError = (event: WebViewErrorEvent) => {
    const type = getErrorType(event);
    setError({ type, title: event.nativeEvent.description });
    setIsLoading(false);
  };

  const handleHttpError = (event: WebViewHttpErrorEvent) => {
    if (event.nativeEvent.statusCode >= 500) {
      setError({
        type: "server",
        title: `Server Error (${event.nativeEvent.statusCode})`,
      });
    }
  };

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    hapticMedium();
    webViewRef.current?.reload();
  };

  const handleRefresh = () => {
    setRefreshing(true);
    hapticMedium();
    webViewRef.current?.reload();
  };

  // Handle bridge messages from the web app
  const handleMessage = async (event: WebViewMessageEvent) => {
    try {
      const data: BridgeMessage = JSON.parse(event.nativeEvent.data);

      switch (data.type) {
        case "clipboard-write":
          await Clipboard.setStringAsync(data.text);
          break;
        case "haptic":
          hapticByStyle(data.style);
          break;
        case "share":
          if (data.data?.url || data.data?.title) {
            const { Share } = require("react-native");
            await Share.share({
              url: data.data.url,
              title: data.data.title,
              message: data.data.text,
            });
          }
          break;
        case "open-url":
          Linking.openURL(data.url);
          break;
        case "navigate":
          webViewRef.current?.injectJavaScript(
            `window.location.href = ${JSON.stringify(APP_URL + data.route)}; true;`
          );
          break;
        case "notification-permission":
          await registerForPushNotifications();
          break;
        default:
          break;
      }
    } catch {
      // Ignore malformed messages
    }
  };

  if (error) {
    return <ErrorScreen type={error.type} title={error.title} onRetry={handleRetry} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.webviewContainer}>
        {isLoading && <LoadingSkeleton />}
        <WebView
          ref={webViewRef}
          source={{ uri: APP_URL }}
          containerStyle={styles.webview}
          userAgent={APP_USER_AGENT}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          startInLoadingState={false}
          onLoadEnd={handleLoadEnd}
          onNavigationStateChange={handleNavigationStateChange}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          onError={handleError}
          onHttpError={handleHttpError}
          onMessage={handleMessage}
          injectedJavaScriptBeforeContentLoaded={INJECTED_PRELOAD_JS}
          injectedJavaScript={INJECTED_BRIDGE_JS}
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          scrollEnabled={true}
          overScrollMode="never"
          pullToRefreshEnabled={Platform.OS === "ios"}
          refreshControl={
            Platform.OS === "android" ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={BRAND_COLORS.accent}
                colors={[BRAND_COLORS.accent]}
                progressBackgroundColor={BRAND_COLORS.surface}
              />
            ) : undefined
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND_COLORS.background,
  },
  webviewContainer: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: BRAND_COLORS.background,
  },
});
