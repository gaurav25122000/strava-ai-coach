import AsyncStorage from "@react-native-async-storage/async-storage";
import { persist, createJSONStorage } from "zustand/middleware";
import { create } from 'zustand';
import { authenticateStrava, fetchStravaActivities } from '../utils/strava';
import { generateTrainingPlan, UserStats, TrainingGoal } from '../utils/ai';
import { subDays, isAfter, isToday, format } from 'date-fns';

interface Activity {
  id: string;
  type: string;
  date: string;
  distance: number;
  duration: number;
  pace: string;
  elevation: number;
  heartRate: number;
}

interface Goal {
  id: string;
  name: string;
  date: string;
  targetDaysOut: number;
  type: string;
  color: string;
  icon: string;
  targetMetric?: string;
}

interface AIRecommendation {
  targetVolume: number;
  targetLongRun: number;
  keyWorkoutTitle: string;
  keyWorkoutDesc: string;
  phaseName: string;
  phaseDesc: string;
}

interface State {
  isAuthenticated: boolean;
  streak: number;
  bestStreak: number;
  hasRunToday: boolean;
  lastRunDate: string;
  totalRuns: number;
  totalKm: number;
  bestPace: string;
  topElevation: number;
  activities: Activity[];
  goals: Goal[];
  aiRecommendation: AIRecommendation | null;
  isLoading: boolean;
  lastSyncDate: string | null;

  // New Features
  shoes: { id: string, name: string, mileage: number, maxMileage: number }[];
  injuries: { id: string, description: string, date: string, severity: 'low' | 'medium' | 'high' }[];
  coachPersonality: 'Strict' | 'Encouraging' | 'Data-Driven';
  useMetric: boolean;
  privacyZonesEnabled: boolean;
  weatherContextEnabled: boolean;

  setCoachPersonality: (p: 'Strict' | 'Encouraging' | 'Data-Driven') => void;
  setUseMetric: (v: boolean) => void;
  setPrivacyZones: (v: boolean) => void;
  setWeatherContext: (v: boolean) => void;
  logInjury: (desc: string, severity: 'low' | 'medium' | 'high') => void;
  addShoe: (name: string, maxMileage: number) => void;

  setLoading: (loading: boolean) => void;
  loginToStrava: () => Promise<void>;
  fetchDataAndGeneratePlan: () => Promise<void>;
  addGoal: (goal: Omit<Goal, 'id' | 'targetDaysOut'>) => void;
  logout: () => void;
}

// Helper to convert min:sec string to seconds for math
const parsePaceToSeconds = (pace: string) => {
    if (!pace) return 0;
    const [mins, secs] = pace.split(':').map(Number);
    return mins * 60 + secs;
};

