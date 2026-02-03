import React, { useEffect } from "react";
import { StyleSheet, Text, View, Image, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { BRAND_COLORS } from "../constants/brand";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Use the actual brand X PNG
const BRAND_X = require("../../assets/images/nextslide-x.png");

type Props = {
  isReady: boolean;
  onAnimationComplete: () => void;
};

/**
 * Full-screen animated splash overlay.
 * Shows the actual NextSlide X logo, "NEXTSLIDE" wordmark fading up,
 * a subtle loading bar, then fades out when isReady=true.
 */
export function AnimatedSplash({ isReady, onAnimationComplete }: Props) {
  const logoScale = useSharedValue(0.8);
  const logoOpacity = useSharedValue(0);
  const wordmarkOpacity = useSharedValue(0);
  const wordmarkTranslateY = useSharedValue(12);
  const barWidth = useSharedValue(0);
  const containerOpacity = useSharedValue(1);

  // Entrance animation
  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 400 });
    logoScale.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.back(1.2)) });
    wordmarkOpacity.value = withDelay(500, withTiming(1, { duration: 400 }));
    wordmarkTranslateY.value = withDelay(500, withTiming(0, { duration: 400 }));
    barWidth.value = withDelay(300, withTiming(0.6, { duration: 1500, easing: Easing.inOut(Easing.quad) }));
  }, []);

  // Exit animation when ready
  useEffect(() => {
    if (!isReady) return;
    barWidth.value = withTiming(1, { duration: 300 });
    containerOpacity.value = withDelay(
      400,
      withSequence(
        withTiming(0, { duration: 400, easing: Easing.in(Easing.quad) }),
        withTiming(0, { duration: 1 }, () => {
          runOnJS(onAnimationComplete)();
        })
      )
    );
  }, [isReady]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
    transform: [{ translateY: wordmarkTranslateY.value }],
  }));

  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value * 100}%` as any,
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]} pointerEvents="none">
      <View style={styles.content}>
        {/* The actual NextSlide brand X */}
        <Animated.View style={logoStyle}>
          <Image source={BRAND_X} style={styles.brandX} resizeMode="contain" />
        </Animated.View>

        <Animated.View style={[styles.wordmarkContainer, wordmarkStyle]}>
          <Text style={styles.wordmarkLeft}>NE</Text>
          <View style={styles.wordmarkXContainer}>
            <Image source={BRAND_X} style={styles.wordmarkXImage} resizeMode="contain" />
          </View>
          <Text style={styles.wordmarkRight}>TSLIDE</Text>
        </Animated.View>
      </View>

      {/* Loading bar */}
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, barStyle]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BRAND_COLORS.background,
    zIndex: 100,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    alignItems: "center",
    gap: 24,
  },
  brandX: {
    width: 72,
    height: 72,
  },
  wordmarkContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  wordmarkLeft: {
    fontWeight: "900",
    fontSize: 22,
    color: BRAND_COLORS.text,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  wordmarkXContainer: {
    width: 28,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: -2,
  },
  wordmarkXImage: {
    width: 28,
    height: 36,
  },
  wordmarkRight: {
    fontWeight: "900",
    fontSize: 22,
    color: BRAND_COLORS.text,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  barTrack: {
    position: "absolute",
    bottom: 80,
    left: SCREEN_WIDTH * 0.25,
    right: SCREEN_WIDTH * 0.25,
    height: 2,
    backgroundColor: BRAND_COLORS.surfaceBorder,
    borderRadius: 1,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: BRAND_COLORS.accent,
    borderRadius: 1,
  },
});
