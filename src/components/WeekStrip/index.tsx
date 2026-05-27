import React, { useMemo } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Check, RefreshCw } from 'lucide-react-native';
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { Typography } from '../Typography';
import { theme } from '../../theme';
import { Goal, Phase, WorkoutKind } from '../../store/useStore';
import { DAY_LABELS, WORKOUT_COLORS, WORKOUT_LABELS, workoutIcon } from '../../utils/workoutKinds';
import { styles } from './styles';

type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface Props {
  goal: Goal;
  onPressDay: (goal: Goal, dayIndex: DayIndex) => void;
  onSync: (goal: Goal) => void;
}

// Returns the phase whose [weekStart, weekEnd] window contains `now`. Falls
// back to the first phase so a freshly-generated plan (or older plans without
// weekStart/weekEnd) still render meaningfully.
function pickActivePhase(goal: Goal, now: Date): Phase | undefined {
  const phases = goal.phases || [];
  if (!phases.length) return undefined;
  const t = now.getTime();
  return phases.find(p =>
    p.weekStart && p.weekEnd
      && parseISO(p.weekStart).getTime() <= t
      && parseISO(p.weekEnd).getTime() >= t,
  ) || phases[0];
}

// Renders Mon–Sun chips coloured by prescribed workout kind, with a ✓ when a
// check-in (manual or Strava-derived) exists for that date. Today's chip gets
// an accent border. Tapping a chip delegates to `onPressDay`, the sync pill
// delegates to `onSync` — this component owns rendering, not state mutation.
export function WeekStrip({ goal, onPressDay, onSync }: Props) {
  const today = useMemo(() => new Date(), []);
  const monday = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today]);
  const todayIso = useMemo(() => format(today, 'yyyy-MM-dd'), [today]);
  const phase = useMemo(() => pickActivePhase(goal, today), [goal, today]);

  if (!phase?.schedule?.length) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Typography variant="label">THIS WEEK</Typography>
          <Typography variant="caption" style={{ color: theme.colors.textSecondary, marginTop: 2 }}>
            Tap a day for the prescription, notes, and RPE.
          </Typography>
        </View>
        <TouchableOpacity style={styles.syncBtn} onPress={() => onSync(goal)} activeOpacity={0.75}>
          <RefreshCw size={12} color={theme.colors.text} />
          <Typography style={styles.syncBtnLabel}>Sync</Typography>
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        {([0, 1, 2, 3, 4, 5, 6] as const).map((di) => {
          const date = format(addDays(monday, di), 'yyyy-MM-dd');
          const isToday = date === todayIso;
          const presc = phase.schedule?.find(p => p.dayOfWeek === di);
          const ci = (goal.checkIns || []).find(c => c.date === date);
          const kind: WorkoutKind = presc?.kind || 'REST';
          const color = WORKOUT_COLORS[kind];
          const done = !!ci && ci.completed;
          return (
            <TouchableOpacity
              key={di}
              onPress={() => onPressDay(goal, di)}
              activeOpacity={0.7}
              style={[
                styles.chip,
                { borderColor: isToday ? color : 'rgba(255,255,255,0.06)' },
                done && { backgroundColor: color + '33' },
              ]}
            >
              <Typography style={[styles.chipLabel, isToday && { color: '#fff' }]}>
                {DAY_LABELS[di]}
              </Typography>
              <View style={[styles.chipDot, { backgroundColor: color }]}>
                {done ? <Check size={10} color="#fff" /> : workoutIcon(kind, 10, '#fff')}
              </View>
              <Typography style={styles.chipKind}>{WORKOUT_LABELS[kind].slice(0, 5)}</Typography>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
