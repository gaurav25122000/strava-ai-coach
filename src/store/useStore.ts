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
  type: 'Run' | 'Ride' | 'Workout';
  distance: number; // in meters
  movingTime: number; // in seconds
  elapsedTime: number;
  totalElevationGain: number; // in meters
  startDate: string;
  averageSpeed: number; // m/s
  maxSpeed: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  name?: string;
}

export interface Goal {
  id: string;
  title: string;
  targetDate: string;
  daysRemaining: number;
  type: 'Race' | 'Volume' | 'Frequency';
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
}

interface UserStats {
  currentStreak: number;
  bestStreak: number;
  totalRuns: number;
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

  // Get unique dates that had at least one run
  const runDates = new Set(
    activities
      .filter(a => a.type === 'Run')
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
  setActivities: (activities: Activity[]) => void;
  setGoals: (goals: Goal[]) => void;
  setUserStats: (stats: UserStats) => void;
  addGoal: (goal: Goal) => void;
  updateGoal: (goal: Goal) => void;
  deleteGoal: (id: string) => void;
  updateSettings: (settings: Partial<Settings>) => void;
  updateUserProfile: (profile: Partial<UserProfile>) => void;
  addShoe: (shoe: Shoe) => void;
  addInjury: (injury: Injury) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      activities: [],
      goals: [],
      userStats: {
        currentStreak: 0,
        bestStreak: 0,
        totalRuns: 0,
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
        let totalKm = 0;
        let topElev = 0;
        let bestPace = 999;

        activities.forEach(act => {
           if (act.type === 'Run') totalRuns++;
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
             totalKm: Math.round(totalKm),
             topElev: Math.round(topElev),
             lastRunDate,
             bestPace: bestPace === 999 ? '0:00' : bestPace.toFixed(2).replace('.', ':'),
             currentStreak,
             bestStreak,
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
      }),
    }
  )
);
