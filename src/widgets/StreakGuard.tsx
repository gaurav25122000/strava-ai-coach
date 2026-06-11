import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Flame, ShieldCheck, ShieldAlert, Footprints } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { activityDayKey, localDateStr } from '../utils/dates';
import { useStore } from '../store/useStore';

/**
 * Today's streak status at a glance: safe (already moved today), at risk
 * (streak alive but nothing logged yet — shows hours left), or a nudge to
 * start a new one. Built for the daily "do I need to get out?" check.
 */
export const StreakGuardWidget = memo(function StreakGuardWidget() {
  const activities = useStore((s) => s.activities);
  const currentStreak = useStore((s) => s.userStats.currentStreak);
  const bestStreak = useStore((s) => s.userStats.bestStreak);

  const status = useMemo(() => {
    const today = localDateStr(new Date());
    const activeToday = activities.some((a) => activityDayKey(a) === today);
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const hoursLeft = Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 3_600_000));
    const minsLeft = Math.max(
      0,
      Math.round(((midnight.getTime() - now.getTime()) % 3_600_000) / 60_000),
    );
    return { activeToday, hoursLeft, minsLeft };
  }, [activities]);

  const family = WIDGET_FAMILY.StreakGuard;
  const accent = familyStyle(family).accent;

  let icon = ShieldCheck;
  let color = theme.colors.success;
  let headline = 'Streak safe for today';
  let line = `You already moved today — ${currentStreak} day${currentStreak === 1 ? '' : 's'} and counting.`;

  if (!status.activeToday && currentStreak > 0) {
    icon = ShieldAlert;
    color = theme.colors.warning;
    headline = `${currentStreak}-day streak on the line`;
    line = `${status.hoursLeft}h ${status.minsLeft}m left today — even a short walk keeps it alive.`;
  } else if (!status.activeToday) {
    icon = Footprints;
    color = accent;
    headline = 'Start a streak today';
    line =
      bestStreak > 0
        ? `Your best run was ${bestStreak} days — day one starts with one easy session.`
        : 'Day one starts with one easy session.';
  }

  const StatusIcon = icon;

  return (
    <WidgetCard family={family} title={WIDGET_TITLES.StreakGuard} icon={Flame}>
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: withAlpha(color, 'tint') }]}>
          <StatusIcon color={color} size={26} strokeWidth={2.2} />
        </View>
        <View style={styles.body}>
          <Typography style={[styles.headline, { color }]}>{headline}</Typography>
          <Typography style={styles.line}>{line}</Typography>
        </View>
      </View>
      <View style={styles.footRow}>
        <View style={styles.footStat}>
          <Typography style={styles.footVal}>{currentStreak}</Typography>
          <Typography style={styles.footLbl}>current</Typography>
        </View>
        <View style={styles.footDivider} />
        <View style={styles.footStat}>
          <Typography style={styles.footVal}>{bestStreak}</Typography>
          <Typography style={styles.footLbl}>best</Typography>
        </View>
        <View style={styles.footDivider} />
        <View style={styles.footStat}>
          <Typography style={[styles.footVal, { color: status.activeToday ? theme.colors.success : theme.colors.textSecondary }]}>
            {status.activeToday ? '✓' : `${status.hoursLeft}h`}
          </Typography>
          <Typography style={styles.footLbl}>{status.activeToday ? 'today' : 'left today'}</Typography>
        </View>
      </View>
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  headline: {
    fontSize: 15,
    fontWeight: '800',
  },
  line: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  footRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 10,
  },
  footStat: {
    flex: 1,
    alignItems: 'center',
  },
  footVal: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.colors.text,
  },
  footLbl: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  footDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    backgroundColor: theme.colors.border,
  },
});
