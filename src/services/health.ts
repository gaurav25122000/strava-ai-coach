import { Platform } from 'react-native';
import { localDateStr } from '../utils/dates';

// ── Native sleep import (HealthKit / Health Connect) ────────────────────────
//
// Both packages are native modules that do NOT exist in older installed
// binaries — OTA updates ship this JS to apps built before the modules were
// added. Every native touchpoint is therefore lazy-required inside the
// function and fenced with try/catch (same pattern as expo-image-picker in
// AddFoodScreen): a missing module degrades to 'unavailable' instead of
// crashing at bundle import time.

export type SleepImport = { day: string; hours: number };

const HOUR_MS = 3600000;

/** HKCategoryValueSleepAnalysis values that count as actually asleep:
 *  1 asleepUnspecified, 3 core, 4 deep, 5 REM. 0 (inBed) and 2 (awake)
 *  are explicitly not sleep. */
const HK_ASLEEP_VALUES = new Set([1, 3, 4, 5]);

/**
 * Reads last night's sleep (18:00 yesterday → noon today, local wall clock)
 * from HealthKit (iOS) or Health Connect (Android).
 *
 * Returns:
 *  - { day, hours }  on success — day is today's local YYYY-MM-DD
 *  - 'unavailable'   when the native module is missing / throws at require
 *                    or init (old binary, or no health store on the device)
 *  - null            when permission was denied or no sleep data was found
 */
export async function importLastNightSleep(): Promise<SleepImport | 'unavailable' | null> {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 1);
  start.setHours(18, 0, 0, 0);
  const end = new Date(now);
  end.setHours(12, 0, 0, 0);
  const day = localDateStr(now);

  if (Platform.OS === 'ios') return importFromHealthKit(start, end, day);
  if (Platform.OS === 'android') return importFromHealthConnect(start, end, day);
  return 'unavailable';
}

/** Sum [startMs, endMs) intervals with overlaps merged — Watch and iPhone
 *  often both record the same night, and naive summing double-counts. */
function sumMergedMs(intervals: Array<[number, number]>): number {
  const sorted = intervals.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  if (sorted.length === 0) return 0;
  let total = 0;
  let [curStart, curEnd] = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    if (s <= curEnd) {
      curEnd = Math.max(curEnd, e);
    } else {
      total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    }
  }
  return total + (curEnd - curStart);
}

function toHours(ms: number): number {
  return Math.round((ms / HOUR_MS) * 10) / 10;
}

async function importFromHealthKit(
  start: Date,
  end: Date,
  day: string,
): Promise<SleepImport | 'unavailable' | null> {
  let hk: any;
  try {
    hk = require('@kingstinct/react-native-healthkit');
    if (!hk.isHealthDataAvailable()) return 'unavailable';
  } catch {
    return 'unavailable';
  }
  try {
    await hk.requestAuthorization({ toRead: ['HKCategoryTypeIdentifierSleepAnalysis'] });
    const samples = await hk.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
      limit: 0, // non-positive = all samples in range
      ascending: true,
      filter: { date: { startDate: start, endDate: end } },
    });
    const asleep: Array<[number, number]> = [];
    for (const s of samples ?? []) {
      if (!HK_ASLEEP_VALUES.has(s.value)) continue;
      asleep.push([new Date(s.startDate).getTime(), new Date(s.endDate).getTime()]);
    }
    const hours = toHours(sumMergedMs(asleep));
    // HealthKit hides read-permission denials — a denied read just comes back
    // empty, so "denied" and "no data" both land on null by design.
    return hours > 0 ? { day, hours } : null;
  } catch {
    // require() succeeded (pure JS) but the native HybridObject is absent in
    // this binary — same "needs new build" case as a failed require.
    return 'unavailable';
  }
}

async function importFromHealthConnect(
  start: Date,
  end: Date,
  day: string,
): Promise<SleepImport | 'unavailable' | null> {
  let hc: any;
  try {
    hc = require('react-native-health-connect');
    // false = Health Connect provider missing on this device.
    if (!(await hc.initialize())) return 'unavailable';
  } catch {
    return 'unavailable';
  }
  try {
    const granted = await hc.requestPermission([{ accessType: 'read', recordType: 'SleepSession' }]);
    const allowed = (granted ?? []).some(
      (p: any) => p.recordType === 'SleepSession' && p.accessType === 'read',
    );
    if (!allowed) return null;
    const res = await hc.readRecords('SleepSession', {
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    });
    const sessions: Array<[number, number]> = (res?.records ?? []).map((r: any) => [
      new Date(r.startTime).getTime(),
      new Date(r.endTime).getTime(),
    ]);
    const hours = toHours(sumMergedMs(sessions));
    return hours > 0 ? { day, hours } : null;
  } catch {
    // Initialize succeeded, so the module is present — treat post-init
    // failures (permission sheet dismissed, read rejected) as "no data".
    return null;
  }
}
