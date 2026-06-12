import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { CalendarDays, Check, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Typography } from '../components/Typography';
import { PressableScale } from '../components/PressableScale';
import { Sheet } from '../components/Sheet';
import { EmptyHint } from '../widgets/common';
import { theme, withAlpha } from '../theme';
import { familyStyle } from '../utils/widgetFamilies';
import { localDateStr } from '../utils/dates';
import { prescriptionSummary } from '../services/planSchedule';
import {
  CalendarDayInfo,
  DayStatus,
  dayInfo,
  groupActivitiesByDay,
  lastPlanDayKey,
  monthAdherence,
  monthMatrix,
} from '../services/calendarData';
import { Activity, useStore } from '../store/useStore';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const STATUS_LABEL: Record<DayStatus, string> = {
  done: 'Done',
  missed: 'Missed',
  planned: 'Planned',
  rest: 'Rest day',
  extra: 'Extra session',
  free: 'No plan',
};

/** Linear month index (year * 12 + month) for clamping the switcher. */
function monthNumOf(dayKey: string): number {
  return parseInt(dayKey.slice(0, 4), 10) * 12 + parseInt(dayKey.slice(5, 7), 10) - 1;
}

function activityLine(a: Activity): string {
  const bits: string[] = [];
  if (a.distance > 0) bits.push(`${(a.distance / 1000).toFixed(1)} km`);
  bits.push(`${Math.round(a.movingTime / 60)} min`);
  return bits.join(' · ');
}

/** The small per-day status glyph under the date number. */
function StatusMark({ status, accent }: { status: DayStatus; accent: string }) {
  switch (status) {
    case 'done':
      return <View style={[styles.dot, { backgroundColor: accent }]} />;
    case 'planned':
      return <View style={[styles.dot, styles.dotOutline, { borderColor: accent }]} />;
    case 'missed':
      return <View style={[styles.dot, { backgroundColor: withAlpha(theme.colors.error, 'heavy') }]} />;
    case 'extra':
      return <Check size={10} color={theme.colors.textSecondary} strokeWidth={3} />;
    default:
      return null;
  }
}

/**
 * Month grid of the active AI plan vs what was actually logged: planned,
 * done, missed and bonus days at a glance, plus this month's adherence.
 * Tapping a day opens a read-only detail sheet.
 */
