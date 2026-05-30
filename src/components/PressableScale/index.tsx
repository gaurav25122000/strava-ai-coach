import React, { useCallback } from 'react';
import { Pressable, PressableProps, Platform, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /** Pressed scale factor. Default 0.97. */
  scaleTo?: number;
  /** Haptic intensity for press-in. Default 'selection'. */
  haptic?: 'selection' | 'light' | 'medium' | 'heavy' | 'none';
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

// Reusable pressable wrapper that springs to `scaleTo` on press-in and back to
// 1.0 on release, plus fires a soft haptic. Built on Reanimated worklets so the
// scale runs off the JS thread. Use everywhere a TouchableOpacity is just
// providing tap feedback for a card / row / chip.
export function PressableScale({
  scaleTo = 0.97,
  haptic = 'selection',
  onPressIn,
  onPressOut,
  onPress,
  style,
  children,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback((e: any) => {
    scale.value = withSpring(scaleTo, { damping: 18, stiffness: 320, mass: 0.6 });
    if (haptic !== 'none' && Platform.OS !== 'web') {
      // selectionAsync is the lightest click; fall back to impact for explicit weights.
      if (haptic === 'selection') Haptics.selectionAsync();
      else if (haptic === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      else if (haptic === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      else if (haptic === 'heavy') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    onPressIn?.(e);
  }, [scale, scaleTo, haptic, onPressIn]);

  const handlePressOut = useCallback((e: any) => {
    scale.value = withSpring(1, { damping: 16, stiffness: 280, mass: 0.6 });
    onPressOut?.(e);
  }, [scale, onPressOut]);

  return (
    <AnimatedPressable
      {...rest}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle]}
    >
      {children as any}
    </AnimatedPressable>
  );
}
