import { Platform } from 'react-native';
import { useStore } from '../store/useStore';

// The exclusive activity-source switch. Widgets and screens never check the
// source directly — they ask sourceCapabilities() so "what works without
// Strava" lives in exactly one place.

export type ActivitySource = 'strava' | 'health';

export function getActivitySource(): ActivitySource {
  return useStore.getState().settings.activitySource ?? 'strava';
}

/** Reactive variant for components. */
export function useActivitySource(): ActivitySource {
  return useStore((s) => s.settings.activitySource ?? 'strava');
}

/** What the health option is called on this platform. */
export function healthSourceLabel(): string {
  return Platform.OS === 'android' ? 'Health Connect' : 'Apple Health';
}

export function sourceLabel(source: ActivitySource = getActivitySource()): string {
  return source === 'health' ? healthSourceLabel() : 'Strava';
}

export interface SourceCapabilities {
  /** Starred segments + per-activity segment efforts. */
  segments: boolean;
  /** Activity photos. */
  photos: boolean;
  /** Kudos / comments / achievement counts. */
  kudos: boolean;
  /** Strava relative-effort (suffer score). */
  sufferScore: boolean;
  /** Power-zone buckets (needs Strava athlete zone definitions). */
  powerZones: boolean;
  /** Lifetime athlete stats + gear from the Strava athlete record. */
  athleteStats: boolean;
}

const STRAVA_CAPS: SourceCapabilities = {
  segments: true,
  photos: true,
  kudos: true,
  sufferScore: true,
  powerZones: true,
  athleteStats: true,
};

const HEALTH_CAPS: SourceCapabilities = {
  segments: false,
  photos: false,
  kudos: false,
  sufferScore: false,
  powerZones: false,
  athleteStats: false,
};

export function sourceCapabilities(source: ActivitySource = getActivitySource()): SourceCapabilities {
  return source === 'health' ? HEALTH_CAPS : STRAVA_CAPS;
}

/** Widgets that cannot render anything meaningful without Strava data. */
export const HEALTH_HIDDEN_WIDGETS = new Set(['StarredSegments', 'PhotoStream', 'PowerZones']);

/** Layout filter — hides Strava-only widgets while the health source is active. */
export function visibleWidgetIds(layout: string[], source: ActivitySource = getActivitySource()): string[] {
  if (source !== 'health') return layout;
  return layout.filter((id) => !HEALTH_HIDDEN_WIDGETS.has(id));
}
