import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TabNavigator from './src/navigation/TabNavigator';
import { theme } from './src/theme';
import { StravaService } from './src/services/strava';
import { useEffect, useState } from 'react';
import Animated, { FadeOut, FadeIn } from 'react-native-reanimated';
import { View, StyleSheet } from 'react-native';
import { Typography } from './src/components/Typography';
import { Flame } from 'lucide-react-native';

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
    StravaService.initialize().then(() => {
      setTimeout(() => setIsReady(true), 1500);
    });
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
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
