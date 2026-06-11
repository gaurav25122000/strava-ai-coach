import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { activityDayKey, formatPace, localDateStr, mondayOf, weekKey } from '../utils/dates';
import { DEFAULT_WIDGET_LAYOUT, KNOWN_WIDGET_IDS, RETIRED_WIDGETS } from '../utils/widgetFamilies';
import { ToastOptions, useToastStore } from './useToast';

export type { ToastOptions } from './useToast';

const asyncStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return await AsyncStorage.getItem(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await AsyncStorage.setItem(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await AsyncStorage.removeItem(name);
  },
};

export const secureSettingsStorage = {
  getSecret: async (key: string): Promise<string | null> => {
     if (Platform.OS === 'web') return localStorage.getItem(`secret_${key}`);
     return await SecureStore.getItemAsync(key);
  },
  setSecret: async (key: string, value: string): Promise<void> => {
     if (Platform.OS === 'web') localStorage.setItem(`secret_${key}`, value);
     else await SecureStore.setItemAsync(key, value);
  },
  removeSecret: async (key: string): Promise<void> => {
     if (Platform.OS === 'web') localStorage.removeItem(`secret_${key}`);
     else await SecureStore.deleteItemAsync(key);
  }
};

export interface ZoneBucket {
  min: number;
  max: number;
  time: number; // seconds in this zone
}

export interface ActivityZoneDistribution {
  type: 'heartrate' | 'power';
  buckets: ZoneBucket[];
  fetchedAt: string; // ISO — when this cache was populated
}

export interface Activity {
  id: string;
  // Strava sport_type ('Run' | 'TrailRun' | 'Ride' | 'Walk' | 'Hike' | 'Swim'
  // | 'WeightTraining' | …). Kept open — Strava adds types and the old
  // 4-value union silently lied about what's stored.
  type: string;
  distance: number; // in meters
  movingTime: number; // in seconds
  elapsedTime: number;
  totalElevationGain: number; // in meters
  /** UTC instant (Strava start_date). Sort with this. */
  startDate: string;
  /** Athlete wall-clock (Strava start_date_local). Day-bucket with this. */
  startDateLocal?: string;
  averageSpeed: number; // m/s
  maxSpeed: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  averageCadence?: number;
  steps?: number;
  calories?: number;
  /** True when calories came from our MET estimate, not Strava. */
  caloriesEstimated?: boolean;
  kilojoules?: number;
  averageWatts?: number;
  /** True when watts came from a power meter (Strava device_watts). */
  deviceWatts?: boolean;
  sufferScore?: number;
  name?: string;
  /** Strava gear id (shoe/bike) for per-activity gear attribution. */
  gearId?: string;
  /** Route polyline (summary from list, full from detail enrichment). */
  polyline?: string;
  /** Number of photos on Strava — gates the PhotoStream fetch. */
  photoCount?: number;
  // Social engagement from Strava — preserved when present so widgets like
  // KudosLeaderboard can rank activities without a per-activity detail fetch.
  kudosCount?: number;
  // Indoor / trainer flag from Strava (rides). Used by TrainerRatio.
  trainer?: boolean;
  // Per-activity time-in-zone distributions from Strava's own bucketing.
  // Cached so we don't refetch every render. Fetched lazily when the
  // activity is opened (and we don't already have a fresh cache).
  zones?: ActivityZoneDistribution[];
}

export type WorkoutKind =
  | 'EASY'        // easy aerobic run / Z1-Z2
  | 'TEMPO'       // sustained threshold
  | 'INTERVALS'   // structured speed
  | 'LONG'        // weekly long run
  | 'RECOVERY'    // very short, easy
  | 'CROSS'       // bike, swim, elliptical
  | 'STRENGTH'    // gym / mobility
  | 'REST';       // off day

export type RestKind =
  | 'COMPLETE'    // full off, no movement
  | 'ACTIVE_WALK' // 20-30 min easy walk
  | 'MOBILITY'    // stretch / foam roll / yoga
  | 'CROSS_LOW';  // very easy cross-training

export interface DailyPrescription {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Monday, 6 = Sunday
  kind: WorkoutKind;
  title: string;                          // "Tempo 5k @ threshold"
  description: string;                    // 1-2 sentences in plain English
  distanceKm?: number;
  durationMin?: number;
  intensity?: 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';
  rest?: { kind: RestKind; note: string };
}

