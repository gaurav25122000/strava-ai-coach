import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TabNavigator from './src/navigation/TabNavigator';
import { theme } from './src/theme';
import { StravaService } from './src/services/strava';
import { syncAllNotifications } from './src/services/notificationSync';
import { registerBackgroundSync } from './src/services/backgroundSync';
import { useStore } from './src/store/useStore';
import { useEffect, useState } from 'react';
import Animated, { FadeOut, FadeIn } from 'react-native-reanimated';
import { AppState, StyleSheet } from 'react-native';
import { Typography } from './src/components/Typography';
import { Flame } from 'lucide-react-native';
import { GlobalToast } from './src/components/GlobalToast';
import {
  useFonts,
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
  Sora_800ExtraBold,
} from '@expo-google-fonts/sora';

function SplashScreen() {
  return (
    <Animated.View exiting={FadeOut.duration(500)} style={styles.splashContainer}>
      <Animated.View entering={FadeIn.duration(800).springify()}>
        <Flame color={theme.colors.primary} size={64} />
      </Animated.View>
      <Animated.View entering={FadeIn.delay(300).duration(800)}>
        <Typography variant="display" style={styles.splashTitle}>Strava AI Coach</Typography>
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
    color: theme.colors.text,
    marginTop: theme.spacing.md,
  }
});

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [fontsLoaded] = useFonts({
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
  });

  useEffect(() => {
    const init = async () => {
      const start = Date.now();
      try {
        await StravaService.initialize();
        await registerBackgroundSync();
      } catch (e) {
        console.warn('Strava init error:', e);
      }
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 800 - elapsed);
      setTimeout(() => setIsReady(true), remaining);
    };
    init();

    // Initial sync after store hydrates
    const notifTimer = setTimeout(() => {
      syncAllNotifications().catch(e => console.warn('notif sync error:', e));
    }, 3000);

    // Re-sync whenever activities change (covers streak going active/inactive
    // and "logged today" transitions)
    const unsubActivities = useStore.subscribe((s, prev) => {
      if (s.activities !== prev.activities || s.userStats !== prev.userStats) {
        syncAllNotifications().catch(e => console.warn('notif sync error:', e));
      }
    });

    // Re-sync on app foreground:
    //  • notifications (day boundary may have crossed while backgrounded)
    //  • Strava activities, if last sync was >30 min ago — Android background
    //    fetch is unreliable, so we treat foreground transitions as a
    //    guaranteed sync trigger.
    const appStateSub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      syncAllNotifications().catch(e => console.warn('notif sync error:', e));
      try {
        await StravaService.initialize();
        if (!StravaService.isAuthenticated()) return;
        const lastSyncedAt = useStore.getState().lastSyncedAt;
        const stale = !lastSyncedAt || (Date.now() - new Date(lastSyncedAt).getTime()) > 30 * 60 * 1000;
        if (!stale) return;
        const activities = await StravaService.syncActivities();
        const { setActivities, setLastSyncedAt, goals, setGoals } = useStore.getState();
        setActivities(activities);
        setLastSyncedAt(new Date().toISOString());
        // Lazy-import to avoid a hot circular dep on cold start.
        const { computeAllProgress } = await import('./src/services/goalProgress');
        setGoals(computeAllProgress(goals, activities));
      } catch (e) {
        console.warn('[ForegroundSync] error:', e);
      }
    });

    return () => {
      clearTimeout(notifTimer);
      unsubActivities();
      appStateSub.remove();
    };
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
        {(!isReady || !fontsLoaded) && <SplashScreen />}
        <GlobalToast />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
