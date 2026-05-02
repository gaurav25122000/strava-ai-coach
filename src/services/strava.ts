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
      } catch (error) {
        console.error('Error refreshing token:', error);
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
      // Fetch the last 30 activities
      const response = await axios.get('https://www.strava.com/api/v3/athlete/activities?per_page=30', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      const activities: Activity[] = response.data.map((item: any) => {
        const durationMins = item.moving_time / 60;
        const type: string = item.type || '';

        // Strava cadence for Run = one-leg steps/min → multiply by 2 for full steps
        // Strava cadence for Walk/Hike = already full steps/min (both feet)
        let calculatedSteps: number | undefined;
        if (item.average_cadence && item.moving_time) {
          const isRun = type === 'Run' || type === 'TrailRun' || type === 'VirtualRun';
          calculatedSteps = Math.round(
            isRun
              ? item.average_cadence * 2 * durationMins    // running: multiply by 2
              : item.average_cadence * durationMins          // walking/hiking: as-is
          );
        } else if (item.distance && item.moving_time) {
          // Fallback: use avg stride length by type (metres per step)
          const strideM = type === 'Run' || type === 'TrailRun'
            ? 1.4   // avg running stride ~1.4 m
            : 0.75; // avg walking stride ~0.75 m
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
          calories: item.calories,          // only use actual calories field; kilojoules ≠ kcal
          averageWatts: item.average_watts,
          sufferScore: item.suffer_score,
        };
      });

      return activities;
    } catch (error) {
      console.error('Error syncing activities:', error);
      throw error;
    }
  },

  fetchAthleteStats: async (): Promise<any> => {
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

      return statsRes.data;
    } catch (error) {
      console.error('Error fetching athlete stats:', error);
      throw error;
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
