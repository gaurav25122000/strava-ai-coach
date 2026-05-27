import React, { useMemo } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Clock, Flame, Heart, MapPin, RefreshCw, SkipForward } from 'lucide-react-native';
import { addDays, differenceInMinutes, format, parseISO, startOfWeek } from 'date-fns';
import { Typography } from '../Typography';
import { theme } from '../../theme';
import { Goal, WorkoutKind } from '../../store/useStore';
import { WORKOUT_COLORS, WORKOUT_LABELS, workoutIcon } from '../../utils/workoutKinds';
import { styles } from './styles';

interface Props {
  /** Active AI goal, if any. Used to surface today's prescribed workout. */
  activeGoal?: Goal;
  /** Days streak for the flame chip. */
  currentStreak: number;
  /** ISO timestamp of the most recent Strava sync, or null if never synced. */
  lastSyncedAt: string | null;
  /** True when Strava is connected — drives the "Sync" vs "Connect Strava" CTA. */
  stravaConnected: boolean;
  /** Mark today's prescribed workout complete (manual check-in). */
  onMarkDone: () => void;
  /** Skip today's prescribed workout. */
  onSkip: () => void;
  /** Trigger an on-demand Strava sync. */
  onSync: () => void;
  /** Open the goal-creation flow when the user has no AI goal. */
  onCreateGoal: () => void;
}

// Mon=0..Sun=6 helper that matches DailyPrescription.dayOfWeek.
function todayMondayIndex(): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  return (((new Date().getDay() + 6) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6);
}

