import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../constants/theme';

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  colorName?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, unit, colorName }) => {
  // @ts-ignore
  const valueColor = colorName && theme.colors[colorName] ? theme.colors[colorName] : theme.colors.textPrimary;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
        {unit && <Text style={styles.unit}>{unit}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    flex: 1,
    marginRight: theme.spacing.sm, // Assuming these are used in a row
  },
  label: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    letterSpacing: 1,
    marginBottom: theme.spacing.sm,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  value: {
    ...theme.typography.h2,
  },
  unit: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  }
});
