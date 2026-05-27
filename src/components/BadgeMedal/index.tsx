import React, { useMemo } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { Typography } from '../Typography';
import { theme } from '../../theme';
import { Milestone } from '../../store/useStore';
import { medalStyles, sharedStyles } from './styles';

// Each milestone category gets its own metal-tone gradient so the dashboard
// communicates the achievement *type* at a glance: distance is warm gold,
// streak is fire orange, speed is electric cyan, elevation is mountain teal,
// frequency is purple amethyst.
const CATEGORY_GRADIENT: Record<Milestone['category'], [string, string, string]> = {
  distance:  ['#FCD34D', '#F59E0B', '#B45309'],
  streak:    ['#FB923C', '#F97316', '#9A3412'],
  speed:     ['#67E8F9', '#06B6D4', '#0E7490'],
  elevation: ['#5EEAD4', '#10B981', '#065F46'],
  frequency: ['#C4B5FD', '#8B5CF6', '#4C1D95'],
};

interface Props {
  milestone: Pick<Milestone, 'title' | 'description' | 'icon' | 'category' | 'earnedAt'> | {
    title: string;
    description: string;
    icon: string;
    category: Milestone['category'];
    earnedAt?: string | null;
  };
  /** Diameter of the medal in dp. Title + lock scale with it. */
  size?: number;
  /** When false, the medal renders desaturated with a lock overlay. */
  unlocked: boolean;
  /** Hide the title text below the medal — useful in dense grids. */
  hideLabel?: boolean;
  onPress?: () => void;
}

/**
 * Premium medal-style milestone badge. Locked badges fade + show a lock
 * overlay; unlocked badges show a gradient ring + the achievement date
 * (sourced from the activity that crossed the criterion, not install date).
 */
export function BadgeMedal({ milestone, size = 64, unlocked, hideLabel = false, onPress }: Props) {
  const styles = useMemo(() => medalStyles(size), [size]);
  const gradient = CATEGORY_GRADIENT[milestone.category];

  const dateLabel = unlocked && milestone.earnedAt
    ? format(parseISO(milestone.earnedAt), 'MMM yyyy')
    : 'Locked';

  const body = (
    <View style={styles.container}>
      <View>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.ring, !unlocked && sharedStyles.ringInactive]}
        >
          <View style={styles.innerDisc}>
            <Typography style={styles.glyph}>{milestone.icon}</Typography>
          </View>
        </LinearGradient>
        {!unlocked && (
          <View style={styles.lockOverlay}>
            <Lock size={Math.round(size * 0.32)} color="#fff" />
          </View>
        )}
      </View>

      {!hideLabel && (
        <>
          <Typography style={[styles.title, !unlocked && styles.titleLocked]} numberOfLines={2}>
            {milestone.title}
          </Typography>
          <Typography style={styles.date}>{dateLabel}</Typography>
        </>
      )}
    </View>
  );

  if (!onPress) return body;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      {body}
    </TouchableOpacity>
  );
}

// Convenience export for screens that need to compute category colour outside
// the component (e.g., for a tinted card background).
export function badgeCategoryAccent(category: Milestone['category']): string {
  return CATEGORY_GRADIENT[category][1];
}