// Short relative-time string for the "Synced N ago" pill.
function syncLabel(iso: string | null): string {
  if (!iso) return 'Not synced yet';
  const mins = differenceInMinutes(new Date(), parseISO(iso));
  if (mins < 1) return 'Synced now';
  if (mins < 60) return `Synced ${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Synced ${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `Synced ${days}d ago`;
}

// Resolve today's prescription out of the goal's active phase. Falls back to
// the first phase if weekStart/weekEnd aren't set on any phase.
function todayPrescriptionFor(goal: Goal) {
  const phases = goal.phases || [];
  if (!phases.length) return undefined;
  const t = Date.now();
  const phase = phases.find(p =>
    p.weekStart && p.weekEnd
      && parseISO(p.weekStart).getTime() <= t
      && parseISO(p.weekEnd).getTime() >= t,
  ) || phases[0];
  return phase.schedule?.find(p => p.dayOfWeek === todayMondayIndex());
}

/**
 * Top-of-screen "Today" hero. Combines the three things that matter on open:
 *   1. Date + streak (motivation)
 *   2. Today's prescribed workout from the active AI goal (action)
 *   3. Sync freshness pill (trust signal)
 * Falls back gracefully when there's no AI goal or Strava isn't connected.
 */
export function TodayHero({
  activeGoal,
  currentStreak,
  lastSyncedAt,
  stravaConnected,
  onMarkDone,
  onSkip,
  onSync,
  onCreateGoal,
}: Props) {
  const today = useMemo(() => new Date(), []);
  const monday = startOfWeek(today, { weekStartsOn: 1 });
  const todayIso = format(today, 'yyyy-MM-dd');
  const presc = useMemo(
    () => (activeGoal ? todayPrescriptionFor(activeGoal) : undefined),
    [activeGoal],
  );

  // Did the user already check in for today on the active goal?
  const alreadyLogged = useMemo(() => {
    if (!activeGoal) return false;
    return (activeGoal.checkIns || []).some(c => c.date === todayIso && c.completed);
  }, [activeGoal, todayIso]);

  const kind: WorkoutKind = presc?.kind || (activeGoal ? 'EASY' : 'REST');
  const accent = WORKOUT_COLORS[kind];

  // Hero gradient blends the workout-kind accent into the always-on plan
  // family colour. Rest days darken to a calm slate so the screen breathes.
  const heroGradient: [string, string] = kind === 'REST'
    ? ['#1F2030', '#0F1117']
    : [accent, theme.colors.families.plan.accent];

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={heroGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.topRow}>
          <View style={styles.dateBlock}>
            <Typography style={styles.dateDow}>{format(today, 'EEEE')}</Typography>
            <Typography style={styles.dateNum}>{format(today, 'MMM d')}</Typography>
          </View>
          {currentStreak > 0 && (
            <View style={styles.streakBadge}>
              <Flame size={14} color="#FCD34D" />
              <Typography style={styles.streakValue}>{currentStreak}</Typography>
              <Typography style={styles.streakLabel}>day streak</Typography>
            </View>
          )}
        </View>

        {activeGoal && presc && kind !== 'REST' ? (
          <View style={styles.workoutBlock}>
            <View style={styles.workoutHeader}>
              <View style={styles.workoutKindBadge}>{workoutIcon(kind, 16, '#fff')}</View>
              <Typography style={styles.workoutTitle} numberOfLines={2}>{presc.title}</Typography>
            </View>
            <Typography style={styles.workoutDesc} numberOfLines={3}>{presc.description}</Typography>
            {(presc.distanceKm || presc.durationMin || presc.intensity) && (
              <View style={styles.metaRow}>
                {typeof presc.distanceKm === 'number' && (
                  <View style={styles.metaPill}>
                    <MapPin size={11} color="#fff" />
                    <Typography style={styles.metaText}>{presc.distanceKm} km</Typography>
                  </View>
                )}
                {typeof presc.durationMin === 'number' && (
                  <View style={styles.metaPill}>
                    <Clock size={11} color="#fff" />
                    <Typography style={styles.metaText}>{presc.durationMin} min</Typography>
                  </View>
                )}
                {presc.intensity && (
                  <View style={styles.metaPill}>
                    <Heart size={11} color="#fff" />
                    <Typography style={styles.metaText}>{presc.intensity}</Typography>
                  </View>
                )}
              </View>
            )}
            <View style={styles.ctaRow}>
              <TouchableOpacity
                style={[styles.cta, styles.ctaSecondary]}
                onPress={onSkip}
                disabled={alreadyLogged}
                activeOpacity={0.8}
              >
                <SkipForward size={14} color="#fff" />
                <Typography style={styles.ctaSecondaryText}>Skip</Typography>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cta, styles.ctaPrimary]}
                onPress={onMarkDone}
                disabled={alreadyLogged}
                activeOpacity={0.8}
              >
                <Check size={14} color={accent} />
                <Typography style={[styles.ctaPrimaryText, { color: accent }]}>
                  {alreadyLogged ? 'Done today ✓' : 'Mark Done'}
                </Typography>
              </TouchableOpacity>
            </View>
          </View>
        ) : activeGoal && (presc?.kind === 'REST' || !presc) ? (
          <View style={styles.restBlock}>
            <Typography style={styles.restEyebrow}>{WORKOUT_LABELS[kind].toUpperCase()} DAY</Typography>
            <Typography style={styles.restTitle}>
              {presc?.title || 'Take it easy today.'}
            </Typography>
            <Typography style={styles.restNote}>
              {presc?.rest?.note || presc?.description || 'Rest is part of the plan — sleep well, hydrate, and let the adaptations stick.'}
            </Typography>
          </View>
        ) : (
          <View style={styles.noPlanBlock}>
            <Typography style={styles.dateDow}>No active plan</Typography>
            <Typography style={styles.noPlanText}>
              Add an AI goal to see today's workout, rest prescription, and progress here.
            </Typography>
            <TouchableOpacity
              style={[styles.cta, styles.ctaPrimary, { alignSelf: 'flex-start', paddingHorizontal: 14 }]}
              onPress={onCreateGoal}
              activeOpacity={0.85}
            >
              <Typography style={[styles.ctaPrimaryText, { color: accent }]}>Create AI Goal</Typography>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.syncRow}>
          <TouchableOpacity
            style={styles.syncPill}
            onPress={stravaConnected ? onSync : undefined}
            activeOpacity={stravaConnected ? 0.7 : 1}
          >
            <View style={[styles.syncDot, { backgroundColor: stravaConnected ? theme.colors.success : theme.colors.warning }]} />
            <Typography style={styles.syncText}>
              {stravaConnected ? syncLabel(lastSyncedAt) : 'Strava not connected'}
            </Typography>
          </TouchableOpacity>
          {stravaConnected && (
            <TouchableOpacity onPress={onSync} activeOpacity={0.7} hitSlop={10}>
              <RefreshCw size={14} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>
    </View>
  );
}
