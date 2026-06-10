import React, { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Gauge } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { theme } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { StravaService } from '../services/strava';
import { useStore, ZoneBucket } from '../store/useStore';
import { EmptyHint } from './common';
import { RIDE_TYPES, StatChip, ZoneHistogram } from './_shared';
import { formatDuration } from './_format';

// Z1..Z7 power-zone palette from theme tokens (sky → green → emerald →
// yellow → orange → red → deep red).
const POWER_ZONE_COLORS = [
  familyStyle('progress').accent,
  theme.colors.success,
  theme.colors.secondary,
  familyStyle('records').accent,
  theme.colors.primary,
  theme.colors.error,
  familyStyle('health').gradient[1],
];

export const PowerZonesWidget = memo(function PowerZonesWidget() {
  const activities = useStore((s) => s.activities);
  const setActivityZones = useStore((s) => s.setActivityZones);

  // Latest ride that actually has watts — the widget's subject.
  const ride = useMemo(
    () =>
      [...activities]
        .filter((a) => RIDE_TYPES.has(a.type) && (a.averageWatts || 0) > 0)
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0],
    [activities],
  );

  const rideId = ride?.id;
  const cachedBuckets = ride?.zones?.find((z) => z.type === 'power')?.buckets;

  const [buckets, setBuckets] = useState<ZoneBucket[] | null>(null);

  useEffect(() => {
    if (!rideId) {
      setBuckets(null);
      return;
    }
    if (cachedBuckets) {
      setBuckets(cachedBuckets);
      return;
    }
    setBuckets(null);
    if (!StravaService.isAuthenticated()) return;
    let cancelled = false;
    StravaService.fetchActivityZones(rideId)
      .then((res) => {
        if (!res || cancelled) return;
        const p = res.find((z) => z.type === 'power');
        if (p) setBuckets(p.distribution_buckets);
        // Cache on the activity so future mounts (and other surfaces) skip the fetch.
        const fetchedAt = new Date().toISOString();
        setActivityZones(
          rideId,
          res.map((z) => ({ type: z.type, buckets: z.distribution_buckets, fetchedAt })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [rideId, cachedBuckets, setActivityZones]);

  const family = WIDGET_FAMILY.PowerZones;
  const total = buckets?.reduce((s, b) => s + b.time, 0) ?? 0;

  const zones = useMemo(() => {
    if (!buckets || total === 0) return [];
    return buckets.slice(0, 7).map((b, i) => ({
      label: `Z${i + 1}`,
      pct: b.time / total,
      color: POWER_ZONE_COLORS[i] ?? familyStyle('health').accent,
    }));
  }, [buckets, total]);

  return (
    <WidgetCard
      family={family}
      title={WIDGET_TITLES.PowerZones}
      icon={Gauge}
      caption={ride ? ride.name || 'Latest ride' : undefined}
      action={
        ride && !ride.deviceWatts ? (
          <StatChip color={theme.colors.warning} label="estimated" />
        ) : undefined
      }
    >
      {!ride ? (
        <EmptyHint
          icon={Gauge}
          family={family}
          text="No rides with power yet — ride with a power meter or smart trainer and sync to see your time in power zones."
        />
      ) : !zones.length ? (
        <EmptyHint
          icon={Gauge}
          family={family}
          text="Power-zone breakdown is loading from Strava. If it doesn't appear, Strava may have no zone data for this ride."
        />
      ) : (
        <>
          <ZoneHistogram zones={zones} barArea={70} />
          <Typography style={styles.totalTxt}>
            Total {formatDuration(total)} in power zones
          </Typography>
        </>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  totalTxt: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
});