export interface PlanWeek {
  /** Monday of this week, ISO YYYY-MM-DD. */
  weekStart: string;
  /** 7 entries, dayOfWeek 0..6. */
  schedule: DailyPrescription[];
  /** Optional per-week volume so plans can express real progression. */
  volumeKm?: number;
}

export interface Phase {
  name: string;
  description: string;
  weeklyVolumeTarget: number;
  longRunTarget: number;
  keyWorkout: string;
  weekStart?: string;                     // ISO date for phase start (optional for back-compat)
  weekEnd?: string;                       // ISO date for phase end
  /**
   * Legacy single 7-day template repeated across the phase. Newer plans use
   * `weeks` (one schedule per week, real progression); `schedule` is kept as
   * weeks[0] for back-compat with old consumers.
   */
  schedule?: DailyPrescription[];
  weeks?: PlanWeek[];
}

export interface CheckIn {
  date: string;                            // ISO date (YYYY-MM-DD)
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  source: 'MANUAL' | 'STRAVA';
  workoutKind: WorkoutKind;
  completed: boolean;
  activityId?: string;                     // present if source === 'STRAVA'
  notes?: string;                          // manual note, or the auto-match reason for STRAVA check-ins
  perceivedEffort?: number;                // 1-10 RPE, manual only
  /**
   * True for system-generated "Auto-skipped" placeholders. Unlike real manual
   * check-ins these are replaceable — a late Strava sync that finds an
   * activity for the date overwrites the auto-skip.
   */
  auto?: boolean;
  // How well an auto-matched Strava activity satisfied the day's prescription.
  // 'matched' → counts as done; 'partial' → logged but short/wrong-intensity;
  // 'mismatch' → wrong discipline (e.g. a ride on a run day). Undefined for
  // manual check-ins and unscheduled days.
  matchVerdict?: 'matched' | 'partial' | 'mismatch';
}

export interface Goal {
  id: string;
  title: string;
  targetDate: string;
  daysRemaining: number;
  type: 'Race' | 'Volume' | 'Frequency' | 'Simple';
  isSimple?: boolean;
  simpleCategory?: 'Frequency' | 'Distance' | 'HeartRate' | 'Time';
  simplePeriod?: 'Week' | 'Month';
  simpleTarget?: number;
  simpleActivityType?: 'All' | 'Run' | 'Walk' | 'Ride';
  lastSnapshotPeriod?: string; // "2025-W18" or "2025-04" - tracks which period was last archived
  history?: Array<{ period: string; achieved: number; target: number; completed: boolean }>;
  metric: string;
  progress: number; // 0-100
  phase: string;
  weeklyVolume: {
    current: number;
    target: number;
  };
  longRun: {
    current: number;
    target: number;
  };
  keyWorkout: string;
  targetFinishTime?: string;
  phases?: Phase[];
  chatHistory?: Array<{ role: 'user' | 'model'; text: string }>;
  checkIns?: CheckIn[];                    // per-day completion log (manual + Strava)
  progressUpdatedAt?: string;              // ISO timestamp of last computeProgress run
}

interface UserStats {
  currentStreak: number;
  bestStreak: number;
  currentWeeklyStreak?: number;
  bestWeeklyStreak?: number;
  totalRuns: number;
  totalWalks: number;
  totalKm: number;
  bestPace: string;
  topElev: number;
  lastRunDate: string;
}

export interface UserProfile {
  name: string;
  dob: string;           // YYYY-MM-DD
  weight: number;        // kg
  height: number;        // cm
  restingHR: number;     // bpm
  maxHR: number;         // bpm
  weeklyGoalKm: number;
  sleepHours: number;
  nutritionNotes: string;
  fitnessLevel: 'Beginner' | 'Intermediate' | 'Advanced';
  trainingDaysPerWeek: number;
  preferredTerrain: 'Road' | 'Trail' | 'Track' | 'Mixed';
  injuries: string;      // free text for LLM context
}

interface Settings {
  stravaClientId: string;
  stravaClientSecret: string;
  llmProvider: 'openai' | 'anthropic' | 'gemini';
  llmApiKey: string;
  unit: 'metric' | 'imperial';
  timeFormat: '12h' | '24h';
  coachPersonality: 'Strict Drill Sergeant' | 'Encouraging Supporter' | 'Data-Driven Analyst';
  privacyZones: boolean;
  activeGraphs?: string[];
  widgetLayout?: string[];
}

