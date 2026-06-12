import React, { memo, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Activity as ActivityIcon } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { theme, withAlpha } from '../theme';
import { WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { StravaService } from '../services/strava';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';

const WINDOW_DAYS = 7;
// Lazy zone backfill is capped so a fresh install never fires a fetch storm.
const MAX_ZONE_FETCHES = 6;

// Same zone → colour mapping IntensityDistribution uses: Z1-Z2 easy
// (success), Z3 moderate (warning), Z4-Z5 hard (error).
const ZONE_COLORS = [
  theme.colors.success,
  theme.colors.success,
  theme.colors.warning,
  theme.colors.error,
  theme.colors.error,
];

/** Minutes spent in each HR zone over the last 7 days. */
export const ZoneMinutesWidget = memo(function ZoneMinutesWidget() {
  const activities = useStore((s) => s.activities);
  const setActivityZones = useStore((s) => s.setActivityZones);

  const recent = useMemo(() => {
    const cutoff = Date.now() - WINDOW_DAYS * 86_400_000;
    return activities.filter((a) => new Date(a.startDate).getTime() >= cutoff);
  }, [activities]);

  // Recent HR sessions with no cached zones yet — backfill a handful lazily.
  const pendingIds = useMemo(
    () =>
      recent
        .filter((a) => (a.averageHeartRate || 0) > 0 && !a.zones)
        .map((a) => a.id)
        .slice(0, MAX_ZONE_FETCHES),
    [recent],
  );

  // One-shot per mount (same guarded pattern as PowerZones): never re-fires
  // on its own results, so a null response can't cause a fetch loop.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current || !pendingIds.length) return;
    if (!StravaService.isAuthenticated()) return;
    fetchedRef.current = true;
    let cancelled = false;
    (async () => {
      for (const id of pendingIds) {
        if (cancelled) return;
        const res = await StravaService.fetchActivityZones(id).catch(() => null);
        if (cancelled || !res) continue;
        // Cache on the activity so future mounts (and other surfaces) skip the fetch.
        const fetchedAt = new Date().toISOString();
        setActivityZones(
          id,
          res.map((z) => ({ type: z.type, buckets: z.distribution_buckets, fetchedAt })),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingIds, setActivityZones]);

  const { minutes, sessions } = useMemo(() => {
    const secs = [0, 0, 0, 0, 0];
    let n = 0;
    for (const a of recent) {
      const buckets = a.zones?.find((z) => z.type === 'heartrate')?.buckets;
      if (!buckets || !buckets.length) continue;
      n++;
      buckets.forEach((b, i) => {
        const t = Number.isFinite(b.time) ? b.time : 0;
        // Clamp >5-bucket configs into Z5 so no time silently vanishes.
        secs[Math.min(i, 4)] += t;
      });
    }
    return { minutes: secs.map((s) => Math.round(s / 60)), sessions: n };
  }, [recent]);

  const family = WIDGET_FAMILY.ZoneMinutes;
  const total = minutes.reduce((s, m) => s + m, 0);

  return (
    <WidgetCard
      family={family}
      title={WIDGET_TITLES.ZoneMinutes}
      icon={ActivityIcon}
      caption={sessions > 0 ? `7 days · ${sessions} sessions` : undefined}
    >
      {total === 0 ? (
        <EmptyHint
          icon={ActivityIcon}
          family={family}
          text="No heart-rate zone time in the last 7 days — train with an HR monitor and sync to see your weekly zone minutes."
        />
      ) : (
        <View style={styles.zoneRows}>
          {minutes.map((m, i) => (
            <View key={`z${i}`} style={styles.zoneRow}>
              <Typography style={styles.zoneLabel}>{`Z${i + 1}`}</Typography>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${(m / total) * 100}%`, backgroundColor: ZONE_COLORS[i] },
                  ]}
                />
              </View>
              <Typography style={styles.zoneMins}>
                {`${m}m · ${Math.round((m / total) * 100)}%`}
              </Typography>
            </View>
          ))}
        </View>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  zoneRows: { gap: 8 },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoneLabel: { width: 22, fontSize: 11, color: theme.colors.textSecondary, fontWeight: '700' },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: withAlpha(theme.colors.text, 'faint'),
  },
  barFill: { height: '100%', borderRadius: 4 },
  zoneMins: {
    width: 68, fontSize: 11, color: theme.colors.text, fontWeight: '700',
    textAlign: 'right', fontVariant: ['tabular-nums'],
  },
});
