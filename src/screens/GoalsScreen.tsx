import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { Typography } from '../components/Typography';
import { ProgressBar } from '../components/ProgressBar';
import { useStore, Goal } from '../store/useStore';
import { Flame, PersonStanding, Plus, Zap, X, Calendar } from 'lucide-react-native';
import { AIService } from '../services/ai';
import { differenceInDays, parseISO } from 'date-fns';

export default function GoalsScreen() {
  const { goals, deleteGoal, addGoal, activities, settings } = useStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDate, setNewGoalDate] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleAddGoal = async () => {
    if (!newGoalTitle || !newGoalDate) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    if (!settings.llmApiKey) {
      Alert.alert('Error', 'Please configure your LLM API Key in settings first to generate a plan.');
      return;
    }

    try {
      setIsGenerating(true);

      const targetDateObj = new Date(newGoalDate);
      const daysRemaining = differenceInDays(targetDateObj, new Date());

      // The store handles the injuries array which we will add next
      const storeState = useStore.getState();
      const injuries = (storeState as any).injuries || [];
      const userProfile = (storeState as any).userProfile;

      const generatedPlan = await AIService.generateTrainingPlan(
        newGoalTitle,
        newGoalDate,
        activities,
        settings.llmProvider,
        settings.llmApiKey,
        settings.coachPersonality,
        injuries,
        userProfile
      );

      const finalGoal: Goal = {
        id: Date.now().toString(),
        title: newGoalTitle,
        targetDate: newGoalDate,
        daysRemaining: Math.max(0, daysRemaining),
        type: 'Race',
        metric: 'days',
        progress: 0,
        phase: generatedPlan.phase || 'Base Building',
        weeklyVolume: generatedPlan.weeklyVolume || { current: 0, target: 40 },
        longRun: generatedPlan.longRun || { current: 0, target: 15 },
        keyWorkout: generatedPlan.keyWorkout || 'Easy Run\n45 minutes aerobic',
      };

      addGoal(finalGoal);
      setModalVisible(false);
      setNewGoalTitle('');
      setNewGoalDate('');
    } catch (error) {
      Alert.alert('Error', 'Failed to generate training plan. Check API Key.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        <View style={styles.header}>
          <View>
            <Typography variant="h2">Training Goals</Typography>
            <Typography variant="caption" style={{marginTop: 4}}>Track your race, get phase-by-phase training guidance.</Typography>
          </View>
        </View>

        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Plus size={20} color="#fff" />
          <Typography weight="600" style={{marginLeft: 8}}>Add Goal</Typography>
        </TouchableOpacity>

        {goals.map((goal) => (
          <Card key={goal.id} style={[
            styles.goalCard,
            { borderColor: goal.id === '1' ? '#4C1D95' : theme.colors.success }
          ]}>
            <View style={styles.goalHeader}>
              <View style={styles.goalTitleRow}>
                {goal.id === '1' ? <Flame color={theme.colors.error} size={24}/> : <PersonStanding color={theme.colors.success} size={24}/>}
                <View style={{marginLeft: 12}}>
                  <Typography variant="h3" color={goal.id === '1' ? theme.colors.error : theme.colors.success}>{goal.title}</Typography>
                  <Typography variant="caption">{goal.targetDate} {goal.targetFinishTime ? `· Target ${goal.targetFinishTime}` : ''}</Typography>
                </View>
              </View>
              <View style={styles.actionButtons}>
                <TouchableOpacity style={styles.iconButton}>
                  <Typography variant="caption">Edit</Typography>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={() => deleteGoal(goal.id)}>
                  <X size={16} color={theme.colors.error} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Typography variant="label">DAYS OUT</Typography>
                <Typography variant="h1" color={goal.id === '1' ? theme.colors.error : theme.colors.success}>{goal.daysRemaining}</Typography>
                <Typography variant="caption">{Math.floor(goal.daysRemaining / 7)} weeks</Typography>
              </View>
              <View style={[styles.statBox, styles.phaseBox]}>
                <Typography variant="label">PHASE</Typography>
                <Typography variant="h3" color={theme.colors.text} style={{marginTop: 8}}>{goal.phase.split('\n')[0]}</Typography>
                <Typography variant="caption" style={{marginTop: 4}}>{goal.phase.split('\n')[1]}</Typography>
              </View>
            </View>

            <View style={styles.progressSection}>
              <View style={styles.progressRow}>
                <Typography variant="body" color={theme.colors.textSecondary}>Weekly volume</Typography>
                <Typography variant="body" color="#FCD34D">{goal.weeklyVolume.current} / {goal.weeklyVolume.target} km</Typography>
              </View>
              <ProgressBar progress={(goal.weeklyVolume.current / goal.weeklyVolume.target) * 100} color={theme.colors.error} />
            </View>

            <View style={styles.progressSection}>
              <View style={styles.progressRow}>
                <Typography variant="body" color={theme.colors.textSecondary}>Long run</Typography>
                <Typography variant="body" color={theme.colors.success}>{goal.longRun.current} / {goal.longRun.target} km</Typography>
              </View>
              <ProgressBar progress={(goal.longRun.current / goal.longRun.target) * 100} color={theme.colors.success} />
            </View>

            <View style={styles.workoutBox}>
              <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 8}}>
                <Zap size={16} color="#FBBF24" />
                <Typography variant="label" style={{marginLeft: 8}}>KEY WORKOUT THIS PHASE</Typography>
              </View>
              <Typography variant="body" style={{marginBottom: 4}}>{goal.keyWorkout.split('\n')[0]}</Typography>
              <Typography variant="caption">{goal.keyWorkout.substring(goal.keyWorkout.indexOf('\n') + 1)}</Typography>
            </View>

            {goal.title.toLowerCase().includes('hyrox') && (
               <View style={[styles.workoutBox, { borderLeftColor: theme.colors.error, marginTop: 8 }]}>
                 <Typography variant="label" style={{marginBottom: 8}} color={theme.colors.error}>HYROX STATION GUIDE</Typography>
                 <Typography variant="caption" style={{marginBottom: 4}}>1. Ski Erg - Pace yourself, use legs.</Typography>
                 <Typography variant="caption" style={{marginBottom: 4}}>2. Sled Push - Low body position.</Typography>
                 <Typography variant="caption" style={{marginBottom: 4}}>3. Sled Pull - Short quick steps.</Typography>
                 <Typography variant="caption">4. Burpee Broad Jumps - Maintain rhythm.</Typography>
               </View>
            )}

          </Card>
        ))}

      </ScrollView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Typography variant="h2">New AI Goal</Typography>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Typography variant="body" color={theme.colors.textSecondary} style={{marginBottom: 16}}>
              Enter your goal and our AI will generate a personalized training plan.
            </Typography>

            <View style={styles.inputGroup}>
              <Typography variant="label" style={{marginBottom: 8}}>GOAL TITLE</Typography>
              <TextInput
                style={styles.input}
                value={newGoalTitle}
                onChangeText={setNewGoalTitle}
                placeholder="e.g. Marathon, 10k PB"
                placeholderTextColor={theme.colors.textSecondary}
              />
            </View>

            <View style={styles.inputGroup}>
              <Typography variant="label" style={{marginBottom: 8}}>TARGET DATE (YYYY-MM-DD)</Typography>
              <TextInput
                style={styles.input}
                value={newGoalDate}
                onChangeText={setNewGoalDate}
                placeholder="2024-12-31"
                placeholderTextColor={theme.colors.textSecondary}
              />
            </View>

            <TouchableOpacity
              style={[styles.addButton, { width: '100%', justifyContent: 'center', marginTop: 16 }]}
              onPress={handleAddGoal}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Typography weight="bold" color="#fff">Generate Plan</Typography>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  header: {
    marginBottom: theme.spacing.lg,
  },
  addButton: {
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.xl,
  },
  goalCard: {
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    borderWidth: 1,
    backgroundColor: '#1E1F2E',
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
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    padding: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: theme.borderRadius.sm,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.xl,
    gap: 16,
  },
  statBox: {
    flex: 1,
  },
  phaseBox: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)', // Light blue tint
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  progressSection: {
    marginBottom: theme.spacing.lg,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  workoutBox: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: theme.borderRadius.md,
    borderLeftWidth: 2,
    borderLeftColor: '#FBBF24',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    minHeight: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  inputGroup: {
    marginBottom: theme.spacing.lg,
  },
  input: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontSize: 16,
  }
});