interface Shoe {
  id: string;
  name: string;
  brand: string;
  distance: number; // km
  /** Per-shoe lifespan in km; consumers default to 600 when unset. */
  lifespanKm?: number;
}

interface Injury {
  id: string;
  type: string;
  date: string;
  severity: 'Low' | 'Medium' | 'High';
  /** ISO timestamp when marked resolved. Active lists filter !resolvedAt. */
  resolvedAt?: string;
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  icon: string; // emoji
  earnedAt: string; // ISO date
  category: 'distance' | 'streak' | 'speed' | 'elevation' | 'frequency' | 'duration' | 'consistency';
}

export interface BestEffort {
  distance: number; // metres: 1000, 5000, 10000
  time: number;     // seconds
  pace: number;     // min/km
  date: string;
  activityName?: string;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface FoodLogEntry {
  id: string;
  /** YYYY-MM-DD (athlete-local) day the food was eaten. */
  date: string;
  meal: MealType;
  name: string;
  /** Total kcal for the logged quantity (serving kcal × quantity). */
  calories: number;
  /** Macros in grams, total for the entry. */
  protein?: number;
  carbs?: number;
  fat?: number;
  /** Serving multiplier the totals were computed with. */
  quantity: number;
  /** Human serving descriptor — "1 bowl", "100 g". */
  serving?: string;
  source: 'library' | 'manual' | 'photo';
  loggedAt: string; // ISO
}

export interface WeeklyDigest {
  weekKey: string; // "2025-W18"
  generatedAt: string;
  summary: string;
  highlight: string;
  tip: string;
}

export interface HRZone {
  min: number;
  max: number; // -1 means ∞
}

// Lifetime / recent rollups + athlete profile, as returned by Strava's
// `/athletes/{id}/stats` + `/athlete` endpoints. Cached so widgets like
// StravaTotals can render instantly without a refetch.
export interface AthleteStats {
  stats: any;   // raw Strava stats payload (recent_/ytd_/all_ run/ride/swim totals)
  athlete: any; // raw Strava athlete payload
}

// Compute current streak and best streak from a list of activities.
// Exported for tests — day bucketing goes through activityDayKey so the
// athlete's wall clock (start_date_local) wins over the UTC instant.
export function computeStreaks(activities: Activity[]): { currentStreak: number; bestStreak: number; currentWeeklyStreak: number; bestWeeklyStreak: number } {
  if (!activities.length) return { currentStreak: 0, bestStreak: 0, currentWeeklyStreak: 0, bestWeeklyStreak: 0 };

  // Get unique dates that had at least one activity
  const runDates = new Set(activities.map(a => activityDayKey(a)));

  if (!runDates.size) return { currentStreak: 0, bestStreak: 0, currentWeeklyStreak: 0, bestWeeklyStreak: 0 };

  const sorted = Array.from(runDates).sort(); // ascending YYYY-MM-DD strings

  let best = 1;
  let streak = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
    if (diffDays === 1) {
      streak++;
      if (streak > best) best = streak;
    } else {
      streak = 1;
    }
  }

  // currentStreak: streak ending today or yesterday (local time)
  const today = localDateStr(new Date());
  const yesterday = localDateStr(new Date(Date.now() - 86400000));
  const lastDate = sorted[sorted.length - 1];
  let current = 0;

  if (lastDate === today || lastDate === yesterday) {
    // Walk backwards
    current = 1;
    for (let i = sorted.length - 2; i >= 0; i--) {
      const later = new Date(sorted[i + 1]);
      const earlier = new Date(sorted[i]);
      const diff = Math.round((later.getTime() - earlier.getTime()) / 86400000);
      if (diff === 1) current++;
      else break;
    }
  }

  // Weekly Streaks
  const runWeeks = new Set(
    activities.map(a => weekKey(new Date(activityDayKey(a))))
  );

  const sortedWeeks = Array.from(runWeeks).sort();
  let bestWeekly = 1;
  let streakWeekly = 1;

  for (let i = 1; i < sortedWeeks.length; i++) {
    const prev = new Date(sortedWeeks[i - 1]);
    const curr = new Date(sortedWeeks[i]);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
    if (diffDays === 7) {
      streakWeekly++;
      if (streakWeekly > bestWeekly) bestWeekly = streakWeekly;
    } else {
      streakWeekly = 1;
    }
  }

  const thisMonday = mondayOf(new Date());
  const thisWeekStr = localDateStr(thisMonday);

