import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../constants/theme';
import { Flame, Play } from 'lucide-react-native'; // Play as a fallback for 'run'

interface GoalCardProps {
  name: string;
  date: string;
  targetDaysOut: number;
  colorName: string; // e.g. 'primaryRed'
  iconName: string; // e.g. 'flame'
}

export const GoalCard: React.FC<GoalCardProps> = ({
  name,
  date,
  targetDaysOut,
  colorName,
  iconName,
}) => {
  // @ts-ignore
  const iconColor = theme.colors[colorName] || theme.colors.primaryOrange;

  return (
    <View style={[styles.container, { borderTopColor: iconColor }]}>
      <View style={styles.leftContent}>
        {iconName === 'flame' ? (
          <Flame size={24} color={iconColor} fill={iconColor} />
        ) : (
          <Play size={24} color={iconColor} fill={iconColor} />
        )}
        <View style={styles.textContainer}>
          <Text style={[styles.name, { color: iconColor }]}>{name}</Text>
          <Text style={styles.date}>{date}</Text>
        </View>
      </View>

      <View style={styles.rightContent}>
        <Text style={[styles.daysOut, { color: iconColor }]}>{targetDaysOut}</Text>
        <Text style={styles.daysText}>days</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 2,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textContainer: {
    marginLeft: theme.spacing.sm,
  },
  name: {
    ...theme.typography.h3,
    marginBottom: 2,
  },
  date: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  rightContent: {
    alignItems: 'center',
  },
  daysOut: {
    ...theme.typography.h2,
    lineHeight: 28,
  },
  daysText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  }
});
