import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Activity, Minus, TrendingDown, TrendingUp } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { ChartLine } from '../components/charts';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Typography } from '../components/Typography';
import { theme, withAlpha } from '../theme';
import { WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { activityDayKey, localDateStr, mondayOf, weekKey } from '../utils/dates';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';
import { bigStat, StatChip } from './_shared';

// Run-ish sport_types. Strava reports run cadence as one-foot steps/min, so
// ×2 gives total spm — but ONLY for runs (ride cadence is already rpm; the old
// screen doubled everything).
const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);

// Gauge geometry: 140–200 spm scale with the 170–180 optimal band.
const GAUGE_MIN = 140;
const GAUGE_MAX = 200;
const OPT_LOW = 170;
const OPT_HIGH = 180;

export const CadenceWidget = memo(function CadenceWidget() {
  const activities = useStore((s) => s.activities);

  const stats = useMemo(() => {
    // Sort newest → oldest so "recent" really means recent regardless of the
    // store's insertion order.
    const runs = activities
      .filter((a) => RUN_TYPES.has(a.type) && (a.averageCadence || 0) > 0)
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    if (!runs.length) return null;
    const last4w = runs.filter(
      (a) => (Date.now() - new Date(a.startDate).getTime()) / 86400000 <= 28,
    );
    if (!last4w.length) return null;
    const avg = Math.round(
      last4w.reduce((s, a) => s + (a.averageCadence || 0), 0) / last4w.length,
    );
    const spm = avg * 2;
    const trend =
      runs.length > 1
        ? (() => {
            const half = Math.max(1, Math.min(5, Math.floor(runs.length / 2)));
            const recent = runs.slice(0, half).reduce((s, a) => s + (a.averageCadence || 0), 0) / half;
            const olderCount = Math.max(1, runs.length - half);
            const older = runs.slice(half).reduce((s, a) => s + (a.averageCadence || 0), 0) / olderCount;
            return recent > older ? 'up' : recent < older - 1 ? 'down' : 'flat';
          })()
        : 'flat';
    return { spm, trend };
  }, [activities]);

  // 8-week avg-spm-per-week sparkline, bucketed by canonical week keys.
  const sparkline = useMemo(() => {
    const byWeek = new Map<string, { sum: number; n: number }>();
    for (const a of activities) {
      if (!RUN_TYPES.has(a.type) || !(a.averageCadence && a.averageCadence > 0)) continue;
      const k = weekKey(new Date(activityDayKey(a)));
      const cur = byWeek.get(k) ?? { sum: 0, n: 0 };
      cur.sum += a.averageCadence * 2;
      cur.n++;
      byWeek.set(k, cur);
    }
    const monday = mondayOf(new Date());
    const out: { label: string; value: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(monday);
      d.setDate(d.getDate() - i * 7);
      const k = localDateStr(d);
      const w = byWeek.get(k);
      out.push({ label: k, value: w ? Math.round(w.sum / w.n) : 0 });
    }
    return out;
  }, [activities]);

  const family = WIDGET_FAMILY.Cadence;

  if (!stats) {
    return (
      <WidgetCard family={family} title={WIDGET_TITLES.Cadence} icon={Activity}>
        <EmptyHint
          icon={Activity}
          family={family}
          text="No run cadence in the last 4 weeks — record runs with a cadence-capable watch or footpod to track steps per minute."
        />
      </WidgetCard>
    );
  }

  const { spm, trend } = stats;
  const isOptimal = spm >= OPT_LOW && spm <= OPT_HIGH;
  const isLow = spm < OPT_LOW;
  const cadColor = isOptimal
    ? theme.colors.success
    : isLow
      ? theme.colors.warning
      : theme.colors.accent;
  const cadLabel = isOptimal ? 'Optimal' : isLow ? 'Below target' : 'Above target';
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  const fillPct = Math.min(100, Math.max(0, ((spm - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * 100));
  const optStart = ((OPT_LOW - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * 100;
  const optEnd = ((OPT_HIGH - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * 100;

  return (
    <WidgetCard family={family} title={WIDGET_TITLES.Cadence} icon={Activity} caption="runs · last 4 weeks">
      <View style={bigStat.row}>
        <View style={bigStat.numWrap}>
          <AnimatedNumber value={spm} style={[bigStat.num, { color: cadColor }] as any} />
          <Typography style={bigStat.unit}>spm</Typography>
        </View>
        <StatChip color={cadColor} icon={TrendIcon} label={cadLabel} />
      </View>

      {sparkline.some((d) => d.value > 0) ? (
        <View style={styles.sparkWrap}>
          <ChartLine
            data={sparkline}
            height={56}
            family="health"
            color={cadColor}
            axes={false}
            scrub={false}
          />
        </View>
      ) : null}

      <View style={styles.gaugeTrack}>
        <View style={[styles.optZone, { left: `${optStart}%`, width: `${optEnd - optStart}%` }]} />
        <View
          style={[
            styles.marker,
            { left: `${Math.max(0, Math.min(97, fillPct))}%`, backgroundColor: cadColor },
          ]}
        />
      </View>
      <View style={styles.labelsRow}>
        <Typography style={styles.labelTxt}>{GAUGE_MIN}</Typography>
        <Typography style={[styles.labelTxt, { color: theme.colors.success }]}>
          Optimal {OPT_LOW}–{OPT_HIGH}
        </Typography>
        <Typography style={styles.labelTxt}>{GAUGE_MAX}</Typography>
      </View>
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  sparkWrap: { overflow: 'hidden', marginVertical: 4 },
  gaugeTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.background,
    overflow: 'hidden',
    position: 'relative',
    marginTop: 8,
  },
  optZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: withAlpha(theme.colors.success, 'medium'),
  },
  marker: { position: 'absolute', top: 0, bottom: 0, width: 4, borderRadius: 2 },
  labelsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  labelTxt: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: '700' },
});
