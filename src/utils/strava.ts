import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { Platform } from 'react-native';

const STRAVA_CLIENT_ID = 'YOUR_STRAVA_CLIENT_ID'; // Replace with actual ID
const STRAVA_CLIENT_SECRET = 'YOUR_STRAVA_CLIENT_SECRET'; // Replace with actual Secret
const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/mobile/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

// Endpoints
const redirectUri = AuthSession.makeRedirectUri({
  scheme: 'app',
});

// Mock Data Fallback for Development
export const MOCK_ACTIVITIES = [
  {
    id: '1',
    type: 'Run',
    date: '2026-04-29T10:00:00Z',
    distance: 5.2, // km
    duration: 1800, // seconds
    pace: '5:46', // min/km
    elevation: 45,
    heartRate: 152,
  },
  {
    id: '2',
    type: 'Run',
    date: '2026-04-27T08:30:00Z',
    distance: 10.5,
    duration: 3600,
    pace: '5:42',
    elevation: 120,
    heartRate: 158,
  }
];

export const authenticateStrava = async () => {
  try {
    const authUrl = `${STRAVA_AUTH_URL}?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${redirectUri}&approval_prompt=force&scope=activity:read_all`;

    // In a real scenario with a configured Expo project scheme, you would use:
    // const result = await AuthSession.startAsync({ authUrl });
    // For this mock implementation, we'll simulate a successful authentication.

    console.log("Simulating Strava OAuth...");

    // Simulating storing tokens
    await SecureStore.setItemAsync('strava_access_token', 'mock_access_token_123');
    await SecureStore.setItemAsync('strava_refresh_token', 'mock_refresh_token_456');

    return true;
  } catch (error) {
    console.error("Strava Auth Error:", error);
    return false;
  }
};

export const fetchStravaActivities = async () => {
  try {
    const token = await SecureStore.getItemAsync('strava_access_token');

    if (!token) {
      throw new Error("No access token found. Please authenticate.");
    }

    // Real implementation:
    // const response = await axios.get(`${STRAVA_API_BASE}/athlete/activities`, {
    //   headers: { Authorization: `Bearer ${token}` }
    // });
    // return response.data;

    console.log("Simulating fetching Strava activities...");

    // Fallback to mock data for presentation purposes
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(MOCK_ACTIVITIES);
      }, 1000);
    });

  } catch (error) {
    console.error("Error fetching Strava activities:", error);
    throw error;
  }
};
