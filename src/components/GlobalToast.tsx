import React, { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle, AlertCircle, Info } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { Typography } from './Typography';
import { useStore } from '../store/useStore';
import { theme } from '../theme';

export function GlobalToast() {
  const { toast, setToast } = useStore();

  useEffect(() => {
    if (toast) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(
          toast.type === 'error'
            ? Haptics.NotificationFeedbackType.Error
            : Haptics.NotificationFeedbackType.Success,
        );
      }
      const timer = setTimeout(() => {
        setToast(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [toast, setToast]);

  if (!toast) return null;

  const isError = toast.type === 'error';
  const gradient = isError ? theme.colors.gradients.danger : theme.colors.gradients.success;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        entering={FadeInUp.springify()}
        exiting={FadeOutUp.springify()}
        style={[styles.wrapper, theme.shadows.glow(gradient[0])]}
      >
        <PressableScale
          onPress={() => setToast(null)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notification"
          style={styles.pressable}
        >
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.container}
          >
            {isError
              ? <Icon icon={AlertCircle} variant="plain" size="md" color="#fff" />
              : <Icon icon={CheckCircle} variant="plain" size="md" color="#fff" />}
            <Typography style={styles.text}>
              {toast.title ? `${toast.title}: ` : ''}{toast.message}
            </Typography>
          </LinearGradient>
        </PressableScale>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 60, // safe area top margin
    alignSelf: 'center',
    borderRadius: theme.borderRadius.full,
    zIndex: 9999,
  },
  pressable: {
    borderRadius: theme.borderRadius.full,
  },
  container: {
    borderRadius: theme.borderRadius.full,
    paddingVertical: theme.spacing.sm + 4,
    paddingHorizontal: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  text: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: theme.spacing.sm,
    fontSize: 14,
  },
});
