import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ScrollView } from 'react-native';
import { theme } from '../theme';

interface HeatmapCalendarProps {
  data: { date: string; level: 0 | 1 | 2 | 3 | 4 }[];
}

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

const CELL = 13;
const GAP = 3;
const CELL_STEP = CELL + GAP;

export const HeatmapCalendar = ({ data }: HeatmapCalendarProps) => {
  const [tooltip, setTooltip] = useState<{ dateStr: string; level: number } | null>(null);

  const dateMap = new Map<string, number>();
  data.forEach(d => dateMap.set(d.date.split('T')[0], d.level));

  const today = new Date();
  // Monday = 0, Sunday = 6
  const todayDow = (today.getDay() + 6) % 7;

  const NUM_WEEKS = 26; // ~6 months
  // daysFromTopLeft: how many days from top-left cell to today
  const daysFromTopLeft = (NUM_WEEKS - 1) * 7 + todayDow;

  // Build weeks array
  const weeks: { dateStr: string; level: number; isFuture: boolean }[][] = [];
  const monthLabelPositions: { col: number; label: string }[] = [];

  for (let w = 0; w < NUM_WEEKS; w++) {
    const week: { dateStr: string; level: number; isFuture: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const daysAgo = daysFromTopLeft - (w * 7 + d);
      const cellDate = new Date(today);
      cellDate.setDate(cellDate.getDate() - daysAgo);
      const dateStr = localDateStr(cellDate);
      const isFuture = daysAgo < 0;
      week.push({ dateStr, level: isFuture ? 0 : (dateMap.get(dateStr) ?? 0), isFuture });

      // Attach month label when day === 1 (first of month) on Mon row
      if (d === 0 && !isFuture && cellDate.getDate() <= 7) {
        monthLabelPositions.push({ col: w, label: MONTH_NAMES[cellDate.getMonth()] });
      }
    }
    weeks.push(week);
  }

  const totalActiveDays = data.length;
  const activeLast30 = data.filter(d => {
    const daysAgo = Math.round((today.getTime() - new Date(d.date).getTime()) / 86400000);
    return daysAgo <= 30;
  }).length;

  const COLORS = theme.colors.heatmapLevels;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Activity Heatmap</Text>
        <View style={styles.headerStats}>
          <Text style={styles.statChip}>{totalActiveDays} total</Text>
          <Text style={styles.statChip}>{activeLast30} this month</Text>
        </View>
      </View>

      {/* Grid */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View>
          {/* Month labels row */}
          <View style={[styles.monthRow, { width: NUM_WEEKS * CELL_STEP }]}>
            {monthLabelPositions.map((mp, i) => (
              <Text
                key={i}
                style={[styles.monthLabel, { left: mp.col * CELL_STEP }]}
              >
                {mp.label}
              </Text>
            ))}
          </View>

          {/* Day grid */}
          <View style={styles.gridRow}>
            {/* Day-of-week labels */}
            <View style={styles.dowCol}>
              {DAY_LABELS.map((label, i) => (
                <Text key={i} style={styles.dowLabel}>{label}</Text>
              ))}
            </View>

            {/* Columns */}
            <View style={styles.grid}>
              {weeks.map((week, wIndex) => (
                <View key={wIndex} style={styles.weekCol}>
                  {week.map((cell, dIndex) => {
                    const isToday = cell.dateStr === localDateStr(today);
                    const isActive = tooltip?.dateStr === cell.dateStr;
                    return (
                      <TouchableOpacity
                        key={`${wIndex}-${dIndex}`}
                        activeOpacity={0.7}
                        onPress={() => setTooltip(isActive ? null : cell)}
                      >
                        <View
                          style={[
                            styles.cell,
                            { backgroundColor: cell.isFuture ? 'transparent' : COLORS[cell.level as keyof typeof COLORS] },
                            isToday && styles.todayCell,
                            isActive && styles.activeCell,
                          ]}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Tooltip */}
      {tooltip && (
        <View style={styles.tooltip}>
          <View style={[styles.tooltipDot, { backgroundColor: COLORS[tooltip.level as keyof typeof COLORS] }]} />
          <Text style={styles.tooltipText}>
            {tooltip.dateStr}  ·  {tooltip.level === 0 ? 'No activity' : `Level ${tooltip.level}`}
          </Text>
          <TouchableOpacity onPress={() => setTooltip(null)}>
            <Text style={styles.tooltipClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <Text style={styles.legendLabel}>Less</Text>
        {[0, 1, 2, 3, 4].map(level => (
          <View
            key={level}
            style={[styles.cell, { backgroundColor: COLORS[level as keyof typeof COLORS] }]}
          />
        ))}
        <Text style={styles.legendLabel}>More</Text>
        <Text style={styles.legendSub}> · size = distance</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {},

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerStats: { flexDirection: 'row', gap: 6 },
  statChip: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },

  scrollContent: { paddingBottom: 4 },

  monthRow: {
    height: 16,
    position: 'relative',
    marginLeft: 28, // leave space for dow labels
    marginBottom: 2,
  },
  monthLabel: {
    position: 'absolute',
    fontSize: 9,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },

  gridRow: { flexDirection: 'row' },

  dowCol: { width: 26, gap: GAP, paddingTop: 1 },
  dowLabel: {
    height: CELL,
    fontSize: 8,
    color: theme.colors.textSecondary,
    lineHeight: CELL,
    textAlign: 'right',
    paddingRight: 4,
  },

  grid: { flexDirection: 'row', gap: GAP },
  weekCol: { gap: GAP },

  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 3,
  },
  todayCell: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  activeCell: {
    borderWidth: 1.5,
    borderColor: '#fff',
  },

  tooltip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tooltipDot: { width: 8, height: 8, borderRadius: 4 },
  tooltipText: { flex: 1, fontSize: 11, color: theme.colors.text, fontWeight: '600' },
  tooltipClose: { fontSize: 11, color: theme.colors.textSecondary, paddingHorizontal: 4 },

  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
  },
  legendLabel: { fontSize: 9, color: theme.colors.textSecondary },
  legendSub: { fontSize: 9, color: theme.colors.textSecondary, marginLeft: 4 },
});
