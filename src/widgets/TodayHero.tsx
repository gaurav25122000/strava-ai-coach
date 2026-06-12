import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Quote, Target } from 'lucide-react-native';
import { TodayHero } from '../components/TodayHero';
import { Typography } from '../components/Typography';
import { theme, withAlpha } from '../theme';
import { familyStyle } from '../utils/widgetFamilies';
import { localDateStr, mondayIndex } from '../utils/dates';
import { workoutIcon } from '../utils/workoutKinds';
import { CheckIn, useStore, WorkoutKind } from '../store/useStore';
import { StravaService } from '../services/strava';
import { getActivitySource, healthSourceLabel, useActivitySource } from '../services/activitySource';
import { performActivitySync } from '../services/syncRunner';
import { computeProgress, prescriptionFor } from '../services/goalProgress';

// Map a free-text key-workout title to a WorkoutKind for the icon pill.
function kindFromTitle(title: string): WorkoutKind {
  const lower = title.toLowerCase();
  if (/tempo|threshold/.test(lower)) return 'TEMPO';
  if (/interval|repeat|fartlek|400|800/.test(lower)) return 'INTERVALS';
  if (/long|easy long/.test(lower)) return 'LONG';
  if (/recover|recovery/.test(lower)) return 'RECOVERY';
  if (/strength|gym/.test(lower)) return 'STRENGTH';
  if (/cross|bike|swim/.test(lower)) return 'CROSS';
  return 'EASY';
}

/**
 * Top-of-dashboard hero (full-bleed, no WidgetCard) plus two compact
 * goal-context rows absorbed from the retired CurrentFocus and
 * UpcomingWorkout widgets — today's action and its "why" live together.
 */
