import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TabNavigator from './src/navigation/TabNavigator';
import { theme } from './src/theme';
import { StravaService } from './src/services/strava';
import { NotificationService } from './src/services/notifications';
import { useStore } from './src/store/useStore';
import { useEffect, useState } from 'react';
import Animated, { FadeOut, FadeIn } from 'react-native-reanimated';
import { View, StyleSheet } from 'react-native';
import { Typography } from './src/components/Typography';
import { Flame } from 'lucide-react-native';
import { GlobalToast } from './src/components/GlobalToast';

function SplashScreen() {
  return (
    <Animated.View exiting={FadeOut.duration(500)} style={styles.splashContainer}>
      <Animated.View entering={FadeIn.duration(800).springify()}>
        <Flame color={theme.colors.primary} size={64} />
      </Animated.View>
      <Animated.View entering={FadeIn.delay(300).duration(800)}>
        <Typography style={styles.splashTitle}>Strava AI Coach</Typography>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  splashTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.text,
    marginTop: 16,
    letterSpacing: 1,
  }
});

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      const start = Date.now();
      try {
        await StravaService.initialize();
      } catch (e) {
        console.warn('Strava init error:', e);
      }
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 800 - elapsed);
      setTimeout(() => setIsReady(true), remaining);
    };
    init();

    // Schedule notifications after a short delay (gives store time to hydrate)
    const notifTimer = setTimeout(async () => {
      const state = useStore.getState();
      const { activities, userStats, goals } = state;

      // Weekly recap stats
      const now = new Date();
      const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1);
      const weekActs = activities.filter(a => new Date(a.startDate) >= weekStart);
      const weekKm = weekActs.reduce((s, a) => s + a.distance / 1000, 0);
      const weekDays = new Set(weekActs.map(a => a.startDate.split('T')[0])).size;

      await NotificationService.scheduleWeeklyRecap({ weekKm, weekDays, streak: userStats.currentStreak });
      await NotificationService.scheduleStreakReminder(userStats.currentStreak);

      // Goal deadline reminders
      for (const goal of goals) {
        if (!goal.isSimple && goal.daysRemaining > 0 && goal.daysRemaining <= 7) {
          await NotificationService.scheduleGoalDeadline(goal.title, goal.daysRemaining);
        }
      }
    }, 3000);

    return () => clearTimeout(notifTimer);
  }, []);

  const customDarkTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      primary: theme.colors.primary,
    },
  };

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={customDarkTheme}>
        <StatusBar style="light" />
        <TabNavigator />
        {!isReady && <SplashScreen />}
        <GlobalToast />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
