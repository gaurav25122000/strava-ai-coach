import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react-native';
import { format } from 'date-fns';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { ChartLine } from '../components/charts';
import { EmptyHint } from './common';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { activityDayKey, formatPace, localDateStr, mondayOf, weekKey } from '../utils/dates';
import { useStore } from '../store/useStore';

// A pace delta below this (min/km) reads as noise, not a trend.
const TREND_EPSILON = 0.05;

/**
 * Average run pace per week over the last 8 weeks. Weeks with no runs are
 * skipped (fewer, honest points) instead of being back-filled with a
 * fabricated value like the old inline widget did.
 */
export const PaceTrendWidget = memo(function PaceTrendWidget() {
  const activities = useStore((s) => s.activities);

  const weeks = useMemo(() => {
    const byWeek = new Map<string, { sum: number; n: number }>();
    for (const a of activities) {
      if (a.type !== 'Run' || a.averageSpeed <= 0) continue;
      const key = weekKey(new Date(activityDayKey(a)));
      const bucket = byWeek.get(key) ?? { sum: 0, n: 0 };
      bucket.sum += 1000 / a.averageSpeed / 60;
      bucket.n += 1;
      byWeek.set(key, bucket);
    }
    const out: { label: string; pace: number }[] = [];
    const thisMonday = mondayOf(new Date());
    for (let i = 7; i >= 0; i--) {
      const monday = new Date(thisMonday);
      monday.setDate(monday.getDate() - i * 7);
      const bucket = byWeek.get(localDateStr(monday));
      if (!bucket) continue; // skip empty weeks — no fabricated points
      out.push({ label: format(monday, 'MMM d'), pace: bucket.sum / bucket.n });
    }
    return out;
  }, [activities]);

  const { latest, first, best, avg } = useMemo(() => {
    if (!weeks.length) return { latest: 0, first: 0, best: 0, avg: 0 };
    return {
      latest: weeks[weeks.length - 1].pace,
      first: weeks[0].pace,
      best: Math.min(...weeks.map((w) => w.pace)),
      avg: weeks.reduce((s, w) => s + w.pace, 0) / weeks.length,
    };
  }, [weeks]);

  // Lower pace = faster, so a falling line is good news.
  const improving = weeks.length >= 2 && latest < first - TREND_EPSILON;
  const slowing = weeks.length >= 2 && latest > first + TREND_EPSILON;
  const trendColor = improving
    ? theme.colors.success
    : slowing
      ? theme.colors.error
      : theme.colors.textSecondary;
  const TrendIcon = improving ? TrendingDown : slowing ? TrendingUp : Minus;
  const trendLabel = improving ? 'Improving' : slowing ? 'Slowing' : 'Stable';

  const accent = familyStyle('records').accent;

  return (
    <WidgetCard
      family={WIDGET_FAMILY['PaceTrend']}
      title={WIDGET_TITLES['PaceTrend']}
      icon={TrendingUp}
      action={
        weeks.length >= 2 ? (
          <View style={[styles.trendChip, { backgroundColor: withAlpha(trendColor === theme.colors.textSecondary ? accent : trendColor, 'tint') }]}>
            <TrendIcon color={trendColor} size={11} />
            <Typography style={[styles.trendChipTxt, { color: trendColor }]}>{trendLabel}</Typography>
          </View>
        ) : undefined
      }
    >
      {weeks.length < 2 ? (
        <EmptyHint
          icon={TrendingUp}
          family="records"
          text="Run in at least two different weeks to see your pace trend take shape."
        />
      ) : (
        <>
          <View style={styles.bigRow}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Typography style={[styles.bigNum, { color: improving ? theme.colors.success : accent }]}>
                {formatPace(latest)}
              </Typography>
              <Typography style={styles.bigUnit}>/km latest</Typography>
            </View>
          </View>
          <ChartLine
            data={weeks.map((w) => ({ label: w.label, value: Number(w.pace.toFixed(2)) }))}
            height={160}
            family="records"
            curve="monotoneX"
            formatValue={formatPace}
            fromZero={false}
          />
          <View style={styles.legendRow}>
            <Typography style={styles.legendItem}>
              Best{' '}
              <Typography style={[styles.legendVal, { color: theme.colors.success }]}>
                {formatPace(best)}/km
              </Typography>
            </Typography>
            <Typography style={styles.legendItem}>
              Avg{' '}
              <Typography style={styles.legendVal}>{formatPace(avg)}/km</Typography>
            </Typography>
          </View>
        </>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  trendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  trendChipTxt: {
    ...theme.typography.micro,
  },
  bigRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  bigNum: {
    ...theme.typography.numeric,
  },
  bigUnit: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
    marginLeft: 6,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  legendItem: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
  },
  legendVal: {
    ...theme.typography.footnote,
    color: theme.colors.text,
    fontFamily: theme.fonts.semibold,
  },
});