export default function TrainingCalendarScreen({ navigation }: any) {
  const goals = useStore((s) => s.goals);
  const activities = useStore((s) => s.activities);

  const todayKey = localDateStr(new Date());
  const currentMonth = monthNumOf(todayKey);
  const [monthNum, setMonthNum] = useState(currentMonth);
  const year = Math.floor(monthNum / 12);
  const monthIdx = monthNum % 12;

  // Same pick as TodayHero: first structured (non-simple, phased) AI goal.
  const activeGoal = useMemo(
    () => goals.find((g) => !g.isSimple && (g.phases?.length || 0) > 0),
    [goals],
  );

  // Browsing range: a year back, and forward to the end of the plan (or next
  // month for planless browsing, whichever is later).
  const minMonth = currentMonth - 12;
  const maxMonth = useMemo(() => {
    const planEnd = lastPlanDayKey(activeGoal);
    return Math.max(currentMonth + 1, planEnd ? monthNumOf(planEnd) : currentMonth + 1);
  }, [activeGoal, currentMonth]);

  const activitiesByDay = useMemo(() => groupActivitiesByDay(activities), [activities]);
  const weeks = useMemo(() => monthMatrix(year, monthIdx), [year, monthIdx]);

  // Precompute every in-month day once — cells must stay render-cheap.
  const infoByDay = useMemo(() => {
    const map = new Map<string, CalendarDayInfo>();
    for (const cell of weeks.flat()) {
      if (cell.inMonth) map.set(cell.dayKey, dayInfo(activeGoal, activitiesByDay, cell.dayKey, todayKey));
    }
    return map;
  }, [weeks, activeGoal, activitiesByDay, todayKey]);

  const adherence = useMemo(
    () => monthAdherence(activeGoal, activitiesByDay, year, monthIdx, todayKey),
    [activeGoal, activitiesByDay, year, monthIdx, todayKey],
  );

  const monthHasActs = useMemo(
    () => [...infoByDay.values()].some((i) => i.acts.length > 0),
    [infoByDay],
  );

  // Sheet keeps its day through the exit animation, so content never blanks.
  const [sheetDay, setSheetDay] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetInfo = useMemo(
    () => (sheetDay ? dayInfo(activeGoal, activitiesByDay, sheetDay, todayKey) : null),
    [sheetDay, activeGoal, activitiesByDay, todayKey],
  );

  const fam = familyStyle('plan');
  const monthLabel = format(new Date(year, monthIdx, 1), 'MMMM yyyy');
  const shiftMonth = (delta: number) =>
    setMonthNum((m) => Math.min(maxMonth, Math.max(minMonth, m + delta)));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <PressableScale
          onPress={() => {
            // Cross-tab deep links can land here with nothing beneath us.
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.navigate('MenuHome');
          }}
          hitSlop={theme.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={24} color={theme.colors.text} />
        </PressableScale>
        <Typography style={styles.headerTitle}>Training Calendar</Typography>
        <View style={{ width: 24 }} />
      </View>

      {/* Month switcher */}
      <View style={styles.monthRow}>
        <PressableScale
          onPress={() => shiftMonth(-1)}
          hitSlop={theme.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          style={{ opacity: monthNum <= minMonth ? 0.25 : 1 }}
        >
          <ChevronLeft size={20} color={theme.colors.textSecondary} />
        </PressableScale>
        <Typography style={styles.monthTitle}>{monthLabel}</Typography>
        <PressableScale
          onPress={() => shiftMonth(1)}
          hitSlop={theme.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          style={{ opacity: monthNum >= maxMonth ? 0.25 : 1 }}
        >
          <ChevronRight size={20} color={theme.colors.textSecondary} />
        </PressableScale>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {!activeGoal && !monthHasActs ? (
          <EmptyHint
            icon={CalendarDays}
            family="plan"
            text="No plan and no activities this month. Create an AI goal or sync Strava to fill the calendar."
          />
        ) : (
          <>
            {/* Grid */}
            <View style={styles.gridCard}>
              <View style={styles.weekRow}>
                {WEEKDAYS.map((d, i) => (
                  <Typography key={i} style={styles.weekdayLabel}>{d}</Typography>
                ))}
              </View>
              {weeks.map((week) => (
                <View key={week[0].dayKey} style={styles.weekRow}>
                  {week.map((cell) => {
                    if (!cell.inMonth) {
                      return (
                        <View key={cell.dayKey} style={styles.cell}>
                          <View style={styles.dayNumWrap}>
                            <Typography style={[styles.dayNum, styles.dayNumOut]}>
                              {parseInt(cell.dayKey.slice(8), 10)}
                            </Typography>
                          </View>
                          <View style={styles.markSlot} />
                        </View>
                      );
                    }
                    const info = infoByDay.get(cell.dayKey)!;
                    const isToday = cell.dayKey === todayKey;
                    return (
                      <Pressable
                        key={cell.dayKey}
                        style={styles.cell}
                        onPress={() => { setSheetDay(cell.dayKey); setSheetOpen(true); }}
                        accessibilityRole="button"
                        accessibilityLabel={`${format(parseISO(cell.dayKey), 'd MMMM')}, ${STATUS_LABEL[info.status]}`}
                      >
                        <View style={[styles.dayNumWrap, isToday && { borderColor: fam.accent }]}>
                          <Typography style={[styles.dayNum, isToday && { color: fam.accent }]}>
                            {parseInt(cell.dayKey.slice(8), 10)}
                          </Typography>
                        </View>
                        <View style={styles.markSlot}>
                          <StatusMark status={info.status} accent={fam.accent} />
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>

            {/* Legend */}
            <View style={styles.legendRow}>
              {(['done', 'planned', 'missed', 'extra'] as const).map((s) => (
                <View key={s} style={styles.legendItem}>
                  <StatusMark status={s} accent={fam.accent} />
                  <Typography style={styles.legendText}>{STATUS_LABEL[s]}</Typography>
                </View>
              ))}
            </View>

            {/* Adherence */}
            {adherence.pct != null && (
              <View style={[styles.adherenceCard, { backgroundColor: withAlpha(fam.accent, 'soft') }]}>
                <CalendarDays size={16} color={fam.accent} />
                <Typography style={styles.adherenceText}>
                  This month: {adherence.completed} of {adherence.planned} planned sessions · {adherence.pct}%
                </Typography>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Day detail */}
      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={sheetDay ? format(parseISO(sheetDay), 'EEEE, d MMMM') : undefined}
        caption={sheetInfo ? STATUS_LABEL[sheetInfo.status] : undefined}
        scrollable
      >
        <View style={styles.sheetBody}>
          {sheetInfo?.planned && (
            <View style={[styles.prescCard, { borderColor: withAlpha(fam.accent, 'medium') }]}>
              <Typography style={[styles.prescEyebrow, { color: fam.accent }]}>PRESCRIBED</Typography>
              <Typography style={styles.prescTitle}>{sheetInfo.planned.title}</Typography>
              <Typography style={styles.prescDesc}>{sheetInfo.planned.description}</Typography>
              <Typography style={styles.prescSummary}>{prescriptionSummary(sheetInfo.planned)}</Typography>
            </View>
          )}
          {sheetInfo && sheetInfo.acts.length > 0 && (
            <View style={styles.actList}>
              <Typography style={styles.actHeader}>LOGGED</Typography>
              {sheetInfo.acts.map((a) => (
                <View key={a.id} style={styles.actRow}>
                  <Typography style={styles.actName} numberOfLines={1}>{a.name || a.type}</Typography>
                  <Typography style={styles.actMeta}>{activityLine(a)}</Typography>
                </View>
              ))}
            </View>
          )}
          {sheetInfo && !sheetInfo.planned && sheetInfo.acts.length === 0 && (
            <Typography style={styles.sheetEmpty}>Nothing planned and nothing logged.</Typography>
          )}
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerTitle: {
    ...theme.typography.heading,
    color: theme.colors.text,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    paddingBottom: 8,
  },
  monthTitle: {
    ...theme.typography.subtitle,
    color: theme.colors.text,
    minWidth: 150,
    textAlign: 'center',
  },
  scroll: {
    padding: 16,
    paddingTop: 6,
    paddingBottom: 130,
    gap: 12,
  },
  gridCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 12,
    paddingHorizontal: 6,
    gap: 4,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 3,
    gap: 3,
  },
  dayNumWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: {
    ...theme.typography.footnote,
    color: theme.colors.text,
  },
  dayNumOut: {
    color: withAlpha(theme.colors.textSecondary, 'strong'),
  },
  markSlot: {
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendText: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
  adherenceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 14,
    padding: 14,
  },
  adherenceText: {
    ...theme.typography.footnote,
    color: theme.colors.text,
    flex: 1,
  },
  sheetBody: {
    gap: 14,
    paddingVertical: 6,
  },
  prescCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  prescEyebrow: {
    ...theme.typography.micro,
  },
  prescTitle: {
    ...theme.typography.subtitle,
    color: theme.colors.text,
  },
  prescDesc: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
  },
  prescSummary: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  actList: {
    gap: 8,
  },
  actHeader: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
  actRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actName: {
    ...theme.typography.footnote,
    color: theme.colors.text,
    flex: 1,
  },
  actMeta: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
  },
  sheetEmpty: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 8,
  },
});
