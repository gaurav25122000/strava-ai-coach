import { create } from 'zustand';
import { authenticateStrava, fetchStravaActivities, MOCK_ACTIVITIES } from '../utils/strava';
import { generateTrainingPlan, UserStats, TrainingGoal } from '../utils/ai';

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
  setLoading: (loading: boolean) => void;
  loginToStrava: () => Promise<void>;
  fetchDataAndGeneratePlan: () => Promise<void>;
}

export const useStore = create<State>((set, get) => ({
  isAuthenticated: false,
  streak: 2,
  bestStreak: 10,
  hasRunToday: true,
  lastRunDate: 'Apr 29, 2026',
  totalRuns: 239,
  totalKm: 817,
  bestPace: '4:36',
  topElevation: 274,
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

  fetchDataAndGeneratePlan: async () => {
    set({ isLoading: true });
    try {
      // 1. Fetch Strava Data
      const acts = await fetchStravaActivities();
      set({ activities: acts as Activity[] });

      // In a real app, we would calculate stats based on `acts`. Using mock stats for AI prompt here.
      const userStats: UserStats = {
        recentPace: get().bestPace,
        weeklyVolume: 22.9, // derived from acts usually
        longestRun: 21.3
      };

      const primaryGoal: TrainingGoal = {
        name: get().goals[0].name,
        targetDate: get().goals[0].date,
        targetMetric: get().goals[0].targetMetric
      };

      // 2. Fetch AI Recommendation
      const recommendation = await generateTrainingPlan(userStats, primaryGoal);
      set({ aiRecommendation: recommendation as AIRecommendation });

    } catch (error) {
      console.error("Error updating store data:", error);
    } finally {
      set({ isLoading: false });
    }
  }
}));
