import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';

// Required for web to close the browser popup
WebBrowser.maybeCompleteAuthSession();

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/mobile/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

// Endpoints
const redirectUri = AuthSession.makeRedirectUri({
  scheme: 'app',
});

// Format pace from m/s to min/km string
const formatPace = (speedMs: number) => {
  if (!speedMs || speedMs === 0) return '0:00';
  const paceSecPerKm = 1000 / speedMs;
  const mins = Math.floor(paceSecPerKm / 60);
  const secs = Math.floor(paceSecPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const authenticateStrava = async (): Promise<boolean> => {
  try {
    const clientId = await SecureStore.getItemAsync('stravaClientId');
    const clientSecret = await SecureStore.getItemAsync('stravaClientSecret');

    if (!clientId || !clientSecret) {
      console.warn("Strava credentials not configured in Settings.");
      return false;
    }

    const authUrl = `${STRAVA_AUTH_URL}?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&approval_prompt=force&scope=activity:read_all`;

    // Create an AuthRequest instance
    const authRequest = new AuthSession.AuthRequest({
        clientId: clientId,
        scopes: ['activity:read_all'],
        redirectUri: redirectUri,
    });

    // Call promptAsync to open the browser
    const result = await authRequest.promptAsync({ authorizationEndpoint: STRAVA_AUTH_URL });

    if (result.type === 'success' && result.params.code) {
      const code = result.params.code;

      // Token exchange
      const tokenResponse = await axios.post(STRAVA_TOKEN_URL, {
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code'
      });

      const { access_token, refresh_token, expires_at } = tokenResponse.data;

      await SecureStore.setItemAsync('strava_access_token', access_token);
      await SecureStore.setItemAsync('strava_refresh_token', refresh_token);
      await SecureStore.setItemAsync('strava_expires_at', expires_at.toString());

      return true;
    }

    return false;
  } catch (error) {
    console.error("Strava Auth Error:", error);
    return false;
  }
};

const getValidAccessToken = async () => {
  let accessToken = await SecureStore.getItemAsync('strava_access_token');
  const refreshToken = await SecureStore.getItemAsync('strava_refresh_token');
  const expiresAt = await SecureStore.getItemAsync('strava_expires_at');

  if (!accessToken) {
      return null;
  }

  // Check if token is expired
  if (expiresAt && Date.now() / 1000 > parseInt(expiresAt, 10)) {
    const clientId = await SecureStore.getItemAsync('stravaClientId');
    const clientSecret = await SecureStore.getItemAsync('stravaClientSecret');

    if (!clientId || !clientSecret || !refreshToken) {
        return null;
    }

    try {
        const tokenResponse = await axios.post(STRAVA_TOKEN_URL, {
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken
          });

          const { access_token: new_access, refresh_token: new_refresh, expires_at: new_expires } = tokenResponse.data;

          await SecureStore.setItemAsync('strava_access_token', new_access);
          await SecureStore.setItemAsync('strava_refresh_token', new_refresh);
          await SecureStore.setItemAsync('strava_expires_at', new_expires.toString());

          accessToken = new_access;
    } catch (e) {
        console.error("Error refreshing token", e);
        return null;
    }
  }

  return accessToken;
};

export const fetchStravaActivities = async () => {
  try {
    const token = await getValidAccessToken();

    if (!token) {
      throw new Error("No access token found. Please authenticate.");
    }

    const response = await axios.get(`${STRAVA_API_BASE}/athlete/activities`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const activities = response.data;

    // Map to our internal Activity interface
    return activities.map((act: any) => ({
        id: act.id.toString(),
        type: act.sport_type || act.type,
        date: act.start_date,
        distance: act.distance / 1000, // convert meters to km
        duration: act.moving_time, // seconds
        pace: formatPace(act.average_speed),
        elevation: act.total_elevation_gain,
        heartRate: act.average_heartrate || 0,
    }));

  } catch (error) {
    console.error("Error fetching Strava activities:", error);
    throw error;
  }
};
