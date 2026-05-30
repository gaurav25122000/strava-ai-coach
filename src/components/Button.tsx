import React from 'react';
import { StyleSheet, View, ActivityIndicator, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LucideIcon } from 'lucide-react-native';
import { theme } from '../theme';
import { Typography } from './Typography';
import { PressableScale } from './PressableScale';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  variant?: Variant;
  size?: Size;
  /** Optional left-side lucide glyph. */
  icon?: LucideIcon;
  /** Swaps the label for a spinner and blocks presses. */
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the parent's width. */
  fullWidth?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

const SIZES: Record<Size, { minHeight: number; padH: number; gap: number; icon: number }> = {
  sm: { minHeight: 40, padH: 16, gap: 6, icon: 16 },
  md: { minHeight: 52, padH: 22, gap: 8, icon: 18 },
  lg: { minHeight: 58, padH: 28, gap: 10, icon: 20 },
};

/**
 * Premium pressable button. Built on PressableScale so every press springs and
 * fires a haptic. The primary variant is a gradient slab with an accent glow;
 * secondary/outline/ghost are flatter for lower-emphasis actions. Honors
 * `loading` (spinner, press blocked) and `disabled` (dimmed, inert), and all
 * sizes meet the 44pt touch-target minimum.
 */
export const Button = ({
  title,
  variant = 'primary',
  size = 'md',
  icon: Glyph,
  loading = false,
  disabled = false,
  fullWidth = false,
  onPress,
  style,
}: ButtonProps) => {
  const s = SIZES[size];
  const blocked = disabled || loading;
  const labelColor = variant === 'primary' ? '#fff' : theme.colors.text;

  const content = loading ? (
    <ActivityIndicator color={labelColor} size="small" />
  ) : (
    <>
      {Glyph ? <Glyph size={s.icon} color={labelColor} strokeWidth={2.5} /> : null}
      <Typography variant="subtitle" color={labelColor} style={styles.label}>
        {title}
      </Typography>
    </>
  );

  const inner = (
    <View style={[styles.inner, { minHeight: s.minHeight, paddingHorizontal: s.padH, gap: s.gap }]}>
      {content}
    </View>
  );

  const shape: ViewStyle = {
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
    opacity: disabled ? 0.4 : 1,
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
  };

  return (
    <PressableScale
      onPress={blocked ? undefined : onPress}
      haptic={blocked ? 'none' : variant === 'primary' ? 'medium' : 'selection'}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: loading }}
      accessibilityLabel={title}
      style={[shape, variant === 'primary' && !disabled ? theme.shadows.glow(theme.colors.primary) : null, style]}
    >
      {variant === 'primary' ? (
        <LinearGradient colors={theme.colors.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          {inner}
        </LinearGradient>
      ) : (
        <View style={styles[`${variant}Bg`]}>{inner}</View>
      )}
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: theme.fonts.semibold,
  },
  secondaryBg: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  outlineBg: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  ghostBg: {
    backgroundColor: 'transparent',
  },
});