  const lastMonday = new Date(thisMonday.getTime() - 7 * 86400000);
  const lastWeekStr = localDateStr(lastMonday);

  const lastRunWeek = sortedWeeks[sortedWeeks.length - 1];
  let currentWeekly = 0;

  if (lastRunWeek === thisWeekStr || lastRunWeek === lastWeekStr) {
    currentWeekly = 1;
    for (let i = sortedWeeks.length - 2; i >= 0; i--) {
      const later = new Date(sortedWeeks[i + 1]);
      const earlier = new Date(sortedWeeks[i]);
      const diffDays = Math.round((later.getTime() - earlier.getTime()) / 86400000);
      if (diffDays === 7) currentWeekly++;
      else break;
    }
  }

  return { currentStreak: current, bestStreak: best, currentWeeklyStreak: currentWeekly, bestWeeklyStreak: bestWeekly };
}

// Roll the activity list up into UserStats. Run-ish types count as runs so
// TrailRun/VirtualRun no longer vanish from totals.
function deriveStats(activities: Activity[], prev: UserStats): UserStats {
  let totalRuns = 0;
  let totalWalks = 0;
  let totalKm = 0;
  let topElev = 0;
  let bestPace = Infinity;

  for (const act of activities) {
    const isRun = act.type === 'Run' || act.type === 'TrailRun' || act.type === 'VirtualRun';
    if (isRun) totalRuns++;
    if (act.type === 'Walk' || act.type === 'Hike') totalWalks++;
    totalKm += act.distance / 1000;
    if (act.totalElevationGain > topElev) topElev = act.totalElevationGain;
    if (act.averageSpeed > 0 && isRun) {
      const minPerKm = 1000 / act.averageSpeed / 60;
      if (minPerKm < bestPace) bestPace = minPerKm;
    }
  }

  const sorted = [...activities].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  const lastRunDate = sorted.length > 0 ? activityDayKey(sorted[0]) : '';
  const streaks = computeStreaks(activities);

  return {
    ...prev,
    totalRuns,
    totalWalks,
    totalKm: Math.round(totalKm),
    topElev: Math.round(topElev),
    lastRunDate,
    bestPace: isFinite(bestPace) ? formatPace(bestPace) : '0:00',
    ...streaks,
  };
}

