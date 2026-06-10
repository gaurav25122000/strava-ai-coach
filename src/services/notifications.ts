import * as Notifications from 'expo-notifications';
import { addDays, format, startOfWeek } from 'date-fns';
import { Goal, WorkoutKind } from '../store/useStore';
import { WORKOUT_LABELS } from '../utils/workoutKinds';
import { scheduleForDate } from './planSchedule';

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
  // Request permission + return granted boolean. Only call from an explicit
  // user action (Settings toggle, onboarding) — never from background sync.
  requestPermission: async (): Promise<boolean> => {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  },

  // Passive check used by every schedule* function. The old code called
  // requestPermission from the post-launch sync timer, popping the OS
  // permission dialog 3 seconds into first launch with no user gesture.
  hasPermission: async (): Promise<boolean> => {
    const { status } = await Notifications.getPermissionsAsync();
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

  // Schedule the next weekly recap for Monday 08:00 as a ONE-SHOT.
  // It re-arms on every app open/sync, so the body stays fresh — the old
  // WEEKLY repeating trigger replayed week-old numbers forever if the app
  // wasn't opened.
  scheduleWeeklyRecap: async (stats: {
    weekKm: number; weekDays: number; streak: number;
  }) => {
    const granted = await NotificationService.hasPermission();
    if (!granted) return;

    try {
      await Notifications.cancelScheduledNotificationAsync('weekly-recap');
    } catch {}

    const next = new Date();
    next.setHours(8, 0, 0, 0);
    const day = next.getDay(); // 0 = Sunday
    let daysToMonday = (8 - day) % 7;
    if (daysToMonday === 0 && Date.now() >= next.getTime()) daysToMonday = 7;
    next.setDate(next.getDate() + daysToMonday);

    await Notifications.scheduleNotificationAsync({
      identifier: 'weekly-recap',
      content: {
        title: '📊 Weekly Summary',
        body: `Last week: ${stats.weekKm.toFixed(1)} km over ${stats.weekDays} days. Streak: ${stats.streak} days 🔥`,
        data: { type: 'weekly-recap' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: next,
      },
    });
  },

  // Streak-at-risk reminder — ONE-SHOT for tonight 20:00, only when the
  // streak is active and nothing is logged today. Re-armed on each sync; the
  // old DAILY repeating trigger kept congratulating dead streaks for weeks.
  scheduleStreakReminder: async (streak: number, hasActivityToday: boolean) => {
    await NotificationService.cancelStreakReminder();
    if (streak <= 0 || hasActivityToday) return;

    const granted = await NotificationService.hasPermission();
    if (!granted) return;

    const tonight = new Date();
    tonight.setHours(20, 0, 0, 0);
    if (Date.now() >= tonight.getTime()) return; // past 20:00 — skip today

    await Notifications.scheduleNotificationAsync({
      identifier: 'streak-reminder',
      content: {
        title: '🔥 Streak at risk!',
        body: `You're on a ${streak}-day streak. Log an activity today to keep it alive!`,
        data: { type: 'streak-reminder' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: tonight,
      },
    });
  },

  // Goal deadline approaching — fires once, tomorrow 09:00. The body counts
  // days as of WHEN IT FIRES (the old text was off by one).
  scheduleGoalDeadline: async (goalTitle: string, daysLeft: number) => {
    if (daysLeft <= 1 || daysLeft > 7) return;

    const granted = await NotificationService.hasPermission();
    if (!granted) return;

    const trigger = new Date();
    trigger.setHours(9, 0, 0, 0);
    trigger.setDate(trigger.getDate() + 1);
    const daysAtFire = daysLeft - 1;

    await Notifications.scheduleNotificationAsync({
      identifier: `goal-deadline-${goalTitle}`,
      content: {
        title: '🎯 Goal deadline approaching',
        body: `"${goalTitle}" is due in ${daysAtFire} day${daysAtFire === 1 ? '' : 's'}. Keep pushing!`,
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
    const granted = await NotificationService.hasPermission();
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
      // weeks[]-aware: the schedule actually in force this week, no
      // phases[0] fallback for out-of-window dates.
      const schedule = scheduleForDate(goal.phases, new Date());
      if (!schedule?.length) continue;

      for (const presc of schedule) {
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
