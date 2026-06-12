import { performActivitySync } from '../syncRunner';
import { StravaService } from '../strava';
import { HealthActivities } from '../healthActivities';
import { Activity, useStore } from '../../store/useStore';

jest.mock('../strava', () => ({
  StravaService: {
    initialize: jest.fn(async () => {}),
    isAuthenticated: jest.fn(() => true),
    syncActivities: jest.fn(async () => []),
  },
}));

jest.mock('../healthActivities', () => ({
  HealthActivities: {
    syncActivities: jest.fn(async () => ({ activities: [], deletedIds: [], full: true })),
  },
  backfillHealthEnrichment: jest.fn(async () => 0),
  backfillRecentRoutes: jest.fn(async () => 0),
  syncDailyHealth: jest.fn(async () => {}),
}));

const mocked = StravaService as jest.Mocked<typeof StravaService>;
const mockedHealth = HealthActivities as jest.Mocked<typeof HealthActivities>;

function act(id: string, startDate: string): Activity {
  return {
    id,
    type: 'Run',
    distance: 5000,
    movingTime: 1500,
    elapsedTime: 1500,
    totalElevationGain: 10,
    startDate,
    averageSpeed: 3.3,
    maxSpeed: 4,
  };
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

describe('performActivitySync (launch / foreground auto-sync)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.isAuthenticated.mockReturnValue(true);
    mocked.syncActivities.mockResolvedValue([]);
    useStore.setState({ activities: [], lastSyncedAt: null, goals: [] });
  });

  it('returns null without fetching when not authenticated', async () => {
    mocked.isAuthenticated.mockReturnValue(false);
    expect(await performActivitySync()).toBeNull();
    expect(mocked.syncActivities).not.toHaveBeenCalled();
  });

  it('skips when the last sync is fresher than 30 minutes', async () => {
    useStore.setState({ lastSyncedAt: minutesAgo(5) });
    expect(await performActivitySync()).toBeNull();
    expect(mocked.syncActivities).not.toHaveBeenCalled();
  });

  it('force bypasses the freshness gate', async () => {
    useStore.setState({ lastSyncedAt: minutesAgo(5) });
    const res = await performActivitySync({ force: true });
    expect(res).toEqual({ synced: 0, full: true });
    expect(mocked.syncActivities).toHaveBeenCalledTimes(1);
  });

  it('runs a full sync when there is no history, replacing activities', async () => {
    const fetched = [act('1', '2026-06-10T06:00:00Z')];
    mocked.syncActivities.mockResolvedValue(fetched);

    const res = await performActivitySync();
    expect(res).toEqual({ synced: 1, full: true });
    // Full path passes no `after` cursor.
    expect(mocked.syncActivities).toHaveBeenCalledWith();
    expect(useStore.getState().activities).toEqual(fetched);
    expect(useStore.getState().lastSyncedAt).toBeTruthy();
  });

  it('syncs incrementally with a 7-day overlap once history exists', async () => {
    const newest = '2026-06-10T06:00:00Z';
    useStore.setState({
      activities: [act('1', '2026-06-01T06:00:00Z'), act('2', newest)],
      lastSyncedAt: minutesAgo(45),
    });
    mocked.syncActivities.mockResolvedValue([act('3', '2026-06-11T06:00:00Z')]);

    const res = await performActivitySync();
    expect(res).toEqual({ synced: 1, full: false });

    const after = mocked.syncActivities.mock.calls[0][0]?.after;
    expect(after).toBe(Math.floor(new Date(newest).getTime() / 1000) - 7 * 86400);
    // Merged, not replaced.
    const ids = useStore.getState().activities.map((a) => a.id).sort();
    expect(ids).toEqual(['1', '2', '3']);
  });
});

describe('performActivitySync (health source)', () => {
  const setSource = (activitySource: 'strava' | 'health') =>
    useStore.setState((s) => ({ settings: { ...s.settings, activitySource } }));

  beforeEach(() => {
    jest.clearAllMocks();
    mocked.isAuthenticated.mockReturnValue(true);
    mocked.syncActivities.mockResolvedValue([]);
    mockedHealth.syncActivities.mockResolvedValue({ activities: [], deletedIds: [], full: true });
    useStore.setState({ activities: [], lastSyncedAt: null, goals: [] });
    setSource('health');
  });

  afterAll(() => setSource('strava'));

  it('routes to the health service and never touches Strava', async () => {
    const fetched = [act('hk:a', '2026-06-10T06:00:00Z')];
    mockedHealth.syncActivities.mockResolvedValue({ activities: fetched, deletedIds: [], full: true });

    const res = await performActivitySync({ force: true });
    expect(res).toEqual({ synced: 1, full: true });
    expect(mocked.syncActivities).not.toHaveBeenCalled();
    expect(mocked.initialize).not.toHaveBeenCalled();
    expect(useStore.getState().activities).toEqual(fetched);
  });

  it('replaces the list on a full batch (source switch semantics)', async () => {
    useStore.setState({ activities: [act('123', '2026-06-01T06:00:00Z')] }); // old Strava row
    mockedHealth.syncActivities.mockResolvedValue({
      activities: [act('hk:a', '2026-06-10T06:00:00Z')],
      deletedIds: [],
      full: true,
    });

    await performActivitySync({ force: true });
    expect(useStore.getState().activities.map((a) => a.id)).toEqual(['hk:a']);
  });

  it('merges upserts and applies deletions on an incremental batch', async () => {
    useStore.setState({
      activities: [act('hk:a', '2026-06-01T06:00:00Z'), act('hk:b', '2026-06-05T06:00:00Z')],
    });
    mockedHealth.syncActivities.mockResolvedValue({
      activities: [act('hk:c', '2026-06-11T06:00:00Z')],
      deletedIds: ['hk:a'],
      full: false,
    });

    const res = await performActivitySync({ force: true });
    expect(res).toEqual({ synced: 1, full: false });
    expect(useStore.getState().activities.map((a) => a.id).sort()).toEqual(['hk:b', 'hk:c']);
  });

  it('returns null when the native module is unavailable (old binary)', async () => {
    mockedHealth.syncActivities.mockResolvedValue('unavailable' as any);
    expect(await performActivitySync({ force: true })).toBeNull();
    expect(useStore.getState().lastSyncedAt).toBeNull();
  });

  it('respects the 30-minute freshness gate', async () => {
    useStore.setState({ lastSyncedAt: minutesAgo(5) });
    expect(await performActivitySync()).toBeNull();
    expect(mockedHealth.syncActivities).not.toHaveBeenCalled();
  });

  it('passes fullResync through to the health service', async () => {
    await performActivitySync({ fullResync: true });
    expect(mockedHealth.syncActivities).toHaveBeenCalledWith({ fullResync: true });
  });
});
