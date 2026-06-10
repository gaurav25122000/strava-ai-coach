import React, { memo, useCallback, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { CartesianChart, Bar, useChartPressState } from 'victory-native';
import { LinearGradient as SkLinearGradient, vec } from '@shopify/react-native-skia';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { theme, withAlpha } from '../../theme';
import { familyStyle, WidgetFamily } from '../../utils/widgetFamilies';
import { niceCeil } from '../../utils/downsample';
import { useChartFont } from './chartFonts';

export interface BarPoint {
  label: string;
  value: number;
}

interface ChartBarsProps {
  data: BarPoint[];
  height?: number;
  family?: WidgetFamily;
  color?: string;
  axes?: boolean;
  scrub?: boolean;
  formatValue?: (v: number) => string;
  /** 0..1 gap between bars (default 0.4 — roomy, premium spacing). */
  innerPadding?: number;
}

const PILL_W = 116;

/**
 * Skia bar chart with family-gradient fills, rounded caps, nice-number axes
 * and scrub-to-inspect. Buckets must be pre-aggregated (weekly/monthly) —
 * this component renders what it is given and never squeezes 100+ bars.
 */
export const ChartBars = memo(function ChartBars({
  data,
  height = 200,
  family = 'activity',
  color,
  axes = true,
  scrub = true,
  formatValue = (v) => `${Math.round(v)}`,
  innerPadding = 0.4,
}: ChartBarsProps) {
  const accent = color ?? familyStyle(family).accent;
  const font = useChartFont(10);
  const [chartW, setChartW] = useState(0);
  const [active, setActive] = useState<{ label: string; value: number } | null>(null);

  const { points, labels, domainY } = useMemo(() => {
    const pts = data.map((d, i) => ({ x: i, value: d.value }));
    const hi = Math.max(...data.map((d) => d.value), 0);
    return {
      points: pts,
      labels: data.map((d) => d.label),
      domainY: [0, niceCeil(hi || 1)] as [number, number],
    };
  }, [data]);

  const { state, isActive } = useChartPressState({ x: 0, y: { value: 0 } });

  const onIndexChange = useCallback(
    (idx: number) => {
      const i = Math.max(0, Math.min(points.length - 1, Math.round(idx)));
      const p = points[i];
      if (!p) return;
      setActive({ label: labels[i], value: p.value });
      if (Platform.OS !== 'web') Haptics.selectionAsync();
    },
    [points, labels],
  );

  useAnimatedReaction(
    () => (state.isActive.value ? state.matchedIndex.value : -1),
    (cur, prev) => {
      if (cur !== prev && cur >= 0) runOnJS(onIndexChange)(cur);
    },
    [onIndexChange],
  );

  const pillStyle = useAnimatedStyle(() => {
    const x = Math.min(Math.max(state.x.position.value - PILL_W / 2, 0), Math.max(chartW - PILL_W, 0));
    return {
      opacity: withTiming(isActive ? 1 : 0, { duration: 120 }),
      transform: [{ translateX: x }],
    };
  }, [isActive, chartW]);

  // X labels get sparse automatically when there are many buckets.
  const xTickCount = Math.min(points.length, points.length > 16 ? 6 : points.length);

  if (!points.length) return <View style={{ height }} />;

  return (
    <View
      style={{ height, position: 'relative' }}
      onLayout={(e) => setChartW(e.nativeEvent.layout.width)}
    >
      <CartesianChart
        data={points}
        xKey="x"
        yKeys={['value']}
        domain={{ y: domainY }}
        domainPadding={{ top: 14, left: 16, right: 16 }}
        chartPressState={scrub ? state : undefined}
        axisOptions={
          axes
            ? {
                font,
                tickCount: { x: xTickCount, y: 4 },
                labelColor: theme.colors.textSecondary,
                lineColor: theme.colors.divider,
                formatXLabel: (x) => labels[Math.round(Number(x))] ?? '',
                formatYLabel: (y) => formatValue(Number(y)),
              }
            : undefined
        }
      >
        {({ points: p, chartBounds }) => (
          <Bar
            points={p.value}
            chartBounds={chartBounds}
            innerPadding={innerPadding}
            roundedCorners={{ topLeft: 6, topRight: 6 }}
            animate={{ type: 'timing', duration: 300 }}
          >
            <SkLinearGradient
              start={vec(0, chartBounds.top)}
              end={vec(0, chartBounds.bottom)}
              colors={[accent, withAlpha(accent, 'medium')]}
            />
          </Bar>
        )}
      </CartesianChart>

      {scrub && active && (
        <Animated.View pointerEvents="none" style={[styles.pill, pillStyle]}>
          <Text style={styles.pillLabel} numberOfLines={1}>{active.label}</Text>
          <Text style={[styles.pillValue, { color: accent }]} numberOfLines={1}>
            {formatValue(active.value)}
          </Text>
        </Animated.View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: -8,
    width: PILL_W,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    ...theme.shadows.md,
  },
  pillLabel: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
  pillValue: {
    ...theme.typography.caption,
    fontFamily: theme.fonts.semibold,
    marginTop: 1,
  },
});
