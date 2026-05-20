import React, { useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { theme } from '../theme';
import { Typography } from './Typography';
import { Card } from './Card';

export type ChartRange = '7d' | '30d' | '3m' | '1y' | 'all';

export const RANGE_DAYS: Record<ChartRange, number> = {
  '7d': 7,
  '30d': 30,
  '3m': 90,
  '1y': 365,
  all: Infinity,
};

interface ChartCardProps {
  title: string;
  icon?: React.ReactNode;
  accent?: string;
  range?: ChartRange;
  onRangeChange?: (r: ChartRange) => void;
  ranges?: ChartRange[];
  compareEnabled?: boolean;
  onCompareToggle?: (v: boolean) => void;
  compareLabel?: string;
  empty?: boolean;
  emptyText?: string;
  zoomable?: boolean;
  children: React.ReactNode;
}

const RANGE_LABELS: Record<ChartRange, string> = {
  '7d': '7D',
  '30d': '30D',
  '3m': '3M',
  '1y': '1Y',
  all: 'All',
};

export const ChartCard = ({
  title,
  icon,
  accent = theme.colors.primary,
  range,
  onRangeChange,
  ranges = ['30d', '3m', '1y', 'all'],
  compareEnabled,
  onCompareToggle,
  compareLabel = 'Compare',
  empty,
  emptyText = 'Need more activities to chart this.',
  zoomable,
  children,
}: ChartCardProps) => {
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startTx = useSharedValue(0);

  const reset = () => {
    scale.value = withSpring(1, theme.motion.spring);
    translateX.value = withSpring(0, theme.motion.spring);
  };

  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onStart(() => {
        startScale.value = scale.value;
      })
      .onUpdate((e) => {
        const next = startScale.value * e.scale;
        scale.value = Math.max(1, Math.min(4, next));
      });

    const pan = Gesture.Pan()
      .minPointers(1)
      .maxPointers(2)
      .onStart(() => {
        startTx.value = translateX.value;
      })
      .onUpdate((e) => {
        translateX.value = startTx.value + e.translationX;
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd(() => {
        runOnJS(Haptics.selectionAsync)();
        scale.value = withSpring(1, theme.motion.spring);
        translateX.value = withSpring(0, theme.motion.spring);
      });

    return Gesture.Simultaneous(pinch, pan, doubleTap);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scale: scale.value }],
  }));

  const body = empty ? (
    <View style={styles.emptyWrap}>
      <Typography variant="caption" color={theme.colors.textSecondary}>
        {emptyText}
      </Typography>
    </View>
  ) : zoomable ? (
    <GestureDetector gesture={gesture}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </GestureDetector>
  ) : (
    <>{children}</>
  );

  return (
    <Card variant="elevated" style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          {icon ? (
            <View style={[styles.iconChip, { backgroundColor: accent + '22' }]}>{icon}</View>
          ) : null}
          <Typography variant="subtitle" color={theme.colors.text}>
            {title}
          </Typography>
        </View>
        {range && onRangeChange ? (
          <View style={styles.rangeRow}>
            {ranges.map((r) => {
              const selected = r === range;
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onRangeChange(r);
                  }}
                  style={[
                    styles.rangePill,
                    selected && { backgroundColor: accent + '33', borderColor: accent },
                  ]}
                >
                  <Typography
                    variant="caption"
                    color={selected ? accent : theme.colors.textSecondary}
                  >
                    {RANGE_LABELS[r]}
                  </Typography>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>
      {onCompareToggle ? (
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            onCompareToggle(!compareEnabled);
          }}
          style={[
            styles.compareChip,
            compareEnabled && { backgroundColor: accent + '22', borderColor: accent },
          ]}
        >
          <Typography variant="caption" color={compareEnabled ? accent : theme.colors.textSecondary}>
            {compareEnabled ? `${compareLabel} on` : compareLabel}
          </Typography>
        </TouchableOpacity>
      ) : null}
      <View style={styles.body}>{body}</View>
      {zoomable && !empty ? (
        <TouchableOpacity onPress={reset} style={styles.resetHint}>
          <Typography variant="caption" color={theme.colors.textSecondary}>
            Pinch to zoom · double-tap to reset
          </Typography>
        </TouchableOpacity>
      ) : null}
    </Card>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginBottom: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  iconChip: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 4,
  },
  rangePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  compareChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  body: {
    overflow: 'hidden',
  },
  emptyWrap: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetHint: {
    marginTop: theme.spacing.xs,
    alignItems: 'center',
  },
});
