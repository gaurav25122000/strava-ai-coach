import { theme } from '../theme';

// A "family" is the visual grouping a widget belongs to. Every widget gets a
// family, so a glance across the dashboard tells the user *what kind* of
// information they're looking at — Activity volume vs Health (HR/zones) vs
// Progress (toward a goal) vs Records (PBs/badges) vs Plan (coach insight /
// upcoming workout) vs Recovery (TSB / wellness) vs Social (chat / shared).
export type WidgetFamily =
  | 'activity'
  | 'health'
  | 'progress'
  | 'records'
  | 'plan'
  | 'recovery'
  | 'social';

export interface FamilyStyle {
  accent: string;     // solid colour for icons, borders, top stroke
  tint: string;       // 12-14% alpha fill — card background tint
  gradient: [string, string];
  label: string;      // human-readable family name for headers
}

// Read-through helpers that proxy to `theme.colors.families` / `gradients`.
// Components import these instead of the raw theme so the family abstraction
// stays the single source of truth.
export function familyStyle(family: WidgetFamily): FamilyStyle {
  const fam = theme.colors.families[family];
  const grad = theme.colors.gradients[family] as [string, string];
  return { accent: fam.accent, tint: fam.tint, gradient: grad, label: fam.label };
}

// Widgets on the Overview screen, mapped to their families. New widgets MUST
// be added here so the Customise Widgets modal can group + colour them.
// 2026-06 curation: CurrentFocus + UpcomingWorkout folded into TodayHero,
// SufferTrend folded into TrainingLoad, WellnessScore + KudosLeaderboard +
// dead TodayBlock removed, NextBadge added.
export const WIDGET_FAMILY: Record<string, WidgetFamily> = {
  // Plan-driven
  TodayHero:         'plan',
  CoachInsight:      'plan',
  WeeklyDigest:      'plan',
  ActiveGoals:       'plan',
  // Recovery / wellness
  RecoveryAdvisor:   'recovery',
  InjuryAlert:       'recovery',
  TrainingLoad:      'recovery',
  // Volume / activity
  HeroBanner:        'activity',
  WeeklyGoalTracker: 'activity',
  ThisWeek:          'activity',
  ActivityMap:       'activity',
  RecentActivities:  'activity',
  MonthlyVolume:     'activity',
  ActivityMix:       'activity',
  YearToDate:        'activity',
  AllTimeStats:      'activity',
  ShoeTracker:       'activity',
  StreakGuard:       'activity',
  ActiveHours:       'activity',
  TrainerRatio:      'activity',
  // Health / physiology
  HeartRate:         'health',
  IntensityDistribution: 'health',
  Cadence:           'health',
  PowerZones:        'health',
  EnergyExpenditure: 'health',
  // Records / PBs
  PaceTrend:         'records',
  PersonalBests:     'records',
  RacePredictor:     'records',
  BestEfforts:       'records',
  Badges:            'records',
  NextBadge:         'records',
  StarredSegments:   'records',
  // Social
  PhotoStream:       'social',
};

/** Every renderable widget id — derived so it can never drift from the map. */
export const KNOWN_WIDGET_IDS = new Set(Object.keys(WIDGET_FAMILY));

/**
 * Widget ids removed or merged away; persisted layouts are migrated through
 * this map (null = drop, string = replace).
 */
export const RETIRED_WIDGETS: Record<string, string | null> = {
  TodayBlock: 'TodayHero',
  CurrentFocus: 'TodayHero',
  UpcomingWorkout: 'TodayHero',
  WellnessScore: null,
  SufferTrend: 'TrainingLoad',
  KudosLeaderboard: null,
  // v5 (2026-06): SportSplit folded into ActivityMix (count/km toggle);
  // StravaTotals folded into All-Time Stats (per-sport row from local data).
  SportSplit: 'ActivityMix',
  StravaTotals: 'AllTimeStats',
};

// The curated default dashboard for fresh installs (and the single source of
// truth — the store and OverviewScreen must NOT keep their own copies).
// Order = narrative: today's plan → this week → recovery → trends → records.
export const DEFAULT_WIDGET_LAYOUT: string[] = [
  'TodayHero',
  'HeroBanner',
  'StreakGuard',
  'WeeklyGoalTracker',
  'ThisWeek',
  'CoachInsight',
  'WeeklyDigest',
  'RecoveryAdvisor',
  'TrainingLoad',
  'IntensityDistribution',
  'PaceTrend',
  'ActivityMap',
  'RecentActivities',
  'MonthlyVolume',
  'ActiveHours',
  'HeartRate',
  'PersonalBests',
  'BestEfforts',
  'Badges',
  'NextBadge',
  'ActiveGoals',
  'YearToDate',
  'AllTimeStats',
  'ShoeTracker',
];

// Friendly category labels (used in the widget catalog modal headers).
export const WIDGET_GROUP_ORDER: WidgetFamily[] = [
  'plan', 'activity', 'health', 'recovery', 'records', 'progress', 'social',
];

// Insight chart tabs are also styled by family so the entire data surface
// shares one visual language.
export const INSIGHT_FAMILY: Record<string, WidgetFamily> = {
  steps:     'activity',
  time:      'activity',
  volume:    'activity',
  pace:      'records',
  heart:     'health',
  cadence:   'health',
  mix:       'activity',
  elevation: 'activity',
  calories:  'health',
  power:     'health',
};

// Human-readable titles for every Overview widget. Kept in the same module as
// WIDGET_FAMILY so the two stay in lock-step — adding a widget requires
// extending both maps.
export const WIDGET_TITLES: Record<string, string> = {
  TodayHero:             "Today's Workout",
  HeroBanner:            'Streaks & Totals',
  CoachInsight:          'Coach Insight',
  WeeklyDigest:          'AI Weekly Digest',
  RecoveryAdvisor:       'Recovery Advisor',
  InjuryAlert:           'Injury Alert',
  WeeklyGoalTracker:     'Weekly Goal Tracker',
  ThisWeek:              'This Week Stats',
  PaceTrend:             'Pace Trend (8 weeks)',
  Cadence:               'Cadence Tracker',
  IntensityDistribution: 'Intensity Distribution (80/20)',
  ShoeTracker:           'Shoe Health',
  ActivityMap:           'Activity Heatmap',
  RecentActivities:      'Recent Activities',
  MonthlyVolume:         'Monthly Volume',
  HeartRate:             'Heart Rate Stats',
  PersonalBests:         'Personal Bests',
  RacePredictor:         'Race Predictor',
  ActivityMix:           'Sport Mix',
  YearToDate:            'Year to Date',
  AllTimeStats:          'All-Time Stats',
  ActiveGoals:           'Active Goals List',
  TrainingLoad:          'Training Load (ATL/CTL)',
  BestEfforts:           'Best Efforts',
  Badges:                'Milestones & Badges',
  NextBadge:             'Next Badge',
  StarredSegments:       'Starred Segments',
  StreakGuard:           'Streak Guard',
  ActiveHours:           'Active Hours',
  TrainerRatio:          'Trainer vs Outdoor',
  PhotoStream:           'Recent Photos',
  PowerZones:            'Power Zones',
  EnergyExpenditure:     'Energy Expenditure (7d)',
};
