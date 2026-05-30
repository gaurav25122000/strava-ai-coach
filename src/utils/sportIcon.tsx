import React from 'react';
import {
  Footprints,
  Bike,
  PersonStanding,
  Dumbbell,
  Activity as ActivityIcon,
} from 'lucide-react-native';

// Shared sport-icon mapping used by ActivitiesScreen rows + ActivityDetailScreen
// hero. Keeping this in one place so any new sport type only changes here.
export type SportType = 'Run' | 'Ride' | 'Walk' | 'Workout' | string;

export function sportIcon(type: SportType, size = 16, color = '#fff') {
  switch (type) {
    case 'Run':     return <Footprints size={size} color={color} />;
    case 'Ride':    return <Bike size={size} color={color} />;
    case 'Walk':    return <PersonStanding size={size} color={color} />;
    case 'Workout': return <Dumbbell size={size} color={color} />;
    default:        return <ActivityIcon size={size} color={color} />;
  }
}

// Human-readable sport label (currently identity, but funneled through this
// helper so future renames or i18n only touch one spot).
export function sportLabel(type: SportType): string {
  return type;
}
