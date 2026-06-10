import React, { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BarChart3, Bike, Footprints, LucideIcon, PersonStanding, Waves } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { DonutRing } from '../components/DonutRing';
import { Typography } from '../components/Typography';
import { SkeletonStatGrid } from '../components/SkeletonPresets';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { useStore } from '../store/useStore';
import { StravaService } from '../services/strava';
import { EmptyHint } from './common';

export const StravaTotalsWidget = memo(function StravaTotalsWidget() {
  const athleteStats = useStore((s) => s.athleteStats);
  const setAthleteStats = useStore((s) => s.setAthleteStats);
  const activities = useStore((s) => s.activities);

  // Reactive Strava-auth flag. `StravaService.isAuthenticated()` is sync but
  // depends on `initialize()` having loaded the token from secure storage —
  // reading it inline during render races that load.
  const [stravaConnected, setStravaConnected] = useState(false);
  useEffect(() => {
    let alive = true;
    StravaService.initialize().then(() => {
      if (alive) setStravaConnected(StravaService.isAuthenticated());
    });
    return () => { alive = false; };
  }, []);

  // Lazy fetch on mount of THIS widget — only when connected and the cache is
  // empty. onRefresh elsewhere keeps the cache fresh after that.
  useEffect(() => {
    if (!stravaConnected || athleteStats) return;
    let alive = true;
    StravaService.fetchAthleteStats()
      .then((res) => { if (alive && res) setAthleteStats(res); })
      .catch((e) => console.warn('Could not fetch athlete stats:', e));
    return () => { alive = false; };
  }, [stravaConnected, athleteStats, setAthleteStats]);

  // Strava's athlete stats endpoint doesn't break out walks, so derive walk
  // km/count from the synced activity list.
  const walk = useMemo(() => {
    const walkActs = activities.filter((a) => a.type === 'Walk');
    return {
      km: Math.round(walkActs.reduce((s, a) => s + a.distance / 1000, 0)),
      count: walkActs.length,
    };
  }, [activities]);

  const rings = useMemo(() => {
    if (!athleteStats) return null;
    const stats = athleteStats.stats;
    const km = (t: any) => Math.round((t?.distance || 0) / 1000);
    const data: Array<{ label: string; icon: LucideIcon; km: number; count: number; color: string }> = [
      { label: 'Run', icon: Footprints, km: km(stats?.all_run_totals), count: stats?.all_run_totals?.count || 0, color: theme.colors.primary },
      { label: 'Walk', icon: PersonStanding, km: walk.km, count: walk.count, color: theme.colors.secondary },
      { label: 'Ride', icon: Bike, km: km(stats?.all_ride_totals), count: stats?.all_ride_totals?.count || 0, color: theme.colors.info },
      { label: 'Swim', icon: Waves, km: km(stats?.all_swim_totals), count: stats?.all_swim_totals?.count || 0, color: familyStyle('recovery').accent },
    ];
    const maxKm = Math.max(...data.map((d) => d.km), 1);
    return { data, maxKm };
  }, [athleteStats, walk]);

  return (
    <WidgetCard
      family={WIDGET_FAMILY.StravaTotals}
      title={WIDGET_TITLES.StravaTotals}
      icon={BarChart3}
      caption="Lifetime via Strava"
    >
      {!stravaConnected ? (
        <EmptyHint
          icon={BarChart3}
          family={WIDGET_FAMILY.StravaTotals}
          text="Connect Strava in Settings to unlock your lifetime run, ride and swim totals."
        />
      ) : !rings ? (
        <SkeletonStatGrid rows={1} cols={4} />
      ) : (
        <View style={styles.totalsRow}>
          {rings.data.map((d) => {
            const Icon = d.icon;
            const pct = Math.min(1, d.km / rings.maxKm);
            return (
              <View key={d.label} style={styles.totalsCell}>
                <DonutRing
                  size={72}
                  stroke={7}
                  progress={pct}
                  color={d.color}
                  gradient={[d.color, withAlpha(d.color, 'heavy')]}
                  trackColor={theme.colors.background}
                >
                  <Icon color={d.color} size={18} />
                  <Typography style={styles.totalsKm}>{d.km}</Typography>
                  <Typography style={styles.totalsKmUnit}>km</Typography>
                </DonutRing>
                <Typography style={[styles.totalsLabel, { color: d.color }]}>
                  {d.label}
                </Typography>
                <Typography style={styles.totalsCount}>{d.count} activities</Typography>
              </View>
            );
          })}
        </View>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  totalsCell: { alignItems: 'center', flex: 1 },
  totalsKm: { fontSize: 14, fontWeight: '900', color: theme.colors.text, marginTop: 2, letterSpacing: -0.3 },
  totalsKmUnit: { fontSize: 8, color: theme.colors.textSecondary, fontWeight: '700' },
  totalsLabel: { fontSize: 11, fontWeight: '900', marginTop: 8, letterSpacing: 0.4, textTransform: 'uppercase' },
  totalsCount: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: '600', marginTop: 2 },
});
