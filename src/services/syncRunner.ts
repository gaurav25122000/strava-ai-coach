import { StravaService } from './strava';
import { useStore, waitForHydration } from '../store/useStore';
import { HealthActivities, backfillHealthEnrichment, backfillRecentRoutes, syncDailyHealth } from './healthActivities';

export interface SyncResult {
  synced: number;
  full: boolean;
}

interface SyncOpts {
  /** Sync even if the last one was <30 min ago. */
  force?: boolean;
  /** Re-download full history (Settings → full re-sync; picks up deletions). */
  fullResync?: boolean;
}

/**
 * The one activity sync ritual — used by the background task, foreground
 * refresh, pull-to-refresh and Settings. Dispatches on the active source:
 * Strava (default) or Apple Health / Health Connect.
 *
 * - Awaits store hydration (a fast sync must never clobber unloaded state).
 * - Incremental once history exists: Strava uses `after=` with a 7-day
 *   overlap; Health uses platform cursors (HK anchor / HC changes token).
 * - Recomputes goal progress against the merged activity list.
 *
 * Returns null when skipped (not authenticated / source unavailable, or
 * fresh and not forced).
 */
export async function performActivitySync(opts?: SyncOpts): Promise<SyncResult | null> {
  await waitForHydration();
  const source = useStore.getState().settings.activitySource ?? 'strava';
  if (source === 'health') return performHealthSync(opts);

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

  await finishSync();
  return { synced: synced.length, full: !incremental };
}

async function performHealthSync(opts?: SyncOpts): Promise<SyncResult | null> {
  if (!opts?.force && !opts?.fullResync) {
    const last = useStore.getState().lastSyncedAt;
    const fresh = last && Date.now() - new Date(last).getTime() < 30 * 60 * 1000;
    if (fresh) return null;
  }

  const batch = await HealthActivities.syncActivities({ fullResync: opts?.fullResync });
  if (batch === 'unavailable') return null;

  const store = useStore.getState();
  if (batch.full) {
    store.setActivities(batch.activities);
  } else if (batch.activities.length) {
    store.upsertActivities(batch.activities);
  }
  if (batch.deletedIds.length) useStore.getState().removeActivities(batch.deletedIds);

  await finishSync();

  // Progressive enrichment (HR for older history, routes for recent GPS
  // workouts) and the daily recovery/activity rollups — fire-and-forget so
  // sync returns as soon as rows land.
  backfillRecentRoutes().catch(() => {});
  backfillHealthEnrichment().catch(() => {});
  syncDailyHealth().catch(() => {});

  return { synced: batch.activities.length, full: batch.full };
}

async function finishSync(): Promise<void> {
  const { goals, setGoals, setLastSyncedAt, activities } = useStore.getState();
  setLastSyncedAt(new Date().toISOString());
  if (goals.length) {
    // Dynamic import keeps the store↔services cold-start cycle broken.
    const { computeAllProgress } = await import('./goalProgress');
    setGoals(computeAllProgress(goals, activities));
  }
}
