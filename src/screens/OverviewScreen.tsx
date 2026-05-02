import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown, Layout } from "react-native-reanimated";
import { theme } from "../theme";
import { StravaService } from "../services/strava";
import { Card } from "../components/Card";
import { Typography } from "../components/Typography";
import { HeatmapCalendar } from "../components/HeatmapCalendar";
import { useStore } from "../store/useStore";
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
  Settings as SettingsIcon,
  ChevronUp,
  ChevronDown,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  computeMilestones,
  computeBestEfforts,
  computeTrainingLoad,
  TrainingLoad,
  getAllMilestoneDefs,
} from "../services/milestones";
import { ActivityDetailScreen } from "./ActivityDetailScreen";
import { Activity as ActivityType } from "../store/useStore";
import * as Haptics from "expo-haptics";
import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
  subWeeks,
} from "date-fns";
import { ProgressBar } from "../components/ProgressBar";

const { width } = Dimensions.get("window");

function formatPace(speed: number): string {
  if (!speed) return "--";
  const mPerK = 1000 / speed / 60;
  const mins = Math.floor(mPerK);
  const secs = Math.round((mPerK - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getActivityIcon(type: string, color: string, size = 20) {
  switch (type) {
    case "Run":
      return <Footprints color={color} size={size} />;
    case "Ride":
      return <Wind color={color} size={size} />;
    case "Walk":
      return <Footprints color={color} size={size} />;
    default:
      return <Zap color={color} size={size} />;
  }
}

function getActivityColor(type: string): string {
  switch (type) {
    case "Run":
      return theme.colors.primary;
    case "Ride":
      return "#3B82F6";
    case "Walk":
      return "#10B981";
    default:
      return theme.colors.accent;
  }
}

function GradientStatCard({
  label,
  value,
  unit,
  colors,
  icon,
  sub,
}: {
  label: string;
  value: string | number;
  unit?: string;
  colors: [string, string];
  icon: React.ReactNode;
  sub?: string;
}) {
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={miniStyles.card}
    >
      <View style={miniStyles.iconWrap}>{icon}</View>
      <Typography style={miniStyles.label}>{label}</Typography>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Typography style={miniStyles.value}>{value}</Typography>
        {unit ? <Typography style={miniStyles.unit}>{unit}</Typography> : null}
      </View>
      {sub ? <Typography style={miniStyles.sub}>{sub}</Typography> : null}
    </LinearGradient>
  );
}

const miniStyles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: theme.borderRadius.md,
    padding: 14,
    alignItems: "flex-start",
  },
  iconWrap: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 8,
    padding: 6,
    marginBottom: 10,
  },
  label: {
    fontSize: 10,
    color: "rgba(255,255,255,0.7)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "700",
    marginBottom: 2,
  },
  value: {
    fontSize: 24,
    fontWeight: "800",
    color: "#fff",
  },
  unit: {
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    marginLeft: 3,
    fontWeight: "600",
  },
  sub: {
    fontSize: 10,
    color: "rgba(255,255,255,0.6)",
    marginTop: 4,
  },
});

