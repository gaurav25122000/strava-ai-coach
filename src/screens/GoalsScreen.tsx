import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, Platform, FlatList, StyleSheet, Animated as RNAnimated } from 'react-native';
import { styles, goalMarkdownStyles } from './GoalsScreen.styles';
import Markdown from 'react-native-markdown-display';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { theme, withAlpha } from '../theme';
import { Card } from '../components/Card';
import { Typography } from '../components/Typography';
import { ProgressBar } from '../components/ProgressBar';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { useStore, secureSettingsStorage, Goal, Phase, CheckIn, DailyPrescription } from '../store/useStore';
import {
  Flame, Bike, Footprints, Plus, Zap, Calendar, CalendarDays, RefreshCw, Trophy, TrendingUp,
  Clock, Heart, MapPin, Activity, Pencil, MessageCircle, Send, Target, Sparkles, PartyPopper,
  Check, CheckCircle2, XCircle, Trash2, LucideIcon,
} from 'lucide-react-native';
import { Icon } from '../components/Icon';
import { FieldBlock, SegmentedControl, SectionLabel } from '../components/SheetUI';
import { AIService, ChatMessage } from '../services/ai';
import { computeProgress, expectedTrainingDays, prescriptionFor } from '../services/goalProgress';
import { startGoalGeneration } from '../services/goalGeneration';
import { phaseForDate, scheduleForDate } from '../services/planSchedule';
import { performStravaSync } from '../services/syncRunner';
import { familyStyle } from '../utils/widgetFamilies';
import { workoutIcon, WORKOUT_COLORS, WORKOUT_LABELS, REST_LABELS } from '../utils/workoutKinds';
import { localDateStr, mondayIndex, weekKey } from '../utils/dates';
import { differenceInCalendarDays, parseISO, format, getWeek, getMonth, getYear, startOfWeek, startOfMonth, endOfWeek, endOfMonth } from 'date-fns';
import { WeekStrip, planWeekStarts } from '../components/WeekStrip';
import { DayDetailSheet, DayContext, DayCheckInPayload } from '../components/DayDetailSheet';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PressableScale } from '../components/PressableScale';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { SkeletonWidget } from '../components/SkeletonPresets';
import { DonutRing } from '../components/DonutRing';
import { StaggerItem } from '../components/Stagger';

const DOW_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Map a free-text phase name to its canonical short label. Keeps the stepper
// pills terse even when the LLM returned "Base Building Phase".
function phaseShortName(raw: string): 'Base' | 'Build' | 'Peak' | 'Taper' | string {
  const s = (raw || '').toLowerCase();
  if (s.includes('taper')) return 'Taper';
  if (s.includes('peak') || s.includes('race')) return 'Peak';
  if (s.includes('build') || s.includes('strength')) return 'Build';
  if (s.includes('base') || s.includes('aerobic') || s.includes('foundation')) return 'Base';
  return raw.split('\n')[0].split(/\s+/).slice(0, 2).join(' ');
}

// Format a date string (yyyy-MM-dd) into a friendly "May 12, 2026" caption.
function friendlyDate(iso: string): string {
  try { return format(parseISO(iso), 'MMM d, yyyy'); } catch { return iso; }
}

// Days until the target, recomputed at render time — the stored daysRemaining
// snapshot goes stale the day after the goal is created.
function daysLeftOf(targetDate: string): number {
  try { return Math.max(0, differenceInCalendarDays(parseISO(targetDate), new Date())); } catch { return 0; }
}

// Strip LLM markdown artefacts.
const stripMd = (text: string) =>
  (text || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^\s*\*\s+/gm, '• ')
    .replace(/\\n/g, '\n')
    .trim();

// Pick the goal's title-row glyph from its semantics rather than a hardcoded id.
function goalIcon(goal: Goal): LucideIcon {
  const t = (goal.title || '').toLowerCase();
  const act = goal.simpleActivityType;
  if (act === 'Ride' || t.includes('ride') || t.includes('cycl') || t.includes('bike')) return Bike;
  if (act === 'Walk' || t.includes('walk')) return Footprints;
  if (t.includes('hyrox') || t.includes('marathon') || t.includes('race') || t.includes('10k') || t.includes('5k') || t.includes('half')) return Flame;
  return Footprints;
}

// One-line summary of the current week's training days for the plan-diff
// sheet — lets the athlete see at a glance what THIS week now asks of them.
function currentWeekLine(phases?: Phase[]): string | null {
  const schedule = scheduleForDate(phases, new Date());
  if (!schedule) return null;
  return schedule
    .filter((d) => d.kind !== 'REST')
    .map((d) => `${DOW_SHORT[d.dayOfWeek]} ${WORKOUT_LABELS[d.kind]}${d.distanceKm ? ` ${d.distanceKm}k` : ''}`)
    .join(' · ');
}

// Per-week volume progression line ("28 → 31 → 34 → 25 km").
function volumeLine(p?: Phase): string | null {
  if (!p?.weeks?.length) return null;
  return `${p.weeks.map((w) => (w.volumeKm != null ? Math.round(w.volumeKm) : '–')).join(' → ')} km`;
}

