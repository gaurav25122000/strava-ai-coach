import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../constants/theme';

export const ActivityHeatmap = () => {
  // Generate mock heatmap data
  const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  const days = ['Mon', 'Wed', 'Fri', 'Sun'];

  const generateGrid = () => {
    const grid = [];
    for (let i = 0; i < 7; i++) { // 7 days a week
      const row = [];
      for (let j = 0; j < 25; j++) { // roughly 25 weeks to show
        // Randomly assign a heat level (0 to 4)
        const heatLevel = Math.random() > 0.6 ? Math.floor(Math.random() * 4) + 1 : 0;
        row.push(heatLevel);
      }
      grid.push(row);
    }
    return grid;
  };

  const gridData = generateGrid();

  const getColor = (level: number) => {
    switch (level) {
      case 1: return theme.colors.heatmapLevels[1];
      case 2: return theme.colors.heatmapLevels[2];
      case 3: return theme.colors.heatmapLevels[3];
      case 4: return theme.colors.heatmapLevels[4];
      default: return theme.colors.heatmapLevels[0];
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ACTIVITY CALENDAR</Text>

      <View style={styles.heatmapContainer}>
        {/* Months Header */}
        <View style={styles.monthsRow}>
          <View style={styles.dayLabelSpacer} />
          {months.map((month, index) => (
            <Text key={index} style={styles.monthText}>{month}</Text>
          ))}
        </View>

        <View style={styles.gridContainer}>
           {/* Days Y-axis */}
           <View style={styles.daysCol}>
            {days.map((day, index) => (
              <Text key={index} style={[styles.dayText, { marginTop: index === 0 ? 0 : 12 }]}>{day}</Text>
            ))}
           </View>

           {/* Grid */}
           <ScrollView horizontal showsHorizontalScrollIndicator={false}>
             <View style={styles.grid}>
                {gridData.map((row, rowIndex) => (
                  <View key={rowIndex} style={styles.gridRow}>
                    {row.map((level, colIndex) => (
                      <View
                        key={colIndex}
                        style={[styles.cell, { backgroundColor: getColor(level) }]}
                      />
                    ))}
                  </View>
                ))}
             </View>
           </ScrollView>
        </View>

        {/* Legend */}
        <View style={styles.legendContainer}>
          <Text style={styles.legendText}>Less</Text>
          {[0, 1, 2, 3, 4].map(level => (
            <View key={level} style={[styles.legendCell, { backgroundColor: getColor(level) }]} />
          ))}
          <Text style={styles.legendText}>More</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  title: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    letterSpacing: 1,
    marginBottom: theme.spacing.md,
  },
  heatmapContainer: {

  },
  monthsRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.sm,
    justifyContent: 'space-between',
    paddingRight: theme.spacing.md,
  },
  dayLabelSpacer: {
    width: 30,
  },
  monthText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  gridContainer: {
    flexDirection: 'row',
  },
  daysCol: {
    width: 30,
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  dayText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    fontSize: 10,
  },
  grid: {
    flexDirection: 'column',
    gap: 4,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 4,
  },
  cell: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  legendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    gap: 6,
  },
  legendText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    fontSize: 10,
  },
  legendCell: {
    width: 10,
    height: 10,
    borderRadius: 2,
  }
});
