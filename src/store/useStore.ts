import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

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

export interface Activity {
  id: string;
  type: 'Run' | 'Ride' | 'Workout' | 'Walk';
  distance: number; // in meters
  movingTime: number; // in seconds
  elapsedTime: number;
  totalElevationGain: number; // in meters
  startDate: string;
  averageSpeed: number; // m/s
  maxSpeed: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  averageCadence?: number;
  steps?: number;
  calories?: number;
  averageWatts?: number;
  sufferScore?: number;
  name?: string;
}

export interface Phase {
  name: string;
  description: string;
  weeklyVolumeTarget: number;
  longRunTarget: number;
  keyWorkout: string;
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
}

interface UserStats {
  currentStreak: number;
  bestStreak: number;
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
}

interface Shoe {
  id: string;
  name: string;
  brand: string;
  distance: number; // km
}

interface Injury {
  id: string;
  type: string;
  date: string;
  severity: 'Low' | 'Medium' | 'High';
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  icon: string; // emoji
  earnedAt: string; // ISO date
  category: 'distance' | 'streak' | 'speed' | 'elevation' | 'frequency';
}

export interface BestEffort {
  distance: number; // metres: 1000, 5000, 10000
  time: number;     // seconds
  pace: number;     // min/km
  date: string;
  activityName?: string;
}

export interface WeeklyDigest {
  weekKey: string; // "2025-W18"
  generatedAt: string;
  summary: string;
  highlight: string;
  tip: string;
}

export interface ToastOptions {
  title: string;
  message: string;
  type?: 'success' | 'error' | 'info';
}

// Get local YYYY-MM-DD string without UTC conversion
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Compute current streak and best streak from a list of activities
function computeStreaks(activities: Activity[]): { currentStreak: number; bestStreak: number } {
  if (!activities.length) return { currentStreak: 0, bestStreak: 0 };

  // Get unique dates that had at least one activity
  const runDates = new Set(
    activities
      .map(a => {
        // Parse ISO string as local date to avoid UTC offset issues
        const raw = a.startDate.split('T')[0];
        return raw;
      })
  );

  if (!runDates.size) return { currentStreak: 0, bestStreak: 0 };

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

  return { currentStreak: current, bestStreak: best };
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
  setActivities: (activities: Activity[]) => void;
  setLifetimeStats: (stats: any) => void;
  setGoals: (goals: Goal[]) => void;
  setUserStats: (stats: UserStats) => void;
  addGoal: (goal: Goal) => void;
  updateGoal: (goal: Goal) => void;
  deleteGoal: (id: string) => void;
  updateSettings: (settings: Partial<Settings>) => void;
  updateUserProfile: (profile: Partial<UserProfile>) => void;
  addShoe: (shoe: Shoe) => void;
  addInjury: (injury: Injury) => void;
  setMilestones: (milestones: Milestone[]) => void;
  setBestEfforts: (efforts: Record<number, BestEffort>) => void;
  setWeeklyDigest: (digest: WeeklyDigest) => void;
  toast: ToastOptions | null;
  setToast: (toast: ToastOptions | null) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      activities: [],
      goals: [],
      milestones: [],
      bestEfforts: {},
      weeklyDigest: null,
      toast: null,
      setToast: (toast) => set({ toast }),
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
        let totalRuns = 0;
        let totalWalks = 0;
        let totalKm = 0;
        let topElev = 0;
        let bestPace = 999;

        activities.forEach(act => {
           if (act.type === 'Run') totalRuns++;
           if (act.type === 'Walk') totalWalks++;
           totalKm += (act.distance / 1000);
           if (act.totalElevationGain > topElev) topElev = act.totalElevationGain;

           if (act.averageSpeed > 0 && act.type === 'Run') {
              const minPerKm = 1000 / act.averageSpeed / 60;
              if (minPerKm < bestPace) bestPace = minPerKm;
           }
        });

        const sorted = [...activities].sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
        const lastRunDate = sorted.length > 0 ? sorted[0].startDate.split('T')[0] : '';

        const { currentStreak, bestStreak } = computeStreaks(activities);

        return {
          activities,
          userStats: {
             ...state.userStats,
             totalRuns,
             totalWalks,
             totalKm: Math.round(totalKm),
             topElev: Math.round(topElev),
             lastRunDate,
             bestPace: bestPace === 999 ? '0:00' : bestPace.toFixed(2).replace('.', ':'),
             currentStreak,
             bestStreak,
          }
        };
      }),
      setLifetimeStats: (stats: any) => set((state) => {
        const runDist = (stats.all_run_totals?.distance || 0) / 1000;
        const rideDist = (stats.all_ride_totals?.distance || 0) / 1000;
        const swimDist = (stats.all_swim_totals?.distance || 0) / 1000;
        const totalKm = Math.round(runDist + rideDist + swimDist);
        const runCount = stats.all_run_totals?.count || 0;
        
        return {
          userStats: {
            ...state.userStats,
            totalRuns: runCount > state.userStats.totalRuns ? runCount : state.userStats.totalRuns,
            totalKm: totalKm > state.userStats.totalKm ? totalKm : state.userStats.totalKm,
          }
        };
      }),
      setGoals: (goals) => set({ goals }),
      setUserStats: (userStats) => set({ userStats }),
      addGoal: (goal) => set((state) => ({ goals: [...state.goals, goal] })),
      updateGoal: (updatedGoal) => set((state) => ({
        goals: state.goals.map(g => g.id === updatedGoal.id ? updatedGoal : g)
      })),
      deleteGoal: (id) => set((state) => ({
        goals: state.goals.filter(g => g.id !== id)
      })),
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
      },
      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),
      updateUserProfile: (profile) => set((state) => ({
        userProfile: { ...state.userProfile, ...profile }
      })),
      addShoe: (shoe) => set((state) => ({ shoes: [...state.shoes, shoe] })),
      addInjury: (injury) => set((state) => ({ injuries: [...state.injuries, injury] })),
    }),
    {
      name: 'ai-coach-app-storage',
      storage: createJSONStorage(() => asyncStorage),
      partialize: (state) => ({
        activities: state.activities,
        goals: state.goals,
        userStats: state.userStats,
        userProfile: state.userProfile,
        settings: state.settings,
        shoes: state.shoes,
        injuries: state.injuries,
        milestones: state.milestones,
        bestEfforts: state.bestEfforts,
        weeklyDigest: state.weeklyDigest,
      }),
    }
  )
);
