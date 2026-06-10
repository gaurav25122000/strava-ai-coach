import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Activity as ActivityGlyph,
  BarChart3,
  CalendarDays,
  Clock,
  Heart,
  MapPin,
  Mountain,
} from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { activityDayKey, formatPace } from '../utils/dates';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';
import { formatDuration, paceMinPerKm } from './_format';
import { StatChip, bigStat } from './_shared';

/**
 * Lifetime rollup over the synced history. The old screen ran four separate
 * reduces inside a render IIFE — this is ONE memoised pass producing every
 * tile plus best run pace.
 */
export const AllTimeStatsWidget = memo(function AllTimeStatsWidget() {
  const activities = useStore((s) => s.activities);

  const stats = useMemo(() => {
    let time = 0;
    let elev = 0;
    let km = 0;
    let topElev = 0;
    let hrSum = 0;
    let hrCount = 0;
    let bestPaceMin = Infinity;
    const days = new Set<string>();
    for (const a of activities) {
      time += a.movingTime;
      elev += a.totalElevationGain;
      km += a.distance / 1000;
      if (a.totalElevationGain > topElev) topElev = a.totalElevationGain;
      days.add(activityDayKey(a));
      if ((a.averageHeartRate || 0) > 0) {
        hrSum += a.averageHeartRate!;
        hrCount++;
      }
      const isRun = a.type === 'Run' || a.type === 'TrailRun' || a.type === 'VirtualRun';
      if (isRun && a.averageSpeed > 0) {
        const pace = paceMinPerKm(a.averageSpeed);
        if (pace > 0 && pace < bestPaceMin) bestPaceMin = pace;
      }
    }
    return {
      totalKm: Math.round(km),
      totalTime: time,
      totalElev: Math.round(elev),
      topElev: Math.round(topElev),
      count: activities.length,
      daysActive: days.size,
      avgHR: hrCount ? Math.round(hrSum / hrCount) : 0,
      bestPace: isFinite(bestPaceMin) ? formatPace(bestPaceMin) : '0:00',
    };
  }, [activities]);

  const accent = familyStyle('activity').accent;
  const tiles = [
    { icon: MapPin, val: `${stats.totalKm}`, unit: 'km', lbl: 'Total km' },
    { icon: Clock, val: formatDuration(stats.totalTime), unit: '', lbl: 'Total time' },
    { icon: Mountain, val: `${stats.totalElev}`, unit: 'm', lbl: 'Elev climbed' },
    { icon: ActivityGlyph, val: `${stats.count}`, unit: '', lbl: 'Activities' },
    { icon: CalendarDays, val: `${stats.daysActive}`, unit: '', lbl: 'Days active' },
    { icon: Heart, val: stats.avgHR ? `${stats.avgHR}` : '--', unit: stats.avgHR ? 'bpm' : '', lbl: 'Avg HR' },
  ];

  return (
    <WidgetCard
      family={WIDGET_FAMILY.AllTimeStats}
      title={WIDGET_TITLES.AllTimeStats}
      icon={BarChart3}
    >
      {activities.length === 0 ? (
        <EmptyHint
          icon={BarChart3}
          family={WIDGET_FAMILY.AllTimeStats}
          text="No activities yet — sync Strava to roll up your all-time stats."
        />
      ) : (
        <>
          <View style={bigStat.row}>
            <View style={bigStat.numWrap}>
              <Typography style={[bigStat.num, { color: accent }]}>{stats.bestPace}</Typography>
              <Typography style={bigStat.unit}>/km best pace</Typography>
            </View>
            <StatChip color={accent} icon={Mountain} label={`Top elev ${stats.topElev} m`} />
          </View>
          <View style={styles.grid}>
            {tiles.map((t) => {
              const Icon = t.icon;
              return (
                <View key={t.lbl} style={styles.tile}>
                  <View style={[styles.tileIcon, { backgroundColor: withAlpha(accent, 'tint') }]}>
                    <Icon color={accent} size={13} />
                  </View>
                  <Typography style={styles.tileVal}>
                    {t.val}
                    {t.unit ? <Typography style={styles.tileUnit}> {t.unit}</Typography> : null}
                  </Typography>
                  <Typography style={styles.tileLbl}>{t.lbl}</Typography>
                </View>
              );
            })}
          </View>
        </>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tile: {
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    padding: 10,
    gap: 4,
  },
  tileIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileVal: {
    fontSize: 15,
    fontWeight: '900',
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  tileUnit: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  tileLbl: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
});
