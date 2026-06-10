import React, { memo, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Pie, PolarChart } from 'victory-native';
import * as Haptics from 'expo-haptics';
import { theme } from '../../theme';
import { PressableScale } from '../PressableScale';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface ChartDonutProps {
  data: DonutSlice[];
  /** Diameter of the donut. Default 150. */
  size?: number;
  /** Inner hole as a fraction of the radius. Default 0.66. */
  innerRadius?: number;
  /** Center content (big number, caption…). */
  children?: React.ReactNode;
  /** Render the tappable legend under the chart. Default true. */
  legend?: boolean;
  formatValue?: (v: number) => string;
}

/**
 * Skia donut for composition data (activity mix, sport split, time-in-zone).
 * Slices have a hairline angular inset so segments read as separate; tapping
 * a legend row highlights its share. Replaces the gifted-charts PieChart.
 */
export const ChartDonut = memo(function ChartDonut({
  data,
  size = 150,
  innerRadius = 0.66,
  children,
  legend = true,
  formatValue = (v) => `${Math.round(v)}`,
}: ChartDonutProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  const clean = useMemo(() => data.filter((d) => d.value > 0), [data]);

  if (!clean.length || total <= 0) return null;

  const onLegendPress = (i: number) => {
    setSelected((cur) => (cur === i ? null : i));
    if (Platform.OS !== 'web') Haptics.selectionAsync();
  };

  const shown = selected !== null ? clean[selected] : null;

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <PolarChart
          data={clean.map((d, i) => ({
            label: d.label,
            value: d.value,
            color: selected === null || selected === i ? d.color : d.color + '44',
          }))}
          labelKey="label"
          valueKey="value"
          colorKey="color"
        >
          <Pie.Chart innerRadius={`${innerRadius * 100}%`} startAngle={-90}>
            {() => (
              <>
                <Pie.Slice animate={{ type: 'timing', duration: 300 }} />
                <Pie.SliceAngularInset
                  angularInset={{ angularStrokeWidth: 2, angularStrokeColor: theme.colors.surface }}
                />
              </>
            )}
          </Pie.Chart>
        </PolarChart>
        <View pointerEvents="none" style={styles.center}>
          {shown ? (
            <>
              <Text style={styles.centerValue}>{Math.round((shown.value / total) * 100)}%</Text>
              <Text style={styles.centerLabel} numberOfLines={1}>{shown.label}</Text>
            </>
          ) : (
            children
          )}
        </View>
      </View>

      {legend && (
        <View style={styles.legend}>
          {clean.map((d, i) => (
            <PressableScale
              key={d.label}
              onPress={() => onLegendPress(i)}
              style={[styles.legendRow, selected === i && styles.legendRowActive]}
            >
              <View style={[styles.dot, { backgroundColor: d.color }]} />
              <Text style={styles.legendLabel} numberOfLines={1}>{d.label}</Text>
              <Text style={styles.legendValue}>{formatValue(d.value)}</Text>
            </PressableScale>
          ))}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerValue: {
    ...theme.typography.numericSm,
    color: theme.colors.text,
  },
  centerLabel: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 2,
    maxWidth: 80,
  },
  legend: {
    flex: 1,
    gap: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  legendRowActive: {
    backgroundColor: theme.colors.divider,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  legendLabel: {
    ...theme.typography.footnote,
    color: theme.colors.text,
    flex: 1,
  },
  legendValue: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});