interface AppState {
  activities: Activity[];
  goals: Goal[];
  userStats: UserStats;
  userProfile: UserProfile;
  settings: Settings;
  shoes: Shoe[];
  injuries: Injury[];
  milestones: Milestone[];
  bestEfforts: Record<number, BestEffort>; // keyed by distance in metres
  weeklyDigest: WeeklyDigest | null;
  lastSyncedAt: string | null;             // ISO timestamp of most recent Strava sync
  setActivities: (activities: Activity[]) => void;
  /**
   * Merge freshly-synced activities into the store by id (incremental sync).
   * Existing enrichment (zones cache, real calories, best efforts) survives.
   */
  upsertActivities: (incoming: Activity[]) => void;
  /** Patch one activity with detail-fetch enrichment (calories, polyline…). */
  enrichActivity: (activityId: string, patch: Partial<Activity>) => void;
  // Attach per-activity zone distribution (cached). No-op if the activity
  // isn't in the store (e.g. it was pruned).
  setActivityZones: (activityId: string, zones: ActivityZoneDistribution[]) => void;
  setGoals: (goals: Goal[]) => void;
  setUserStats: (stats: UserStats) => void;
  addGoal: (goal: Goal) => void;
  updateGoal: (goal: Goal) => void;
  deleteGoal: (id: string) => void;
  addCheckIn: (goalId: string, checkIn: CheckIn) => void;
  setLastSyncedAt: (iso: string) => void;
  updateSettings: (settings: Partial<Settings>) => void;
  updateUserProfile: (profile: Partial<UserProfile>) => void;
  addShoe: (shoe: Shoe) => void;
  setShoes: (shoes: Shoe[]) => void;
  addInjury: (injury: Injury) => void;
  updateInjury: (injury: Injury) => void;
  removeInjury: (id: string) => void;
  setMilestones: (milestones: Milestone[]) => void;
  setBestEfforts: (efforts: Record<number, BestEffort>) => void;
  setWeeklyDigest: (digest: WeeklyDigest) => void;
  hrZones: HRZone[];
  setHRZones: (zones: HRZone[]) => void;
  starredSegments: any[];
  setStarredSegments: (segs: any[]) => void;
  athleteStats: AthleteStats | null;
  setAthleteStats: (stats: AthleteStats | null) => void;
  /** Main coach-chat transcript — persisted so conversations survive restarts. */
  coachChat: Array<{ role: 'user' | 'assistant'; text: string; at: string }>;
  setCoachChat: (messages: Array<{ role: 'user' | 'assistant'; text: string; at: string }>) => void;
  setToast: (toast: ToastOptions | null) => void;
  /** Transient: a plan generation running in the background (not persisted). */
  goalGeneration: { title: string; startedAt: number } | null;
  setGoalGeneration: (gen: { title: string; startedAt: number } | null) => void;
  /** Meals/snacks the athlete logged in the calorie tracker. */
  foodLog: FoodLogEntry[];
  /** Daily intake target in kcal. */
  calorieGoal: number;
  addFoodEntries: (entries: FoodLogEntry[]) => void;
  removeFoodEntry: (id: string) => void;
  setCalorieGoal: (kcal: number) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      activities: [],
      goals: [],
      milestones: [],
      bestEfforts: {},
      weeklyDigest: null,
      lastSyncedAt: null,
      hrZones: [],
      setHRZones: (hrZones) => set({ hrZones }),
      starredSegments: [],
      setStarredSegments: (starredSegments) => set({ starredSegments }),
      athleteStats: null,
      setAthleteStats: (athleteStats) => set({ athleteStats }),
      coachChat: [],
      // Cap the persisted transcript — the chat UI shows the tail anyway.
      setCoachChat: (coachChat) => set({ coachChat: coachChat.slice(-100) }),
      // Delegates to the dedicated toast store — deliberately does NOT set()
      // here, so showing a toast never re-renders main-store subscribers or
      // triggers a persist write.
      setToast: (toast) => useToastStore.getState().show(toast),
      goalGeneration: null,
      setGoalGeneration: (goalGeneration) => set({ goalGeneration }),
      foodLog: [],
      // 2,200 kcal is a neutral adult default; the athlete tunes it in the
      // tracker (goal chip → edit sheet).
      calorieGoal: 2200,
      addFoodEntries: (entries) => set((state) => ({
        foodLog: [...state.foodLog, ...entries],
      })),
      removeFoodEntry: (id) => set((state) => ({
        foodLog: state.foodLog.filter((e) => e.id !== id),
      })),
      setCalorieGoal: (calorieGoal) => set({ calorieGoal }),
      userStats: {
        currentStreak: 0,
        bestStreak: 0,
        totalRuns: 0,
        totalWalks: 0,
        totalKm: 0,
        bestPace: '0:00',
        topElev: 0,
        lastRunDate: new Date().toISOString(),
      },
      userProfile: {
        name: '',
        dob: '',
        weight: 0,
        height: 0,
        restingHR: 0,
        maxHR: 0,
        weeklyGoalKm: 40,
        sleepHours: 7,
        nutritionNotes: '',
        fitnessLevel: 'Intermediate',
        trainingDaysPerWeek: 4,
        preferredTerrain: 'Road',
        injuries: '',
      },
      setActivities: (activities) => set((state) => {
        // A full sync replaces summary rows but must not wipe enrichment
        // (zone caches, real calories, best efforts) gathered since.
        const prevById = new Map(state.activities.map((a) => [a.id, a]));
        const merged = activities.map((a) => {
          const prev = prevById.get(a.id);
          if (!prev) return a;
          return {
            ...a,
            zones: a.zones ?? prev.zones,
            polyline: a.polyline ?? prev.polyline,
            ...(prev.calories !== undefined && !prev.caloriesEstimated && a.caloriesEstimated !== false
              ? { calories: prev.calories, caloriesEstimated: false }
              : {}),
          };
        });
        return { activities: merged, userStats: deriveStats(merged, state.userStats) };
      }),
      upsertActivities: (incoming) => set((state) => {
        if (!incoming.length) return state;
        const byId = new Map(state.activities.map((a) => [a.id, a]));
        for (const a of incoming) {
          const prev = byId.get(a.id);
          byId.set(a.id, prev ? {
            ...prev,
            ...a,
            zones: a.zones ?? prev.zones,
            polyline: a.polyline ?? prev.polyline,
            ...(prev.calories !== undefined && !prev.caloriesEstimated
              ? { calories: prev.calories, caloriesEstimated: false }
              : {}),
          } : a);
        }
        const merged = Array.from(byId.values()).sort(
          (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
        );
        return { activities: merged, userStats: deriveStats(merged, state.userStats) };
      }),
      enrichActivity: (activityId, patch) => set((state) => ({
        activities: state.activities.map((a) =>
          a.id === activityId ? { ...a, ...patch } : a,
        ),
      })),
      setGoals: (goals) => set({ goals }),
      setUserStats: (userStats) => set({ userStats }),
      addGoal: (goal) => set((state) => ({ goals: [...state.goals, goal] })),
      updateGoal: (updatedGoal) => set((state) => ({
        goals: state.goals.map(g => g.id === updatedGoal.id ? updatedGoal : g)
      })),
      deleteGoal: (id) => set((state) => ({
        goals: state.goals.filter(g => g.id !== id)
      })),
      addCheckIn: (goalId, checkIn) => set((state) => ({
        goals: state.goals.map(g => {
          if (g.id !== goalId) return g;
          const existing = g.checkIns || [];
          // Replace any prior check-in for the same date (manual overrides Strava;
          // re-syncing replaces an old Strava entry with the latest).
          const filtered = existing.filter(c => !(c.date === checkIn.date && c.source === checkIn.source));
          return { ...g, checkIns: [...filtered, checkIn] };
        }),
      })),
      setLastSyncedAt: (iso) => set({ lastSyncedAt: iso }),
      shoes: [],
      injuries: [],
      setMilestones: (milestones) => set({ milestones }),
      setBestEfforts: (bestEfforts) => set({ bestEfforts }),
      setWeeklyDigest: (digest) => set({ weeklyDigest: digest }),
      settings: {
        stravaClientId: '',
        stravaClientSecret: '',
        llmProvider: 'openai',
        llmApiKey: '',
        unit: 'metric',
        timeFormat: '24h',
        coachPersonality: 'Encouraging Supporter',
        privacyZones: false,
        // Single source of truth in widgetFamilies.ts — fresh installs and
        // migrated installs both flow through it.
        widgetLayout: [...DEFAULT_WIDGET_LAYOUT],
      },
      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),
      updateUserProfile: (profile) => set((state) => ({
        userProfile: { ...state.userProfile, ...profile }
      })),
      addShoe: (shoe) => set((state) => ({ shoes: [...state.shoes, shoe] })),
      setShoes: (shoes) => set({ shoes }),
      addInjury: (injury) => set((state) => ({ injuries: [...state.injuries, injury] })),
      updateInjury: (injury) => set((state) => ({
        injuries: state.injuries.map(i => i.id === injury.id ? injury : i),
      })),
      removeInjury: (id) => set((state) => ({
        injuries: state.injuries.filter(i => i.id !== id),
      })),
      setActivityZones: (activityId, zones) => set((state) => ({
        activities: state.activities.map((a) =>
          a.id === activityId ? { ...a, zones } : a,
        ),
      })),
    }),
    {
      name: 'ai-coach-app-storage',
      storage: createJSONStorage(() => asyncStorage),
      // Bump when defaults change in a way that needs to reach existing installs.
      // v2 (2026-05): introduces TodayHero at top of dashboard + drops widget ids
      // that no longer exist. Without this migration, persisted widgetLayout from
      // v1 would mask the revamp on every existing device.
      // v3 (2026-05): adds three Strava-powered default-on widgets so existing
      // users see them without having to opt in via the customise modal.
      // v4 (2026-06): widget curation — retired ids are remapped/dropped via
      // RETIRED_WIDGETS, TodayHero guaranteed first, NextBadge introduced.
      // Activities/starredSegments/athleteStats also leave this blob for the
      // separate data cache (they rehydrate from the old blob one last time).
      // v5 (2026-06): SportSplit→ActivityMix, StravaTotals→AllTimeStats.
      // v6 (2026-06): RecoveryAdvisor→TrainingLoad, BestEfforts→PersonalBests;
      // WeeklyRecap, PRProximity, RestBalance introduced.
      // v7 (2026-06): WeeklyGoalTracker→ThisWeek, StreakGuard→HeroBanner.
      // v8 (2026-06): calorie tracker — QuickNav, CaloriesToday, CalorieWeek
      // widgets slot into existing layouts.
      version: 8,
      migrate: (persistedState: any, fromVersion: number) => {
        if (!persistedState) return persistedState;
        const next = { ...persistedState };

        if (fromVersion < 2) {
          const layout: string[] = next.settings?.widgetLayout ?? [];
          // Splice TodayHero at index 0 if missing.
          const withHero = layout.includes('TodayHero')
            ? layout
            : ['TodayHero', ...layout];
          next.settings = { ...(next.settings ?? {}), widgetLayout: withHero };
        }

        if (fromVersion < 7) {
          const layout: string[] = next.settings?.widgetLayout ?? [...DEFAULT_WIDGET_LAYOUT];
          const migrated: string[] = [];
          for (const id of layout) {
            const replacement = id in RETIRED_WIDGETS ? RETIRED_WIDGETS[id] : id;
            if (replacement && !migrated.includes(replacement)) migrated.push(replacement);
          }
          if (!migrated.includes('TodayHero')) migrated.unshift('TodayHero');
          if (migrated.includes('Badges') && !migrated.includes('NextBadge')) {
            migrated.splice(migrated.indexOf('Badges') + 1, 0, 'NextBadge');
          }
          // v5 additions slot into existing layouts at their default positions.
          if (!migrated.includes('ActiveHours')) {
            const anchor = migrated.indexOf('MonthlyVolume');
            migrated.splice(anchor >= 0 ? anchor + 1 : migrated.length, 0, 'ActiveHours');
          }
          if (!migrated.includes('WeeklyRecap')) {
            const anchor = migrated.indexOf('ThisWeek');
            migrated.splice(anchor >= 0 ? anchor + 1 : migrated.length, 0, 'WeeklyRecap');
          }
          if (!migrated.includes('PRProximity')) {
            const anchor = migrated.indexOf('PersonalBests');
            migrated.splice(anchor >= 0 ? anchor + 1 : migrated.length, 0, 'PRProximity');
          }
          if (!migrated.includes('RestBalance')) {
            const anchor = migrated.indexOf('TrainingLoad');
            migrated.splice(anchor >= 0 ? anchor + 1 : migrated.length, 0, 'RestBalance');
          }
          next.settings = { ...(next.settings ?? {}), widgetLayout: migrated };
        }

        if (fromVersion < 8) {
          const layout: string[] = next.settings?.widgetLayout ?? [...DEFAULT_WIDGET_LAYOUT];
          const migrated = [...layout];
          if (!migrated.includes('QuickNav')) {
            const anchor = migrated.indexOf('TodayHero');
            migrated.splice(anchor >= 0 ? anchor + 1 : 0, 0, 'QuickNav');
          }
          // Nutrition suite lands as a block after WeeklyRecap, mirroring the
          // default-layout order.
          const chain = ['CaloriesToday', 'FuelForecast', 'CalorieWeek', 'EnergyTrend', 'ProteinTracker', 'MacroSplit'];
          let anchor = migrated.indexOf('WeeklyRecap');
          for (const id of chain) {
            if (!migrated.includes(id)) {
              migrated.splice(anchor >= 0 ? anchor + 1 : migrated.length, 0, id);
            }
            anchor = migrated.indexOf(id);
          }
          next.settings = { ...(next.settings ?? {}), widgetLayout: migrated };
        }

        // Final defensive cleanup against the live widget registry.
        const layout: string[] = next.settings?.widgetLayout ?? [];
        next.settings = {
          ...(next.settings ?? {}),
          widgetLayout: layout.filter((id) => KNOWN_WIDGET_IDS.has(id)),
        };

        return next;
      },
      onRehydrateStorage: () => () => {
        markMainHydrated();
      },
      // Activities (plus other bulky raw Strava payloads) are intentionally
      // NOT in this blob — they live in the debounced data cache below so a
      // settings tap never serialises the whole training history.
      partialize: (state) => ({
        goals: state.goals,
        userStats: state.userStats,
        userProfile: state.userProfile,
        settings: state.settings,
        shoes: state.shoes,
        injuries: state.injuries,
        milestones: state.milestones,
        bestEfforts: state.bestEfforts,
        weeklyDigest: state.weeklyDigest,
        lastSyncedAt: state.lastSyncedAt,
        hrZones: state.hrZones,
        coachChat: state.coachChat,
        foodLog: state.foodLog,
        calorieGoal: state.calorieGoal,
      }),
    }
  )
);

