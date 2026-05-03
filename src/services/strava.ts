import { Activity, useStore, secureSettingsStorage } from '../store/useStore';
import axios from 'axios';

let accessToken: string | null = null;
let refreshToken: string | null = null;
let expiresAt: number | null = null;

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

  syncActivities: async (): Promise<Activity[]> => {
    await StravaService.checkAndRefreshToken();
    if (!accessToken) {
      throw new Error('Not authenticated with Strava');
    }

    try {
      let allActivities: Activity[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        let response: any;
        try {
          response = await axios.get(`https://www.strava.com/api/v3/athlete/activities?per_page=200&page=${page}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
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

        const activities: Activity[] = pageData.map((item: any) => {
          const durationMins = item.moving_time / 60;
          const type: string = item.type || '';

          let calculatedSteps: number | undefined;
          if (item.average_cadence && item.moving_time) {
            const isRun = type === 'Run' || type === 'TrailRun' || type === 'VirtualRun';
            calculatedSteps = Math.round(
              isRun ? item.average_cadence * 2 * durationMins : item.average_cadence * durationMins
            );
          } else if (item.distance && item.moving_time) {
            const strideM = type === 'Run' || type === 'TrailRun' ? 1.4 : 0.75;
            calculatedSteps = Math.round(item.distance / strideM);
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
            averageSpeed: item.average_speed,
            maxSpeed: item.max_speed,
            averageHeartRate: item.average_heartrate,
            maxHeartRate: item.max_heartrate,
            averageCadence: item.average_cadence,
            steps: calculatedSteps,
            kilojoules: item.kilojoules,
            calories: item.calories || (item.kilojoules ? Math.round(item.kilojoules) : (() => {
              // Estimate calories from MET * weight * hours
              const hours = (item.moving_time || 0) / 3600;
              if (hours <= 0) return undefined;
              const weightKg = 70; // default; real weight used via store if available
              const met = type === 'Run' || type === 'TrailRun' || type === 'VirtualRun'
                ? (item.average_speed > 3.5 ? 11.0 : item.average_speed > 2.7 ? 9.8 : 8.0)
                : type === 'Ride' || type === 'VirtualRide'
                  ? (item.average_speed > 8.3 ? 10.0 : item.average_speed > 5.5 ? 8.0 : 6.0)
                  : type === 'Walk' || type === 'Hike'
                    ? 3.8
                    : 5.0;
              return Math.round(met * weightKg * hours);
            })()),
            averageWatts: item.average_watts,
            sufferScore: item.suffer_score,
          };
        });

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
    try {
      const res = await axios.get('https://www.strava.com/api/v3/athlete/zones', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      // heart_rate.zones is [{min, max}, ...] — max of last zone is -1 (infinity)
      return res.data?.heart_rate?.zones || [];
    } catch (error: any) {
      throw error;
    }
  },

  fetchActivityStreams: async (activityId: string, types = 'heartrate,cadence,watts,velocity_smooth,altitude,distance'): Promise<any> => {
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

  disconnect: async () => {
    accessToken = null;
    refreshToken = null;
    expiresAt = null;
    await secureSettingsStorage.removeSecret('strava_access_token');
    await secureSettingsStorage.removeSecret('strava_refresh_token');
    await secureSettingsStorage.removeSecret('strava_expires_at');
  }
};
