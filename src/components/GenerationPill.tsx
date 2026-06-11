import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeInUp,
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sparkles } from 'lucide-react-native';
import { useStore } from '../store/useStore';
import { GENERATING_MESSAGES } from '../services/goalGeneration';
import { Typography } from './Typography';
import { Pulsing } from './Pulsing';
import { theme, withAlpha } from '../theme';
import { familyStyle } from '../utils/widgetFamilies';

const BAR_W = 110;

/**
 * Floating, non-blocking status pill shown above the tab bar while the AI
 * coach builds a plan in the background — the user keeps full run of the app.
 */
export function GenerationPill() {
  const gen = useStore((s) => s.goalGeneration);
  const insets = useSafeAreaInsets();
  const [msgIdx, setMsgIdx] = useState(0);

  const sweep = useSharedValue(0);
  useEffect(() => {
    if (!gen) return;
    setMsgIdx(0);
    sweep.value = 0;
    sweep.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
      -1,
    );
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % GENERATING_MESSAGES.length), 2600);
    return () => clearInterval(t);
  }, [gen, sweep]);

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -BAR_W + sweep.value * (BAR_W * 2 + 200) }],
  }));

  if (!gen) return null;

  const fam = familyStyle('plan');
  const tabBarH = 60 + Math.max(insets.bottom, 12);

  return (
    <Animated.View
      entering={FadeInUp.duration(theme.motion.base)}
      exiting={FadeOutDown.duration(theme.motion.base)}
      pointerEvents="none"
      style={[styles.wrap, { bottom: tabBarH + 10 }]}
    >
      <View style={styles.pill}>
        <Pulsing maxScale={1.12} duration={900}>
          <LinearGradient
            colors={fam.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <Sparkles size={15} color={theme.colors.onAccent} />
          </LinearGradient>
        </Pulsing>
        <View style={styles.body}>
          <Typography style={styles.title} numberOfLines={1}>
            Building “{gen.title}” plan
          </Typography>
          <Typography style={styles.sub} numberOfLines={1}>
            {GENERATING_MESSAGES[msgIdx]}
          </Typography>
        </View>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.bar, { backgroundColor: fam.accent }, barStyle]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    ...theme.shadows.md,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  title: {
    ...theme.typography.footnote,
    fontFamily: theme.fonts.bold,
    color: theme.colors.text,
  },
  sub: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  track: {
    height: 3,
    backgroundColor: withAlpha(theme.colors.border, 'strong'),
    overflow: 'hidden',
  },
  bar: {
    width: BAR_W,
    height: 3,
    borderRadius: 2,
  },
});
