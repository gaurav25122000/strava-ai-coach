import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { addDays, format, getWeek, getYear, parseISO, startOfWeek, endOfWeek } from 'date-fns';
import { Goal, WorkoutKind } from '../store/useStore';
import { WORKOUT_LABELS } from '../utils/workoutKinds';

// Configure how notifications look when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const NotificationService = {
  // Request permission + return granted boolean
  requestPermission: async (): Promise<boolean> => {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  },

  // Cancel all scheduled notifications
  cancelAll: async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
  },

  cancelStreakReminder: async () => {
    try {
      await Notifications.cancelScheduledNotificationAsync('streak-reminder');
    } catch {
      // identifier may not exist — ignore
    }
  },

  // Schedule a weekly recap every Monday at 08:00
  scheduleWeeklyRecap: async (stats: {
    weekKm: number; weekDays: number; streak: number;
  }) => {
    const granted = await NotificationService.requestPermission();
    if (!granted) return;

    try {
      await Notifications.cancelScheduledNotificationAsync('weekly-recap');
    } catch {}

    await Notifications.scheduleNotificationAsync({
      identifier: 'weekly-recap',
      content: {
        title: '📊 Weekly Summary',
        body: `Last week: ${stats.weekKm.toFixed(1)} km over ${stats.weekDays} days. Streak: ${stats.streak} days 🔥`,
        data: { type: 'weekly-recap' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 2, // Monday (1=Sun, 2=Mon)
        hour: 8,
        minute: 0,
      },
    });
  },

  // Streak at risk reminder — fires daily at 20:00 only when streak is active
  // and the user hasn't logged today yet. Caller must pass current state on
  // every state change / app foreground so the schedule stays in sync.
  scheduleStreakReminder: async (streak: number, hasActivityToday: boolean) => {
    if (streak <= 0 || hasActivityToday) {
      await NotificationService.cancelStreakReminder();
      return;
    }

    const granted = await NotificationService.requestPermission();
    if (!granted) return;

    await NotificationService.cancelStreakReminder();

    await Notifications.scheduleNotificationAsync({
      identifier: 'streak-reminder',
      content: {
        title: '🔥 Streak at risk!',
        body: `You're on a ${streak}-day streak. Log an activity today to keep it alive!`,
        data: { type: 'streak-reminder' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 20,
        minute: 0,
      },
    });
  },

  // Goal deadline approaching — fires once
  scheduleGoalDeadline: async (goalTitle: string, daysLeft: number) => {
    if (daysLeft <= 0 || daysLeft > 7) return;

    const granted = await NotificationService.requestPermission();
    if (!granted) return;

    const trigger = new Date();
    trigger.setHours(9, 0, 0, 0);
    trigger.setDate(trigger.getDate() + 1);

    await Notifications.scheduleNotificationAsync({
      identifier: `goal-deadline-${goalTitle}`,
      content: {
        title: '🎯 Goal deadline approaching',
        body: `"${goalTitle}" is due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Keep pushing!`,
        data: { type: 'goal-deadline' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: trigger,
      },
    });
  },

  // Simple goal achieved — fires immediately as a local notification
  notifyGoalCompleted: async (goalTitle: string, unit: string, achieved: number) => {
    const granted = await NotificationService.requestPermission();
    if (!granted) return;

    await Notifications.scheduleNotificationAsync({
      identifier: `goal-done-${Date.now()}`,
      content: {
        title: '🏆 Goal Crushed!',
        body: `"${goalTitle}" complete! You hit ${achieved} ${unit} this period.`,
        data: { type: 'goal-complete' },
      },
      trigger: null, // immediate
    });
  },

  // Milestone unlocked
  notifyMilestone: async (icon: string, title: string, description: string) => {
    const granted = await NotificationService.requestPermission();
    if (!granted) return;

    await Notifications.scheduleNotificationAsync({
      identifier: `milestone-${title}`,
      content: {
        title: `${icon} Badge Unlocked!`,
        body: `${title} — ${description}`,
        data: { type: 'milestone' },
      },
      trigger: null, // immediate
    });
  },

  // Workout reminder — schedules one notification per non-REST day in the AI
  // goal's current phase, firing at 07:30 the morning of. Re-syncs every time
  // the goal is generated / regenerated so swapped days don't double-fire.
  syncWorkoutReminders: async (goals: Goal[]) => {
    const granted = await NotificationService.requestPermission();
    if (!granted) return;

    // Drop any reminders the previous run scheduled — identifiers are
    // namespaced with `workout-<goalId>-<date>` so this won't touch other
    // notifications (recap / streak / milestone / etc.).
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(s => s.identifier?.startsWith('workout-'))
        .map(s => Notifications.cancelScheduledNotificationAsync(s.identifier)),
    );

    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    const nowMs = Date.now();

    for (const goal of goals) {
      if (goal.isSimple) continue;
      const phase = (goal.phases || []).find(p =>
        p.weekStart && p.weekEnd
          && parseISO(p.weekStart).getTime() <= nowMs
          && parseISO(p.weekEnd).getTime() >= nowMs,
      ) || goal.phases?.[0];
      if (!phase?.schedule?.length) continue;

      for (const presc of phase.schedule) {
        if (presc.kind === 'REST') continue;
        const date = addDays(monday, presc.dayOfWeek);
        date.setHours(7, 30, 0, 0);
        if (date.getTime() < nowMs) continue;
        const identifier = `workout-${goal.id}-${format(date, 'yyyy-MM-dd')}`;
        const kindLabel = WORKOUT_LABELS[presc.kind as WorkoutKind] || presc.kind;
        const body = presc.distanceKm
          ? `${presc.title} · ${presc.distanceKm} km · ${kindLabel}`
          : `${presc.title} · ${kindLabel}`;
        await Notifications.scheduleNotificationAsync({
          identifier,
          content: {
            title: '🏃 Today on your plan',
            body,
            data: { type: 'workout-reminder', goalId: goal.id, date: format(date, 'yyyy-MM-dd') },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date,
          },
        });
      }
    }
  },
};
