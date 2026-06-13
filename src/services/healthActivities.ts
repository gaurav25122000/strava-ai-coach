import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Activity, DailyHealthEntry, HRZone, ZoneBucket, useStore } from '../store/useStore';
import { encodePolyline } from '../utils/polyline';
import { localDateStr } from '../utils/dates';
import { deriveSteps, estimateCalories, RUN_TYPES } from './activityDerive';

// ── Health workout import (HealthKit / Health Connect) ──────────────────────
//
// Mirrors StravaService's surface so syncRunner can dispatch on the active
// source. Same OTA-safety rules as services/health.ts: both packages are
// native modules that do NOT exist in older installed binaries, so every
// native touchpoint is lazy-required and fenced — a missing module degrades
// to 'unavailable' instead of crashing at bundle import time.
//
// Scale: first sync pulls the COMPLETE workout history through paged anchored
// queries (multi-GB Health stores stay fine because we only ever read workout
// summaries plus per-workout sample windows — never store-wide sample scans).
// Heart-rate/distance enrichment runs progressively in bounded batches after
// summary rows land, so sync is never blocked on thousands of native calls.

const HK_PREFIX = 'hk:';
const HC_PREFIX = 'hc:';
const HK_ANCHOR_KEY = 'health-sync-anchor-hk';
const HC_TOKEN_KEY = 'health-sync-token-hc';

const PAGE_SIZE = 500;          // workouts per anchored page
const INLINE_ENRICH = 150;      // newest workouts enriched with HR during sync
const BACKFILL_BATCH = 50;      // per-loop enrichment batch (older history)
const ROUTE_BACKFILL = 30;      // newest GPS workouts that get a polyline at sync
const MIN_DURATION_S = 60;      // ignore sub-minute "workouts" (watch noise)

export function isHealthActivityId(id: string): boolean {
  return id.startsWith(HK_PREFIX) || id.startsWith(HC_PREFIX);
}

// ── Lazy native modules ──────────────────────────────────────────────────────

function requireHealthKit(): any | null {
  if (Platform.OS !== 'ios') return null;
  try {
    const hk = require('@kingstinct/react-native-healthkit');
    return hk.isHealthDataAvailable() ? hk : null;
  } catch {
    return null;
  }
}

async function requireHealthConnect(): Promise<any | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const hc = require('react-native-health-connect');
    return (await hc.initialize()) ? hc : null;
  } catch {
    return null;
  }
}

// ── Sport-type maps (HealthKit numeric enums are stable Apple constants) ────

const HK_TYPE_MAP: Record<number, string> = {
  37: 'Run', 13: 'Ride', 52: 'Walk', 24: 'Hike', 46: 'Swim',
  35: 'Rowing', 16: 'Elliptical', 44: 'StairStepper',
  50: 'WeightTraining', 20: 'WeightTraining',
  57: 'Yoga', 66: 'Pilates',
  60: 'NordicSki', 61: 'AlpineSki', 67: 'Snowboard',
  41: 'Soccer', 48: 'Tennis', 4: 'Badminton', 43: 'Squash', 34: 'Racquetball',
  47: 'TableTennis', 79: 'Pickleball', 9: 'RockClimbing', 21: 'Golf',
  39: 'IceSkate', 45: 'Surfing', 38: 'Sail', 31: 'Canoeing',
};

const HC_TYPE_MAP: Record<number, { type: string; trainer?: boolean }> = {
  56: { type: 'Run' }, 57: { type: 'Run', trainer: true },
  8: { type: 'Ride' }, 9: { type: 'Ride', trainer: true },
  79: { type: 'Walk' }, 37: { type: 'Hike' },
  73: { type: 'Swim' }, 74: { type: 'Swim' },
  53: { type: 'Rowing' }, 54: { type: 'Rowing', trainer: true },
  25: { type: 'Elliptical' },
  68: { type: 'StairStepper' }, 69: { type: 'StairStepper', trainer: true },
  70: { type: 'WeightTraining' }, 81: { type: 'WeightTraining' },
  83: { type: 'Yoga' }, 48: { type: 'Pilates' },
  61: { type: 'AlpineSki' }, 62: { type: 'Snowboard' }, 63: { type: 'Snowshoe' },
  64: { type: 'Soccer' }, 76: { type: 'Tennis' }, 2: { type: 'Badminton' },
  66: { type: 'Squash' }, 50: { type: 'Racquetball' }, 75: { type: 'TableTennis' },
  51: { type: 'RockClimbing' }, 32: { type: 'Golf' }, 39: { type: 'IceSkate' },
  72: { type: 'Surfing' }, 58: { type: 'Sail' }, 46: { type: 'Canoeing' },
};

// ── Quantity converters (defensive — units vary by device locale) ───────────

function toSeconds(q: any): number {
  if (!q) return 0;
  const v = typeof q === 'number' ? q : q.quantity ?? 0;
  const unit = typeof q === 'object' ? (q.unit ?? 's') : 's';
  if (unit.startsWith('min')) return v * 60;
  if (unit.startsWith('hr') || unit.startsWith('hour')) return v * 3600;
  return v;
}

function toMeters(q: any): number {
  if (!q) return 0;
  const v = typeof q === 'number' ? q : q.quantity ?? 0;
  const unit = typeof q === 'object' ? (q.unit ?? 'm') : 'm';
  if (unit === 'km') return v * 1000;
  if (unit === 'mi') return v * 1609.344;
  if (unit === 'yd') return v * 0.9144;
  if (unit === 'ft') return v * 0.3048;
  return v;
}

