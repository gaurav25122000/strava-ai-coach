import { StyleSheet } from 'react-native';
import { theme } from '../../theme';

// Sizes are derived from the medal diameter so a single `size` prop scales
// the whole composition (ring, inner disc, emoji, lock).
export function medalStyles(size: number) {
  const ringThickness = Math.max(3, Math.round(size * 0.08));
  const inner = size - ringThickness * 2;
  return StyleSheet.create({
    container: { alignItems: 'center', width: size + 16 },
    ring: {
      width: size,
      height: size,
      borderRadius: size / 2,
      alignItems: 'center',
      justifyContent: 'center',
      padding: ringThickness,
    },
    innerDisc: {
      width: inner,
      height: inner,
      borderRadius: inner / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
    },
    glyph: {
      fontSize: Math.round(inner * 0.55),
      lineHeight: Math.round(inner * 0.62),
    },
    lockOverlay: {
      position: 'absolute',
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 11,
      fontWeight: '800',
      color: theme.colors.text,
      textAlign: 'center',
      marginTop: 8,
      maxWidth: size + 16,
    },
    titleLocked: { color: theme.colors.textSecondary },
    date: {
      fontSize: 9,
      fontWeight: '700',
      color: theme.colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      marginTop: 2,
    },
  });
}

export const sharedStyles = StyleSheet.create({
  ringInactive: { opacity: 0.35 },
});
