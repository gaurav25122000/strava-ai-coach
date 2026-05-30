import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, ScrollView, TouchableOpacity, Modal, Platform, FlatList, Animated as RNAnimated } from 'react-native';
import { styles, goalMarkdownStyles } from './GoalsScreen.styles';
import Markdown from 'react-native-markdown-display';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { Typography } from '../components/Typography';
import { ProgressBar } from '../components/ProgressBar';
import { useStore, Goal, DailyPrescription, CheckIn } from '../store/useStore';
import { Flame, Bike, Footprints, Plus, Zap, X, Calendar, Trophy, TrendingUp, Clock, Heart, MapPin, Activity, Pencil, MessageCircle, Send, Target, Sparkles, PartyPopper, CheckCircle2, XCircle, LucideIcon } from 'lucide-react-native';
import { Icon } from '../components/Icon';
import { FieldBlock, SegmentedControl, SectionLabel, SheetCTA } from '../components/SheetUI';
import { AIService, ChatMessage } from '../services/ai';
import { computeProgress } from '../services/goalProgress';
import { familyStyle } from '../utils/widgetFamilies';
import { workoutIcon, WORKOUT_COLORS, WORKOUT_LABELS } from '../utils/workoutKinds';
import { differenceInDays, parseISO, format, getWeek, getMonth, getYear, startOfWeek, startOfMonth, endOfWeek, endOfMonth, addDays } from 'date-fns';
import { WeekStrip } from '../components/WeekStrip';
import { DayDetailSheet, DayContext, DayCheckInPayload } from '../components/DayDetailSheet';
import { BottomSheet } from '../components/BottomSheet';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated';
import { secureSettingsStorage } from '../store/useStore';
import { PressableScale } from '../components/PressableScale';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { SkeletonWidget } from '../components/SkeletonPresets';
import { DonutRing } from '../components/DonutRing';
import { StaggerItem } from '../components/Stagger';

const GENERATING_MESSAGES = [
  'Analyzing your training history...',
  'Applying the 10% volume rule...',
  'Building your phase structure...',
  'Calculating threshold paces...',
  'Designing your key workouts...',
  'Finalizing your coaching plan...',
];

const GOAL_DOT_COLORS = ['#f97316', '#ec4899', '#8b5cf6'];

// Map a free-text phase name to its canonical short label. Used to render the
// family-tinted phase pill above the WeekStrip — keeps the chip terse even
// when the LLM returned a wordy phase title like "Base Building Phase".
function phaseShortName(raw: string): 'Base' | 'Build' | 'Peak' | 'Taper' | string {
  const s = (raw || '').toLowerCase();
  if (s.includes('taper')) return 'Taper';
  if (s.includes('peak') || s.includes('race')) return 'Peak';
  if (s.includes('build') || s.includes('strength')) return 'Build';
  if (s.includes('base') || s.includes('aerobic') || s.includes('foundation')) return 'Base';
  return raw.split('\n')[0].split(/\s+/).slice(0, 2).join(' ');
}

// Format a date string (yyyy-MM-dd) into a friendly "May 12" caption.
function friendlyDate(iso: string): string {
  try { return format(parseISO(iso), 'MMM d, yyyy'); } catch { return iso; }
}

// Pick the goal's title-row glyph from its semantics rather than a hardcoded id.
// AI race goals lean on title keywords (ride/run); simple goals reflect their
// tracked activity. The colour always comes from the `plan` family accent so
// the title matches the phase pill + DonutRing on the same card.
function goalIcon(goal: Goal): LucideIcon {
  const t = (goal.title || '').toLowerCase();
  const act = goal.simpleActivityType;
  if (act === 'Ride' || t.includes('ride') || t.includes('cycl') || t.includes('bike')) return Bike;
  if (act === 'Walk' || t.includes('walk')) return Footprints;
  if (t.includes('hyrox') || t.includes('marathon') || t.includes('race') || t.includes('10k') || t.includes('5k') || t.includes('half')) return Flame;
  return Footprints;
}

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

