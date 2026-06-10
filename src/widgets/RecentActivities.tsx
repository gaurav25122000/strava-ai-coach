import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Timer } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { PressableScale } from '../components/PressableScale';
import { theme, withAlpha } from '../theme';
import { WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { activityDayKey, formatPace, localDateStr } from '../utils/dates';
import { sportIcon } from '../utils/sportIcon';
import { useStore, Activity } from '../store/useStore';
import { EmptyHint } from './common';
import { dayKeyToDate, paceMinPerKm } from './_format';

function activityColor(type: string): string {
  switch (type) {
    case 'Run':
      return theme.colors.primary;
    case 'Ride':
      return theme.colors.info;
    case 'Walk':
      return theme.colors.secondary;
    default:
      return theme.colors.accent;
  }
}

/** "Today" / "Yesterday" / "Mon, Jun 8" — relative day label for a row. */
function dayLabel(a: Activity): string {
  const key = activityDayKey(a);
  const today = new Date();
  if (key === localDateStr(today)) return 'Today';
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (key === localDateStr(yesterday)) return 'Yesterday';
  return dayKeyToDate(key).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Last five activities; tapping a row opens its detail screen. */
export const RecentActivitiesWidget = memo(function RecentActivitiesWidget() {
  const navigation = useNavigation<any>();
  const activities = useStore((s) => s.activities);

  const recent = useMemo(
    () =>
      [...activities]
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
        .slice(0, 5),
    [activities],
  );

  return (
    <WidgetCard
      family={WIDGET_FAMILY.RecentActivities}
      title={WIDGET_TITLES.RecentActivities}
      icon={Timer}
    >
      {recent.length === 0 ? (
        <EmptyHint
          icon={Timer}
          family={WIDGET_FAMILY.RecentActivities}
          text="No activities yet — sync Strava in Settings to see your latest sessions."
        />
      ) : (
        recent.map((act, i) => {
          const color = activityColor(act.type);
          const pace = paceMinPerKm(act.averageSpeed);
          return (
            <PressableScale
              key={act.id}
              onPress={() =>
                navigation.navigate('Activities', {
                  screen: 'ActivityDetail',
                  params: { activity: act },
                })
              }
              style={[styles.row, i === recent.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View
                style={[
                  styles.iconPill,
                  { backgroundColor: withAlpha(color, 'tint'), borderColor: withAlpha(color, 'strong') },
                ]}
              >
                {sportIcon(act.type, 16, color)}
              </View>
              <View style={{ flex: 1 }}>
                <Typography style={styles.name} numberOfLines={1}>
                  {act.name || act.type}
                </Typography>
                <Typography style={styles.sub}>
                  {dayLabel(act)}
                  {pace > 0 ? ` · ${formatPace(pace)} /km` : ''}
                </Typography>
              </View>
              <View style={[styles.distChip, { backgroundColor: withAlpha(color, 'tint') }]}>
                <Typography style={[styles.distTxt, { color }]}>
                  {(act.distance / 1000).toFixed(1)} km
                </Typography>
              </View>
            </PressableScale>
          );
        })
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.divider,
  },
  iconPill: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  sub: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    marginTop: 1,
  },
  distChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  distTxt: {
    fontSize: 12,
    fontWeight: '800',
  },
});
