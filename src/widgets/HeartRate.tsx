import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Heart } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { theme } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { resolveHrZones, zoneOf } from '../utils/hrZones';
import { useStore } from '../store/useStore';
import { EmptyHint, MetricBlock } from './common';
import { ZoneHistogram, ZoneColumn } from './_shared';

export const HeartRateWidget = memo(function HeartRateWidget() {
  const activities = useStore((s) => s.activities);
  const hrZones = useStore((s) => s.hrZones);
  const userProfile = useStore((s) => s.userProfile);

  // Single source of truth for zone bounds — Strava zones win, then profile
  // maxHR, then the age formula. (Replaces the old inline fallback bands.)
  const resolved = useMemo(() => resolveHrZones(hrZones, userProfile), [hrZones, userProfile]);

  const hrStats = useMemo(() => {
    const withHR = activities.filter((a) => (a.averageHeartRate || 0) > 0);
    if (!withHR.length) return null;
    const avg = Math.round(
      withHR.reduce((s, a) => s + (a.averageHeartRate || 0), 0) / withHR.length,
    );
    const max = Math.max(...withHR.map((a) => a.maxHeartRate || 0));
    return { avg, max };
  }, [activities]);

  // Count each activity's average HR into a zone — a session-level histogram,
  // same semantics as the old dashboard.
  const zoneCols = useMemo<ZoneColumn[]>(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const a of activities) {
      const hr = a.averageHeartRate || 0;
      if (!hr) continue;
      counts[zoneOf(hr, resolved) - 1]++;
    }
    const total = counts.reduce((s, c) => s + c, 0) || 1;
    const colors = [
      familyStyle('progress').accent,
      theme.colors.success,
      theme.colors.warning,
      theme.colors.primary,
      theme.colors.error,
    ];
    return counts.map((c, i) => ({ label: `Z${i + 1}`, pct: c / total, color: colors[i] }));
  }, [activities, resolved]);

  const family = WIDGET_FAMILY.HeartRate;

  return (
    <WidgetCard
      family={family}
      title={WIDGET_TITLES.HeartRate}
      icon={Heart}
      caption={resolved.source === 'strava' ? 'zones: Strava' : 'estimated from max HR'}
    >
      {!hrStats ? (
        <EmptyHint
          icon={Heart}
          family={family}
          text="No heart-rate data yet — record activities with an HR monitor and sync Strava to see your averages and zone spread."
        />
      ) : (
        <>
          <View style={styles.metricRow}>
            <MetricBlock label="Avg bpm" value={`${hrStats.avg}`} accent={familyStyle(family).accent} />
            <MetricBlock label="Max bpm" value={`${hrStats.max}`} />
            {userProfile.restingHR > 0 ? (
              <MetricBlock label="Resting" value={`${userProfile.restingHR}`} />
            ) : null}
          </View>
          {zoneCols.some((z) => z.pct > 0) ? (
            <ZoneHistogram zones={zoneCols} barArea={60} />
          ) : null}
        </>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  metricRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
});
