import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { StravaService } from './strava';
import { useStore } from '../store/useStore';
import { computeAllProgress } from './goalProgress';

export const BACKGROUND_SYNC_TASK = 'strava-background-sync';

// Must be defined at module top-level (outside any component).
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    await StravaService.initialize();
    if (!StravaService.isAuthenticated()) {
      // Nothing to sync, but the task itself ran fine.
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    const activities = await StravaService.syncActivities();
    const { setActivities, setLastSyncedAt, goals, setGoals } = useStore.getState();
    setActivities(activities);
    setLastSyncedAt(new Date().toISOString());
    // Re-derive AI-goal progress from the freshly-synced activities.
    setGoals(computeAllProgress(goals, activities));
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
