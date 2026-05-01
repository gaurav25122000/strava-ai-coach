import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { theme } from '../../constants/theme';
import { useStore } from '../../store/useStore';

const parsePaceToDecimal = (pace: string) => {
    if (!pace) return 0;
    const [mins, secs] = pace.split(':').map(Number);
    return mins + (secs / 60);
};

export const PaceTrendChart = () => {
  const { activities } = useStore();

  const runs = activities
    .filter(a => a.type === 'Run' || a.type === 'VirtualRun')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Chronological

  let lineData = runs.map(run => ({
      value: parsePaceToDecimal(run.pace),
      dataPointText: ''
  }));

  if (lineData.length === 0) {
      lineData = [{value: 0, dataPointText: ''}]; // Fallback
  }

  // To display pace properly (lower is better), we might need to invert or just let it map naturally.
  // For a basic implementation, we just plot the decimal pace.

  const maxPace = Math.max(...lineData.map(d => d.value), 10);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PACE TREND (MIN/KM)</Text>
      <View style={styles.chartContainer}>
        <LineChart
          data={lineData}
          color={theme.colors.primaryBlue}
          thickness={3}
          dataPointsColor={theme.colors.primaryBlue}
          dataPointsRadius={4}
          hideRules
          hideYAxisText={false}
          yAxisTextStyle={{color: theme.colors.textSecondary, fontSize: 10}}
          xAxisColor={theme.colors.border}
          yAxisColor={theme.colors.border}
          hideDataPoints={lineData.length > 30} // Hide dots if too many
          spacing={Math.max(250 / Math.max(lineData.length, 1), 5)}
          initialSpacing={10}
          maxValue={Math.ceil(maxPace + 1)}
          noOfSections={4}
          isAnimated
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
    marginLeft: -20,
  }
});
