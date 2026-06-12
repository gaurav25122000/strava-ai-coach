import axios from 'axios';
import { useStore, WeatherDay, WeatherHour, WeatherSnapshot } from '../store/useStore';
import { localDateStr } from '../utils/dates';

// Open-Meteo forecast around the athlete's last activity start point — free,
// no API key. Cached in the store; refreshWeather() is cheap to call from
// dashboard upkeep (no-ops while the cache is fresh and nearby).

const FRESH_MS = 3 * 60 * 60 * 1000; // re-fetch after 3 h
const STALE_MS = 12 * 60 * 60 * 1000; // too old to feed the AI prompt
const NEARBY_KM = 20; // same-place threshold for the cache

/** Local "YYYY-MM-DDTHH:00" — Open-Meteo hourly times with timezone=auto. */
function localHourStr(d: Date): string {
  return `${localDateStr(d)}T${String(d.getHours()).padStart(2, '0')}:00`;
}

/** Equirectangular approximation — plenty for a "same city?" check. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return Math.sqrt(x * x + y * y) * 6371;
}

export async function fetchForecast(lat: number, lon: number): Promise<WeatherSnapshot> {
  const res = await axios.get('https://api.open-meteo.com/v1/forecast', {
    params: {
      latitude: lat,
      longitude: lon,
      hourly: 'temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset',
      timezone: 'auto',
      forecast_days: 3,
      wind_speed_unit: 'kmh',
    },
  });

  const h = res.data?.hourly ?? {};
  const d = res.data?.daily ?? {};
  const nowHour = localHourStr(new Date());

  const hourly: WeatherHour[] = ((h.time ?? []) as string[])
    .map((time, i) => ({
      time,
      tempC: h.temperature_2m?.[i],
      apparentC: h.apparent_temperature?.[i],
      precipProb: h.precipitation_probability?.[i] ?? 0,
      windKph: h.wind_speed_10m?.[i] ?? 0,
      code: h.weather_code?.[i] ?? 0,
    }))
    .filter((x) => x.time >= nowHour && typeof x.tempC === 'number')
    .slice(0, 48);

  const daily: WeatherDay[] = ((d.time ?? []) as string[])
    .slice(0, 3)
    .map((date, i) => ({
      date,
      tMaxC: d.temperature_2m_max?.[i] ?? 0,
      tMinC: d.temperature_2m_min?.[i] ?? 0,
      precipProb: d.precipitation_probability_max?.[i] ?? 0,
      code: d.weather_code?.[i] ?? 0,
      sunrise: d.sunrise?.[i] ?? '',
      sunset: d.sunset?.[i] ?? '',
    }));

  return { fetchedAt: new Date().toISOString(), lat, lon, hourly, daily };
}

/**
 * Refresh the cached forecast for wherever the athlete last started an
 * activity. No-op without a geolocated activity, or while the cache is both
 * fresh (< 3 h) and for roughly the same place (< ~20 km). Concurrent calls
 * (widget mount + dashboard upkeep land in the same commit window) share one
 * in-flight fetch instead of both passing the freshness check.
 */
let refreshInFlight: Promise<void> | null = null;

export function refreshWeather(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = doRefreshWeather().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefreshWeather(): Promise<void> {
  const { activities, weatherCache, setWeatherCache } = useStore.getState();
  const latest = activities
    .filter((a) => a.startLatlng)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0];
  if (!latest?.startLatlng) return;

  const [lat, lon] = latest.startLatlng;
  if (weatherCache) {
    const ageMs = Date.now() - new Date(weatherCache.fetchedAt).getTime();
    if (ageMs < FRESH_MS && distanceKm(lat, lon, weatherCache.lat, weatherCache.lon) < NEARBY_KM) {
      return;
    }
  }
  setWeatherCache(await fetchForecast(lat, lon));
}

// ----- Best-workout-window scoring -------------------------------------------

// Penalty for running in this hour — lower is better. Ideal apparent temp is
// 8–16 °C; heat hurts faster than cold; rain probability and wind add on top.
function hourPenalty(h: WeatherHour): number {
  let penalty = 0;
  if (h.apparentC < 8) penalty += (8 - h.apparentC) * 1.5;
  else if (h.apparentC > 16) penalty += (h.apparentC - 16) * 2;
  penalty += (h.precipProb / 100) * 30;
  penalty += Math.max(0, h.windKph - 15) * 0.5;
  return penalty;
}

