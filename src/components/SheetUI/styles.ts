import { StyleSheet } from 'react-native';
import { theme } from '../../theme';

// Shared visual primitives for premium sheet bodies. Every value here is
// referenced from `FieldBlock`, `SectionLabel`, `SegmentedControl`, and
// `RowBlock` — keeping the visual rules in one place so the sheets share a
// look across screens.
export const sheetStyles = StyleSheet.create({
  // ── Section label ──────────────────────────────────────────────────
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 10,
  },
  sectionLabelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sectionLabelText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },

  // ── Field block ────────────────────────────────────────────────────
  fieldOuter: {
    width: '100%',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  fieldInput: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    padding: 0,
    margin: 0,
    minHeight: 28,
  },
  fieldInputMultiline: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  fieldHelper: {
    fontSize: 11,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    marginTop: 6,
  },
  fieldHelperError: {
    color: theme.colors.error,
  },
  fieldValueText: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  fieldValuePlaceholder: {
    color: theme.colors.textSecondary,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  // ── Segmented control ──────────────────────────────────────────────
  segmentedOuter: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 12,
    padding: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 12,
  },
  segmentedIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: 9,
  },
  segmentedSegment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    zIndex: 1,
  },
  segmentedTextActive: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.onAccent,
    letterSpacing: 0.3,
  },
  segmentedTextInactive: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },

  // ── Row block (toggle / link / value row) ─────────────────────────
  rowBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 8,
  },
  rowIconPill: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rowBody: { flex: 1 },
  rowLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  rowCaption: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    marginTop: 2,
  },

  // ── Helper info row (info-sheet pattern) ──────────────────────────
  helperRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  helperIconPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helperBody: { flex: 1 },
  helperLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.text,
  },
  helperDesc: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.78)',
    marginTop: 2,
    lineHeight: 18,
  },
});