export const TodayHeroWidget = memo(function TodayHeroWidget() {
  const goals = useStore((s) => s.goals);
  const currentStreak = useStore((s) => s.userStats.currentStreak);
  const lastSyncedAt = useStore((s) => s.lastSyncedAt);
  const addCheckIn = useStore((s) => s.addCheckIn);
  const updateGoal = useStore((s) => s.updateGoal);
  const setToast = useStore((s) => s.setToast);
  const source = useActivitySource();
  const navigation = useNavigation<any>();

  // Reactive Strava-auth flag. `StravaService.isAuthenticated()` is sync but
  // depends on `initialize()` having loaded the token from secure storage —
  // reading it inline during render races that load and wrongly shows
  // "Strava not connected" on a fresh app start. Re-check on foreground so a
  // connect/disconnect done elsewhere is picked up.
  const [stravaConnected, setStravaConnected] = useState(false);
  useEffect(() => {
    let alive = true;
    StravaService.initialize().then(() => {
      if (alive) setStravaConnected(StravaService.isAuthenticated());
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setStravaConnected(StravaService.isAuthenticated());
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  // Health has no auth handshake — never show the "not connected" state and
  // keep the sync pill live (performActivitySync dispatches on the source).
  const connected = source === 'health' ? true : stravaConnected;

  const activeGoal = useMemo(
    () => goals.find((g) => !g.isSimple && (g.phases?.length || 0) > 0),
    [goals],
  );

  // Current focus: first non-simple goal (may lack structured phases).
  const focusGoal = useMemo(() => goals.find((g) => !g.isSimple), [goals]);

  // Next key workout from the first active non-simple AI goal.
  const upcomingWorkout = useMemo(() => {
    const aiGoal = goals.find((g) => !g.isSimple && (g.phases?.length || g.keyWorkout));
    if (!aiGoal) return null;
    const totalDays = Math.max(1, (new Date(aiGoal.targetDate).getTime() - Date.now()) / 86400000);
    if (aiGoal.phases && aiGoal.phases.length > 0) {
      const phaseIdx = Math.min(
        aiGoal.phases.length - 1,
        Math.floor(
          (1 - totalDays / Math.max(1, aiGoal.daysRemaining + aiGoal.phases.length * 7)) *
            aiGoal.phases.length,
        ),
      );
      const phase = aiGoal.phases[Math.max(0, phaseIdx)];
      return {
        goalTitle: aiGoal.title,
        phaseName: phase.name,
        workout: phase.keyWorkout,
        weeklyTarget: phase.weeklyVolumeTarget,
      };
    }
    return {
      goalTitle: aiGoal.title,
      phaseName: aiGoal.phase?.split('\n')[0] || 'Current Phase',
      workout: aiGoal.keyWorkout,
      weeklyTarget: aiGoal.weeklyVolume?.target,
    };
  }, [goals]);

  const handleQuickCheckIn = useCallback(
    (completed: boolean) => {
      if (!activeGoal) return;
      const today = new Date();
      const dayOfWeek = mondayIndex(today) as CheckIn['dayOfWeek'];
      const presc = prescriptionFor(activeGoal, today);
      addCheckIn(activeGoal.id, {
        date: localDateStr(today),
        dayOfWeek,
        source: 'MANUAL',
        workoutKind: presc?.kind || 'EASY',
        completed,
      });
      const fresh = useStore.getState().goals.find((g) => g.id === activeGoal.id);
      if (fresh) updateGoal(computeProgress(fresh, useStore.getState().activities));
      setToast({
        title: completed ? 'Logged ✓' : 'Skipped',
        message: completed
          ? "Today's workout marked complete."
          : 'No worries — pick it back up tomorrow.',
        type: 'success',
      });
    },
    [activeGoal, addCheckIn, updateGoal, setToast],
  );

  const handleSync = useCallback(() => {
    performActivitySync({ force: true })
      .then((res) => {
        // A forced health sync returns null only when the native module is
        // missing (old binary) — surface that instead of silently no-oping.
        if (res === null && getActivitySource() === 'health') {
          setToast({ title: 'Update needed', message: `This build doesn't include ${healthSourceLabel()} support yet.`, type: 'error' });
        }
      })
      .catch(() =>
        setToast({ title: 'Error', message: 'Failed to sync activities', type: 'error' }),
      );
  }, [setToast]);

  const planAccent = familyStyle('plan').accent;

  const upcomingTitle = useMemo(() => {
    if (!upcomingWorkout) return null;
    const lines = (upcomingWorkout.workout || '').split('\n').filter(Boolean);
    return (lines[0] || 'Key Workout').replace(/\*\*/g, '');
  }, [upcomingWorkout]);
  const upcomingKind: WorkoutKind = upcomingTitle ? kindFromTitle(upcomingTitle) : 'EASY';

  return (
    <View>
      <TodayHero
        activeGoal={activeGoal}
        currentStreak={currentStreak}
        lastSyncedAt={lastSyncedAt}
        stravaConnected={connected}
        onMarkDone={() => handleQuickCheckIn(true)}
        onSkip={() => handleQuickCheckIn(false)}
        onSync={handleSync}
        onCreateGoal={() => navigation.navigate('Goals')}
      />

      {focusGoal && (
        <View style={styles.row}>
          <View style={[styles.rowIcon, { backgroundColor: withAlpha(planAccent, 'tint') }]}>
            <Quote size={14} color={planAccent} />
          </View>
          <View style={styles.rowBody}>
            <Typography style={styles.rowTitle} numberOfLines={1}>
              {focusGoal.title}
            </Typography>
            <Typography style={styles.rowSub} numberOfLines={2}>
              {focusGoal.phases && focusGoal.phases.length > 0
                ? focusGoal.phases[0].description
                : focusGoal.phase.split('\n')[0]}
            </Typography>
            {focusGoal.phases && focusGoal.phases.length > 0 && (
              <Typography style={[styles.rowCaption, { color: planAccent }]} numberOfLines={1}>
                Phase: {focusGoal.phases[0].name}
              </Typography>
            )}
          </View>
        </View>
      )}

      {upcomingWorkout && upcomingTitle && (
        <View style={styles.row}>
          <View style={[styles.rowIcon, { backgroundColor: withAlpha(planAccent, 'tint') }]}>
            {workoutIcon(upcomingKind, 14, planAccent)}
          </View>
          <View style={styles.rowBody}>
            <Typography style={[styles.rowEyebrow, { color: planAccent }]} numberOfLines={1}>
              NEXT · {upcomingWorkout.phaseName.toUpperCase()}
            </Typography>
            <Typography style={styles.rowTitle} numberOfLines={2}>
              {upcomingTitle}
            </Typography>
            {!!upcomingWorkout.weeklyTarget && (
              <View style={styles.rowMeta}>
                <Target size={11} color={theme.colors.textSecondary} />
                <Typography style={styles.rowSub}>
                  {upcomingWorkout.weeklyTarget} km/wk target
                </Typography>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    padding: 12,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 2 },
  rowEyebrow: {
    ...theme.typography.micro,
    textTransform: 'uppercase',
  },
  rowTitle: {
    ...theme.typography.subtitle,
    fontSize: 15,
    color: theme.colors.text,
  },
  rowSub: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
  },
  rowCaption: {
    ...theme.typography.micro,
    marginTop: 2,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
});
