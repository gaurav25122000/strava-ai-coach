import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import { Typography } from '../components/Typography';
import { theme, withAlpha } from '../theme';
import { familyStyle, WidgetFamily } from '../utils/widgetFamilies';

/**
 * Shown when a widget has nothing to render. Widgets must NEVER return null
 * from their body — a silently vanishing section reads as a bug. Explain
 * what unlocks it instead.
 */
export function EmptyHint({
  icon: Icon,
  family,
  text,
}: {
  icon: LucideIcon;
  family: WidgetFamily;
  text: string;
}) {
  const fam = familyStyle(family);
  return (
    <View style={[styles.emptyWrap, { borderColor: withAlpha(fam.accent, 'medium') }]}>
      <Icon size={18} color={fam.accent} strokeWidth={2} />
      <Typography style={styles.emptyText}>{text}</Typography>
    </View>
  );
}

/** Small uppercase metric label + value pair used across widget bodies. */
export function MetricBlock({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <View style={styles.metricBlock}>
      <Typography style={[styles.metricValue, accent ? { color: accent } : null]}>{value}</Typography>
      <Typography style={styles.metricLabel}>{label}</Typography>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: theme.borderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  emptyText: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  metricBlock: {
    flex: 1,
    gap: 2,
  },
  metricValue: {
    ...theme.typography.numericSm,
    color: theme.colors.text,
  },
  metricLabel: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
  },
});