export default function GoalsScreen() {
  const { goals, deleteGoal, addGoal, updateGoal, addCheckIn, activities, settings, userProfile, setToast } = useStore();
  // Day-detail bottom sheet target — null when closed. The sheet owns its
  // own notes/RPE form state; this just routes the open/close + payload.
  const [dayDetail, setDayDetail] = useState<DayContext | null>(null);
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

  // ── AI-goal helpers ────────────────────────────────────────────────
  // Resolve which 7-day phase window covers today. Falls back to first phase
  // so older plans (no weekStart/weekEnd) still render meaningfully.
  const activePhase = (goal: Goal) => {
    const phases = goal.phases || [];
    if (!phases.length) return undefined;
    const t = Date.now();
    return phases.find(p => p.weekStart && p.weekEnd
      && parseISO(p.weekStart).getTime() <= t
      && parseISO(p.weekEnd).getTime() >= t) || phases[0];
  };

  // WeekStrip → day chip tap. Opens the bottom sheet seeded with whatever
  // check-in already exists for that date (manual or Strava-derived).
  const handleOpenDay = (goal: Goal, dayIndex: 0|1|2|3|4|5|6) => {
    const mondayOfThisWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
    const date = format(addDays(mondayOfThisWeek, dayIndex), 'yyyy-MM-dd');
    const presc = activePhase(goal)?.schedule?.find(p => p.dayOfWeek === dayIndex);
    const existing = (goal.checkIns || []).find(c => c.date === date);
    setDayDetail({ goalId: goal.id, date, dayOfWeek: dayIndex, prescription: presc, existingCheckIn: existing });
  };

  // DayDetailSheet → manual check-in. Persist, then re-derive plan progress
  // so the dial and chip ✓ update without waiting for a Strava sync.
  const handleManualCheckIn = (day: DayContext, payload: DayCheckInPayload) => {
    const checkIn: CheckIn = {
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      source: 'MANUAL',
      workoutKind: day.prescription?.kind || 'EASY',
      completed: payload.completed,
      notes: payload.notes || undefined,
      perceivedEffort: payload.rpe,
    };
    addCheckIn(day.goalId, checkIn);
    const fresh = useStore.getState().goals.find(g => g.id === day.goalId);
    if (fresh) updateGoal(computeProgress(fresh, useStore.getState().activities));
    setDayDetail(null);
    setToast({
      title: payload.completed ? 'Logged ✓' : 'Saved',
      message: 'Workout updated.',
      type: 'success',
    });
  };

  const handleSyncGoal = (goal: Goal) => {
    const updated = computeProgress(goal, activities);
    updateGoal(updated);
    const matched = (updated.checkIns || []).filter(c => c.source === 'STRAVA').length;
    setToast({
      title: 'Synced from Strava',
      message: `${matched} activit${matched === 1 ? 'y' : 'ies'} matched to your plan.`,
      type: 'success',
    });
  };

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
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        <LinearGradient
          colors={theme.colors.gradients.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroHeader}
        >
          <View style={{ flex: 1 }}>
            <Typography style={styles.heroTitle}>Training Goals</Typography>
            <Typography style={styles.heroSub}>Track your race, get phase-by-phase guidance.</Typography>
          </View>
          <PressableScale
            style={styles.heroAddBtn}
            accessibilityRole="button"
            accessibilityLabel="Add goal"
            onPress={() => { setEditingGoal(null); setNewGoalTitle(''); setNewGoalDate(''); setModalVisible(true); }}
          >
            <Icon icon={Plus} variant="plain" size="md" color="#fff" />
          </PressableScale>
        </LinearGradient>

        {/* Initial-hydrate skeleton — the persisted store can momentarily return
            undefined while loading from storage. Show a placeholder widget so
            the screen doesn't flash the empty-state CTA before settling. */}
        {goals == null && <SkeletonWidget />}

        {goals && goals.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Icon icon={Target} variant="plain" size="xl" color={theme.colors.primary} />
            </View>
            <Typography style={styles.emptyTitle}>Set your first goal</Typography>
            <Typography style={styles.emptySub}>
              Pick a race date or a simple weekly target — your AI coach will build the plan around it.
            </Typography>
            <PressableScale
              onPress={() => { setEditingGoal(null); setNewGoalTitle(''); setNewGoalDate(''); setModalVisible(true); }}
              style={{ marginTop: 18 }}
            >
              <LinearGradient
                colors={theme.colors.gradients.primary}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.emptyCtaBtn}
              >
                <Icon icon={Plus} variant="plain" size="sm" color="#fff" />
                <Typography weight="bold" color="#fff" style={{ fontSize: 14 }}>Create a Goal</Typography>
              </LinearGradient>
            </PressableScale>
          </View>
        )}

        {(goals || []).map((goal, idx) => (
          <StaggerItem key={goal.id} index={idx}>
            <Card variant="elevated" style={styles.goalCard}>
            <View style={styles.goalHeader}>
              <View style={styles.goalTitleRow}>
                <Icon icon={goalIcon(goal)} variant="plain" size="lg" color={familyStyle('plan').accent} />
                <View style={{marginLeft: 12}}>
                  <Typography variant="h3" color={familyStyle('plan').accent}>{goal.title}</Typography>
                  <Typography variant="caption">{goal.targetDate} {goal.targetFinishTime ? `· Target ${goal.targetFinishTime}` : ''}</Typography>
                </View>
              </View>
              <View style={styles.actionButtons}>
                {!goal.isSimple && (
                  <PressableScale
                    style={styles.iconButton}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Chat with coach"
                    onPress={() => { setGoalChatTarget(goal); setGoalChatMessages([]); setGoalChatInput(''); }}
                  >
                    <Icon icon={MessageCircle} variant="plain" size="sm" color={theme.colors.accent} />
                  </PressableScale>
                )}
                <PressableScale
                  style={styles.iconButton}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Edit goal"
                  onPress={() => openEdit(goal)}
                >
                  <Icon icon={Pencil} variant="plain" size="sm" color={theme.colors.textSecondary} />
                </PressableScale>
                <PressableScale
                  style={styles.iconButton}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Delete goal"
                  onPress={() => deleteGoal(goal.id)}
                >
                  <Icon icon={X} variant="plain" size="sm" color={theme.colors.error} />
                </PressableScale>
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
              const catIcon = goal.simpleCategory === 'Distance'
                ? <Icon icon={MapPin} variant="plain" size="sm" color="#fff" />
                : goal.simpleCategory === 'Time'
                  ? <Icon icon={Clock} variant="plain" size="sm" color="#fff" />
                  : goal.simpleCategory === 'HeartRate'
                    ? <Icon icon={Heart} variant="plain" size="sm" color="#fff" />
                    : <Icon icon={Activity} variant="plain" size="sm" color="#fff" />;
              // Source the card gradient from the design-system families so the
              // Simple card speaks the same colour language as the AI card:
              // success when complete, progress (sky) when nearly there, plan
              // (purple) otherwise — matching the phase pill / DonutRing accent.
              const gradColors: [string, string] = isDone
                ? theme.colors.gradients.success
                : pct > 60
                  ? theme.colors.gradients.progress
                  : theme.colors.gradients.plan;
              return (
                <>
                  <LinearGradient
                    colors={gradColors}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.simpleCard}
                  >
                    {/* Header row */}
                    <View style={styles.simpleHeaderRow}>
                      <View style={styles.simpleHeaderLabel}>
                        {catIcon}
                        <Typography style={styles.simpleHeaderText}>
                          {periodLabel}{actTypeLabel}
                        </Typography>
                      </View>
                      {isDone && <Icon icon={PartyPopper} variant="plain" size="md" color="#fff" />}
                    </View>

                    {/* Main numbers */}
                    <View style={styles.simpleNumberRow}>
                      <AnimatedNumber value={Number(prog.toFixed(1))} decimals={1} style={styles.simpleNumber} />
                      <Typography style={styles.simpleNumberUnit}>
                        / {goal.simpleTarget} {unit}
                      </Typography>
                    </View>

                    <View style={styles.simpleCaptionRow}>
                      {isDone && <Icon icon={Trophy} variant="plain" size="sm" color="#bbf7d0" />}
                      <Typography style={[styles.simpleCaption, isDone && styles.simpleCaptionDone]}>
                        {isDone ? 'Goal crushed! Great work!' : `${Math.round(pct)}% of your ${(goal.simplePeriod || 'week').toLowerCase()}ly target`}
                      </Typography>
                    </View>

                    <ProgressBar
                      progress={pct}
                      height={8}
                      gradient={isDone ? ['#bbf7d0', '#86efac'] : ['#ffffff', '#ffffff']}
                    />
                  </LinearGradient>

                  {/* History section */}
                  {(goal.history || []).length > 0 && (
                    <View style={{ marginTop: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Icon icon={TrendingUp} variant="plain" size="sm" color={theme.colors.textSecondary} />
                        <Typography variant="label" style={{ color: theme.colors.textSecondary }}>PAST PERIODS</Typography>
                      </View>
                      {(goal.history || []).slice(0, 4).map((h, i) => (
                        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                          <Typography variant="caption" style={{ color: theme.colors.textSecondary }}>{h.period}</Typography>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Typography variant="caption" style={{ color: h.completed ? theme.colors.success : theme.colors.text }}>
                              {h.achieved} / {h.target} {unit}
                            </Typography>
                            {h.completed
                              ? <Icon icon={CheckCircle2} variant="plain" size="sm" color={theme.colors.success} />
                              : <Icon icon={XCircle} variant="plain" size="sm" color={theme.colors.textSecondary} />}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              );
            })() : (() => {
              // Family-tinted phase pill — picks the phase whose date window
              // includes today, falls back to the first phase, and falls back
              // again to the free-text `goal.phase` for older plans.
              const phases = goal.phases || [];
              const currentPhase = phases.find(p => p.weekStart && p.weekEnd
                && parseISO(p.weekStart).getTime() <= Date.now()
                && parseISO(p.weekEnd).getTime() >= Date.now()) || phases[0];
              const currentPhaseIdx = currentPhase ? phases.indexOf(currentPhase) : -1;
              const phaseLabel = phaseShortName(stripMd((currentPhase?.name) || goal.phase || ''));
              const planFam = familyStyle('plan');
              const phaseFraction = phases.length > 0 && currentPhaseIdx >= 0
                ? `Phase ${currentPhaseIdx + 1} of ${phases.length}`
                : null;

              // Today's prescribed workout (Mon=0..Sun=6 in this codebase).
              const todayIdx = ((new Date().getDay() + 6) % 7) as 0|1|2|3|4|5|6;
              const todayPresc = currentPhase?.schedule?.find(p => p.dayOfWeek === todayIdx);
              const todayKind = todayPresc?.kind;
              const todayColor = todayKind ? WORKOUT_COLORS[todayKind] : theme.colors.textSecondary;

              return (
                <>
                  {/* Phase pill row */}
                  <View style={styles.phasePillRow}>
                    <View style={[styles.phasePill, { backgroundColor: planFam.tint, borderColor: planFam.accent + '55' }]}>
                      <View style={[styles.phasePillDot, { backgroundColor: planFam.accent }]} />
                      <Typography style={[styles.phasePillLabel, { color: planFam.accent }]}>
                        {phaseLabel || 'Plan'}
                      </Typography>
                    </View>
                    {phaseFraction && (
                      <Typography style={styles.phaseFraction}>{phaseFraction}</Typography>
                    )}
                  </View>

                  {/* Days-out hero row */}
                  <View style={styles.daysOutRow}>
                    <View style={{ flex: 1 }}>
                      <AnimatedNumber value={goal.daysRemaining} style={styles.daysOutNumber} />
                      <Typography style={styles.daysOutCaption}>
                        days until <Typography style={styles.daysOutDate}>{friendlyDate(goal.targetDate)}</Typography>
                      </Typography>
                      <View style={styles.daysOutSubRow}>
                        <Icon icon={Calendar} variant="plain" size="xs" color={theme.colors.textSecondary} />
                        <Typography style={styles.daysOutSub}>
                          {Math.floor(goal.daysRemaining / 7)} weeks to go
                        </Typography>
                      </View>
                    </View>
                    <View style={styles.progressDialWrap}>
                      <DonutRing
                        size={96}
                        stroke={8}
                        progress={Math.min(1, Math.max(0, (goal.progress || 0) / 100))}
                        color={planFam.accent}
                        gradient={planFam.gradient}
                        trackColor={'rgba(255,255,255,0.06)'}
                      >
                        <Typography style={styles.progressDialPct}>{Math.round(goal.progress || 0)}%</Typography>
                        <Typography style={styles.progressDialCaption}>PROGRESS</Typography>
                      </DonutRing>
                    </View>
                  </View>

                  <WeekStrip goal={goal} onPressDay={handleOpenDay} onSync={handleSyncGoal} />

                  {/* Today's prescribed workout — inset card */}
                  {todayPresc && (
                    <View style={[styles.todayInset, { borderColor: todayColor + '55' }]}>
                      <View style={[styles.todayIconPill, { backgroundColor: todayColor + '26', borderColor: todayColor + '55' }]}>
                        {workoutIcon(todayPresc.kind, 14, todayColor)}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Typography style={styles.todayLabel}>TODAY · {WORKOUT_LABELS[todayPresc.kind].toUpperCase()}</Typography>
                        <Typography style={styles.todayTitle} numberOfLines={2}>
                          {stripMd(todayPresc.title)}
                        </Typography>
                        <View style={styles.todayChipsRow}>
                          {todayPresc.distanceKm != null && (
                            <View style={[styles.todayChip, { borderColor: todayColor + '44' }]}>
                              <Icon icon={MapPin} variant="plain" size="xs" color={todayColor} />
                              <Typography style={[styles.todayChipText, { color: todayColor }]}>{todayPresc.distanceKm} km</Typography>
                            </View>
                          )}
                          {todayPresc.durationMin != null && (
                            <View style={[styles.todayChip, { borderColor: todayColor + '44' }]}>
                              <Icon icon={Clock} variant="plain" size="xs" color={todayColor} />
                              <Typography style={[styles.todayChipText, { color: todayColor }]}>{todayPresc.durationMin} min</Typography>
                            </View>
                          )}
                          {todayPresc.intensity && (
                            <View style={[styles.todayChip, { borderColor: todayColor + '44' }]}>
                              <Icon icon={Zap} variant="plain" size="xs" color={todayColor} />
                              <Typography style={[styles.todayChipText, { color: todayColor }]}>{todayPresc.intensity}</Typography>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  )}
                </>
              );
            })()}

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
                      <Icon icon={Zap} variant="plain" size="sm" color="#FBBF24" />
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
                    <Icon icon={Zap} variant="plain" size="sm" color="#FBBF24" />
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
          </StaggerItem>
        ))}

      </ScrollView>

      {/* ── AI Generating Overlay ── */}
      <Modal visible={isGenerating} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.genOverlay}>
          <LinearGradient colors={['#0a0a18', '#1a0a33', '#0a0a18']} style={styles.genGradient}>
            <Animated.View style={[styles.genIconWrap, pulseStyle]}>
              <LinearGradient colors={['#7c3aed', '#4f46e5']} style={styles.genIconBg}>
                <Icon icon={Zap} variant="plain" size="hero" color="#fff" />
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

      <BottomSheet
        visible={modalVisible}
        onClose={closeModal}
        title={editingGoal ? 'Edit Goal' : 'New Goal'}
        subtitle={editingGoal ? 'Refine the plan with your coach' : 'Set a target and let the coach plan it'}
        icon={Target}
        family="plan"
      >

            {/* Mode segmented control — hidden when editing AI goal */}
            {!(editingGoal && goalMode === 'AI') && (
              <>
                <SectionLabel family="plan">Mode</SectionLabel>
                <SegmentedControl
                  family="plan"
                  value={goalMode}
                  onChange={(v) => setGoalMode(v)}
                  segments={[
                    { value: 'AI', label: 'AI Coach' },
                    { value: 'Simple', label: 'Simple' },
                  ]}
                />
              </>
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
                        <Typography style={{ fontSize: 13, color: theme.colors.textSecondary, marginBottom: 12, lineHeight: 18 }}>
                          Ask your coach to refine the plan. Changes are applied on each send.
                        </Typography>
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
                        <FieldBlock
                          label="Your Message"
                          family="plan"
                          value={chatMessage}
                          onChangeText={setChatMessage}
                          placeholder={history.length === 0
                            ? 'e.g. "Make week 3 harder" or "I have 8 weeks not 12"'
                            : 'Continue the conversation…'}
                          multiline
                        />
                      </>
                    );
                  })()
                ) : (
                  // ── New AI goal form ──
                  <>
                    <SectionLabel family="plan">Goal</SectionLabel>
                    <FieldBlock
                      label="Goal Title"
                      family="plan"
                      value={newGoalTitle}
                      onChangeText={setNewGoalTitle}
                      placeholder="e.g. Marathon, 10k PB"
                    />
                    <FieldBlock
                      label="Target Date"
                      family="plan"
                      value={newGoalDate ? friendlyDate(newGoalDate) : ''}
                      placeholder="Tap to pick a date"
                      onPress={() => setShowDatePicker(v => !v)}
                      right={<Icon icon={Calendar} variant="plain" size="md" color={familyStyle('plan').accent} />}
                    />
                    {showDatePicker && Platform.OS === 'ios' && (
                      <View style={{ marginBottom: 12 }}>
                        <DateTimePicker
                          value={goalDate}
                          mode="date"
                          display="spinner"
                          minimumDate={new Date()}
                          onChange={onDateChange}
                          textColor={theme.colors.text}
                        />
                      </View>
                    )}
                    <Typography style={{ fontSize: 13, color: theme.colors.textSecondary, marginTop: 4, marginBottom: 8, lineHeight: 18 }}>
                      Your AI coach will generate phases + weekly workouts tailored to this target.
                    </Typography>
                  </>
                )}
              </>
            ) : (
              <>
                <SectionLabel family="plan">What to track</SectionLabel>
                <SegmentedControl
                  family="plan"
                  value={simpleCategory}
                  onChange={(v) => setSimpleCategory(v)}
                  segments={[
                    { value: 'Frequency', label: 'Freq' },
                    { value: 'Distance', label: 'Dist' },
                    { value: 'HeartRate', label: 'HR' },
                    { value: 'Time', label: 'Time' },
                  ]}
                />

                <SectionLabel family="plan">Activity</SectionLabel>
                <SegmentedControl
                  family="plan"
                  value={simpleActivityType}
                  onChange={(v) => setSimpleActivityType(v)}
                  segments={[
                    { value: 'All', label: 'All' },
                    { value: 'Run', label: 'Run' },
                    { value: 'Walk', label: 'Walk' },
                    { value: 'Ride', label: 'Ride' },
                  ]}
                />

                <SectionLabel family="plan">Reset period</SectionLabel>
                <SegmentedControl
                  family="plan"
                  value={simplePeriod}
                  onChange={(v) => setSimplePeriod(v)}
                  segments={[
                    { value: 'Week', label: 'Weekly' },
                    { value: 'Month', label: 'Monthly' },
                  ]}
                />

                <SectionLabel family="plan">Target</SectionLabel>
                <FieldBlock
                  label={`Target ${simpleCategory === 'Distance' ? '(km)' : simpleCategory === 'Time' ? '(hours)' : simpleCategory === 'HeartRate' ? '(avg bpm)' : '(# sessions)'}`}
                  family="plan"
                  value={simpleTarget}
                  onChangeText={setSimpleTarget}
                  keyboardType="numeric"
                  numeric
                  placeholder={simpleCategory === 'Distance' ? 'e.g. 30' : simpleCategory === 'Time' ? 'e.g. 5' : simpleCategory === 'HeartRate' ? 'e.g. 145' : 'e.g. 4'}
                />
                <FieldBlock
                  label="Custom title (optional)"
                  family="plan"
                  value={newGoalTitle}
                  onChangeText={setNewGoalTitle}
                  placeholder="Leave blank for auto-generated"
                />
              </>
            )}

            {/* Android inline picker */}
            {showDatePicker && Platform.OS === 'android' && (
              <DateTimePicker
                value={goalDate}
                mode="date"
                display="default"
                minimumDate={new Date()}
                onChange={onDateChange}
              />
            )}

            <SheetCTA
              family="plan"
              icon={goalMode === 'AI' ? Sparkles : Target}
              label={editingGoal ? 'Save Changes' : goalMode === 'AI' ? 'Generate Plan' : 'Save Goal'}
              loading={isGenerating}
              onPress={handleAddGoal}
            />
      </BottomSheet>

      {/* ── Per-Goal Coach Chat Modal ── */}
      <BottomSheet
        visible={!!goalChatTarget}
        onClose={() => setGoalChatTarget(null)}
        title="Coach Chat"
        subtitle="Refine this goal with the AI coach"
        icon={MessageCircle}
        family="social"
        maxHeightPct={92}
      >
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

            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <FieldBlock
                  label="Your Message"
                  family="social"
                  value={goalChatInput}
                  onChangeText={setGoalChatInput}
                  placeholder="Ask your coach…"
                  multiline
                  maxLength={400}
                />
              </View>
              <TouchableOpacity
                disabled={!goalChatInput.trim() || goalChatLoading}
                activeOpacity={0.85}
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
                style={[
                  {
                    width: 44, height: 44, borderRadius: 22,
                    alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', marginBottom: 12,
                  },
                  (!goalChatInput.trim() || goalChatLoading)
                    ? { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }
                    : theme.shadows.glow(familyStyle('social').accent),
                ]}
              >
                {(!goalChatInput.trim() || goalChatLoading) ? (
                  <Icon icon={Send} variant="plain" size="lg" color={theme.colors.textSecondary} />
                ) : (
                  <LinearGradient
                    colors={familyStyle('social').gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icon icon={Send} variant="plain" size="lg" color="#fff" />
                  </LinearGradient>
                )}
              </TouchableOpacity>
            </View>
      </BottomSheet>

      <DayDetailSheet
        day={dayDetail}
        onClose={() => setDayDetail(null)}
        onCheckIn={handleManualCheckIn}
      />

    </SafeAreaView>
  );
}

