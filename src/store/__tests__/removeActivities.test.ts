import { Activity, useStore } from '../useStore';

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

describe('removeActivities', () => {
  beforeEach(() => {
    useStore.setState({
      activities: [act('hk:a', '2026-06-01T06:00:00Z'), act('hk:b', '2026-06-05T06:00:00Z')],
    });
  });

  it('drops the given ids and recomputes stats', () => {
    useStore.getState().removeActivities(['hk:a']);
    const s = useStore.getState();
    expect(s.activities.map((a) => a.id)).toEqual(['hk:b']);
    expect(s.userStats.totalRuns).toBe(1);
  });

  it('is a no-op for unknown ids and empty input', () => {
    const before = useStore.getState().activities;
    useStore.getState().removeActivities(['nope']);
    expect(useStore.getState().activities).toBe(before);
    useStore.getState().removeActivities([]);
    expect(useStore.getState().activities).toBe(before);
  });
});
