import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../constants/theme';
import { Check } from 'lucide-react-native';

interface StreakCounterProps {
  currentStreak: number;
  bestStreak: number;
  lastRunDate: string;
  hasRunToday: boolean;
}

export const StreakCounter: React.FC<StreakCounterProps> = ({
  currentStreak,
  bestStreak,
  lastRunDate,
  hasRunToday,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        <View>
          <Text style={styles.label}>CURRENT STREAK</Text>
          <View style={styles.streakRow}>
            <Text style={styles.streakNumber}>{currentStreak}</Text>
            <Text style={styles.streakText}>days</Text>
          </View>
          {hasRunToday && (
            <View style={styles.statusRow}>
              <Check size={14} color={theme.colors.primaryGreen} />
              <Text style={styles.statusText}>Already ran today</Text>
            </View>
          )}
        </View>
        <View style={styles.shoeIconPlaceholder}>
           {/* Placeholder for shoe icon */}
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.bottomSection}>
        <View style={styles.statColumn}>
          <Text style={styles.label}>BEST STREAK</Text>
          <View style={styles.streakRowSmall}>
             <Text style={styles.bestStreakNumber}>{bestStreak}</Text>
             <Text style={styles.streakTextSmall}>days</Text>
          </View>
        </View>
        <View style={styles.statColumn}>
          <Text style={styles.label}>LAST RUN</Text>
          <Text style={styles.lastRunText}>{lastRunDate}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  topSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  label: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    letterSpacing: 1,
    marginBottom: theme.spacing.xs,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  streakNumber: {
    fontSize: 56,
    fontWeight: 'bold',
    color: theme.colors.primaryOrange,
    marginRight: theme.spacing.xs,
  },
  streakText: {
    ...theme.typography.h3,
    color: theme.colors.textSecondary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  statusText: {
    ...theme.typography.caption,
    color: theme.colors.primaryGreen,
    marginLeft: theme.spacing.xs,
  },
  shoeIconPlaceholder: {
    width: 60,
    height: 60,
    backgroundColor: theme.colors.skeletonBackground,
    borderRadius: theme.borderRadius.md,
    transform: [{ rotate: '-15deg' }],
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.md,
  },
  bottomSection: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: theme.spacing.xxl,
  },
  statColumn: {
    alignItems: 'flex-start',
  },
  streakRowSmall: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  bestStreakNumber: {
    ...theme.typography.h2,
    color: theme.colors.primaryPurple,
    marginRight: 4,
  },
  streakTextSmall: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  lastRunText: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
  },
});
