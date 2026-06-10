import { Activity, useStore, secureSettingsStorage } from '../store/useStore';
import axios from 'axios';

let accessToken: string | null = null;
let refreshToken: string | null = null;
let expiresAt: number | null = null;

const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);
const RIDE_TYPES = new Set(['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide']);

/** Map one Strava SummaryActivity onto our Activity shape. */
function mapSummaryActivity(item: any, weightKg: number): Activity {
  const durationMins = item.moving_time / 60;
  // sport_type is Strava's current field; `type` is deprecated and collapses
  // TrailRun→Run etc. Prefer the precise one.
  const type: string = item.sport_type || item.type || '';
  const isRun = RUN_TYPES.has(type);

  let calculatedSteps: number | undefined;
  if (item.average_cadence && item.moving_time) {
    calculatedSteps = Math.round(
      isRun ? item.average_cadence * 2 * durationMins : item.average_cadence * durationMins,
    );
  } else if (item.distance && item.moving_time && (isRun || type === 'Walk' || type === 'Hike')) {
    const strideM = isRun ? 1.4 : 0.75;
    calculatedSteps = Math.round(item.distance / strideM);
  }

  // SummaryActivity has no `calories`. Rides: kilojoules ≈ kcal. Otherwise:
  // MET estimate from real body weight, flagged as estimated so the UI can
  // say so and detail enrichment can overwrite with Strava's real number.
  let calories: number | undefined;
  let caloriesEstimated: boolean | undefined;
  if (item.kilojoules) {
    calories = Math.round(item.kilojoules);
  } else {
    const hours = (item.moving_time || 0) / 3600;
    if (hours > 0) {
      const met = isRun
        ? (item.average_speed > 3.5 ? 11.0 : item.average_speed > 2.7 ? 9.8 : 8.0)
        : RIDE_TYPES.has(type)
          ? (item.average_speed > 8.3 ? 10.0 : item.average_speed > 5.5 ? 8.0 : 6.0)
          : type === 'Walk' || type === 'Hike'
            ? 3.8
            : 5.0;
      calories = Math.round(met * weightKg * hours);
      caloriesEstimated = true;
    }
  }

  return {
    id: item.id.toString(),
    name: item.name,
    type,
    distance: item.distance,
    movingTime: item.moving_time,
    elapsedTime: item.elapsed_time,
    totalElevationGain: item.total_elevation_gain,
    startDate: item.start_date,
    startDateLocal: item.start_date_local,
    averageSpeed: item.average_speed,
    maxSpeed: item.max_speed,
    averageHeartRate: item.average_heartrate,
    maxHeartRate: item.max_heartrate,
    averageCadence: item.average_cadence,
    steps: calculatedSteps,
    kilojoules: item.kilojoules,
    calories,
    caloriesEstimated,
    averageWatts: item.average_watts,
    deviceWatts: item.device_watts,
    sufferScore: item.suffer_score,
    kudosCount: item.kudos_count,
    trainer: item.trainer,
    gearId: item.gear_id ?? undefined,
    polyline: item.map?.summary_polyline ?? undefined,
    photoCount: item.total_photo_count,
  };
}

