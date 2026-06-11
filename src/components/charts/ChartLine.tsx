import React, { memo, useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CartesianChart, Line, Area, useChartPressState } from 'victory-native';
import {
  Circle,
  DashPathEffect,
  LinearGradient as SkLinearGradient,
  Line as SkLine,
  vec,
} from '@shopify/react-native-skia';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import { theme, withAlpha } from '../../theme';
import { familyStyle, WidgetFamily } from '../../utils/widgetFamilies';
import { lttb, MAX_CHART_POINTS, niceCeil, niceFloor } from '../../utils/downsample';
import { useChartFont } from './chartFonts';

export interface LinePoint {
  /** X-axis caption for this point ("Mar 4", "W12"…). */
  label: string;
  value: number;
  /** Optional second series (e.g. HR overlay, CTL vs ATL). */
  value2?: number;
}

interface ChartLineProps {
  data: LinePoint[];
  height?: number;
  family?: WidgetFamily;
  /** Solid colour override for the primary line; defaults to family accent. */
  color?: string;
  /** Colour for the optional second series. */
  color2?: string;
  /** Gradient fill under the primary line. Default true. */
  area?: boolean;
  /** Hide axes/grid for sparkline use. Default true. */
  axes?: boolean;
  /** Finger scrubbing with a value pill. Default true (off for sparklines). */
  scrub?: boolean;
  curve?: 'natural' | 'linear' | 'monotoneX';
  /** Value formatter for the y-axis and the scrub pill. */
  formatValue?: (v: number) => string;
  /** Y domain includes zero (default). Set false for signed series like TSB. */
  fromZero?: boolean;
  /** Max rendered points; longer series are LTTB-downsampled. */
  maxPoints?: number;
}

const PILL_W = 116;

/**
 * The app's line chart: Skia-rendered, family-gradient area fill, nice-number
 * axes, finger scrub with a date+value pill and haptic ticks. Series longer
 * than `maxPoints` are LTTB-downsampled before they ever reach Skia.
 */
export const ChartLine = memo(function ChartLine({
  data,
  height = 200,
  family = 'activity',
  color,
  color2,
  area = true,
  axes = true,
  scrub = axes,
  curve = 'natural',
  formatValue = (v) => `${Math.round(v)}`,
  fromZero = true,
  maxPoints = MAX_CHART_POINTS,
}: ChartLineProps) {
  const accent = color ?? familyStyle(family).accent;
  const secondary = color2 ?? theme.colors.textSecondary;
  const font = useChartFont(10);
  const [chartW, setChartW] = useState(0);
  const [active, setActive] = useState<{ label: string; value: number; value2?: number } | null>(null);

  const { points, labels, hasSecond, domainY } = useMemo(() => {
    const capped = lttb(data.map((d, i) => ({ x: i, y: d.value, d })), maxPoints);
    const pts = capped.map((p, i) => ({
      x: i,
      value: p.d.value,
      value2: p.d.value2 ?? 0,
    }));
    const lbls = capped.map((p) => p.d.label);
    const second = capped.some((p) => p.d.value2 !== undefined);
    const all = capped.flatMap((p) => (p.d.value2 !== undefined ? [p.d.value, p.d.value2] : [p.d.value]));
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const yMin = fromZero ? Math.min(0, niceFloor(lo)) : niceFloor(lo === hi ? lo - 1 : lo);
    const yMax = niceCeil(hi === yMin ? hi + 1 : hi);
    return { points: pts, labels: lbls, hasSecond: second, domainY: [yMin, yMax] as [number, number] };
  }, [data, maxPoints, fromZero]);

  const { state, isActive } = useChartPressState({ x: 0, y: { value: 0, value2: 0 } });

  const onIndexChange = useCallback(
    (idx: number) => {
      const i = Math.max(0, Math.min(points.length - 1, Math.round(idx)));
      const p = points[i];
      if (!p) return;
      setActive({ label: labels[i], value: p.value, value2: hasSecond ? p.value2 : undefined });
    },
    [points, labels, hasSecond],
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

  const scrubLineP1 = useDerivedValue(() => vec(state.x.position.value, 10));
  const scrubLineP2 = useDerivedValue(() => vec(state.x.position.value, height - (axes ? 22 : 0)));

  if (points.length < 2) return <View style={{ height }} />;

  return (
    <View
      style={{ height, position: 'relative' }}
      onLayout={(e) => setChartW(e.nativeEvent.layout.width)}
    >
      <CartesianChart
        data={points}
        xKey="x"
        yKeys={hasSecond ? ['value', 'value2'] : ['value']}
        domain={{ y: domainY }}
        domainPadding={{ top: 14, left: 2, right: 2 }}
        chartPressState={scrub ? state : undefined}
        axisOptions={
          axes
            ? {
                font,
                tickCount: { x: Math.min(points.length, 5), y: 4 },
                labelColor: theme.colors.textSecondary,
                lineColor: theme.colors.divider,
                formatXLabel: (x) => labels[Math.round(Number(x))] ?? '',
                formatYLabel: (y) => formatValue(Number(y)),
              }
            : undefined
        }
      >
        {({ points: p, chartBounds }) => (
          <>
            {area && (
              <Area points={p.value} y0={chartBounds.bottom} curveType={curve} animate={{ type: 'timing', duration: 300 }}>
                <SkLinearGradient
                  start={vec(0, chartBounds.top)}
                  end={vec(0, chartBounds.bottom)}
                  colors={[withAlpha(accent, 'strong'), withAlpha(accent, 'faint')]}
                />
              </Area>
            )}
            {hasSecond && (
              <Line
                points={p.value2}
                color={secondary}
                strokeWidth={2}
                curveType={curve}
                opacity={0.8}
                animate={{ type: 'timing', duration: 300 }}
              >
                <DashPathEffect intervals={[6, 5]} />
              </Line>
            )}
            <Line
              points={p.value}
              color={accent}
              strokeWidth={2.5}
              strokeCap="round"
              curveType={curve}
              animate={{ type: 'timing', duration: 300 }}
            />
            {scrub && isActive && (
              <>
                <SkLine p1={scrubLineP1} p2={scrubLineP2} color={withAlpha(accent, 'heavy')} strokeWidth={1}>
                  <DashPathEffect intervals={[4, 4]} />
                </SkLine>
                <Circle cx={state.x.position} cy={state.y.value.position} r={6} color={accent} />
                <Circle cx={state.x.position} cy={state.y.value.position} r={2.6} color={theme.colors.background} />
                {hasSecond && (
                  <Circle cx={state.x.position} cy={state.y.value2.position} r={4.5} color={secondary} />
                )}
              </>
            )}
          </>
        )}
      </CartesianChart>

      {scrub && active && (
        <Animated.View pointerEvents="none" style={[styles.pill, pillStyle]}>
          <Text style={styles.pillLabel} numberOfLines={1}>{active.label}</Text>
          <Text style={[styles.pillValue, { color: accent }]} numberOfLines={1}>
            {formatValue(active.value)}
            {active.value2 !== undefined ? `  ·  ${formatValue(active.value2)}` : ''}
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
