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

    // Re-sync on app foreground — day boundary may have crossed while
    // backgrounded, and the streak may now be broken or already-logged.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        syncAllNotifications().catch(e => console.warn('notif sync error:', e));
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
        {!isReady && <SplashScreen />}
        <GlobalToast />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
