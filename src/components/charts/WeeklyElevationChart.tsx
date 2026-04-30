import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { theme } from '../../constants/theme';

export const WeeklyElevationChart = () => {
  const areaData = [
    {value: 10, label: '12-01'},
    {value: 70, label: ''},
    {value: 60, label: ''},
    {value: 20, label: '12-29'},
    {value: 25, label: ''},
    {value: 10, label: '01-12'},
    {value: 40, label: ''},
    {value: 380, label: '01-26'},
    {value: 10, label: ''},
    {value: 5, label: '02-16'},
    {value: 30, label: ''},
    {value: 40, label: ''},
    {value: 15, label: '03-09'},
    {value: 35, label: ''},
    {value: 5, label: ''},
    {value: 60, label: '04-06'},
    {value: 0, label: '04-27'},
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>WEEKLY ELEVATION (M)</Text>
      <View style={styles.chartContainer}>
        <LineChart
          areaChart
          data={areaData}
          color={theme.colors.primaryGreen}
          startFillColor={theme.colors.primaryGreen}
          endFillColor={theme.colors.primaryGreen}
          startOpacity={0.2}
          endOpacity={0.0}
          thickness={2}
          hideDataPoints
          hideRules={false}
          rulesColor={theme.colors.border}
          rulesType="solid"
          xAxisColor={theme.colors.border}
          yAxisColor={theme.colors.border}
          yAxisTextStyle={{color: theme.colors.textSecondary, fontSize: 10}}
          xAxisLabelTextStyle={{color: theme.colors.textSecondary, fontSize: 10}}
          spacing={20}
          initialSpacing={10}
          maxValue={380}
          noOfSections={4}
          stepValue={95}
          isAnimated
          curved
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
    marginBottom: theme.spacing.md,
  },
  title: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    letterSpacing: 1,
    marginBottom: theme.spacing.lg,
  },
  chartContainer: {
    alignItems: 'center',
    marginLeft: -10, // Adjust alignment for gifted-charts y-axis
  }
});
