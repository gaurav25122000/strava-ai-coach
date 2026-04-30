import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { theme } from '../../constants/theme';

export const HeartRateZonesChart = () => {
  const pieData = [
    {value: 50, color: theme.colors.primaryRed}, // Zone 4/5
    {value: 30, color: theme.colors.primaryOrange}, // Zone 3
    {value: 20, color: '#FCD34D'}, // Zone 2 (Yellowish)
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>HEART RATE ZONES</Text>
      <View style={styles.chartContainer}>
        <PieChart
          data={pieData}
          radius={120}
          innerRadius={0} // To make it a pie, not a donut (as per screenshot)
          semiCircle
          showText={false}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.xl, // Extra space at bottom
  },
  title: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    letterSpacing: 1,
    marginBottom: theme.spacing.lg,
  },
  chartContainer: {
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    paddingBottom: 20,
  }
});
