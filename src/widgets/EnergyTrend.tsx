import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { TrendingDown, TrendingUp, Activity } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { EmptyHint } from './common';
import { StatChip } from './_shared';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { calorieWeekSeries } from '../services/calories';
import { useStore } from '../store/useStore';

const DAYS = 14;
const BAR_H = 96; // half-height above and below the zero axis

/**
 * Fourteen days of net energy (eaten − Strava burn) as bars around a zero
 * axis: green deficit days below, orange surplus days above. The cumulative
 * total is translated into an estimated weight delta (≈7,700 kcal per kg).
 */
export const EnergyTrendWidget = memo(function EnergyTrendWidget() {
  const foodLog = useStore((s) => s.foodLog);
  const activities = useStore((s) => s.activities);

  const days = useMemo(
    () => calorieWeekSeries(foodLog, activities, DAYS),
    [foodLog, activities],
  );
  // Only days with intake logged are meaningful — a burn-only day would
  // read as a giant "deficit" just because no meals were entered.
  const logged = days.filter((d) => d.eaten > 0);
  const hasData = logged.length > 0;

  const nets = days.map((d) => ({ ...d, net: d.eaten > 0 ? d.eaten - d.burned : 0 }));
  const maxAbs = Math.max(...nets.map((d) => Math.abs(d.net)), 1);
  const totalNet = nets.reduce((s, d) => s + d.net, 0);
  const kgDelta = totalNet / 7700;
  const deficit = totalNet < 0;

  const fam = familyStyle('health');
  const surplusColor = theme.colors.families.activity.accent;
  const deficitColor = fam.accent;

  return (
    <WidgetCard
      family={WIDGET_FAMILY['EnergyTrend']}
      title={WIDGET_TITLES['EnergyTrend']}
      icon={Activity}
      caption="net kcal · last 14 days"
      action={
        hasData ? (
          <StatChip
            color={deficit ? deficitColor : surplusColor}
            icon={deficit ? TrendingDown : TrendingUp}
            label={`${deficit ? '' : '+'}${Math.round(totalNet)} kcal`}
          />
        ) : undefined
      }
    >
      {!hasData ? (
        <EmptyHint
          icon={Activity}
          family="health"
          text="Log meals for a few days to see your surplus/deficit trend."
        />
      ) : (
        <>
          <View style={styles.chart}>
            <View style={styles.zeroAxis} />
            {nets.map((d) => {
              const h = Math.max(d.net === 0 ? 0 : 3, (Math.abs(d.net) / maxAbs) * BAR_H);
              const up = d.net > 0;
              return (
                <View key={d.day} style={styles.col}>
                  <View style={styles.halfTop}>
                    {up && (
                      <View style={[styles.bar, { height: h, backgroundColor: surplusColor }]} />
                    )}
                  </View>
                  <View style={styles.halfBottom}>
                    {!up && d.net !== 0 && (
                      <View style={[styles.bar, { height: h, backgroundColor: deficitColor }]} />
                    )}
                  </View>
                </View>
              );
            })}
          </View>
          <View style={styles.footer}>
            <Typography style={styles.footTxt}>
              {logged.length} of {DAYS} days logged
            </Typography>
            <Typography style={[styles.footEst, { color: deficit ? deficitColor : surplusColor }]}>
              ≈ {kgDelta > 0 ? '+' : ''}{kgDelta.toFixed(1)} kg trend
            </Typography>
          </View>
        </>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  chart: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: BAR_H * 2 + 8,
    gap: 4,
    position: 'relative',
  },
  zeroAxis: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
    backgroundColor: withAlpha(theme.colors.border, 'heavy'),
  },
  col: {
    flex: 1,
  },
  halfTop: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 1,
  },
  halfBottom: {
    flex: 1,
    paddingTop: 1,
  },
  bar: {
    width: '100%',
    borderRadius: 3,
    opacity: 0.9,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  footTxt: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
  footEst: {
    ...theme.typography.micro,
    fontFamily: theme.fonts.bold,
  },
});
