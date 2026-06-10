import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Flame, Footprints, MapPin, Trophy } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Pulsing } from '../components/Pulsing';
import { theme } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { activityDayKey } from '../utils/dates';
import { useStore } from '../store/useStore';

/**
 * Streak flame + weekly streak + 30-day consistency + lifetime chips on the
 * activity-family gradient.
 */
export const HeroBannerWidget = memo(function HeroBannerWidget() {
  const userStats = useStore((s) => s.userStats);
  const activities = useStore((s) => s.activities);

  // % of the last 30 days with at least one activity.
  const consistencyScore = useMemo(() => {
    if (!activities.length) return 0;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const daysActive = new Set(
      activities
        .filter((a) => new Date(a.startDate) >= thirtyDaysAgo)
        .map((a) => activityDayKey(a)),
    ).size;
    return Math.round((daysActive / 30) * 100);
  }, [activities]);

  return (
    <WidgetCard family={WIDGET_FAMILY['HeroBanner']} title={WIDGET_TITLES['HeroBanner']} icon={Flame}>
      <LinearGradient
        colors={familyStyle('activity').gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroBanner}
      >
        <View style={styles.heroStreakRow}>
          <View style={[styles.heroFlameGlow, theme.shadows.glow(theme.colors.primary)]}>
            {userStats.currentStreak > 0 ? (
              <Pulsing>
                <Flame color={theme.colors.onAccent} size={28} fill={theme.colors.onAccent} />
              </Pulsing>
            ) : (
              <Flame color={theme.colors.onAccent} size={28} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Typography style={styles.heroStreakLabel}>DAILY STREAK</Typography>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <AnimatedNumber value={userStats.currentStreak} style={styles.heroStreakNum as any} />
              <Typography style={styles.heroStreakUnit}>days</Typography>
            </View>
            <Typography style={styles.heroStreakSub}>
              Weekly streak: {userStats.currentWeeklyStreak || 0} wks · {consistencyScore}% consistent
            </Typography>
          </View>
        </View>
        <View style={styles.heroChipRow}>
          <View style={styles.heroChip}>
            <MapPin color={theme.colors.onAccent} size={13} />
            <View>
              <Typography style={styles.heroChipVal}>{userStats.totalKm}</Typography>
              <Typography style={styles.heroChipLbl}>km total</Typography>
            </View>
          </View>
          <View style={styles.heroChip}>
            <Trophy color={theme.colors.onAccent} size={13} />
            <View>
              <Typography style={styles.heroChipVal}>{userStats.totalRuns}</Typography>
              <Typography style={styles.heroChipLbl}>runs</Typography>
            </View>
          </View>
          <View style={styles.heroChip}>
            <Footprints color={theme.colors.onAccent} size={13} />
            <View>
              <Typography style={styles.heroChipVal}>{userStats.totalWalks || 0}</Typography>
              <Typography style={styles.heroChipLbl}>walks</Typography>
            </View>
          </View>
        </View>
      </LinearGradient>
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  heroBanner: {
    borderRadius: theme.borderRadius.lg,
    padding: 18,
    overflow: 'hidden',
  },
  heroStreakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  heroFlameGlow: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  heroStreakLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  heroStreakNum: {
    fontSize: 56,
    lineHeight: 60,
    fontWeight: '900',
    color: theme.colors.onAccent,
    letterSpacing: -1.5,
  },
  heroStreakUnit: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '700',
    marginLeft: 6,
  },
  heroStreakSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    marginTop: 2,
  },
  heroChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  heroChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
  },
  heroChipVal: { fontSize: 16, fontWeight: '900', color: theme.colors.onAccent, lineHeight: 18 },
  heroChipLbl: { fontSize: 9, color: 'rgba(255,255,255,0.7)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, lineHeight: 11 },
});
