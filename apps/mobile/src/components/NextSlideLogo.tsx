import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Line } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { BRAND_COLORS } from "../constants/brand";

const AnimatedLine = Animated.createAnimatedComponent(Line);

type Props = {
  size?: number;
  animate?: boolean;
  color?: string;
};

/**
 * Animated NextSlide X logo mark.
 * Two crossing strokes that draw in and pulse with a subtle glow.
 */
export function NextSlideLogo({ size = 64, animate = true, color = BRAND_COLORS.accent }: Props) {
  const progress = useSharedValue(animate ? 0 : 1);
  const glow = useSharedValue(0);

  React.useEffect(() => {
    if (!animate) return;
    progress.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) });
    glow.value = withDelay(
      600,
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0.3, { duration: 600 })
      )
    );
  }, [animate]);

  const strokeWidth = Math.max(3, size * 0.09);
  const pad = size * 0.15;

  const line1Props = useAnimatedProps(() => ({
    strokeDashoffset: interpolate(progress.value, [0, 1], [size * 2, 0]),
  }));

  const line2Props = useAnimatedProps(() => ({
    strokeDashoffset: interpolate(progress.value, [0, 0.3, 1], [size * 2, size * 2, 0]),
  }));

  const containerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [1, 1]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [1, 1.05]) }],
  }));

  return (
    <Animated.View style={[styles.container, { width: size, height: size }, containerStyle]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <AnimatedLine
          x1={pad}
          y1={pad}
          x2={size - pad}
          y2={size - pad}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${size * 2}`}
          animatedProps={line1Props}
        />
        <AnimatedLine
          x1={size - pad}
          y1={pad}
          x2={pad}
          y2={size - pad}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${size * 2}`}
          animatedProps={line2Props}
        />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
});
