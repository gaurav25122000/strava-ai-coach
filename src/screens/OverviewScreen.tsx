import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { Typography } from '../components/Typography';
import { HeatmapCalendar } from '../components/HeatmapCalendar';
import { useStore } from '../store/useStore';
import {
  Flame,
  Trophy,
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  Mountain,
  Clock,
  Heart,
  Footprints,
  CalendarDays,
  BarChart3,
  Wind,
  Target,
  Timer,
  MapPin,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { format, parseISO, startOfWeek, endOfWeek, isWithinInterval, subWeeks } from 'date-fns';

const { width } = Dimensions.get('window');

function formatPace(speed: number): string {
  if (!speed) return '--';
  const mPerK = 1000 / speed / 60;
  const mins = Math.floor(mPerK);
  const secs = Math.round((mPerK - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getActivityIcon(type: string, color: string, size = 20) {
  switch (type) {
    case 'Run': return <Footprints color={color} size={size} />;
    case 'Ride': return <Wind color={color} size={size} />;
    default: return <Zap color={color} size={size} />;
  }
}

function getActivityColor(type: string): string {
  switch (type) {
    case 'Run': return theme.colors.primary;
    case 'Ride': return '#3B82F6';
    default: return theme.colors.accent;
  }
}

function MiniStatCard({ label, value, unit, color, icon }: {
  label: string; value: string | number; unit?: string; color: string; icon: React.ReactNode;
}) {
  return (
    <View style={miniStyles.card}>
      <View style={[miniStyles.iconWrap, { backgroundColor: color + '22' }]}>{icon}</View>
      <Typography style={miniStyles.label}>{label}</Typography>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Typography style={[miniStyles.value, { color }]}>{value}</Typography>
        {unit ? <Typography style={miniStyles.unit}>{unit}</Typography> : null}
      </View>
    </View>
  );
}

const miniStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  iconWrap: {
    borderRadius: 8,
    padding: 6,
    marginBottom: 8,
  },
  label: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
  },
  unit: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginLeft: 3,
  },
});