function successHaptic() {
  if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

const DOT_COLORS = [
  familyStyle('activity').accent,
  familyStyle('social').accent,
  familyStyle('plan').accent,
];

// The single "thinking" dots component — reused by the chat sheet footer and
// the full-screen generating overlay.
function GoalThinkingDots() {
  const anims = useRef(DOT_COLORS.map(() => new RNAnimated.Value(0))).current;
  useEffect(() => {
    const animations = anims.map((anim, i) =>
      RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.delay(i * 160),
          RNAnimated.timing(anim, { toValue: 1, duration: 380, useNativeDriver: true }),
          RNAnimated.timing(anim, { toValue: 0, duration: 380, useNativeDriver: true }),
          RNAnimated.delay((DOT_COLORS.length - i - 1) * 160),
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
            backgroundColor: DOT_COLORS[i],
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }],
            opacity: anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 1, 0.4] }),
          }}
        />
      ))}
    </View>
  );
}

interface PlanDiff {
  goal: Goal;
  plan: Partial<Goal>;
  updatedHistory: NonNullable<Goal['chatHistory']>;
}

export default function GoalsScreen() {
  const goals = useStore(s => s.goals);
  const activities = useStore(s => s.activities);
  const settings = useStore(s => s.settings);
  const userProfile = useStore(s => s.userProfile);
  const bestEfforts = useStore(s => s.bestEfforts);
  const addGoal = useStore(s => s.addGoal);
  const updateGoal = useStore(s => s.updateGoal);
  const deleteGoal = useStore(s => s.deleteGoal);
  const addCheckIn = useStore(s => s.addCheckIn);
  const setToast = useStore(s => s.setToast);

  // Day-detail sheet target — null when closed.
  const [dayDetail, setDayDetail] = useState<DayContext | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [editingGoal, setEditingGoal] = useState<string | null>(null); // goal id being edited
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDate, setNewGoalDate] = useState('');
  const [newGoalFinishTime, setNewGoalFinishTime] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [goalMode, setGoalMode] = useState<'AI' | 'Simple'>('AI');
  const [simpleCategory, setSimpleCategory] = useState<'Frequency' | 'Distance' | 'HeartRate' | 'Time'>('Frequency');
  const [simplePeriod, setSimplePeriod] = useState<'Week' | 'Month'>('Week');
  const [simpleTarget, setSimpleTarget] = useState('10');
  const [simpleActivityType, setSimpleActivityType] = useState<'All' | 'Run' | 'Walk' | 'Ride'>('All');
  const [chatMessage, setChatMessage] = useState('');

  // Card-level UI state
  const [confirmDelete, setConfirmDelete] = useState<Goal | null>(null);
  const [phaseDetail, setPhaseDetail] = useState<{ goal: Goal; index: number } | null>(null);
  const [planDiff, setPlanDiff] = useState<PlanDiff | null>(null);
  const [weekPages, setWeekPages] = useState<Record<string, string>>({}); // goalId → weekStart
  const [syncingGoalId, setSyncingGoalId] = useState<string | null>(null);

  // Per-goal coach chat
  const [goalChatTarget, setGoalChatTarget] = useState<Goal | null>(null);
  const [goalChatMessages, setGoalChatMessages] = useState<ChatMessage[]>([]);
  const [goalChatInput, setGoalChatInput] = useState('');
  const [goalChatLoading, setGoalChatLoading] = useState(false);
  const goalChatListRef = useRef<FlatList>(null);

  const goalDate = newGoalDate ? parseISO(newGoalDate) : new Date();

  const onDateChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selected) setNewGoalDate(localDateStr(selected));
  };

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

  // ── Check-in plumbing ──────────────────────────────────────────────

  // WeekStrip / TODAY block → day sheet, seeded with that date's prescription
  // and any existing check-in.
  const handleOpenDay = (goal: Goal, date: string) => {
    const d = parseISO(date);
    const presc = prescriptionFor(goal, d);
    const existing = (goal.checkIns || []).find(c => c.date === date);
    setDayDetail({
      goalId: goal.id,
      date,
      dayOfWeek: mondayIndex(d) as DayContext['dayOfWeek'],
      prescription: presc,
      existingCheckIn: existing,
    });
  };

  // Persist a check-in, then re-derive plan progress so the dial and chips
  // update without waiting for a Strava sync.
  const persistCheckIn = (goalId: string, checkIn: CheckIn) => {
    addCheckIn(goalId, checkIn);
    const fresh = useStore.getState().goals.find(g => g.id === goalId);
    if (fresh) updateGoal(computeProgress(fresh, useStore.getState().activities));
  };

  // One-tap Mark done / Skip from the TODAY block.
  const quickCheckIn = (goal: Goal, presc: DailyPrescription, completed: boolean) => {
    const today = new Date();
    persistCheckIn(goal.id, {
      date: localDateStr(today),
      dayOfWeek: mondayIndex(today) as CheckIn['dayOfWeek'],
      source: 'MANUAL',
      workoutKind: presc.kind,
      completed,
    });
    if (completed) successHaptic();
    setToast({
      title: completed ? (presc.kind === 'REST' ? 'Rest day logged' : 'Workout done') : 'Skipped',
      message: completed ? 'Nice work — progress updated.' : 'Marked as skipped for today.',
      type: 'success',
    });
  };

  const handleManualCheckIn = (day: DayContext, payload: DayCheckInPayload) => {
    persistCheckIn(day.goalId, {
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      source: 'MANUAL',
      workoutKind: day.prescription?.kind || 'EASY',
      completed: payload.completed,
      notes: payload.notes || undefined,
      perceivedEffort: payload.rpe,
      activityId: payload.activityId,
    });
    setDayDetail(null);
    if (payload.completed) successHaptic();
    setToast({ title: payload.completed ? 'Logged' : 'Saved', message: 'Check-in updated.', type: 'success' });
  };

  // Real Strava sync, then report only the NEW auto-matches.
  const handleSyncGoal = async (goal: Goal) => {
    if (syncingGoalId) return;
    setSyncingGoalId(goal.id);
    const before = (goal.checkIns || []).filter(c => c.source === 'STRAVA').length;
    try {
      const result = await performStravaSync({ force: true });
      let fresh = useStore.getState().goals.find(g => g.id === goal.id);
      if (!result && fresh) {
        // Not connected to Strava — still re-derive from local activities.
        fresh = computeProgress(fresh, useStore.getState().activities);
        updateGoal(fresh);
      }
      const after = (fresh?.checkIns || []).filter(c => c.source === 'STRAVA').length;
      const diff = Math.max(0, after - before);
      setToast({
        title: 'Synced',
        message: diff > 0
          ? `${diff} new activit${diff === 1 ? 'y' : 'ies'} matched to your plan.`
          : 'No new matches — plan is up to date.',
        type: 'success',
      });
    } catch {
      setToast({ title: 'Sync failed', message: 'Could not reach Strava. Try again.', type: 'error' });
    } finally {
      setSyncingGoalId(null);
    }
  };

  // ── Simple-goal progress ───────────────────────────────────────────

  const calculateSimpleGoalProgress = (goal: Goal) => {
    if (!goal.isSimple) return 0;
    const now = new Date();
    const start = goal.simplePeriod === 'Week' ? startOfWeek(now, { weekStartsOn: 1 }) : startOfMonth(now);
    const end   = goal.simplePeriod === 'Week' ? endOfWeek(now, { weekStartsOn: 1 }) : endOfMonth(now);
    const actType = goal.simpleActivityType || 'All';
    const relevantActs = activities.filter(a => {
      const d = parseISO(a.startDate);
      return d >= start && d <= end && (actType === 'All' || a.type === actType);
    });
    if (goal.simpleCategory === 'Frequency') return relevantActs.length;
    if (goal.simpleCategory === 'Distance') return relevantActs.reduce((sum, a) => sum + a.distance / 1000, 0);
    if (goal.simpleCategory === 'HeartRate') {
      const hrActs = relevantActs.filter(a => a.averageHeartRate && a.averageHeartRate > 0);
      if (!hrActs.length) return 0;
      return hrActs.reduce((sum, a) => sum + a.averageHeartRate!, 0) / hrActs.length;
    }
    if (goal.simpleCategory === 'Time') return relevantActs.reduce((sum, a) => sum + a.movingTime / 3600, 0);
    return 0;
  };

  // ── Goal form ──────────────────────────────────────────────────────

  const openEdit = (goal: Goal) => {
    setEditingGoal(goal.id);
    setNewGoalTitle(goal.title);
    setNewGoalDate(goal.targetDate);
    setNewGoalFinishTime(goal.targetFinishTime || '');
    setChatMessage('');
    if (goal.isSimple) {
      setGoalMode('Simple');
      setSimpleCategory(goal.simpleCategory || 'Frequency');
      setSimplePeriod(goal.simplePeriod || 'Week');
      setSimpleTarget(String(goal.simpleTarget ?? '10'));
      setSimpleActivityType(goal.simpleActivityType || 'All');
    } else {
      setGoalMode('AI');
    }
    setFormVisible(true);
  };

  const openCreate = () => {
    setEditingGoal(null);
    setNewGoalTitle('');
    setNewGoalDate('');
    setNewGoalFinishTime('');
    setFormVisible(true);
  };

  const closeForm = () => {
    setFormVisible(false);
    setEditingGoal(null);
    setNewGoalTitle('');
    setNewGoalDate('');
    setNewGoalFinishTime('');
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
        targetDate: newGoalDate || localDateStr(new Date()),
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
      closeForm();
      return;
    }

    // Editing an AI goal — continue as chat, then review the diff before applying.
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
        setChatMessage('');
        setEditingGoal(null);
        setFormVisible(false);
        // Don't apply silently — surface the diff for review.
        setPlanDiff({ goal: existing, plan, updatedHistory });
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

    // Fire-and-forget: the plan builds in the background (GenerationPill shows
    // progress above the tab bar) so the app stays fully usable meanwhile.
    startGoalGeneration({
      title: newGoalTitle,
      targetDate: newGoalDate,
      targetFinishTime: newGoalFinishTime.trim() || undefined,
    });

    setEditingGoal(null);
    setFormVisible(false);
    setNewGoalTitle('');
    setNewGoalDate('');
    setNewGoalFinishTime('');
  };

  // ── Plan-diff apply (never touches checkIns) ───────────────────────

  const applyPlanDiff = () => {
    if (!planDiff) return;
    const latest = useStore.getState().goals.find(g => g.id === planDiff.goal.id) ?? planDiff.goal;
    const merged: Goal = {
      ...latest,
      phase: planDiff.plan.phase ?? latest.phase,
      phases: planDiff.plan.phases ?? latest.phases,
      weeklyVolume: planDiff.plan.weeklyVolume ?? latest.weeklyVolume,
      longRun: planDiff.plan.longRun ?? latest.longRun,
      keyWorkout: planDiff.plan.keyWorkout ?? latest.keyWorkout,
      chatHistory: planDiff.updatedHistory,
    };
    updateGoal(computeProgress(merged, useStore.getState().activities));
    setPlanDiff(null);
    successHaptic();
    setToast({ title: 'Plan updated', message: 'Your coach revised the plan.', type: 'success' });
  };

  // ── Per-goal coach chat ────────────────────────────────────────────

  const sendGoalChat = async () => {
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
        settings.coachPersonality, userProfile, activities, goalChatTarget,
        { bestEfforts, unit: settings.unit }
      );
      setGoalChatMessages([...next, { role: 'assistant', text: reply }]);
    } catch (e: any) {
      setToast({ title: 'Error', message: e?.message || 'Request failed.', type: 'error' });
    } finally {
      setGoalChatLoading(false);
      setTimeout(() => goalChatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const planFam = familyStyle('plan');

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
            onPress={openCreate}
          >
            <Icon icon={Plus} variant="plain" size="md" color={theme.colors.onAccent} />
          </PressableScale>
        </LinearGradient>

        {/* Initial-hydrate skeleton — the persisted store can momentarily return
            undefined while loading from storage. */}
        {goals == null && <SkeletonWidget />}

        {goals && goals.length === 0 && (
          <View style={styles.emptyState}>
            <LinearGradient
              colors={theme.colors.gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emptyIconRing}
            >
              <View style={styles.emptyIconWrap}>
                <Icon icon={Target} variant="plain" size="xl" color={theme.colors.primary} />
              </View>
            </LinearGradient>
            <Typography style={styles.emptyTitle}>Set your first goal</Typography>
            <Typography style={styles.emptySub}>
              Pick a race date or a simple weekly target — your AI coach will build the plan around it.
            </Typography>

            <View style={styles.emptyFeatures}>
              {(
                [
                  [CalendarDays, 'Phase-by-phase plan, week by week to race day'],
                  [Zap, "Daily workouts sized to your actual training history"],
                  [RefreshCw, 'Strava runs auto-match your plan as check-ins'],
                ] as const
              ).map(([FeatIcon, text]) => (
                <View key={text} style={styles.emptyFeatureRow}>
                  <View style={styles.emptyFeatureIcon}>
                    <Icon icon={FeatIcon} variant="plain" size="sm" color={theme.colors.primary} />
                  </View>
                  <Typography style={styles.emptyFeatureText}>{text}</Typography>
                </View>
              ))}
            </View>

            <Button
              title="Create a Goal"
              icon={Plus}
              onPress={openCreate}
              fullWidth
              style={{ marginTop: 20 }}
            />
            <Typography style={styles.emptyFootnote}>Built from your synced Strava history</Typography>
          </View>
        )}

        {(goals || []).map((goal, idx) => (
          <StaggerItem key={goal.id} index={idx}>
            <Card variant="elevated" style={styles.goalCard}>

            {/* 1 ── Header: title, recomputed days-left chip, actions */}
            <View style={styles.goalHeader}>
              <View style={styles.goalTitleRow}>
                <Icon icon={goalIcon(goal)} variant="plain" size="lg" color={planFam.accent} />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Typography variant="h3" color={planFam.accent}>{goal.title}</Typography>
                  <Typography variant="caption">
                    {friendlyDate(goal.targetDate)}{goal.targetFinishTime ? ` · Target ${goal.targetFinishTime}` : ''}
                  </Typography>
                  {!goal.isSimple && (
                    <View style={styles.daysChip}>
                      <Icon icon={Calendar} variant="plain" size="xs" color={planFam.accent} />
                      <Typography style={styles.daysChipText}>
                        {daysLeftOf(goal.targetDate)} days left
                      </Typography>
                    </View>
                  )}
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
                  onPress={() => setConfirmDelete(goal)}
                >
                  <Icon icon={Trash2} variant="plain" size="sm" color={theme.colors.error} />
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
              const catGlyph = goal.simpleCategory === 'Distance' ? MapPin
                : goal.simpleCategory === 'Time' ? Clock
                : goal.simpleCategory === 'HeartRate' ? Heart
                : Activity;
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
                    <View style={styles.simpleHeaderRow}>
                      <View style={styles.simpleHeaderLabel}>
                        <Icon icon={catGlyph} variant="plain" size="sm" color={theme.colors.onAccent} />
                        <Typography style={styles.simpleHeaderText}>
                          {periodLabel}{actTypeLabel}
                        </Typography>
                      </View>
                      {isDone && <Icon icon={PartyPopper} variant="plain" size="md" color={theme.colors.onAccent} />}
                    </View>

                    <View style={styles.simpleNumberRow}>
                      <AnimatedNumber value={Number(prog.toFixed(1))} decimals={1} style={styles.simpleNumber} />
                      <Typography style={styles.simpleNumberUnit}>
                        / {goal.simpleTarget} {unit}
                      </Typography>
                    </View>

                    <View style={styles.simpleCaptionRow}>
                      {isDone && <Icon icon={Trophy} variant="plain" size="sm" color={theme.colors.onAccent} />}
                      <Typography style={[styles.simpleCaption, isDone && styles.simpleCaptionDone]}>
                        {isDone ? 'Goal crushed! Great work!' : `${Math.round(pct)}% of your ${(goal.simplePeriod || 'week').toLowerCase()}ly target`}
                      </Typography>
                    </View>

                    <ProgressBar progress={pct} height={8} color={theme.colors.onAccent} />
                  </LinearGradient>

                  {(goal.history || []).length > 0 && (
                    <View style={{ marginTop: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Icon icon={TrendingUp} variant="plain" size="sm" color={theme.colors.textSecondary} />
                        <Typography variant="label" style={{ color: theme.colors.textSecondary }}>PAST PERIODS</Typography>
                      </View>
                      {(goal.history || []).slice(0, 4).map((h, i) => (
                        <View key={i} style={styles.historyRow}>
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
              const phases = goal.phases || [];
              const today = new Date();
              const todayKey = localDateStr(today);

              // 2 ── TODAY
              const todayPresc = prescriptionFor(goal, today);
              const todayCi = (goal.checkIns || []).find(c => c.date === todayKey);
              const todayColor = todayPresc ? WORKOUT_COLORS[todayPresc.kind] : theme.colors.textSecondary;

              // 3 ── Week paging
              const weekStarts = planWeekStarts(goal);
              const currentMonday = weekKey(today);
              const defaultWeek = weekStarts.includes(currentMonday)
                ? currentMonday
                : weekStarts.length
                  ? (currentMonday < weekStarts[0] ? weekStarts[0] : weekStarts[weekStarts.length - 1])
                  : null;
              const picked = weekPages[goal.id];
              const selectedWeek = picked && weekStarts.includes(picked) ? picked : defaultWeek;

              // 4 ── Phase stepper
              const activePhase = phaseForDate(phases, today);

              // 5 ── Progress
              const yesterday = new Date(today.getTime() - 86400000);
              const expected = expectedTrainingDays(goal, yesterday);
              const expectedSet = new Set(expected);
              const doneCount = (goal.checkIns || []).filter(c => c.completed && expectedSet.has(c.date)).length;

              return (
                <>
                  {/* TODAY block */}
                  {todayPresc && (
                    <View style={[styles.todayCard, { borderColor: withAlpha(todayColor, 'strong') }]}>
                      <View style={styles.todayHeaderRow}>
                        <Typography style={styles.todayEyebrow}>Today</Typography>
                        <View style={[styles.kindChip, { backgroundColor: withAlpha(todayColor, 'tint'), borderColor: withAlpha(todayColor, 'strong') }]}>
                          {workoutIcon(todayPresc.kind, 12, todayColor)}
                          <Typography style={[styles.kindChipText, { color: todayColor }]}>
                            {WORKOUT_LABELS[todayPresc.kind]}
                          </Typography>
                        </View>
                      </View>
                      <Typography style={styles.todayTitle} numberOfLines={2}>{stripMd(todayPresc.title)}</Typography>
                      {!!todayPresc.description && (
                        <Typography style={styles.todayDesc} numberOfLines={2}>{stripMd(todayPresc.description)}</Typography>
                      )}
                      <View style={styles.todayPillsRow}>
                        {todayPresc.distanceKm != null && (
                          <View style={[styles.todayPill, { borderColor: withAlpha(todayColor, 'medium') }]}>
                            <Icon icon={MapPin} variant="plain" size="xs" color={todayColor} />
                            <Typography style={[styles.todayPillText, { color: todayColor }]}>{todayPresc.distanceKm} km</Typography>
                          </View>
                        )}
                        {todayPresc.durationMin != null && (
                          <View style={[styles.todayPill, { borderColor: withAlpha(todayColor, 'medium') }]}>
                            <Icon icon={Clock} variant="plain" size="xs" color={todayColor} />
                            <Typography style={[styles.todayPillText, { color: todayColor }]}>{todayPresc.durationMin} min</Typography>
                          </View>
                        )}
                        {todayPresc.intensity && (
                          <View style={[styles.todayPill, { borderColor: withAlpha(todayColor, 'medium') }]}>
                            <Icon icon={Zap} variant="plain" size="xs" color={todayColor} />
                            <Typography style={[styles.todayPillText, { color: todayColor }]}>{todayPresc.intensity}</Typography>
                          </View>
                        )}
                      </View>
                      {todayPresc.kind === 'REST' && todayPresc.rest && (
                        <View style={styles.restNote}>
                          <Typography variant="label" style={{ marginBottom: 2 }}>
                            {REST_LABELS[todayPresc.rest.kind] || todayPresc.rest.kind}
                          </Typography>
                          <Typography variant="caption" style={{ lineHeight: 18 }}>{todayPresc.rest.note}</Typography>
                        </View>
                      )}
                      {todayCi ? (
                        <View style={styles.todayStateRow}>
                          <Icon
                            icon={todayCi.completed ? CheckCircle2 : XCircle}
                            variant="plain"
                            size="sm"
                            color={todayCi.completed ? theme.colors.success : theme.colors.textSecondary}
                          />
                          <Typography style={[styles.todayStateText, { color: todayCi.completed ? theme.colors.success : theme.colors.textSecondary }]}>
                            {todayCi.completed
                              ? `Done${todayCi.perceivedEffort ? ` · RPE ${todayCi.perceivedEffort}` : ''}`
                              : 'Skipped'}
                          </Typography>
                          <Button title="Edit" variant="ghost" size="sm" family="plan" onPress={() => handleOpenDay(goal, todayKey)} />
                        </View>
                      ) : (
                        <View style={styles.todayActions}>
                          <Button
                            title={todayPresc.kind === 'REST' ? 'Done resting' : 'Mark done'}
                            family="plan"
                            size="sm"
                            icon={Check}
                            onPress={() => quickCheckIn(goal, todayPresc, true)}
                            style={{ flex: 1 }}
                          />
                          {todayPresc.kind !== 'REST' && (
                            <Button
                              title="Skip"
                              variant="ghost"
                              size="sm"
                              onPress={() => quickCheckIn(goal, todayPresc, false)}
                              style={{ flex: 1 }}
                            />
                          )}
                        </View>
                      )}
                    </View>
                  )}

                  {/* Week strip with paging */}
                  {selectedWeek && (
                    <WeekStrip
                      goal={goal}
                      weekStartDate={selectedWeek}
                      weekIndex={weekStarts.indexOf(selectedWeek)}
                      weekCount={weekStarts.length}
                      onChangeWeek={(ws) => setWeekPages(p => ({ ...p, [goal.id]: ws }))}
                      onPressDay={handleOpenDay}
                      onSync={handleSyncGoal}
                      syncing={syncingGoalId === goal.id}
                      activities={activities}
                    />
                  )}

                  {/* Phase stepper */}
                  {phases.length > 0 && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ marginTop: theme.spacing.md }}
                      contentContainerStyle={styles.stepperRow}
                    >
                      {phases.map((p, i) => {
                        const isActive = activePhase === p;
                        const isDone = !isActive && !!p.weekEnd && p.weekEnd < todayKey;
                        return (
                          <PressableScale
                            key={i}
                            onPress={() => setPhaseDetail({ goal, index: i })}
                            style={[
                              styles.stepperPill,
                              isActive ? styles.stepperPillActive : isDone ? styles.stepperPillDone : styles.stepperPillFuture,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={`Phase ${i + 1}: ${stripMd(p.name)}`}
                          >
                            {isActive && (
                              <LinearGradient
                                colors={planFam.gradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={StyleSheet.absoluteFillObject}
                              />
                            )}
                            {isDone && <Icon icon={Check} variant="plain" size="xs" color={theme.colors.success} />}
                            <Typography
                              style={[
                                styles.stepperPillText,
                                { color: isActive ? theme.colors.onAccent : isDone ? theme.colors.success : theme.colors.textSecondary },
                              ]}
                            >
                              {phaseShortName(stripMd(p.name))}
                            </Typography>
                          </PressableScale>
                        );
                      })}
                    </ScrollView>
                  )}

                  {/* Legacy AI goals without phases */}
                  {phases.length === 0 && (
                    <>
                      <View style={styles.phaseBox}>
                        <Typography variant="label">PHASE</Typography>
                        <Typography variant="h3" color={theme.colors.text} style={{ marginTop: 6 }}>
                          {stripMd(goal.phase.split('\n')[0])}
                        </Typography>
                        <Typography variant="caption" style={{ marginTop: 4, lineHeight: 18 }}>
                          {stripMd(goal.phase.split('\n').slice(1).join(' '))}
                        </Typography>
                      </View>
                      {!!goal.keyWorkout && (
                        <View style={styles.workoutBox}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <Icon icon={Zap} variant="plain" size="sm" color={theme.colors.families.records.accent} />
                            <Typography variant="label" style={{ marginLeft: 8 }}>KEY WORKOUT THIS PHASE</Typography>
                          </View>
                          <Typography variant="body" style={{ marginBottom: 4, fontWeight: '700' }}>
                            {stripMd(goal.keyWorkout.split('\n')[0])}
                          </Typography>
                          <Typography variant="caption" style={{ lineHeight: 18 }}>
                            {stripMd(goal.keyWorkout.includes('\n') ? goal.keyWorkout.substring(goal.keyWorkout.indexOf('\n') + 1) : '')}
                          </Typography>
                        </View>
                      )}
                    </>
                  )}

                  {/* Progress row */}
                  <View style={styles.progressRow}>
                    <DonutRing
                      size={92}
                      stroke={8}
                      progress={Math.min(1, Math.max(0, (goal.progress || 0) / 100))}
                      color={planFam.accent}
                      gradient={planFam.gradient}
                      trackColor={withAlpha(theme.colors.text, 'faint')}
                    >
                      <Typography style={styles.progressDialPct}>{Math.round(goal.progress || 0)}%</Typography>
                      <Typography style={styles.progressDialCaption}>PLAN</Typography>
                    </DonutRing>
                    <View style={styles.progressBars}>
                      {expected.length > 0 && (
                        <Typography style={styles.progressCaption}>
                          {doneCount} of {expected.length} planned sessions
                        </Typography>
                      )}
                      <View>
                        <View style={styles.barLabelRow}>
                          <Typography style={styles.barLabel}>Weekly volume</Typography>
                          <Typography style={styles.barValue}>{goal.weeklyVolume.current} / {goal.weeklyVolume.target} km</Typography>
                        </View>
                        <ProgressBar
                          progress={goal.weeklyVolume.target > 0 ? (goal.weeklyVolume.current / goal.weeklyVolume.target) * 100 : 0}
                          color={familyStyle('progress').accent}
                        />
                      </View>
                      <View>
                        <View style={styles.barLabelRow}>
                          <Typography style={styles.barLabel}>Long run</Typography>
                          <Typography style={styles.barValue}>{goal.longRun.current} / {goal.longRun.target} km</Typography>
                        </View>
                        <ProgressBar
                          progress={goal.longRun.target > 0 ? (goal.longRun.current / goal.longRun.target) * 100 : 0}
                          color={theme.colors.success}
                        />
                      </View>
                    </View>
                  </View>
                </>
              );
            })()}

            {goal.title.toLowerCase().includes('hyrox') && (
               <View style={[styles.workoutBox, { borderLeftColor: theme.colors.error, marginTop: 8 }]}>
                 <Typography variant="label" style={{ marginBottom: 8 }} color={theme.colors.error}>HYROX STATION GUIDE</Typography>
                 <Typography variant="caption" style={{ marginBottom: 4 }}>1. Ski Erg - Pace yourself, use legs.</Typography>
                 <Typography variant="caption" style={{ marginBottom: 4 }}>2. Sled Push - Low body position.</Typography>
                 <Typography variant="caption" style={{ marginBottom: 4 }}>3. Sled Pull - Short quick steps.</Typography>
                 <Typography variant="caption">4. Burpee Broad Jumps - Maintain rhythm.</Typography>
               </View>
            )}

          </Card>
          </StaggerItem>
        ))}

      </ScrollView>

      {/* ── New / Edit goal ── */}
      <Sheet
        visible={formVisible}
        onClose={closeForm}
        title={editingGoal ? 'Edit Goal' : 'New Goal'}
        caption={editingGoal ? 'Refine the plan with your coach' : 'Set a target and let the coach plan it'}
        scrollable
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
          editingGoal ? (
            // ── Chat UI for editing existing AI plan ──
            (() => {
              const existing = goals.find(g => g.id === editingGoal);
              const history = existing?.chatHistory || [];
              return (
                <>
                  <Typography variant="caption" style={{ color: theme.colors.textSecondary, marginBottom: 12, lineHeight: 18 }}>
                    Ask your coach to refine the plan. You'll review the changes before they apply.
                  </Typography>
                  {history.length > 0 && (
                    <View style={{ marginBottom: 12, maxHeight: 200 }}>
                      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                        {history.filter(h => h.role === 'user').map((h, i) => (
                          <View key={i} style={[styles.chatBubbleUser, { marginBottom: 6 }]}>
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
                right={<Icon icon={Calendar} variant="plain" size="md" color={planFam.accent} />}
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
              <FieldBlock
                label="Target finish time (optional)"
                family="plan"
                value={newGoalFinishTime}
                onChangeText={setNewGoalFinishTime}
                placeholder="e.g. Sub 2:00"
              />
              <Typography variant="caption" style={{ color: theme.colors.textSecondary, marginTop: 4, marginBottom: 8, lineHeight: 18 }}>
                Your AI coach will generate phases + weekly workouts tailored to this target.
              </Typography>
            </>
          )
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

        <Button
          title={editingGoal ? (goalMode === 'AI' ? 'Send to Coach' : 'Save Changes') : goalMode === 'AI' ? 'Generate Plan' : 'Save Goal'}
          family="plan"
          icon={goalMode === 'AI' ? Sparkles : Target}
          size="lg"
          fullWidth
          loading={isGenerating}
          onPress={handleAddGoal}
          style={{ marginTop: 12 }}
        />
      </Sheet>

      {/* ── Delete confirm ── */}
      <Sheet
        visible={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this goal?"
        caption={confirmDelete ? `"${confirmDelete.title}" and its plan + check-in history will be removed.` : undefined}
      >
        <Button
          title="Delete goal"
          variant="destructive"
          icon={Trash2}
          fullWidth
          onPress={() => {
            if (confirmDelete) deleteGoal(confirmDelete.id);
            setConfirmDelete(null);
          }}
        />
        <View style={{ height: 10 }} />
        <Button title="Cancel" variant="ghost" fullWidth onPress={() => setConfirmDelete(null)} />
      </Sheet>

      {/* ── Phase detail ── */}
      <Sheet
        visible={!!phaseDetail}
        onClose={() => setPhaseDetail(null)}
        title={phaseDetail ? stripMd(phaseDetail.goal.phases?.[phaseDetail.index]?.name || 'Phase') : undefined}
        caption={phaseDetail ? (() => {
          const p = phaseDetail.goal.phases?.[phaseDetail.index];
          const window = p?.weekStart && p?.weekEnd
            ? ` · ${format(parseISO(p.weekStart), 'MMM d')} – ${format(parseISO(p.weekEnd), 'MMM d')}`
            : '';
          return `Phase ${phaseDetail.index + 1} of ${phaseDetail.goal.phases?.length || 0}${window}`;
        })() : undefined}
        scrollable
      >
        {phaseDetail && (() => {
          const p = phaseDetail.goal.phases?.[phaseDetail.index];
          if (!p) return null;
          const vol = volumeLine(p);
          return (
            <>
              <Typography variant="caption" style={{ lineHeight: 19 }}>{stripMd(p.description)}</Typography>
              <View style={[styles.phaseMetaRow, { marginTop: 14 }]}>
                <Typography style={styles.phaseMetaLabel}>Weekly volume target</Typography>
                <Typography style={styles.phaseMetaValue}>{p.weeklyVolumeTarget} km</Typography>
              </View>
              <View style={styles.phaseMetaRow}>
                <Typography style={styles.phaseMetaLabel}>Long run target</Typography>
                <Typography style={styles.phaseMetaValue}>{p.longRunTarget} km</Typography>
              </View>
              {vol && (
                <View style={styles.phaseMetaRow}>
                  <Typography style={styles.phaseMetaLabel}>Volume by week</Typography>
                  <Typography style={styles.phaseMetaValue}>{vol}</Typography>
                </View>
              )}
              {!!p.keyWorkout && (
                <View style={styles.workoutBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Icon icon={Zap} variant="plain" size="sm" color={theme.colors.families.records.accent} />
                    <Typography variant="label" style={{ marginLeft: 8 }}>KEY WORKOUT</Typography>
                  </View>
                  <Typography variant="body" style={{ marginBottom: 4, fontWeight: '700' }}>
                    {stripMd((p.keyWorkout || '').split('\n')[0] || '')}
                  </Typography>
                  <Typography variant="caption" style={{ lineHeight: 18 }}>
                    {stripMd(p.keyWorkout.includes('\n') ? p.keyWorkout.substring(p.keyWorkout.indexOf('\n') + 1) : '')}
                  </Typography>
                </View>
              )}
            </>
          );
        })()}
      </Sheet>

      {/* ── Plan revision diff ── */}
      <Sheet
        visible={!!planDiff}
        onClose={() => setPlanDiff(null)}
        title="Review plan changes"
        caption="Apply to update the plan — your check-ins are kept either way."
        scrollable
      >
        {planDiff && (() => {
          const oldPhases = planDiff.goal.phases || [];
          const newPhases = planDiff.plan.phases || [];
          const count = Math.max(oldPhases.length, newPhases.length);
          const oldWeekLine = currentWeekLine(oldPhases);
          const newWeekLine = currentWeekLine(newPhases);
          return (
            <>
              {Array.from({ length: count }, (_, i) => {
                const op: Phase | undefined = oldPhases[i];
                const np: Phase | undefined = newPhases[i];
                const nameChanged = !!op && !!np && stripMd(op.name) !== stripMd(np.name);
                const ov = volumeLine(op);
                const nv = volumeLine(np);
                const weeksChanged = (op?.weeks?.length ?? 0) !== (np?.weeks?.length ?? 0);
                return (
                  <View key={i} style={styles.diffPhaseBox}>
                    <Typography style={styles.diffPhaseName}>
                      {np ? stripMd(np.name) : `${stripMd(op!.name)} (removed)`}
                    </Typography>
                    {nameChanged && <Typography style={styles.diffOld}>{stripMd(op!.name)}</Typography>}
                    <View style={styles.diffMetaRow}>
                      <Typography style={styles.diffMetaLabel}>Weeks</Typography>
                      {weeksChanged ? (
                        <Typography style={styles.diffNew}>{op?.weeks?.length ?? 0} → {np?.weeks?.length ?? 0}</Typography>
                      ) : (
                        <Typography style={styles.diffUnchanged}>{np?.weeks?.length ?? '–'}</Typography>
                      )}
                    </View>
                    {(ov || nv) && (
                      <View style={{ marginTop: 6 }}>
                        <Typography style={styles.diffMetaLabel}>Volume progression</Typography>
                        {ov && ov !== nv && <Typography style={styles.diffOld}>{ov}</Typography>}
                        {nv && <Typography style={ov && ov !== nv ? styles.diffNew : styles.diffUnchanged}>{nv}</Typography>}
                      </View>
                    )}
                  </View>
                );
              })}
              {(oldWeekLine || newWeekLine) && oldWeekLine !== newWeekLine && (
                <View style={styles.diffHighlight}>
                  <Typography variant="label" style={{ marginBottom: 4 }}>THIS WEEK CHANGES</Typography>
                  {oldWeekLine && <Typography style={styles.diffOld}>{oldWeekLine}</Typography>}
                  {newWeekLine && <Typography style={styles.diffNew}>{newWeekLine}</Typography>}
                </View>
              )}
              <View style={{ marginTop: 14 }}>
                <Button title="Apply changes" family="plan" icon={Check} fullWidth onPress={applyPlanDiff} />
                <View style={{ height: 10 }} />
                <Button title="Discard" variant="ghost" fullWidth onPress={() => setPlanDiff(null)} />
              </View>
            </>
          );
        })()}
      </Sheet>

      {/* ── Per-Goal Coach Chat ── */}
      <Sheet
        visible={!!goalChatTarget}
        onClose={() => setGoalChatTarget(null)}
        title="Coach Chat"
        caption="Refine this goal with the AI coach"
      >
        {goalChatMessages.length === 0 ? (
          <View style={{ paddingVertical: 24, alignItems: 'center', gap: 8 }}>
            <Icon icon={MessageCircle} variant="pill" family="social" size="lg" />
            <Typography variant="caption" style={{ color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>
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

        <View style={{ marginTop: 12 }}>
          <FieldBlock
            label="Your Message"
            family="social"
            value={goalChatInput}
            onChangeText={setGoalChatInput}
            placeholder="Ask your coach…"
            multiline
            maxLength={400}
          />
          <Button
            title="Send"
            family="social"
            icon={Send}
            fullWidth
            loading={goalChatLoading}
            disabled={!goalChatInput.trim()}
            onPress={sendGoalChat}
          />
        </View>
      </Sheet>

      <DayDetailSheet
        day={dayDetail}
        activities={activities}
        onClose={() => setDayDetail(null)}
        onCheckIn={handleManualCheckIn}
      />

    </SafeAreaView>
  );
}
