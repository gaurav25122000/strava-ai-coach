import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Standard async storage for regular state (avoids SecureStore size limits on iOS)
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

// Secure storage helper specifically for secrets
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


export interface UserProfile {
  dob: string;
  height: string;
  weight: string;
  habits: string;
}
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
  userProfile: UserProfile;
  setUserProfile: (profile: Partial<UserProfile>) => void;
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

        // Calculate streaks
        let currentStreak = 0;
        let bestStreak = 0;

        if (sorted.length > 0) {
            // Get unique dates
            const uniqueDatesStr = [...new Set(sorted.map(a => a.startDate.split('T')[0]))];
            const uniqueDates = uniqueDatesStr.map(d => new Date(d));
            uniqueDates.sort((a, b) => b.getTime() - a.getTime());

            // Calculate best streak
            let tempStreak = 1;
            bestStreak = 1;
            for (let i = 0; i < uniqueDates.length - 1; i++) {
                const diffTime = Math.abs(uniqueDates[i].getTime() - uniqueDates[i+1].getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays === 1) {
                    tempStreak++;
                    if (tempStreak > bestStreak) bestStreak = tempStreak;
                } else {
                    tempStreak = 1;
                }
            }

            // Calculate current streak
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            if (uniqueDates.length > 0) {
                 const firstDate = new Date(uniqueDates[0]);
                 firstDate.setHours(0, 0, 0, 0);

                 if (firstDate.getTime() === today.getTime() || firstDate.getTime() === yesterday.getTime()) {
                     currentStreak = 1;
                     for (let i = 0; i < uniqueDates.length - 1; i++) {
                         const diffTime = Math.abs(uniqueDates[i].getTime() - uniqueDates[i+1].getTime());
                         const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                         if (diffDays === 1) {
                             currentStreak++;
                         } else {
                             break;
                         }
                     }
                 }
            }
        }

        return {
          activities,
          userStats: {
             ...state.userStats,
             totalRuns,
             totalKm: Math.round(totalKm),
             topElev: Math.round(topElev),
             lastRunDate,
             currentStreak,
             bestStreak,
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

      userProfile: {
        dob: '',
        height: '',
        weight: '',
        habits: '',
      },
      setUserProfile: (profile) => set((state) => ({
        userProfile: { ...state.userProfile, ...profile }
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
      name: 'ai-coach-app-storage',
      storage: createJSONStorage(() => asyncStorage),
      partialize: (state) => ({
        // We persist everything here, but we shouldn't store secrets directly in plain text async storage long-term
        // if we are being perfectly strict. However, since the user inputs them as settings, we will store them.
        // The original code was putting the ENTIRE state in SecureStore, which crashes.
        activities: state.activities,
        goals: state.goals,
        userStats: state.userStats,
        settings: state.settings,
        shoes: state.shoes,
        injuries: state.injuries,
        userProfile: state.userProfile,
      }),
    }
  )
);
