import { StyleSheet } from 'react-native';
import { theme } from '../../theme';

export const styles = StyleSheet.create({
  // Body wrapper inside the shared BottomSheet (edge-to-edge, so it owns its own
  // padding). flex:1 lets the inner ScrollView grow while the CTA row stays
  // pinned to the bottom.
  body: {
    flex: 1,
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  prescBox: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderLeftWidth: 3,
    marginTop: 4,
  },
  prescMetaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  prescMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  prescMetaText: { fontSize: 12, fontWeight: '600', color: theme.colors.text },
  restBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(96,165,250,0.08)',
    borderLeftWidth: 2,
    borderLeftColor: '#60A5FA',
  },
  autoMatched: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  rpeRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  rpePill: {
    minWidth: 28,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  rpeText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  notesInput: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontSize: 16,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
  },
});
