import React, { useState } from 'react';
import { ScrollView, StyleSheet, View, Text, TouchableOpacity, RefreshControl, Modal, TextInput } from 'react-native';
import { theme } from '../constants/theme';
import { Header } from '../components/Header';
import { AIWorkoutRecommendation } from '../components/AIWorkoutRecommendation';
import { useStore } from '../store/useStore';
import { Flame, Play, Plus } from 'lucide-react-native';

export const GoalsScreen = () => {
  const { goals, fetchDataAndGeneratePlan, aiRecommendation } = useStore();
  const activeGoal = goals[0]; // Just showing the first one detailed for mock purposes
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalDate, setNewGoalDate] = useState('Oct 31, 2026'); // Mock default date format for MVP
  const [newGoalType, setNewGoalType] = useState('race');

  const handleAddGoal = () => {
    if (!newGoalName) return;
    useStore.getState().addGoal({
      name: newGoalName,
      date: newGoalDate,
      type: newGoalType,
      color: 'primaryBlue',
      icon: 'run'
    });
    setModalVisible(false);
    setNewGoalName('');
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDataAndGeneratePlan();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <Header title="Training Goals" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primaryOrange} // iOS
              colors={[theme.colors.primaryOrange]} // Android
            />
          }
      >
        <Text style={styles.subtitle}>Pick your race, get phase-by-phase training guidance.</Text>

        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
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
                <Text style={styles.phaseValue}>{aiRecommendation?.phaseName || 'Specific'}</Text>
                <Text style={styles.phaseDesc}>{aiRecommendation?.phaseDesc || 'Progressive overload. Add intensity weekly.'}</Text>
              </View>
            </View>

            <AIWorkoutRecommendation />

            <View style={styles.prehabSection}>
              <Text style={styles.sectionTitle}>Prehab & Recovery</Text>
              <Text style={styles.subtitleText}>Log minor aches so AI can adjust your high-impact days.</Text>
              <TouchableOpacity style={styles.logInjuryButton} onPress={() => {}}>
                <Text style={styles.logInjuryText}>+ Log Injury / Ache</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Goal</Text>

            <Text style={styles.label}>Goal Name</Text>
            <TextInput
              style={styles.input}
              value={newGoalName}
              onChangeText={setNewGoalName}
              placeholder="e.g. Berlin Marathon"
              placeholderTextColor={theme.colors.tabInactive}
            />

            <Text style={styles.label}>Target Date</Text>
            <TextInput
              style={styles.input}
              value={newGoalDate}
              onChangeText={setNewGoalDate}
              placeholder="e.g. Sep 27, 2026"
              placeholderTextColor={theme.colors.tabInactive}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleAddGoal}>
                <Text style={styles.saveButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  },
  prehabSection: {
    marginTop: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  sectionTitle: {
    ...theme.typography.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  subtitleText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  logInjuryButton: {
    backgroundColor: theme.colors.skeletonBackground,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
  },
  logInjuryText: {
    ...theme.typography.body,
    color: theme.colors.primaryOrange,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: theme.spacing.md,
  },
  modalContent: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
  },
  modalTitle: {
    ...theme.typography.h2,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.lg,
  },
  label: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  input: {
    backgroundColor: theme.colors.background,
    color: theme.colors.textPrimary,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.typography.body,
    marginBottom: theme.spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: theme.spacing.md,
    gap: theme.spacing.md,
  },
  modalButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.sm,
  },
  cancelButton: {
    backgroundColor: theme.colors.skeletonBackground,
  },
  saveButton: {
    backgroundColor: theme.colors.primaryOrange,
  },
  cancelButtonText: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
  },
  saveButtonText: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    fontWeight: 'bold',
  }
});