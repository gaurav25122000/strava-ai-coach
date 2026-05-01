import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView, SafeAreaView, Dimensions } from 'react-native';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { Typography } from '../components/Typography';
import { LineChart, PieChart } from 'react-native-gifted-charts';
import { useStore } from '../store/useStore';
import { format, parseISO } from 'date-fns';

const { width } = Dimensions.get('window');

export default function InsightsScreen() {
  const { activities } = useStore();

  const paceData = useMemo(() => {
    if (!activities.length) return [{value: 0}];
    return [...activities]
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .filter(a => a.type === 'Run' && a.averageSpeed > 0)
      .map(act => {
        // Convert m/s to min/km
        const minPerKm = 1000 / act.averageSpeed / 60;
        return { value: Number(minPerKm.toFixed(1)) };
      });
  }, [activities]);

  const elevationData = useMemo(() => {
    if (!activities.length) return [{value: 0}];
    return [...activities]
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .map(act => ({ value: act.totalElevationGain || 0 }));
  }, [activities]);

  const pieData = useMemo(() => {
    let z2 = 0, z3 = 0, z4 = 0;
    activities.forEach(act => {
      const hr = act.averageHeartRate || 0;
      if (hr > 150) z4++;
      else if (hr > 130) z3++;
      else if (hr > 0) z2++;
    });

    const total = z2 + z3 + z4;
    if (total === 0) {
       return [
        { value: 1, color: theme.colors.border, text: 'No Data' }
       ];
    }

    return [
      { value: Math.round((z4/total)*100), color: theme.colors.error, text: 'Z4' },
      { value: Math.round((z3/total)*100), color: theme.colors.primary, text: 'Z3' },
      { value: Math.round((z2/total)*100), color: '#FCD34D', text: 'Z2' },
    ];
  }, [activities]);

  const dateLabels = useMemo(() => {
     if (activities.length === 0) return [];
     const sorted = [...activities].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
     // Pick up to 5 even intervals for the x-axis
     const step = Math.max(1, Math.floor(sorted.length / 5));
     const labels = [];
     for (let i = 0; i < sorted.length; i+=step) {
         labels.push(format(parseISO(sorted[i].startDate), 'MM-dd'));
     }
     return labels.slice(0, 5);
  }, [activities]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Pace Trend Chart */}
        <Card style={styles.card}>
          <Typography variant="label" style={styles.chartTitle}>Pace Trend (min/km)</Typography>
          <View style={styles.chartContainer}>
            <LineChart
              data={paceData}
              height={180}
              width={width - 80}
              thickness={3}
              color="#3B82F6"
              hideDataPoints={false}
              dataPointsColor="#3B82F6"
              dataPointsRadius={4}
              yAxisColor={theme.colors.border}
              xAxisColor={theme.colors.border}
              yAxisTextStyle={{ color: theme.colors.textSecondary, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: theme.colors.textSecondary, fontSize: 10 }}
              noOfSections={4}
              maxValue={10}
              yAxisLabelSuffix=""
              isAnimated
              curved
              initialSpacing={10}
              rulesColor={theme.colors.border}
              rulesType="solid"
            />
          </View>
        </Card>

        {/* Weekly Elevation Chart */}
        <Card style={styles.card}>
          <Typography variant="label" style={styles.chartTitle}>Weekly Elevation (m)</Typography>
          <View style={styles.chartContainer}>
            <LineChart
              data={elevationData}
              height={180}
              width={width - 80}
              thickness={2}
              color={theme.colors.success}
              hideDataPoints
              yAxisColor={theme.colors.border}
              xAxisColor={theme.colors.border}
              yAxisTextStyle={{ color: theme.colors.textSecondary, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: theme.colors.textSecondary, fontSize: 10 }}
              noOfSections={4}
              maxValue={380}
              isAnimated
              curved
              areaChart
              startFillColor={theme.colors.success}
              endFillColor={theme.colors.background}
              startOpacity={0.4}
              endOpacity={0.0}
              initialSpacing={0}
              rulesColor={theme.colors.border}
              rulesType="solid"
            />
          </View>
          <View style={styles.xAxisLabels}>
             {dateLabels.map((lbl, idx) => (
                <Typography key={idx} variant="caption" style={{fontSize: 10}}>{lbl}</Typography>
             ))}
          </View>
        </Card>

        {/* Heart Rate Zones Chart */}
        <Card style={styles.card}>
          <Typography variant="label" style={styles.chartTitle}>Heart Rate Zones</Typography>
          <View style={styles.pieContainer}>
            <PieChart
              data={pieData}
              donut
              showText
              textColor="white"
              radius={100}
              innerRadius={0}
              textSize={12}
              semiCircle
            />
          </View>
        </Card>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  card: {
    marginBottom: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  chartTitle: {
    marginBottom: theme.spacing.lg,
  },
  chartContainer: {
    alignItems: 'center',
    marginLeft: -10,
  },
  pieContainer: {
    alignItems: 'center',
    marginTop: theme.spacing.xl,
    marginBottom: -40, // Adjust for semicircle
  },
  xAxisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginLeft: 30,
  }
});
