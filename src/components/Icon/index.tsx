import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LucideIcon } from 'lucide-react-native';
import { theme } from '../../theme';
import { familyStyle, WidgetFamily } from '../../utils/widgetFamilies';

/**
 * Premium icon wrapper around lucide-react-native. Five things it standardises:
 *
 * 1. Stroke width — lucide defaults to 2; we use 2.25 for a beefier visual.
 * 2. Sizing — t-shirt sizes so every icon in the app stays in one of 6 buckets.
 * 3. Family colour — passes the family accent through automatically.
 * 4. Pill variants — wraps the icon in a tinted / gradient / glowing container
 *    so callers don't keep rebuilding 28×28 family-tinted boxes inline.
 * 5. Hero stroke — for big icons (lg+) we bump stroke width even further so
 *    the icon doesn't disappear into the background.
 */

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';
export type IconVariant = 'plain' | 'pill' | 'gradient' | 'glow' | 'solid';

const SIZE_PX: Record<IconSize, number> = {
  xs: 12,
  sm: 14,
  md: 18,
  lg: 22,
  xl: 28,
  hero: 44,
};

// The container pill is slightly larger than the icon — 1.7× for small sizes,
// scaling down for hero so the icon doesn't get lost in chrome.
const PILL_RATIO: Record<IconSize, number> = {
  xs: 1.85,
  sm: 1.85,
  md: 1.75,
  lg: 1.7,
  xl: 1.55,
  hero: 1.4,
};

interface IconProps {
  /** Lucide icon component, e.g. `Heart`. Imported by the caller. */
  icon: LucideIcon;
  /** Family drives accent + tint. Defaults to plan. */
  family?: WidgetFamily;
  /** Size bucket. Default 'md'. */
  size?: IconSize;
  /** Visual variant — 'plain' = just the glyph, 'pill' = tinted square,
   *  'gradient' = family-gradient square with white glyph, 'glow' = pill with
   *  drop-shadow, 'solid' = solid family-accent fill (white glyph). */
  variant?: IconVariant;
  /** Override the colour (only used for 'plain'). */
  color?: string;
  /** Extra container style. */
  style?: StyleProp<ViewStyle>;
  /** Override stroke width. Defaults to 2.25 (2.5 for lg+). */
  strokeWidth?: number;
}

export function Icon({
  icon: Glyph,
  family = 'plan',
  size = 'md',
  variant = 'plain',
  color,
  style,
  strokeWidth,
}: IconProps) {
  const fam = familyStyle(family);
  const px = SIZE_PX[size];
  const pillSize = Math.round(px * PILL_RATIO[size]);
  const stroke = strokeWidth ?? (size === 'lg' || size === 'xl' || size === 'hero' ? 2.5 : 2.25);

  // Bare glyph — no chrome.
  if (variant === 'plain') {
    return <Glyph size={px} color={color ?? fam.accent} strokeWidth={stroke} />;
  }

  // Pill containers share a base layout.
  const radius = Math.round(pillSize * 0.32);
  const containerBase: ViewStyle = {
    width: pillSize,
    height: pillSize,
    borderRadius: radius,
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (variant === 'pill') {
    return (
      <View
        style={[
          containerBase,
          {
            backgroundColor: fam.accent + '22',
            borderWidth: 1,
            borderColor: fam.accent + '55',
          },
          style,
        ]}
      >
        <Glyph size={px} color={fam.accent} strokeWidth={stroke} />
      </View>
    );
  }

  if (variant === 'gradient') {
    return (
      <LinearGradient
        colors={fam.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          containerBase,
          {
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.18)',
          },
          style,
        ]}
      >
        <Glyph size={px} color={theme.colors.onAccent} strokeWidth={stroke} />
      </LinearGradient>
    );
  }

  if (variant === 'glow') {
    return (
      <View
        style={[
          containerBase,
          {
            backgroundColor: fam.accent + '33',
            borderWidth: 1.5,
            borderColor: fam.accent,
            shadowColor: fam.accent,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.65,
            shadowRadius: 12,
            elevation: 6,
          },
          style,
        ]}
      >
        <Glyph size={px} color={fam.accent} strokeWidth={stroke} />
      </View>
    );
  }

  // 'solid' — fully filled accent square with white glyph. Used for the
  // most-prominent CTA/avatar contexts.
  return (
    <View
      style={[
        containerBase,
        {
          backgroundColor: fam.accent,
          shadowColor: fam.accent,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.45,
          shadowRadius: 8,
          elevation: 5,
        },
        style,
      ]}
    >
      <Glyph size={px} color={theme.colors.onAccent} strokeWidth={stroke} />
    </View>
  );
}

/**
 * Convenience hook to get the standard pixel size for a bucket — useful when
 * a caller wants to size something *adjacent* to an icon to match.
 */
export function iconPx(size: IconSize) {
  return SIZE_PX[size];
}
