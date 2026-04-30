import React from 'react';
import { ScrollView, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { theme } from '../constants/theme';
import { Header } from '../components/Header';
import { AIWorkoutRecommendation } from '../components/AIWorkoutRecommendation';
import { useStore } from '../store/useStore';
import { Flame, Play, Plus } from 'lucide-react-native';

export const GoalsScreen = () => {
  const { goals } = useStore();
  const activeGoal = goals[0]; // Just showing the first one detailed for mock purposes

  return (
    <View style={styles.container}>
      <Header title="Training Goals" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.subtitle}>Pick your race, get phase-by-phase training guidance.</Text>

        <TouchableOpacity style={styles.addButton}>
          <Plus size={16} color={theme.colors.textPrimary} style={{ marginRight: 4 }} />
          <Text style={styles.addButtonText}>Add Goal</Text>
        </TouchableOpacity>

        {activeGoal && (
          <View style={[styles.goalDetailCard, { borderColor: (theme.colors as any)[activeGoal.color] || theme.colors.border }]}>
            <View style={styles.goalHeader}>
              <View style={styles.goalTitleRow}>
                {activeGoal.icon === 'flame' ? (
                  <Flame size={24} color={theme.colors.primaryRed} fill={theme.colors.primaryRed} />
                ) : (
                  <Play size={24} color={theme.colors.primaryGreen} fill={theme.colors.primaryGreen} />
                )}
                <View style={styles.goalTitleText}>
                  <Text style={[styles.goalName, { color: theme.colors.primaryRed }]}>{activeGoal.name}</Text>
                  <Text style={styles.goalDate}>{activeGoal.date}</Text>
                </View>
              </View>

              <View style={styles.goalActions}>
                <TouchableOpacity style={styles.actionButton}>
                  <Text style={styles.actionButtonText}>Edit</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.phaseInfoRow}>
              <View style={styles.daysOutBox}>
                <Text style={styles.daysOutLabel}>DAYS OUT</Text>
                <Text style={[styles.daysOutValue, { color: theme.colors.primaryRed }]}>{activeGoal.targetDaysOut}</Text>
                <Text style={styles.weeksText}>{Math.ceil(activeGoal.targetDaysOut / 7)} weeks</Text>
              </View>

              <View style={styles.phaseBox}>
                <Text style={styles.phaseLabel}>PHASE</Text>
                <Text style={styles.phaseValue}>Specific</Text>
                <Text style={styles.phaseDesc}>Progressive overload. Add intensity weekly.</Text>
              </View>
            </View>

            <AIWorkoutRecommendation />

          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  subtitle: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primaryOrange,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.round,
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.lg,
  },
  addButtonText: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    fontWeight: 'bold',
  },
  goalDetailCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.lg,
  },
  goalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  goalTitleText: {
    marginLeft: theme.spacing.sm,
  },
  goalName: {
    ...theme.typography.h2,
    marginBottom: 2,
  },
  goalDate: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  goalActions: {
    flexDirection: 'row',
  },
  actionButton: {
    backgroundColor: theme.colors.skeletonBackground,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.round,
  },
  actionButtonText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  phaseInfoRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  daysOutBox: {
    flex: 1,
  },
  daysOutLabel: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  daysOutValue: {
    fontSize: 40,
    fontWeight: 'bold',
    lineHeight: 48,
  },
  weeksText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  phaseBox: {
    flex: 1.5,
    backgroundColor: theme.colors.skeletonBackground,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  phaseLabel: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  phaseValue: {
    ...theme.typography.body,
    color: theme.colors.primaryBlue,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  phaseDesc: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    fontSize: 12,
  }
});