function toKcal(q: any): number | undefined {
  if (!q) return undefined;
  const v = typeof q === 'number' ? q : q.quantity ?? 0;
  if (!v) return undefined;
  const unit = typeof q === 'object' ? (q.unit ?? 'kcal') : 'kcal';
  if (unit === 'cal') return Math.round(v / 1000);
  if (unit === 'kJ') return Math.round(v / 4.184);
  return Math.round(v);
}

function resolveWeightKg(): number {
  return useStore.getState().userProfile.weight || 70;
}

/** Wall-clock ISO without timezone suffix — same role as Strava start_date_local. */
function toLocalIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}Z`;
}

// ── Mapping (pure, exported for tests) ───────────────────────────────────────

export interface HrStats {
  avg?: number;
  max?: number;
  /** Average running/cycling power during the workout (Watch, iOS 16+/17+). */
  watts?: number;
}

/** Map one HealthKit workout (plain sample fields) onto our Activity shape. */
export function mapHKWorkout(w: any, weightKg: number, hr?: HrStats): Activity {
  const start = new Date(w.startDate);
  const end = new Date(w.endDate);
  const elapsedTime = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  const movingTime = Math.round(toSeconds(w.duration)) || elapsedTime;
  const distance = toMeters(w.totalDistance);
  const type = HK_TYPE_MAP[w.workoutActivityType] ?? 'Workout';
  const trainer = w.metadata?.HKIndoorWorkout === true || w.metadata?.HKIndoorWorkout === 1 || undefined;
  const averageSpeed = movingTime > 0 ? distance / movingTime : 0;

  const realCalories = toKcal(w.totalEnergyBurned);
  const calories = realCalories ?? estimateCalories({ type, movingTime, averageSpeed, weightKg });

  // HKElevationAscended arrives as a quantity in metadata when the recording
  // device measured it; otherwise route enrichment fills elevation in later.
  const elevation = w.metadata?.HKElevationAscended;
  const totalElevationGain = elevation ? Math.round(toMeters(elevation)) : 0;

  return {
    id: HK_PREFIX + w.uuid,
    type,
    distance,
    movingTime,
    elapsedTime,
    totalElevationGain,
    startDate: start.toISOString(),
    startDateLocal: toLocalIso(start),
    averageSpeed,
    maxSpeed: averageSpeed,
    averageHeartRate: hr?.avg,
    maxHeartRate: hr?.max,
    averageWatts: hr?.watts,
    deviceWatts: hr?.watts !== undefined ? true : undefined,
    steps: deriveSteps({ type, movingTime, distance }),
    calories,
    caloriesEstimated: realCalories === undefined && calories !== undefined ? true : undefined,
    trainer,
  };
}

/** Map one Health Connect ExerciseSession record onto our Activity shape. */
export function mapHCSession(r: any, weightKg: number): Activity {
  const start = new Date(r.startTime);
  const end = new Date(r.endTime);
  const elapsedTime = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  const mapped = HC_TYPE_MAP[r.exerciseType] ?? { type: 'Workout' };
  // Sessions carry no distance/HR — the enrichment backfill fills those in.
  const movingTime = elapsedTime;
  return {
    id: HC_PREFIX + (r.metadata?.id ?? r.id),
    type: mapped.type,
    name: r.title || undefined,
    distance: 0,
    movingTime,
    elapsedTime,
    totalElevationGain: 0,
    startDate: start.toISOString(),
    startDateLocal: toLocalIso(start),
    averageSpeed: 0,
    maxSpeed: 0,
    calories: estimateCalories({ type: mapped.type, movingTime, averageSpeed: 0, weightKg }),
    caloriesEstimated: true,
    trainer: mapped.trainer,
  };
}

// ── HR sample helpers (pure, exported for tests) ─────────────────────────────

export interface HrSample {
  bpm: number;
  startMs: number;
  endMs: number;
}

/** Cap a point-sample's influence — Watch samples are near-instantaneous. */
const MAX_SAMPLE_GAP_S = 30;

function sampleDurations(samples: HrSample[]): number[] {
  return samples.map((s, i) => {
    const own = (s.endMs - s.startMs) / 1000;
    if (own > 1) return Math.min(own, MAX_SAMPLE_GAP_S);
    const next = samples[i + 1];
    if (!next) return 5;
    return Math.min((next.startMs - s.startMs) / 1000, MAX_SAMPLE_GAP_S);
  });
}

/**
 * Strava-convention cadence from workout steps: per-leg RPM for runs (the
 * detail chip doubles it back to SPM), full SPM for walks/hikes.
 */
export function cadenceFromSteps(type: string, steps: number, movingTime: number): number | undefined {
  if (!steps || movingTime <= 0) return undefined;
  const spm = steps / (movingTime / 60);
  return Math.round(RUN_TYPES.has(type) ? spm / 2 : spm);
}

export function hrStatsFromSamples(samples: HrSample[]): HrStats {
  if (!samples.length) return {};
  const durations = sampleDurations(samples);
  let weighted = 0;
  let total = 0;
  let max = 0;
  samples.forEach((s, i) => {
    weighted += s.bpm * durations[i];
    total += durations[i];
    if (s.bpm > max) max = s.bpm;
  });
  return { avg: Math.round(weighted / total), max: Math.round(max) };
}

/**
 * Local replacement for Strava's per-activity time-in-zone buckets — samples
 * bucketed against the athlete's resolved zones, same {min,max,time} shape.
 */
export function computeHrZoneBuckets(samples: HrSample[], zones: HRZone[]): ZoneBucket[] {
  const buckets: ZoneBucket[] = zones.map((z) => ({ min: z.min, max: z.max, time: 0 }));
  if (!buckets.length || !samples.length) return buckets;
  const sorted = [...samples].sort((a, b) => a.startMs - b.startMs);
  const durations = sampleDurations(sorted);
  sorted.forEach((s, i) => {
    for (const b of buckets) {
      if (s.bpm >= b.min && (b.max === -1 || s.bpm < b.max)) {
        b.time += durations[i];
        break;
      }
    }
  });
  for (const b of buckets) b.time = Math.round(b.time);
  return buckets;
}

// ── Route helpers (pure, exported for tests) ─────────────────────────────────

export interface RoutePoint {
  latitude: number;
  longitude: number;
  altitude?: number;
  timeMs: number;
}

/**
 * Health Connect serialises route altitude as a Length object
 * ({inMeters, ...}); HealthKit emits a plain number. Normalise both.
 */
function routeAltitude(raw: any): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'number') return raw;
  if (typeof raw.inMeters === 'number') return raw.inMeters;
  if (typeof raw.value === 'number') return raw.value;
  return undefined;
}

function haversineM(a: RoutePoint, b: RoutePoint): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const la = (a.latitude * Math.PI) / 180;
  const lb = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Positive altitude deltas, 1 m noise floor — same idea as barometric gain. */
export function elevationGainFromRoute(points: RoutePoint[]): number {
  let gain = 0;
  let last: number | undefined;
  for (const p of points) {
    if (p.altitude === undefined) continue;
    if (last !== undefined && p.altitude - last > 1) gain += p.altitude - last;
    if (last === undefined || Math.abs(p.altitude - last) > 1) last = p.altitude;
  }
  return Math.round(gain);
}

export interface HealthSplit {
  /** 1-based km index, Strava-style. */
  split: number;
  distance: number; // m (last split may be partial)
  movingTime: number; // s
  elevationDifference: number; // m, end minus start altitude
  averageSpeed: number; // m/s
}

/** Per-km splits computed from the GPS route — Strava splits_metric stand-in. */
export function computeSplitsFromRoute(points: RoutePoint[]): HealthSplit[] {
  if (points.length < 2) return [];
  const splits: HealthSplit[] = [];
  let split = 1;
  let dist = 0;
  let splitStartMs = points[0].timeMs;
  let splitStartAlt = points[0].altitude;
  let lastAlt = points[0].altitude;
  for (let i = 1; i < points.length; i++) {
    dist += haversineM(points[i - 1], points[i]);
    if (points[i].altitude !== undefined) lastAlt = points[i].altitude;
    if (dist >= 1000) {
      const movingTime = Math.round((points[i].timeMs - splitStartMs) / 1000);
      splits.push({
        split,
        distance: 1000,
        movingTime,
        elevationDifference: Math.round((lastAlt ?? 0) - (splitStartAlt ?? lastAlt ?? 0)),
        averageSpeed: movingTime > 0 ? 1000 / movingTime : 0,
      });
      split++;
      dist -= 1000;
      splitStartMs = points[i].timeMs;
      splitStartAlt = points[i].altitude ?? lastAlt;
    }
  }
  if (dist > 100) {
    const last = points[points.length - 1];
    const movingTime = Math.round((last.timeMs - splitStartMs) / 1000);
    splits.push({
      split,
      distance: Math.round(dist),
      movingTime,
      elevationDifference: Math.round((lastAlt ?? 0) - (splitStartAlt ?? lastAlt ?? 0)),
      averageSpeed: movingTime > 0 ? dist / movingTime : 0,
    });
  }
  return splits;
}

/**
 * Resample HR + route onto one uniform timeline, in Strava's key_by_type
 * stream shape, so ActivityDetailScreen charts render unchanged.
 */
export function buildStreams(
  hrSamples: HrSample[],
  route: RoutePoint[],
  startMs: number,
  durationS: number,
): Record<string, { data: number[] }> {
  if (durationS <= 0 || (!hrSamples.length && route.length < 2)) return {};
  const stepS = Math.max(5, Math.round(durationS / 600));
  const n = Math.floor(durationS / stepS) + 1;
  const time = Array.from({ length: n }, (_, i) => i * stepS);
  const streams: Record<string, { data: number[] }> = { time: { data: time } };

  if (hrSamples.length) {
    const sorted = [...hrSamples].sort((a, b) => a.startMs - b.startMs);
    let j = 0;
    streams.heartrate = {
      data: time.map((t) => {
        const at = startMs + t * 1000;
        while (j < sorted.length - 1 && sorted[j + 1].startMs <= at) j++;
        return sorted[j].bpm;
      }),
    };
  }

  if (route.length >= 2) {
    const cum: number[] = [0];
    for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + haversineM(route[i - 1], route[i]));
    let j = 0;
    const dist: number[] = [];
    const alt: number[] = [];
    let hasAlt = false;
    for (const t of time) {
      const at = startMs + t * 1000;
      while (j < route.length - 1 && route[j + 1].timeMs <= at) j++;
      dist.push(Math.round(cum[j]));
      const a = route[j].altitude;
      if (a !== undefined) hasAlt = true;
      alt.push(a ?? 0);
    }
    streams.distance = { data: dist };
    if (hasAlt) streams.altitude = { data: alt };
  }

  return streams;
}

// ── iOS internals ────────────────────────────────────────────────────────────

const HK_READ_TYPES = [
  'HKWorkoutTypeIdentifier',
  'HKQuantityTypeIdentifierHeartRate',
  'HKWorkoutRouteTypeIdentifier',
  // Apple Fitness depth — per-workout power, cadence-from-steps, and the
  // daily recovery/activity rollups.
  'HKQuantityTypeIdentifierRunningPower',
  'HKQuantityTypeIdentifierCyclingPower',
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierVO2Max',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierAppleExerciseTime',
];

/** HR + power for one workout in a single native call. */
async function hkWorkoutStats(proxy: any): Promise<HrStats> {
  try {
    const all = await proxy.getAllStatistics();
    const hr = all?.HKQuantityTypeIdentifierHeartRate;
    const power =
      all?.HKQuantityTypeIdentifierRunningPower ?? all?.HKQuantityTypeIdentifierCyclingPower;
    const avg = hr?.averageQuantity?.quantity;
    const max = hr?.maximumQuantity?.quantity;
    const watts = power?.averageQuantity?.quantity;
    return {
      avg: avg ? Math.round(avg) : undefined,
      max: max ? Math.round(max) : undefined,
      watts: watts ? Math.round(watts) : undefined,
    };
  } catch {
    return {};
  }
}

async function hkWorkoutByUuid(hk: any, uuid: string): Promise<any | null> {
  try {
    const res = await hk.queryWorkoutSamples({ limit: 1, filter: { uuid } });
    return res?.[0] ?? null;
  } catch {
    return null;
  }
}

function hkRouteToPoints(routes: any[]): RoutePoint[] {
  const points: RoutePoint[] = [];
  for (const r of routes ?? []) {
    for (const l of r?.locations ?? []) {
      points.push({
        latitude: l.latitude,
        longitude: l.longitude,
        altitude: routeAltitude(l.altitude),
        timeMs: new Date(l.date ?? l.timestamp ?? 0).getTime(),
      });
    }
  }
  points.sort((a, b) => a.timeMs - b.timeMs);
  return points;
}

async function syncIOS(fullResync: boolean): Promise<HealthSyncBatch | 'unavailable'> {
  const hk = requireHealthKit();
  if (!hk) return 'unavailable';
  try {
    await hk.requestAuthorization({ toRead: HK_READ_TYPES });
  } catch {
    return 'unavailable';
  }

  let anchor = fullResync ? undefined : (await AsyncStorage.getItem(HK_ANCHOR_KEY)) ?? undefined;
  const full = !anchor;
  const collected: any[] = [];
  const deletedIds: string[] = [];

  // Paged anchored drain — full history on first run, deltas (including
  // deletions) afterwards. Bounded pages keep multi-GB stores responsive.
  while (true) {
    const res: any = await hk.queryWorkoutSamplesWithAnchor({ limit: PAGE_SIZE, anchor });
    anchor = res.newAnchor;
    collected.push(...(res.workouts ?? []));
    for (const d of res.deletedSamples ?? []) deletedIds.push(HK_PREFIX + d.uuid);
    if ((res.workouts?.length ?? 0) < PAGE_SIZE) break;
  }

  const weightKg = resolveWeightKg();
  const usable = collected.filter((w) => toSeconds(w.duration) >= MIN_DURATION_S || w.totalDistance);
  usable.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  // Inline HR for the newest slice only; the backfill loop covers the rest.
  const hrById = new Map<string, HrStats>();
  const inline = usable.slice(0, INLINE_ENRICH);
  for (let i = 0; i < inline.length; i += 25) {
    const chunk = inline.slice(i, i + 25);
    await Promise.all(
      chunk.map(async (w) => hrById.set(w.uuid, await hkWorkoutStats(w))),
    );
  }

  const activities = usable.map((w) => mapHKWorkout(w, weightKg, hrById.get(w.uuid)));
  if (anchor) await AsyncStorage.setItem(HK_ANCHOR_KEY, anchor);
  return { activities, deletedIds, full };
}

// ── Android internals ────────────────────────────────────────────────────────

// Regular data-type read permissions — these are what the consent screen
// actually grants.
const HC_DATA_PERMISSIONS = [
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  // Daily recovery/activity rollups (Apple Fitness depth parity).
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
  { accessType: 'read', recordType: 'Vo2Max' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'Steps' },
];

// "Additional access" permissions. Health Connect REJECTS the entire consent
// screen (it launches and self-finishes in ~10ms with an empty grant) if these
// are mixed into the first-time data request — they must be requested on their
// own, after at least one data permission is already granted. Without HISTORY
// reads are capped at 30 days; BACKGROUND covers headless reads. Both are
// best-effort: a dismissal here must never block the core grant.
const HC_EXTRA_PERMISSIONS = [
  { accessType: 'read', recordType: 'ReadHealthDataHistory' },
  { accessType: 'read', recordType: 'BackgroundAccessPermission' },
];

async function hcRequestPermissions(hc: any): Promise<boolean> {
  let granted: any[];
  try {
    granted = (await hc.requestPermission(HC_DATA_PERMISSIONS)) ?? [];
  } catch {
    return false;
  }
  const ok = granted.some(
    (p: any) => p.recordType === 'ExerciseSession' && p.accessType === 'read',
  );
  if (!ok) return false;

  // Now that a data permission exists, extend coverage to history (>30 days)
  // and background reads in a SEPARATE request. Swallow any rejection — these
  // are enhancements, not gates.
  try {
    await hc.requestPermission(HC_EXTRA_PERMISSIONS);
  } catch { /* history/background unavailable — degrade to 30-day foreground */ }

  return true;
}

async function syncAndroid(fullResync: boolean): Promise<HealthSyncBatch | 'unavailable'> {
  const hc = await requireHealthConnect();
  if (!hc) return 'unavailable';
  if (!(await hcRequestPermissions(hc))) return { activities: [], deletedIds: [], full: false };

  const weightKg = resolveWeightKg();
  let token = fullResync ? null : await AsyncStorage.getItem(HC_TOKEN_KEY);

  if (token) {
    // Incremental: drain the changes feed.
    const activities: Activity[] = [];
    const deletedIds: string[] = [];
    try {
      let hasMore = true;
      while (hasMore) {
        const res: any = await hc.getChanges({ changesToken: token });
        if (res.changesTokenExpired) {
          token = null; // fall through to full sync below
          break;
        }
        for (const c of res.upsertionChanges ?? []) {
          if (c.record) activities.push(mapHCSession(c.record, weightKg));
        }
        for (const c of res.deletionChanges ?? []) deletedIds.push(HC_PREFIX + c.recordId);
        token = res.nextChangesToken;
        hasMore = !!res.hasMore;
      }
      if (token) {
        await AsyncStorage.setItem(HC_TOKEN_KEY, token);
        return { activities, deletedIds, full: false };
      }
    } catch {
      token = null; // treat as expired → full sync
    }
  }

  // Full history: paged session reads from the epoch.
  const records: any[] = [];
  let pageToken: string | undefined;
  do {
    const res = await hc.readRecords('ExerciseSession', {
      timeRangeFilter: {
        operator: 'between',
        startTime: new Date(0).toISOString(),
        endTime: new Date().toISOString(),
      },
      pageSize: 1000,
      pageToken,
    });
    records.push(...(res.records ?? []));
    pageToken = res.pageToken || undefined;
  } while (pageToken);

  // Mint a fresh changes token so the next sync is incremental.
  try {
    const seed = await hc.getChanges({ recordTypes: ['ExerciseSession'] });
    if (seed?.nextChangesToken) await AsyncStorage.setItem(HC_TOKEN_KEY, seed.nextChangesToken);
  } catch {
    await AsyncStorage.removeItem(HC_TOKEN_KEY);
  }

  return {
    activities: records.map((r) => mapHCSession(r, weightKg)),
    deletedIds: [],
    full: true,
  };
}

async function hcSessionMetrics(
  hc: any,
  a: Activity,
): Promise<Partial<Activity>> {
  const window = {
    operator: 'between',
    startTime: a.startDate,
    endTime: new Date(new Date(a.startDate).getTime() + a.elapsedTime * 1000).toISOString(),
  };
  const patch: Partial<Activity> = {};
  try {
    const hr = await hc.readRecords('HeartRate', { timeRangeFilter: window });
    const samples: HrSample[] = (hr.records ?? []).flatMap((rec: any) =>
      (rec.samples ?? []).map((s: any) => ({
        bpm: s.beatsPerMinute,
        startMs: new Date(s.time).getTime(),
        endMs: new Date(s.time).getTime(),
      })),
    );
    const stats = hrStatsFromSamples(samples);
    if (stats.avg) patch.averageHeartRate = stats.avg;
    if (stats.max) patch.maxHeartRate = stats.max;
  } catch { /* HR permission denied or no data */ }
  try {
    const dist = await hc.aggregateRecord({ recordType: 'Distance', timeRangeFilter: window });
    const meters = dist?.DISTANCE?.inMeters ?? dist?.DISTANCE_TOTAL?.inMeters;
    if (meters > 0) {
      patch.distance = meters;
      patch.averageSpeed = a.movingTime > 0 ? meters / a.movingTime : 0;
      patch.steps = deriveSteps({ type: a.type, movingTime: a.movingTime, distance: meters });
    }
  } catch { /* no distance data */ }
  try {
    const cal = await hc.aggregateRecord({ recordType: 'TotalCaloriesBurned', timeRangeFilter: window });
    const kcal = cal?.ENERGY_TOTAL?.inKilocalories ?? cal?.TOTAL_CALORIES_BURNED?.inKilocalories;
    if (kcal > 0) {
      patch.calories = Math.round(kcal);
      patch.caloriesEstimated = undefined;
    }
  } catch { /* no calorie data */ }
  return patch;
}

// ── Progressive enrichment (HR for old history, routes for recent) ──────────

let backfillRunning = false;
const backfillAttempted = new Set<string>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Nibble through health activities that still lack HR (and on Android,
 * distance/calories), newest first, persisting each batch. Re-entrant safe;
 * resumes from the store on every launch until the full history is covered.
 */
export async function backfillHealthEnrichment(): Promise<number> {
  if (backfillRunning) return 0;
  backfillRunning = true;
  let enriched = 0;
  try {
    const hk = Platform.OS === 'ios' ? requireHealthKit() : null;
    const hc = Platform.OS === 'android' ? await requireHealthConnect() : null;
    if (!hk && !hc) return 0;

    while (true) {
      const missing = useStore
        .getState()
        .activities.filter(
          (a) =>
            isHealthActivityId(a.id) &&
            a.averageHeartRate === undefined &&
            !backfillAttempted.has(a.id),
        )
        .slice(0, BACKFILL_BATCH);
      if (!missing.length) break;

      const patched: Activity[] = [];
      for (const a of missing) {
        backfillAttempted.add(a.id);
        if (hk) {
          const proxy = await hkWorkoutByUuid(hk, a.id.slice(HK_PREFIX.length));
          if (!proxy) continue;
          const stats = await hkWorkoutStats(proxy);
          if (stats.avg || stats.max) {
            patched.push({ ...a, averageHeartRate: stats.avg, maxHeartRate: stats.max });
          }
        } else if (hc) {
          const patch = await hcSessionMetrics(hc, a);
          if (Object.keys(patch).length) patched.push({ ...a, ...patch });
        }
      }
      if (patched.length) {
        useStore.getState().upsertActivities(patched);
        enriched += patched.length;
      }
      await sleep(250); // yield between batches — keep the JS thread breathing
    }
  } finally {
    backfillRunning = false;
  }
  return enriched;
}

const OUTDOOR_TYPES = new Set(['Run', 'TrailRun', 'Ride', 'Walk', 'Hike', 'Swim', 'Rowing', 'NordicSki', 'AlpineSki', 'Canoeing']);
const routeAttempted = new Set<string>();

/** Fetch + encode routes for the newest GPS workouts missing a polyline. */
export async function backfillRecentRoutes(): Promise<number> {
  const candidates = useStore
    .getState()
    .activities.filter(
      (a) =>
        isHealthActivityId(a.id) &&
        !a.polyline &&
        !a.trainer &&
        OUTDOOR_TYPES.has(a.type) &&
        !routeAttempted.has(a.id),
    )
    .slice(0, ROUTE_BACKFILL);
  if (!candidates.length) return 0;

  const patched: Activity[] = [];
  for (const a of candidates) {
    routeAttempted.add(a.id);
    const detail = await fetchRouteOnly(a);
    if (!detail?.length) continue;
    const patch: Activity = {
      ...a,
      polyline: encodePolyline(detail),
      startLatlng: [detail[0].latitude, detail[0].longitude],
    };
    if (!a.totalElevationGain) patch.totalElevationGain = elevationGainFromRoute(detail);
    patched.push(patch);
  }
  if (patched.length) useStore.getState().upsertActivities(patched);
  return patched.length;
}

async function fetchRouteOnly(a: Activity): Promise<RoutePoint[] | null> {
  try {
    if (a.id.startsWith(HK_PREFIX)) {
      const hk = requireHealthKit();
      if (!hk) return null;
      const proxy = await hkWorkoutByUuid(hk, a.id.slice(HK_PREFIX.length));
      if (!proxy?.getWorkoutRoutes) return null;
      return hkRouteToPoints(await proxy.getWorkoutRoutes());
    }
    const hc = await requireHealthConnect();
    if (!hc) return null;
    const rec = await hc.readRecord('ExerciseSession', a.id.slice(HC_PREFIX.length));
    const route = rec?.exerciseRoute?.route ?? [];
    return route
      .map((l: any) => ({
        latitude: l.latitude,
        longitude: l.longitude,
        altitude: routeAltitude(l.altitude),
        timeMs: new Date(l.time).getTime(),
      }))
      .sort((x: RoutePoint, y: RoutePoint) => x.timeMs - y.timeMs);
  } catch {
    return null;
  }
}

// ── Detail (ActivityDetailScreen's per-source loader calls this) ────────────

export interface HealthWorkoutDetail {
  hrSamples: HrSample[];
  route: RoutePoint[];
  polyline?: string;
  calories?: number;
  deviceName?: string;
  /** Steps during the workout window (statistics query — source-deduped). */
  steps?: number;
}

async function fetchDetailIOS(uuid: string): Promise<HealthWorkoutDetail | null> {
  const hk = requireHealthKit();
  if (!hk) return null;
  const proxy = await hkWorkoutByUuid(hk, uuid);
  if (!proxy) return null;

  let hrSamples: HrSample[] = [];
  try {
    const samples = await hk.queryQuantitySamples('HKQuantityTypeIdentifierHeartRate', {
      limit: 0,
      ascending: true,
      filter: { date: { startDate: new Date(proxy.startDate), endDate: new Date(proxy.endDate) } },
    });
    hrSamples = (samples ?? []).map((s: any) => ({
      bpm: s.quantity,
      startMs: new Date(s.startDate).getTime(),
      endMs: new Date(s.endDate).getTime(),
    }));
  } catch { /* no HR permission or data */ }

  let route: RoutePoint[] = [];
  try {
    route = hkRouteToPoints(await proxy.getWorkoutRoutes());
  } catch { /* no route */ }

  let steps: number | undefined;
  try {
    // A statistics query (not raw samples) — HealthKit dedupes the
    // Watch+iPhone overlap that would double-count steps.
    const stat = await hk.queryStatisticsForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], {
      filter: { date: { startDate: new Date(proxy.startDate), endDate: new Date(proxy.endDate) } },
    });
    const v = stat?.sumQuantity?.quantity;
    steps = v ? Math.round(v) : undefined;
  } catch { /* no steps permission or data */ }

  return {
    hrSamples,
    route,
    polyline: route.length ? encodePolyline(route) : undefined,
    calories: toKcal(proxy.totalEnergyBurned),
    deviceName: proxy.sourceRevision?.source?.name,
    steps,
  };
}

async function fetchDetailAndroid(recordId: string): Promise<HealthWorkoutDetail | null> {
  const hc = await requireHealthConnect();
  if (!hc) return null;
  let rec: any;
  try {
    rec = await hc.readRecord('ExerciseSession', recordId);
  } catch {
    return null;
  }
  const window = {
    operator: 'between',
    startTime: rec.startTime,
    endTime: rec.endTime,
  };
  let hrSamples: HrSample[] = [];
  try {
    const hr = await hc.readRecords('HeartRate', { timeRangeFilter: window });
    hrSamples = (hr.records ?? [])
      .flatMap((r: any) =>
        (r.samples ?? []).map((s: any) => ({
          bpm: s.beatsPerMinute,
          startMs: new Date(s.time).getTime(),
          endMs: new Date(s.time).getTime(),
        })),
      )
      .sort((a: HrSample, b: HrSample) => a.startMs - b.startMs);
  } catch { /* no HR */ }

  const route: RoutePoint[] = (rec.exerciseRoute?.route ?? [])
    .map((l: any) => ({
      latitude: l.latitude,
      longitude: l.longitude,
      altitude: routeAltitude(l.altitude),
      timeMs: new Date(l.time).getTime(),
    }))
    .sort((a: RoutePoint, b: RoutePoint) => a.timeMs - b.timeMs);

  let steps: number | undefined;
  try {
    const agg = await hc.aggregateRecord({ recordType: 'Steps', timeRangeFilter: window });
    if (agg?.COUNT_TOTAL > 0) steps = agg.COUNT_TOTAL;
  } catch { /* no steps data */ }

  return {
    hrSamples,
    route,
    polyline: route.length ? encodePolyline(route) : undefined,
    deviceName: rec.metadata?.dataOrigin,
    steps,
  };
}

// ── Daily Watch/Fitness rollups (recovery + activity rings) ──────────────────

const DAILY_WINDOW_DAYS = 30;

/** Fold per-day numbers into the dailyHealth map under one field. */
export function foldDaily(
  into: Record<string, DailyHealthEntry>,
  field: keyof DailyHealthEntry,
  byDay: Record<string, number>,
): Record<string, DailyHealthEntry> {
  for (const [day, value] of Object.entries(byDay)) {
    if (!Number.isFinite(value)) continue;
    into[day] = { ...into[day], [field]: value };
  }
  return into;
}

/** Average instantaneous records (time + value) per local day. */
export function averageByDay(records: Array<{ time: string | Date; value: number }>): Record<string, number> {
  const sums: Record<string, { total: number; n: number }> = {};
  for (const r of records) {
    if (!Number.isFinite(r.value)) continue;
    const day = localDateStr(new Date(r.time));
    const s = (sums[day] ??= { total: 0, n: 0 });
    s.total += r.value;
    s.n += 1;
  }
  return Object.fromEntries(
    Object.entries(sums).map(([day, s]) => [day, Math.round((s.total / s.n) * 10) / 10]),
  );
}

async function hkDailyStats(
  hk: any,
  identifier: string,
  statistics: string[],
  pick: (r: any) => number | undefined,
): Promise<Record<string, number>> {
  try {
    const anchor = new Date();
    anchor.setHours(0, 0, 0, 0);
    const start = new Date(anchor.getTime() - DAILY_WINDOW_DAYS * 86400000);
    const rows = await hk.queryStatisticsCollectionForQuantity(
      identifier,
      statistics,
      anchor,
      { day: 1 },
      { filter: { date: { startDate: start, endDate: new Date() } } },
    );
    const byDay: Record<string, number> = {};
    for (const r of rows ?? []) {
      const v = pick(r);
      if (v === undefined || !Number.isFinite(v) || !r.startDate) continue;
      byDay[localDateStr(new Date(r.startDate))] = v;
    }
    return byDay;
  } catch {
    return {};
  }
}

async function syncDailyHealthIOS(): Promise<void> {
  const hk = requireHealthKit();
  if (!hk) return;
  const sum = (r: any) => (r.sumQuantity?.quantity != null ? Math.round(r.sumQuantity.quantity) : undefined);
  const avg = (r: any) => (r.averageQuantity?.quantity != null ? Math.round(r.averageQuantity.quantity * 10) / 10 : undefined);
  const recent = (r: any) => (r.mostRecentQuantity?.quantity != null ? Math.round(r.mostRecentQuantity.quantity * 10) / 10 : undefined);

  const [restingHR, hrv, vo2max, activeEnergy, exerciseMin, steps] = await Promise.all([
    hkDailyStats(hk, 'HKQuantityTypeIdentifierRestingHeartRate', ['discreteAverage'], avg),
    hkDailyStats(hk, 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', ['discreteAverage'], avg),
    hkDailyStats(hk, 'HKQuantityTypeIdentifierVO2Max', ['mostRecent'], recent),
    hkDailyStats(hk, 'HKQuantityTypeIdentifierActiveEnergyBurned', ['cumulativeSum'], sum),
    hkDailyStats(hk, 'HKQuantityTypeIdentifierAppleExerciseTime', ['cumulativeSum'], sum),
    hkDailyStats(hk, 'HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], sum),
  ]);

  const days: Record<string, DailyHealthEntry> = {};
  foldDaily(days, 'restingHR', restingHR);
  foldDaily(days, 'hrv', hrv);
  foldDaily(days, 'vo2max', vo2max);
  foldDaily(days, 'activeEnergy', activeEnergy);
  foldDaily(days, 'exerciseMin', exerciseMin);
  foldDaily(days, 'steps', steps);
  if (Object.keys(days).length) useStore.getState().mergeDailyHealth(days);
}

async function syncDailyHealthAndroid(): Promise<void> {
  const hc = await requireHealthConnect();
  if (!hc) return;
  const now = new Date();
  const start = new Date(now.getTime() - DAILY_WINDOW_DAYS * 86400000);
  const timeRangeFilter = { operator: 'between', startTime: start.toISOString(), endTime: now.toISOString() };
  const slicer = { period: 'DAYS', length: 1 };

  const days: Record<string, DailyHealthEntry> = {};

  try {
    const groups = await hc.aggregateGroupByPeriod({ recordType: 'ActiveCaloriesBurned', timeRangeFilter, timeRangeSlicer: slicer });
    const byDay: Record<string, number> = {};
    for (const g of groups ?? []) {
      const kcal = g.result?.ACTIVE_CALORIES_TOTAL?.inKilocalories;
      if (kcal > 0) byDay[localDateStr(new Date(g.startTime))] = Math.round(kcal);
    }
    foldDaily(days, 'activeEnergy', byDay);
  } catch { /* permission denied or no data */ }

  try {
    const groups = await hc.aggregateGroupByPeriod({ recordType: 'Steps', timeRangeFilter, timeRangeSlicer: slicer });
    const byDay: Record<string, number> = {};
    for (const g of groups ?? []) {
      if (g.result?.COUNT_TOTAL > 0) byDay[localDateStr(new Date(g.startTime))] = g.result.COUNT_TOTAL;
    }
    foldDaily(days, 'steps', byDay);
  } catch { /* no data */ }

  try {
    const res = await hc.readRecords('RestingHeartRate', { timeRangeFilter });
    foldDaily(days, 'restingHR', averageByDay((res.records ?? []).map((r: any) => ({ time: r.time, value: r.beatsPerMinute }))));
  } catch { /* no data */ }

  try {
    const res = await hc.readRecords('HeartRateVariabilityRmssd', { timeRangeFilter });
    foldDaily(days, 'hrv', averageByDay((res.records ?? []).map((r: any) => ({ time: r.time, value: r.heartRateVariabilityMillis }))));
  } catch { /* no data */ }

  try {
    const res = await hc.readRecords('Vo2Max', { timeRangeFilter });
    foldDaily(days, 'vo2max', averageByDay((res.records ?? []).map((r: any) => ({ time: r.time, value: r.vo2MillilitersPerMinuteKilogram }))));
  } catch { /* no data */ }

  if (Object.keys(days).length) useStore.getState().mergeDailyHealth(days);
}

/**
 * Pull the last 30 days of recovery/activity rollups into store.dailyHealth.
 * Callers gate on the health source being active — never triggers a
 * permission sheet for Strava-source users.
 */
export async function syncDailyHealth(): Promise<void> {
  if (Platform.OS === 'ios') return syncDailyHealthIOS();
  if (Platform.OS === 'android') return syncDailyHealthAndroid();
}

// ── Public service ───────────────────────────────────────────────────────────

export interface HealthSyncBatch {
  activities: Activity[];
  deletedIds: string[];
  full: boolean;
}

export const HealthActivities = {
  /** Native module present AND the platform health store exists. */
  isAvailable: async (): Promise<boolean> => {
    if (Platform.OS === 'ios') return requireHealthKit() !== null;
    if (Platform.OS === 'android') return (await requireHealthConnect()) !== null;
    return false;
  },

  /**
   * Show the platform permission sheet. HealthKit hides read denials (denied
   * reads just come back empty), so iOS resolves true once the sheet ran.
   */
  requestPermissions: async (): Promise<boolean> => {
    if (Platform.OS === 'ios') {
      const hk = requireHealthKit();
      if (!hk) return false;
      try {
        await hk.requestAuthorization({ toRead: HK_READ_TYPES });
        return true;
      } catch {
        return false;
      }
    }
    const hc = await requireHealthConnect();
    if (!hc) return false;
    return hcRequestPermissions(hc);
  },

  /**
   * Full workout history on first run (paged), source deltas afterwards.
   * Returns 'unavailable' when the native module is missing (old binary).
   */
  syncActivities: async (opts?: { fullResync?: boolean }): Promise<HealthSyncBatch | 'unavailable'> => {
    if (Platform.OS === 'ios') return syncIOS(!!opts?.fullResync);
    if (Platform.OS === 'android') return syncAndroid(!!opts?.fullResync);
    return 'unavailable';
  },

  /** HR samples + GPS route for one workout — the detail screen's loader. */
  fetchWorkoutDetail: async (activityId: string): Promise<HealthWorkoutDetail | null> => {
    if (activityId.startsWith(HK_PREFIX)) return fetchDetailIOS(activityId.slice(HK_PREFIX.length));
    if (activityId.startsWith(HC_PREFIX)) return fetchDetailAndroid(activityId.slice(HC_PREFIX.length));
    return null;
  },

  /**
   * iOS: persist workout observers so HealthKit wakes the app on new data
   * (needs the config plugin's background:true entitlement). The callback
   * should kick a forced sync. Returns the subscription remover, or null.
   */
  subscribeToWorkoutChanges: async (onChange: () => void): Promise<{ remove: () => void } | null> => {
    const hk = requireHealthKit();
    if (!hk) return null;
    try {
      // UpdateFrequency.hourly = 2 — workouts don't need immediate delivery.
      await (hk.configureBackgroundTypes?.(['HKWorkoutTypeIdentifier'], 2) ??
        hk.enableBackgroundDelivery?.('HKWorkoutTypeIdentifier', 2));
      return hk.subscribeToChanges('HKWorkoutTypeIdentifier', () => onChange());
    } catch {
      return null;
    }
  },

  /** Reset incremental cursors (source switch / full resync). */
  clearSyncCursor: async (): Promise<void> => {
    await AsyncStorage.removeItem(HK_ANCHOR_KEY);
    await AsyncStorage.removeItem(HC_TOKEN_KEY);
  },
};
