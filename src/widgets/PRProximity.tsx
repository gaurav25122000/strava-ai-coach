import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Crosshair } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { formatRaceTime } from '../utils/performance';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';

const RECENT_DAYS = 30;
const DISTANCES = [
  { meters: 1000, label: '1K' },
  { meters: 5000, label: '5K' },
  { meters: 10000, label: '10K' },
];
const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);

/**
 * How close current form is to each PB: best recent (30d) run pace projected
 * over the PB distance versus the stored record. Same avg-pace estimation the
 * best-efforts engine uses, so the comparison is apples to apples.
 */
export const PRProximityWidget = memo(function PRProximityWidget() {
  const activities = useStore((s) => s.activities);
  const bestEfforts = useStore((s) => s.bestEfforts);

  const rows = useMemo(() => {
    const cutoff = Date.now() - RECENT_DAYS * 86_400_000;
    const recentRuns = activities.filter(
      (a) =>
        RUN_TYPES.has(a.type) &&
        a.averageSpeed > 0 &&
        new Date(a.startDate).getTime() >= cutoff,
    );
    return DISTANCES.filter((d) => bestEfforts[d.meters]).map((d) => {
      const pb = bestEfforts[d.meters];
      // Only runs long enough to plausibly hold the pace over this distance.
      const qualifying = recentRuns.filter((a) => a.distance >= d.meters * 0.9);
      let recentBest = Infinity;
      for (const a of qualifying) {
        const t = (d.meters / a.averageSpeed);
        if (t < recentBest) recentBest = t;
      }
      const gap = isFinite(recentBest) ? Math.round(recentBest - pb.time) : null;
      return { ...d, pb, recentBest: isFinite(recentBest) ? Math.round(recentBest) : null, gap };
    });
  }, [activities, bestEfforts]);

  const family = WIDGET_FAMILY.PRProximity;
  const accent = familyStyle(family).accent;
  const hasRecent = rows.some((r) => r.recentBest != null);

  return (
    <WidgetCard
      family={family}
      title={WIDGET_TITLES.PRProximity}
      icon={Crosshair}
      caption={`recent ${RECENT_DAYS}d form vs your records`}
    >
      {!rows.length ? (
        <EmptyHint
          icon={Crosshair}
          family={family}
          text="Set a 1K, 5K or 10K best first — then this tracks how close your current form is to beating it."
        />
      ) : !hasRecent ? (
        <EmptyHint
          icon={Crosshair}
          family={family}
          text={`No runs in the last ${RECENT_DAYS} days — get out for one and see how close you are to your records.`}
        />
      ) : (
        rows.map((r, i) => {
          let chip = { label: 'no recent run', color: theme.colors.textSecondary };
          if (r.gap != null) {
            const pct = r.gap / r.pb.time;
            chip =
              r.gap <= 0
                ? { label: 'PB pace!', color: theme.colors.success }
                : pct <= 0.05
                  ? { label: `+${formatRaceTime(r.gap)} · in reach`, color: theme.colors.success }
                  : pct <= 0.15
                    ? { label: `+${formatRaceTime(r.gap)} · close`, color: theme.colors.warning }
                    : { label: `+${formatRaceTime(r.gap)} off`, color: theme.colors.textSecondary };
          }
          return (
            <View key={r.meters} style={[styles.row, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={[styles.pill, { backgroundColor: withAlpha(accent, 'tint') }]}>
                <Typography style={[styles.pillTxt, { color: accent }]}>{r.label}</Typography>
              </View>
              <View style={styles.body}>
                <Typography style={styles.time}>{formatRaceTime(r.pb.time)}</Typography>
                <Typography style={styles.sub}>
                  {r.recentBest != null ? `recent best ~${formatRaceTime(r.recentBest)}` : 'no qualifying recent run'}
                </Typography>
              </View>
              <View style={[styles.chip, { backgroundColor: withAlpha(chip.color, 'tint') }]}>
                <Typography style={[styles.chipTxt, { color: chip.color }]} numberOfLines={1}>
                  {chip.label}
                </Typography>
              </View>
            </View>
          );
        })
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.divider,
  },
  pill: {
    width: 46,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
  },
  pillTxt: {
    ...theme.typography.caption,
  },
  body: { flex: 1 },
  time: {
    ...theme.typography.numericSm,
    color: theme.colors.text,
  },
  sub: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
    maxWidth: 130,
  },
  chipTxt: {
    ...theme.typography.micro,
    fontWeight: '800',
  },
});
