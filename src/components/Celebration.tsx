import React, { memo, useEffect, useMemo } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Milestone } from '../store/useStore';
import { BadgeMedal } from './BadgeMedal';
import { Typography } from '../components/Typography';
import { theme } from '../theme';

const PIECE_COLORS = [
  theme.colors.primary,
  theme.colors.accent,
  theme.colors.success,
  theme.colors.info,
  theme.colors.warning,
  theme.colors.families.social.accent,
];

const PIECE_COUNT = 26;
const DURATION = 1700;

// Deterministic pseudo-random per piece index — no Math.random so the burst
// renders identically on re-mounts (and stays testable).
function prand(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const ConfettiPiece = memo(function ConfettiPiece({ index, width }: { index: number; width: number }) {
  const progress = useSharedValue(0);
  const startX = prand(index, 1) * width;
  const drift = (prand(index, 2) - 0.5) * 140;
  const fall = 420 + prand(index, 3) * 380;
  const spin = (prand(index, 4) - 0.5) * 720;
  const size = 6 + prand(index, 5) * 7;
  const color = PIECE_COLORS[index % PIECE_COLORS.length];
  const delay = prand(index, 6) * 250;

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: DURATION, easing: Easing.out(Easing.quad) }));
  }, [progress, delay]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: startX + drift * progress.value },
      { translateY: -40 + fall * progress.value },
      { rotate: `${spin * progress.value}deg` },
    ],
    opacity: progress.value < 0.75 ? 1 : 1 - (progress.value - 0.75) / 0.25,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', top: 0, left: 0, width: size, height: size * 0.62, borderRadius: 2, backgroundColor: color },
        style,
      ]}
    />
  );
});

interface CelebrationProps {
  /** The freshly earned badge. Render nothing when null. */
  milestone: Milestone | null;
  onDone: () => void;
}

/**
 * Full-screen badge-unlock moment: confetti burst + medal zoom + label.
 * Auto-dismisses; tapping anywhere dismisses early.
 */
export function Celebration({ milestone, onDone }: CelebrationProps) {
  const { width } = useWindowDimensions();

  useEffect(() => {
    if (!milestone) return;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [milestone, onDone]);

  const pieces = useMemo(() => Array.from({ length: PIECE_COUNT }, (_, i) => i), []);

  if (!milestone) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(250)}
      style={[StyleSheet.absoluteFillObject, styles.overlay]}
      onTouchEnd={onDone}
    >
      {pieces.map((i) => (
        <ConfettiPiece key={i} index={i} width={width} />
      ))}
      <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.center}>
        <BadgeMedal milestone={milestone} unlocked size={92} hideLabel />
        <Typography style={styles.title}>Badge unlocked!</Typography>
        <Typography style={styles.name}>{milestone.title}</Typography>
        <Typography style={styles.desc}>{milestone.description}</Typography>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: theme.colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  center: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 32,
  },
  title: {
    ...theme.typography.label,
    color: theme.colors.warning,
    textTransform: 'uppercase',
    marginTop: 18,
  },
  name: {
    ...theme.typography.title,
    color: theme.colors.text,
    textAlign: 'center',
  },
  desc: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