/** "6 AM", "12 PM", "7 PM". */
function hourLabel(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** "6–8 AM" when both ends share a meridiem, else "11 AM–1 PM". */
function windowLabel(startHour: number, endHour: number): string {
  const start = hourLabel(startHour);
  const end = hourLabel(endHour);
  const sameMeridiem = start.slice(-2) === end.slice(-2);
  return sameMeridiem ? `${start.split(' ')[0]}–${end}` : `${start}–${end}`;
}

/**
 * Best contiguous ~2 h workout window between 06:00 and 21:00 on `dayKey`
 * (local YYYY-MM-DD), or null when the snapshot has no hours for that day.
 */
export function bestWindow(
  snap: WeatherSnapshot,
  dayKey: string,
): { startHour: number; endHour: number; tempC: number; label: string } | null {
  const hours = snap.hourly
    .filter((h) => h.time.startsWith(dayKey))
    .map((h) => ({ h, hour: parseInt(h.time.slice(11, 13), 10) }))
    .filter((x) => x.hour >= 6 && x.hour < 21);
  if (!hours.length) return null;

  let best: { startHour: number; endHour: number; tempC: number; penalty: number } | null = null;
  for (let i = 0; i < hours.length; i++) {
    const a = hours[i];
    const b = hours[i + 1];
    const pair = b && b.hour === a.hour + 1;
    const penalty = pair ? (hourPenalty(a.h) + hourPenalty(b!.h)) / 2 : hourPenalty(a.h) + 1;
    const candidate = {
      startHour: a.hour,
      endHour: a.hour + (pair ? 2 : 1),
      tempC: Math.round(pair ? (a.h.tempC + b!.h.tempC) / 2 : a.h.tempC),
      penalty,
    };
    if (!best || candidate.penalty < best.penalty) best = candidate;
  }
  if (!best) return null;
  return {
    startHour: best.startHour,
    endHour: best.endHour,
    tempC: best.tempC,
    label: windowLabel(best.startHour, best.endHour),
  };
}

/** Short human line, e.g. "28° now · best window 6–8 AM (24°)". */
export function weatherLine(snap: WeatherSnapshot, dayKey: string): string {
  const parts: string[] = [];
  const current = snap.hourly[0];
  if (current?.time.startsWith(dayKey)) parts.push(`${Math.round(current.tempC)}° now`);
  const win = bestWindow(snap, dayKey);
  if (win) parts.push(`best window ${win.label} (${win.tempC}°)`);
  const rain = snap.hourly.find((h) => h.time.startsWith(dayKey) && h.precipProb >= 60);
  if (rain) parts.push(`rain likely from ${rain.time.slice(11, 16)}`);
  return parts.length ? parts.join(' · ') : 'No forecast for this day';
}

/**
 * "WEATHER (next 48h)" block for the AI system prompt, or null when there is
 * no snapshot or it's stale (> 12 h) — a wrong forecast is worse than none.
 * Labels are anchored to the actual dates, not array position: a snapshot
 * fetched yesterday evening still has yesterday at daily[0], which must not
 * be called "Today".
 */
export function weatherContext(snap: WeatherSnapshot | null): string | null {
  if (!snap || !snap.daily.length) return null;
  if (Date.now() - new Date(snap.fetchedAt).getTime() > STALE_MS) return null;

  const todayKey = localDateStr(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = localDateStr(tomorrow);

  const days = snap.daily.filter((d) => d.date >= todayKey).slice(0, 2);
  if (!days.length) return null;

  const lines = ['WEATHER (next 48h):'];
  for (const d of days) {
    const label = d.date === todayKey ? 'Today' : d.date === tomorrowKey ? 'Tomorrow' : d.date;
    let line = `- ${label} (${d.date}): ${Math.round(d.tMinC)}–${Math.round(d.tMaxC)}°C, ${Math.round(d.precipProb)}% precip`;
    const win = bestWindow(snap, d.date);
    if (win) line += `, best workout window ${win.label} (~${win.tempC}°C)`;
    lines.push(line);
  }
  return lines.join('\n');
}

export type WmoIconGroup = 'sun' | 'cloud' | 'rain' | 'snow' | 'storm';

/** Collapse WMO weather codes into the five icon groups the widget renders. */
export function wmoIcon(code: number): WmoIconGroup {
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code <= 1) return 'sun';
  return 'cloud'; // partly cloudy, overcast, fog
}
