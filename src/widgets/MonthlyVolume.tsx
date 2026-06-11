import React, { memo, useMemo } from 'react';
import { View } from 'react-native';
import { BarChart3, TrendingDown, TrendingUp } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Typography } from '../components/Typography';
import { ChartBars } from '../components/charts';
import { theme } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';
import { monthlyKmBuckets } from './_format';
import { StatChip, bigStat } from './_shared';

/**
 * Current-month km with a delta chip vs last month, over a 12-month
 * scrubbable Skia bar chart.
 */
export const MonthlyVolumeWidget = memo(function MonthlyVolumeWidget() {
  const activities = useStore((s) => s.activities);

  const months = useMemo(() => monthlyKmBuckets(activities, 12), [activities]);
  const chartData = useMemo(
    // Append the 2-digit year so a 12-month span reads unambiguously
    // ("Jul ’25 … Jun ’26") — the bucket key is YYYY-MM.
    () => months.map((m) => ({ label: `${m.label} ’${m.key.slice(2, 4)}`, value: m.km })),
    [months],
  );

  const current = months[months.length - 1]?.km ?? 0;
  const prev = months[months.length - 2]?.km ?? 0;
  const deltaPct = prev > 0 ? Math.round(((current - prev) / prev) * 100) : current > 0 ? 100 : 0;
  const up = deltaPct >= 0;
  const trendColor = up ? theme.colors.success : theme.colors.error;
  const hasData = months.some((m) => m.km > 0);

  return (
    <WidgetCard
      family={WIDGET_FAMILY.MonthlyVolume}
      title={WIDGET_TITLES.MonthlyVolume}
      icon={BarChart3}
      caption="last 12 months"
    >
      {!hasData ? (
        <EmptyHint
          icon={BarChart3}
          family={WIDGET_FAMILY.MonthlyVolume}
          text="No distance in the last 12 months — sync Strava activities to fill this chart."
        />
      ) : (
        <>
          <View style={bigStat.row}>
            <View style={bigStat.numWrap}>
              <AnimatedNumber
                value={current}
                style={[bigStat.num, { color: familyStyle('activity').accent }] as any}
              />
              <Typography style={bigStat.unit}>km this month</Typography>
            </View>
            <StatChip
              color={trendColor}
              icon={up ? TrendingUp : TrendingDown}
              label={`${up ? '+' : ''}${deltaPct}% vs last`}
            />
          </View>
          <ChartBars
            data={chartData}
            height={180}
            family="activity"
            scrub
            formatValue={(v) => `${Math.round(v)} km`}
          />
        </>
      )}
    </WidgetCard>
  );
});
