import { Activity, useStore } from '../store/useStore';
import axios from 'axios';

let accessToken: string | null = null;

export const StravaService = {
  isAuthenticated: () => !!accessToken,

  setToken: (token: string) => {
    accessToken = token;
  },

  syncActivities: async (): Promise<Activity[]> => {
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

      const activities: Activity[] = response.data.map((item: any) => ({
        id: item.id.toString(),
        type: item.type,
        distance: item.distance,
        movingTime: item.moving_time,
        elapsedTime: item.elapsed_time,
        totalElevationGain: item.total_elevation_gain,
        startDate: item.start_date,
        averageSpeed: item.average_speed,
        maxSpeed: item.max_speed,
        averageHeartRate: item.average_heartrate,
        maxHeartRate: item.max_heartrate,
      }));

      return activities;
    } catch (error) {
      console.error('Error syncing activities:', error);
      throw error;
    }
  },

  disconnect: () => {
    accessToken = null;
  }
};
