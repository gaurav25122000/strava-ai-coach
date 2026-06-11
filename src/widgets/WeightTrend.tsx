import React, { memo, useMemo } from 'react';
import { View } from 'react-native';
import { Scale } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { ChartLine, LinePoint } from '../components/charts';
import { EmptyHint } from './common';
import { bigStat, StatChip } from './_shared';
import { theme } from '../theme';
import { WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { formatWeightDelta, weightTrend } from '../services/calories';
import { useStore } from '../store/useStore';

const DAYS = 30;

/**
 * Latest weigh-in with the 30-day delta and a sparkline of recent entries.
 * The delta stays neutral-coloured — whether it's good depends on whether
 * the athlete is cutting or bulking, and the app doesn't get to decide.
 */
export const WeightTrendWidget = memo(function WeightTrendWidget() {
  const weightLog = useStore((s) => s.weightLog);

  const trend = useMemo(() => weightTrend(weightLog, DAYS), [weightLog]);

  const spark: LinePoint[] = useMemo(
    () =>
      (trend?.entries ?? [])
        .slice(-DAYS)
        .map((e) => ({ label: e.date, value: e.kg })),
    [trend],
  );

  return (
    <WidgetCard
      family={WIDGET_FAMILY['WeightTrend']}
      title={WIDGET_TITLES['WeightTrend']}
      icon={Scale}
      caption={`last ${DAYS} days`}
    >
      {!trend ? (
        <EmptyHint
          icon={Scale}
          family="health"
          text="Log a weigh-in from the Calorie Tracker to start your trend."
        />
      ) : (
        <>
          <View style={bigStat.row}>
            <View style={bigStat.numWrap}>
              <AnimatedNumber value={trend.current.kg} decimals={1} style={bigStat.num as any} />
              <Typography style={bigStat.unit}>kg</Typography>
            </View>
            {trend.deltaKg !== null && (
              <StatChip
                color={theme.colors.textSecondary}
                label={formatWeightDelta(trend.deltaKg, DAYS)}
              />
            )}
          </View>
          {trend.entries.length >= 2 && (
            <ChartLine
              data={spark}
              height={70}
              family="health"
              axes={false}
              scrub={false}
              area
              fromZero={false}
            />
          )}
        </>
      )}
    </WidgetCard>
  );
});
