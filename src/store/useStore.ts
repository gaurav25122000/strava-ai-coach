import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Custom storage for sensitive info using expo-secure-store
const secureStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return localStorage.getItem(name);
    }
    return await SecureStore.getItemAsync(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.setItem(name, value);
    } else {
      await SecureStore.setItemAsync(name, value);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(name);
    } else {
      await SecureStore.deleteItemAsync(name);
    }
  },
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

interface AppState {
  activities: Activity[];
  goals: Goal[];
  userStats: UserStats;
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
      setActivities: (activities) => set((state) => {
        let totalRuns = 0;
        let totalKm = 0;
        let topElev = 0;
        let longestRun = 0;
        let bestPace = 999;

        activities.forEach(act => {
           if (act.type === 'Run') totalRuns++;
           totalKm += (act.distance / 1000);
           if (act.totalElevationGain > topElev) topElev = act.totalElevationGain;
           if ((act.distance / 1000) > longestRun) longestRun = act.distance / 1000;

           if (act.averageSpeed > 0 && act.type === 'Run') {
              const minPerKm = 1000 / act.averageSpeed / 60;
              if (minPerKm < bestPace) bestPace = minPerKm;
           }
        });

        const sorted = [...activities].sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
        const lastRunDate = sorted.length > 0 ? sorted[0].startDate.split('T')[0] : '';

        return {
          activities,
          userStats: {
             ...state.userStats,
             totalRuns,
             totalKm: Math.round(totalKm),
             topElev: Math.round(topElev),
             lastRunDate,
             bestPace: bestPace === 999 ? '0:00' : bestPace.toFixed(2).replace('.', ':')
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
      addShoe: (shoe) => set((state) => ({ shoes: [...state.shoes, shoe] })),
      addInjury: (injury) => set((state) => ({ injuries: [...state.injuries, injury] })),
    }),
    {
      name: 'ai-coach-secure-storage',
      storage: createJSONStorage(() => secureStorage),
    }
  )
);
