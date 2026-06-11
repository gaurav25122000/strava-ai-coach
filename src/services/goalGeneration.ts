import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Goal, secureSettingsStorage, useStore } from '../store/useStore';
import { AIService } from './ai';

export const GENERATING_MESSAGES = [
  'Reading your training history…',
  'Sizing weekly volume to your fitness…',
  'Laying out phases to race day…',
  'Placing key workouts and rest days…',
  'Double-checking the progression…',
];

// generateTrainingPlan worst case = initial call + one self-repair retry,
// each with a 120s axios timeout. The watchdog only exists so the progress
// pill can NEVER be stranded by a hung promise.
const WATCHDOG_MS = 270_000;

function daysLeftOf(targetDate: string): number {
  const days = Math.ceil((new Date(targetDate).getTime() - Date.now()) / 86_400_000);
  return Math.max(0, days);
}

function withWatchdog<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Generation timed out — please try again.')), WATCHDOG_MS),
    ),
  ]);
}

/**
 * Kick off AI plan generation in the background. Returns immediately; the
 * GenerationPill (App.tsx) reflects progress and the goal lands in the store
 * when the coach is done. Only one generation runs at a time. The pill flag
 * is set and cleared inside one try/finally so no failure path can strand it.
 */
export async function startGoalGeneration(params: {
  title: string;
  targetDate: string;
  targetFinishTime?: string;
}): Promise<void> {
  const { setGoalGeneration, setToast } = useStore.getState();

  if (useStore.getState().goalGeneration) {
    setToast({
      title: 'Already working',
      message: 'Your coach is still building the previous plan.',
      type: 'info',
    });
    return;
  }

  setGoalGeneration({ title: params.title, startedAt: Date.now() });
  try {
    const { settings } = useStore.getState();
    const apiKey = settings.llmApiKey || (await secureSettingsStorage.getSecret('llmApiKey')) || '';
    if (!apiKey) {
      setToast({
        title: 'No API key',
        message: 'Add your LLM API key in Settings to generate plans.',
        type: 'error',
      });
      return;
    }

    const state = useStore.getState();
    const plan = await withWatchdog(
      AIService.generateTrainingPlan(
        params.title,
        params.targetDate,
        state.activities,
        settings.llmProvider,
        apiKey,
        settings.coachPersonality,
        state.injuries,
        state.userProfile,
        { bestEfforts: state.bestEfforts, targetFinishTime: params.targetFinishTime, unit: settings.unit },
      ),
    );

    const goal: Goal = {
      id: Date.now().toString(),
      title: params.title,
      targetDate: params.targetDate,
      daysRemaining: daysLeftOf(params.targetDate),
      type: 'Race',
      metric: 'days',
      progress: 0,
      phase: plan.phase || 'Base Building',
      phases: plan.phases || [],
      weeklyVolume: plan.weeklyVolume || { current: 0, target: 40 },
      longRun: plan.longRun || { current: 0, target: 15 },
      keyWorkout: plan.keyWorkout || 'Easy Run\n45 minutes aerobic',
      targetFinishTime: params.targetFinishTime,
    };
    useStore.getState().addGoal(goal);

    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    useStore.getState().setToast({
      title: 'Plan ready',
      message: `“${params.title}” is live in Goals — today's workout is waiting.`,
      type: 'success',
    });
  } catch (e: any) {
    // Surface the REAL provider error (ai.ts builds "gemini request failed:
    // <api message>" style errors) — a generic "check your key" hides the
    // actual cause and makes failures undiagnosable.
    console.error('[GoalGeneration] failed:', e);
    const detail = typeof e?.message === 'string' && e.message ? e.message : 'Unknown error';
    useStore.getState().setToast({
      title: 'Plan generation failed',
      message: detail.length > 160 ? `${detail.slice(0, 157)}…` : detail,
      type: 'error',
    });
  } finally {
    useStore.getState().setGoalGeneration(null);
  }
}
