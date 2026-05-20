import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withDelay } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';

interface ProgressBarProps {
  progress: number; // 0 to 100
  color?: string;
  height?: number;
  gradient?: [string, string];
  delay?: number;
}

export const ProgressBar = ({
  progress,
  color = theme.colors.success,
  height = 6,
  gradient,
  delay = 0,
}: ProgressBarProps) => {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withDelay(
      delay,
      withSpring(progress, { damping: 18, stiffness: 110, mass: 0.9 }),
    );
  }, [progress, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  return (
    <View style={[styles.container, { height }]}>
      <Animated.View style={[styles.bar, animatedStyle]}>
        {gradient ? (
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: color }]} />
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#374151',
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: theme.borderRadius.full,
  },
});
