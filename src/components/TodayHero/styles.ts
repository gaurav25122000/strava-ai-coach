import { StyleSheet } from 'react-native';
import { theme } from '../../theme';

export const styles = StyleSheet.create({
  card: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
  gradient: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
    gap: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateBlock: { gap: 4 },
  dateDow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
  },
  dateNum: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.5,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.28)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  streakValue: { fontSize: 16, fontWeight: '900', color: '#fff' },
  streakLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },

  workoutBlock: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  workoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  workoutKindBadge: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  workoutTitle: { fontSize: 17, fontWeight: '800', color: '#fff', flexShrink: 1 },
  workoutDesc: { fontSize: 13, color: 'rgba(255,255,255,0.86)', lineHeight: 19 },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  metaText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  ctaRow: { flexDirection: 'row', gap: 10 },
  cta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
  },
  ctaPrimary: { backgroundColor: '#fff' },
  ctaPrimaryText: { fontSize: 13, fontWeight: '800' },
  ctaSecondary: { backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  ctaSecondaryText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  syncDot: { width: 6, height: 6, borderRadius: 3 },
  syncText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },

  // Rest-day variant — calm tone instead of training accent.
  restBlock: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  restEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
  },
  restTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  restNote: { fontSize: 13, color: 'rgba(255,255,255,0.82)', lineHeight: 19 },

  // No-plan variant — invites the user to create their first AI goal.
  noPlanBlock: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  noPlanText: { fontSize: 13, color: 'rgba(255,255,255,0.86)', lineHeight: 19 },

  unlinkedText: { fontSize: 11, fontWeight: '700', color: theme.colors.warning },
});
