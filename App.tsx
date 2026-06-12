import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import TabNavigator from './src/navigation/TabNavigator';
import { theme } from './src/theme';
import { StravaService } from './src/services/strava';
import { syncAllNotifications } from './src/services/notificationSync';
import { registerBackgroundSync } from './src/services/backgroundSync';
import { performStravaSync } from './src/services/syncRunner';
import { useStore } from './src/store/useStore';
import React, { useEffect, useState } from 'react';
import Animated, { FadeOut, FadeIn } from 'react-native-reanimated';
import { AppState, StyleSheet, View } from 'react-native';
import { Typography } from './src/components/Typography';
import { Flame } from 'lucide-react-native';
import { GlobalToast } from './src/components/GlobalToast';
import { GenerationPill } from './src/components/GenerationPill';
import {
  useFonts,
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
  Sora_800ExtraBold,
} from '@expo-google-fonts/sora';

// Last-resort crash screen — a render error anywhere below used to white-screen
// the whole app with no way out short of force-killing it.
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.errorContainer}>
          <Flame color={theme.colors.primary} size={40} />
          <Typography variant="title" style={styles.errorTitle}>Something broke</Typography>
          <Typography style={styles.errorBody} numberOfLines={4}>
            {String(this.state.error)}
          </Typography>
          <Typography
            onPress={() => this.setState({ error: null })}
            style={styles.errorRetry}
          >
            Tap to retry
          </Typography>
        </View>
      );
    }
    return this.props.children;
  }
}

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
  },
  errorContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  errorTitle: {
    color: theme.colors.text,
  },
  errorBody: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  errorRetry: {
    color: theme.colors.primary,
    ...theme.typography.subtitle,
    padding: theme.spacing.md,
  },
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
      try {
        await StravaService.initialize();
        await registerBackgroundSync();
      } catch (e) {
        console.warn('Strava init error:', e);
      }
      setIsReady(true);
    };
    init();

    // Launch sync — AppState 'change' never fires for the initial cold start,
    // so without this the dashboard only refreshes on foreground returns.
    // performStravaSync waits for hydration itself and skips when <30 min
    // fresh, so this is safe to fire-and-forget without blocking the splash.
    performStravaSync().catch(e => console.warn('[LaunchSync] error:', e));

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
    //  • Strava activities via the shared sync runner (incremental, skips
    //    when <30 min fresh, waits for store hydration).
    const appStateSub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      syncAllNotifications().catch(e => console.warn('notif sync error:', e));
      try {
        await performStravaSync();
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <NavigationContainer theme={customDarkTheme}>
            <StatusBar style="light" />
            <TabNavigator />
            {(!isReady || !fontsLoaded) && <SplashScreen />}
            <GenerationPill />
            <GlobalToast />
          </NavigationContainer>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
