import React from 'react';
import { StyleSheet, ViewProps, TouchableOpacity, Platform } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';

type Variant = 'flat' | 'elevated' | 'glass' | 'gradient';
type GradientKey = keyof typeof theme.colors.gradients;

interface CardProps extends ViewProps {
  children: React.ReactNode;
  style?: any;
  onPress?: () => void;
  variant?: Variant;
  gradient?: GradientKey;
  glow?: string;
}

export const Card = ({
  children,
  style,
  onPress,
  variant = 'flat',
  gradient = 'primary',
  glow,
  ...props
}: CardProps) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (onPress) scale.value = withSpring(0.97, { damping: 10, stiffness: 400 });
  };
  const handlePressOut = () => {
    if (onPress) scale.value = withSpring(1, { damping: 10, stiffness: 400 });
  };
  const handlePress = () => {
    if (onPress) {
      onPress();
    }
  };

  const variantStyle = (() => {
    switch (variant) {
      case 'elevated':
        return [styles.card, styles.elevated, theme.shadows.md];
      case 'glass':
        return [styles.card, styles.glass, theme.shadows.sm];
      case 'gradient':
        return [styles.cardBase, theme.shadows.md];
      default:
        return [styles.card];
    }
  })();

  const glowStyle = glow ? theme.shadows.glow(glow) : null;

  const inner =
    variant === 'gradient' ? (
      <LinearGradient
        colors={theme.colors.gradients[gradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.cardBase, styles.gradientPad]}
      >
        {children}
      </LinearGradient>
    ) : (
      children
    );

  const CardContent = (
    <Animated.View style={[variantStyle, glowStyle, style, animatedStyle]} {...props}>
      {inner}
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
      >
        {CardContent}
      </TouchableOpacity>
    );
  }

  return CardContent;
};

const styles = StyleSheet.create({
  cardBase: {
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  elevated: {
    backgroundColor: theme.colors.surfaceElevated,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  glass: {
    backgroundColor: Platform.OS === 'ios' ? 'rgba(42,44,64,0.65)' : theme.colors.surfaceElevated,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  gradientPad: {
    padding: theme.spacing.md,
  },
});
