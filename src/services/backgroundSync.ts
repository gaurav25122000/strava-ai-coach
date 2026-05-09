import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { StravaService } from './strava';
import { useStore } from '../store/useStore';

export const BACKGROUND_SYNC_TASK = 'strava-background-sync';

// Must be defined at module top-level (outside any component)
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    await StravaService.initialize();
    if (!StravaService.isAuthenticated()) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }
    const activities = await StravaService.syncActivities();
    useStore.getState().setActivities(activities);
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (e) {
    console.error('[BackgroundSync] error:', e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundSync() {
  const status = await BackgroundFetch.getStatusAsync();
  if (
    status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
    status === BackgroundFetch.BackgroundFetchStatus.Denied
  ) {
    console.warn('[BackgroundSync] background fetch not available');
    return;
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
  if (!isRegistered) {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 5 * 60 * 60, // 5 hours in seconds
      stopOnTerminate: false,        // keep running after app is closed
      startOnBoot: true,             // restart after device reboot
    });
  }
}
