import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, ActivityIndicator, Platform, KeyboardAvoidingView, FlatList, Animated as RNAnimated } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { Typography } from '../components/Typography';
import { ProgressBar } from '../components/ProgressBar';
import { useStore, Goal } from '../store/useStore';
import { Flame, PersonStanding, Plus, Zap, X, Calendar, Trophy, TrendingUp, Clock, Heart, MapPin, Activity, Pencil, MessageCircle, Send, Bot } from 'lucide-react-native';
import { AIService, ChatMessage } from '../services/ai';
import { differenceInDays, parseISO, format, getWeek, getMonth, getYear, startOfWeek, startOfMonth, endOfWeek, endOfMonth } from 'date-fns';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, Layout, useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated';
import { secureSettingsStorage } from '../store/useStore';

const GENERATING_MESSAGES = [
  'Analyzing your training history...',
  'Applying the 10% volume rule...',
  'Building your phase structure...',
  'Calculating threshold paces...',
  'Designing your key workouts...',
  'Finalizing your coaching plan...',
];

const GOAL_DOT_COLORS = ['#f97316', '#ec4899', '#8b5cf6'];

function GoalThinkingDots() {
  const anims = useRef(GOAL_DOT_COLORS.map(() => new RNAnimated.Value(0))).current;
  useEffect(() => {
    const animations = anims.map((anim, i) =>
      RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.delay(i * 160),
          RNAnimated.timing(anim, { toValue: 1, duration: 380, useNativeDriver: true }),
          RNAnimated.timing(anim, { toValue: 0, duration: 380, useNativeDriver: true }),
          RNAnimated.delay((GOAL_DOT_COLORS.length - i - 1) * 160),
        ])
      )
    );
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, []);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10 }}>
      {anims.map((anim, i) => (
        <RNAnimated.View
          key={i}
          style={{
            width: 8, height: 8, borderRadius: 4,
            backgroundColor: GOAL_DOT_COLORS[i],
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }],
            opacity: anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 1, 0.4] }),
          }}
        />
      ))}
    </View>
  );
}

const goalMarkdownStyles = StyleSheet.create({
  body: { color: theme.colors.text, fontSize: 13, lineHeight: 20 },
  heading1: { color: theme.colors.text, fontSize: 16, fontWeight: '700', marginBottom: 4, marginTop: 6 },
  heading2: { color: theme.colors.text, fontSize: 14, fontWeight: '700', marginBottom: 3, marginTop: 4 },
  heading3: { color: '#f97316', fontSize: 13, fontWeight: '700', marginBottom: 2, marginTop: 3 },
  strong: { fontWeight: '700', color: theme.colors.text },
  em: { fontStyle: 'italic', color: theme.colors.textSecondary },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  code_inline: { backgroundColor: '#ffffff15', borderRadius: 4, paddingHorizontal: 4, color: '#ec4899', fontSize: 12 },
  fence: { backgroundColor: '#0f0f1a', borderRadius: 8, padding: 10, marginVertical: 4, borderWidth: 1, borderColor: theme.colors.border },
  table: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6, marginVertical: 6, overflow: 'hidden' },
  thead: { backgroundColor: '#f973160f' },
  th: { padding: 6, fontWeight: '700', color: '#f97316', fontSize: 11, borderRightWidth: 1, borderRightColor: theme.colors.border },
  td: { padding: 6, color: theme.colors.text, fontSize: 11, borderRightWidth: 1, borderRightColor: theme.colors.border },
  tr: { borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row' },
  paragraph: { marginVertical: 2 },
  link: { color: '#6366f1' },
  blockquote: { backgroundColor: '#f9731610', borderLeftWidth: 3, borderLeftColor: '#f97316', paddingLeft: 8, marginVertical: 4, borderRadius: 4 },
});

