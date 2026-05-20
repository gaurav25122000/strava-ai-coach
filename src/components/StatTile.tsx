import React from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '../theme';
import { Typography } from './Typography';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react-native';

interface StatTileProps {
  icon?: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  delta?: number; // % change vs prev period
  accent?: string; // accent color (defaults to primary)
  compact?: boolean;
}

export const StatTile = ({ icon, label, value, unit, delta, accent = theme.colors.primary, compact }: StatTileProps) => {
  const DeltaIcon = delta == null ? null : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const deltaColor = delta == null ? theme.colors.textSecondary : delta > 0 ? theme.colors.success : delta < 0 ? theme.colors.error : theme.colors.textSecondary;

  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      <View style={styles.head}>
        {icon ? <View style={[styles.iconChip, { backgroundColor: accent + '22' }]}>{icon}</View> : null}
        <Typography variant="caption" color={theme.colors.textSecondary} style={styles.label}>
          {label.toUpperCase()}
        </Typography>
      </View>
      <View style={styles.row}>
        <Typography variant="numeric" color={theme.colors.text} style={compact ? styles.valueCompact : undefined}>
          {value}
        </Typography>
        {unit ? (
          <Typography variant="subtitle" color={theme.colors.textSecondary} style={styles.unit}>
            {unit}
          </Typography>
        ) : null}
      </View>
      {delta != null && DeltaIcon ? (
        <View style={styles.deltaRow}>
          <DeltaIcon size={12} color={deltaColor} />
          <Typography variant="caption" color={deltaColor}>
            {Math.abs(delta).toFixed(1)}% vs last period
          </Typography>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    gap: 4,
  },
  compact: {
    paddingVertical: theme.spacing.xs,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconChip: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: theme.colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  valueCompact: {
    fontSize: 22,
    lineHeight: 26,
  },
  unit: {
    fontSize: 14,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
});