// Helper to convert seconds back to min:sec
const formatSecondsToPace = (totalSecs: number) => {
    if (totalSecs === 0 || !isFinite(totalSecs)) return '0:00';
    const mins = Math.floor(totalSecs / 60);
    const secs = Math.floor(totalSecs % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
  isAuthenticated: false,
  streak: 0,
  bestStreak: 0,
  hasRunToday: false,
  lastRunDate: '-',
  totalRuns: 0,
  totalKm: 0,
  bestPace: '0:00',
  topElevation: 0,
  activities: [],
  goals: [
    {
      id: 'g1',
      name: 'Hyrox',
      date: 'Jul 26, 2026',
      targetDaysOut: 87,
      type: 'competition',
      color: 'primaryRed',
      icon: 'flame',
    },
    {
      id: 'g2',
      name: 'Half Marathon',
      date: 'Sep 23, 2026',
      targetDaysOut: 146,
      type: 'race',
      color: 'primaryGreen',
      icon: 'run',
      targetMetric: '2:30:00'
    }
  ],
  aiRecommendation: null,
  lastSyncDate: null,

  shoes: [{ id: 's1', name: 'Nike Alphafly 3', mileage: 142.5, maxMileage: 500 }],
  injuries: [],
  coachPersonality: 'Encouraging',
  useMetric: true,
  privacyZonesEnabled: false,
  weatherContextEnabled: false,

  setCoachPersonality: (p) => set({ coachPersonality: p }),
  setUseMetric: (v) => set({ useMetric: v }),
  setPrivacyZones: (v) => set({ privacyZonesEnabled: v }),
  setWeatherContext: (v) => set({ weatherContextEnabled: v }),
  logInjury: (description, severity) => set((state) => ({
      injuries: [{ id: 'inj_' + Date.now(), description, date: new Date().toISOString(), severity }, ...state.injuries]
  })),
  addShoe: (name, maxMileage) => set((state) => ({
      shoes: [...state.shoes, { id: 'shoe_' + Date.now(), name, mileage: 0, maxMileage }]
  })),
  isLoading: false,
  setLoading: (loading) => set({ isLoading: loading }),

  loginToStrava: async () => {
    set({ isLoading: true });
    const success = await authenticateStrava();
    if (success) {
      set({ isAuthenticated: true });
      await get().fetchDataAndGeneratePlan();
    } else {
      set({ isLoading: false });
    }
  },

  addGoal: (newGoal) => {
    const today = new Date();
    const targetDate = new Date(newGoal.date);
    const diffTime = Math.abs(targetDate.getTime() - today.getTime());
    const targetDaysOut = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    set((state) => ({
      goals: [
        {
          ...newGoal,
          id: 'g' + Date.now().toString(),
          targetDaysOut
        },
        ...state.goals
      ]
    }));

    // Automatically trigger a sync to generate a new AI plan for this new goal
    get().fetchDataAndGeneratePlan();
  },

  logout: () => {
    set({
      isAuthenticated: false,
      activities: [],
      aiRecommendation: null,
  lastSyncDate: null,
      totalRuns: 0,
      totalKm: 0,
      streak: 0,
      bestPace: '0:00',
      topElevation: 0,
      hasRunToday: false,
    });
  },

  fetchDataAndGeneratePlan: async () => {
    set({ isLoading: true });
    try {
      // 1. Fetch Strava Data
      const acts = await fetchStravaActivities();

      // Calculate Stats
      const runs = acts.filter((a: Activity) => a.type === 'Run' || a.type === 'VirtualRun');

      let totalDistance = 0;
      let maxElevation = 0;
      let bestPaceSecs = Infinity;
      let hasRunToday = false;
      let lastRunDateStr = '-';
      let longestRunDist = 0;

      // Sort activities by date descending
      const sortedActs = [...runs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (sortedActs.length > 0) {
          const lastRunDate = new Date(sortedActs[0].date);
          hasRunToday = isToday(lastRunDate);
          lastRunDateStr = format(lastRunDate, 'MMM dd, yyyy');
      }

      // 7 days ago
      const oneWeekAgo = subDays(new Date(), 7);
      let weeklyVolume = 0;

      runs.forEach((run: Activity) => {
          totalDistance += run.distance;

          if (run.elevation > maxElevation) maxElevation = run.elevation;

          if (run.distance > longestRunDist) longestRunDist = run.distance;

          const paceSecs = parsePaceToSeconds(run.pace);
          if (paceSecs > 0 && paceSecs < bestPaceSecs) {
              bestPaceSecs = paceSecs;
          }

          if (isAfter(new Date(run.date), oneWeekAgo)) {
              weeklyVolume += run.distance;
          }
      });

      // Update shoes mileage naively for demonstration if there is an active shoe
      // In a real app we'd map activities to specific shoes
      const currentShoes = get().shoes;
      if (currentShoes.length > 0) {
         const latestShoe = {...currentShoes[0]};
         // Just a mock bump based on recent fetch to show it works
         latestShoe.mileage += (totalDistance > 0 ? 5 : 0);
         set({ shoes: [latestShoe, ...currentShoes.slice(1)] });
      }

      const bestPaceStr = bestPaceSecs === Infinity ? '0:00' : formatSecondsToPace(bestPaceSecs);

      // Simple streak calculation (mocked for brevity as precise calculation requires iterating all days)
      const currentStreak = hasRunToday ? 1 : 0;

      set({
          activities: acts as Activity[],
          totalRuns: runs.length,
          totalKm: Math.round(totalDistance),
          bestPace: bestPaceStr,
          topElevation: Math.round(maxElevation),
          hasRunToday: hasRunToday,
          lastRunDate: lastRunDateStr,
          streak: currentStreak, // In a real app, calculate actual streak
      });

      const userStats: UserStats = {
        recentPace: bestPaceStr,
        weeklyVolume: parseFloat(weeklyVolume.toFixed(1)),
        longestRun: parseFloat(longestRunDist.toFixed(1)),
        personality: get().coachPersonality,
        weatherContextEnabled: get().weatherContextEnabled
      };

      const primaryGoal: TrainingGoal = {
        name: get().goals[0].name,
        targetDate: get().goals[0].date,
        targetMetric: get().goals[0].targetMetric
      };

      // 2. Fetch AI Recommendation
      const recommendation = await generateTrainingPlan(userStats, primaryGoal);
      if (recommendation) {
        set({ aiRecommendation: recommendation as AIRecommendation, lastSyncDate: new Date().toISOString() });
      }

    } catch (error) {
      console.error("Error updating store data:", error);
    } finally {
      set({ isLoading: false });
    }
  }
    }),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);