import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../theme';
import { Typography } from './Typography';

interface HeatmapCalendarProps {
  data: { date: string; level: 0 | 1 | 2 | 3 | 4 }[];
}

import { parseISO, differenceInDays } from 'date-fns';

export const HeatmapCalendar = ({ data }: HeatmapCalendarProps) => {
  // Build a map of dates to levels from passed data
  const dateMap = new Map<string, number>();
  data.forEach(d => dateMap.set(d.date.split('T')[0], d.level));

  const today = new Date();

  // Calculate 20 weeks
  const weeks = Array.from({ length: 20 }).map((_, wIndex) => {
    return Array.from({ length: 7 }).map((_, dIndex) => {
      // Calculate date for this cell (working backwards from today)
      const daysAgo = (19 - wIndex) * 7 + (6 - dIndex);
      const cellDate = new Date(today);
      cellDate.setDate(cellDate.getDate() - daysAgo);

      const dateString = cellDate.toISOString().split('T')[0];
      return dateMap.get(dateString) || 0;
    });
  });

  const months = ['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov']; // Simplified

  return (
    <View style={styles.container}>
      <Typography variant="label" style={styles.title}>Activity Calendar</Typography>

      <View style={styles.monthHeader}>
        {months.map((month, i) => (
          <Typography key={i} variant="caption" style={styles.monthText}>{month}</Typography>
        ))}
      </View>

      <View style={styles.gridContainer}>
        <View style={styles.daysAxis}>
          <Typography variant="caption" style={styles.dayText}>Mon</Typography>
          <Typography variant="caption" style={styles.dayText}>Wed</Typography>
          <Typography variant="caption" style={styles.dayText}>Fri</Typography>
          <Typography variant="caption" style={styles.dayText}>Sun</Typography>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.grid}>
            {weeks.map((week, wIndex) => (
              <View key={wIndex} style={styles.weekCol}>
                {week.map((level, dIndex) => (
                  <View
                    key={`${wIndex}-${dIndex}`}
                    style={[
                      styles.cell,
                      { backgroundColor: theme.colors.heatmapLevels[level as keyof typeof theme.colors.heatmapLevels] }
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <View style={styles.legend}>
        <Typography variant="caption">Less</Typography>
        <View style={styles.legendCells}>
          {[0, 1, 2, 3, 4].map(level => (
            <View
              key={`legend-${level}`}
              style={[
                styles.cell,
                { backgroundColor: theme.colors.heatmapLevels[level as keyof typeof theme.colors.heatmapLevels] }
              ]}
            />
          ))}
        </View>
        <Typography variant="caption">More</Typography>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: theme.spacing.md,
  },
  title: {
    marginBottom: theme.spacing.sm,
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 40, // offset for days axis
    marginBottom: 8,
    paddingRight: 16,
  },
  monthText: {
    fontSize: 10,
  },
  gridContainer: {
    flexDirection: 'row',
  },
  daysAxis: {
    justifyContent: 'space-between',
    paddingRight: 8,
    paddingTop: 8,
    paddingBottom: 8,
  },
  dayText: {
    fontSize: 10,
    lineHeight: 12,
  },
  grid: {
    flexDirection: 'row',
    gap: 4,
  },
  weekCol: {
    gap: 4,
  },
  cell: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  legendCells: {
    flexDirection: 'row',
    gap: 4,
  }
});
