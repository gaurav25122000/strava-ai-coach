import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../constants/theme';
import { Zap } from 'lucide-react-native';
import Animated, { useAnimatedStyle, withTiming, withDelay } from 'react-native-reanimated';
import { useStore } from '../store/useStore';
import { SkeletonLoader } from './SkeletonLoader';

interface ProgressBarProps {
  label: string;
  current: number;
  total: number;
  unit: string;
  colorName: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ label, current, total, unit, colorName }) => {
  // @ts-ignore
  const color = theme.colors[colorName] || theme.colors.primaryOrange;
  const percentage = Math.min((current / total) * 100, 100);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      width: withDelay(300, withTiming(`${percentage}%`, { duration: 1000 })),
    };
  });

  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressValue}>
          <Text style={{ color: theme.colors.textPrimary }}>{current}</Text> / {total} {unit}
        </Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.bar, { backgroundColor: color }, animatedStyle]} />
      </View>
    </View>
  );
};

export const AIWorkoutRecommendation = () => {
  const aiRecommendation = useStore((state) => state.aiRecommendation);
  const isLoading = useStore((state) => state.isLoading);

  const activities = useStore((state) => state.activities);

  // Calculate this week's volume
  const thisWeekVolume = activities.filter(a => new Date(a.date) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).reduce((sum, a) => sum + a.distance, 0);

  // Calculate this week's longest run
  const thisWeekLongRun = activities.filter(a => new Date(a.date) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).reduce((max, a) => Math.max(max, a.distance), 0);

  if (isLoading || !aiRecommendation) {
     return (
        <View style={styles.container}>
            <SkeletonLoader height={24} style={{ marginBottom: 12 }} />
            <SkeletonLoader height={24} style={{ marginBottom: 24 }} />
            <SkeletonLoader height={100} borderRadius={theme.borderRadius.md} />
        </View>
     );
  }

  return (
    <View style={styles.container}>
      <ProgressBar
        label="Weekly volume"
        current={parseFloat(thisWeekVolume.toFixed(1))}
        total={aiRecommendation.targetVolume}
        unit="km"
        colorName="primaryRed"
      />

      <View style={{ height: theme.spacing.md }} />

      <ProgressBar
        label="Long run"
        current={parseFloat(thisWeekLongRun.toFixed(1))}
        total={aiRecommendation.targetLongRun}
        unit="km"
        colorName="primaryGreen"
      />

      <View style={styles.workoutBox}>
        <View style={styles.workoutHeader}>
          <Zap size={16} color="#FCD34D" fill="#FCD34D" />
          <Text style={styles.workoutLabel}>KEY WORKOUT THIS PHASE</Text>
        </View>
        <Text style={styles.workoutTitle}>{aiRecommendation.keyWorkoutTitle}</Text>
        <Text style={styles.workoutDesc}>{aiRecommendation.keyWorkoutDesc}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: theme.spacing.md,
  },
  progressContainer: {
    marginBottom: theme.spacing.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  progressLabel: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
  progressValue: {
    ...theme.typography.body,
    color: '#FCD34D', // Gold/yellowish color from screenshot for the target text
  },
  track: {
    height: 6,
    backgroundColor: theme.colors.skeletonBackground,
    borderRadius: theme.borderRadius.round,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: theme.borderRadius.round,
    width: '0%', // Starting width for animation
  },
  workoutBox: {
    backgroundColor: theme.colors.skeletonBackground, // Slightly lighter than card bg
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  workoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  workoutLabel: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    letterSpacing: 1,
    marginLeft: theme.spacing.xs,
  },
  workoutTitle: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    fontWeight: '500',
    marginBottom: 4,
  },
  workoutDesc: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  }
});
