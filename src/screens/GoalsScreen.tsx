import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, ActivityIndicator, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { Typography } from '../components/Typography';
import { ProgressBar } from '../components/ProgressBar';
import { useStore, Goal } from '../store/useStore';
import { Flame, PersonStanding, Plus, Zap, X, Calendar } from 'lucide-react-native';
import { AIService } from '../services/ai';
import { differenceInDays, parseISO, format } from 'date-fns';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';

export default function GoalsScreen() {
  const { goals, deleteGoal, addGoal, updateGoal, activities, settings, userProfile } = useStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingGoal, setEditingGoal] = useState<string | null>(null); // goal id being edited
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDate, setNewGoalDate] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const goalDate = newGoalDate ? new Date(newGoalDate) : new Date();

  const onDateChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selected) setNewGoalDate(selected.toISOString().split('T')[0]);
  };

  // Strip LLM markdown artefacts: **bold**, * bullet, excess whitespace
  const stripMd = (text: string) =>
    text
      .replace(/\*\*(.*?)\*\*/g, '$1')  // **bold** → bold
      .replace(/^\s*\*\s+/gm, '• ')    // * item → • item
      .replace(/\\n/g, '\n')           // literal \n → newline
      .trim();

  const openEdit = (goal: Goal) => {
    setEditingGoal(goal.id);
    setNewGoalTitle(goal.title);
    setNewGoalDate(goal.targetDate);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingGoal(null);
    setNewGoalTitle('');
    setNewGoalDate('');
  };

  const handleAddGoal = async () => {
    if (!newGoalTitle || !newGoalDate) {
      Alert.alert('Missing fields', 'Please enter a goal title and pick a target date.');
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
        id: editingGoal || Date.now().toString(),
        title: newGoalTitle,
        targetDate: newGoalDate,
        daysRemaining: Math.max(0, daysRemaining),
        type: 'Race',
        metric: 'days',
        progress: 0,
        phase: generatedPlan.phase || 'Base Building',
        phases: generatedPlan.phases || [],
        weeklyVolume: generatedPlan.weeklyVolume || { current: 0, target: 40 },
        longRun: generatedPlan.longRun || { current: 0, target: 15 },
        keyWorkout: generatedPlan.keyWorkout || 'Easy Run\n45 minutes aerobic',
      };

      if (editingGoal) {
        updateGoal(finalGoal);
      } else {
        addGoal(finalGoal);
      }
      
      setEditingGoal(null);
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
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        <View style={styles.header}>
          <View>
            <Typography variant="h2">Training Goals</Typography>
            <Typography variant="caption" style={{marginTop: 4}}>Track your race, get phase-by-phase training guidance.</Typography>
          </View>
        </View>

        <TouchableOpacity style={styles.addButton} onPress={() => { setEditingGoal(null); setNewGoalTitle(''); setNewGoalDate(''); setModalVisible(true); }}>
          <Plus size={20} color="#fff" />
          <Typography weight="600" style={{marginLeft: 8}}>Add Goal</Typography>
        </TouchableOpacity>

        {goals.map((goal, idx) => (
          <Animated.View 
            key={goal.id}
            entering={FadeInDown.delay(idx * 100).springify()}
            layout={Layout.springify()}
          >
            <Card style={[
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
                <TouchableOpacity style={styles.iconButton} onPress={() => openEdit(goal)}>
                  <Typography variant="caption">Edit</Typography>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={() => deleteGoal(goal.id)}>
                  <X size={16} color={theme.colors.error} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Days out */}
            <View style={styles.statBox}>
              <Typography variant="label">DAYS OUT</Typography>
              <Typography variant="h1" color={goal.id === '1' ? theme.colors.error : theme.colors.success}>{goal.daysRemaining}</Typography>
              <Typography variant="caption">{Math.floor(goal.daysRemaining / 7)} weeks to go</Typography>
            </View>

            {/* Phases Rendering */}
            {goal.phases && goal.phases.length > 0 ? (
              goal.phases.map((p, idx) => (
                <View key={idx} style={{ marginTop: idx > 0 ? 24 : 12 }}>
                  <View style={styles.phaseBox}>
                    <Typography variant="label">PHASE {idx + 1}</Typography>
                    <Typography variant="h3" color={theme.colors.text} style={{ marginTop: 6 }}>
                      {stripMd(p.name)}
                    </Typography>
                    <Typography variant="caption" style={{ marginTop: 4, lineHeight: 18 }}>
                      {stripMd(p.description)}
                    </Typography>
                  </View>
                  <View style={[styles.progressSection, { marginTop: 16 }]}>
                    <View style={styles.progressRow}>
                      <Typography variant="body" color={theme.colors.textSecondary}>Weekly volume target</Typography>
                      <Typography variant="body" color="#FCD34D">{p.weeklyVolumeTarget} km</Typography>
                    </View>
                  </View>
                  <View style={styles.progressSection}>
                    <View style={styles.progressRow}>
                      <Typography variant="body" color={theme.colors.textSecondary}>Long run target</Typography>
                      <Typography variant="body" color={theme.colors.success}>{p.longRunTarget} km</Typography>
                    </View>
                  </View>
                  <View style={styles.workoutBox}>
                    <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 8}}>
                      <Zap size={16} color="#FBBF24" />
                      <Typography variant="label" style={{marginLeft: 8}}>KEY WORKOUT</Typography>
                    </View>
                    <Typography variant="body" style={{marginBottom: 4, fontWeight: '700'}}>
                      {stripMd((p.keyWorkout || '').split('\n')[0] || '')}
                    </Typography>
                    <Typography variant="caption" style={{lineHeight: 18}}>
                      {stripMd((p.keyWorkout || '').includes('\n') ? p.keyWorkout.substring(p.keyWorkout.indexOf('\n') + 1) : '')}
                    </Typography>
                  </View>
                </View>
              ))
            ) : (
              <>
                <View style={[styles.phaseBox, { marginTop: 12 }]}>
                  <Typography variant="label">PHASE</Typography>
                  <Typography variant="h3" color={theme.colors.text} style={{ marginTop: 6 }}>
                    {stripMd(goal.phase.split('\n')[0])}
                  </Typography>
                  <Typography variant="caption" style={{ marginTop: 4, lineHeight: 18 }}>
                    {stripMd(goal.phase.split('\n').slice(1).join(' '))}
                  </Typography>
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
                  <Typography variant="body" style={{marginBottom: 4, fontWeight: '700'}}>
                    {stripMd(goal.keyWorkout.split('\n')[0])}
                  </Typography>
                  <Typography variant="caption" style={{lineHeight: 18}}>
                    {stripMd(goal.keyWorkout.substring(goal.keyWorkout.indexOf('\n') + 1))}
                  </Typography>
                </View>
              </>
            )}

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
          </Animated.View>
        ))}

      </ScrollView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior="padding"
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Typography variant="h2">{editingGoal ? 'Edit Goal' : 'New AI Goal'}</Typography>
              <TouchableOpacity onPress={closeModal}>
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
              <Typography variant="label" style={{marginBottom: 8}}>TARGET DATE</Typography>
              <TouchableOpacity onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
                <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', minHeight: 44 }]}>
                  <Typography style={{ color: newGoalDate ? theme.colors.text : theme.colors.textSecondary, fontSize: 15, flex: 1 }}>
                    {newGoalDate || 'Tap to pick a date'}
                  </Typography>
                </View>
              </TouchableOpacity>

              {/* iOS modal */}
              {showDatePicker && Platform.OS === 'ios' && (
                <Modal transparent animationType="slide" visible={showDatePicker}>
                  <View style={styles.pickerOverlay}>
                    <View style={styles.pickerSheet}>
                      <View style={styles.pickerHeader}>
                        <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                          <Typography style={{ color: theme.colors.primary, fontWeight: '700' }}>Done</Typography>
                        </TouchableOpacity>
                      </View>
                      <DateTimePicker
                        value={goalDate}
                        mode="date"
                        display="spinner"
                        minimumDate={new Date()}
                        onChange={onDateChange}
                        textColor={theme.colors.text}
                      />
                    </View>
                  </View>
                </Modal>
              )}
              {/* Android */}
              {showDatePicker && Platform.OS === 'android' && (
                <DateTimePicker
                  value={goalDate}
                  mode="date"
                  display="default"
                  minimumDate={new Date()}
                  onChange={onDateChange}
                />
              )}
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
        </KeyboardAvoidingView>
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
  },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'flex-end', padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
});
