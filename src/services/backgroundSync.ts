import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { flushDataCache, useStore } from '../store/useStore';
import { performActivitySync } from './syncRunner';
import { HealthActivities } from './healthActivities';

export const BACKGROUND_SYNC_TASK = 'strava-background-sync';

// Must be defined at module top-level (outside any component).
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    await performActivitySync({ force: true });
    // Headless runs can be killed right after the task resolves — make sure
    // the debounced activity cache hits disk before that.
    await flushDataCache();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    console.error('[BackgroundSync] error:', e);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync() {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      console.warn('[BackgroundSync] background tasks unavailable, status =', status);
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (isRegistered) {
      console.log('[BackgroundSync] already registered');
      return;
    }

    // `minimumInterval` is in MINUTES for expo-background-task (the OS enforces a
    // 15-min floor and may stretch it further during Doze / iOS background
    // windows). 5h is fine — the foreground re-sync in App.tsx covers the gap
    // when the OS throttles us. stopOnTerminate / startOnBoot are no longer
    // configurable; the platform manages task lifecycle.
    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 5 * 60,
    });
    console.log('[BackgroundSync] registered (5h cadence)');
  } catch (e) {
    console.warn('[BackgroundSync] registration error:', e);
  }
}

let healthSubscription: { remove: () => void } | null = null;

/**
 * HealthKit-side background path: a persisted workout observer wakes the app
 * when new workouts land (Android has no Health Connect observer API — the
 * periodic task above covers it there). Call on launch and after the source
 * switch; no-ops unless the health source is active on iOS.
 */
export async function registerHealthBackgroundSync() {
  const source = useStore.getState().settings.activitySource ?? 'strava';
  if (source !== 'health') {
    healthSubscription?.remove();
    healthSubscription = null;
    return;
  }
  if (healthSubscription) return;
  healthSubscription = await HealthActivities.subscribeToWorkoutChanges(() => {
    performActivitySync({ force: true })
      .then(() => flushDataCache())
      .catch((e) => console.warn('[HealthBackgroundSync] error:', e));
  });
  if (healthSubscription) console.log('[HealthBackgroundSync] workout observer registered');
}
