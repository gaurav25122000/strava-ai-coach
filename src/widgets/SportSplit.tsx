import React, { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { PieChart as PieChartIcon } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { ChartDonut, DonutSlice } from '../components/charts';
import { Typography } from '../components/Typography';
import { theme } from '../theme';
import { WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { activityDayKey } from '../utils/dates';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';
import { assignSportColors } from './_shared';

export const SportSplitWidget = memo(function SportSplitWidget() {
  const activities = useStore((s) => s.activities);

  const split = useMemo(() => {
    const year = String(new Date().getFullYear());
    const totals: Record<string, number> = {};
    for (const a of activities) {
      // Year by the athlete's wall clock, not the UTC instant.
      if (!activityDayKey(a).startsWith(year)) continue;
      totals[a.type] = (totals[a.type] || 0) + a.distance / 1000;
    }
    const entries = Object.entries(totals)
      .map(([type, km]) => ({ type, km: Math.round(km) }))
      .filter((e) => e.km > 0)
      .sort((a, b) => b.km - a.km);
    const colors = assignSportColors(entries.map((e) => e.type));
    const slices: DonutSlice[] = entries.map((e) => ({
      label: e.type,
      value: e.km,
      color: colors[e.type],
    }));
    const total = entries.reduce((s, e) => s + e.km, 0);
    return { slices, total };
  }, [activities]);

  const family = WIDGET_FAMILY.SportSplit;

  return (
    <WidgetCard
      family={family}
      title={WIDGET_TITLES.SportSplit}
      icon={PieChartIcon}
      caption={`${new Date().getFullYear()} · km`}
    >
      {!split.slices.length ? (
        <EmptyHint
          icon={PieChartIcon}
          family={family}
          text="No distance logged this year yet — sync your activities to see how the kilometres split across sports."
        />
      ) : (
        <ChartDonut
          data={split.slices}
          size={130}
          formatValue={(v) => `${Math.round(v)} km`}
        >
          <Typography style={styles.centerNum}>{split.total}</Typography>
          <Typography style={styles.centerLbl}>km YTD</Typography>
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