// ---------------------------------------------------------------------------
// Bulk data cache — activities + raw Strava payloads.
//
// zustand's persist middleware serialises its whole blob on EVERY set(),
// which at multi-MB activity histories was the app's dominant source of lag.
// The bulky collections live here instead: a debounced writer that only runs
// when one of them actually changes, plus an explicit hydrate step on launch.
// ---------------------------------------------------------------------------

const DATA_CACHE_KEY = 'ai-coach-data-cache';
const DATA_SAVE_DEBOUNCE_MS = 800;

let mainHydrated = false;
let dataHydrated = false;
let resolveHydration: (() => void) | null = null;
let hydrationPromise: Promise<void> = new Promise((res) => { resolveHydration = res; });
let resolveMainHydration: (() => void) | null = null;
const mainHydrationPromise: Promise<void> = new Promise((res) => { resolveMainHydration = res; });

function markMainHydrated() {
  mainHydrated = true;
  resolveMainHydration?.();
  maybeResolveHydration();
}

function maybeResolveHydration() {
  if (mainHydrated && dataHydrated) resolveHydration?.();
}

/**
 * Resolves once both the settings blob and the data cache have rehydrated.
 * Sync paths (background task, foreground refresh) MUST await this before
 * writing goals/activities, or a fast sync can clobber not-yet-loaded state.
 */
