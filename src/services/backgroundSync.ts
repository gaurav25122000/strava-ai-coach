import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { StravaService } from './strava';
import { useStore } from '../store/useStore';
import { computeAllProgress } from './goalProgress';

export const BACKGROUND_SYNC_TASK = 'strava-background-sync';

// Must be defined at module top-level (outside any component)
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    await StravaService.initialize();
    if (!StravaService.isAuthenticated()) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }
    const activities = await StravaService.syncActivities();
    const { setActivities, setLastSyncedAt, goals, setGoals } = useStore.getState();
    setActivities(activities);
    setLastSyncedAt(new Date().toISOString());
    // Re-derive AI-goal progress from the freshly-synced activities.
    setGoals(computeAllProgress(goals, activities));
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (e) {
    console.error('[BackgroundSync] error:', e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundSync() {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      console.warn('[BackgroundSync] background fetch unavailable, status =', status);
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (isRegistered) {
      console.log('[BackgroundSync] already registered');
      return;
    }

    // Android enforces a 15-min minimum on WorkManager periodic jobs; the OS
    // may stretch it further during Doze. 5h is fine — foreground re-sync
    // in App.tsx covers the gap when the OS throttles us.
    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 5 * 60 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    console.log('[BackgroundSync] registered (5h cadence)');
  } catch (e) {
    console.warn('[BackgroundSync] registration error:', e);
  }
}