export default function OverviewScreen() {
  const {
    userStats,
    goals,
    activities,
    milestones,
    bestEfforts,
    setMilestones,
    setBestEfforts,
    setActivities,
    setLifetimeStats,
    setToast,
    setShoes,
    shoes,
    injuries,
    weeklyDigest,
    userProfile,
  } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityType | null>(
    null,
  );
  const [infoSheet, setInfoSheet] = useState<{
    title: string;
    body: string;
    rows?: { label: string; desc: string }[];
  } | null>(null);
  const [layoutModalVisible, setLayoutModalVisible] = useState(false);
  const { settings, updateSettings } = useStore();

  const defaultLayout = [
    "HeroBanner",
    "CurrentFocus",
    "WeeklyDigest",
    "RecoveryAdvisor",
    "InjuryAlert",
    "WeeklyGoalTracker",
    "ThisWeek",
    "IntensityDistribution",
    "ShoeTracker",
    "ActivityMap",
    "RecentActivities",
    "MonthlyVolume",
    "HeartRate",
    "PersonalBests",
    "RacePredictor",
    "ActivityMix",
    "YearToDate",
    "AllTimeStats",
    "ActiveGoals",
    "TrainingLoad",
    "BestEfforts",
    "Badges",
  ];

  const handleToggleWidget = (id: string) => {
    let layout = [...(settings.widgetLayout || defaultLayout)];
    if (layout.includes(id)) layout = layout.filter((w) => w !== id);
    else layout.push(id);
    updateSettings({ widgetLayout: layout });
  };

  const handleMoveWidget = (index: number, direction: "up" | "down") => {
    const layout = [...(settings.widgetLayout || defaultLayout)];
    if (direction === "up" && index > 0) {
      const temp = layout[index - 1];
      layout[index - 1] = layout[index];
      layout[index] = temp;
      updateSettings({ widgetLayout: layout });
    } else if (direction === "down" && index < layout.length - 1) {
      const temp = layout[index + 1];
      layout[index + 1] = layout[index];
      layout[index] = temp;
      updateSettings({ widgetLayout: layout });
    }
  };

  // Compute milestones + best efforts whenever activities change
  useEffect(() => {
    if (!activities.length) return;
    const newMilestones = computeMilestones(activities, milestones, userStats);
    if (newMilestones.length !== milestones.length)
      setMilestones(newMilestones);
    const efforts = computeBestEfforts(activities);
    setBestEfforts(efforts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities]);

  const trainingLoad = useMemo<TrainingLoad>(
    () => computeTrainingLoad(activities),
    [activities],
  );

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRefreshing(true);
    try {
      if (StravaService.isAuthenticated()) {
        const newActivities = await StravaService.syncActivities();
        setActivities(newActivities);
        try {
          const { stats, athlete } = await StravaService.fetchAthleteStats();
          setLifetimeStats(stats);
          if (athlete.shoes && Array.isArray(athlete.shoes)) {
            setShoes(
              athlete.shoes.map((s: any) => ({
                id: s.id,
                name: s.name,
                brand: "", // Strava provides the name which often includes brand
                distance: Math.round((s.distance || 0) / 1000),
              })),
            );
          }
        } catch (statsErr) {
          console.warn("Could not fetch lifetime stats:", statsErr);
        }
      }
    } catch (e: any) {
      if (
        e.message === "Not authenticated with Strava" ||
        e.response?.status === 401
      ) {
        setToast({
          title: "Session Expired",
          message: "Please reconnect your Strava account in Settings.",
          type: "error",
        });
      } else {
        setToast({
          title: "Error",
          message: "Failed to sync activities",
          type: "error",
        });
      }
    } finally {
      setRefreshing(false);
    }
  }, [setActivities, setLifetimeStats, setToast]);

  const heatmapData = useMemo(() => {
    return activities.map((act) => {
      const km = act.distance / 1000;
      let level: 0 | 1 | 2 | 3 | 4 = 0;
      if (km > 0) level = 1;
      if (km > 5) level = 2;
      if (km > 10) level = 3;
      if (km > 20) level = 4;
      return { date: act.startDate, level, type: act.type, km };
    });
  }, [activities]);

  // This week stats
  const thisWeekStats = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const weekActs = activities.filter((a) =>
      isWithinInterval(parseISO(a.startDate), {
        start: weekStart,
        end: weekEnd,
      }),
    );
    return {
      days: new Set(weekActs.map((a) => a.startDate.split("T")[0])).size,
      km: weekActs.reduce((s, a) => s + a.distance / 1000, 0).toFixed(1),
      time: weekActs.reduce((s, a) => s + a.movingTime, 0),
      elev: Math.round(weekActs.reduce((s, a) => s + a.totalElevationGain, 0)),
      runs: weekActs.filter((a) => a.type === "Run").length,
      calories: Math.round(weekActs.reduce((s, a) => s + (a.calories || 0), 0)),
      sufferScore: Math.round(
        weekActs.reduce((s, a) => s + (a.sufferScore || 0), 0),
      ),
    };
  }, [activities]);

  // Last week for comparison
  const lastWeekKm = useMemo(() => {
    const now = new Date();
    const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    const acts = activities.filter((a) =>
      isWithinInterval(parseISO(a.startDate), {
        start: lastWeekStart,
        end: lastWeekEnd,
      }),
    );
    return acts.reduce((s, a) => s + a.distance / 1000, 0).toFixed(1);
  }, [activities]);

  // Recent 5 activities
  const recentActivities = useMemo(() => {
    return [...activities]
      .sort(
        (a, b) =>
          new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
      )
      .slice(0, 5);
  }, [activities]);

  // Personal bests
  const personalBests = useMemo(() => {
    const runs = activities.filter((a) => a.type === "Run");
    const walks = activities.filter((a) => a.type === "Walk");
    const longestRun = runs.reduce(
      (max, a) => (a.distance > max ? a.distance : max),
      0,
    );
    const longestWalk = walks.reduce(
      (max, a) => (a.distance > max ? a.distance : max),
      0,
    );
    const fastestPace = runs.reduce((best, a) => {
      if (a.averageSpeed <= 0) return best;
      const pace = 1000 / a.averageSpeed / 60;
      return pace < best ? pace : best;
    }, 999);
    const mostElevation = activities.reduce(
      (max, a) => (a.totalElevationGain > max ? a.totalElevationGain : max),
      0,
    );
    const longestTime = activities.reduce(
      (max, a) => (a.movingTime > max ? a.movingTime : max),
      0,
    );
    return { longestRun, longestWalk, fastestPace, mostElevation, longestTime };
  }, [activities]);


  const intensityDist = useMemo(() => {
    const hrActs = activities.filter(
      (a) => a.averageHeartRate && a.averageHeartRate > 0,
    );
    if (!hrActs.length) return null;
    let low = 0,
      high = 0;
    const threshold = (userProfile?.maxHR || 190) * 0.75;
    hrActs.forEach((a) => {
      if (a.averageHeartRate <= threshold) low++;
      else high++;
    });
    const total = low + high;
    return {
      lowPct: Math.round((low / total) * 100),
      highPct: Math.round((high / total) * 100),
    };
  }, [activities, userProfile]);

  const recoveryScore = useMemo(() => {
    if (!trainingLoad || trainingLoad.tsb === 0) return null;
    if (trainingLoad.tsb < -15)
      return {
        status: "Take a Rest Day",
        desc: "Your form is deeply negative. Rest up to avoid overtraining.",
        color: theme.colors.error,
      };
    if (trainingLoad.tsb < -5)
      return {
        status: "Active Recovery",
        desc: "You carry some fatigue. Keep it easy today.",
        color: theme.colors.accent,
      };
    return {
      status: "Ready to Push",
      desc: "You are fresh and ready for a hard workout.",
      color: theme.colors.success,
    };
  }, [trainingLoad]);

  const consistencyScore = useMemo(() => {
    if (!activities.length) return 0;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const daysActive = new Set(
      activities
        .filter((a) => new Date(a.startDate) >= thirtyDaysAgo)
        .map((a) => a.startDate.split("T")[0]),
    ).size;
    return Math.round((daysActive / 30) * 100);
  }, [activities]);

  const racePredictor = useMemo(() => {
    if (personalBests.fastestPace === 999) return null;
    const baseTSecs = personalBests.fastestPace * 60;
    const predict = (distKm: number) => {
      if (distKm <= 0) return "--";
      return formatDuration(Math.round(baseTSecs * Math.pow(distKm, 1.06)));
    };
    return {
      fiveK: predict(5),
      tenK: predict(10),
      half: predict(21.1),
      full: predict(42.2),
    };
  }, [personalBests.fastestPace]);

  const activeGoal = goals.length > 0 ? goals[0] : undefined;

  // Monthly distance for last 4 months
  const monthlyData = useMemo(() => {
    const months: Record<string, number> = {};
    activities.forEach((a) => {
      const key = format(parseISO(a.startDate), "MMM");
      months[key] = (months[key] || 0) + a.distance / 1000;
    });
    return Object.entries(months)
      .slice(-4)
      .map(([month, km]) => ({ month, km: Math.round(km) }));
  }, [activities]);

  // Heart rate stats
  const hrStats = useMemo(() => {
    const withHR = activities.filter(
      (a) => a.averageHeartRate && a.averageHeartRate > 0,
    );
    if (!withHR.length) return null;
    const avg = Math.round(
      withHR.reduce((s, a) => s + (a.averageHeartRate || 0), 0) / withHR.length,
    );
    const max = Math.max(...withHR.map((a) => a.maxHeartRate || 0));
    return { avg, max };
  }, [activities]);

  // Activity type distribution
  const typeDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    activities.forEach((a) => {
      counts[a.type] = (counts[a.type] || 0) + 1;
    });
    return Object.entries(counts).map(([type, count]) => ({
      type,
      count,
      pct: Math.round((count / activities.length) * 100),
    }));
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
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            marginBottom: 12,
          }}
        >
          <TouchableOpacity
            onPress={() => setLayoutModalVisible(true)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "rgba(255,255,255,0.05)",
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 12,
            }}
          >
            <SettingsIcon color={theme.colors.primary} size={14} />
            <Typography
              style={{
                fontSize: 12,
                color: theme.colors.primary,
                marginLeft: 6,
                fontWeight: "700",
              }}
            >
              Customise Widgets
            </Typography>
          </TouchableOpacity>
        </View>
        {(settings.widgetLayout || defaultLayout).map((widgetId, idx) => {
          switch (widgetId) {
            case "WeeklyGoalTracker":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── Weekly Goal Tracker ── */}
                  {userProfile.weeklyGoalKm > 0 && (
                    <Animated.View
                      entering={FadeInDown.delay(210).springify()}
                      layout={Layout.springify()}
                    >
                      <View style={[styles.sectionHeader, { marginTop: 16 }]}>
                        <Target color={theme.colors.primary} size={16} />
                        <Typography style={styles.sectionTitle}>
                          Weekly Goal Progress
                        </Typography>
                      </View>
                      <Card style={styles.card}>
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            marginBottom: 8,
                          }}
                        >
                          <Typography
                            style={{
                              fontSize: 13,
                              color: theme.colors.textSecondary,
                            }}
                          >
                            Distance
                          </Typography>
                          <Typography
                            style={{ fontSize: 13, fontWeight: "700" }}
                          >
                            {thisWeekStats.km} / {userProfile.weeklyGoalKm} km
                          </Typography>
                        </View>
                        <ProgressBar
                          progress={Math.min(
                            (Number(thisWeekStats.km) /
                              userProfile.weeklyGoalKm) *
                              100,
                            100,
                          )}
                          color={
                            Number(thisWeekStats.km) >= userProfile.weeklyGoalKm
                              ? theme.colors.success
                              : theme.colors.primary
                          }
                        />
                      </Card>
                    </Animated.View>
                  )}
                </View>
              );
            case "IntensityDistribution":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── Intensity Distribution ── */}
                  {intensityDist && (
                    <Animated.View
                      entering={FadeInDown.delay(220).springify()}
                      layout={Layout.springify()}
                    >
                      <TouchableOpacity
                        style={[styles.sectionHeader, { marginTop: 16 }]}
                        activeOpacity={0.7}
                        onPress={() =>
                          setInfoSheet({
                            title: "Intensity Distribution",
                            body: "Tracks the 80/20 rule: roughly 80% of your training should be low intensity (easy), and 20% high intensity.",
                            rows: [
                              {
                                label: "Low Intensity",
                                desc: `Average HR <= ${Math.round((userProfile.maxHR || 190) * 0.75)} bpm (75% of max)`,
                              },
                              {
                                label: "High Intensity",
                                desc: `Average HR > ${Math.round((userProfile.maxHR || 190) * 0.75)} bpm`,
                              },
                            ],
                          })
                        }
                      >
                        <Activity color="#8B5CF6" size={16} />
                        <Typography style={styles.sectionTitle}>
                          Intensity (80/20 Rule)
                        </Typography>
                        <Typography
                          style={{
                            fontSize: 10,
                            color: theme.colors.textSecondary,
                          }}
                        >
                          ⓘ info
                        </Typography>
                      </TouchableOpacity>
                      <Card style={styles.card}>
                        <View
                          style={{
                            flexDirection: "row",
                            height: 12,
                            borderRadius: 6,
                            overflow: "hidden",
                            marginBottom: 12,
                          }}
                        >
                          <View
                            style={{
                              width: `${intensityDist.lowPct}%`,
                              backgroundColor: theme.colors.success,
                            }}
                          />
                          <View
                            style={{
                              width: `${intensityDist.highPct}%`,
                              backgroundColor: theme.colors.error,
                            }}
                          />
                        </View>
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: theme.colors.success,
                              }}
                            />
                            <Typography
                              style={{
                                fontSize: 12,
                                color: theme.colors.textSecondary,
                              }}
                            >
                              {intensityDist.lowPct}% Easy
                            </Typography>
                          </View>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: theme.colors.error,
                              }}
                            />
                            <Typography
                              style={{
                                fontSize: 12,
                                color: theme.colors.textSecondary,
                              }}
                            >
                              {intensityDist.highPct}% Hard
                            </Typography>
                          </View>
                        </View>
                      </Card>
                    </Animated.View>
                  )}
                </View>
              );
            case "RecoveryAdvisor":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── Recovery Advisor ── */}
                  {recoveryScore && (
                    <Animated.View
                      entering={FadeInDown.delay(230).springify()}
                      layout={Layout.springify()}
                    >
                      <View style={[styles.sectionHeader, { marginTop: 16 }]}>
                        <Heart color={recoveryScore.color} size={16} />
                        <Typography style={styles.sectionTitle}>
                          Recovery Advisor
                        </Typography>
                      </View>
                      <Card
                        style={[
                          styles.card,
                          {
                            borderLeftWidth: 4,
                            borderLeftColor: recoveryScore.color,
                          },
                        ]}
                      >
                        <Typography
                          style={{
                            fontSize: 16,
                            fontWeight: "800",
                            color: recoveryScore.color,
                            marginBottom: 4,
                          }}
                        >
                          {recoveryScore.status}
                        </Typography>
                        <Typography
                          style={{
                            fontSize: 13,
                            color: theme.colors.text,
                            lineHeight: 18,
                          }}
                        >
                          {recoveryScore.desc}
                        </Typography>
                      </Card>
                    </Animated.View>
                  )}
                </View>
              );
            case "HeroBanner":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── Hero Streak Banner ── */}
                  <Animated.View
                    entering={FadeInDown.delay(100).springify()}
                    layout={Layout.springify()}
                  >
                    <View style={styles.heroBanner}>
                      <View style={styles.heroLeft}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: 4,
                          }}
                        >
                          <Flame color={theme.colors.primary} size={16} />
                          <Typography
                            style={[styles.heroLabel, { marginBottom: 0 }]}
                          >
                            DAILY STREAK
                          </Typography>
                        </View>
                        <View
                          style={[
                            styles.heroValueRow,
                            { alignItems: "flex-end", marginTop: 0 },
                          ]}
                        >
                          <Typography style={styles.heroNumber}>
                            {userStats.currentStreak}
                          </Typography>
                          <Typography
                            style={[styles.heroDays, { marginBottom: 12 }]}
                          >
                            days
                          </Typography>
                        </View>

                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                            marginTop: 12,
                            marginBottom: 4,
                          }}
                        >
                          <Flame color={theme.colors.secondary} size={16} />
                          <Typography
                            style={[styles.heroLabel, { marginBottom: 0 }]}
                          >
                            WEEKLY STREAK
                          </Typography>
                        </View>
                        <View
                          style={[
                            styles.heroValueRow,
                            { alignItems: "flex-end", marginTop: 0 },
                          ]}
                        >
                          <Typography
                            style={[
                              styles.heroNumber,
                              {
                                color: theme.colors.secondary,
                                fontSize: 36,
                                lineHeight: 40,
                              },
                            ]}
                          >
                            {userStats.currentWeeklyStreak || 0}
                          </Typography>
                          <Typography
                            style={[styles.heroDays, { marginBottom: 4 }]}
                          >
                            wks
                          </Typography>
                        </View>
                      </View>
                      <View style={styles.heroRight}>
                        <View style={styles.heroStatPill}>
                          <Trophy color="#FBBF24" size={16} />
                          <Typography style={styles.heroPillText}>
                            {userStats.totalRuns} runs
                          </Typography>
                        </View>
                        {(userStats.totalWalks || 0) > 0 && (
                          <View style={[styles.heroStatPill, { marginTop: 8 }]}>
                            <Footprints color="#10B981" size={16} />
                            <Typography style={styles.heroPillText}>
                              {userStats.totalWalks} walks
                            </Typography>
                          </View>
                        )}
                        <View style={[styles.heroStatPill, { marginTop: 8 }]}>
                          <MapPin color={theme.colors.secondary} size={16} />
                          <Typography style={styles.heroPillText}>
                            {userStats.totalKm} km total
                          </Typography>
                        </View>
                        <View style={[styles.heroStatPill, { marginTop: 8 }]}>
                          <Activity color={theme.colors.accent} size={16} />
                          <Typography style={styles.heroPillText}>
                            {consistencyScore}% consistent
                          </Typography>
                        </View>
                      </View>
                    </View>
                  </Animated.View>
                </View>
              );
            case "CurrentFocus":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── Current Focus ── */}
                  {activeGoal && (
                    <Animated.View
                      entering={FadeInDown.delay(150).springify()}
                      layout={Layout.springify()}
                    >
                      <Card
                        style={[
                          styles.card,
                          {
                            marginTop: 16,
                            borderLeftWidth: 4,
                            borderLeftColor: theme.colors.primary,
                          },
                        ]}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <View>
                            <Typography
                              style={{
                                fontSize: 12,
                                color: theme.colors.textSecondary,
                                fontWeight: "700",
                                textTransform: "uppercase",
                              }}
                            >
                              Current Focus
                            </Typography>
                            <Typography
                              style={{
                                fontSize: 18,
                                color: theme.colors.text,
                                fontWeight: "800",
                                marginTop: 4,
                              }}
                            >
                              {activeGoal.title}
                            </Typography>
                          </View>
                          <Target color={theme.colors.primary} size={24} />
                        </View>
                        {activeGoal.phases && activeGoal.phases.length > 0 && (
                          <View
                            style={{
                              marginTop: 12,
                              padding: 12,
                              backgroundColor: theme.colors.background,
                              borderRadius: 8,
                            }}
                          >
                            <Typography
                              style={{
                                fontSize: 13,
                                color: theme.colors.primary,
                                fontWeight: "700",
                              }}
                            >
                              Phase: {activeGoal.phases[0].name}
                            </Typography>
                            <Typography
                              style={{
                                fontSize: 12,
                                color: theme.colors.textSecondary,
                                marginTop: 4,
                                lineHeight: 18,
                              }}
                            >
                              {activeGoal.phases[0].description}
                            </Typography>
                          </View>
                        )}
                      </Card>
                    </Animated.View>
                  )}
                </View>
              );
            case "WeeklyDigest":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── AI Weekly Digest ── */}
                  {weeklyDigest && (
                    <Animated.View
                      entering={FadeInDown.delay(160).springify()}
                      layout={Layout.springify()}
                    >
                      <Card
                        style={[
                          styles.card,
                          {
                            marginTop: 16,
                            backgroundColor: theme.colors.primary + "11",
                            borderColor: theme.colors.primary,
                            borderWidth: 1,
                          },
                        ]}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            marginBottom: 8,
                            gap: 8,
                          }}
                        >
                          <Zap color={theme.colors.primary} size={18} />
                          <Typography
                            style={{
                              fontSize: 13,
                              fontWeight: "700",
                              color: theme.colors.primary,
                              textTransform: "uppercase",
                            }}
                          >
                            Coach's Weekly Tip
                          </Typography>
                        </View>
                        <Typography
                          style={{
                            fontSize: 14,
                            color: theme.colors.text,
                            lineHeight: 22,
                          }}
                        >
                          {weeklyDigest.tip || weeklyDigest.summary}
                        </Typography>
                      </Card>
                    </Animated.View>
                  )}
                </View>
              );
            case "InjuryAlert":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── Injury Alert ── */}
                  {injuries.length > 0 && (
                    <Animated.View
                      entering={FadeInDown.delay(170).springify()}
                      layout={Layout.springify()}
                    >
                      <Card
                        style={[
                          styles.card,
                          {
                            marginTop: 16,
                            borderLeftWidth: 4,
                            borderLeftColor: theme.colors.error,
                          },
                        ]}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            marginBottom: 8,
                            gap: 8,
                          }}
                        >
                          <Heart color={theme.colors.error} size={18} />
                          <Typography
                            style={{
                              fontSize: 13,
                              fontWeight: "700",
                              color: theme.colors.error,
                              textTransform: "uppercase",
                            }}
                          >
                            Active Recovery
                          </Typography>
                        </View>
                        <Typography
                          style={{
                            fontSize: 14,
                            color: theme.colors.text,
                            lineHeight: 20,
                          }}
                        >
                          You have {injuries.length} logged issue
                          {injuries.length > 1 ? "s" : ""}. Prioritize active
                          recovery and don't push through sharp pain.
                        </Typography>
                      </Card>
                    </Animated.View>
                  )}
                </View>
              );
            case "ShoeTracker":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── Shoe Tracker ── */}
                  {shoes.length > 0 && (
                    <Animated.View
                      entering={FadeInDown.delay(180).springify()}
                      layout={Layout.springify()}
                    >
                      <View style={[styles.sectionHeader, { marginTop: 16 }]}>
                        <Footprints color={theme.colors.primary} size={16} />
                        <Typography style={styles.sectionTitle}>
                          Shoe Health
                        </Typography>
                      </View>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={{ marginBottom: 16 }}
                      >
                        {[...shoes]
                          .sort((a, b) => b.distance - a.distance)
                          .slice(0, 3)
                          .map((shoe) => {
                            const limit = 500;
                            const pct = Math.min(
                              (shoe.distance / limit) * 100,
                              100,
                            );
                            const isWarn = shoe.distance > 400;
                            return (
                              <Card
                                key={shoe.id}
                                style={{
                                  width: 160,
                                  marginRight: 12,
                                  padding: 12,
                                }}
                              >
                                <Typography
                                  numberOfLines={1}
                                  style={{
                                    fontSize: 14,
                                    fontWeight: "700",
                                    marginBottom: 4,
                                  }}
                                >
                                  {shoe.name}
                                </Typography>
                                <Typography
                                  style={{
                                    fontSize: 11,
                                    color: theme.colors.textSecondary,
                                    marginBottom: 8,
                                  }}
                                >
                                  {shoe.distance} / {limit} km
                                </Typography>
                                <View
                                  style={{
                                    height: 6,
                                    backgroundColor: theme.colors.background,
                                    borderRadius: 3,
                                    overflow: "hidden",
                                  }}
                                >
                                  <View
                                    style={{
                                      width: `${pct}%`,
                                      height: "100%",
                                      backgroundColor: isWarn
                                        ? theme.colors.error
                                        : theme.colors.primary,
                                      borderRadius: 3,
                                    }}
                                  />
                                </View>
                              </Card>
                            );
                          })}
                      </ScrollView>
                    </Animated.View>
                  )}
                </View>
              );
            case "YearToDate":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── Year-to-Date Progress ── */}
                  {activities.length > 0 && (
                    <Animated.View
                      entering={FadeInDown.delay(190).springify()}
                      layout={Layout.springify()}
                    >
                      <View style={[styles.sectionHeader, { marginTop: 8 }]}>
                        <TrendingUp color={theme.colors.success} size={16} />
                        <Typography style={styles.sectionTitle}>
                          Year to Date
                        </Typography>
                      </View>
                      <Card style={[styles.card, { padding: 16 }]}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "flex-end",
                            marginBottom: 8,
                          }}
                        >
                          <Typography
                            style={{
                              fontSize: 32,
                              fontWeight: "800",
                              color: theme.colors.success,
                              lineHeight: 36,
                            }}
                          >
                            {Math.round(
                              activities
                                .filter(
                                  (a) =>
                                    new Date(a.startDate).getFullYear() ===
                                    new Date().getFullYear(),
                                )
                                .reduce((s, a) => s + a.distance / 1000, 0),
                            )}
                          </Typography>
                          <Typography
                            style={{
                              fontSize: 14,
                              color: theme.colors.textSecondary,
                              marginBottom: 4,
                              marginLeft: 4,
                            }}
                          >
                            km run this year
                          </Typography>
                        </View>
                      </Card>
                    </Animated.View>
                  )}
                </View>
              );
            case "ThisWeek":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── This Week ── */}
                  <Animated.View
                    entering={FadeInDown.delay(200).springify()}
                    layout={Layout.springify()}
                  >
                    <View style={styles.sectionHeader}>
                      <CalendarDays color={theme.colors.primary} size={16} />
                      <Typography style={styles.sectionTitle}>
                        This Week
                      </Typography>
                      <View
                        style={[
                          styles.trendBadge,
                          {
                            backgroundColor: weekTrend
                              ? "#22C55E22"
                              : "#EF444422",
                          },
                        ]}
                      >
                        {weekTrend ? (
                          <TrendingUp color="#22C55E" size={12} />
                        ) : (
                          <TrendingDown color="#EF4444" size={12} />
                        )}
                        <Typography
                          style={[
                            styles.trendText,
                            { color: weekTrend ? "#22C55E" : "#EF4444" },
                          ]}
                        >
                          {lastWeekKm} km last week
                        </Typography>
                      </View>
                    </View>

                    {/* Row 1 */}
                    <View style={styles.miniRow}>
                      <GradientStatCard
                        label="Days Active"
                        value={thisWeekStats.days}
                        colors={["#6366f1", "#8b5cf6"]}
                        icon={<CalendarDays color="#fff" size={14} />}
                      />
                      <View style={{ width: 8 }} />
                      <GradientStatCard
                        label="Distance"
                        value={thisWeekStats.km}
                        unit="km"
                        colors={["#0ea5e9", "#0284c7"]}
                        icon={<MapPin color="#fff" size={14} />}
                      />
                    </View>
                    {/* Row 2 */}
                    <View style={[styles.miniRow, { marginTop: 8 }]}>
                      <GradientStatCard
                        label="Active Time"
                        value={formatDuration(thisWeekStats.time)}
                        colors={["#f59e0b", "#d97706"]}
                        icon={<Clock color="#fff" size={14} />}
                      />
                      <View style={{ width: 8 }} />
                      <GradientStatCard
                        label="Elevation"
                        value={thisWeekStats.elev}
                        unit="m"
                        colors={["#10b981", "#059669"]}
                        icon={<Mountain color="#fff" size={14} />}
                      />
                    </View>
                    {/* Row 3 */}
                    <View style={[styles.miniRow, { marginTop: 8 }]}>
                      <GradientStatCard
                        label="Calories"
                        value={thisWeekStats.calories || "--"}
                        unit={thisWeekStats.calories ? "kcal" : undefined}
                        colors={["#ef4444", "#dc2626"]}
                        icon={<Flame color="#fff" size={14} />}
                      />
                      <View style={{ width: 8 }} />
                      <GradientStatCard
                        label="Suffer Score"
                        value={thisWeekStats.sufferScore || "--"}
                        colors={["#ec4899", "#db2777"]}
                        icon={<Heart color="#fff" size={14} />}
                        sub="HR-based training load"
                      />
                    </View>
                  </Animated.View>
                </View>
              );
            case "ActivityMap":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── Activity Heatmap ── */}
                  <Animated.View
                    entering={FadeInDown.delay(300).springify()}
                    layout={Layout.springify()}
                  >
                    <View style={[styles.sectionHeader, { marginTop: 20 }]}>
                      <Activity color={theme.colors.primary} size={16} />
                      <Typography style={styles.sectionTitle}>
                        Activity Map
                      </Typography>
                    </View>
                    <Card style={styles.card}>
                      <HeatmapCalendar data={heatmapData} />
                    </Card>
                  </Animated.View>
                </View>
              );
            case "RecentActivities":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── Recent Activities ── */}
                  <Animated.View
                    entering={FadeInDown.delay(400).springify()}
                    layout={Layout.springify()}
                  >
                    <View style={styles.sectionHeader}>
                      <Timer color={theme.colors.primary} size={16} />
                      <Typography style={styles.sectionTitle}>
                        Recent Activities
                      </Typography>
                    </View>

                    {recentActivities.length === 0 ? (
                      <Card style={styles.emptyCard}>
                        <Typography style={styles.emptyText}>
                          No activities yet — sync Strava in Settings
                        </Typography>
                      </Card>
                    ) : (
                      recentActivities.map((act) => {
                        const color = getActivityColor(act.type);
                        return (
                          <TouchableOpacity
                            key={act.id}
                            onPress={() => setSelectedActivity(act)}
                            activeOpacity={0.8}
                          >
                            <Card
                              style={[
                                styles.activityCard,
                                { borderLeftColor: color },
                              ]}
                            >
                              <View style={styles.actRow}>
                                <View
                                  style={[
                                    styles.actIconWrap,
                                    { backgroundColor: color + "22" },
                                  ]}
                                >
                                  {getActivityIcon(act.type, color, 18)}
                                </View>
                                <View style={styles.actInfo}>
                                  <Typography
                                    style={styles.actName}
                                    numberOfLines={1}
                                  >
                                    {act.name || act.type}
                                  </Typography>
                                  <Typography style={styles.actDate}>
                                    {format(
                                      parseISO(act.startDate),
                                      "EEE, MMM d",
                                    )}
                                  </Typography>
                                </View>
                                <View style={styles.actStats}>
                                  <Typography
                                    style={[styles.actStat, { color }]}
                                  >
                                    {(act.distance / 1000).toFixed(2)} km
                                  </Typography>
                                  <Typography style={styles.actSubStat}>
                                    {formatPace(act.averageSpeed)} /km
                                  </Typography>
                                  <Typography style={styles.actSubStat}>
                                    {formatDuration(act.movingTime)}
                                  </Typography>
                                </View>
                              </View>
                            </Card>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </Animated.View>
                </View>
              );
            case "MonthlyVolume":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── Monthly Volume ── */}
                  {monthlyData.length > 0 && (
                    <Animated.View
                      entering={FadeInDown.delay(500).springify()}
                      layout={Layout.springify()}
                    >
                      <View style={styles.sectionHeader}>
                        <BarChart3 color={theme.colors.primary} size={16} />
                        <Typography style={styles.sectionTitle}>
                          Monthly Volume
                        </Typography>
                      </View>
                      <Card style={styles.card}>
                        <View style={styles.barContainer}>
                          {monthlyData.map(({ month, km }) => {
                            const maxKm = Math.max(
                              ...monthlyData.map((d) => d.km),
                              1,
                            );
                            const pct = km / maxKm;
                            return (
                              <View key={month} style={styles.barCol}>
                                <Typography style={styles.barValue}>
                                  {km}
                                </Typography>
                                <View style={styles.barTrack}>
                                  <View
                                    style={[
                                      styles.barFill,
                                      {
                                        height: `${Math.max(pct * 100, 4)}%`,
                                        backgroundColor: theme.colors.primary,
                                      },
                                    ]}
                                  />
                                </View>
                                <Typography style={styles.barLabel}>
                                  {month}
                                </Typography>
                              </View>
                            );
                          })}
                        </View>
                        <Typography style={styles.barUnit}>
                          km per month
                        </Typography>
                      </Card>
                    </Animated.View>
                  )}
                </View>
              );
            case "HeartRate":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── Heart Rate ── */}
                  {hrStats && (
                    <Animated.View
                      entering={FadeInDown.delay(600).springify()}
                      layout={Layout.springify()}
                    >
                      <View style={styles.sectionHeader}>
                        <Heart color="#EF4444" size={16} />
                        <Typography style={styles.sectionTitle}>
                          Heart Rate
                        </Typography>
                      </View>
                      <View style={styles.miniRow}>
                        <GradientStatCard
                          label="Avg HR"
                          value={hrStats.avg}
                          unit="bpm"
                          colors={["#ef4444", "#dc2626"]}
                          icon={<Heart color="#fff" size={14} />}
                        />
                        <View style={{ width: 8 }} />
                        <GradientStatCard
                          label="Max HR"
                          value={hrStats.max}
                          unit="bpm"
                          colors={["#f97316", "#ea580c"]}
                          icon={<Zap color="#fff" size={14} />}
                        />
                      </View>
                    </Animated.View>
                  )}
                </View>
              );
            case "PersonalBests":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── Personal Bests ── */}
                  <Animated.View
                    entering={FadeInDown.delay(700).springify()}
                    layout={Layout.springify()}
                  >
                    <View style={[styles.sectionHeader, { marginTop: 20 }]}>
                      <Trophy color="#FBBF24" size={16} />
                      <Typography style={styles.sectionTitle}>
                        Personal Bests
                      </Typography>
                    </View>
                    <View style={styles.miniRow}>
                      <GradientStatCard
                        label="Longest Run"
                        value={(personalBests.longestRun / 1000).toFixed(1)}
                        unit="km"
                        colors={["#7c3aed", "#6d28d9"]}
                        icon={<Footprints color="#fff" size={14} />}
                      />
                      <View style={{ width: 8 }} />
                      <GradientStatCard
                        label="Fastest Pace"
                        value={
                          personalBests.fastestPace === 999
                            ? "--"
                            : formatPace(
                                1000 / (personalBests.fastestPace * 60),
                              )
                        }
                        unit="/km"
                        colors={["#0ea5e9", "#0284c7"]}
                        icon={<TrendingUp color="#fff" size={14} />}
                      />
                    </View>
                    <View style={[styles.miniRow, { marginTop: 8 }]}>
                      <GradientStatCard
                        label="Peak Elevation"
                        value={Math.round(personalBests.mostElevation)}
                        unit="m"
                        colors={["#f59e0b", "#d97706"]}
                        icon={<Mountain color="#fff" size={14} />}
                      />
                      <View style={{ width: 8 }} />
                      <GradientStatCard
                        label="Longest Session"
                        value={formatDuration(personalBests.longestTime)}
                        colors={["#10b981", "#059669"]}
                        icon={<Clock color="#fff" size={14} />}
                      />
                    </View>
                    {personalBests.longestWalk > 0 && (
                      <View style={[styles.miniRow, { marginTop: 8 }]}>
                        <GradientStatCard
                          label="Longest Walk"
                          value={(personalBests.longestWalk / 1000).toFixed(1)}
                          unit="km"
                          colors={["#14b8a6", "#0d9488"]}
                          icon={<Footprints color="#fff" size={14} />}
                        />
                        <View style={{ width: 8 }} />
                        <GradientStatCard
                          label="Total Walks"
                          value={userStats.totalWalks || 0}
                          colors={["#64748b", "#475569"]}
                          icon={<Activity color="#fff" size={14} />}
                        />
                      </View>
                    )}
                  </Animated.View>
                </View>
              );
            case "RacePredictor":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── Race Predictor ── */}
                  {racePredictor && (
                    <Animated.View
                      entering={FadeInDown.delay(750).springify()}
                      layout={Layout.springify()}
                    >
                      <View style={[styles.sectionHeader, { marginTop: 20 }]}>
                        <Zap color="#8B5CF6" size={16} />
                        <Typography style={styles.sectionTitle}>
                          Race Predictor
                        </Typography>
                      </View>
                      <View style={styles.miniRow}>
                        <GradientStatCard
                          label="5K"
                          value={racePredictor.fiveK}
                          colors={["#8b5cf6", "#7c3aed"]}
                          icon={<Flame color="#fff" size={14} />}
                        />
                        <View style={{ width: 8 }} />
                        <GradientStatCard
                          label="10K"
                          value={racePredictor.tenK}
                          colors={["#7c3aed", "#6d28d9"]}
                          icon={<TrendingUp color="#fff" size={14} />}
                        />
                      </View>
                      <View style={[styles.miniRow, { marginTop: 8 }]}>
                        <GradientStatCard
                          label="Half Marathon"
                          value={racePredictor.half}
                          colors={["#6d28d9", "#5b21b6"]}
                          icon={<Trophy color="#fff" size={14} />}
                        />
                        <View style={{ width: 8 }} />
                        <GradientStatCard
                          label="Marathon"
                          value={racePredictor.full}
                          colors={["#5b21b6", "#4c1d95"]}
                          icon={<Trophy color="#fff" size={14} />}
                        />
                      </View>
                    </Animated.View>
                  )}
                </View>
              );
            case "ActivityMix":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── Activity Mix ── */}
                  {typeDistribution.length > 0 && (
                    <Animated.View
                      entering={FadeInDown.delay(800).springify()}
                      layout={Layout.springify()}
                    >
                      <View style={[styles.sectionHeader, { marginTop: 20 }]}>
                        <Activity color={theme.colors.primary} size={16} />
                        <Typography style={styles.sectionTitle}>
                          Activity Mix
                        </Typography>
                      </View>
                      <Card style={styles.card}>
                        {typeDistribution.map(({ type, count, pct }) => {
                          const color = getActivityColor(type);
                          return (
                            <View key={type} style={styles.mixRow}>
                              <View style={styles.mixLeft}>
                                {getActivityIcon(type, color, 16)}
                                <Typography style={[styles.mixType, { color }]}>
                                  {type}
                                </Typography>
                              </View>
                              <View style={styles.mixBarTrack}>
                                <View
                                  style={[
                                    styles.mixBarFill,
                                    {
                                      width: `${pct}%`,
                                      backgroundColor: color,
                                    },
                                  ]}
                                />
                              </View>
                              <Typography style={styles.mixCount}>
                                {count}
                              </Typography>
                            </View>
                          );
                        })}
                      </Card>
                    </Animated.View>
                  )}
                </View>
              );
            case "AllTimeStats":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── All-Time Stats ── */}
                  <Animated.View
                    entering={FadeInDown.delay(900).springify()}
                    layout={Layout.springify()}
                  >
                    <View style={[styles.sectionHeader, { marginTop: 20 }]}>
                      <BarChart3 color={theme.colors.primary} size={16} />
                      <Typography style={styles.sectionTitle}>
                        All-Time Stats
                      </Typography>
                    </View>
                    <View style={styles.miniRow}>
                      <GradientStatCard
                        label="Best Pace"
                        value={userStats.bestPace}
                        unit="/km"
                        colors={["#6366f1", "#4f46e5"]}
                        icon={<TrendingUp color="#fff" size={14} />}
                      />
                      <View style={{ width: 8 }} />
                      <GradientStatCard
                        label="Top Elevation"
                        value={userStats.topElev}
                        unit="m"
                        colors={["#f59e0b", "#d97706"]}
                        icon={<Mountain color="#fff" size={14} />}
                      />
                    </View>
                  </Animated.View>
                </View>
              );
            case "ActiveGoals":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── Active Goals ── */}
                  {goals.length > 0 && (
                    <Animated.View
                      entering={FadeInDown.delay(1000).springify()}
                      layout={Layout.springify()}
                    >
                      <View style={[styles.sectionHeader, { marginTop: 20 }]}>
                        <Target color={theme.colors.primary} size={16} />
                        <Typography style={styles.sectionTitle}>
                          Active Goals
                        </Typography>
                      </View>
                      {goals.map((goal) => (
                        <Card
                          key={goal.id}
                          style={[
                            styles.goalCard,
                            { borderTopColor: theme.colors.primary },
                          ]}
                        >
                          <View style={styles.goalRow}>
                            <Flame color={theme.colors.primary} size={20} />
                            <View style={styles.goalInfo}>
                              <Typography style={styles.goalTitle}>
                                {goal.title}
                              </Typography>
                              <Typography style={styles.goalSub}>
                                {goal.targetDate} · {goal.phase.split("\n")[0]}
                              </Typography>
                            </View>
                            <View style={styles.goalDays}>
                              <Typography style={styles.goalDaysNum}>
                                {goal.daysRemaining}
                              </Typography>
                              <Typography style={styles.goalDaysLabel}>
                                days
                              </Typography>
                            </View>
                          </View>
                        </Card>
                      ))}
                    </Animated.View>
                  )}
                </View>
              );
            case "TrainingLoad":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── Training Load ── */}
                  {trainingLoad.ctl > 0 && (
                    <Animated.View
                      entering={FadeInDown.delay(950).springify()}
                      layout={Layout.springify()}
                    >
                      <TouchableOpacity
                        style={[styles.sectionHeader, { marginTop: 20 }]}
                        activeOpacity={0.7}
                        onPress={() =>
                          setInfoSheet({
                            title: "Training Load",
                            body: "Based on your Strava Suffer Scores, these three numbers track your fitness and fatigue like elite coaches do.",
                            rows: [
                              {
                                label: "ATL — Fatigue",
                                desc: "7-day rolling average of suffer scores. High = you have been training hard recently.",
                              },
                              {
                                label: "CTL — Fitness",
                                desc: "42-day rolling average. Higher CTL = more base fitness built over months of consistent training.",
                              },
                              {
                                label: "TSB — Form",
                                desc: "CTL minus ATL. Positive = fresh and ready to race. Negative = fatigued. Aim for +5 to +15 on race day.",
                              },
                            ],
                          })
                        }
                      >
                        <Zap color="#f97316" size={16} />
                        <Typography style={styles.sectionTitle}>
                          Training Load
                        </Typography>
                        <Typography
                          style={{
                            fontSize: 10,
                            color: theme.colors.textSecondary,
                          }}
                        >
                          ⓘ tap to learn more
                        </Typography>
                      </TouchableOpacity>
                      <View style={styles.miniRow}>
                        <GradientStatCard
                          label="ATL (Fatigue)"
                          value={trainingLoad.atl}
                          sub="7-day avg suffer"
                          colors={["#ef4444", "#dc2626"]}
                          icon={<Heart color="#fff" size={14} />}
                        />
                        <View style={{ width: 8 }} />
                        <GradientStatCard
                          label="CTL (Fitness)"
                          value={trainingLoad.ctl}
                          sub="42-day avg suffer"
                          colors={["#10b981", "#059669"]}
                          icon={<TrendingUp color="#fff" size={14} />}
                        />
                        <View style={{ width: 8 }} />
                        <GradientStatCard
                          label="TSB (Form)"
                          value={trainingLoad.tsb}
                          sub={
                            trainingLoad.tsb > 5
                              ? "Fresh"
                              : trainingLoad.tsb < -10
                                ? "Tired"
                                : "Balanced"
                          }
                          colors={
                            trainingLoad.tsb > 5
                              ? ["#6366f1", "#4f46e5"]
                              : trainingLoad.tsb < -10
                                ? ["#f97316", "#ea580c"]
                                : ["#0ea5e9", "#0284c7"]
                          }
                          icon={<Zap color="#fff" size={14} />}
                        />
                      </View>
                    </Animated.View>
                  )}
                </View>
              );
            case "BestEfforts":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {/* ── Best Efforts ── */}
                  {Object.keys(bestEfforts).length > 0 && (
                    <Animated.View
                      entering={FadeInDown.delay(960).springify()}
                      layout={Layout.springify()}
                    >
                      <TouchableOpacity
                        style={[styles.sectionHeader, { marginTop: 20 }]}
                        activeOpacity={0.7}
                        onPress={() =>
                          setInfoSheet({
                            title: "Best Efforts",
                            body: "Your fastest estimated times at each distance, derived from the average pace of your best matching runs.",
                            rows: [
                              {
                                label: "1 km",
                                desc: "Best average pace from any run ≥ 1 km, extrapolated to 1 km time.",
                              },
                              {
                                label: "5 km",
                                desc: "Best average pace from runs ≥ 4.25 km, extrapolated to 5 km time.",
                              },
                              {
                                label: "10 km",
                                desc: "Best average pace from runs ≥ 8.5 km, extrapolated to 10 km time.",
                              },
                            ],
                          })
                        }
                      >
                        <Trophy color="#FBBF24" size={16} />
                        <Typography style={styles.sectionTitle}>
                          Best Efforts
                        </Typography>
                        <Typography
                          style={{
                            fontSize: 10,
                            color: theme.colors.textSecondary,
                          }}
                        >
                          ⓘ tap to learn more
                        </Typography>
                      </TouchableOpacity>
                      <View style={styles.miniRow}>
                        {bestEfforts[1000] && (
                          <GradientStatCard
                            label="1 km"
                            value={(() => {
                              const t = bestEfforts[1000].time;
                              return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
                            })()}
                            colors={["#8b5cf6", "#7c3aed"]}
                            icon={<Footprints color="#fff" size={14} />}
                            sub={bestEfforts[1000].date}
                          />
                        )}
                        {bestEfforts[1000] && bestEfforts[5000] && (
                          <View style={{ width: 8 }} />
                        )}
                        {bestEfforts[5000] && (
                          <GradientStatCard
                            label="5 km"
                            value={(() => {
                              const t = bestEfforts[5000].time;
                              return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
                            })()}
                            colors={["#6366f1", "#4f46e5"]}
                            icon={<Footprints color="#fff" size={14} />}
                            sub={bestEfforts[5000].date}
                          />
                        )}
                      </View>
                      {bestEfforts[10000] && (
                        <View style={[styles.miniRow, { marginTop: 8 }]}>
                          <GradientStatCard
                            label="10 km"
                            value={(() => {
                              const t = bestEfforts[10000].time;
                              const h = Math.floor(t / 3600);
                              const m = Math.floor((t % 3600) / 60);
                              const s = t % 60;
                              return h > 0
                                ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
                                : `${m}:${String(s).padStart(2, "0")}`;
                            })()}
                            colors={["#0ea5e9", "#0284c7"]}
                            icon={<TrendingUp color="#fff" size={14} />}
                            sub={bestEfforts[10000].date}
                          />
                          <View style={{ width: 8 }} />
                          <View style={{ flex: 1 }} />
                        </View>
                      )}
                    </Animated.View>
                  )}
                </View>
              );
            case "Badges":
              return (
                <View key={widgetId + idx} style={{ marginBottom: 16 }}>
                  {milestones.length > 0 && (
                    <Animated.View
                      entering={FadeInDown.delay(980).springify()}
                      layout={Layout.springify()}
                    >
                      <View style={styles.sectionHeader}>
                        <Trophy color="#FBBF24" size={16} />
                        <Typography style={styles.sectionTitle}>
                          Milestones & Badges
                        </Typography>
                      </View>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                      >
                        {milestones.map((m) => (
                          <View key={m.id} style={styles.badgeCard}>
                            <Typography style={{ fontSize: 28 }}>
                              {m.icon}
                            </Typography>
                            <Typography
                              style={styles.badgeTitle}
                              numberOfLines={2}
                            >
                              {m.title}
                            </Typography>
                            <Typography style={styles.badgeSub}>
                              {format(parseISO(m.earnedAt), "d MMM yy")}
                            </Typography>
                          </View>
                        ))}
                      </ScrollView>
                    </Animated.View>
                  )}
                </View>
              );
            default:
              return null;
          }

        })}

        {/* ── Edit Layout Modal ── */}
      </ScrollView>

      <Modal
        visible={layoutModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLayoutModalVisible(false)}
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: theme.colors.background }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 20,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
            }}
          >
            <Typography style={{ fontSize: 18, fontWeight: "800" }}>
              Customise Overview
            </Typography>
            <TouchableOpacity onPress={() => setLayoutModalVisible(false)}>
              <Typography
                style={{ color: theme.colors.primary, fontWeight: "700" }}
              >
                Done
              </Typography>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ padding: 16 }}>
            <Typography
              style={{
                fontSize: 13,
                color: theme.colors.textSecondary,
                marginBottom: 16,
              }}
            >
              Turn widgets on/off and use the arrows to reorder them on your
              dashboard.
            </Typography>

            <Typography
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: theme.colors.primary,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Active Widgets
            </Typography>
            {(settings.widgetLayout || defaultLayout).map((id, idx) => {
              const WIDGET_NAMES = {
                HeroBanner: "Streaks & Totals",
                CurrentFocus: "Current Focus",
                WeeklyDigest: "AI Weekly Digest",
                RecoveryAdvisor: "Recovery Advisor",
                InjuryAlert: "Injury Alert",
                WeeklyGoalTracker: "Weekly Goal Tracker",
                ThisWeek: "This Week Stats",
                IntensityDistribution: "Intensity Distribution (80/20)",
                ShoeTracker: "Shoe Health",
                ActivityMap: "Activity Heatmap",
                RecentActivities: "Recent Activities",
                MonthlyVolume: "Monthly Volume",
                HeartRate: "Heart Rate Stats",
                PersonalBests: "Personal Bests",
                RacePredictor: "Race Predictor",
                ActivityMix: "Activity Mix",
                YearToDate: "Year to Date",
                AllTimeStats: "All Time Stats",
                ActiveGoals: "Active Goals List",
                TrainingLoad: "Training Load (ATL/CTL)",
                BestEfforts: "Estimated Best Efforts",
                Badges: "Milestones & Badges",
              };
              const title = WIDGET_NAMES[id] || id;
              return (
                <View
                  key={id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: theme.colors.surface,
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => handleToggleWidget(id)}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: theme.colors.primary,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 12,
                    }}
                  >
                    <Typography style={{ color: "#fff", fontSize: 12 }}>
                      ✓
                    </Typography>
                  </TouchableOpacity>
                  <Typography style={{ flex: 1, fontSize: 14 }}>
                    {title}
                  </Typography>
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    <TouchableOpacity
                      onPress={() => handleMoveWidget(idx, "up")}
                      disabled={idx === 0}
                      style={{ padding: 4, opacity: idx === 0 ? 0.3 : 1 }}
                    >
                      <ChevronUp color={theme.colors.text} size={20} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleMoveWidget(idx, "down")}
                      disabled={
                        idx === (settings.widgetLayout || []).length - 1
                      }
                      style={{
                        padding: 4,
                        opacity:
                          idx === (settings.widgetLayout || []).length - 1
                            ? 0.3
                            : 1,
                      }}
                    >
                      <ChevronDown color={theme.colors.text} size={20} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            <Typography
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: theme.colors.textSecondary,
                textTransform: "uppercase",
                marginTop: 16,
                marginBottom: 8,
              }}
            >
              Hidden Widgets
            </Typography>
            {defaultLayout
              .filter(
                (id) => !(settings.widgetLayout || defaultLayout).includes(id),
              )
              .map((id) => {
                const WIDGET_NAMES = {
                  HeroBanner: "Streaks & Totals",
                  CurrentFocus: "Current Focus",
                  WeeklyDigest: "AI Weekly Digest",
                  RecoveryAdvisor: "Recovery Advisor",
                  InjuryAlert: "Injury Alert",
                  WeeklyGoalTracker: "Weekly Goal Tracker",
                  ThisWeek: "This Week Stats",
                  IntensityDistribution: "Intensity Distribution (80/20)",
                  ShoeTracker: "Shoe Health",
                  ActivityMap: "Activity Heatmap",
                  RecentActivities: "Recent Activities",
                  MonthlyVolume: "Monthly Volume",
                  HeartRate: "Heart Rate Stats",
                  PersonalBests: "Personal Bests",
                  RacePredictor: "Race Predictor",
                  ActivityMix: "Activity Mix",
                  YearToDate: "Year to Date",
                  AllTimeStats: "All Time Stats",
                  ActiveGoals: "Active Goals List",
                  TrainingLoad: "Training Load (ATL/CTL)",
                  BestEfforts: "Estimated Best Efforts",
                  Badges: "Milestones & Badges",
                };
                const title = WIDGET_NAMES[id] || id;
                return (
                  <View
                    key={id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: theme.colors.background,
                      padding: 12,
                      borderRadius: 8,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      opacity: 0.7,
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => handleToggleWidget(id)}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: theme.colors.textSecondary,
                        marginRight: 12,
                      }}
                    />
                    <Typography
                      style={{
                        flex: 1,
                        fontSize: 14,
                        color: theme.colors.textSecondary,
                      }}
                    >
                      {title}
                    </Typography>
                  </View>
                );
              })}

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.primary + "44",
  },
  heroLeft: { flex: 1 },
  heroLabel: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  heroValueRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  heroNumber: {
    fontSize: 60,
    fontWeight: "800",
    color: theme.colors.primary,
    lineHeight: 68,
  },
  heroDays: {
    fontSize: 18,
    color: theme.colors.textSecondary,
    fontWeight: "600",
  },
  heroSub: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 6 },
  heroRight: { alignItems: "flex-end" },
  heroStatPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.background,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  heroPillText: { fontSize: 12, color: theme.colors.text, fontWeight: "600" },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
  },
  trendBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  trendText: { fontSize: 10, fontWeight: "600" },

  miniRow: { flexDirection: "row" },

  card: { marginBottom: 16 },
  emptyCard: { padding: 20, alignItems: "center", marginBottom: 16 },
  emptyText: { color: theme.colors.textSecondary, fontSize: 13 },

  activityCard: {
    marginBottom: 8,
    padding: 14,
    borderLeftWidth: 3,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actRow: { flexDirection: "row", alignItems: "center" },
  actIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  actInfo: { flex: 1 },
  actName: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  actDate: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  actStats: { alignItems: "flex-end" },
  actStat: { fontSize: 15, fontWeight: "700" },
  actSubStat: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 1 },

  barContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 100,
    gap: 8,
    paddingHorizontal: 8,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    height: "100%",
    justifyContent: "flex-end",
  },
  barValue: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  barTrack: {
    width: "100%",
    height: 70,
    justifyContent: "flex-end",
    backgroundColor: theme.colors.background,
    borderRadius: 4,
  },
  barFill: { width: "100%", borderRadius: 4 },
  barLabel: { fontSize: 10, color: theme.colors.textSecondary, marginTop: 4 },
  barUnit: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },

  mixRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  mixLeft: { flexDirection: "row", alignItems: "center", gap: 6, width: 70 },
  mixType: { fontSize: 12, fontWeight: "600" },
  mixBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: theme.colors.background,
    borderRadius: 3,
    overflow: "hidden",
  },
  mixBarFill: { height: "100%", borderRadius: 3 },
  mixCount: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    width: 24,
    textAlign: "right",
  },

  goalCard: {
    marginBottom: 8,
    padding: 14,
    borderTopWidth: 2,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  goalRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  goalInfo: { flex: 1 },
  goalTitle: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  goalSub: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  goalDays: { alignItems: "center" },
  goalDaysNum: { fontSize: 24, fontWeight: "800", color: theme.colors.primary },
  goalDaysLabel: { fontSize: 10, color: theme.colors.textSecondary },

  badgeCard: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginRight: 10,
    minWidth: 90,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  badgeTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: 6,
    textAlign: "center",
  },
  badgeSub: { fontSize: 9, color: theme.colors.textSecondary, marginTop: 2 },

  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 34,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text,
    marginBottom: 8,
  },
  sheetBody: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 4,
  },
  sheetRow: {
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    padding: 12,
  },
  sheetRowLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.primary,
    marginBottom: 3,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sheetRowDesc: { fontSize: 12, color: theme.colors.text, lineHeight: 18 },
  sheetClose: {
    marginTop: 20,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
});
