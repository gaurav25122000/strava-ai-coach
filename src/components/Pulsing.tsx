import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';

interface PulsingProps {
  children: React.ReactNode;
  minScale?: number;
  maxScale?: number;
  duration?: number;
}

// Wraps children in a subtle breathing pulse. Use sparingly — meant for hero
// elements like the streak flame, not whole cards.
export const Pulsing = ({
  children,
  minScale = 1,
  maxScale = 1.12,
  duration = 1200,
}: PulsingProps) => {
  const scale = useSharedValue(minScale);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(maxScale, { duration, easing: Easing.inOut(Easing.quad) }),
        withTiming(minScale, { duration, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [minScale, maxScale, duration]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
};
