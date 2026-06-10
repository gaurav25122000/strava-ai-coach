import React, { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Activity } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { ChartDonut, DonutSlice } from '../components/charts';
import { Typography } from '../components/Typography';
import { theme } from '../theme';
import { WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';
import { assignSportColors } from './_shared';

export const ActivityMixWidget = memo(function ActivityMixWidget() {
  const activities = useStore((s) => s.activities);

  const mix = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of activities) {
      counts[a.type] = (counts[a.type] || 0) + 1;
    }
    // Top 5 sports by count — the long tail would just shred the donut.
    const entries = Object.entries(counts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const colors = assignSportColors(entries.map((e) => e.type));
    const slices: DonutSlice[] = entries.map((e) => ({
      label: e.type,
      value: e.count,
      color: colors[e.type],
    }));
    return { slices, total: activities.length };
  }, [activities]);

  const family = WIDGET_FAMILY.ActivityMix;

  return (
    <WidgetCard family={family} title={WIDGET_TITLES.ActivityMix} icon={Activity}>
      {!mix.slices.length ? (
        <EmptyHint
          icon={Activity}
          family={family}
          text="No activities yet — connect Strava and sync to see how your training splits across sports."
        />
      ) : (
        <ChartDonut
          data={mix.slices}
          size={130}
          formatValue={(v) => `${Math.round(v)}×`}
        >
          <Typography style={styles.centerNum}>{mix.total}</Typography>
          <Typography style={styles.centerLbl}>total</Typography>
        </ChartDonut>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  centerNum: { fontSize: 18, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.4 },
  centerLbl: {
    fontSize: 9,
    color: theme.colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