export default function GoalsScreen() {
  const { goals, deleteGoal, addGoal, updateGoal, activities, settings, userProfile, setToast } = useStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingGoal, setEditingGoal] = useState<string | null>(null); // goal id being edited
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDate, setNewGoalDate] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [goalMode, setGoalMode] = useState<'AI' | 'Simple'>('AI');
  const [simpleCategory, setSimpleCategory] = useState<'Frequency' | 'Distance' | 'HeartRate' | 'Time'>('Frequency');
  const [simplePeriod, setSimplePeriod] = useState<'Week' | 'Month'>('Week');
  const [simpleTarget, setSimpleTarget] = useState('10');
  const [simpleActivityType, setSimpleActivityType] = useState<'All' | 'Run' | 'Walk' | 'Ride'>('All');
  const [generatingMsgIdx, setGeneratingMsgIdx] = useState(0);
  const msgIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [chatMessage, setChatMessage] = useState('');

  // Per-goal coach chat
  const [goalChatTarget, setGoalChatTarget] = useState<Goal | null>(null);
  const [goalChatMessages, setGoalChatMessages] = useState<ChatMessage[]>([]);
  const [goalChatInput, setGoalChatInput] = useState('');
  const [goalChatLoading, setGoalChatLoading] = useState(false);
  const goalChatListRef = useRef<FlatList>(null);

  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.7);
  const dot1Opacity = useSharedValue(0.3);
  const dot2Opacity = useSharedValue(0.3);
  const dot3Opacity = useSharedValue(0.3);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));
  const dot1Style = useAnimatedStyle(() => ({ opacity: dot1Opacity.value }));
  const dot2Style = useAnimatedStyle(() => ({ opacity: dot2Opacity.value }));
  const dot3Style = useAnimatedStyle(() => ({ opacity: dot3Opacity.value }));

  const goalDate = newGoalDate ? new Date(newGoalDate) : new Date();

  const onDateChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selected) setNewGoalDate(selected.toISOString().split('T')[0]);
  };

  // Strip LLM markdown artefacts
  const stripMd = (text: string) =>
    text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/^\s*\*\s+/gm, '• ')
      .replace(/\\n/g, '\n')
      .trim();

  // Compute current period key e.g. "2025-W18" or "2025-04"
  const getPeriodKey = (period: 'Week' | 'Month') => {
    const now = new Date();
    if (period === 'Week') return `${getYear(now)}-W${String(getWeek(now, { weekStartsOn: 1 })).padStart(2, '0')}`;
    return `${getYear(now)}-${String(getMonth(now) + 1).padStart(2, '0')}`;
  };

  // On mount: snapshot any simple goals whose period has rolled over
  useEffect(() => {
    const now = new Date();
    goals.forEach(goal => {
      if (!goal.isSimple) return;
      const currentKey = getPeriodKey(goal.simplePeriod || 'Week');
      if (goal.lastSnapshotPeriod === currentKey) return; // already snapshotted this period

      // Calculate what was achieved last period
      const period = goal.simplePeriod || 'Week';
      const prevStart = period === 'Week'
        ? startOfWeek(new Date(now.getTime() - 7 * 86400000), { weekStartsOn: 1 })
        : startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      const prevEnd = period === 'Week'
        ? endOfWeek(prevStart, { weekStartsOn: 1 })
        : endOfMonth(prevStart);

      const actType = goal.simpleActivityType || 'All';
      const prevActs = activities.filter(a => {
        const d = parseISO(a.startDate);
        return d >= prevStart && d <= prevEnd && (actType === 'All' || a.type === actType);
      });

      let achieved = 0;
      if (goal.simpleCategory === 'Frequency') achieved = prevActs.length;
      else if (goal.simpleCategory === 'Distance') achieved = prevActs.reduce((s, a) => s + a.distance / 1000, 0);
      else if (goal.simpleCategory === 'Time') achieved = prevActs.reduce((s, a) => s + a.movingTime / 3600, 0);
      else if (goal.simpleCategory === 'HeartRate') {
        const hrs = prevActs.filter(a => (a.averageHeartRate || 0) > 0);
        achieved = hrs.length ? hrs.reduce((s, a) => s + (a.averageHeartRate || 0), 0) / hrs.length : 0;
      }

      if (goal.lastSnapshotPeriod) {
        // only archive if there was a previous period key (not first run)
        const historyEntry = {
          period: goal.lastSnapshotPeriod,
          achieved: Number(achieved.toFixed(1)),
          target: goal.simpleTarget || 0,
          completed: achieved >= (goal.simpleTarget || 0),
        };
        updateGoal({
          ...goal,
          lastSnapshotPeriod: currentKey,
          history: [historyEntry, ...(goal.history || [])].slice(0, 12),
        });
      } else {
        // first time seeing this goal — just record the key
        updateGoal({ ...goal, lastSnapshotPeriod: currentKey });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isGenerating) {
      setGeneratingMsgIdx(0);
      msgIntervalRef.current = setInterval(() => {
        setGeneratingMsgIdx(i => (i + 1) % GENERATING_MESSAGES.length);
      }, 2000);
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: 900, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        ), -1);
      pulseOpacity.value = withRepeat(
        withSequence(withTiming(1, { duration: 900 }), withTiming(0.5, { duration: 900 })), -1);
      dot1Opacity.value = withRepeat(
        withSequence(withTiming(1, { duration: 400 }), withTiming(0.3, { duration: 400 }), withTiming(0.3, { duration: 400 })), -1);
      dot2Opacity.value = withRepeat(
        withSequence(withTiming(0.3, { duration: 400 }), withTiming(1, { duration: 400 }), withTiming(0.3, { duration: 400 })), -1);
      dot3Opacity.value = withRepeat(
        withSequence(withTiming(0.3, { duration: 400 }), withTiming(0.3, { duration: 400 }), withTiming(1, { duration: 400 })), -1);
    } else {
      if (msgIntervalRef.current) clearInterval(msgIntervalRef.current);
      pulseScale.value = withTiming(1);
      pulseOpacity.value = withTiming(0.7);
      dot1Opacity.value = withTiming(0.3);
      dot2Opacity.value = withTiming(0.3);
      dot3Opacity.value = withTiming(0.3);
    }
    return () => { if (msgIntervalRef.current) clearInterval(msgIntervalRef.current); };
  }, [isGenerating]);

  const calculateSimpleGoalProgress = (goal: Goal) => {
    if (!goal.isSimple) return 0;
    const now = new Date();
    const { startOfWeek, startOfMonth, endOfWeek, endOfMonth } = require('date-fns');
    const start = goal.simplePeriod === 'Week' ? startOfWeek(now, { weekStartsOn: 1 }) : startOfMonth(now);
    const end   = goal.simplePeriod === 'Week' ? endOfWeek(now, { weekStartsOn: 1 }) : endOfMonth(now);
    const actType = goal.simpleActivityType || 'All';
    const relevantActs = activities.filter(a => {
      const d = parseISO(a.startDate);
      const inPeriod = d >= start && d <= end;
      const matchesType = actType === 'All' || a.type === actType;
      return inPeriod && matchesType;
    });
    if (goal.simpleCategory === 'Frequency') {
      return relevantActs.length;
    } else if (goal.simpleCategory === 'Distance') {
      return relevantActs.reduce((sum, a) => sum + (a.distance / 1000), 0);
    } else if (goal.simpleCategory === 'HeartRate') {
      const hrActs = relevantActs.filter(a => a.averageHeartRate && a.averageHeartRate > 0);
      if (!hrActs.length) return 0;
      return hrActs.reduce((sum, a) => sum + a.averageHeartRate!, 0) / hrActs.length;
    } else if (goal.simpleCategory === 'Time') {
      return relevantActs.reduce((sum, a) => sum + (a.movingTime / 3600), 0);
    }
    return 0;
  };

  const openEdit = (goal: Goal) => {
    setEditingGoal(goal.id);
    setNewGoalTitle(goal.title);
    setNewGoalDate(goal.targetDate);
    setChatMessage('');
    if (goal.isSimple) {
      setGoalMode('Simple');
      setSimpleCategory((goal.simpleCategory as any) || 'Frequency');
      setSimplePeriod((goal.simplePeriod as any) || 'Week');
      setSimpleTarget(String(goal.simpleTarget ?? '10'));
      setSimpleActivityType((goal.simpleActivityType as any) || 'All');
    } else {
      setGoalMode('AI');
    }
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingGoal(null);
    setNewGoalTitle('');
    setNewGoalDate('');
    setGoalMode('AI');
    setSimpleTarget('10');
    setSimpleActivityType('All');
  };

  const handleAddGoal = async () => {
    if (goalMode === 'Simple') {
      const targetVal = parseFloat(simpleTarget);
      if (isNaN(targetVal) || targetVal <= 0) {
        setToast({ title: 'Invalid Target', message: 'Please enter a valid numeric target.', type: 'error' });
        return;
      }
      const unitLabel = simpleCategory === 'Distance' ? 'km' : simpleCategory === 'Time' ? 'hrs' : simpleCategory === 'HeartRate' ? 'bpm avg' : 'sessions';
      const actLabel = simpleActivityType === 'All' ? '' : ` (${simpleActivityType}s)`;
      const autoTitle = `${targetVal} ${unitLabel}${actLabel} per ${simplePeriod}`;
      const finalGoal: Goal = {
        id: editingGoal || Date.now().toString(),
        title: newGoalTitle || autoTitle,
        targetDate: newGoalDate || new Date().toISOString().split('T')[0],
        daysRemaining: 0,
        type: 'Simple',
        isSimple: true,
        simpleCategory,
        simplePeriod,
        simpleTarget: targetVal,
        simpleActivityType,
        metric: simpleCategory,
        progress: 0,
        phase: 'Ongoing',
        weeklyVolume: { current: 0, target: 0 },
        longRun: { current: 0, target: 0 },
        keyWorkout: '',
      };
      if (editingGoal) updateGoal(finalGoal); else addGoal(finalGoal);
      closeModal();
      return;
    }

    // Editing an AI goal — continue as chat, preserving history
    if (editingGoal && goalMode === 'AI') {
      const existing = goals.find(g => g.id === editingGoal);
      if (!existing) return;
      if (!chatMessage.trim()) {
        setToast({ title: 'Empty message', message: 'Tell the coach what to change.', type: 'error' });
        return;
      }
      if (!settings.llmApiKey) {
        setToast({ title: 'Error', message: 'Configure your API Key in settings first.', type: 'error' });
        return;
      }
      try {
        setIsGenerating(true);
        const { plan, updatedHistory } = await AIService.continueTrainingPlan(
          existing,
          chatMessage.trim(),
          settings.llmProvider,
          settings.llmApiKey,
          settings.coachPersonality
        );
        updateGoal({
          ...existing,
          ...plan,
          chatHistory: updatedHistory,
        });
        setChatMessage('');
        setEditingGoal(null);
        setModalVisible(false);
        setToast({ title: 'Plan Updated', message: 'Your coach revised the plan.', type: 'success' });
      } catch {
        setToast({ title: 'Error', message: 'Failed to update plan. Check API Key.', type: 'error' });
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    if (!newGoalTitle || !newGoalDate) {
      setToast({ title: 'Missing fields', message: 'Please enter a goal title and pick a target date.', type: 'error' });
      return;
    }

    if (!settings.llmApiKey) {
      setToast({ title: 'Error', message: 'Please configure your LLM API Key in settings first to generate a plan.', type: 'error' });
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
      setToast({ title: 'Success', message: 'Goal plan created!', type: 'success' });
    } catch (error) {
      setToast({ title: 'Error', message: 'Failed to generate training plan. Check API Key.', type: 'error' });
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
                {!goal.isSimple && (
                  <TouchableOpacity style={styles.iconButton} onPress={() => { setGoalChatTarget(goal); setGoalChatMessages([]); setGoalChatInput(''); }}>
                    <MessageCircle size={14} color={theme.colors.accent} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.iconButton} onPress={() => openEdit(goal)}>
                  <Pencil size={14} color={theme.colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={() => deleteGoal(goal.id)}>
                  <X size={14} color={theme.colors.error} />
                </TouchableOpacity>
              </View>
            </View>

            {goal.isSimple ? (() => {
              const prog = calculateSimpleGoalProgress(goal);
              const targetNum = Number(goal.simpleTarget) || 1;
              const pct = Math.min(100, (prog / targetNum) * 100);
              const isDone = pct >= 100;
              const unit = goal.simpleCategory === 'Distance' ? 'km' : goal.simpleCategory === 'Time' ? 'hrs' : goal.simpleCategory === 'HeartRate' ? 'bpm' : 'sessions';
              const actTypeLabel = goal.simpleActivityType && goal.simpleActivityType !== 'All' ? ` · ${goal.simpleActivityType}s only` : '';
              const periodLabel = (goal.simplePeriod || 'Week') === 'Week' ? 'This Week' : 'This Month';
              const catIcon = goal.simpleCategory === 'Distance' ? <MapPin size={14} color="#fff" /> : goal.simpleCategory === 'Time' ? <Clock size={14} color="#fff" /> : goal.simpleCategory === 'HeartRate' ? <Heart size={14} color="#fff" /> : <Activity size={14} color="#fff" />;
              const gradColors: [string, string] = isDone ? ['#16a34a', '#15803d'] : pct > 60 ? ['#0ea5e9', '#0284c7'] : ['#7c3aed', '#6d28d9'];
              return (
                <>
                  <LinearGradient
                    colors={gradColors}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={{ borderRadius: 12, padding: 16, marginTop: 12 }}
                  >
                    {/* Header row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {catIcon}
                        <Typography style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {periodLabel}{actTypeLabel}
                        </Typography>
                      </View>
                      {isDone && <Typography style={{ fontSize: 18 }}>🎉</Typography>}
                    </View>

                    {/* Main numbers */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 }}>
                      <Typography style={{ fontSize: 44, fontWeight: '900', color: '#fff', lineHeight: 48 }}>
                        {Number(prog.toFixed(1))}
                      </Typography>
                      <Typography style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, marginBottom: 6, marginLeft: 6 }}>
                        / {goal.simpleTarget} {unit}
                      </Typography>
                    </View>

                    <Typography style={{ color: isDone ? '#bbf7d0' : 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 14 }}>
                      {isDone ? '🏆 Goal crushed! Great work!' : `${Math.round(pct)}% of your ${(goal.simplePeriod || 'week').toLowerCase()}ly target`}
                    </Typography>

                    {/* Progress bar */}
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
                      <View style={{ width: `${pct}%`, height: '100%', borderRadius: 4, backgroundColor: isDone ? '#bbf7d0' : '#fff' }} />
                    </View>
                  </LinearGradient>

                  {/* History section */}
                  {(goal.history || []).length > 0 && (
                    <View style={{ marginTop: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <TrendingUp size={14} color={theme.colors.textSecondary} />
                        <Typography variant="label" style={{ color: theme.colors.textSecondary }}>PAST PERIODS</Typography>
                      </View>
                      {(goal.history || []).slice(0, 4).map((h, i) => (
                        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                          <Typography variant="caption" style={{ color: theme.colors.textSecondary }}>{h.period}</Typography>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Typography variant="caption" style={{ color: h.completed ? theme.colors.success : theme.colors.text }}>
                              {h.achieved} / {h.target} {unit}
                            </Typography>
                            <Typography>{h.completed ? '✅' : '❌'}</Typography>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              );
            })() : (
              <View style={styles.statBox}>
                <Typography variant="label">DAYS OUT</Typography>
                <Typography variant="h1" color={goal.id === '1' ? theme.colors.error : theme.colors.success}>{goal.daysRemaining}</Typography>
                <Typography variant="caption">{Math.floor(goal.daysRemaining / 7)} weeks to go</Typography>
              </View>
            )}

            {/* Phases Rendering */}
            {!goal.isSimple && goal.phases && goal.phases.length > 0 ? (
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
            ) : !goal.isSimple ? (
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
            ) : null}

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

      {/* ── AI Generating Overlay ── */}
      <Modal visible={isGenerating} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.genOverlay}>
          <LinearGradient colors={['#0a0a18', '#1a0a33', '#0a0a18']} style={styles.genGradient}>
            <Animated.View style={[styles.genIconWrap, pulseStyle]}>
              <LinearGradient colors={['#7c3aed', '#4f46e5']} style={styles.genIconBg}>
                <Zap size={44} color="#fff" />
              </LinearGradient>
            </Animated.View>
            <Typography style={styles.genTitle}>Building Your Plan</Typography>
            <Typography style={styles.genSubtitle}>AI coaching intelligence at work</Typography>
            <Typography style={styles.genMessage}>{GENERATING_MESSAGES[generatingMsgIdx]}</Typography>
            <View style={styles.genDotsRow}>
              <Animated.View style={[styles.genDot, dot1Style]} />
              <Animated.View style={[styles.genDot, dot2Style]} />
              <Animated.View style={[styles.genDot, dot3Style]} />
            </View>
            <Typography style={styles.genHint}>This may take up to 30 seconds</Typography>
          </LinearGradient>
        </View>
      </Modal>

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
            {/* Drag handle */}
            <View style={{ width: 40, height: 4, backgroundColor: theme.colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
            <View style={styles.modalHeader}>
              <Typography variant="h2">{editingGoal ? 'Edit Goal' : 'New Goal'}</Typography>
              <TouchableOpacity onPress={closeModal}>
                <X size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Tab switcher — hidden when editing AI goal */}
            {!(editingGoal && goalMode === 'AI') && (
            <View style={{ flexDirection: 'row', marginBottom: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 4 }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: goalMode === 'AI' ? theme.colors.primary : 'transparent', borderRadius: 6 }} onPress={() => setGoalMode('AI')}>
                <Typography weight="600">AI Plan</Typography>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: goalMode === 'Simple' ? theme.colors.primary : 'transparent', borderRadius: 6 }} onPress={() => setGoalMode('Simple')}>
                <Typography weight="600">Simple Target</Typography>
              </TouchableOpacity>
            </View>
            )}

            {goalMode === 'AI' ? (
              <>
                {editingGoal ? (
                  // ── Chat UI for editing existing AI plan ──
                  (() => {
                    const existing = goals.find(g => g.id === editingGoal);
                    const history = existing?.chatHistory || [];
                    return (
                      <>
                        <Typography variant="caption" style={{ color: theme.colors.textSecondary, marginBottom: 12 }}>
                          Ask your coach to refine the plan. Changes are applied on each send.
                        </Typography>
                        {/* Chat history */}
                        {history.length > 0 && (
                          <View style={{ marginBottom: 12, maxHeight: 200 }}>
                            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                              {history.filter(h => h.role === 'user').map((h, i) => (
                                <View key={i} style={styles.chatBubbleUser}>
                                  <Typography style={styles.chatBubbleText}>{h.text}</Typography>
                                </View>
                              ))}
                            </ScrollView>
                          </View>
                        )}
                        <TextInput
                          style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                          value={chatMessage}
                          onChangeText={setChatMessage}
                          placeholder={history.length === 0
                            ? 'e.g. "Make week 3 harder" or "I have 8 weeks not 12"'
                            : 'Continue the conversation...'}
                          placeholderTextColor={theme.colors.textSecondary}
                          multiline
                        />
                      </>
                    );
                  })()
                ) : (
                  // ── New AI goal form ──
                  <>
                    <Typography variant="body" color={theme.colors.textSecondary} style={{ marginBottom: 16 }}>
                      Enter your goal and our AI will generate a personalized training plan.
                    </Typography>
                    <View style={styles.inputGroup}>
                      <Typography variant="label" style={{marginBottom: 8}}>GOAL TITLE</Typography>
                      <TextInput style={styles.input} value={newGoalTitle} onChangeText={setNewGoalTitle} placeholder="e.g. Marathon, 10k PB" placeholderTextColor={theme.colors.textSecondary} />
                    </View>
                    <View style={styles.inputGroup}>
                      <Typography variant="label" style={{marginBottom: 8}}>TARGET DATE</Typography>
                      <TouchableOpacity onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
                        <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', minHeight: 44 }]}>
                          <Typography style={{ color: newGoalDate ? theme.colors.text : theme.colors.textSecondary, fontSize: 15, flex: 1 }}>{newGoalDate || 'Tap to pick a date'}</Typography>
                        </View>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </>
            ) : (
              <>
                {/* Step 1: What to track */}
                <Typography variant="label" style={{ marginBottom: 8, color: theme.colors.textSecondary }}>WHAT DO YOU WANT TO TRACK?</Typography>
                {[
                  { key: 'Frequency', label: '# of Sessions', desc: 'Count how many runs/walks you complete' },
                  { key: 'Distance', label: 'Total Distance', desc: 'Kilometres covered across activities' },
                  { key: 'Time', label: 'Active Time', desc: 'Total hours spent being active' },
                  { key: 'HeartRate', label: 'Avg Heart Rate', desc: 'Average HR across your activities' },
                ].map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setSimpleCategory(opt.key as any)}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      padding: 12, borderRadius: 10, marginBottom: 8,
                      borderWidth: 1.5,
                      borderColor: simpleCategory === opt.key ? theme.colors.primary : theme.colors.border,
                      backgroundColor: simpleCategory === opt.key ? theme.colors.primary + '22' : 'transparent',
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Typography weight="600">{opt.label}</Typography>
                      <Typography variant="caption" style={{ marginTop: 2 }}>{opt.desc}</Typography>
                    </View>
                    {simpleCategory === opt.key && <Typography style={{ color: theme.colors.primary }}>✓</Typography>}
                  </TouchableOpacity>
                ))}

                {/* Step 2: Activity type */}
                <Typography variant="label" style={{ marginTop: 16, marginBottom: 8, color: theme.colors.textSecondary }}>WHICH ACTIVITY TYPE?</Typography>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  {(['All', 'Run', 'Walk', 'Ride'] as const).map(t => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setSimpleActivityType(t)}
                      style={{
                        flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
                        borderWidth: 1.5,
                        borderColor: simpleActivityType === t ? theme.colors.accent : theme.colors.border,
                        backgroundColor: simpleActivityType === t ? theme.colors.accent + '22' : 'transparent',
                      }}
                    >
                      <Typography variant="caption" weight="600" style={{ color: simpleActivityType === t ? theme.colors.accent : theme.colors.textSecondary }}>
                        {t === 'All' ? 'All' : t === 'Run' ? 'Run' : t === 'Walk' ? 'Walk' : 'Ride'}
                      </Typography>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Step 3: Period */}
                <Typography variant="label" style={{ marginBottom: 8, color: theme.colors.textSecondary }}>RESET PERIOD</Typography>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  {(['Week', 'Month'] as const).map(p => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setSimplePeriod(p)}
                      style={{
                        flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
                        borderWidth: 1.5,
                        borderColor: simplePeriod === p ? theme.colors.primary : theme.colors.border,
                        backgroundColor: simplePeriod === p ? theme.colors.primary + '22' : 'transparent',
                      }}
                    >
                      <Typography weight="600" style={{ color: simplePeriod === p ? theme.colors.primary : theme.colors.text }}>
                        {p === 'Week' ? 'Weekly' : 'Monthly'}
                      </Typography>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Step 4: Target number */}
                <Typography variant="label" style={{ marginBottom: 8, color: theme.colors.textSecondary }}>
                  TARGET {simpleCategory === 'Distance' ? '(KM)' : simpleCategory === 'Time' ? '(HOURS)' : simpleCategory === 'HeartRate' ? '(AVG BPM)' : '(# SESSIONS)'}
                </Typography>
                <TextInput style={[styles.input, { marginBottom: 16 }]} value={simpleTarget} onChangeText={setSimpleTarget} keyboardType="numeric"
                  placeholder={simpleCategory === 'Distance' ? 'e.g. 30' : simpleCategory === 'Time' ? 'e.g. 5' : simpleCategory === 'HeartRate' ? 'e.g. 145' : 'e.g. 4'}
                  placeholderTextColor={theme.colors.textSecondary} />

                <Typography variant="label" style={{ marginBottom: 8, color: theme.colors.textSecondary }}>CUSTOM TITLE (OPTIONAL)</Typography>
                <TextInput style={styles.input} value={newGoalTitle} onChangeText={setNewGoalTitle} placeholder="Leave blank for auto-generated title" placeholderTextColor={theme.colors.textSecondary} />
              </>
            )}

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
            </ScrollView>

            <TouchableOpacity
              style={[styles.addButton, { width: '100%', justifyContent: 'center', marginTop: 16 }]}
              onPress={handleAddGoal}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Typography weight="bold" color="#fff">
                  {editingGoal ? 'Save Changes' : goalMode === 'AI' ? 'Generate Plan' : 'Save Goal'}
                </Typography>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Per-Goal Coach Chat Modal ── */}
      <Modal
        visible={!!goalChatTarget}
        animationType="slide"
        transparent
        onRequestClose={() => setGoalChatTarget(null)}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={{ width: 40, height: 4, backgroundColor: theme.colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 12 }} />
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Bot size={16} color={theme.colors.accent} />
                <View>
                  <Typography variant="h3">Ask Coach</Typography>
                  <Typography variant="caption" style={{ color: theme.colors.textSecondary, marginTop: 1 }}>
                    {goalChatTarget?.title}
                  </Typography>
                </View>
              </View>
              <TouchableOpacity onPress={() => setGoalChatTarget(null)}>
                <X size={22} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {goalChatMessages.length === 0 ? (
              <View style={{ paddingVertical: 24, alignItems: 'center', gap: 8 }}>
                <Typography style={{ fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>
                  Ask anything about this goal — pacing, workouts, adjustments, or recovery.
                </Typography>
              </View>
            ) : (
              <FlatList
                ref={goalChatListRef}
                data={goalChatMessages}
                keyExtractor={(_, i) => String(i)}
                style={{ maxHeight: 340 }}
                onContentSizeChange={() => goalChatListRef.current?.scrollToEnd({ animated: true })}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <View style={[
                    item.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleBot,
                    { marginBottom: 8 }
                  ]}>
                    {item.role === 'user'
                      ? <Typography style={styles.chatBubbleText}>{item.text}</Typography>
                      : <Markdown style={goalMarkdownStyles}>{item.text}</Markdown>
                    }
                  </View>
                )}
                ListFooterComponent={goalChatLoading ? <GoalThinkingDots /> : null}
              />
            )}

            <View style={[styles.inputBar, { marginTop: 8 }]}>
              <TextInput
                style={styles.chatInput}
                value={goalChatInput}
                onChangeText={setGoalChatInput}
                placeholder="Ask your coach…"
                placeholderTextColor={theme.colors.textSecondary}
                multiline
                maxLength={400}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!goalChatInput.trim() || goalChatLoading) && styles.sendBtnDisabled]}
                disabled={!goalChatInput.trim() || goalChatLoading}
                onPress={async () => {
                  if (!goalChatInput.trim() || !goalChatTarget) return;
                  const apiKey = settings.llmApiKey || await secureSettingsStorage.getSecret('llmApiKey') || '';
                  if (!apiKey) { setToast({ title: 'Error', message: 'Add API key in Settings.', type: 'error' }); return; }
                  const userMsg: ChatMessage = { role: 'user', text: goalChatInput.trim() };
                  const next = [...goalChatMessages, userMsg];
                  setGoalChatMessages(next);
                  setGoalChatInput('');
                  setGoalChatLoading(true);
                  try {
                    const reply = await AIService.chatWithCoach(
                      next, settings.llmProvider, apiKey,
                      settings.coachPersonality, userProfile, activities, goalChatTarget
                    );
                    setGoalChatMessages([...next, { role: 'assistant', text: reply }]);
                  } catch (e: any) {
                    setToast({ title: 'Error', message: e?.message || 'Request failed.', type: 'error' });
                  } finally {
                    setGoalChatLoading(false);
                    setTimeout(() => goalChatListRef.current?.scrollToEnd({ animated: true }), 100);
                  }
                }}
              >
                <Send size={16} color={!goalChatInput.trim() || goalChatLoading ? theme.colors.textSecondary : '#fff'} />
              </TouchableOpacity>
            </View>
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
    maxHeight: '85%',
    minHeight: 320,
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
  genOverlay: { flex: 1 },
  genGradient: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  genIconWrap: { marginBottom: 36 },
  genIconBg: { width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center', shadowColor: '#7c3aed', shadowOpacity: 0.8, shadowRadius: 24, shadowOffset: { width: 0, height: 0 } },
  genTitle: { fontSize: 26, fontWeight: '700', textAlign: 'center', color: '#fff', marginBottom: 8 },
  genSubtitle: { fontSize: 13, textAlign: 'center', color: 'rgba(255,255,255,0.45)', marginBottom: 40 },
  genMessage: { fontSize: 15, textAlign: 'center', color: 'rgba(255,255,255,0.85)', marginBottom: 32, minHeight: 22 },
  genDotsRow: { flexDirection: 'row', gap: 10, marginBottom: 48 },
  genDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.primary },
  genHint: { fontSize: 12, textAlign: 'center', color: 'rgba(255,255,255,0.25)' },
  chatBubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.primary + '33',
    borderRadius: 12,
    borderBottomRightRadius: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '85%',
  },
  chatBubbleBot: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    borderBottomLeftRadius: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '90%',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chatBubbleText: { fontSize: 13, color: theme.colors.text, lineHeight: 19 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  chatInput: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: theme.colors.text,
    fontSize: 14,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
});
