import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowDownRight, ArrowUpRight, CalendarCheck, Minus } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { activityDayKey, localDateStr, mondayOf } from '../utils/dates';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';
import { formatDuration } from './_format';

interface WeekAgg {
  km: number;
  time: number;
  days: number;
  longest: number;
}

function aggregate(activities: any[], weekStart: string, weekEnd: string): WeekAgg {
  let km = 0;
  let time = 0;
  let longest = 0;
  const days = new Set<string>();
  for (const a of activities) {
    const day = activityDayKey(a);
    if (day < weekStart || day >= weekEnd) continue;
    km += a.distance / 1000;
    time += a.movingTime;
    if (a.distance > longest) longest = a.distance;
    days.add(day);
  }
  return { km, time, days: days.size, longest };
}

function Delta({ cur, prev, fmt }: { cur: number; prev: number; fmt: (v: number) => string }) {
  const diff = cur - prev;
  const up = diff > 0;
  const flat = Math.abs(diff) < 0.05 * Math.max(prev, 1);
  const color = flat ? theme.colors.textSecondary : up ? theme.colors.success : theme.colors.error;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <View style={[styles.deltaChip, { backgroundColor: withAlpha(color, 'tint') }]}>
      <Icon color={color} size={11} />
      <Typography style={[styles.deltaTxt, { color }]}>
        {flat ? 'level' : fmt(Math.abs(diff))}
      </Typography>
    </View>
  );
}

/**
 * Last completed week (Mon–Sun) against the one before it — the Monday
 * "how did training actually go?" answer without opening Insights.
 */
export const WeeklyRecapWidget = memo(function WeeklyRecapWidget() {
  const activities = useStore((s) => s.activities);

  const recap = useMemo(() => {
    const thisMonday = mondayOf(new Date());
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(lastMonday.getDate() - 7);
    const prevMonday = new Date(thisMonday);
    prevMonday.setDate(prevMonday.getDate() - 14);

    const last = aggregate(activities, localDateStr(lastMonday), localDateStr(thisMonday));
    const prev = aggregate(activities, localDateStr(prevMonday), localDateStr(lastMonday));
    const label = `${lastMonday.getDate()}/${lastMonday.getMonth() + 1} – ${new Date(thisMonday.getTime() - 86_400_000).getDate()}/${new Date(thisMonday.getTime() - 86_400_000).getMonth() + 1}`;
    return { last, prev, label };
  }, [activities]);

  const family = WIDGET_FAMILY.WeeklyRecap;
  const accent = familyStyle(family).accent;
  const { last, prev } = recap;

  const rows = [
    { lbl: 'Distance', val: `${last.km.toFixed(1)} km`, delta: <Delta cur={last.km} prev={prev.km} fmt={(v) => `${v.toFixed(1)} km`} /> },
    { lbl: 'Time', val: formatDuration(last.time), delta: <Delta cur={last.time} prev={prev.time} fmt={(v) => formatDuration(v)} /> },
    { lbl: 'Active days', val: `${last.days}`, delta: <Delta cur={last.days} prev={prev.days} fmt={(v) => `${Math.round(v)}`} /> },
    { lbl: 'Longest', val: `${(last.longest / 1000).toFixed(1)} km`, delta: <Delta cur={last.longest} prev={prev.longest} fmt={(v) => `${(v / 1000).toFixed(1)} km`} /> },
  ];

  return (
    <WidgetCard
      family={family}
      title={WIDGET_TITLES.WeeklyRecap}
      icon={CalendarCheck}
      caption={`last week · ${recap.label} · vs week before`}
    >
      {last.days === 0 && prev.days === 0 ? (
        <EmptyHint
          icon={CalendarCheck}
          family={family}
          text="Two weeks of synced training and your Monday recap appears here."
        />
      ) : (
        <View style={styles.rows}>
          {rows.map((r) => (
            <View key={r.lbl} style={styles.row}>
              <Typography style={styles.rowLbl}>{r.lbl}</Typography>
              <Typography style={[styles.rowVal, { color: accent }]}>{r.val}</Typography>
              {r.delta}
            </View>
          ))}
        </View>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  rows: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  rowLbl: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  rowVal: {
    fontSize: 14,
    fontWeight: '900',
    marginRight: 10,
  },
  deltaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    minWidth: 64,
    justifyContent: 'center',
  },
  deltaTxt: {
    ...theme.typography.micro,
    fontWeight: '800',
  },
});
