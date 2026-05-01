import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getWeek, getYear, startOfWeek, endOfWeek } from 'date-fns';

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

  // Schedule a weekly recap every Monday at 08:00
  scheduleWeeklyRecap: async (stats: {
    weekKm: number; weekDays: number; streak: number;
  }) => {
    await Notifications.cancelAllScheduledNotificationsAsync();

    const granted = await NotificationService.requestPermission();
    if (!granted) return;

    // Weekly recap — every Monday 8am
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

  // Streak at risk reminder — fires daily at 20:00 if streak > 0
  scheduleStreakReminder: async (streak: number) => {
    if (streak === 0) return;

    const granted = await NotificationService.requestPermission();
    if (!granted) return;

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
};
