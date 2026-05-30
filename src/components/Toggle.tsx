import React, { useEffect } from 'react';
import { Pressable, Platform, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  interpolateColor,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { theme } from '../theme';

interface ToggleProps {
  value: boolean;
  onValueChange: (v: boolean) => void;
  /** On-state track + glow colour. Defaults to the orange primary. */
  accent?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
}

const TRACK_W = 52;
const TRACK_H = 30;
const PAD = 3;
const THUMB = TRACK_H - PAD * 2; // 24
const TRAVEL = TRACK_W - THUMB - PAD * 2; // 22

/**
 * Spring-animated toggle matching the app's motion + family-colour language.
 * The thumb springs across, the track colour fades to `accent`, and an accent
 * glow blooms in the on state. Replaces the stock platform Switch so on/off
 * feels native to this design system. Fires a selection haptic on change.
 */
export function Toggle({ value, onValueChange, accent = theme.colors.primary, disabled, accessibilityLabel }: ToggleProps) {
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, { damping: 16, stiffness: 220, mass: 0.7 });
  }, [value, progress]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [0, TRAVEL]) }],
  }));

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['rgba(255,255,255,0.12)', accent]),
    shadowOpacity: withTiming(value ? 0.55 : 0, { duration: theme.motion.fast }),
  }));

  const handlePress = () => {
    if (disabled) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    onValueChange(!value);
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Animated.View style={[styles.track, { shadowColor: accent }, trackStyle]}>
        <Animated.View style={[styles.thumb, thumbStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    padding: PAD,
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    elevation: 2,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 3,
  },
});
