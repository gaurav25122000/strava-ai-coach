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

function daysLeftOf(targetDate: string): number {
  const days = Math.ceil((new Date(targetDate).getTime() - Date.now()) / 86_400_000);
  return Math.max(0, days);
}

/**
 * Kick off AI plan generation in the background. Returns immediately; the
 * GenerationPill (App.tsx) reflects progress and the goal lands in the store
 * when the coach is done. Only one generation runs at a time.
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

  const { settings } = useStore.getState();
  const apiKey = settings.llmApiKey || (await secureSettingsStorage.getSecret('llmApiKey')) || '';
  if (!apiKey) {
    setGoalGeneration(null);
    setToast({
      title: 'No API key',
      message: 'Add your LLM API key in Settings to generate plans.',
      type: 'error',
    });
    return;
  }

  try {
    const state = useStore.getState();
    const plan = await AIService.generateTrainingPlan(
      params.title,
      params.targetDate,
      state.activities,
      settings.llmProvider,
      apiKey,
      settings.coachPersonality,
      state.injuries,
      state.userProfile,
      { bestEfforts: state.bestEfforts, targetFinishTime: params.targetFinishTime, unit: settings.unit },
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
  } catch {
    useStore.getState().setToast({
      title: 'Plan generation failed',
      message: 'The coach hit an error. Check your API key and try again.',
      type: 'error',
    });
  } finally {
    useStore.getState().setGoalGeneration(null);
  }
}
