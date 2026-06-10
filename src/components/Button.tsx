import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LucideIcon } from 'lucide-react-native';
import { theme, withAlpha } from '../theme';
import { familyStyle, WidgetFamily } from '../utils/widgetFamilies';
import { PressableScale } from './PressableScale';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  variant?: Variant;
  size?: Size;
  /**
   * Widget family driving the accent/gradient. Omit for the app-wide primary
   * orange. Destructive ignores family and always uses the danger palette.
   */
  family?: WidgetFamily;
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

const SIZES: Record<Size, { height: number; padH: number; gap: number; icon: number; font: number; radius: number }> = {
  sm: { height: 38, padH: 14, gap: 6, icon: 15, font: 13, radius: 12 },
  md: { height: 46, padH: 20, gap: 8, icon: 17, font: 15, radius: 14 },
  lg: { height: 54, padH: 24, gap: 9, icon: 19, font: 16, radius: 16 },
};

/**
 * The app's single button. Gradient `primary` carries the main action of a
 * surface (one per screen/sheet); `secondary` is a tinted fill for co-equal
 * actions; `outline`/`ghost` recede; `destructive` warns. All variants spring
 * on press via PressableScale and fire weight-appropriate haptics.
 */
export function Button({
  title,
  variant = 'primary',
  size = 'md',
  family,
  icon: IconGlyph,
  loading = false,
  disabled = false,
  fullWidth = false,
  onPress,
  style,
}: ButtonProps) {
  const s = SIZES[size];
  const accent = family ? familyStyle(family).accent : theme.colors.primary;
  const gradient: [string, string] = family
    ? familyStyle(family).gradient
    : theme.colors.gradients.primary;

  const blocked = disabled || loading;
  const isFilled = variant === 'primary' || variant === 'destructive';
  const fillGradient: [string, string] = variant === 'destructive' ? theme.colors.gradients.danger : gradient;
  const contentColor =
    isFilled ? theme.colors.onAccent
    : variant === 'ghost' ? theme.colors.textSecondary
    : accent;

  const frame: ViewStyle = {
    height: s.height,
    borderRadius: s.radius,
    paddingHorizontal: s.padH,
    ...(fullWidth ? { alignSelf: 'stretch' as const } : { alignSelf: 'flex-start' as const }),
  };

  const surface: ViewStyle =
    variant === 'secondary' ? { backgroundColor: withAlpha(accent, 'tint') }
    : variant === 'outline' ? { borderWidth: 1.5, borderColor: withAlpha(accent, 'heavy') }
    : variant === 'ghost' ? {}
    : {};

  const glow = isFilled && !blocked ? theme.shadows.glow(fillGradient[0]) : undefined;

  const content = (
    <View style={[styles.content, { gap: s.gap }]}>
      {loading ? (
        <ActivityIndicator size="small" color={contentColor} />
      ) : (
        <>
          {IconGlyph ? <IconGlyph size={s.icon} color={contentColor} strokeWidth={2.5} /> : null}
          <Text
            numberOfLines={1}
            style={{
              color: contentColor,
              fontSize: s.font,
              fontFamily: theme.fonts.semibold,
              letterSpacing: 0.2,
            }}
          >
            {title}
          </Text>
        </>
      )}
    </View>
  );

  return (
    <PressableScale
      onPress={blocked ? undefined : onPress}
      disabled={blocked}
      scaleTo={0.97}
      haptic={blocked ? 'none' : isFilled ? 'medium' : 'selection'}
      style={[frame, glow, blocked && { opacity: theme.opacity.disabled }, style]}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: loading }}
    >
      {isFilled ? (
        <LinearGradient
          colors={fillGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: s.radius }]}
        />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { borderRadius: s.radius }, surface]} />
      )}
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
