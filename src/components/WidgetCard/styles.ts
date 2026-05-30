import { StyleSheet } from 'react-native';
import { theme } from '../../theme';

/**
 * WidgetCard is a *section*, not a boxed card. Full screen width, no
 * horizontal margin, no wrapping border. Family identity comes through:
 *   - a thin accent bar at the top of each section
 *   - the family-tinted header band underneath
 *   - the icon pill + caption colour
 *
 * Widgets get to breathe edge-to-edge while still being visually grouped.
 */
export const styles = StyleSheet.create({
  card: {
    backgroundColor: 'transparent',
    marginHorizontal: 0,
    marginBottom: theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border + '66',
  },
  accentBar: {
    height: 2,
    width: 28,
    borderRadius: 1,
    marginLeft: theme.spacing.lg,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  iconPill: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  titleWrap: { flex: 1, flexDirection: 'column', gap: 1 },
  title: {
    fontSize: 17,
    fontWeight: '900',
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  caption: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  actionWrap: { marginLeft: 8 },
  body: {
    paddingHorizontal: theme.spacing.lg,
  },
});
