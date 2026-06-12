import React, { memo, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TrendingUp, Trophy } from 'lucide-react-native';
import { format } from 'date-fns';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { PressableScale } from '../components/PressableScale';
import { ChartLine } from '../components/charts';
import { EmptyHint } from './common';
import { StatChip } from './_shared';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { formatRaceTime } from '../utils/performance';
import { monthlyBestSeries } from '../services/effortsHistory';
import { useStore } from '../store/useStore';

const DISTANCES: { meters: number; label: string }[] = [
  { meters: 1000, label: '1K' },
  { meters: 5000, label: '5K' },
  { meters: 10000, label: '10K' },
];

/** 'YYYY-MM' → "Mar 26" style chart label. */
function monthLabel(month: string): string {
  return format(new Date(`${month}-01T00:00:00`), 'MMM yy');
}

/**
 * Month-by-month fastest estimated 1K/5K/10K time — the long arc of getting
 * quicker, using the same estimation as the PersonalBests tiles.
 */
export const PBProgressionWidget = memo(function PBProgressionWidget() {
  const activities = useStore((s) => s.activities);
  const [meters, setMeters] = useState(5000);

  const series = useMemo(() => monthlyBestSeries(activities, meters), [activities, meters]);

  // All-time PB across the series + the month it was set.
  const pb = useMemo(() => {
    let best: { month: string; seconds: number } | null = null;
    for (const p of series) {
      if (!best || p.seconds < best.seconds) best = p;
    }
    return best;
  }, [series]);

  const family = WIDGET_FAMILY.PBProgression;
  const accent = familyStyle(family).accent;

  return (
    <WidgetCard
      family={family}
      title={WIDGET_TITLES.PBProgression}
      icon={TrendingUp}
      action={
        <View style={styles.toggle}>
          {DISTANCES.map((d) => (
            <PressableScale
              key={d.meters}
              onPress={() => setMeters(d.meters)}
              style={[
                styles.togglePill,
                meters === d.meters && {
                  backgroundColor: withAlpha(accent, 'tint'),
                  borderColor: withAlpha(accent, 'strong'),
                },
              ]}
            >
              <Typography style={[styles.toggleTxt, meters === d.meters && { color: accent }]}>
                {d.label}
              </Typography>
            </PressableScale>
          ))}
        </View>
      }
    >
      {series.length < 2 ? (
        <EmptyHint
          icon={TrendingUp}
          family={family}
          text="Run this distance in at least two different months to chart your PB progression."
        />
      ) : (
        <>
          {pb && (
            <View style={styles.pbRow}>
              <StatChip
                color={accent}
                icon={Trophy}
                label={`PB ${formatRaceTime(pb.seconds)} · ${monthLabel(pb.month)}`}
              />
            </View>
          )}
          <ChartLine
            data={series.map((p) => ({ label: monthLabel(p.month), value: p.seconds }))}
            height={160}
            family={family}
            curve="monotoneX"
            formatValue={(v) => formatRaceTime(Math.round(v))}
            fromZero={false}
          />
          <Typography style={styles.footnote}>
            Fastest estimated {DISTANCES.find((d) => d.meters === meters)?.label} per month, from
            average run pace
          </Typography>
        </>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    gap: 4,
  },
  togglePill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  toggleTxt: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
  pbRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  footnote: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
});
