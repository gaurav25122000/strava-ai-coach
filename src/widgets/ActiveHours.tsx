import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Clock } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';

const WINDOW_DAYS = 90;

// Label for a 3-hour block starting at `h`.
const blockLabel = (h: number) => {
  const fmt = (x: number) => {
    const hr = x % 24;
    const ampm = hr < 12 ? 'AM' : 'PM';
    const disp = hr % 12 === 0 ? 12 : hr % 12;
    return `${disp} ${ampm}`;
  };
  return `${fmt(h)}–${fmt(h + 3)}`;
};

function persona(peakHour: number): string {
  if (peakHour < 9) return 'Early bird';
  if (peakHour < 12) return 'Morning mover';
  if (peakHour < 17) return 'Daytime athlete';
  if (peakHour < 21) return 'Evening regular';
  return 'Night mover';
}

/**
 * When you actually train: 24-hour histogram of activity start times over the
 * last 90 days, with your peak window called out. Start hour comes from
 * startDateLocal's string clock — the athlete's wall time, not UTC.
 */
export const ActiveHoursWidget = memo(function ActiveHoursWidget() {
  const activities = useStore((s) => s.activities);

  const data = useMemo(() => {
    const cutoff = Date.now() - WINDOW_DAYS * 86_400_000;
    const hours = new Array(24).fill(0) as number[];
    let counted = 0;
    for (const a of activities) {
      if (new Date(a.startDate).getTime() < cutoff) continue;
      // startDateLocal carries a misleading Z suffix — read the clock digits.
      const src = a.startDateLocal || a.startDate;
      const h = parseInt(src.slice(11, 13), 10);
      if (Number.isNaN(h)) continue;
      hours[h] += 1;
      counted += 1;
    }
    if (!counted) return null;
    // Peak 3-hour block.
    let peakStart = 0;
    let peakSum = -1;
    for (let h = 0; h <= 21; h++) {
      const sum = hours[h] + hours[h + 1] + hours[h + 2];
      if (sum > peakSum) {
        peakSum = sum;
        peakStart = h;
      }
    }
    const peakHour = peakStart + 1;
    const share = Math.round((peakSum / counted) * 100);
    const max = Math.max(...hours, 1);
    return { hours, max, peakStart, peakHour, share, counted };
  }, [activities]);

  const family = WIDGET_FAMILY.ActiveHours;
  const accent = familyStyle(family).accent;

  return (
    <WidgetCard
      family={family}
      title={WIDGET_TITLES.ActiveHours}
      icon={Clock}
      caption={`last ${WINDOW_DAYS} days`}
    >
      {!data ? (
        <EmptyHint
          icon={Clock}
          family={family}
          text="Sync a few activities and your daily training rhythm will show up here."
        />
      ) : (
        <>
          <View style={styles.heroRow}>
            <Typography style={[styles.persona, { color: accent }]}>
              {persona(data.peakHour)}
            </Typography>
            <Typography style={styles.peakLine}>
              {data.share}% of starts {blockLabel(data.peakStart)}
            </Typography>
          </View>
          <View style={styles.barRow}>
            {data.hours.map((v, h) => {
              const inPeak = h >= data.peakStart && h < data.peakStart + 3;
              return (
                <View key={h} style={styles.barCol}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: Math.max(3, (v / data.max) * 40),
                        backgroundColor: v === 0
                          ? withAlpha(theme.colors.border, 'heavy')
                          : inPeak
                            ? accent
                            : withAlpha(accent, 'medium'),
                      },
                    ]}
                  />
                </View>
              );
            })}
          </View>
          <View style={styles.axisRow}>
            {['12 AM', '6 AM', '12 PM', '6 PM', '12 AM'].map((l, i) => (
              <Typography key={`${l}-${i}`} style={styles.axisLbl}>{l}</Typography>
            ))}
          </View>
        </>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  persona: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  peakLine: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 44,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 2,
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  axisLbl: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
});