export function waitForHydration(): Promise<void> {
  return hydrationPromise;
}

export function isHydrated(): boolean {
  return mainHydrated && dataHydrated;
}

let dataHydrationStarted = false;

/**
 * Load the bulk data cache. Auto-started at module load (so headless
 * background-task entry points get it too); calling again is a no-op.
 */
export async function hydrateDataCache(): Promise<void> {
  if (dataHydrationStarted) return hydrationPromise;
  dataHydrationStarted = true;
  try {
    // The main blob migrates first — pre-v4 installs still carry activities
    // inside it, and zustand's default merge will have placed them in state.
    await mainHydrationPromise;
    const raw = await AsyncStorage.getItem(DATA_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const cur = useStore.getState();
      useStore.setState({
        // In-memory data (e.g. a sync that raced hydration, or legacy-blob
        // activities) wins over the cache.
        activities: cur.activities.length ? cur.activities : (parsed.activities ?? []),
        starredSegments: cur.starredSegments.length ? cur.starredSegments : (parsed.starredSegments ?? []),
        athleteStats: cur.athleteStats ?? parsed.athleteStats ?? null,
      });
      if (cur.activities.length === 0 && parsed.activities?.length) {
        // Stats were persisted in the main blob, but recompute defensively in
        // case the two blobs ever diverge.
        useStore.setState((s) => ({ userStats: deriveStats(s.activities, s.userStats) }));
      }
    }
  } catch (e) {
    console.warn('[dataCache] hydrate failed:', e);
  } finally {
    dataHydrated = true;
    maybeResolveHydration();
  }
}

let dataSaveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleDataSave() {
  // A write scheduled before hydration completes would persist the empty
  // boot state over the real cache — exactly how activity history got wiped.
  if (!dataHydrated) return;
  if (dataSaveTimer) clearTimeout(dataSaveTimer);
  dataSaveTimer = setTimeout(async () => {
    dataSaveTimer = null;
    try {
      const s = useStore.getState();
      await AsyncStorage.setItem(
        DATA_CACHE_KEY,
        JSON.stringify({
          activities: s.activities,
          starredSegments: s.starredSegments,
          athleteStats: s.athleteStats,
        }),
      );
    } catch (e) {
      console.warn('[dataCache] save failed:', e);
    }
  }, DATA_SAVE_DEBOUNCE_MS);
}

/** Flush a pending debounced save immediately (background task teardown). */
export async function flushDataCache(): Promise<void> {
  if (!dataHydrated) return;
  if (!dataSaveTimer) return;
  clearTimeout(dataSaveTimer);
  dataSaveTimer = null;
  const s = useStore.getState();
  await AsyncStorage.setItem(
    DATA_CACHE_KEY,
    JSON.stringify({
      activities: s.activities,
      starredSegments: s.starredSegments,
      athleteStats: s.athleteStats,
    }),
  );
}

useStore.subscribe((s, prev) => {
  if (
    s.activities !== prev.activities ||
    s.starredSegments !== prev.starredSegments ||
    s.athleteStats !== prev.athleteStats
  ) {
    scheduleDataSave();
  }
});

// Kick off data hydration as soon as the module loads — covers both normal
// app launch and headless background-task execution.
hydrateDataCache();
