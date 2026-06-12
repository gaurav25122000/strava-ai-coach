import { performStravaSync } from '../syncRunner';
import { StravaService } from '../strava';
import { Activity, useStore } from '../../store/useStore';

jest.mock('../strava', () => ({
  StravaService: {
    initialize: jest.fn(async () => {}),
    isAuthenticated: jest.fn(() => true),
    syncActivities: jest.fn(async () => []),
  },
}));

const mocked = StravaService as jest.Mocked<typeof StravaService>;

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

describe('performStravaSync (launch / foreground auto-sync)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.isAuthenticated.mockReturnValue(true);
    mocked.syncActivities.mockResolvedValue([]);
    useStore.setState({ activities: [], lastSyncedAt: null, goals: [] });
  });

  it('returns null without fetching when not authenticated', async () => {
    mocked.isAuthenticated.mockReturnValue(false);
    expect(await performStravaSync()).toBeNull();
    expect(mocked.syncActivities).not.toHaveBeenCalled();
  });

  it('skips when the last sync is fresher than 30 minutes', async () => {
    useStore.setState({ lastSyncedAt: minutesAgo(5) });
    expect(await performStravaSync()).toBeNull();
    expect(mocked.syncActivities).not.toHaveBeenCalled();
  });

  it('force bypasses the freshness gate', async () => {
    useStore.setState({ lastSyncedAt: minutesAgo(5) });
    const res = await performStravaSync({ force: true });
    expect(res).toEqual({ synced: 0, full: true });
    expect(mocked.syncActivities).toHaveBeenCalledTimes(1);
  });

  it('runs a full sync when there is no history, replacing activities', async () => {
    const fetched = [act('1', '2026-06-10T06:00:00Z')];
    mocked.syncActivities.mockResolvedValue(fetched);

    const res = await performStravaSync();
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

    const res = await performStravaSync();
    expect(res).toEqual({ synced: 1, full: false });

    const after = mocked.syncActivities.mock.calls[0][0]?.after;
    expect(after).toBe(Math.floor(new Date(newest).getTime() / 1000) - 7 * 86400);
    // Merged, not replaced.
    const ids = useStore.getState().activities.map((a) => a.id).sort();
    expect(ids).toEqual(['1', '2', '3']);
  });
});
