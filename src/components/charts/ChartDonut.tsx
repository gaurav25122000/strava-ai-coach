import React, { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { theme, withAlpha } from '../../theme';
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

const START_DEG = -90;
const GAP_DEG = 3.5;

interface ArcSpec {
  startDeg: number;
  sweepDeg: number;
  color: string;
  /** Fraction of the full revealed sweep where this arc starts/ends (0-1). */
  revealFrom: number;
  revealTo: number;
}

/**
 * One animated ring segment. The master `progress` value sweeps 0→1 around
 * the dial; each arc trims itself in once the sweep reaches its span, so the
 * ring draws clockwise as a single continuous motion.
 */
function DonutArc({
  spec,
  radius,
  strokeWidth,
  center,
  progress,
  dimmed,
  emphasized,
}: {
  spec: ArcSpec;
  radius: number;
  strokeWidth: number;
  center: number;
  progress: { value: number };
  dimmed: boolean;
  emphasized: boolean;
}) {
  const path = useMemo(() => {
    const p = Skia.Path.Make();
    p.addArc(
      {
        x: center - radius,
        y: center - radius,
        width: radius * 2,
        height: radius * 2,
      },
      spec.startDeg,
      spec.sweepDeg,
    );
    return p;
  }, [center, radius, spec.startDeg, spec.sweepDeg]);

  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withTiming(dimmed ? 0.28 : 1, { duration: theme.motion.base });
  }, [dimmed, opacity]);

  const end = useDerivedValue(() => {
    const span = spec.revealTo - spec.revealFrom;
    if (span <= 0) return 0;
    const local = (progress.value - spec.revealFrom) / span;
    return Math.min(1, Math.max(0, local));
  });

  return (
    <Path
      path={path}
      style="stroke"
      strokeWidth={emphasized ? strokeWidth + 3 : strokeWidth}
      strokeCap={spec.sweepDeg >= 8 ? 'round' : 'butt'}
      color={spec.color}
      opacity={opacity}
      start={0}
      end={end}
    />
  );
}

/**
 * Hand-drawn Skia donut for composition data (activity mix, sport split,
 * time-in-zone): faint full track, rounded gapped segments that sweep in
 * clockwise on mount, legend taps dim the rest and surface the share in the
 * center.
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

  const strokeWidth = (size / 2) * (1 - innerRadius);
  const center = size / 2;
  // Inset by the emphasis bump so a selected ring never clips the canvas.
  const radius = center - strokeWidth / 2 - 2;

  const arcs = useMemo<ArcSpec[]>(() => {
    if (!clean.length || total <= 0) return [];
    const gap = clean.length > 1 ? GAP_DEG : 0;
    const usable = 360 - gap * clean.length;
    let cursor = START_DEG + gap / 2;
    let revealed = 0;
    return clean.map((d) => {
      const sweep = (d.value / total) * usable;
      const frac = d.value / total;
      const spec: ArcSpec = {
        startDeg: cursor,
        sweepDeg: sweep,
        color: d.color,
        revealFrom: revealed,
        revealTo: revealed + frac,
      };
      cursor += sweep + gap;
      revealed += frac;
      return spec;
    });
  }, [clean, total]);

  const trackPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(center, center, radius);
    return p;
  }, [center, radius]);

  // Re-run the sweep whenever the composition itself changes.
  const signature = useMemo(
    () => clean.map((d) => `${d.label}:${d.value}`).join('|'),
    [clean],
  );
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: 750, easing: Easing.out(Easing.cubic) });
  }, [signature, progress]);

  if (!clean.length || total <= 0) return null;

  const onLegendPress = (i: number) => {
    setSelected((cur) => (cur === i ? null : i));
  };

  const shown = selected !== null ? clean[selected] : null;

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Canvas style={{ width: size, height: size }}>
          <Path
            path={trackPath}
            style="stroke"
            strokeWidth={strokeWidth}
            color={withAlpha(theme.colors.border, 'medium')}
          />
          {arcs.map((spec, i) => (
            <DonutArc
              key={`${clean[i].label}-${i}`}
              spec={spec}
              radius={radius}
              strokeWidth={strokeWidth}
              center={center}
              progress={progress}
              dimmed={selected !== null && selected !== i}
              emphasized={selected === i}
            />
          ))}
        </Canvas>
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
          {clean.map((d, i) => {
            const active = selected === i;
            const pct = Math.round((d.value / total) * 100);
            return (
              <PressableScale
                key={d.label}
                onPress={() => onLegendPress(i)}
                style={[
                  styles.legendRow,
                  active && [styles.legendRowActive, { borderColor: withAlpha(d.color, 'strong') }],
                ]}
              >
                <View style={[styles.dot, { backgroundColor: d.color }, active && styles.dotActive]} />
                <View style={styles.legendBody}>
                  <Text style={styles.legendLabel} numberOfLines={1}>{d.label}</Text>
                  <Text style={styles.legendPct}>{pct}%</Text>
                </View>
                <Text style={[styles.legendValue, active && { color: theme.colors.text }]}>
                  {formatValue(d.value)}
                </Text>
              </PressableScale>
            );
          })}
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
    gap: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  legendRowActive: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  dotActive: {
    transform: [{ scale: 1.25 }],
  },
  legendBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  legendLabel: {
    ...theme.typography.footnote,
    color: theme.colors.text,
    flexShrink: 1,
  },
  legendPct: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
  legendValue: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});
