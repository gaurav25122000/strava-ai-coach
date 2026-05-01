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
}

interface AppState {
  activities: Activity[];
  goals: Goal[];
  userStats: UserStats;
  settings: Settings;
  setActivities: (activities: Activity[]) => void;
  setGoals: (goals: Goal[]) => void;
  setUserStats: (stats: UserStats) => void;
  addGoal: (goal: Goal) => void;
  updateGoal: (goal: Goal) => void;
  deleteGoal: (id: string) => void;
  updateSettings: (settings: Partial<Settings>) => void;
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
      setActivities: (activities) => set({ activities }),
      setGoals: (goals) => set({ goals }),
      setUserStats: (userStats) => set({ userStats }),
      addGoal: (goal) => set((state) => ({ goals: [...state.goals, goal] })),
      updateGoal: (updatedGoal) => set((state) => ({
        goals: state.goals.map(g => g.id === updatedGoal.id ? updatedGoal : g)
      })),
      deleteGoal: (id) => set((state) => ({
        goals: state.goals.filter(g => g.id !== id)
      })),
      settings: {
        stravaClientId: '',
        stravaClientSecret: '',
        llmProvider: 'openai',
        llmApiKey: '',
      },
      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),
    }),
    {
      name: 'ai-coach-secure-storage',
      storage: createJSONStorage(() => secureStorage),
    }
  )
);
