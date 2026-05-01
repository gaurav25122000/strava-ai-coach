import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { theme } from '../constants/theme';
import { exportActivitiesToCSV } from '../utils/export';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useRef } from 'react';
import { Share } from 'lucide-react-native';
import { TouchableOpacity, Text as RNText } from 'react-native';
import { Download } from 'lucide-react-native';
import { Header } from '../components/Header';
import { PaceTrendChart } from '../components/charts/PaceTrendChart';
import { WeeklyElevationChart } from '../components/charts/WeeklyElevationChart';
import { HeartRateZonesChart } from '../components/charts/HeartRateZonesChart';

export const InsightsScreen = () => {
  const viewShotRef = useRef<ViewShot>(null);

  const captureAndShare = async () => {
    try {
      if (viewShotRef.current && viewShotRef.current.capture) {
        const uri = await viewShotRef.current.capture();
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(uri, { dialogTitle: 'Share your Insights' });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Insights" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.exportButton, {marginRight: 8}]} onPress={captureAndShare}>
            <Share size={18} color={theme.colors.primaryOrange} style={{ marginRight: 8 }} />
            <RNText style={styles.exportButtonText}>Share Image</RNText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportButton} onPress={exportActivitiesToCSV}>
            <Download size={18} color={theme.colors.textPrimary} style={{ marginRight: 8 }} />
            <RNText style={styles.exportButtonText}>Export CSV</RNText>
          </TouchableOpacity>
        </View>

        <ViewShot ref={viewShotRef} options={{ format: 'jpg', quality: 0.9 }}>
          <View style={{ backgroundColor: theme.colors.background }}>
            <View style={styles.filterRow}>
              {['1W', '1M', '3M', '6M', '1Y', 'ALL'].map(f => (
                 <TouchableOpacity key={f} style={styles.filterChip}>
                   <RNText style={styles.filterText}>{f}</RNText>
                 </TouchableOpacity>
              ))}
            </View>

            <PaceTrendChart />
            <WeeklyElevationChart />
            <HeartRateZonesChart />
          </View>
        </ViewShot>
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
  },
  actionRow: {
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    alignItems: 'flex-end',
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.round,
    backgroundColor: theme.colors.cardBackground,
  },
  filterText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    fontWeight: 'bold',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.cardBackground,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.round,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  exportButtonText: {
    ...theme.typography.caption,
    color: theme.colors.textPrimary,
    fontWeight: 'bold',
  }
});
