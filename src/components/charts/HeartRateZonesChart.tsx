import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { theme } from '../../constants/theme';
import { useStore } from '../../store/useStore';

export const HeartRateZonesChart = () => {
  const { activities } = useStore();

  // Aggregate mock zones based on average heart rate of activities
  let z2Count = 0;
  let z3Count = 0;
  let z45Count = 0;

  activities.forEach(act => {
      if (act.heartRate > 0) {
          if (act.heartRate < 140) z2Count++;
          else if (act.heartRate < 160) z3Count++;
          else z45Count++;
      }
  });

  const total = z2Count + z3Count + z45Count;

  let pieData = [];
  if (total === 0) {
      pieData = [{value: 100, color: theme.colors.skeletonBackground}];
  } else {
      pieData = [
          {value: (z45Count/total)*100, color: theme.colors.primaryRed}, // Z4/5
          {value: (z3Count/total)*100, color: theme.colors.primaryOrange}, // Z3
          {value: (z2Count/total)*100, color: '#FCD34D'}, // Z2
      ];
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>HEART RATE ZONES (ESTIMATED)</Text>
      <View style={styles.chartContainer}>
        <PieChart
          data={pieData}
          radius={120}
          innerRadius={0}
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
    marginBottom: theme.spacing.xl,
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
