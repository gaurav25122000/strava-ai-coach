import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { theme } from '../../constants/theme';

export const PaceTrendChart = () => {
  const lineData = [
    {value: 7.6, dataPointText: ''},
    {value: 7.2, dataPointText: ''},
    {value: 8.5, dataPointText: ''},
    {value: 7.1, dataPointText: ''},
    {value: 8.5, dataPointText: ''},
    {value: 8.4, dataPointText: ''},
    {value: 6.5, dataPointText: ''},
    {value: 8.5, dataPointText: ''},
    {value: 9.5, dataPointText: ''},
    {value: 9.2, dataPointText: ''},
    {value: 7.5, dataPointText: ''},
    {value: 8.5, dataPointText: ''},
    {value: 9.8, dataPointText: ''},
    {value: 6.8, dataPointText: ''},
    {value: 8.2, dataPointText: ''},
    {value: 9.5, dataPointText: ''},
  ];

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
          hideDataPoints={false}
          spacing={20}
          initialSpacing={10}
          maxValue={10}
          noOfSections={4}
          stepValue={1}
          yAxisLabelTexts={['10', '9.5', '8.55', '7.6']} // Inverted logically via labels, but gifted charts handles max-min differently. This is mock.
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
    marginLeft: -20, // Adjust alignment for gifted-charts y-axis
  }
});
