import { StyleSheet } from 'react-native';
import { theme } from '../../theme';

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: { fontSize: 19, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.3 },
  done: { color: theme.colors.primary, fontWeight: '800', fontSize: 15 },
  scrollContent: { padding: 16, paddingBottom: 60 },
  intro: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 14, lineHeight: 18 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    padding: 0,
  },

  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 8,
  },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.text,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  groupCount: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: theme.borderRadius.md,
    marginBottom: 8,
    borderWidth: 1,
  },
  rowActive: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  rowHidden: {
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    opacity: 0.7,
  },
  rowAccentBar: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginRight: 12,
  },
  rowBody: { flex: 1, flexDirection: 'column' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  rowTitleHidden: { color: theme.colors.textSecondary },
  rowFamily: { fontSize: 10, fontWeight: '700', color: theme.colors.textSecondary, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },

  rowControls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: {
    padding: 6,
    borderRadius: 8,
  },
  toggle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  toggleOn: { backgroundColor: theme.colors.primary },
  toggleOff: { backgroundColor: 'transparent', borderWidth: 2, borderColor: theme.colors.textSecondary },

  emptyText: {
    textAlign: 'center',
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginTop: 40,
  },
});
