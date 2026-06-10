import { StravaService } from './strava';
import { useStore, waitForHydration } from '../store/useStore';

export interface SyncResult {
  synced: number;
  full: boolean;
}

/**
 * The one Strava sync ritual — used by the background task, foreground
 * refresh, pull-to-refresh and Settings. Replaces four hand-rolled copies.
 *
 * - Awaits store hydration (a fast sync must never clobber unloaded state).
 * - Incremental (`after=`) once history exists: routine refreshes fetch one
 *   small page instead of re-paginating the athlete's entire career. A 7-day
 *   overlap window picks up late uploads and edits.
 * - Recomputes goal progress against the merged activity list.
 *
 * Returns null when skipped (not authenticated, or fresh and not forced).
 */
export async function performStravaSync(opts?: {
  /** Sync even if the last one was <30 min ago. */
  force?: boolean;
  /** Re-download full history (Settings → full re-sync; picks up deletions). */
  fullResync?: boolean;
}): Promise<SyncResult | null> {
  await waitForHydration();
  await StravaService.initialize();
  if (!StravaService.isAuthenticated()) return null;

  const state = useStore.getState();
  if (!opts?.force && !opts?.fullResync) {
    const last = state.lastSyncedAt;
    const fresh = last && Date.now() - new Date(last).getTime() < 30 * 60 * 1000;
    if (fresh) return null;
  }

  const hasHistory = state.activities.length > 0;
  const incremental = hasHistory && !opts?.fullResync;

  let synced;
  if (incremental) {
    const newest = state.activities.reduce(
      (max, a) => Math.max(max, new Date(a.startDate).getTime()),
      0,
    );
    const after = Math.floor(newest / 1000) - 7 * 86400;
    synced = await StravaService.syncActivities({ after });
    useStore.getState().upsertActivities(synced);
  } else {
    synced = await StravaService.syncActivities();
    useStore.getState().setActivities(synced);
  }

  const { goals, setGoals, setLastSyncedAt, activities } = useStore.getState();
  setLastSyncedAt(new Date().toISOString());
  if (goals.length) {
    // Dynamic import keeps the store↔services cold-start cycle broken.
    const { computeAllProgress } = await import('./goalProgress');
    setGoals(computeAllProgress(goals, activities));
  }

  return { synced: synced.length, full: !incremental };
}
