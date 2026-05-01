import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { theme } from '../../constants/theme';
import { useStore } from '../../store/useStore';
import { format } from 'date-fns';

export const WeeklyElevationChart = () => {
  const { activities } = useStore();

  const runs = activities
    .filter(a => a.type === 'Run' || a.type === 'VirtualRun')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Chronological

  let areaData = runs.map((run, index) => ({
      value: run.elevation,
      label: index % Math.ceil(runs.length / 5) === 0 ? format(new Date(run.date), 'MM-dd') : ''
  }));

  if (areaData.length === 0) {
      areaData = [{value: 0, label: ''}];
  }

  const maxElev = Math.max(...areaData.map(d => d.value), 100);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ELEVATION GAIN (M)</Text>
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
          spacing={Math.max(250 / Math.max(areaData.length, 1), 5)}
          initialSpacing={10}
          maxValue={Math.ceil(maxElev + 10)}
          noOfSections={4}
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
    marginLeft: -10,
  }
});
