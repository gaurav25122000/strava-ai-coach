import React from 'react';
import { TodayHeroWidget } from './TodayHero';
import { HeroBannerWidget } from './HeroBanner';
import { CoachInsightWidget } from './CoachInsight';
import { WeeklyDigestWidget } from './WeeklyDigest';
import { ActiveGoalsWidget } from './ActiveGoals';
import { InjuryAlertWidget } from './InjuryAlert';
import { TrainingLoadWidget } from './TrainingLoad';
import { WeeklyGoalTrackerWidget } from './WeeklyGoalTracker';
import { ThisWeekWidget } from './ThisWeek';
import { ActivityMapWidget } from './ActivityMap';
import { RecentActivitiesWidget } from './RecentActivities';
import { MonthlyVolumeWidget } from './MonthlyVolume';
import { ActivityMixWidget } from './ActivityMix';
import { YearToDateWidget } from './YearToDate';
import { AllTimeStatsWidget } from './AllTimeStats';
import { ShoeTrackerWidget } from './ShoeTracker';
import { StreakGuardWidget } from './StreakGuard';
import { WeeklyRecapWidget } from './WeeklyRecap';
import { PRProximityWidget } from './PRProximity';
import { RestBalanceWidget } from './RestBalance';
import { ActiveHoursWidget } from './ActiveHours';
import { TrainerRatioWidget } from './TrainerRatio';
import { HeartRateWidget } from './HeartRate';
import { IntensityDistributionWidget } from './IntensityDistribution';
import { CadenceWidget } from './Cadence';
import { PowerZonesWidget } from './PowerZones';
import { EnergyExpenditureWidget } from './EnergyExpenditure';
import { PaceTrendWidget } from './PaceTrend';
import { PersonalBestsWidget } from './PersonalBests';
import { RacePredictorWidget } from './RacePredictor';
import { BadgesWidget } from './Badges';
import { NextBadgeWidget } from './NextBadge';
import { StarredSegmentsWidget } from './StarredSegments';
import { PhotoStreamWidget } from './PhotoStream';

/**
 * id → component for every dashboard widget. Keys MUST mirror
 * WIDGET_FAMILY/WIDGET_TITLES in src/utils/widgetFamilies.ts — the registry
 * test asserts the three never drift.
 */
export const WIDGET_REGISTRY: Record<string, React.ComponentType> = {
  TodayHero: TodayHeroWidget,
  HeroBanner: HeroBannerWidget,
  CoachInsight: CoachInsightWidget,
  WeeklyDigest: WeeklyDigestWidget,
  ActiveGoals: ActiveGoalsWidget,
  InjuryAlert: InjuryAlertWidget,
  TrainingLoad: TrainingLoadWidget,
  WeeklyGoalTracker: WeeklyGoalTrackerWidget,
  ThisWeek: ThisWeekWidget,
  ActivityMap: ActivityMapWidget,
  RecentActivities: RecentActivitiesWidget,
  MonthlyVolume: MonthlyVolumeWidget,
  ActivityMix: ActivityMixWidget,
  YearToDate: YearToDateWidget,
  AllTimeStats: AllTimeStatsWidget,
  ShoeTracker: ShoeTrackerWidget,
  StreakGuard: StreakGuardWidget,
  WeeklyRecap: WeeklyRecapWidget,
  PRProximity: PRProximityWidget,
  RestBalance: RestBalanceWidget,
  ActiveHours: ActiveHoursWidget,
  TrainerRatio: TrainerRatioWidget,
  HeartRate: HeartRateWidget,
  IntensityDistribution: IntensityDistributionWidget,
  Cadence: CadenceWidget,
  PowerZones: PowerZonesWidget,
  EnergyExpenditure: EnergyExpenditureWidget,
  PaceTrend: PaceTrendWidget,
  PersonalBests: PersonalBestsWidget,
  RacePredictor: RacePredictorWidget,
  Badges: BadgesWidget,
  NextBadge: NextBadgeWidget,
  StarredSegments: StarredSegmentsWidget,
  PhotoStream: PhotoStreamWidget,
};
