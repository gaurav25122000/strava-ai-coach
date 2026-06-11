import React from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { Check, ChevronLeft, ChevronRight, Plus, RefreshCw, X } from 'lucide-react-native';
import { addDays, format, parseISO } from 'date-fns';
import { Icon } from '../Icon';
import { PressableScale } from '../PressableScale';
import { Typography } from '../Typography';
import { theme, withAlpha } from '../../theme';
import { Activity, Goal, WorkoutKind } from '../../store/useStore';
import { scheduleForDate } from '../../services/planSchedule';
import { activityDayKey, localDateStr, weekKey } from '../../utils/dates';
import { DAY_LABELS, WORKOUT_COLORS, WORKOUT_LABELS, workoutIcon } from '../../utils/workoutKinds';
import { planWeekStarts } from './planWeekStarts';
import { styles } from './styles';

export { planWeekStarts } from './planWeekStarts';

const RUNNISH = new Set(['Run', 'TrailRun', 'VirtualRun']);

interface Props {
  goal: Goal;
  /** Monday (YYYY-MM-DD) of the week to render. */
  weekStartDate: string;
  /** 0-based position of this week within the whole plan. */
  weekIndex: number;
  weekCount: number;
  onChangeWeek: (weekStart: string) => void;
  /** Tap on a day chip — receives the chip's local date (YYYY-MM-DD). */
  onPressDay: (goal: Goal, date: string) => void;
  onSync: (goal: Goal) => void;
  syncing?: boolean;
  /** All synced activities — used for the past-week km summary. */
  activities: Activity[];
}

/**
 * One pageable plan week: prev/next arrows + "Week N of M", Mon–Sun chips
 * coloured by that week's schedule (resolved through scheduleForDate), with
 * done / missed / bonus states from the goal's check-ins. Past weeks get a
 * completion summary line. Rendering only — state mutation stays upstream.
 */
export function WeekStrip({
  goal,
  weekStartDate,
  weekIndex,
  weekCount,
  onChangeWeek,
  onPressDay,
  onSync,
  syncing,
  activities,
}: Props) {
  // Computed fresh every render — a useMemo([]) here once froze "today"
  // across midnight and kept yesterday's ring lit.
  const todayIso = localDateStr(new Date());
  const currentMonday = weekKey(new Date());
  const weekStart = parseISO(weekStartDate);
  // Navigate through the plan's actual week list, not ±7-day arithmetic, so
  // a malformed plan with a gap week can't page into a dead week.
  const weekList = planWeekStarts(goal);
  const isPastWeek = weekStartDate < currentMonday;
  // Legacy plans (no phase date windows): phases[0]'s template applies to the
  // current week only — mirrors the concession in goalProgress.
  const isLegacy = !!goal.phases?.length && !goal.phases.some((p) => p.weekStart && p.weekEnd);

  const days = ([0, 1, 2, 3, 4, 5, 6] as const).map((di) => {
    const dateObj = addDays(weekStart, di);
    const schedule =
      scheduleForDate(goal.phases, dateObj) ??
      (isLegacy && weekStartDate === currentMonday ? goal.phases![0].schedule ?? null : null);
    const date = format(dateObj, 'yyyy-MM-dd');
    return {
      di,
      date,
      presc: schedule?.find((p) => p.dayOfWeek === di),
      ci: (goal.checkIns || []).find((c) => c.date === date),
    };
  });

  let summary: string | null = null;
  if (isPastWeek) {
    const planned = days.filter((d) => d.presc && d.presc.kind !== 'REST');
    const done = planned.filter((d) => d.ci?.completed).length;
    const weekEndIso = format(addDays(weekStart, 6), 'yyyy-MM-dd');
    const km = activities.reduce((s, a) => {
      if (!RUNNISH.has(a.type)) return s;
      const day = activityDayKey(a);
      return day >= weekStartDate && day <= weekEndIso ? s + a.distance / 1000 : s;
    }, 0);
    summary = `${done}/${planned.length} done · ${km.toFixed(km >= 10 ? 0 : 1)} km`;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <PressableScale
          onPress={() => { if (weekList[weekIndex - 1]) onChangeWeek(weekList[weekIndex - 1]); }}
          disabled={weekIndex <= 0}
          style={[styles.arrowBtn, weekIndex <= 0 && styles.arrowBtnDisabled]}
          hitSlop={theme.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Previous week"
        >
          <Icon icon={ChevronLeft} variant="plain" size="sm" color={theme.colors.text} />
        </PressableScale>
        <View style={styles.headerCopy}>
          <Typography variant="label" style={styles.weekLabel}>
            Week {weekIndex + 1} of {weekCount}
          </Typography>
          <Typography style={styles.weekRange}>
            {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d')}
          </Typography>
        </View>
        <PressableScale
          onPress={() => { if (weekList[weekIndex + 1]) onChangeWeek(weekList[weekIndex + 1]); }}
          disabled={weekIndex >= weekCount - 1}
          style={[styles.arrowBtn, weekIndex >= weekCount - 1 && styles.arrowBtnDisabled]}
          hitSlop={theme.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Next week"
        >
          <Icon icon={ChevronRight} variant="plain" size="sm" color={theme.colors.text} />
        </PressableScale>
        <TouchableOpacity
          style={styles.syncBtn}
          onPress={() => onSync(goal)}
          disabled={syncing}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Sync from Strava"
        >
          {syncing ? (
            <ActivityIndicator size="small" color={theme.colors.text} />
          ) : (
            <Icon icon={RefreshCw} variant="plain" size="xs" color={theme.colors.text} />
          )}
          <Typography style={styles.syncBtnLabel}>Sync</Typography>
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        {days.map(({ di, date, presc, ci }) => {
          const kind: WorkoutKind = presc?.kind || 'REST';
          const color = WORKOUT_COLORS[kind];
          const isToday = date === todayIso;
          const done = !!ci?.completed;
          const bonus = done && kind === 'REST';
          const missed = !!ci && !ci.completed;
          const dotColor = bonus ? theme.colors.success : color;
          return (
            <PressableScale
              key={di}
              onPress={() => onPressDay(goal, date)}
              style={[
                styles.chipCell,
                styles.chip,
                { borderColor: isToday ? color : theme.colors.divider },
                done && { backgroundColor: withAlpha(dotColor, 'tint') },
                missed && styles.chipMissed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${WORKOUT_LABELS[kind]} on ${DAY_LABELS[di]}`}
            >
              <Typography style={[styles.chipLabel, isToday && { color: theme.colors.text }]}>
                {DAY_LABELS[di]}
              </Typography>
              <View style={[styles.chipDot, { backgroundColor: dotColor }]}>
                {done ? (
                  <Icon icon={bonus ? Plus : Check} variant="plain" size="xs" color={theme.colors.onAccent} />
                ) : missed ? (
                  <Icon icon={X} variant="plain" size="xs" color={theme.colors.onAccent} />
                ) : (
                  workoutIcon(kind, 10, theme.colors.onAccent)
                )}
              </View>
              <Typography style={styles.chipKind} numberOfLines={1} adjustsFontSizeToFit>
                {bonus ? 'Bonus' : WORKOUT_LABELS[kind].slice(0, 5)}
              </Typography>
            </PressableScale>
          );
        })}
      </View>

      {summary && (
        <View style={styles.summaryRow}>
          <Icon icon={Check} variant="plain" size="xs" color={theme.colors.textSecondary} />
          <Typography style={styles.summaryText}>{summary}</Typography>
        </View>
      )}
    </View>
  );
}
