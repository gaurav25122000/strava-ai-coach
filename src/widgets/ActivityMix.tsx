import React, { memo, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Activity } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { ChartDonut, DonutSlice } from '../components/charts';
import { Typography } from '../components/Typography';
import { PressableScale } from '../components/PressableScale';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';
import { assignSportColors } from './_shared';

type Mode = 'count' | 'km';

/**
 * One donut, two lenses on the same question — "what do I actually do?":
 * session counts or kilometres per sport, toggled inline. Absorbs the old
 * SportSplit widget, which duplicated this card with a km donut.
 */
export const ActivityMixWidget = memo(function ActivityMixWidget() {
  const activities = useStore((s) => s.activities);
  const [mode, setMode] = useState<Mode>('count');

  const mix = useMemo(() => {
    const counts: Record<string, number> = {};
    const kms: Record<string, number> = {};
    for (const a of activities) {
      counts[a.type] = (counts[a.type] || 0) + 1;
      kms[a.type] = (kms[a.type] || 0) + a.distance / 1000;
    }
    const source = mode === 'count' ? counts : kms;
    // Top 5 sports — the long tail would just shred the donut.
    const entries = Object.entries(source)
      .map(([type, value]) => ({ type, value: Math.round(value) }))
      .filter((e) => e.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    const colors = assignSportColors(entries.map((e) => e.type));
    const slices: DonutSlice[] = entries.map((e) => ({
      label: e.type,
      value: e.value,
      color: colors[e.type],
    }));
    const total =
      mode === 'count'
        ? activities.length
        : Math.round(Object.values(kms).reduce((s, v) => s + v, 0));
    return { slices, total };
  }, [activities, mode]);

  const family = WIDGET_FAMILY.ActivityMix;
  const accent = familyStyle(family).accent;

  return (
    <WidgetCard
      family={family}
      title={WIDGET_TITLES.ActivityMix}
      icon={Activity}
      action={
        <View style={styles.toggle}>
          {(['count', 'km'] as Mode[]).map((m) => (
            <PressableScale
              key={m}
              onPress={() => setMode(m)}
              style={[
                styles.togglePill,
                mode === m && {
                  backgroundColor: withAlpha(accent, 'tint'),
                  borderColor: withAlpha(accent, 'strong'),
                },
              ]}
            >
              <Typography style={[styles.toggleTxt, mode === m && { color: accent }]}>
                {m === 'count' ? 'Sessions' : 'Km'}
              </Typography>
            </PressableScale>
          ))}
        </View>
      }
    >
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
          formatValue={(v) => (mode === 'count' ? `${Math.round(v)}×` : `${Math.round(v)} km`)}
        >
          <Typography style={styles.centerNum}>{mix.total}</Typography>
          <Typography style={styles.centerLbl}>{mode === 'count' ? 'total' : 'km total'}</Typography>
        </ChartDonut>
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
  centerNum: { fontSize: 18, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.4 },
  centerLbl: {
    fontSize: 9,
    color: theme.colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
