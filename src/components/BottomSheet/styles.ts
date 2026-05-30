import { StyleSheet } from 'react-native';
import { theme } from '../../theme';

export const styles = StyleSheet.create({
  // The Modal root is a flex column that stacks the backdrop on top of the
  // sheet — justifyContent: flex-end pushes the sheet to the bottom.
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  // The backdrop View fills every pixel ABOVE the sheet. flex:1 inside a
  // flex column lets it consume all remaining vertical space.
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    zIndex: 0,
  },
  backdropPressable: { flex: 1 },
  kav: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    zIndex: 1,
    ...theme.shadows.lg,
  },
  accentStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    zIndex: 2,
  },
  handleArea: {
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: 'center',
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  iconPill: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  titleWrap: { flex: 1, flexDirection: 'column', gap: 2 },
  title: {
    fontSize: 17,
    fontWeight: '900',
    color: theme.colors.text,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  actionWrap: { marginLeft: 8 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  bodyWrap: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 30 },
  paddedBody: { padding: 20, paddingBottom: 30 },
  flexBody: { flexGrow: 1 },
});
