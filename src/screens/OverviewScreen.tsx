import React, { useMemo, useState, useCallback, useEffect } from "react";
import { useNavigation } from "@react-navigation/native";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  Linking,
  Image,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "../theme";
import { StaggerItem } from "../components/Stagger";
import { PressableScale } from "../components/PressableScale";
import { Skeleton } from "../components/Skeleton";
import { StravaService } from "../services/strava";
import { AIService } from "../services/ai";
import { computeAllProgress, computeProgress } from "../services/goalProgress";
import { BadgeMedal } from "../components/BadgeMedal";
import { TodayHero } from "../components/TodayHero";
import { WidgetCatalog, WidgetCatalogEntry } from "../components/WidgetCatalog";
import { BottomSheet } from "../components/BottomSheet";
import { HelperRow, SheetCTA } from "../components/SheetUI";
import { WIDGET_TITLES, WIDGET_FAMILY, familyStyle } from "../utils/widgetFamilies";
import { lineProps, pieProps, barProps, chartBase, pointerConfig } from "../utils/chartTheme";
import { decodePolyline } from "../utils/polyline";
import { workoutIcon } from "../utils/workoutKinds";
import type { WorkoutKind } from "../store/useStore";
import { WidgetCard } from "../components/WidgetCard";
import { Card } from "../components/Card";
import { Typography } from "../components/Typography";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { Pulsing } from "../components/Pulsing";
import { HeatmapCalendar } from "../components/HeatmapCalendar";
import { DonutRing } from "../components/DonutRing";
import { LineChart, PieChart, BarChart } from "react-native-gifted-charts";
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
  PersonStanding,
  CalendarDays,
  BarChart3,
  Wind,
  Target,
  Timer,
  MapPin,
  Settings as SettingsIcon,
  ChevronUp,
  ChevronDown,
  Info,
  Quote,
  AlertTriangle,
  ThumbsUp,
  Star,
  Bike,
  Waves,
  PieChart as PieChartIcon,
  Home,
  Image as ImageIcon,
  Gauge,
  Minus,
  ArrowRight,
  Check,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  computeMilestones,
  computeBestEfforts,
  computeTrainingLoad,
  TrainingLoad,
  getAllMilestoneDefs,
} from "../services/milestones";
import { Activity as ActivityType } from "../store/useStore";
import * as Haptics from "expo-haptics";
import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
  subWeeks,
  startOfMonth,
  endOfMonth,
  subMonths,
} from "date-fns";

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
    setHRZones,
    setLastSyncedAt,
    lastSyncedAt,
    addCheckIn,
    updateGoal,
    shoes,
    injuries,
    weeklyDigest,
    userProfile,
    hrZones,
    starredSegments,
    setStarredSegments,
    athleteStats,
    setAthleteStats,
  } = useStore();
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [infoSheet, setInfoSheet] = useState<{
    title: string;
    body: string;
    rows?: { label: string; desc: string }[];
  } | null>(null);
  const [layoutModalVisible, setLayoutModalVisible] = useState(false);
  const { settings, updateSettings } = useStore();
  const coachInsight = useMemo(
    () => AIService.getMotivationalInsight(activities, userStats),
    [activities, userStats]
  );

  const defaultLayout = [
    "TodayHero",
    "HeroBanner",
    "CurrentFocus",
    "UpcomingWorkout",
    "CoachInsight",
    "WeeklyDigest",
    "RecoveryAdvisor",
    "WellnessScore",
    "InjuryAlert",
    "WeeklyGoalTracker",
    "ThisWeek",
    "PaceTrend",
    "Cadence",
    "IntensityDistribution",
    "SufferTrend",
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
    "KudosLeaderboard",
    "StarredSegments",
    // Default-off widgets — visible in the customise modal so users can opt in.
    "StravaTotals",
    "SportSplit",
    "TrainerRatio",
    "PhotoStream",
    "PowerZones",
    "EnergyExpenditure",
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

  // Reactive Strava-auth flag. `StravaService.isAuthenticated()` is sync but
  // depends on `initialize()` having loaded the token from secure storage; if
  // we read it inline during render before initialize resolves, we wrongly
  // surface "Strava not connected" on a fresh app start.
  const [stravaConnected, setStravaConnected] = useState(false);
  useEffect(() => {
    let alive = true;
    StravaService.initialize().then(() => {
      if (alive) setStravaConnected(StravaService.isAuthenticated());
    });
    return () => { alive = false; };
  }, [lastSyncedAt]);

  // First-render fetch for athlete stats (Strava lifetime / YTD / recent
  // rollups) and starred segments. Only run if authenticated and the cache
  // is empty — onRefresh keeps them fresh after that.
  const activeWidgets = settings.widgetLayout || defaultLayout;
  const needsAthleteStats = activeWidgets.includes('StravaTotals') && !athleteStats;
  const needsStarred = activeWidgets.includes('StarredSegments') && (!starredSegments || starredSegments.length === 0);
  useEffect(() => {
    if (!StravaService.isAuthenticated()) return;
    if (needsAthleteStats) {
      StravaService.fetchAthleteStats()
        .then((res) => setAthleteStats(res))
        .catch((e) => console.warn('Could not fetch athlete stats:', e));
    }
    if (needsStarred) {
      StravaService.fetchStarredSegments(10)
        .then((res) => { if (res) setStarredSegments(res); })
        .catch((e) => console.warn('Could not fetch starred segments:', e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsAthleteStats, needsStarred]);

  // Photo stream: pull thumbs from the 10 most recent activities. Kept in
  // local state so we don't bloat persistence with image URLs that expire.
  const photoStreamEnabled = activeWidgets.includes('PhotoStream');
  const [photoThumbs, setPhotoThumbs] = useState<Array<{ url: string; activityId: string }>>([]);
  const [photoLoading, setPhotoLoading] = useState(false);
  useEffect(() => {
    if (!photoStreamEnabled || !StravaService.isAuthenticated()) return;
    if (photoThumbs.length > 0) return;
    const recent = [...activities]
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
      .slice(0, 10);
    if (!recent.length) return;
    setPhotoLoading(true);
    Promise.all(
      recent.map((a) =>
        StravaService.fetchActivityPhotos(a.id)
          .then((photos) =>
            (photos || [])
              .map((p) => ({ url: p.urls?.['600'] || '', activityId: a.id }))
              .filter((p) => !!p.url),
          )
          .catch(() => []),
      ),
    )
      .then((results) => {
        const flat = results.flat();
        setPhotoThumbs(flat);
      })
      .finally(() => setPhotoLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoStreamEnabled, activities.length]);

  // PowerZones: fetch zones for the most recent ride with watts.
  const powerZonesEnabled = activeWidgets.includes('PowerZones');
  const recentRideWithWatts = useMemo(() => {
    return [...activities]
      .filter((a) => a.type === 'Ride' && (a.averageWatts || 0) > 0)
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];
  }, [activities]);
  const [powerBuckets, setPowerBuckets] = useState<Array<{ min: number; max: number; time: number }> | null>(null);
  useEffect(() => {
    if (!powerZonesEnabled || !recentRideWithWatts || !StravaService.isAuthenticated()) return;
    const cached = recentRideWithWatts.zones?.find((z) => z.type === 'power');
    if (cached) {
      setPowerBuckets(cached.buckets);
      return;
    }
    StravaService.fetchActivityZones(recentRideWithWatts.id)
      .then((res) => {
        if (!res) return;
        const p = res.find((z) => z.type === 'power');
        if (p) setPowerBuckets(p.distribution_buckets);
      })
      .catch(() => {});
  }, [powerZonesEnabled, recentRideWithWatts]);



  const trainingLoad = useMemo<TrainingLoad>(
    () => computeTrainingLoad(activities),
    [activities],
  );

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRefreshing(true);
    try {
      await StravaService.initialize();
      if (StravaService.isAuthenticated()) {
        const newActivities = await StravaService.syncActivities();
        setActivities(newActivities);
        setLastSyncedAt(new Date().toISOString());
        // Re-derive AI-goal progress against the new activity set.
        const { goals: latestGoals, setGoals } = useStore.getState();
        setGoals(computeAllProgress(latestGoals, newActivities));
        // Fetch Strava HR zones
        try {
          const zones = await StravaService.fetchZones();
          if (zones.length) setHRZones(zones);
        } catch (zErr) {
          console.warn('Could not fetch HR zones:', zErr);
        }
        try {
          const { stats, athlete } = await StravaService.fetchAthleteStats();
          setLifetimeStats(stats);
          setAthleteStats({ stats, athlete });
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
        try {
          const segs = await StravaService.fetchStarredSegments(10);
          if (segs) setStarredSegments(segs);
        } catch (segErr) {
          console.warn("Could not fetch starred segments:", segErr);
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
  }, [setActivities, setLifetimeStats, setToast, setHRZones, setLastSyncedAt, setAthleteStats, setStarredSegments]);

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
    const maxHR = userProfile?.maxHR || 190;
    const easyCut = maxHR * 0.75; // easy below 75% of max HR
    const hardCut = maxHR * 0.85; // hard at/above 85%; moderate in between
    let easy = 0,
      moderate = 0,
      hard = 0;
    let usedZones = false;
    for (const a of activities) {
      const buckets = a.zones?.find((z) => z.type === 'heartrate')?.buckets;
      if (buckets && buckets.length) {
        // Strava's own time-in-zone (seconds): Z1-Z2 easy, Z3 moderate, Z4+ hard.
        usedZones = true;
        buckets.forEach((b, i) => {
          const t = Number.isFinite(b.time) ? b.time : 0;
          if (i <= 1) easy += t;
          else if (i === 2) moderate += t;
          else hard += t;
        });
      } else if (a.averageHeartRate && a.averageHeartRate > 0) {
        // Fallback for activities without cached zone data: weight the whole
        // session by its moving time, banded by average HR.
        const t = a.movingTime || 0;
        if (a.averageHeartRate < easyCut) easy += t;
        else if (a.averageHeartRate < hardCut) moderate += t;
        else hard += t;
      }
    }
    const total = easy + moderate + hard;
    if (total <= 0) return null;
    const easyPct = Math.round((easy / total) * 100);
    const hardPct = Math.round((hard / total) * 100);
    // Moderate takes the remainder so the three bands always sum to exactly 100.
    const moderatePct = Math.max(0, 100 - easyPct - hardPct);
    return { easyPct, moderatePct, hardPct, usedZones };
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

  // Monthly distance for the last 4 calendar months, ending with the current month.
  // Buckets by year+month so activities from the same month in different years
  // don't collapse together.
  const monthlyData = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; start: Date; end: Date; km: number }[] = [];
    for (let i = 3; i >= 0; i--) {
      const ref = subMonths(now, i);
      buckets.push({
        key: format(ref, "yyyy-MM"),
        label: format(ref, "MMM"),
        start: startOfMonth(ref),
        end: endOfMonth(ref),
        km: 0,
      });
    }
    activities.forEach((a) => {
      const d = parseISO(a.startDate);
      const k = format(d, "yyyy-MM");
      const bucket = buckets.find((b) => b.key === k);
      if (bucket) bucket.km += a.distance / 1000;
    });
    return buckets.map((b) => ({ month: b.label, km: Math.round(b.km) }));
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

  // Pace trend: avg pace per week for last 8 weeks (runs only)
  const paceTrend = useMemo(() => {
    const runs = activities.filter(a => a.type === 'Run' && a.averageSpeed > 0);
    const weeks: { label: string; pace: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const wStart = subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), i);
      const wEnd = endOfWeek(wStart, { weekStartsOn: 1 });
      const wRuns = runs.filter(a => isWithinInterval(parseISO(a.startDate), { start: wStart, end: wEnd }));
      const avgPace = wRuns.length
        ? wRuns.reduce((s, a) => s + 1000 / a.averageSpeed / 60, 0) / wRuns.length
        : 0;
      weeks.push({ label: format(wStart, 'MMM d'), pace: avgPace });
    }
    return weeks;
  }, [activities]);

  // Cadence stats: avg cadence over last 4 weeks (runs)
  const cadenceStats = useMemo(() => {
    // Sort newest → oldest so "recent" really means recent regardless of the
    // store's insertion order.
    const runs = activities
      .filter(a => a.type === 'Run' && (a.averageCadence || 0) > 0)
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    if (!runs.length) return null;
    const last4w = runs.filter(a => (Date.now() - new Date(a.startDate).getTime()) / 86400000 <= 28);
    if (!last4w.length) return null;
    const avg = Math.round(last4w.reduce((s, a) => s + (a.averageCadence || 0), 0) / last4w.length);
    // Strava returns cadence as steps/min for one foot; multiply by 2 for total spm
    const spm = avg * 2;
    const trend = runs.length > 1
      ? (() => {
          const half = Math.max(1, Math.min(5, Math.floor(runs.length / 2)));
          const recent = runs.slice(0, half).reduce((s, a) => s + (a.averageCadence || 0), 0) / half;
          const olderCount = Math.max(1, runs.length - half);
          const older = runs.slice(half).reduce((s, a) => s + (a.averageCadence || 0), 0) / olderCount;
          return recent > older ? 'up' : recent < older - 1 ? 'down' : 'flat';
        })()
      : 'flat';
    return { spm, trend };
  }, [activities]);

  // Wellness score: 0-100 derived from TSB, consistency, avg HR vs resting
  const wellnessScore = useMemo(() => {
    let score = 50;
    // TSB contribution (max ±20)
    if (trainingLoad.tsb !== 0) score += Math.max(-20, Math.min(20, trainingLoad.tsb));
    // Consistency (last 30 days active days, max +20)
    score += Math.min(20, consistencyScore * 0.2);
    // HR zone: if avg HR is close to resting it's good (+10), high is bad (-10)
    if (hrStats && userProfile.restingHR > 0) {
      const hrDelta = hrStats.avg - userProfile.restingHR;
      if (hrDelta < 40) score += 10;
      else if (hrDelta > 70) score -= 10;
    }
    // Recent rest: if ran last 2 days lose some (-5)
    const daysSinceLast = activities.length
      ? (Date.now() - new Date([...activities].sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0].startDate).getTime()) / 86400000
      : 7;
    if (daysSinceLast < 1) score -= 5;
    if (daysSinceLast > 2) score += 5;
    const clamped = Math.round(Math.max(0, Math.min(100, score)));
    const label = clamped >= 75 ? 'Great' : clamped >= 50 ? 'Good' : clamped >= 30 ? 'Fair' : 'Low';
    const color = clamped >= 75 ? theme.colors.success : clamped >= 50 ? '#0ea5e9' : clamped >= 30 ? '#f59e0b' : theme.colors.error;
    return { score: clamped, label, color };
  }, [trainingLoad, consistencyScore, hrStats, userProfile, activities]);

  // Upcoming workout from first active non-simple AI goal
  const upcomingWorkout = useMemo(() => {
    const aiGoal = goals.find(g => !g.isSimple && (g.phases?.length || g.keyWorkout));
    if (!aiGoal) return null;
    // Find current phase: earliest phase index relative to days remaining
    const totalDays = Math.max(1, (new Date(aiGoal.targetDate).getTime() - Date.now()) / 86400000);
    if (aiGoal.phases && aiGoal.phases.length > 0) {
      const phaseIdx = Math.min(
        aiGoal.phases.length - 1,
        Math.floor((1 - totalDays / Math.max(1, aiGoal.daysRemaining + (aiGoal.phases.length * 7))) * aiGoal.phases.length)
      );
      const phase = aiGoal.phases[Math.max(0, phaseIdx)];
      return { goalTitle: aiGoal.title, phaseName: phase.name, workout: phase.keyWorkout, weeklyTarget: phase.weeklyVolumeTarget };
    }
    return { goalTitle: aiGoal.title, phaseName: aiGoal.phase?.split('\n')[0] || 'Current Phase', workout: aiGoal.keyWorkout, weeklyTarget: aiGoal.weeklyVolume?.target };
  }, [goals]);

  // Last 7 days per-day km (for the ThisWeek mini sparkline)
  const last7DaysKm = useMemo(() => {
    const days: { day: string; km: number; hasAct: boolean }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const ymd = d.toISOString().slice(0, 10);
      const km = activities
        .filter((a) => a.startDate.slice(0, 10) === ymd)
        .reduce((s, a) => s + a.distance / 1000, 0);
      days.push({ day: format(d, 'EEEEE'), km, hasAct: km > 0 });
    }
    return days;
  }, [activities]);

  // 12-month volume bars (rolling year ending current month).
  const yearMonthly = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; km: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const ref = subMonths(now, i);
      buckets.push({ key: format(ref, 'yyyy-MM'), label: format(ref, 'MMM'), km: 0 });
    }
    activities.forEach((a) => {
      const k = format(parseISO(a.startDate), 'yyyy-MM');
      const b = buckets.find((x) => x.key === k);
      if (b) b.km += a.distance / 1000;
    });
    return buckets.map((b) => ({ ...b, km: Math.round(b.km) }));
  }, [activities]);

  // 8-week training-load history (ATL/CTL trend).
  const tlSparkline = useMemo(() => {
    if (!activities.length) return [] as { atl: number; ctl: number }[];
    const sorted = [...activities].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );
    if (!sorted.length) return [];
    const startMs = new Date(sorted[0].startDate).getTime();
    const totalDays = Math.max(1, Math.ceil((Date.now() - startMs) / 86400000));
    const daysToShow = Math.min(56, totalDays);
    const out: { atl: number; ctl: number }[] = [];
    for (let d = daysToShow - 1; d >= 0; d--) {
      const cutoff = Date.now() - d * 86400000;
      const subset = sorted.filter((a) => new Date(a.startDate).getTime() <= cutoff);
      const tl = computeTrainingLoad(subset as ActivityType[]);
      out.push({ atl: tl.atl, ctl: tl.ctl });
    }
    return out;
  }, [activities]);

  // Cadence 8-week sparkline (avg cadence per week).
  const cadenceSparkline = useMemo(() => {
    const runs = activities.filter((a) => a.type === 'Run' && (a.averageCadence || 0) > 0);
    const weeks: { value: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const ws = subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), i);
      const we = endOfWeek(ws, { weekStartsOn: 1 });
      const wr = runs.filter((a) => isWithinInterval(parseISO(a.startDate), { start: ws, end: we }));
      const avg = wr.length
        ? Math.round((wr.reduce((s, a) => s + (a.averageCadence || 0), 0) / wr.length) * 2)
        : 0;
      weeks.push({ value: avg });
    }
    return weeks;
  }, [activities]);

  // 5-zone HR distribution histogram (counts per zone across all activities).
  const hrZoneCounts = useMemo(() => {
    const zones = hrZones.length >= 5
      ? hrZones.slice(0, 5).map((z, i) => ({ min: z.min, max: z.max < 0 ? 999 : z.max, label: `Z${i + 1}` }))
      : [
          { min: 0, max: 114, label: 'Z1' },
          { min: 115, max: 134, label: 'Z2' },
          { min: 135, max: 154, label: 'Z3' },
          { min: 155, max: 169, label: 'Z4' },
          { min: 170, max: 999, label: 'Z5' },
        ];
    const counts = zones.map(() => 0);
    activities.forEach((a) => {
      const hr = a.averageHeartRate || 0;
      if (!hr) return;
      const idx = zones.findIndex((z) => hr >= z.min && hr <= z.max);
      if (idx >= 0) counts[idx]++;
    });
    const total = counts.reduce((s, c) => s + c, 0) || 1;
    return zones.map((z, i) => ({ label: z.label, count: counts[i], pct: counts[i] / total }));
  }, [activities, hrZones]);

  // ── Suffer-score trend: weekly average over the last 8 weeks ──
  const sufferTrend = useMemo(() => {
    const withSuffer = activities.filter((a) => (a.sufferScore || 0) > 0);
    const weeks: { label: string; avg: number; count: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const ws = subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), i);
      const we = endOfWeek(ws, { weekStartsOn: 1 });
      const wActs = withSuffer.filter((a) => isWithinInterval(parseISO(a.startDate), { start: ws, end: we }));
      const sum = wActs.reduce((s, a) => s + (a.sufferScore || 0), 0);
      const avg = wActs.length ? sum / wActs.length : 0;
      weeks.push({ label: format(ws, 'MMM d'), avg, count: wActs.length });
    }
    return weeks;
  }, [activities]);

  // ── Kudos leaderboard: top 5 activities by kudos_count ──
  const topKudos = useMemo(() => {
    return [...activities]
      .filter((a) => (a.kudosCount || 0) > 0)
      .sort((a, b) => (b.kudosCount || 0) - (a.kudosCount || 0))
      .slice(0, 5);
  }, [activities]);

  // ── Sport split: km by sport for this calendar year ──
  const sportSplit = useMemo(() => {
    const year = new Date().getFullYear();
    const totals: Record<string, number> = {};
    activities
      .filter((a) => new Date(a.startDate).getFullYear() === year)
      .forEach((a) => {
        totals[a.type] = (totals[a.type] || 0) + a.distance / 1000;
      });
    const entries = Object.entries(totals)
      .map(([type, km]) => ({ type, km: Math.round(km) }))
      .filter((e) => e.km > 0)
      .sort((a, b) => b.km - a.km);
    const total = entries.reduce((s, e) => s + e.km, 0);
    return { entries, total };
  }, [activities]);

  // ── Trainer ratio (rides only, last 30 days) ──
  const trainerRatio = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    const rides = activities.filter((a) => a.type === 'Ride' && new Date(a.startDate).getTime() >= cutoff);
    if (!rides.length) return null;
    const trainerCount = rides.filter((a) => a.trainer === true).length;
    const outdoorCount = rides.length - trainerCount;
    return {
      total: rides.length,
      trainerCount,
      outdoorCount,
      trainerPct: Math.round((trainerCount / rides.length) * 100),
      outdoorPct: Math.round((outdoorCount / rides.length) * 100),
    };
  }, [activities]);

  // ── Energy expenditure: last 7 days calories per day ──
  const energy7d = useMemo(() => {
    const days: { day: string; kcal: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const ymd = d.toISOString().slice(0, 10);
      const kcal = activities
        .filter((a) => a.startDate.slice(0, 10) === ymd)
        .reduce((s, a) => s + (a.calories || 0), 0);
      days.push({ day: format(d, 'EEEEE'), kcal: Math.round(kcal) });
    }
    const total = days.reduce((s, d) => s + d.kcal, 0);
    const avg = Math.round(total / 7);
    return { days, total, avg };
  }, [activities]);

  // PB times (in seconds) for the PersonalBests tile grid — built off the
  // stored `bestEfforts` map.
  const pbDistances: { meters: number; label: string }[] = [
    { meters: 1000, label: '1K' },
    { meters: 5000, label: '5K' },
    { meters: 10000, label: '10K' },
  ];

  // Best-Efforts top-3 with delta vs PR. PR is the all-time best across
  // bestEfforts; if the entry is the PR itself, delta is 0.
  const bestEffortsList = useMemo(() => {
    const entries = Object.entries(bestEfforts)
      .map(([dist, e]) => ({ dist: Number(dist), ...e }))
      .sort((a, b) => a.dist - b.dist);
    return entries.slice(0, 3);
  }, [bestEfforts]);

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
          <PressableScale
            haptic="selection"
            accessibilityLabel="Customise widgets"
            accessibilityRole="button"
            onPress={() => setLayoutModalVisible(true)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "rgba(255,255,255,0.05)",
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
              borderRadius: theme.borderRadius.md,
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
          </PressableScale>
        </View>
        {(settings.widgetLayout || defaultLayout).map((widgetId, idx) => {
          switch (widgetId) {
            case "TodayHero": {
              const activeGoal = goals.find(g => !g.isSimple && (g.phases?.length || 0) > 0);
              const stravaConnected = StravaService.isAuthenticated();
              const handleQuickCheckIn = (completed: boolean) => {
                if (!activeGoal) return;
                const today = new Date();
                const dayOfWeek = (((today.getDay() + 6) % 7) as 0|1|2|3|4|5|6);
                const date = today.toISOString().slice(0, 10);
                const presc = activeGoal.phases?.[0]?.schedule?.find(p => p.dayOfWeek === dayOfWeek);
                addCheckIn(activeGoal.id, {
                  date,
                  dayOfWeek,
                  source: 'MANUAL',
                  workoutKind: presc?.kind || 'EASY',
                  completed,
                });
                const fresh = useStore.getState().goals.find(g => g.id === activeGoal.id);
                if (fresh) updateGoal(computeProgress(fresh, useStore.getState().activities));
                setToast({
                  title: completed ? 'Logged ✓' : 'Skipped',
                  message: completed ? "Today's workout marked complete." : 'No worries — pick it back up tomorrow.',
                  type: 'success',
                });
              };
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <TodayHero
                    activeGoal={activeGoal}
                    currentStreak={userStats.currentStreak}
                    lastSyncedAt={lastSyncedAt}
                    stravaConnected={stravaConnected}
                    onMarkDone={() => handleQuickCheckIn(true)}
                    onSkip={() => handleQuickCheckIn(false)}
                    onSync={() => onRefresh()}
                    onCreateGoal={() => (navigation as any).navigate('Goals')}
                  />
                </StaggerItem>
              );
            }
            case "WeeklyGoalTracker":
              if (!(userProfile.weeklyGoalKm > 0)) return null;
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["WeeklyGoalTracker"]}
                    title={WIDGET_TITLES["WeeklyGoalTracker"]}
                    icon={Target}
                  >
                    {(() => {
                      const goalKm = userProfile.weeklyGoalKm;
                      const currKm = Number(thisWeekStats.km);
                      const pct = Math.min(1, currKm / Math.max(1, goalKm));
                      const accent = familyStyle('activity').accent;
                      const ringColor = currKm >= goalKm ? theme.colors.success : accent;
                      const ringGradient: [string, string] = currKm >= goalKm
                        ? [theme.colors.success, '#34D399']
                        : familyStyle('activity').gradient;
                      return (
                        <>
                          <View style={styles.weeklyRingRow}>
                            <DonutRing
                              size={132}
                              stroke={12}
                              progress={pct}
                              color={ringColor}
                              gradient={ringGradient}
                              trackColor={theme.colors.background}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                <AnimatedNumber
                                  value={currKm}
                                  decimals={1}
                                  style={[styles.weeklyRingNum, { color: ringColor }] as any}
                                />
                              </View>
                              <Typography style={styles.weeklyRingGoal}>of {goalKm} km</Typography>
                              <Typography style={[styles.weeklyRingPct, { color: ringColor }]}>
                                {Math.round(pct * 100)}%
                              </Typography>
                            </DonutRing>
                          </View>
                          <View style={styles.weekDotRow}>
                            {last7DaysKm.map((d, i) => (
                              <View key={i} style={styles.weekDotCol}>
                                <View
                                  style={[
                                    styles.weekDot,
                                    {
                                      backgroundColor: d.hasAct ? ringColor : 'transparent',
                                      borderColor: d.hasAct ? ringColor : theme.colors.border,
                                    },
                                  ]}
                                />
                                <Typography style={styles.weekDotLbl}>{d.day}</Typography>
                              </View>
                            ))}
                          </View>
                        </>
                      );
                    })()}
                  </WidgetCard>
                </StaggerItem>
              );
            case "IntensityDistribution": {
              if (!intensityDist) return null;
              const idMaxHR = Math.round(userProfile.maxHR || 190);
              const intensityInfo = {
                title: "Intensity Distribution",
                body: `Time in each effort band${intensityDist.usedZones ? ", weighted by Strava heart-rate zones" : ", estimated from average HR until you open activities to load their zones"}. The polarized 80/20 model keeps ~80% easy and most of the rest hard — the moderate "gray zone" should stay small, since too much of it ("junk miles") is the classic mistake.`,
                rows: [
                  { label: "Easy (Z1–Z2)", desc: `Below ${Math.round(idMaxHR * 0.75)} bpm · ~80% of training` },
                  { label: "Moderate (Z3)", desc: `${Math.round(idMaxHR * 0.75)}–${Math.round(idMaxHR * 0.85)} bpm · keep this small` },
                  { label: "Hard (Z4–Z5)", desc: `Above ${Math.round(idMaxHR * 0.85)} bpm · the other ~15–20%` },
                ],
              };
              const { easyPct, moderatePct, hardPct } = intensityDist;
              // Assess against the polarized 80/20 target, not a single easy %:
              // the worst pattern is too much MODERATE (the gray-zone "junk
              // miles"), then too little easy, then no real hard stimulus.
              const status =
                moderatePct >= 30
                  ? { label: 'Too much gray zone', color: theme.colors.error }
                  : easyPct < 70
                    ? { label: 'Easy days too hard', color: theme.colors.error }
                    : hardPct < 8 && easyPct >= 88
                      ? { label: 'Add some intensity', color: theme.colors.warning }
                      : easyPct >= 75 && moderatePct <= 22
                        ? { label: 'Nicely polarized', color: theme.colors.success }
                        : { label: 'Build more polarization', color: theme.colors.warning };
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["IntensityDistribution"]}
                    title={WIDGET_TITLES["IntensityDistribution"]}
                    icon={Activity}
                    onPress={() => setInfoSheet(intensityInfo)}
                    action={
                      <TouchableOpacity activeOpacity={0.7} onPress={() => setInfoSheet(intensityInfo)}>
                        <Info size={14} color={theme.colors.textSecondary} />
                      </TouchableOpacity>
                    }
                  >
                    <View style={styles.bigStatRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                        <Typography style={[styles.bigStatNum, { color: theme.colors.success }]}>
                          {easyPct}
                        </Typography>
                        <Typography style={styles.bigStatUnit}>% easy</Typography>
                      </View>
                      <View style={[styles.bigStatChip, { backgroundColor: status.color + '22' }]}>
                        <Typography style={[styles.bigStatChipTxt, { color: status.color }]}>
                          {status.label}
                        </Typography>
                      </View>
                    </View>
                    <View style={styles.intensityBarTrack}>
                      {intensityDist.easyPct > 0 && (
                        <View style={{ width: `${intensityDist.easyPct}%`, backgroundColor: theme.colors.success }} />
                      )}
                      {intensityDist.moderatePct > 0 && (
                        <View style={{ width: `${intensityDist.moderatePct}%`, backgroundColor: theme.colors.warning }} />
                      )}
                      {intensityDist.hardPct > 0 && (
                        <View style={{ width: `${intensityDist.hardPct}%`, backgroundColor: theme.colors.error }} />
                      )}
                    </View>
                    <View style={styles.intensityLegendRow}>
                      <View style={styles.intensityLegendItem}>
                        <View style={[styles.intensityDot, { backgroundColor: theme.colors.success }]} />
                        <Typography style={styles.intensityLegendTxt}>{intensityDist.easyPct}% easy</Typography>
                      </View>
                      <View style={styles.intensityLegendItem}>
                        <View style={[styles.intensityDot, { backgroundColor: theme.colors.warning }]} />
                        <Typography style={styles.intensityLegendTxt}>{intensityDist.moderatePct}% mod</Typography>
                      </View>
                      <View style={styles.intensityLegendItem}>
                        <View style={[styles.intensityDot, { backgroundColor: theme.colors.error }]} />
                        <Typography style={styles.intensityLegendTxt}>{intensityDist.hardPct}% hard</Typography>
                      </View>
                    </View>
                  </WidgetCard>
                </StaggerItem>
              );
            }
            case "RecoveryAdvisor":
              if (!recoveryScore) return null;
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["RecoveryAdvisor"]}
                    title={WIDGET_TITLES["RecoveryAdvisor"]}
                    icon={Heart}
                  >
                    {(() => {
                      // Map TSB band to a 0-1 ring score: very tired → 0, fresh → 1.
                      const tsbRatio = Math.max(0, Math.min(1, (trainingLoad.tsb + 25) / 40));
                      return (
                        <View style={styles.recoveryRow}>
                          <DonutRing
                            size={88}
                            stroke={9}
                            progress={tsbRatio}
                            color={recoveryScore.color}
                            gradient={[recoveryScore.color, familyStyle('recovery').accent]}
                            trackColor={theme.colors.background}
                          >
                            <Typography style={[styles.recoveryRingNum, { color: recoveryScore.color }]}>
                              {trainingLoad.tsb > 0 ? '+' : ''}
                              {trainingLoad.tsb}
                            </Typography>
                            <Typography style={styles.recoveryRingLbl}>TSB</Typography>
                          </DonutRing>
                          <View style={{ flex: 1, marginLeft: 14 }}>
                            <Typography style={[styles.recoveryStatus, { color: recoveryScore.color }]}>
                              {recoveryScore.status}
                            </Typography>
                            <Typography style={styles.recoveryDesc}>
                              {recoveryScore.desc}
                            </Typography>
                          </View>
                        </View>
                      );
                    })()}
                  </WidgetCard>
                </StaggerItem>
              );
            case "HeroBanner":
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["HeroBanner"]}
                    title={WIDGET_TITLES["HeroBanner"]}
                    icon={Flame}
                  >
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
                              <Flame color="#fff" size={28} fill="#fff" />
                            </Pulsing>
                          ) : (
                            <Flame color="#fff" size={28} />
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
                          <MapPin color="#fff" size={13} />
                          <View>
                            <Typography style={styles.heroChipVal}>{userStats.totalKm}</Typography>
                            <Typography style={styles.heroChipLbl}>km total</Typography>
                          </View>
                        </View>
                        <View style={styles.heroChip}>
                          <Trophy color="#fff" size={13} />
                          <View>
                            <Typography style={styles.heroChipVal}>{userStats.totalRuns}</Typography>
                            <Typography style={styles.heroChipLbl}>runs</Typography>
                          </View>
                        </View>
                        <View style={styles.heroChip}>
                          <Footprints color="#fff" size={13} />
                          <View>
                            <Typography style={styles.heroChipVal}>{userStats.totalWalks || 0}</Typography>
                            <Typography style={styles.heroChipLbl}>walks</Typography>
                          </View>
                        </View>
                      </View>
                    </LinearGradient>
                  </WidgetCard>
                </StaggerItem>
              );
            case "CurrentFocus":
              if (!activeGoal) return null;
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["CurrentFocus"]}
                    title={WIDGET_TITLES["CurrentFocus"]}
                    icon={Target}
                  >
                    <View style={{ paddingLeft: 30, position: 'relative' }}>
                      <View style={{ position: 'absolute', left: 0, top: -4 }}>
                        <Quote size={24} color={familyStyle('plan').accent} />
                      </View>
                      <Typography style={styles.focusQuoteTitle}>
                        {activeGoal.title}
                      </Typography>
                      {activeGoal.phases && activeGoal.phases.length > 0 ? (
                        <>
                          <Typography style={styles.focusQuoteBody}>
                            {activeGoal.phases[0].description}
                          </Typography>
                          <Typography style={styles.focusQuoteCaption}>
                            — Phase: {activeGoal.phases[0].name}
                          </Typography>
                        </>
                      ) : (
                        <Typography style={styles.focusQuoteCaption}>
                          — {activeGoal.phase.split('\n')[0]}
                        </Typography>
                      )}
                    </View>
                  </WidgetCard>
                </StaggerItem>
              );
            case "WeeklyDigest":
              if (!weeklyDigest) return null;
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["WeeklyDigest"]}
                    title={WIDGET_TITLES["WeeklyDigest"]}
                    icon={Zap}
                  >
                    <Typography
                      style={{
                        fontSize: 14,
                        color: theme.colors.text,
                        lineHeight: 22,
                      }}
                    >
                      {weeklyDigest.tip || weeklyDigest.summary}
                    </Typography>
                  </WidgetCard>
                </StaggerItem>
              );
            case "InjuryAlert":
              if (injuries.length === 0) return null;
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["InjuryAlert"]}
                    title={WIDGET_TITLES["InjuryAlert"]}
                    icon={AlertTriangle}
                  >
                    <View style={styles.injuryBand}>
                      <AlertTriangle color={theme.colors.warning} size={20} />
                      <View style={{ flex: 1 }}>
                        <Typography style={styles.injuryTitle}>
                          {injuries.length} active issue{injuries.length > 1 ? 's' : ''}
                        </Typography>
                        <Typography style={styles.injuryBody}>
                          Prioritize active recovery and don't push through sharp pain.
                        </Typography>
                      </View>
                      <View style={styles.injuryCount}>
                        <Typography style={styles.injuryCountNum}>{injuries.length}</Typography>
                      </View>
                    </View>
                  </WidgetCard>
                </StaggerItem>
              );
            case "ShoeTracker":
              if (shoes.length === 0) return null;
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["ShoeTracker"]}
                    title={WIDGET_TITLES["ShoeTracker"]}
                    icon={Footprints}
                    onPress={() => (navigation as any).navigate('GearHealth')}
                  >
                    {[...shoes]
                      .sort((a, b) => b.distance - a.distance)
                      .slice(0, 3)
                      .map((shoe) => {
                        const limit = 600;
                        const pct = Math.min(shoe.distance / limit, 1);
                        const isWarn = shoe.distance > 480;
                        const ringColor = isWarn
                          ? theme.colors.error
                          : familyStyle('activity').accent;
                        return (
                          <View key={shoe.id} style={styles.shoeRow}>
                            <View style={styles.shoeIconWrap}>
                              <Footprints color={ringColor} size={18} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Typography style={styles.shoeName} numberOfLines={1}>
                                {shoe.name}
                              </Typography>
                              {shoe.brand ? (
                                <Typography style={styles.shoeBrand} numberOfLines={1}>
                                  {shoe.brand}
                                </Typography>
                              ) : null}
                              <Typography style={styles.shoeMileage}>
                                {shoe.distance} / {limit} km
                              </Typography>
                            </View>
                            <DonutRing
                              size={54}
                              stroke={6}
                              progress={pct}
                              color={ringColor}
                              gradient={isWarn ? [theme.colors.error, '#F87171'] : familyStyle('activity').gradient}
                              trackColor={theme.colors.background}
                            >
                              <Typography style={styles.shoeRingPct}>
                                {Math.round(pct * 100)}
                              </Typography>
                              <Typography style={styles.shoeRingLbl}>%</Typography>
                            </DonutRing>
                          </View>
                        );
                      })}
                  </WidgetCard>
                </StaggerItem>
              );
            case "YearToDate":
              if (activities.length === 0) return null;
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["YearToDate"]}
                    title={WIDGET_TITLES["YearToDate"]}
                    icon={TrendingUp}
                  >
                    {(() => {
                      const ytdKm = Math.round(
                        activities
                          .filter(
                            (a) =>
                              new Date(a.startDate).getFullYear() ===
                              new Date().getFullYear(),
                          )
                          .reduce((s, a) => s + a.distance / 1000, 0),
                      );
                      const now = new Date();
                      const startOfYear = new Date(now.getFullYear(), 0, 1);
                      const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000) + 1;
                      const yearProgress = dayOfYear / 365;
                      const annualGoal = Math.max(1, (userProfile?.weeklyGoalKm || 25) * 52);
                      const ringPct = Math.min(1, ytdKm / annualGoal);
                      const accent = familyStyle('activity').accent;
                      const maxMonth = Math.max(...yearMonthly.map((m) => m.km), 1);
                      return (
                        <>
                          <View style={styles.ytdHeroRow}>
                            <DonutRing
                              size={108}
                              stroke={10}
                              progress={ringPct}
                              color={accent}
                              gradient={familyStyle('activity').gradient}
                              trackColor={theme.colors.background}
                            >
                              <AnimatedNumber
                                value={ytdKm}
                                style={styles.ytdRingNum as any}
                              />
                              <Typography style={styles.ytdRingLbl}>km</Typography>
                            </DonutRing>
                            <View style={{ flex: 1, marginLeft: 16 }}>
                              <Typography style={styles.ytdGoalLbl}>ANNUAL GOAL</Typography>
                              <Typography style={styles.ytdGoalVal}>{annualGoal} km</Typography>
                              <View style={styles.ytdProgressTrack}>
                                <View
                                  style={[
                                    styles.ytdProgressFill,
                                    { width: `${Math.round(yearProgress * 100)}%`, backgroundColor: theme.colors.textSecondary },
                                  ]}
                                />
                                <View
                                  style={[
                                    styles.ytdProgressFill,
                                    { width: `${Math.round(ringPct * 100)}%`, backgroundColor: accent, position: 'absolute' },
                                  ]}
                                />
                              </View>
                              <Typography style={styles.ytdProgressTxt}>
                                Day {dayOfYear} of 365 · {Math.round(ringPct * 100)}% of goal
                              </Typography>
                            </View>
                          </View>
                          <View style={styles.ytdBarRow}>
                            {yearMonthly.map((m, i) => {
                              const h = Math.max(4, (m.km / maxMonth) * 36);
                              const current = i === yearMonthly.length - 1;
                              return (
                                <View key={m.key} style={styles.ytdBarCol}>
                                  <View
                                    style={[
                                      styles.ytdBar,
                                      { height: h, backgroundColor: current ? accent : accent + '55' },
                                    ]}
                                  />
                                  <Typography style={styles.ytdBarLbl}>{m.label[0]}</Typography>
                                </View>
                              );
                            })}
                          </View>
                        </>
                      );
                    })()}
                  </WidgetCard>
                </StaggerItem>
              );
            case "ThisWeek":
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["ThisWeek"]}
                    title={WIDGET_TITLES["ThisWeek"]}
                    icon={CalendarDays}
                    action={
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
                    }
                  >
                    <View style={styles.bigStatRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                        <AnimatedNumber
                          value={Number(thisWeekStats.km)}
                          decimals={1}
                          style={[styles.bigStatNum, { color: familyStyle('activity').accent }] as any}
                        />
                        <Typography style={styles.bigStatUnit}>km</Typography>
                      </View>
                      <View
                        style={[
                          styles.bigStatChip,
                          { backgroundColor: weekTrend ? '#22C55E22' : '#EF444422' },
                        ]}
                      >
                        {weekTrend ? (
                          <TrendingUp color="#22C55E" size={11} />
                        ) : (
                          <TrendingDown color="#EF4444" size={11} />
                        )}
                        <Typography
                          style={[
                            styles.bigStatChipTxt,
                            { color: weekTrend ? '#22C55E' : '#EF4444' },
                          ]}
                        >
                          {lastWeekKm} last wk
                        </Typography>
                      </View>
                    </View>
                    <View style={styles.tileGrid}>
                      <View style={styles.tile}>
                        <View style={[styles.tileIcon, { backgroundColor: familyStyle('activity').tint }]}>
                          <Clock color={familyStyle('activity').accent} size={14} />
                        </View>
                        <Typography style={styles.tileVal}>{formatDuration(thisWeekStats.time)}</Typography>
                        <Typography style={styles.tileLbl}>Time</Typography>
                      </View>
                      <View style={styles.tile}>
                        <View style={[styles.tileIcon, { backgroundColor: familyStyle('activity').tint }]}>
                          <Mountain color={familyStyle('activity').accent} size={14} />
                        </View>
                        <Typography style={styles.tileVal}>{thisWeekStats.elev}<Typography style={styles.tileUnit}> m</Typography></Typography>
                        <Typography style={styles.tileLbl}>Elevation</Typography>
                      </View>
                      <View style={styles.tile}>
                        <View style={[styles.tileIcon, { backgroundColor: familyStyle('activity').tint }]}>
                          <CalendarDays color={familyStyle('activity').accent} size={14} />
                        </View>
                        <Typography style={styles.tileVal}>{thisWeekStats.days}</Typography>
                        <Typography style={styles.tileLbl}>Days active</Typography>
                      </View>
                      <View style={styles.tile}>
                        <View style={[styles.tileIcon, { backgroundColor: familyStyle('activity').tint }]}>
                          <Activity color={familyStyle('activity').accent} size={14} />
                        </View>
                        <Typography style={styles.tileVal}>{thisWeekStats.runs}</Typography>
                        <Typography style={styles.tileLbl}>Activities</Typography>
                      </View>
                    </View>
                    <View style={styles.weekDayRow}>
                      {last7DaysKm.map((d, i) => {
                        const maxKm = Math.max(...last7DaysKm.map((x) => x.km), 1);
                        const h = d.hasAct ? Math.max(6, (d.km / maxKm) * 28) : 4;
                        return (
                          <View key={i} style={styles.weekDayCol}>
                            <View
                              style={[
                                styles.weekDayBar,
                                {
                                  height: h,
                                  backgroundColor: d.hasAct
                                    ? familyStyle('activity').accent
                                    : theme.colors.border,
                                },
                              ]}
                            />
                            <Typography style={styles.weekDayLbl}>{d.day}</Typography>
                          </View>
                        );
                      })}
                    </View>
                    {thisWeekStats.calories || thisWeekStats.sufferScore ? (
                      <View style={styles.subStatRow}>
                        {thisWeekStats.calories ? (
                          <View style={styles.subStatChip}>
                            <Flame color={theme.colors.warning} size={11} />
                            <Typography style={styles.subStatTxt}>{thisWeekStats.calories} kcal</Typography>
                          </View>
                        ) : null}
                        {thisWeekStats.sufferScore ? (
                          <View style={styles.subStatChip}>
                            <Heart color={theme.colors.error} size={11} />
                            <Typography style={styles.subStatTxt}>Suffer {thisWeekStats.sufferScore}</Typography>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </WidgetCard>
                </StaggerItem>
              );
            case "ActivityMap":
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["ActivityMap"]}
                    title={WIDGET_TITLES["ActivityMap"]}
                    icon={Activity}
                  >
                    <HeatmapCalendar data={heatmapData} />
                  </WidgetCard>
                </StaggerItem>
              );
            case "RecentActivities":
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["RecentActivities"]}
                    title={WIDGET_TITLES["RecentActivities"]}
                    icon={Timer}
                  >
                    {recentActivities.length === 0 ? (
                      <Card style={styles.emptyCard}>
                        <Typography style={styles.emptyText}>
                          No activities yet — sync Strava in Settings
                        </Typography>
                      </Card>
                    ) : (
                      recentActivities.map((act, i) => {
                        const color = getActivityColor(act.type);
                        return (
                          <TouchableOpacity
                            key={act.id}
                            onPress={() =>
                              (navigation as any).navigate('Activities', {
                                screen: 'ActivityDetail',
                                params: { activity: act },
                              })
                            }
                            activeOpacity={0.8}
                            style={[styles.recentRow, i === recentActivities.length - 1 && { borderBottomWidth: 0 }]}
                          >
                            <View
                              style={[styles.recentIconPill, { backgroundColor: color + '22', borderColor: color + '55' }]}
                            >
                              {getActivityIcon(act.type, color, 16)}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Typography style={styles.recentName} numberOfLines={1}>
                                {act.name || act.type}
                              </Typography>
                              <Typography style={styles.recentDate}>
                                {format(parseISO(act.startDate), 'EEE, MMM d')} · {formatPace(act.averageSpeed)} /km
                              </Typography>
                            </View>
                            <View style={[styles.recentDistChip, { backgroundColor: color + '22' }]}>
                              <Typography style={[styles.recentDistTxt, { color }]}>
                                {(act.distance / 1000).toFixed(1)} km
                              </Typography>
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </WidgetCard>
                </StaggerItem>
              );
            case "MonthlyVolume":
              if (!monthlyData.some((m) => m.km > 0)) return null;
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["MonthlyVolume"]}
                    title={WIDGET_TITLES["MonthlyVolume"]}
                    icon={BarChart3}
                  >
                    {(() => {
                      const months = yearMonthly;
                      const current = months[months.length - 1]?.km || 0;
                      const prev = months[months.length - 2]?.km || 0;
                      const deltaPct =
                        prev > 0
                          ? Math.round(((current - prev) / prev) * 100)
                          : current > 0
                            ? 100
                            : 0;
                      const up = deltaPct >= 0;
                      const maxKm = Math.max(...months.map((m) => m.km), 1);
                      const accent = familyStyle('activity').accent;
                      return (
                        <>
                          <View style={styles.bigStatRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                              <AnimatedNumber
                                value={current}
                                style={[styles.bigStatNum, { color: accent }] as any}
                              />
                              <Typography style={styles.bigStatUnit}>km this month</Typography>
                            </View>
                            <View
                              style={[
                                styles.bigStatChip,
                                { backgroundColor: up ? '#22C55E22' : '#EF444422' },
                              ]}
                            >
                              {up ? (
                                <TrendingUp color="#22C55E" size={11} />
                              ) : (
                                <TrendingDown color="#EF4444" size={11} />
                              )}
                              <Typography
                                style={[
                                  styles.bigStatChipTxt,
                                  { color: up ? '#22C55E' : '#EF4444' },
                                ]}
                              >
                                {up ? '+' : ''}
                                {deltaPct}% vs last
                              </Typography>
                            </View>
                          </View>
                          <View style={styles.monthlyBarRow}>
                            {months.map((m, i) => {
                              const h = Math.max(4, (m.km / maxKm) * 60);
                              const current = i === months.length - 1;
                              return (
                                <View key={m.key} style={styles.monthlyBarCol}>
                                  <View
                                    style={[
                                      styles.monthlyBar,
                                      {
                                        height: h,
                                        overflow: 'hidden',
                                      },
                                    ]}
                                  >
                                    <LinearGradient
                                      colors={
                                        current
                                          ? theme.colors.gradients.primary
                                          : [accent + '88', accent + '33']
                                      }
                                      start={{ x: 0, y: 1 }}
                                      end={{ x: 0, y: 0 }}
                                      style={{ flex: 1 }}
                                    />
                                  </View>
                                  <Typography style={styles.monthlyBarLbl} numberOfLines={1} adjustsFontSizeToFit>
                                    {m.label}
                                  </Typography>
                                </View>
                              );
                            })}
                          </View>
                          <Typography style={styles.barUnit}>km per month · last 12 months</Typography>
                        </>
                      );
                    })()}
                  </WidgetCard>
                </StaggerItem>
              );
            case "HeartRate":
              if (!hrStats) return null;
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["HeartRate"]}
                    title={WIDGET_TITLES["HeartRate"]}
                    icon={Heart}
                  >
                    {(() => {
                      const accent = familyStyle('health').accent;
                      const maxPct = Math.max(...hrZoneCounts.map((z) => z.pct), 0.01);
                      const zoneColors = ['#0ea5e9', '#22c55e', '#f59e0b', '#f97316', '#ef4444'];
                      return (
                        <>
                          <View style={styles.bigStatRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                              <AnimatedNumber value={hrStats.avg} style={[styles.bigStatNum, { color: accent }] as any} />
                              <Typography style={styles.bigStatUnit}>avg bpm</Typography>
                            </View>
                            <View style={[styles.bigStatChip, { backgroundColor: theme.colors.warning + '22' }]}>
                              <Zap color={theme.colors.warning} size={11} />
                              <Typography style={[styles.bigStatChipTxt, { color: theme.colors.warning }]}>
                                Max {hrStats.max}
                              </Typography>
                            </View>
                          </View>
                          {hrZoneCounts.some((z) => z.count > 0) ? (
                            <>
                              <View style={styles.hrZoneRow}>
                                {hrZoneCounts.map((z, i) => {
                                  const h = z.pct > 0 ? Math.max(8, (z.pct / maxPct) * 60) : 4;
                                  return (
                                    <View key={z.label} style={styles.hrZoneCol}>
                                      <Typography style={[styles.hrZonePct, { color: z.pct > 0 ? zoneColors[i] : theme.colors.textSecondary }]}>
                                        {Math.round(z.pct * 100)}%
                                      </Typography>
                                      <View style={{ height: 60, justifyContent: 'flex-end', width: '100%', alignItems: 'center' }}>
                                        <LinearGradient
                                          colors={[zoneColors[i], zoneColors[i] + '66']}
                                          start={{ x: 0, y: 0 }}
                                          end={{ x: 0, y: 1 }}
                                          style={{ width: '70%', height: h, borderRadius: 4 }}
                                        />
                                      </View>
                                      <Typography style={[styles.hrZoneLbl, { color: zoneColors[i] }]}>{z.label}</Typography>
                                    </View>
                                  );
                                })}
                              </View>
                              {userProfile.restingHR > 0 ? (
                                <View style={styles.subStatRow}>
                                  <View style={styles.subStatChip}>
                                    <Heart color={theme.colors.success} size={11} />
                                    <Typography style={styles.subStatTxt}>Resting {userProfile.restingHR} bpm</Typography>
                                  </View>
                                </View>
                              ) : null}
                            </>
                          ) : null}
                        </>
                      );
                    })()}
                  </WidgetCard>
                </StaggerItem>
              );
            case "PersonalBests":
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["PersonalBests"]}
                    title={WIDGET_TITLES["PersonalBests"]}
                    icon={Trophy}
                  >
                    {(() => {
                      const accent = familyStyle('records').accent;
                      const fmtT = (sec: number) => {
                        const h = Math.floor(sec / 3600);
                        const m = Math.floor((sec % 3600) / 60);
                        const s = sec % 60;
                        return h > 0
                          ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
                          : `${m}:${String(s).padStart(2, '0')}`;
                      };
                      const pbTiles = pbDistances.map((d) => {
                        const e = bestEfforts[d.meters];
                        return {
                          label: d.label,
                          time: e ? fmtT(e.time) : '--',
                          date: e?.date ?? '',
                        };
                      });
                      return (
                        <>
                          <View style={styles.pbGrid}>
                            {pbTiles.map((t) => (
                              <View key={t.label} style={styles.pbTile}>
                                <Typography style={[styles.pbTileDist, { color: accent }]}>{t.label}</Typography>
                                <Typography style={styles.pbTileTime}>{t.time}</Typography>
                                <Typography style={styles.pbTileDate} numberOfLines={1}>
                                  {t.date || '—'}
                                </Typography>
                              </View>
                            ))}
                          </View>
                          <View style={styles.pbSubRow}>
                            <View style={styles.pbSubChip}>
                              <Footprints color={accent} size={11} />
                              <Typography style={styles.pbSubTxt}>
                                Longest run {(personalBests.longestRun / 1000).toFixed(1)} km
                              </Typography>
                            </View>
                            <View style={styles.pbSubChip}>
                              <Mountain color={accent} size={11} />
                              <Typography style={styles.pbSubTxt}>
                                Peak elev {Math.round(personalBests.mostElevation)} m
                              </Typography>
                            </View>
                          </View>
                          <TouchableOpacity
                            onPress={() =>
                              setInfoSheet({
                                title: 'Personal Bests',
                                body: 'Times computed from your fastest matching runs. View detailed breakdowns under Best Efforts.',
                              })
                            }
                            style={[styles.pbLink, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}
                          >
                            <Typography style={[styles.pbLinkTxt, { color: accent }]}>
                              View all PBs
                            </Typography>
                            <ArrowRight color={accent} size={13} />
                          </TouchableOpacity>
                          {personalBests.fastestPace !== 999 ? (
                            <View style={styles.subStatRow}>
                              <View style={styles.subStatChip}>
                                <TrendingUp color={accent} size={11} />
                                <Typography style={styles.subStatTxt}>
                                  Fastest pace {formatPace(1000 / (personalBests.fastestPace * 60))}/km
                                </Typography>
                              </View>
                              <View style={styles.subStatChip}>
                                <Clock color={accent} size={11} />
                                <Typography style={styles.subStatTxt}>
                                  Longest {formatDuration(personalBests.longestTime)}
                                </Typography>
                              </View>
                            </View>
                          ) : null}
                          {personalBests.longestWalk > 0 ? (
                            <View style={[styles.subStatRow, { marginTop: 6 }]}>
                              <View style={styles.subStatChip}>
                                <Footprints color="#14b8a6" size={11} />
                                <Typography style={styles.subStatTxt}>
                                  Longest walk {(personalBests.longestWalk / 1000).toFixed(1)} km
                                </Typography>
                              </View>
                              <View style={styles.subStatChip}>
                                <Activity color={theme.colors.textSecondary} size={11} />
                                <Typography style={styles.subStatTxt}>{userStats.totalWalks || 0} walks</Typography>
                              </View>
                            </View>
                          ) : null}
                        </>
                      );
                    })()}
                  </WidgetCard>
                </StaggerItem>
              );
            case "RacePredictor":
              if (!racePredictor) return null;
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["RacePredictor"]}
                    title={WIDGET_TITLES["RacePredictor"]}
                    icon={Zap}
                  >
                    {(() => {
                      // Longer distances → lower confidence as the Riegel
                      // extrapolation drifts. 5K-100, 10K-90, Half-75, Full-55.
                      const rows: { label: string; time: string; conf: number; icon: any }[] = [
                        { label: '5K', time: racePredictor.fiveK, conf: 1.0, icon: Flame },
                        { label: '10K', time: racePredictor.tenK, conf: 0.85, icon: TrendingUp },
                        { label: 'Half', time: racePredictor.half, conf: 0.7, icon: Trophy },
                        { label: 'Full', time: racePredictor.full, conf: 0.55, icon: Trophy },
                      ];
                      const accent = familyStyle('records').accent;
                      return rows.map((r) => {
                        const Icon = r.icon;
                        return (
                          <View key={r.label} style={styles.raceRow}>
                            <View style={styles.raceIconPill}>
                              <Icon color={accent} size={13} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={styles.raceRowHeader}>
                                <Typography style={styles.raceLabel}>{r.label}</Typography>
                                <Typography style={styles.raceTime}>{r.time}</Typography>
                              </View>
                              <View style={styles.raceConfTrack}>
                                <LinearGradient
                                  colors={theme.colors.gradients.records}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 0 }}
                                  style={[styles.raceConfFill, { width: `${r.conf * 100}%` }]}
                                />
                              </View>
                              <Typography style={styles.raceConfLbl}>
                                Confidence {Math.round(r.conf * 100)}%
                              </Typography>
                            </View>
                          </View>
                        );
                      });
                    })()}
                  </WidgetCard>
                </StaggerItem>
              );
            case "ActivityMix":
              if (typeDistribution.length === 0) return null;
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["ActivityMix"]}
                    title={WIDGET_TITLES["ActivityMix"]}
                    icon={Activity}
                  >
                    {(() => {
                      const pieData = typeDistribution.map(({ type, count, pct }) => ({
                        value: count,
                        color: getActivityColor(type),
                        text: `${pct}%`,
                      }));
                      const total = typeDistribution.reduce((s, t) => s + t.count, 0);
                      const dominant = typeDistribution.reduce(
                        (best, t) => (t.count > best.count ? t : best),
                        typeDistribution[0],
                      );
                      return (
                        <>
                          <View style={styles.mixPieRow}>
                            <PieChart
                              {...pieProps()}
                              data={pieData}
                              radius={62}
                              innerRadius={40}
                              centerLabelComponent={() => (
                                <View style={{ alignItems: 'center' }}>
                                  <Typography style={styles.mixCenterNum}>{total}</Typography>
                                  <Typography style={styles.mixCenterLbl}>total</Typography>
                                </View>
                              )}
                            />
                            <View style={{ flex: 1, marginLeft: 14 }}>
                              <Typography style={styles.mixDominant}>
                                {dominant?.type} dominant
                              </Typography>
                              <Typography style={styles.mixDominantSub}>
                                {dominant?.pct}% of recent activity
                              </Typography>
                            </View>
                          </View>
                          <View style={{ gap: 8, marginTop: 4 }}>
                            {typeDistribution.map(({ type, count, pct }) => {
                              const color = getActivityColor(type);
                              return (
                                <View key={type} style={styles.mixLegendRow}>
                                  <View style={[styles.mixLegendDot, { backgroundColor: color }]} />
                                  <Typography style={styles.mixLegendType}>{type}</Typography>
                                  <Typography style={[styles.mixLegendPct, { color }]}>{pct}%</Typography>
                                  <Typography style={styles.mixLegendCount}>{count}</Typography>
                                </View>
                              );
                            })}
                          </View>
                        </>
                      );
                    })()}
                  </WidgetCard>
                </StaggerItem>
              );
            case "AllTimeStats":
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["AllTimeStats"]}
                    title={WIDGET_TITLES["AllTimeStats"]}
                    icon={BarChart3}
                  >
                    {(() => {
                      const totalTime = activities.reduce((s, a) => s + a.movingTime, 0);
                      const totalElev = Math.round(
                        activities.reduce((s, a) => s + a.totalElevationGain, 0),
                      );
                      const daysActive = new Set(
                        activities.map((a) => a.startDate.split('T')[0]),
                      ).size;
                      const hrSamples = activities.filter((a) => (a.averageHeartRate || 0) > 0);
                      const avgHR = hrSamples.length
                        ? Math.round(
                            hrSamples.reduce((s, a) => s + (a.averageHeartRate || 0), 0) /
                              hrSamples.length,
                          )
                        : 0;
                      const accent = familyStyle('activity').accent;
                      const tiles = [
                        { icon: MapPin, val: userStats.totalKm, unit: 'km', lbl: 'Total km' },
                        { icon: Clock, val: formatDuration(totalTime), unit: '', lbl: 'Total time' },
                        { icon: Mountain, val: totalElev, unit: 'm', lbl: 'Elev climbed' },
                        { icon: Activity, val: activities.length, unit: '', lbl: 'Activities' },
                        { icon: CalendarDays, val: daysActive, unit: '', lbl: 'Days active' },
                        { icon: Heart, val: avgHR || '--', unit: avgHR ? 'bpm' : '', lbl: 'Avg HR' },
                      ];
                      return (
                        <>
                          <View style={styles.bigStatRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                              <Typography style={[styles.bigStatNum, { color: accent }]}>
                                {userStats.bestPace}
                              </Typography>
                              <Typography style={styles.bigStatUnit}>/km best pace</Typography>
                            </View>
                            <View style={[styles.bigStatChip, { backgroundColor: accent + '22' }]}>
                              <Mountain color={accent} size={11} />
                              <Typography style={[styles.bigStatChipTxt, { color: accent }]}>
                                Top elev {userStats.topElev} m
                              </Typography>
                            </View>
                          </View>
                          <View style={styles.allTimeGrid}>
                            {tiles.map((t, i) => {
                              const Icon = t.icon;
                              return (
                                <View key={i} style={styles.allTimeTile}>
                                  <View style={[styles.tileIcon, { backgroundColor: accent + '22' }]}>
                                    <Icon color={accent} size={13} />
                                  </View>
                                  <Typography style={styles.allTimeVal}>
                                    {t.val}
                                    {t.unit ? <Typography style={styles.allTimeUnit}> {t.unit}</Typography> : null}
                                  </Typography>
                                  <Typography style={styles.allTimeLbl}>{t.lbl}</Typography>
                                </View>
                              );
                            })}
                          </View>
                        </>
                      );
                    })()}
                  </WidgetCard>
                </StaggerItem>
              );
            case "CoachInsight":
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["CoachInsight"]}
                    title={WIDGET_TITLES["CoachInsight"]}
                    icon={Zap}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                      <Zap color={theme.colors.primary} size={16} />
                      <Typography style={{ fontSize: 11, fontWeight: '700', color: theme.colors.primary, textTransform: 'uppercase', letterSpacing: 0.8 }}>{coachInsight.label}</Typography>
                    </View>
                    <Typography style={{ fontSize: 14, color: theme.colors.text, lineHeight: 22, flexShrink: 1 }}>{coachInsight.text}</Typography>
                  </WidgetCard>
                </StaggerItem>
              );
            case "ActiveGoals":
              if (goals.length === 0) return null;
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["ActiveGoals"]}
                    title={WIDGET_TITLES["ActiveGoals"]}
                    icon={Target}
                  >
                    {goals.map((goal) => {
                      const daysOut = Math.max(
                        0,
                        Math.round(
                          (new Date(goal.targetDate).getTime() - Date.now()) / 86400000,
                        ),
                      );
                      const pct = Math.max(0, Math.min(1, goal.progress / 100));
                      const accent = familyStyle('plan').accent;
                      const urgent = daysOut <= 14;
                      return (
                        <TouchableOpacity
                          key={goal.id}
                          activeOpacity={0.85}
                          onPress={() => (navigation as any).navigate('Goals')}
                          style={styles.goalRowPremium}
                        >
                          <View style={{ flex: 1, marginRight: 12 }}>
                            <Typography style={styles.goalTitlePremium} numberOfLines={1}>
                              {goal.title}
                            </Typography>
                            <Typography style={styles.goalSubPremium} numberOfLines={1}>
                              {goal.phase.split('\n')[0]}
                            </Typography>
                            <View
                              style={[
                                styles.goalDaysChip,
                                {
                                  backgroundColor: urgent ? '#EF444422' : accent + '22',
                                  borderColor: urgent ? '#EF444466' : accent + '55',
                                },
                              ]}
                            >
                              <CalendarDays
                                color={urgent ? theme.colors.error : accent}
                                size={10}
                              />
                              <Typography
                                style={[
                                  styles.goalDaysChipTxt,
                                  { color: urgent ? theme.colors.error : accent },
                                ]}
                              >
                                {daysOut} days out
                              </Typography>
                            </View>
                          </View>
                          <DonutRing
                            size={64}
                            stroke={7}
                            progress={pct}
                            color={accent}
                            gradient={familyStyle('plan').gradient}
                            trackColor={theme.colors.background}
                          >
                            <Typography style={[styles.goalRingNum, { color: accent }]}>
                              {Math.round(pct * 100)}
                            </Typography>
                            <Typography style={styles.goalRingLbl}>%</Typography>
                          </DonutRing>
                        </TouchableOpacity>
                      );
                    })}
                  </WidgetCard>
                </StaggerItem>
              );
            case "TrainingLoad": {
              if (activities.length === 0) return null;
              const openTrainingLoadInfo = () =>
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
                });
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["TrainingLoad"]}
                    title={WIDGET_TITLES["TrainingLoad"]}
                    icon={Zap}
                    onPress={openTrainingLoadInfo}
                    action={
                      <TouchableOpacity activeOpacity={0.7} onPress={openTrainingLoadInfo}>
                        <Info size={14} color={theme.colors.textSecondary} />
                      </TouchableOpacity>
                    }
                  >
                    {(() => {
                      const tsb = trainingLoad.tsb;
                      const form =
                        tsb > 5
                          ? { label: 'Fresh', color: theme.colors.success }
                          : tsb < -10
                            ? { label: 'Strained', color: theme.colors.error }
                            : { label: 'Optimal', color: '#0ea5e9' };
                      const atlData = tlSparkline.map((p) => ({ value: p.atl }));
                      const ctlData = tlSparkline.map((p) => ({ value: p.ctl }));
                      const maxY = Math.max(
                        ...tlSparkline.map((p) => Math.max(p.atl, p.ctl)),
                        10,
                      );
                      return (
                        <>
                          <View style={styles.bigStatRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                              <AnimatedNumber
                                value={tsb}
                                style={[styles.bigStatNum, { color: form.color }] as any}
                              />
                              <Typography style={styles.bigStatUnit}>TSB</Typography>
                            </View>
                            <View
                              style={[styles.bigStatChip, { backgroundColor: form.color + '22' }]}
                            >
                              <Typography
                                style={[styles.bigStatChipTxt, { color: form.color }]}
                              >
                                {form.label}
                              </Typography>
                            </View>
                          </View>
                          {tlSparkline.length > 1 ? (
                            <View style={{ overflow: 'hidden', marginVertical: 4 }}>
                              <LineChart
                                data={atlData}
                                data2={ctlData}
                                color="#F97316"
                                color2="#22D3EE"
                                thickness={2.5}
                                thickness2={2}
                                curved
                                hideDataPoints
                                hideDataPoints2
                                areaChart
                                startFillColor="#F97316"
                                endFillColor={theme.colors.background}
                                startOpacity={0.3}
                                endOpacity={0}
                                height={70}
                                width={width - 80}
                                spacing={(width - 80) / Math.max(atlData.length - 1, 1)}
                                initialSpacing={4}
                                endSpacing={4}
                                disableScroll
                                maxValue={maxY * 1.1}
                                {...chartBase({ family: 'recovery', hideYAxis: true })}
                                yAxisLabelWidth={0}
                                xAxisLabelTextStyle={{ color: 'transparent' }}
                                hideRules
                              />
                            </View>
                          ) : null}
                          <View style={styles.tlLegendRow}>
                            <View style={styles.tlLegendItem}>
                              <View style={[styles.tlLegendDot, { backgroundColor: '#F97316' }]} />
                              <Typography style={styles.tlLegendLbl}>ATL</Typography>
                              <Typography style={styles.tlLegendVal}>{trainingLoad.atl}</Typography>
                            </View>
                            <View style={styles.tlLegendItem}>
                              <View style={[styles.tlLegendDot, { backgroundColor: '#22D3EE' }]} />
                              <Typography style={styles.tlLegendLbl}>CTL</Typography>
                              <Typography style={styles.tlLegendVal}>{trainingLoad.ctl}</Typography>
                            </View>
                            <View style={styles.tlLegendItem}>
                              <View style={[styles.tlLegendDot, { backgroundColor: form.color }]} />
                              <Typography style={styles.tlLegendLbl}>TSB</Typography>
                              <Typography style={[styles.tlLegendVal, { color: form.color }]}>{tsb}</Typography>
                            </View>
                          </View>
                        </>
                      );
                    })()}
                  </WidgetCard>
                </StaggerItem>
              );
            }
            case "BestEfforts": {
              if (Object.keys(bestEfforts).length === 0) return null;
              const openBestEffortsInfo = () =>
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
                });
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["BestEfforts"]}
                    title={WIDGET_TITLES["BestEfforts"]}
                    icon={Trophy}
                    onPress={openBestEffortsInfo}
                    action={
                      <TouchableOpacity activeOpacity={0.7} onPress={openBestEffortsInfo}>
                        <Info size={14} color={theme.colors.textSecondary} />
                      </TouchableOpacity>
                    }
                  >
                    {(() => {
                      const accent = familyStyle('records').accent;
                      const fmtT = (sec: number) => {
                        const h = Math.floor(sec / 3600);
                        const m = Math.floor((sec % 3600) / 60);
                        const s = sec % 60;
                        return h > 0
                          ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
                          : `${m}:${String(s).padStart(2, '0')}`;
                      };
                      return bestEffortsList.map((e) => {
                        const isPR = true; // best efforts map only stores PRs
                        const distLabel =
                          e.dist >= 1000 ? `${e.dist / 1000}K` : `${e.dist}m`;
                        return (
                          <View key={e.dist} style={styles.bestEffortRow}>
                            <View
                              style={[
                                styles.bestEffortPill,
                                { backgroundColor: accent + '22', borderColor: accent + '55' },
                              ]}
                            >
                              <Trophy color={accent} size={13} />
                              <Typography style={[styles.bestEffortDist, { color: accent }]}>
                                {distLabel}
                              </Typography>
                            </View>
                            <View style={{ flex: 1, marginLeft: 12 }}>
                              <Typography style={styles.bestEffortTime}>{fmtT(e.time)}</Typography>
                              <Typography style={styles.bestEffortDate}>{e.date}</Typography>
                            </View>
                            <View
                              style={[
                                styles.bestEffortChip,
                                { backgroundColor: theme.colors.success + '22' },
                              ]}
                            >
                              <Typography
                                style={[styles.bestEffortChipTxt, { color: theme.colors.success }]}
                              >
                                PR
                              </Typography>
                            </View>
                          </View>
                        );
                      });
                    })()}
                  </WidgetCard>
                </StaggerItem>
              );
            }
            case "Badges":
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["Badges"]}
                    title={WIDGET_TITLES["Badges"]}
                    icon={Trophy}
                    action={
                      <Typography style={{ fontSize: 11, color: theme.colors.textSecondary }}>
                        {milestones.length}/{getAllMilestoneDefs().length} earned
                      </Typography>
                    }
                  >
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 14, paddingHorizontal: 4, paddingVertical: 4 }}
                    >
                      {[...getAllMilestoneDefs()].sort((a, b) => {
                        const aEarned = milestones.some((m) => m.id === a.id) ? 0 : 1;
                        const bEarned = milestones.some((m) => m.id === b.id) ? 0 : 1;
                        return aEarned - bEarned;
                      }).map((def) => {
                        const earned = milestones.find((m) => m.id === def.id);
                        return (
                          <BadgeMedal
                            key={def.id}
                            milestone={{
                              title: def.title,
                              description: def.description,
                              icon: def.icon,
                              category: def.category,
                              earnedAt: earned?.earnedAt || null,
                            }}
                            size={72}
                            unlocked={!!earned}
                            onPress={() =>
                              setInfoSheet({
                                title: def.title,
                                body: def.description,
                                rows: earned
                                  ? [{ label: 'Earned', desc: format(parseISO(earned.earnedAt), 'd MMM yyyy') }]
                                  : [{ label: 'Status', desc: 'Not yet earned — keep going!' }],
                              })
                            }
                          />
                        );
                      })}
                    </ScrollView>
                  </WidgetCard>
                </StaggerItem>
              );
            case "PaceTrend": {
              const hasData = paceTrend.some(w => w.pace > 0);
              if (!hasData) return null;
              const validPaces = paceTrend.filter(w => w.pace > 0);
              const minPace = Math.min(...validPaces.map(w => w.pace));
              const maxPace = Math.max(...validPaces.map(w => w.pace));
              const paceRange = maxPace - minPace || 1;
              const latestPace = validPaces[validPaces.length - 1]?.pace || 0;
              const firstPace = validPaces[0]?.pace || 0;
              const improving = latestPace < firstPace - 0.05;
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["PaceTrend"]}
                    title={WIDGET_TITLES["PaceTrend"]}
                    icon={TrendingUp}
                    action={(() => {
                      const slowing = firstPace > 0 && latestPace > firstPace + 0.05;
                      const trendColor = improving ? theme.colors.success : theme.colors.textSecondary;
                      return (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          {improving ? (
                            <TrendingDown color={trendColor} size={12} />
                          ) : slowing ? (
                            <TrendingUp color={trendColor} size={12} />
                          ) : (
                            <Minus color={trendColor} size={12} />
                          )}
                          <Typography style={{ fontSize: 11, color: trendColor }}>
                            {improving ? 'Improving' : slowing ? 'Slowing' : 'Stable'}
                          </Typography>
                        </View>
                      );
                    })()}
                  >
                    {(() => {
                      const fmtPace = (p: number) =>
                        `${Math.floor(p)}:${Math.round((p % 1) * 60).toString().padStart(2, '0')}`;
                      const trendColor = improving ? theme.colors.success : familyStyle('records').accent;
                      const lineData = paceTrend.map((w) => ({
                        value: w.pace > 0 ? Number(w.pace.toFixed(2)) : minPace,
                        label: w.label.split(' ')[0],
                      }));
                      return (
                        <>
                          <View style={styles.bigStatRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                              <Typography style={[styles.bigStatNum, { color: trendColor }]}>
                                {fmtPace(latestPace)}
                              </Typography>
                              <Typography style={styles.bigStatUnit}>/km latest</Typography>
                            </View>
                            <View
                              style={[
                                styles.bigStatChip,
                                {
                                  backgroundColor: improving
                                    ? '#22C55E22'
                                    : firstPace > 0 && latestPace > firstPace + 0.05
                                      ? '#EF444422'
                                      : theme.colors.surface,
                                },
                              ]}
                            >
                              {improving ? (
                                <TrendingDown color={theme.colors.success} size={11} />
                              ) : firstPace > 0 && latestPace > firstPace + 0.05 ? (
                                <TrendingUp color={theme.colors.error} size={11} />
                              ) : null}
                              <Typography
                                style={[
                                  styles.bigStatChipTxt,
                                  {
                                    color: improving
                                      ? theme.colors.success
                                      : firstPace > 0 && latestPace > firstPace + 0.05
                                        ? theme.colors.error
                                        : theme.colors.textSecondary,
                                  },
                                ]}
                              >
                                {improving ? 'Improving' : firstPace > 0 && latestPace > firstPace + 0.05 ? 'Slowing' : 'Stable'}
                              </Typography>
                            </View>
                          </View>
                          <View style={{ overflow: 'hidden', marginVertical: 4 }}>
                            <LineChart
                              {...lineProps('records')}
                              data={lineData}
                              height={60}
                              width={width - 80}
                              spacing={(width - 80) / Math.max(lineData.length - 1, 1)}
                              initialSpacing={4}
                              endSpacing={4}
                              disableScroll
                              maxValue={maxPace * 1.08}
                              hideRules
                              {...chartBase({ family: 'records', hideYAxis: true })}
                              yAxisLabelWidth={0}
                              xAxisLabelTextStyle={{ color: 'transparent' }}
                              pointerConfig={pointerConfig('/km', 'records')}
                            />
                          </View>
                          <View style={styles.paceLegendRow}>
                            <Typography style={styles.paceLegendItem}>
                              Best{' '}
                              <Typography style={{ color: theme.colors.success, fontWeight: '700' }}>
                                {fmtPace(minPace)}/km
                              </Typography>
                            </Typography>
                            <Typography style={styles.paceLegendItem}>
                              Avg 8 wks{' '}
                              <Typography style={{ color: theme.colors.text, fontWeight: '700' }}>
                                {fmtPace((minPace + maxPace) / 2)}/km
                              </Typography>
                            </Typography>
                          </View>
                        </>
                      );
                    })()}
                  </WidgetCard>
                </StaggerItem>
              );
            }
            case "Cadence": {
              if (!cadenceStats) return null;
              const { spm, trend } = cadenceStats;
              const isOptimal = spm >= 170 && spm <= 180;
              const isLow = spm < 170;
              const cadColor = isOptimal ? theme.colors.success : isLow ? '#f59e0b' : theme.colors.accent;
              const cadLabel = isOptimal ? 'Optimal' : isLow ? 'Below target' : 'Above target';
              const fillPct = Math.min(100, Math.max(0, ((spm - 140) / (200 - 140)) * 100));
              const optStart = ((170 - 140) / 60) * 100;
              const optEnd = ((180 - 140) / 60) * 100;
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["Cadence"]}
                    title={WIDGET_TITLES["Cadence"]}
                    icon={Activity}
                    action={
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        {isOptimal ? <Check color={cadColor} size={12} /> : null}
                        <Typography style={{ fontSize: 11, color: cadColor }}>{cadLabel}</Typography>
                      </View>
                    }
                  >
                    <View style={styles.bigStatRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                        <AnimatedNumber value={spm} style={[styles.bigStatNum, { color: cadColor }] as any} />
                        <Typography style={styles.bigStatUnit}>spm</Typography>
                      </View>
                      <View style={[styles.bigStatChip, { backgroundColor: cadColor + '22' }]}>
                        {trend === 'up' ? (
                          <TrendingUp color={cadColor} size={11} />
                        ) : trend === 'down' ? (
                          <TrendingDown color={cadColor} size={11} />
                        ) : (
                          <Minus color={cadColor} size={11} />
                        )}
                        <Typography style={[styles.bigStatChipTxt, { color: cadColor }]}>
                          {cadLabel}
                        </Typography>
                      </View>
                    </View>
                    {cadenceSparkline.some((d) => d.value > 0) ? (
                      <View style={{ overflow: 'hidden', marginVertical: 4 }}>
                        <LineChart
                          {...lineProps('health')}
                          data={cadenceSparkline}
                          color={cadColor}
                          startFillColor={cadColor}
                          height={56}
                          width={width - 80}
                          spacing={(width - 80) / Math.max(cadenceSparkline.length - 1, 1)}
                          initialSpacing={4}
                          endSpacing={4}
                          disableScroll
                          maxValue={Math.max(...cadenceSparkline.map((d) => d.value), 200) + 5}
                          hideRules
                          {...chartBase({ family: 'health', hideYAxis: true })}
                          yAxisLabelWidth={0}
                          xAxisLabelTextStyle={{ color: 'transparent' }}
                        />
                      </View>
                    ) : null}
                    <View style={styles.cadenceGaugeTrack}>
                      <View style={[styles.cadenceOptZone, { left: `${optStart}%`, width: `${optEnd - optStart}%` }]} />
                      <View style={[styles.cadenceMarker, { left: `${Math.max(0, Math.min(97, fillPct))}%`, backgroundColor: cadColor }]} />
                    </View>
                    <View style={styles.cadenceLabelsRow}>
                      <Typography style={styles.cadenceLabelTxt}>140</Typography>
                      <Typography style={[styles.cadenceLabelTxt, { color: theme.colors.success }]}>
                        Optimal 170–180
                      </Typography>
                      <Typography style={styles.cadenceLabelTxt}>200</Typography>
                    </View>
                  </WidgetCard>
                </StaggerItem>
              );
            }
            case "WellnessScore": {
              if (!wellnessScore) return null;
              const { score, label, color } = wellnessScore;
              const arc = (score / 100) * 180; // degrees for semicircle
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["WellnessScore"]}
                    title={WIDGET_TITLES["WellnessScore"]}
                    icon={Heart}
                  >
                    <View style={styles.wellnessRow}>
                      <DonutRing
                        size={96}
                        stroke={10}
                        progress={score / 100}
                        color={color}
                        trackColor={theme.colors.background}
                      >
                        <AnimatedNumber value={score} style={[styles.wellnessRingNum, { color }] as any} />
                        <Typography style={[styles.wellnessRingLbl, { color: theme.colors.textSecondary }]}>
                          / 100
                        </Typography>
                      </DonutRing>
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <Typography style={[styles.wellnessLabel, { color }]}>{label}</Typography>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 }}>
                          {trainingLoad.tsb > 0 ? (
                            <TrendingUp color={theme.colors.success} size={12} />
                          ) : trainingLoad.tsb < 0 ? (
                            <TrendingDown color={theme.colors.error} size={12} />
                          ) : (
                            <Minus color={theme.colors.textSecondary} size={12} />
                          )}
                          <Typography style={{ fontSize: 11, color: trainingLoad.tsb > 0 ? theme.colors.success : trainingLoad.tsb < 0 ? theme.colors.error : theme.colors.textSecondary, fontWeight: '700' }}>
                            Form {trainingLoad.tsb > 0 ? '+' : ''}{trainingLoad.tsb}
                          </Typography>
                          <Typography style={{ fontSize: 11, color: theme.colors.textSecondary }}>· {consistencyScore}% consistent</Typography>
                        </View>
                        <View style={styles.wellnessSubGrid}>
                          <View style={styles.wellnessSubCell}>
                            <Typography style={styles.wellnessSubLbl}>Form</Typography>
                            <Typography style={[styles.wellnessSubVal, { color: trainingLoad.tsb > 0 ? theme.colors.success : theme.colors.error }]}>
                              {trainingLoad.tsb > 0 ? '+' : ''}{trainingLoad.tsb}
                            </Typography>
                          </View>
                          <View style={styles.wellnessSubCell}>
                            <Typography style={styles.wellnessSubLbl}>Consist.</Typography>
                            <Typography style={[styles.wellnessSubVal, { color: theme.colors.text }]}>{consistencyScore}%</Typography>
                          </View>
                          {hrStats ? (
                            <View style={styles.wellnessSubCell}>
                              <Typography style={styles.wellnessSubLbl}>Avg HR</Typography>
                              <Typography style={[styles.wellnessSubVal, { color: theme.colors.text }]}>{hrStats.avg}</Typography>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  </WidgetCard>
                </StaggerItem>
              );
            }
            case "UpcomingWorkout": {
              if (!upcomingWorkout) return null;
              const lines = (upcomingWorkout.workout || '').split('\n').filter(Boolean);
              const title = lines[0] || 'Key Workout';
              const detail = lines.slice(1).join(' ').replace(/\*\*(.*?)\*\*/g, '$1').trim();
              // Heuristic to map title to a WorkoutKind for the icon pill.
              const lowerTitle = title.toLowerCase();
              const kind: WorkoutKind = /tempo|threshold/.test(lowerTitle)
                ? 'TEMPO'
                : /interval|repeat|fartlek|400|800/.test(lowerTitle)
                  ? 'INTERVALS'
                  : /long|easy long/.test(lowerTitle)
                    ? 'LONG'
                    : /recover|recovery/.test(lowerTitle)
                      ? 'RECOVERY'
                      : /strength|gym/.test(lowerTitle)
                        ? 'STRENGTH'
                        : /cross|bike|swim/.test(lowerTitle)
                          ? 'CROSS'
                          : 'EASY';
              const planAccent = familyStyle('plan').accent;
              // Best-guess parse for distance / duration / intensity from the title.
              const distMatch = title.match(/(\d+(?:\.\d+)?)\s*(km|mi)/i);
              const durMatch = title.match(/(\d+)\s*(min|hr|h\b)/i);
              const intMatch = title.match(/Z[1-5]/i);
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["UpcomingWorkout"]}
                    title={WIDGET_TITLES["UpcomingWorkout"]}
                    icon={Zap}
                  >
                    <View style={styles.upcomingHeader}>
                      <View style={[styles.upcomingKindPill, { backgroundColor: planAccent + '22', borderColor: planAccent + '55' }]}>
                        {workoutIcon(kind, 14, planAccent)}
                        <Typography style={[styles.upcomingKindLbl, { color: planAccent }]}>
                          {kind.toLowerCase()}
                        </Typography>
                      </View>
                      <Typography style={styles.upcomingGoalLbl} numberOfLines={1}>
                        {upcomingWorkout.goalTitle}
                      </Typography>
                    </View>
                    <Typography style={styles.upcomingDayLbl}>
                      NEXT · {upcomingWorkout.phaseName.toUpperCase()}
                    </Typography>
                    <Typography style={styles.upcomingTitle}>{title.replace(/\*\*/g, '')}</Typography>
                    {(distMatch || durMatch || intMatch || upcomingWorkout.weeklyTarget) ? (
                      <View style={styles.upcomingChipRow}>
                        {distMatch ? (
                          <View style={styles.upcomingChip}>
                            <MapPin color={planAccent} size={11} />
                            <Typography style={styles.upcomingChipTxt}>{distMatch[0]}</Typography>
                          </View>
                        ) : null}
                        {durMatch ? (
                          <View style={styles.upcomingChip}>
                            <Clock color={planAccent} size={11} />
                            <Typography style={styles.upcomingChipTxt}>{durMatch[0]}</Typography>
                          </View>
                        ) : null}
                        {intMatch ? (
                          <View style={styles.upcomingChip}>
                            <Zap color={planAccent} size={11} />
                            <Typography style={styles.upcomingChipTxt}>{intMatch[0]}</Typography>
                          </View>
                        ) : null}
                        {upcomingWorkout.weeklyTarget ? (
                          <View style={styles.upcomingChip}>
                            <Target color={planAccent} size={11} />
                            <Typography style={styles.upcomingChipTxt}>
                              {upcomingWorkout.weeklyTarget} km/wk
                            </Typography>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                    {detail ? (
                      <View style={styles.upcomingExecute}>
                        <Typography style={[styles.upcomingExecuteLbl, { color: planAccent }]}>
                          HOW TO EXECUTE
                        </Typography>
                        <Typography style={styles.upcomingExecuteBody}>{detail}</Typography>
                      </View>
                    ) : null}
                  </WidgetCard>
                </StaggerItem>
              );
            }
            case "SufferTrend": {
              const hasData = sufferTrend.some((w) => w.avg > 0);
              if (!hasData) return null;
              const currentWeek = sufferTrend[sufferTrend.length - 1];
              const prior4 = sufferTrend.slice(-5, -1);
              const prior4Avg = prior4.length
                ? prior4.reduce((s, w) => s + w.avg, 0) / prior4.length
                : 0;
              const delta = currentWeek.avg - prior4Avg;
              const up = delta > 0.5;
              const down = delta < -0.5;
              const accent = familyStyle('recovery').accent;
              const trendColor = up ? theme.colors.warning : down ? theme.colors.success : theme.colors.textSecondary;
              const trendLabel = up ? `+${Math.round(delta)} vs 4-wk avg` : down ? `${Math.round(delta)} vs 4-wk avg` : 'Steady';
              const lineData = sufferTrend.map((w) => ({ value: Math.round(w.avg), label: w.label.split(' ')[0] }));
              const maxY = Math.max(...lineData.map((d) => d.value), 10);
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["SufferTrend"]}
                    title={WIDGET_TITLES["SufferTrend"]}
                    icon={Flame}
                    caption="Relative Effort trend"
                  >
                    <View style={styles.bigStatRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                        <AnimatedNumber value={Math.round(currentWeek.avg)} style={[styles.bigStatNum, { color: accent }] as any} />
                        <Typography style={styles.bigStatUnit}>avg this wk</Typography>
                      </View>
                      <View style={[styles.bigStatChip, { backgroundColor: trendColor + '22' }]}>
                        {up ? (
                          <TrendingUp color={trendColor} size={11} />
                        ) : down ? (
                          <TrendingDown color={trendColor} size={11} />
                        ) : null}
                        <Typography style={[styles.bigStatChipTxt, { color: trendColor }]}>
                          {trendLabel}
                        </Typography>
                      </View>
                    </View>
                    <View style={{ overflow: 'hidden', marginVertical: 4 }}>
                      <LineChart
                        {...lineProps('recovery')}
                        data={lineData}
                        height={60}
                        width={width - 80}
                        spacing={(width - 80) / Math.max(lineData.length - 1, 1)}
                        initialSpacing={4}
                        endSpacing={4}
                        disableScroll
                        maxValue={maxY * 1.15}
                        hideRules
                        {...chartBase({ family: 'recovery', hideYAxis: true })}
                        yAxisLabelWidth={0}
                        xAxisLabelTextStyle={{ color: 'transparent' }}
                        pointerConfig={pointerConfig(' RE', 'recovery')}
                      />
                    </View>
                    <Typography style={styles.paceLegendItem}>
                      Last 8 weeks · {currentWeek.count} session{currentWeek.count === 1 ? '' : 's'} this week
                    </Typography>
                  </WidgetCard>
                </StaggerItem>
              );
            }
            case "KudosLeaderboard": {
              if (topKudos.length === 0) return null;
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["KudosLeaderboard"]}
                    title={WIDGET_TITLES["KudosLeaderboard"]}
                    icon={ThumbsUp}
                  >
                    {topKudos.map((act, i) => {
                      const color = getActivityColor(act.type);
                      return (
                        <TouchableOpacity
                          key={act.id}
                          onPress={() =>
                            (navigation as any).navigate('Activities', {
                              screen: 'ActivityDetail',
                              params: { activity: act },
                            })
                          }
                          activeOpacity={0.8}
                          style={[styles.recentRow, i === topKudos.length - 1 && { borderBottomWidth: 0 }]}
                        >
                          <View
                            style={[styles.recentIconPill, { backgroundColor: color + '22', borderColor: color + '55' }]}
                          >
                            {getActivityIcon(act.type, color, 16)}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Typography style={styles.recentName} numberOfLines={1}>
                              {act.name || act.type}
                            </Typography>
                            <Typography style={styles.recentDate}>
                              {format(parseISO(act.startDate), 'EEE, MMM d')}
                            </Typography>
                          </View>
                          <View style={[styles.kudosChip, { backgroundColor: familyStyle('social').accent + '22' }]}>
                            <ThumbsUp color={familyStyle('social').accent} size={11} />
                            <Typography style={[styles.kudosChipTxt, { color: familyStyle('social').accent }]}>
                              {act.kudosCount}
                            </Typography>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </WidgetCard>
                </StaggerItem>
              );
            }
            case "StarredSegments": {
              const segs = (starredSegments || []).slice(0, 5);
              const accent = familyStyle('records').accent;
              if (segs.length === 0) {
                // Loading skeleton while starred segments fetch (authenticated +
                // active). Otherwise render nothing.
                if (!needsStarred) return null;
                return (
                  <StaggerItem key={widgetId} index={idx}>
                    <WidgetCard
                      family={WIDGET_FAMILY["StarredSegments"]}
                      title={WIDGET_TITLES["StarredSegments"]}
                      icon={Star}
                    >
                      {[0, 1, 2].map((i) => (
                        <View key={i} style={[styles.recentRow, i === 2 && { borderBottomWidth: 0 }]}>
                          <Skeleton width={48} height={36} radius={8} />
                          <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                            <Skeleton width={'60%' as any} height={13} />
                            <Skeleton width={'40%' as any} height={10} />
                          </View>
                        </View>
                      ))}
                    </WidgetCard>
                  </StaggerItem>
                );
              }
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["StarredSegments"]}
                    title={WIDGET_TITLES["StarredSegments"]}
                    icon={Star}
                  >
                    {segs.map((seg: any, i: number) => {
                      const polyStr: string = seg?.map?.polyline || seg?.map?.summary_polyline || '';
                      const coords = polyStr ? decodePolyline(polyStr) : [];
                      const thumb = (() => {
                        if (!coords.length) return null;
                        const w = 48;
                        const h = 36;
                        const pad = 4;
                        let minLat = coords[0].latitude, maxLat = coords[0].latitude;
                        let minLng = coords[0].longitude, maxLng = coords[0].longitude;
                        for (const c of coords) {
                          if (c.latitude < minLat) minLat = c.latitude;
                          if (c.latitude > maxLat) maxLat = c.latitude;
                          if (c.longitude < minLng) minLng = c.longitude;
                          if (c.longitude > maxLng) maxLng = c.longitude;
                        }
                        const latR = Math.max(maxLat - minLat, 1e-6);
                        const lngR = Math.max(maxLng - minLng, 1e-6);
                        const scale = Math.min((w - 2 * pad) / lngR, (h - 2 * pad) / latR);
                        const xOff = (w - lngR * scale) / 2;
                        const yOff = (h - latR * scale) / 2;
                        let d = '';
                        for (let j = 0; j < coords.length; j++) {
                          const x = xOff + (coords[j].longitude - minLng) * scale;
                          const y = yOff + (maxLat - coords[j].latitude) * scale;
                          d += `${j === 0 ? 'M' : ' L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                        }
                        return { d, w, h };
                      })();
                      return (
                        <TouchableOpacity
                          key={seg.id}
                          activeOpacity={0.8}
                          onPress={() =>
                            Linking.openURL(`https://www.strava.com/segments/${seg.id}`).catch(() => {})
                          }
                          style={[styles.recentRow, i === segs.length - 1 && { borderBottomWidth: 0 }]}
                        >
                          <View style={[styles.segmentThumb, { borderColor: accent + '55' }]}>
                            {thumb ? (
                              <Svg width={thumb.w} height={thumb.h}>
                                <Path d={thumb.d} stroke={accent} strokeWidth={1.6} fill="none" />
                              </Svg>
                            ) : (
                              <Star color={accent} size={16} />
                            )}
                          </View>
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Typography style={styles.recentName} numberOfLines={1}>
                              {seg.name}
                            </Typography>
                            <Typography style={styles.recentDate}>
                              {((seg.distance || 0) / 1000).toFixed(2)} km · {Math.round(seg.elevation_high - seg.elevation_low || seg.total_elevation_gain || 0)} m elev
                            </Typography>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </WidgetCard>
                </StaggerItem>
              );
            }
            case "StravaTotals": {
              if (!athleteStats) {
                // While the lifetime totals are still fetching (authenticated +
                // active widget), show a layout-matched skeleton ring row rather
                // than popping in. If never connected, needsAthleteStats is false
                // and we render nothing.
                if (!needsAthleteStats) return null;
                return (
                  <StaggerItem key={widgetId} index={idx}>
                    <WidgetCard
                      family={WIDGET_FAMILY["StravaTotals"]}
                      title={WIDGET_TITLES["StravaTotals"]}
                      icon={BarChart3}
                      caption="Lifetime via Strava"
                    >
                      <View style={styles.totalsRow}>
                        {[0, 1, 2, 3].map((i) => (
                          <View key={i} style={styles.totalsCell}>
                            <Skeleton width={72} height={72} radius={36} />
                            <Skeleton width={40} height={11} style={{ marginTop: 8 }} />
                            <Skeleton width={56} height={9} style={{ marginTop: 4 }} />
                          </View>
                        ))}
                      </View>
                    </WidgetCard>
                  </StaggerItem>
                );
              }
              const stats = athleteStats.stats;
              const runKm = Math.round((stats?.all_run_totals?.distance || 0) / 1000);
              const rideKm = Math.round((stats?.all_ride_totals?.distance || 0) / 1000);
              const swimKm = Math.round((stats?.all_swim_totals?.distance || 0) / 1000);
              const runCount = stats?.all_run_totals?.count || 0;
              const rideCount = stats?.all_ride_totals?.count || 0;
              const swimCount = stats?.all_swim_totals?.count || 0;
              // Strava's athlete stats endpoint doesn't break out walks, so
              // derive walk km/count from the synced activity list.
              const walkActs = activities.filter((a) => a.type === 'Walk');
              const walkKm = Math.round(walkActs.reduce((s, a) => s + a.distance / 1000, 0));
              const walkCount = walkActs.length;
              const accent = familyStyle('activity').accent;
              const maxKm = Math.max(runKm, rideKm, swimKm, walkKm, 1);
              const ringDatum: Array<{ label: string; icon: any; km: number; count: number; color: string }> = [
                { label: 'Run', icon: Footprints, km: runKm, count: runCount, color: '#F97316' },
                { label: 'Walk', icon: PersonStanding, km: walkKm, count: walkCount, color: '#10B981' },
                { label: 'Ride', icon: Bike, km: rideKm, count: rideCount, color: '#3B82F6' },
                { label: 'Swim', icon: Waves, km: swimKm, count: swimCount, color: '#22D3EE' },
              ];
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["StravaTotals"]}
                    title={WIDGET_TITLES["StravaTotals"]}
                    icon={BarChart3}
                    caption="Lifetime via Strava"
                  >
                    <View style={styles.totalsRow}>
                      {ringDatum.map((d) => {
                        const Icon = d.icon;
                        const pct = Math.min(1, d.km / maxKm);
                        return (
                          <View key={d.label} style={styles.totalsCell}>
                            <DonutRing
                              size={72}
                              stroke={7}
                              progress={pct}
                              color={d.color}
                              gradient={[d.color, d.color + 'AA']}
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
                  </WidgetCard>
                </StaggerItem>
              );
            }
            case "SportSplit": {
              if (sportSplit.entries.length === 0) return null;
              const pieData = sportSplit.entries.map((e) => ({
                value: e.km,
                color: getActivityColor(e.type),
                text: `${Math.round((e.km / Math.max(1, sportSplit.total)) * 100)}%`,
              }));
              const dominant = sportSplit.entries[0];
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["SportSplit"]}
                    title={WIDGET_TITLES["SportSplit"]}
                    icon={PieChartIcon}
                    caption={`${new Date().getFullYear()} · km`}
                  >
                    <View style={styles.mixPieRow}>
                      <PieChart
                        {...pieProps()}
                        data={pieData}
                        radius={62}
                        innerRadius={40}
                        centerLabelComponent={() => (
                          <View style={{ alignItems: 'center' }}>
                            <Typography style={styles.mixCenterNum}>{sportSplit.total}</Typography>
                            <Typography style={styles.mixCenterLbl}>km YTD</Typography>
                          </View>
                        )}
                      />
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <Typography style={styles.mixDominant}>{dominant.type} leads</Typography>
                        <Typography style={styles.mixDominantSub}>
                          {dominant.km} km · {Math.round((dominant.km / Math.max(1, sportSplit.total)) * 100)}% of YTD
                        </Typography>
                      </View>
                    </View>
                    <View style={{ gap: 8, marginTop: 4 }}>
                      {sportSplit.entries.map((e) => {
                        const color = getActivityColor(e.type);
                        const pct = Math.round((e.km / Math.max(1, sportSplit.total)) * 100);
                        return (
                          <View key={e.type} style={styles.mixLegendRow}>
                            <View style={[styles.mixLegendDot, { backgroundColor: color }]} />
                            <Typography style={styles.mixLegendType}>{e.type}</Typography>
                            <Typography style={[styles.mixLegendPct, { color }]}>{pct}%</Typography>
                            <Typography style={styles.mixLegendCount}>{e.km} km</Typography>
                          </View>
                        );
                      })}
                    </View>
                  </WidgetCard>
                </StaggerItem>
              );
            }
            case "TrainerRatio": {
              if (!trainerRatio) return null;
              const accent = familyStyle('activity').accent;
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["TrainerRatio"]}
                    title={WIDGET_TITLES["TrainerRatio"]}
                    icon={Bike}
                    caption="Last 30 days"
                  >
                    <View style={styles.bigStatRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                        <Typography style={[styles.bigStatNum, { color: accent }]}>
                          {trainerRatio.outdoorPct}
                        </Typography>
                        <Typography style={styles.bigStatUnit}>% outdoor</Typography>
                      </View>
                      <View style={[styles.bigStatChip, { backgroundColor: accent + '22' }]}>
                        <Bike color={accent} size={11} />
                        <Typography style={[styles.bigStatChipTxt, { color: accent }]}>
                          {trainerRatio.total} ride{trainerRatio.total === 1 ? '' : 's'}
                        </Typography>
                      </View>
                    </View>
                    <View style={styles.intensityBarTrack}>
                      <View
                        style={{
                          width: `${trainerRatio.outdoorPct}%`,
                          backgroundColor: accent,
                        }}
                      />
                      <View
                        style={{
                          width: `${trainerRatio.trainerPct}%`,
                          backgroundColor: theme.colors.textSecondary,
                        }}
                      />
                    </View>
                    <View style={styles.intensityLegendRow}>
                      <View style={styles.intensityLegendItem}>
                        <View style={[styles.intensityDot, { backgroundColor: accent }]} />
                        <Typography style={styles.intensityLegendTxt}>
                          {trainerRatio.outdoorCount} outdoor
                        </Typography>
                      </View>
                      <View style={styles.intensityLegendItem}>
                        <Typography style={styles.intensityLegendTxt}>
                          {trainerRatio.trainerCount} trainer
                        </Typography>
                        <Home size={10} color={theme.colors.textSecondary} />
                      </View>
                    </View>
                  </WidgetCard>
                </StaggerItem>
              );
            }
            case "PhotoStream": {
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["PhotoStream"]}
                    title={WIDGET_TITLES["PhotoStream"]}
                    icon={ImageIcon}
                  >
                    {photoLoading ? (
                      <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 4 }}>
                        {[0, 1, 2].map((i) => (
                          <Skeleton key={i} width={110} height={110} radius={12} />
                        ))}
                      </View>
                    ) : photoThumbs.length === 0 ? (
                      <Typography style={[styles.emptyText, { textAlign: 'center', padding: 12 }]}>
                        No photos on your recent activities yet.
                      </Typography>
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
                      >
                        {photoThumbs.map((p, i) => (
                          <TouchableOpacity
                            key={`${p.activityId}-${i}`}
                            activeOpacity={0.85}
                            onPress={() =>
                              Linking.openURL(`https://www.strava.com/activities/${p.activityId}`).catch(() => {})
                            }
                          >
                            <Image source={{ uri: p.url }} style={styles.photoThumb} resizeMode="cover" />
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </WidgetCard>
                </StaggerItem>
              );
            }
            case "PowerZones": {
              if (!recentRideWithWatts || !powerBuckets || powerBuckets.length === 0) return null;
              const total = powerBuckets.reduce((s, b) => s + b.time, 0);
              if (total === 0) return null;
              const accent = familyStyle('health').accent;
              const zoneColors = ['#0ea5e9', '#22c55e', '#84cc16', '#facc15', '#f97316', '#ef4444', '#dc2626'];
              const zones = powerBuckets.slice(0, 7).map((b, i) => ({
                label: `Z${i + 1}`,
                seconds: b.time,
                pct: b.time / total,
                color: zoneColors[i] || accent,
              }));
              const maxPct = Math.max(...zones.map((z) => z.pct), 0.01);
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["PowerZones"]}
                    title={WIDGET_TITLES["PowerZones"]}
                    icon={Gauge}
                    caption={recentRideWithWatts.name || 'Latest ride'}
                  >
                    <View style={styles.hrZoneRow}>
                      {zones.map((z, i) => {
                        const h = z.pct > 0 ? Math.max(8, (z.pct / maxPct) * 70) : 4;
                        return (
                          <View key={z.label} style={styles.hrZoneCol}>
                            <Typography style={[styles.hrZonePct, { color: z.pct > 0 ? z.color : theme.colors.textSecondary }]}>
                              {Math.round(z.pct * 100)}%
                            </Typography>
                            <View style={{ height: 70, justifyContent: 'flex-end', width: '100%', alignItems: 'center' }}>
                              <LinearGradient
                                colors={[z.color, z.color + '55']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 1 }}
                                style={{ width: '70%', height: h, borderRadius: 4 }}
                              />
                            </View>
                            <Typography style={[styles.hrZoneLbl, { color: z.color }]}>{z.label}</Typography>
                          </View>
                        );
                      })}
                    </View>
                    <Typography style={[styles.paceLegendItem, { textAlign: 'center', marginTop: 8 }]}>
                      Total {formatDuration(total)} in power zones
                    </Typography>
                  </WidgetCard>
                </StaggerItem>
              );
            }
            case "EnergyExpenditure": {
              if (energy7d.total === 0) return null;
              const accent = familyStyle('health').accent;
              const barData = energy7d.days.map((d) => ({ value: d.kcal, label: d.day }));
              const maxKcal = Math.max(...energy7d.days.map((d) => d.kcal), 1);
              return (
                <StaggerItem key={widgetId} index={idx}>
                  <WidgetCard
                    family={WIDGET_FAMILY["EnergyExpenditure"]}
                    title={WIDGET_TITLES["EnergyExpenditure"]}
                    icon={Flame}
                  >
                    <View style={styles.bigStatRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                        <AnimatedNumber value={energy7d.total} style={[styles.bigStatNum, { color: accent }] as any} />
                        <Typography style={styles.bigStatUnit}>kcal total</Typography>
                      </View>
                      <View style={[styles.bigStatChip, { backgroundColor: accent + '22' }]}>
                        <Flame color={accent} size={11} />
                        <Typography style={[styles.bigStatChipTxt, { color: accent }]}>
                          {energy7d.avg} avg/day
                        </Typography>
                      </View>
                    </View>
                    <View style={{ overflow: 'hidden', marginVertical: 4 }}>
                      <BarChart
                        {...barProps('health')}
                        data={barData}
                        height={80}
                        width={width - 80}
                        barWidth={Math.max(12, (width - 120) / 7 - 6)}
                        initialSpacing={6}
                        spacing={6}
                        disableScroll
                        maxValue={Math.ceil(maxKcal * 1.2)}
                        hideRules
                        {...chartBase({ family: 'health', hideYAxis: true })}
                        yAxisLabelWidth={0}
                        pointerConfig={pointerConfig(' kcal', 'health')}
                      />
                    </View>
                  </WidgetCard>
                </StaggerItem>
              );
            }
            default:
              return null;
          }

        })}

        {/* ── Edit Layout Modal ── */}
      </ScrollView>

      <WidgetCatalog
        visible={layoutModalVisible}
        onClose={() => setLayoutModalVisible(false)}
        catalog={defaultLayout.map<WidgetCatalogEntry>(id => ({ id, title: WIDGET_TITLES[id] || id }))}
        activeIds={settings.widgetLayout || defaultLayout}
        onToggle={handleToggleWidget}
        onMove={(id, dir) => {
          const list = [...(settings.widgetLayout || defaultLayout)];
          const idx = list.indexOf(id);
          if (idx < 0) return;
          handleMoveWidget(idx, dir);
        }}
      />

      {/* ── Info Bottom Sheet ── */}
      <BottomSheet
        visible={!!infoSheet}
        onClose={() => setInfoSheet(null)}
        title={infoSheet?.title || ''}
        icon={Info}
        family="plan"
      >
        <Typography style={styles.sheetBody}>
          {infoSheet?.body}
        </Typography>
        {infoSheet?.rows && infoSheet.rows.length > 0 && (
          <View style={{ marginTop: 14 }}>
            {infoSheet.rows.map((r, i) => {
              // Pick a reasonable icon + family per row by sniffing the label.
              // Falls back to Info / plan when nothing matches.
              const lower = r.label.toLowerCase();
              let icon = Info;
              let fam: keyof typeof theme.colors.families = 'plan';
              if (lower.includes('low') || lower.includes('easy') || lower.includes('recovery')) {
                icon = Heart; fam = 'recovery';
              } else if (lower.includes('high') || lower.includes('hard') || lower.includes('intense')) {
                icon = Zap; fam = 'health';
              } else if (lower.includes('heart') || lower.includes('hr') || lower.includes('bpm')) {
                icon = Heart; fam = 'health';
              } else if (lower.includes('pace') || lower.includes('speed')) {
                icon = Timer; fam = 'records';
              } else if (lower.includes('distance') || lower.includes('km') || lower.includes('mile')) {
                icon = MapPin; fam = 'activity';
              } else if (lower.includes('time') || lower.includes('hour') || lower.includes('duration')) {
                icon = Clock; fam = 'activity';
              } else if (lower.includes('elev') || lower.includes('climb')) {
                icon = Mountain; fam = 'activity';
              } else if (lower.includes('cadence') || lower.includes('spm')) {
                icon = Activity; fam = 'health';
              } else if (lower.includes('streak') || lower.includes('consist')) {
                icon = Flame; fam = 'activity';
              } else if (lower.includes('load') || lower.includes('tsb') || lower.includes('ctl') || lower.includes('atl')) {
                icon = TrendingUp; fam = 'recovery';
              }
              return (
                <HelperRow
                  key={r.label + i}
                  icon={icon}
                  label={r.label}
                  description={r.desc}
                  family={fam}
                  isLast={i === (infoSheet.rows?.length || 0) - 1}
                />
              );
            })}
          </View>
        )}
        <SheetCTA
          family="plan"
          icon={Info}
          label="Got it"
          onPress={() => setInfoSheet(null)}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { padding: 16, paddingBottom: 32 },

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
    color: '#fff',
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
  heroChipVal: { fontSize: 16, fontWeight: '900', color: '#fff', lineHeight: 18 },
  heroChipLbl: { fontSize: 9, color: 'rgba(255,255,255,0.7)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, lineHeight: 11 },

  trendBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  trendText: { fontSize: 10, fontWeight: "600" },

  emptyCard: { padding: 20, alignItems: "center", marginBottom: 16 },
  emptyText: { color: theme.colors.textSecondary, fontSize: 13 },

  barUnit: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },

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

  // ── Premium widget body primitives ──
  bigStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  bigStatNum: {
    fontSize: 36,
    fontWeight: '900',
    lineHeight: 40,
    color: theme.colors.text,
    letterSpacing: -1,
  },
  bigStatUnit: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '700',
    marginLeft: 6,
  },
  bigStatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  bigStatChipTxt: { fontSize: 11, fontWeight: '800' },
  subStatRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 10 },
  subStatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  subStatTxt: { fontSize: 10, color: theme.colors.text, fontWeight: '700' },

  // ── Tile grid (ThisWeek / AllTimeStats) ──
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '48%',
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tileIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  tileVal: { fontSize: 20, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.5 },
  tileUnit: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '700' },
  tileLbl: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },

  // ── This week 7-day bar row ──
  weekDayRow: { flexDirection: 'row', alignItems: 'flex-end', height: 38, gap: 4, marginTop: 12 },
  weekDayCol: { flex: 1, alignItems: 'center' },
  weekDayBar: { width: '100%', borderRadius: 3 },
  weekDayLbl: { fontSize: 9, color: theme.colors.textSecondary, fontWeight: '700', marginTop: 4 },

  // ── Weekly goal tracker ring ──
  weeklyRingRow: { alignItems: 'center', marginBottom: 4 },
  weeklyRingNum: { fontSize: 28, fontWeight: '900', letterSpacing: -1, lineHeight: 30 },
  weeklyRingGoal: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: '700', marginTop: 2 },
  weeklyRingPct: { fontSize: 11, fontWeight: '800', marginTop: 2 },
  weekDotRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  weekDotCol: { alignItems: 'center', flex: 1 },
  weekDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  weekDotLbl: { fontSize: 9, color: theme.colors.textSecondary, fontWeight: '700', marginTop: 4 },

  // ── Current focus quote ──
  focusQuoteTitle: { fontSize: 17, fontWeight: '900', color: theme.colors.text, marginBottom: 6, letterSpacing: -0.3 },
  focusQuoteBody: { fontSize: 14, fontStyle: 'italic', color: theme.colors.text, lineHeight: 20, marginBottom: 8 },
  focusQuoteCaption: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '700' },

  // ── Upcoming workout ──
  upcomingHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  upcomingKindPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  upcomingKindLbl: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  upcomingGoalLbl: { fontSize: 11, color: theme.colors.textSecondary, flex: 1, fontWeight: '600' },
  upcomingDayLbl: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 },
  upcomingTitle: { fontSize: 20, fontWeight: '900', color: theme.colors.text, marginBottom: 10, letterSpacing: -0.5 },
  upcomingChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  upcomingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  upcomingChipTxt: { fontSize: 11, fontWeight: '700', color: theme.colors.text },
  upcomingExecute: {
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.accent,
  },
  upcomingExecuteLbl: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  upcomingExecuteBody: { fontSize: 12, color: theme.colors.text, lineHeight: 17 },

  // ── Active goal premium row ──
  goalRowPremium: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  goalTitlePremium: { fontSize: 14, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.2 },
  goalSubPremium: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2, marginBottom: 6 },
  goalDaysChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  goalDaysChipTxt: { fontSize: 10, fontWeight: '800' },
  goalRingNum: { fontSize: 14, fontWeight: '900', lineHeight: 16, letterSpacing: -0.4 },
  goalRingLbl: { fontSize: 9, color: theme.colors.textSecondary, fontWeight: '700' },

  // ── Recovery advisor ring ──
  recoveryRow: { flexDirection: 'row', alignItems: 'center' },
  recoveryRingNum: { fontSize: 18, fontWeight: '900', lineHeight: 20, letterSpacing: -0.4 },
  recoveryRingLbl: { fontSize: 9, color: theme.colors.textSecondary, fontWeight: '700', marginTop: 1 },
  recoveryStatus: { fontSize: 16, fontWeight: '900', letterSpacing: -0.3, marginBottom: 4 },
  recoveryDesc: { fontSize: 12, color: theme.colors.text, lineHeight: 17 },

  // ── Wellness ring ──
  wellnessRow: { flexDirection: 'row', alignItems: 'center' },
  wellnessRingNum: { fontSize: 24, fontWeight: '900', letterSpacing: -0.8, lineHeight: 26 },
  wellnessRingLbl: { fontSize: 10, fontWeight: '700', marginTop: 1 },
  wellnessLabel: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3, marginBottom: 4 },
  wellnessSubGrid: { flexDirection: 'row', gap: 14, marginTop: 8 },
  wellnessSubCell: {},
  wellnessSubLbl: { fontSize: 9, color: theme.colors.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  wellnessSubVal: { fontSize: 13, fontWeight: '800', marginTop: 1 },

  // ── Injury alert band ──
  injuryBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.warning + '1A',
    borderColor: theme.colors.warning + '55',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  injuryTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginBottom: 2 },
  injuryBody: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 17 },
  injuryCount: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.warning + '33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  injuryCountNum: { fontSize: 13, fontWeight: '900', color: theme.colors.warning },

  // ── Training load legend ──
  tlLegendRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 6 },
  tlLegendItem: { alignItems: 'center' },
  tlLegendDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 4 },
  tlLegendLbl: { fontSize: 9, color: theme.colors.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  tlLegendVal: { fontSize: 16, fontWeight: '900', color: theme.colors.text, marginTop: 1, letterSpacing: -0.3 },

  // ── Shoe tracker rows ──
  shoeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  shoeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    marginRight: 12,
  },
  shoeName: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  shoeBrand: { fontSize: 10, color: theme.colors.textSecondary, marginTop: 1 },
  shoeMileage: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '700', marginTop: 4 },
  shoeRingPct: { fontSize: 13, fontWeight: '900', color: theme.colors.text, lineHeight: 14, letterSpacing: -0.3 },
  shoeRingLbl: { fontSize: 8, color: theme.colors.textSecondary, fontWeight: '700' },

  // ── Year-to-date ──
  ytdHeroRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  ytdRingNum: { fontSize: 26, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.8, lineHeight: 28 },
  ytdRingLbl: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: '700', marginTop: 1 },
  ytdGoalLbl: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  ytdGoalVal: { fontSize: 18, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.4, marginTop: 2 },
  ytdProgressTrack: {
    height: 6,
    backgroundColor: theme.colors.background,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 10,
    position: 'relative',
  },
  ytdProgressFill: { height: '100%', borderRadius: 3 },
  ytdProgressTxt: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: '700', marginTop: 4 },
  ytdBarRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 44, paddingHorizontal: 4 },
  ytdBarCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  ytdBar: { width: '70%', borderRadius: 3 },
  ytdBarLbl: { fontSize: 9, color: theme.colors.textSecondary, fontWeight: '700', marginTop: 3 },

  // ── Monthly volume bar row (12 months) ──
  monthlyBarRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 70, paddingHorizontal: 4 },
  monthlyBarCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  monthlyBar: { width: '70%', borderRadius: 3 },
  monthlyBarLbl: { fontSize: 9, color: theme.colors.textSecondary, fontWeight: '700', marginTop: 4 },

  // ── HeartRate zone histogram ──
  hrZoneRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6, height: 90, marginTop: 4 },
  hrZoneCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  hrZonePct: { fontSize: 10, fontWeight: '800', marginBottom: 4 },
  hrZoneLbl: { fontSize: 10, fontWeight: '800', marginTop: 4 },

  // ── PB tiles ──
  pbGrid: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  pbTile: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pbTileDist: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  pbTileTime: { fontSize: 20, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  pbTileDate: { fontSize: 9, color: theme.colors.textSecondary, fontWeight: '600', marginTop: 4 },
  pbSubRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  pbSubChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pbSubTxt: { fontSize: 10, color: theme.colors.text, fontWeight: '700' },
  pbLink: { alignSelf: 'center', marginTop: 8, padding: 6 },
  pbLinkTxt: { fontSize: 11, fontWeight: '800' },

  // ── Race predictor rows ──
  raceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  raceIconPill: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    marginRight: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  raceRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  raceLabel: { fontSize: 13, fontWeight: '800', color: theme.colors.text, textTransform: 'uppercase', letterSpacing: 0.5 },
  raceTime: { fontSize: 16, fontWeight: '900', color: theme.colors.text, fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
  raceConfTrack: {
    height: 4,
    backgroundColor: theme.colors.background,
    borderRadius: 2,
    overflow: 'hidden',
  },
  raceConfFill: { height: '100%', borderRadius: 2 },
  raceConfLbl: { fontSize: 9, color: theme.colors.textSecondary, fontWeight: '700', marginTop: 3 },

  // ── Activity mix pie + legend ──
  mixPieRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  mixCenterNum: { fontSize: 18, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.4 },
  mixCenterLbl: { fontSize: 9, color: theme.colors.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  mixDominant: { fontSize: 16, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.3 },
  mixDominantSub: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '600', marginTop: 2 },
  mixLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mixLegendDot: { width: 10, height: 10, borderRadius: 5 },
  mixLegendType: { flex: 1, fontSize: 12, fontWeight: '700', color: theme.colors.text },
  mixLegendPct: { fontSize: 12, fontWeight: '900', width: 38, textAlign: 'right' },
  mixLegendCount: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '700', width: 24, textAlign: 'right' },

  // ── All-time tile grid (6 tiles) ──
  allTimeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  allTimeTile: {
    width: '31%',
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  allTimeVal: { fontSize: 16, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.4 },
  allTimeUnit: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: '700' },
  allTimeLbl: { fontSize: 9, color: theme.colors.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },

  // ── Intensity distribution ──
  intensityBarTrack: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    marginBottom: 10,
  },
  intensityLegendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  intensityLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  intensityLegendTxt: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '700' },
  intensityDot: { width: 8, height: 8, borderRadius: 4 },

  // ── Recent activities premium row ──
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  recentIconPill: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
  },
  recentName: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  recentDate: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 1, fontWeight: '600' },
  recentDistChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  recentDistTxt: { fontSize: 11, fontWeight: '900', letterSpacing: -0.2 },

  // ── Pace trend ──
  paceLegendRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  paceLegendItem: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '600' },

  // ── Cadence gauge ──
  cadenceGaugeTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.background,
    overflow: 'hidden',
    position: 'relative',
    marginTop: 8,
  },
  cadenceOptZone: { position: 'absolute', top: 0, bottom: 0, backgroundColor: theme.colors.success + '33' },
  cadenceMarker: { position: 'absolute', top: 0, bottom: 0, width: 4, borderRadius: 2 },
  cadenceLabelsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  cadenceLabelTxt: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: '700' },

  // ── Best efforts list rows ──
  bestEffortRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  bestEffortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  bestEffortDist: { fontSize: 11, fontWeight: '900' },
  bestEffortTime: { fontSize: 18, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  bestEffortDate: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: '600', marginTop: 1 },
  bestEffortChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  bestEffortChipTxt: { fontSize: 10, fontWeight: '900' },

  // ── Kudos leaderboard chip ──
  kudosChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
  },
  kudosChipTxt: { fontSize: 11, fontWeight: '900', letterSpacing: -0.2 },

  // ── Starred-segment thumbnail box ──
  segmentThumb: {
    width: 48,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Strava totals (3 hero rings) ──
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

  // ── Photo stream thumbnails ──
  photoThumb: {
    width: 110,
    height: 110,
    borderRadius: 12,
    backgroundColor: theme.colors.background,
  },
});
