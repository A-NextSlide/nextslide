import React, { useEffect } from "react";
import { StyleSheet, View, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from "react-native-reanimated";
import { BRAND_COLORS } from "../constants/brand";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

/**
 * Shimmer loading skeleton that mimics a presentation app layout.
 * Shows while the WebView is loading behind the scenes.
 */
export function LoadingSkeleton() {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.3, 0.7]),
  }));

  return (
    <View style={styles.container}>
      {/* Header bar skeleton */}
      <View style={styles.header}>
        <Animated.View style={[styles.headerLogo, shimmerStyle]} />
        <View style={styles.headerRight}>
          <Animated.View style={[styles.headerBtn, shimmerStyle]} />
          <Animated.View style={[styles.headerAvatar, shimmerStyle]} />
        </View>
      </View>

      {/* Hero area */}
      <View style={styles.heroArea}>
        <Animated.View style={[styles.heroTitle, shimmerStyle]} />
        <Animated.View style={[styles.heroSubtitle, shimmerStyle]} />
        <Animated.View style={[styles.heroButton, shimmerStyle]} />
      </View>

      {/* Card grid */}
      <View style={styles.grid}>
        {[0, 1, 2, 3].map((i) => (
          <Animated.View key={i} style={[styles.card, shimmerStyle]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BRAND_COLORS.background,
    zIndex: 2,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 48,
    marginBottom: 32,
  },
  headerLogo: {
    width: 100,
    height: 20,
    borderRadius: 4,
    backgroundColor: BRAND_COLORS.surfaceElevated,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerBtn: {
    width: 70,
    height: 32,
    borderRadius: 8,
    backgroundColor: BRAND_COLORS.surfaceElevated,
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BRAND_COLORS.surfaceElevated,
  },
  heroArea: {
    alignItems: "center",
    gap: 12,
    marginBottom: 40,
    paddingTop: 20,
  },
  heroTitle: {
    width: SCREEN_WIDTH * 0.7,
    height: 28,
    borderRadius: 6,
    backgroundColor: BRAND_COLORS.surfaceElevated,
  },
  heroSubtitle: {
    width: SCREEN_WIDTH * 0.5,
    height: 16,
    borderRadius: 4,
    backgroundColor: BRAND_COLORS.surfaceElevated,
  },
  heroButton: {
    width: 160,
    height: 44,
    borderRadius: 10,
    backgroundColor: BRAND_COLORS.surfaceElevated,
    marginTop: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  card: {
    width: (SCREEN_WIDTH - 52) / 2,
    height: 120,
    borderRadius: 12,
    backgroundColor: BRAND_COLORS.surfaceElevated,
  },
});
