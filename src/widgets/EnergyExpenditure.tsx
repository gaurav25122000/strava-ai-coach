import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Flame } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { ChartBars } from '../components/charts';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Typography } from '../components/Typography';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { activityDayKey, localDateStr } from '../utils/dates';
import { useStore } from '../store/useStore';
import { useActivitySource } from '../services/activitySource';
import { EmptyHint } from './common';
import { bigStat, StatChip } from './_shared';

export const EnergyExpenditureWidget = memo(function EnergyExpenditureWidget() {
  const activities = useStore((s) => s.activities);
  const dailyHealth = useStore((s) => s.dailyHealth);
  const source = useActivitySource();

  const energy = useMemo(() => {
    const now = new Date();
    const days: { key: string; label: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      days.push({
        key: localDateStr(d),
        label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
      });
    }
    const byDay = new Map<string, number>(days.map((d) => [d.key, 0]));
    let hasEstimates = false;
    // Health source: the Watch's true all-day active energy beats summing
    // workout calories. Days without a rollup fall back to workout sums.
    const useDaily = source === 'health';
    const covered = new Set<string>();
    if (useDaily) {
      for (const d of days) {
        const kcal = dailyHealth[d.key]?.activeEnergy;
        if (kcal) {
          byDay.set(d.key, kcal);
          covered.add(d.key);
        }
      }
    }
    for (const a of activities) {
      const kcal = a.calories || 0;
      if (!kcal) continue;
      const k = activityDayKey(a);
      if (!byDay.has(k) || covered.has(k)) continue;
      byDay.set(k, (byDay.get(k) || 0) + kcal);
      if (a.caloriesEstimated) hasEstimates = true;
    }
    const bars = days.map((d) => ({ label: d.label, value: Math.round(byDay.get(d.key) || 0) }));
    const total = bars.reduce((s, b) => s + b.value, 0);
    return { bars, total, avg: Math.round(total / 7), hasEstimates };
  }, [activities, dailyHealth, source]);

  const family = WIDGET_FAMILY.EnergyExpenditure;
  const accent = familyStyle(family).accent;

  return (
    <WidgetCard
      family={family}
      title={WIDGET_TITLES.EnergyExpenditure}
      icon={Flame}
      caption={energy.hasEstimates ? '~ includes estimates' : 'last 7 days'}
    >
      {energy.total === 0 ? (
        <EmptyHint
          icon={Flame}
          family={family}
          text="No calories burned in the last 7 days — log an activity and sync to see your daily energy expenditure."
        />
      ) : (
        <>
          <View style={bigStat.row}>
            <View style={bigStat.numWrap}>
              <AnimatedNumber
                value={energy.total}
                prefix={energy.hasEstimates ? '~' : ''}
                style={[bigStat.num, { color: accent }] as any}
              />
              <Typography style={bigStat.unit}>kcal total</Typography>
            </View>
            <StatChip color={accent} icon={Flame} label={`${energy.avg} avg/day`} />
          </View>
          <View style={styles.chartWrap}>
            <ChartBars
              data={energy.bars}
              height={120}
              family={family}
              formatValue={(v) => `${Math.round(v)} kcal`}
            />
          </View>
        </>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  chartWrap: { marginVertical: 4 },
});
