import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { theme } from '../constants/theme';
import { Header } from '../components/Header';
import { PaceTrendChart } from '../components/charts/PaceTrendChart';
import { WeeklyElevationChart } from '../components/charts/WeeklyElevationChart';
import { HeartRateZonesChart } from '../components/charts/HeartRateZonesChart';

export const InsightsScreen = () => {
  return (
    <View style={styles.container}>
      <Header title="Insights" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <PaceTrendChart />
        <WeeklyElevationChart />
        <HeartRateZonesChart />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
  }
});
