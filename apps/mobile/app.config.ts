import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "NextSlide",
  slug: "nextslide",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "nextslide",
  userInterfaceStyle: "dark",
  notification: {
    icon: "./assets/images/icon.png",
    color: "#FF4301",
    androidMode: "default",
    androidCollapsedTitle: "NextSlide",
  },
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#000000",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "ai.nextslide.mobile",
    infoPlist: {
      UIBackgroundModes: ["remote-notification"],
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#000000",
    },
    package: "ai.nextslide.mobile",
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON || undefined,
  },
  web: {
    bundler: "metro",
    favicon: "./assets/images/favicon.png",
  },
  extra: {
    eas: {
      projectId: "1e84d7d8-e169-40a3-9b1a-5ed8860978b3",
    },
  },
  plugins: [
    "expo-router",
    [
      "expo-notifications",
      {
        icon: "./assets/images/icon.png",
        color: "#FF4301",
        sounds: [],
      },
    ],
  ],
});
