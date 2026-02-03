import React from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Circle } from "react-native-svg";
import { BRAND_COLORS, BRAND_RADIUS, BRAND_SHADOWS } from "../constants/brand";

export type ErrorType = "offline" | "server" | "generic";

type Props = {
  type: ErrorType;
  title?: string;
  description?: string;
  onRetry: () => void;
};

function ErrorIcon({ type }: { type: ErrorType }) {
  const size = 64;
  if (type === "offline") {
    return (
      <View style={styles.iconContainer}>
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path
            d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"
            stroke={BRAND_COLORS.accent}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    );
  }

  if (type === "server") {
    return (
      <View style={styles.iconContainer}>
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path
            d="M12 9v4M12 17h.01M4.93 4.93l14.14 14.14"
            stroke={BRAND_COLORS.accent}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <Circle cx={12} cy={12} r={10} stroke={BRAND_COLORS.accent} strokeWidth={1.5} />
        </Svg>
      </View>
    );
  }

  return (
    <View style={styles.iconContainer}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 9v4M12 17h.01"
          stroke={BRAND_COLORS.accent}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <Path
          d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
          stroke={BRAND_COLORS.accent}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const ERROR_CONTENT: Record<ErrorType, { title: string; description: string }> = {
  offline: {
    title: "No Connection",
    description: "Check your internet connection and try again.",
  },
  server: {
    title: "Server Error",
    description: "Something went wrong on our end. We're on it.",
  },
  generic: {
    title: "Something Went Wrong",
    description: "An unexpected error occurred. Please try again.",
  },
};

export function ErrorScreen({ type, title, description, onRetry }: Props) {
  const content = ERROR_CONTENT[type];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.inner}>
        <ErrorIcon type={type} />

        <Text style={styles.title}>{title ?? content.title}</Text>
        <Text style={styles.description}>{description ?? content.description}</Text>

        <Pressable
          style={({ pressed }) => [
            styles.retryButton,
            pressed && styles.retryButtonPressed,
          ]}
          onPress={onRetry}
        >
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
      </View>

      {/* Subtle border accent at bottom */}
      <View style={styles.bottomAccent} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND_COLORS.background,
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: BRAND_COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: BRAND_COLORS.surfaceBorder,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    color: BRAND_COLORS.text,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  description: {
    color: BRAND_COLORS.textSecondary,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  retryButton: {
    backgroundColor: BRAND_COLORS.accent,
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: BRAND_RADIUS.md,
    ...BRAND_SHADOWS.md,
  },
  retryButtonPressed: {
    backgroundColor: BRAND_COLORS.accentDark,
    transform: [{ scale: 0.97 }],
  },
  retryText: {
    color: BRAND_COLORS.text,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  bottomAccent: {
    height: 2,
    backgroundColor: BRAND_COLORS.accent,
    opacity: 0.3,
  },
});
