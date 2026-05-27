import React from 'react';
import {
  Activity,
  Coffee,
  Dumbbell,
  Moon,
  Mountain,
  PersonStanding,
  Wind,
  Zap as ZapIcon,
} from 'lucide-react-native';
import { WorkoutKind, RestKind } from '../store/useStore';

// Mon=0..Sun=6 single-letter day labels for the week strip.
export const DAY_LABELS: ReadonlyArray<string> = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Hex colour ramp per workout kind. Drives the day-chip dot, the active-border
// on today's chip, the RPE pill in the day-detail sheet, and the "Mark Done"
// CTA, so the whole UI keeps a consistent visual mapping.
export const WORKOUT_COLORS: Record<WorkoutKind, string> = {
  EASY:      '#10B981',
  TEMPO:     '#F59E0B',
  INTERVALS: '#EF4444',
  LONG:      '#F97316',
  RECOVERY:  '#60A5FA',
  CROSS:     '#8B5CF6',
  STRENGTH:  '#EC4899',
  REST:      '#64748B',
};

export const WORKOUT_LABELS: Record<WorkoutKind, string> = {
  EASY:      'Easy',
  TEMPO:     'Tempo',
  INTERVALS: 'Intervals',
  LONG:      'Long',
  RECOVERY:  'Recovery',
  CROSS:     'Cross',
  STRENGTH:  'Strength',
  REST:      'Rest',
};

export const REST_LABELS: Record<RestKind, string> = {
  COMPLETE:    'Complete rest',
  ACTIVE_WALK: 'Easy walk',
  MOBILITY:    'Mobility / yoga',
  CROSS_LOW:   'Low cross-train',
};

// Lucide icon for a given workout kind. Centralised so the day chip, the
// day-detail header badge, and future renderers (notifications, overview hero)
// share one source of truth.
export function workoutIcon(kind: WorkoutKind, size = 12, color = '#fff') {
  switch (kind) {
    case 'LONG':      return <Mountain size={size} color={color} />;
    case 'INTERVALS': return <ZapIcon size={size} color={color} />;
    case 'TEMPO':     return <Wind size={size} color={color} />;
    case 'STRENGTH':  return <Dumbbell size={size} color={color} />;
    case 'CROSS':     return <Activity size={size} color={color} />;
    case 'RECOVERY':  return <Coffee size={size} color={color} />;
    case 'REST':      return <Moon size={size} color={color} />;
    default:          return <PersonStanding size={size} color={color} />;
  }
}