export const StravaService = {
  initialize: async () => {
    const token = await secureSettingsStorage.getSecret('strava_access_token');
    const refresh = await secureSettingsStorage.getSecret('strava_refresh_token');
    const expires = await secureSettingsStorage.getSecret('strava_expires_at');
    
    if (token) {
      accessToken = token;
    }
    if (refresh) {
      refreshToken = refresh;
    }
    if (expires) {
      expiresAt = parseInt(expires, 10);
    }
  },

  isAuthenticated: () => !!accessToken,

  setToken: async (token: string, refresh?: string, expires?: number) => {
    accessToken = token;
    await secureSettingsStorage.setSecret('strava_access_token', token);
    
    if (refresh) {
      refreshToken = refresh;
      await secureSettingsStorage.setSecret('strava_refresh_token', refresh);
    }
    
    if (expires) {
      expiresAt = expires;
      await secureSettingsStorage.setSecret('strava_expires_at', expires.toString());
    }
  },

  checkAndRefreshToken: async () => {
    if (!accessToken || !refreshToken || !expiresAt) return;
    
    // Check if token is expired (adding 5 min buffer)
    if (Date.now() / 1000 >= expiresAt - 300) {
      const { stravaClientId, stravaClientSecret } = useStore.getState().settings;
      if (!stravaClientId || !stravaClientSecret) return;

      try {
        const res = await axios.post('https://www.strava.com/oauth/token', {
          client_id: stravaClientId,
          client_secret: stravaClientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        });

        const { access_token, refresh_token, expires_at } = res.data;
        await StravaService.setToken(access_token, refresh_token, expires_at);
      } catch (error: any) {
        console.error('Error refreshing token:', error);
        if (error.response?.status === 400 || error.response?.status === 401) {
          await StravaService.disconnect();
          throw new Error('Not authenticated with Strava');
        }
        throw error;
      }
    }
  },

  /**
   * Fetch activities from Strava. Pass `after` (epoch seconds) for an
   * incremental sync — only activities started after that instant come back,
   * which turns the routine 30-minute refresh from O(career) pages into one
   * small request. Omit it for the initial full-history sync.
   */
  syncActivities: async (opts?: { after?: number }): Promise<Activity[]> => {
    await StravaService.checkAndRefreshToken();
    if (!accessToken) {
      throw new Error('Not authenticated with Strava');
    }

    // The athlete's real weight makes MET calorie estimates honest. Profile
    // wins (user-entered), then Strava's athlete record, then 70 kg.
    const { userProfile, athleteStats } = useStore.getState();
    const weightKg = userProfile.weight || athleteStats?.athlete?.weight || 70;

    try {
      let allActivities: Activity[] = [];
      let page = 1;
      let hasMore = true;
      const afterParam = opts?.after ? `&after=${Math.floor(opts.after)}` : '';

      while (hasMore) {
        let response: any;
        try {
          response = await axios.get(
            `https://www.strava.com/api/v3/athlete/activities?per_page=200&page=${page}${afterParam}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
        } catch (pageError: any) {
          if (pageError.response?.status === 401) {
            // Only disconnect if first page; otherwise return what we have
            if (page === 1) {
              await StravaService.disconnect();
              throw new Error('Not authenticated with Strava');
            }
            break; // mid-sync 401: stop pagination, keep collected data
          }
          throw pageError;
        }

        const pageData = response.data;
        if (pageData.length === 0) { hasMore = false; break; }

        const activities: Activity[] = pageData.map((item: any) =>
          mapSummaryActivity(item, weightKg),
        );

        allActivities = [...allActivities, ...activities];
        if (pageData.length < 200) { hasMore = false; } else { page++; }
      }

      return allActivities;
    } catch (error: any) {
      console.error('Error syncing activities:', error);
      throw error;
    }
  },

  fetchAthleteStats: async (): Promise<{ stats: any, athlete: any }> => {
    await StravaService.checkAndRefreshToken();
    if (!accessToken) {
      throw new Error('Not authenticated with Strava');
    }
    try {
      const athleteRes = await axios.get('https://www.strava.com/api/v3/athlete', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const athleteId = athleteRes.data.id;

      const statsRes = await axios.get(`https://www.strava.com/api/v3/athletes/${athleteId}/stats`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      return { stats: statsRes.data, athlete: athleteRes.data };
    } catch (error: any) {
      console.error('Error fetching athlete stats:', error);
      throw error;
    }
  },

  fetchActivityDetail: async (activityId: string): Promise<any> => {
    await StravaService.checkAndRefreshToken();
    if (!accessToken) throw new Error('Not authenticated with Strava');
    try {
      const res = await axios.get(
        `https://www.strava.com/api/v3/activities/${activityId}?include_all_efforts=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      return res.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        await StravaService.disconnect();
        throw new Error('Not authenticated with Strava');
      }
      throw error;
    }
  },

  fetchZones: async (): Promise<{ min: number; max: number }[]> => {
    await StravaService.checkAndRefreshToken();
    if (!accessToken) throw new Error('Not authenticated with Strava');
    const res = await axios.get('https://www.strava.com/api/v3/athlete/zones', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // heart_rate.zones is [{min, max}, ...] — max of last zone is -1 (infinity)
    return res.data?.heart_rate?.zones || [];
  },

  /** Both zone sets from /athlete/zones — power included (rides/FTP work). */
  fetchAllZones: async (): Promise<{
    heartRate: { min: number; max: number }[];
    power: { min: number; max: number }[];
  }> => {
    await StravaService.checkAndRefreshToken();
    if (!accessToken) throw new Error('Not authenticated with Strava');
    const res = await axios.get('https://www.strava.com/api/v3/athlete/zones', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return {
      heartRate: res.data?.heart_rate?.zones || [],
      power: res.data?.power?.zones || [],
    };
  },

  fetchActivityStreams: async (activityId: string, types = 'heartrate,cadence,watts,velocity_smooth,altitude,distance,temp,grade_smooth,time'): Promise<any> => {
    try {
      await StravaService.checkAndRefreshToken();
      if (!accessToken) return null;
      const res = await axios.get(
        `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=${types}&key_by_type=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      return res.data;
    } catch {
      return null;
    }
  },

  // Per-activity time-in-zone distribution from Strava's own bucketing —
  // more accurate than re-computing locally from splits because it respects
  // the athlete's zones at the time of the recording. Returns null if Strava
  // has no zone data for the activity (e.g. no HR sensor was paired).
  fetchActivityZones: async (
    activityId: string,
  ): Promise<Array<{ type: 'heartrate' | 'power'; distribution_buckets: Array<{ min: number; max: number; time: number }> }> | null> => {
    try {
      await StravaService.checkAndRefreshToken();
      if (!accessToken) return null;
      const res = await axios.get(
        `https://www.strava.com/api/v3/activities/${activityId}/zones`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      return Array.isArray(res.data) ? res.data : null;
    } catch {
      return null;
    }
  },

  // Photos attached to an activity (Strava + Instagram). `size=600` returns
  // the largest available thumbnail.
  fetchActivityPhotos: async (activityId: string): Promise<Array<{ urls: Record<string, string>; caption?: string; created_at?: string }> | null> => {
    try {
      await StravaService.checkAndRefreshToken();
      if (!accessToken) return null;
      const res = await axios.get(
        `https://www.strava.com/api/v3/activities/${activityId}/photos?size=600`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      return Array.isArray(res.data) ? res.data : null;
    } catch {
      return null;
    }
  },

  // Starred segments the athlete has bookmarked on Strava. Useful for the
  // dashboard "Starred Segments" widget.
  fetchStarredSegments: async (perPage = 30): Promise<any[] | null> => {
    try {
      await StravaService.checkAndRefreshToken();
      if (!accessToken) return null;
      const res = await axios.get(
        `https://www.strava.com/api/v3/segments/starred?per_page=${perPage}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      return Array.isArray(res.data) ? res.data : null;
    } catch {
      return null;
    }
  },

  disconnect: async () => {
    accessToken = null;
    refreshToken = null;
    expiresAt = null;
    await secureSettingsStorage.removeSecret('strava_access_token');
    await secureSettingsStorage.removeSecret('strava_refresh_token');
    await secureSettingsStorage.removeSecret('strava_expires_at');
  }
};