export default function OverviewScreen() {
  const { userStats, goals, activities } = useStore();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  }, []);

  const heatmapData = useMemo(() => {
    return activities.map(act => {
      let level: 0 | 1 | 2 | 3 | 4 = 0;
      const km = act.distance / 1000;
      if (km > 0) level = 1;
      if (km > 5) level = 2;
      if (km > 10) level = 3;
      if (km > 20) level = 4;
      return { date: act.startDate, level };
    });
  }, [activities]);

  // This week stats
  const thisWeekStats = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const weekActs = activities.filter(a =>
      isWithinInterval(parseISO(a.startDate), { start: weekStart, end: weekEnd })
    );
    return {
      days: new Set(weekActs.map(a => a.startDate.split('T')[0])).size,
      km: weekActs.reduce((s, a) => s + a.distance / 1000, 0).toFixed(1),
      time: weekActs.reduce((s, a) => s + a.movingTime, 0),
      elev: Math.round(weekActs.reduce((s, a) => s + a.totalElevationGain, 0)),
      runs: weekActs.filter(a => a.type === 'Run').length,
    };
  }, [activities]);

  // Last week for comparison
  const lastWeekKm = useMemo(() => {
    const now = new Date();
    const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    const acts = activities.filter(a =>
      isWithinInterval(parseISO(a.startDate), { start: lastWeekStart, end: lastWeekEnd })
    );
    return acts.reduce((s, a) => s + a.distance / 1000, 0).toFixed(1);
  }, [activities]);

  // Recent 5 activities
  const recentActivities = useMemo(() => {
    return [...activities]
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
      .slice(0, 5);
  }, [activities]);

  // Personal bests
  const personalBests = useMemo(() => {
    const runs = activities.filter(a => a.type === 'Run');
    const longestRun = runs.reduce((max, a) => a.distance > max ? a.distance : max, 0);
    const fastestPace = runs.reduce((best, a) => {
      if (a.averageSpeed <= 0) return best;
      const pace = 1000 / a.averageSpeed / 60;
      return pace < best ? pace : best;
    }, 999);
    const mostElevation = activities.reduce((max, a) => a.totalElevationGain > max ? a.totalElevationGain : max, 0);
    const longestTime = activities.reduce((max, a) => a.movingTime > max ? a.movingTime : max, 0);
    return { longestRun, fastestPace, mostElevation, longestTime };
  }, [activities]);

  // Monthly distance for last 4 months
  const monthlyData = useMemo(() => {
    const months: Record<string, number> = {};
    activities.forEach(a => {
      const key = format(parseISO(a.startDate), 'MMM');
      months[key] = (months[key] || 0) + a.distance / 1000;
    });
    return Object.entries(months).slice(-4).map(([month, km]) => ({ month, km: Math.round(km) }));
  }, [activities]);

  // Heart rate stats
  const hrStats = useMemo(() => {
    const withHR = activities.filter(a => a.averageHeartRate && a.averageHeartRate > 0);
    if (!withHR.length) return null;
    const avg = Math.round(withHR.reduce((s, a) => s + (a.averageHeartRate || 0), 0) / withHR.length);
    const max = Math.max(...withHR.map(a => a.maxHeartRate || 0));
    return { avg, max };
  }, [activities]);

  // Activity type distribution
  const typeDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    activities.forEach(a => { counts[a.type] = (counts[a.type] || 0) + 1; });
    return Object.entries(counts).map(([type, count]) => ({ type, count, pct: Math.round((count / activities.length) * 100) }));
  }, [activities]);

  const weekTrend = Number(thisWeekStats.km) >= Number(lastWeekKm);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        {/* ── Hero Streak Banner ── */}
        <View style={styles.heroBanner}>
          <View style={styles.heroLeft}>
            <Typography style={styles.heroLabel}>CURRENT STREAK</Typography>
            <View style={styles.heroValueRow}>
              <Flame color={theme.colors.primary} size={32} />
              <Typography style={styles.heroNumber}>{userStats.currentStreak}</Typography>
              <Typography style={styles.heroDays}>days</Typography>
            </View>
            <Typography style={styles.heroSub}>
              🏆 Best: {userStats.bestStreak} days
            </Typography>
          </View>
          <View style={styles.heroRight}>
            <View style={styles.heroStatPill}>
              <Trophy color="#FBBF24" size={16} />
              <Typography style={styles.heroPillText}>{userStats.totalRuns} runs</Typography>
            </View>
            <View style={[styles.heroStatPill, { marginTop: 8 }]}>
              <MapPin color={theme.colors.secondary} size={16} />
              <Typography style={styles.heroPillText}>{userStats.totalKm} km total</Typography>
            </View>
          </View>
        </View>

        {/* ── This Week ── */}
        <View style={styles.sectionHeader}>
          <CalendarDays color={theme.colors.primary} size={16} />
          <Typography style={styles.sectionTitle}>This Week</Typography>
          <View style={[styles.trendBadge, { backgroundColor: weekTrend ? '#22C55E22' : '#EF444422' }]}>
            {weekTrend ? <TrendingUp color="#22C55E" size={12} /> : <TrendingDown color="#EF4444" size={12} />}
            <Typography style={[styles.trendText, { color: weekTrend ? '#22C55E' : '#EF4444' }]}>
              {lastWeekKm} km last week
            </Typography>
          </View>
        </View>

        <View style={styles.miniRow}>
          <MiniStatCard
            label="Days Active" value={thisWeekStats.days} color={theme.colors.primary}
            icon={<CalendarDays color={theme.colors.primary} size={14} />}
          />
          <View style={{ width: 8 }} />
          <MiniStatCard
            label="Distance" value={thisWeekStats.km} unit="km" color="#3B82F6"
            icon={<MapPin color="#3B82F6" size={14} />}
          />
        </View>
        <View style={[styles.miniRow, { marginTop: 8 }]}>
          <MiniStatCard
            label="Time" value={formatDuration(thisWeekStats.time)} color={theme.colors.accent}
            icon={<Clock color={theme.colors.accent} size={14} />}
          />
          <View style={{ width: 8 }} />
          <MiniStatCard
            label="Elevation" value={thisWeekStats.elev} unit="m" color="#FBBF24"
            icon={<Mountain color="#FBBF24" size={14} />}
          />
        </View>

        {/* ── Activity Heatmap ── */}
        <View style={[styles.sectionHeader, { marginTop: 20 }]}>
          <Activity color={theme.colors.primary} size={16} />
          <Typography style={styles.sectionTitle}>Activity Map</Typography>
        </View>
        <Card style={styles.card}>
          <HeatmapCalendar data={heatmapData} />
        </Card>

        {/* ── Recent Activities ── */}
        <View style={styles.sectionHeader}>
          <Timer color={theme.colors.primary} size={16} />
          <Typography style={styles.sectionTitle}>Recent Activities</Typography>
        </View>

        {recentActivities.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Typography style={styles.emptyText}>No activities yet — sync Strava in Settings</Typography>
          </Card>
        ) : (
          recentActivities.map(act => {
            const color = getActivityColor(act.type);
            return (
              <Card key={act.id} style={[styles.activityCard, { borderLeftColor: color }]}>
                <View style={styles.actRow}>
                  <View style={[styles.actIconWrap, { backgroundColor: color + '22' }]}>
                    {getActivityIcon(act.type, color, 18)}
                  </View>
                  <View style={styles.actInfo}>
                    <Typography style={styles.actName} numberOfLines={1}>
                      {act.name || act.type}
                    </Typography>
                    <Typography style={styles.actDate}>
                      {format(parseISO(act.startDate), 'EEE, MMM d')}
                    </Typography>
                  </View>
                  <View style={styles.actStats}>
                    <Typography style={[styles.actStat, { color }]}>
                      {(act.distance / 1000).toFixed(2)} km
                    </Typography>
                    <Typography style={styles.actSubStat}>{formatPace(act.averageSpeed)} /km</Typography>
                    <Typography style={styles.actSubStat}>{formatDuration(act.movingTime)}</Typography>
                  </View>
                </View>
              </Card>
            );
          })
        )}

        {/* ── Monthly Volume ── */}
        {monthlyData.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <BarChart3 color={theme.colors.primary} size={16} />
              <Typography style={styles.sectionTitle}>Monthly Volume</Typography>
            </View>
            <Card style={styles.card}>
              <View style={styles.barContainer}>
                {monthlyData.map(({ month, km }) => {
                  const maxKm = Math.max(...monthlyData.map(d => d.km), 1);
                  const pct = km / maxKm;
                  return (
                    <View key={month} style={styles.barCol}>
                      <Typography style={styles.barValue}>{km}</Typography>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { height: `${Math.max(pct * 100, 4)}%`, backgroundColor: theme.colors.primary }]} />
                      </View>
                      <Typography style={styles.barLabel}>{month}</Typography>
                    </View>
                  );
                })}
              </View>
              <Typography style={styles.barUnit}>km per month</Typography>
            </Card>
          </>
        )}

        {/* ── Heart Rate Panel ── */}
        {hrStats && (
          <>
            <View style={styles.sectionHeader}>
              <Heart color="#EF4444" size={16} />
              <Typography style={styles.sectionTitle}>Heart Rate</Typography>
            </View>
            <View style={styles.miniRow}>
              <MiniStatCard
                label="Avg HR" value={hrStats.avg} unit="bpm" color="#EF4444"
                icon={<Heart color="#EF4444" size={14} />}
              />
              <View style={{ width: 8 }} />
              <MiniStatCard
                label="Max HR" value={hrStats.max} unit="bpm" color="#F97316"
                icon={<Zap color="#F97316" size={14} />}
              />
            </View>
          </>
        )}

        {/* ── Personal Bests ── */}
        <View style={[styles.sectionHeader, { marginTop: 20 }]}>
          <Trophy color="#FBBF24" size={16} />
          <Typography style={styles.sectionTitle}>Personal Bests</Typography>
        </View>
        <View style={styles.miniRow}>
          <MiniStatCard
            label="Longest Run" value={(personalBests.longestRun / 1000).toFixed(1)} unit="km"
            color={theme.colors.secondary}
            icon={<Footprints color={theme.colors.secondary} size={14} />}
          />
          <View style={{ width: 8 }} />
          <MiniStatCard
            label="Fastest Pace"
            value={personalBests.fastestPace === 999 ? '--' : formatPace(1000 / (personalBests.fastestPace * 60))}
            unit="/km" color={theme.colors.primary}
            icon={<TrendingUp color={theme.colors.primary} size={14} />}
          />
        </View>
        <View style={[styles.miniRow, { marginTop: 8 }]}>
          <MiniStatCard
            label="Peak Elevation" value={Math.round(personalBests.mostElevation)} unit="m"
            color="#FBBF24"
            icon={<Mountain color="#FBBF24" size={14} />}
          />
          <View style={{ width: 8 }} />
          <MiniStatCard
            label="Longest Session" value={formatDuration(personalBests.longestTime)}
            color={theme.colors.accent}
            icon={<Clock color={theme.colors.accent} size={14} />}
          />
        </View>

        {/* ── Activity Mix ── */}
        {typeDistribution.length > 0 && (
          <>
            <View style={[styles.sectionHeader, { marginTop: 20 }]}>
              <Activity color={theme.colors.primary} size={16} />
              <Typography style={styles.sectionTitle}>Activity Mix</Typography>
            </View>
            <Card style={styles.card}>
              {typeDistribution.map(({ type, count, pct }) => {
                const color = getActivityColor(type);
                return (
                  <View key={type} style={styles.mixRow}>
                    <View style={styles.mixLeft}>
                      {getActivityIcon(type, color, 16)}
                      <Typography style={[styles.mixType, { color }]}>{type}</Typography>
                    </View>
                    <View style={styles.mixBarTrack}>
                      <View style={[styles.mixBarFill, { width: `${pct}%`, backgroundColor: color }]} />
                    </View>
                    <Typography style={styles.mixCount}>{count}</Typography>
                  </View>
                );
              })}
            </Card>
          </>
        )}

        {/* ── Overall Stats Row ── */}
        <View style={[styles.sectionHeader, { marginTop: 20 }]}>
          <BarChart3 color={theme.colors.primary} size={16} />
          <Typography style={styles.sectionTitle}>All-Time Stats</Typography>
        </View>
        <View style={styles.miniRow}>
          <MiniStatCard
            label="Best Pace" value={userStats.bestPace} unit="/km" color={theme.colors.primary}
            icon={<TrendingUp color={theme.colors.primary} size={14} />}
          />
          <View style={{ width: 8 }} />
          <MiniStatCard
            label="Top Elevation" value={userStats.topElev} unit="m" color="#FBBF24"
            icon={<Mountain color="#FBBF24" size={14} />}
          />
        </View>

        {/* ── Active Goals ── */}
        {goals.length > 0 && (
          <>
            <View style={[styles.sectionHeader, { marginTop: 20 }]}>
              <Target color={theme.colors.primary} size={16} />
              <Typography style={styles.sectionTitle}>Active Goals</Typography>
            </View>
            {goals.map(goal => (
              <Card key={goal.id} style={[styles.goalCard, { borderTopColor: theme.colors.primary }]}>
                <View style={styles.goalRow}>
                  <Flame color={theme.colors.primary} size={20} />
                  <View style={styles.goalInfo}>
                    <Typography style={styles.goalTitle}>{goal.title}</Typography>
                    <Typography style={styles.goalSub}>{goal.targetDate} · {goal.phase.split('\n')[0]}</Typography>
                  </View>
                  <View style={styles.goalDays}>
                    <Typography style={styles.goalDaysNum}>{goal.daysRemaining}</Typography>
                    <Typography style={styles.goalDaysLabel}>days</Typography>
                  </View>
                </View>
              </Card>
            ))}
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { padding: 16, paddingBottom: 32 },

  heroBanner: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 20,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primary + '44',
  },
  heroLeft: { flex: 1 },
  heroLabel: { fontSize: 10, color: theme.colors.textSecondary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  heroValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  heroNumber: { fontSize: 60, fontWeight: '800', color: theme.colors.primary, lineHeight: 68 },
  heroDays: { fontSize: 18, color: theme.colors.textSecondary, fontWeight: '600' },
  heroSub: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 6 },
  heroRight: { alignItems: 'flex-end' },
  heroStatPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: theme.colors.background, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: theme.colors.border,
  },
  heroPillText: { fontSize: 12, color: theme.colors.text, fontWeight: '600' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 },
  trendBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  trendText: { fontSize: 10, fontWeight: '600' },

  miniRow: { flexDirection: 'row' },

  card: { marginBottom: 16 },
  emptyCard: { padding: 20, alignItems: 'center', marginBottom: 16 },
  emptyText: { color: theme.colors.textSecondary, fontSize: 13 },

  activityCard: {
    marginBottom: 8, padding: 14, borderLeftWidth: 3,
    backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  actRow: { flexDirection: 'row', alignItems: 'center' },
  actIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  actInfo: { flex: 1 },
  actName: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  actDate: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  actStats: { alignItems: 'flex-end' },
  actStat: { fontSize: 15, fontWeight: '700' },
  actSubStat: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 1 },

  barContainer: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 8, paddingHorizontal: 8 },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barValue: { fontSize: 10, color: theme.colors.textSecondary, marginBottom: 2 },
  barTrack: { width: '100%', height: 70, justifyContent: 'flex-end', backgroundColor: theme.colors.background, borderRadius: 4 },
  barFill: { width: '100%', borderRadius: 4 },
  barLabel: { fontSize: 10, color: theme.colors.textSecondary, marginTop: 4 },
  barUnit: { fontSize: 10, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 8 },

  mixRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  mixLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 70 },
  mixType: { fontSize: 12, fontWeight: '600' },
  mixBarTrack: { flex: 1, height: 6, backgroundColor: theme.colors.background, borderRadius: 3, overflow: 'hidden' },
  mixBarFill: { height: '100%', borderRadius: 3 },
  mixCount: { fontSize: 12, color: theme.colors.textSecondary, width: 24, textAlign: 'right' },

  goalCard: { marginBottom: 8, padding: 14, borderTopWidth: 2, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: theme.colors.border },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  goalInfo: { flex: 1 },
  goalTitle: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  goalSub: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  goalDays: { alignItems: 'center' },
  goalDaysNum: { fontSize: 24, fontWeight: '800', color: theme.colors.primary },
  goalDaysLabel: { fontSize: 10, color: theme.colors.textSecondary },
});
