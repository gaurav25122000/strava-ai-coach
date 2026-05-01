import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ScrollView } from 'react-native';
import { theme } from '../theme';

interface HeatmapEntry {
  date: string;
  level: 0 | 1 | 2 | 3 | 4;
  type?: string;
  km?: number;
}

interface HeatmapCalendarProps {
  data: HeatmapEntry[];
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

const CELL = 14;
const GAP = 3;
const CELL_STEP = CELL + GAP;
const NUM_WEEKS = 26;

function getTypeEmoji(type?: string): string {
  if (!type) return '●';
  if (type === 'Run' || type === 'TrailRun') return '🏃';
  if (type === 'Walk' || type === 'Hike') return '🚶';
  if (type === 'Ride' || type === 'VirtualRide') return '🚴';
  if (type === 'Swim') return '🏊';
  return '⚡';
}

function getTypeColor(type?: string, level?: number): string {
  const colors = theme.colors.heatmapLevels;
  // tint slightly by type using opacity — base color drives intensity
  return colors[level as keyof typeof colors] ?? colors[0];
}

interface TooltipState {
  dateStr: string;
  level: 0 | 1 | 2 | 3 | 4;
  type?: string;
  km?: number;
  hasActivity: boolean;
}

export const HeatmapCalendar = ({ data }: HeatmapCalendarProps) => {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Build lookup: date → entry
  const dateMap = new Map<string, HeatmapEntry>();
  data.forEach(d => dateMap.set(d.date.split('T')[0], d));

  const today = new Date();
  const todayDow = (today.getDay() + 6) % 7; // Mon=0
  const daysFromTopLeft = (NUM_WEEKS - 1) * 7 + todayDow;

  // Build weeks
  const weeks: { dateStr: string; level: number; isFuture: boolean; entry?: HeatmapEntry }[][] = [];
  const monthLabelPositions: { col: number; label: string }[] = [];

  for (let w = 0; w < NUM_WEEKS; w++) {
    const week: typeof weeks[0] = [];
    for (let d = 0; d < 7; d++) {
      const daysAgo = daysFromTopLeft - (w * 7 + d);
      const cellDate = new Date(today);
      cellDate.setDate(cellDate.getDate() - daysAgo);
      const dateStr = localDateStr(cellDate);
      const isFuture = daysAgo < 0;
      const entry = dateMap.get(dateStr);
      week.push({ dateStr, level: isFuture ? 0 : (entry?.level ?? 0), isFuture, entry });

      if (d === 0 && !isFuture && cellDate.getDate() <= 7) {
        monthLabelPositions.push({ col: w, label: MONTH_NAMES[cellDate.getMonth()] });
      }
    }
    weeks.push(week);
  }

  // Stats
  const totalActiveDays = data.length;
  const activeLast30 = data.filter(d => {
    const daysAgo = Math.round((today.getTime() - new Date(d.date).getTime()) / 86400000);
    return daysAgo <= 30;
  }).length;

  // Current streak
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (dateMap.has(localDateStr(d))) streak++;
    else if (i > 0) break; // allow today to be missing
  }

  const COLORS = theme.colors.heatmapLevels;

  const levelLabel = (level: number) => {
    if (level === 0) return 'Rest day';
    if (level === 1) return 'Short (<5 km)';
    if (level === 2) return 'Moderate (5-10 km)';
    if (level === 3) return 'Long (10-20 km)';
    return 'Epic (20+ km)';
  };

  return (
    <View style={styles.container}>
      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalActiveDays}</Text>
          <Text style={styles.statLabel}>Total Days</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{activeLast30}</Text>
          <Text style={styles.statLabel}>Last 30d</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: streak > 0 ? '#f97316' : theme.colors.textSecondary }]}>
            {streak}🔥
          </Text>
          <Text style={styles.statLabel}>Day Streak</Text>
        </View>
      </View>

      {/* Grid */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View>
          {/* Month labels */}
          <View style={[styles.monthRow, { width: NUM_WEEKS * CELL_STEP }]}>
            {monthLabelPositions.map((mp, i) => (
              <Text key={i} style={[styles.monthLabel, { left: mp.col * CELL_STEP }]}>
                {mp.label}
              </Text>
            ))}
          </View>

          {/* Grid */}
          <View style={styles.gridRow}>
            <View style={styles.dowCol}>
              {DAY_LABELS.map((label, i) => (
                <Text key={i} style={styles.dowLabel}>{label}</Text>
              ))}
            </View>
            <View style={styles.grid}>
              {weeks.map((week, wIndex) => (
                <View key={wIndex} style={styles.weekCol}>
                  {week.map((cell, dIndex) => {
                    const isToday = cell.dateStr === localDateStr(today);
                    const isSelected = tooltip?.dateStr === cell.dateStr;
                    const bgColor = cell.isFuture
                      ? 'transparent'
                      : COLORS[cell.level as keyof typeof COLORS];
                    return (
                      <TouchableOpacity
                        key={`${wIndex}-${dIndex}`}
                        activeOpacity={0.7}
                        onPress={() =>
                          setTooltip(isSelected ? null : {
                            dateStr: cell.dateStr,
                            level: cell.level as 0 | 1 | 2 | 3 | 4,
                            type: cell.entry?.type,
                            km: cell.entry?.km,
                            hasActivity: !!cell.entry,
                          })
                        }
                      >
                        <View
                          style={[
                            styles.cell,
                            { backgroundColor: bgColor },
                            isToday && styles.todayCell,
                            isSelected && styles.selectedCell,
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
          <View style={{ flex: 1 }}>
            <Text style={styles.tooltipDate}>{tooltip.dateStr}</Text>
            <Text style={styles.tooltipDetail}>
              {tooltip.hasActivity
                ? `${getTypeEmoji(tooltip.type)} ${tooltip.type ?? 'Activity'}  ·  ${tooltip.km?.toFixed(1) ?? '?'} km  ·  ${levelLabel(tooltip.level)}`
                : 'Rest day'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setTooltip(null)}>
            <Text style={styles.tooltipClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <Text style={styles.legendLabel}>Less</Text>
        {([0, 1, 2, 3, 4] as const).map(level => (
          <View key={level} style={[styles.cell, { backgroundColor: COLORS[level] }]} />
        ))}
        <Text style={styles.legendLabel}>More</Text>
        <Text style={styles.legendSub}>  intensity = distance</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {},

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  statLabel: { fontSize: 10, color: theme.colors.textSecondary, marginTop: 2, fontWeight: '600' },
  statDivider: { width: 1, height: 30, backgroundColor: theme.colors.border },

  scrollContent: { paddingBottom: 4 },

  monthRow: { height: 16, position: 'relative', marginLeft: 28, marginBottom: 2 },
  monthLabel: {
    position: 'absolute', fontSize: 9,
    color: theme.colors.textSecondary, fontWeight: '600',
  },

  gridRow: { flexDirection: 'row' },
  dowCol: { width: 26, gap: GAP, paddingTop: 1 },
  dowLabel: {
    height: CELL, fontSize: 8,
    color: theme.colors.textSecondary,
    lineHeight: CELL, textAlign: 'right', paddingRight: 4,
  },

  grid: { flexDirection: 'row', gap: GAP },
  weekCol: { gap: GAP },

  cell: { width: CELL, height: CELL, borderRadius: 3 },
  todayCell: { borderWidth: 2, borderColor: theme.colors.primary },
  selectedCell: { borderWidth: 1.5, borderColor: '#fff', transform: [{ scale: 1.15 }] },

  tooltip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 10, padding: 10, marginTop: 10, gap: 10,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  tooltipDot: { width: 10, height: 10, borderRadius: 5 },
  tooltipDate: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '600' },
  tooltipDetail: { fontSize: 12, color: theme.colors.text, fontWeight: '700', marginTop: 2 },
  tooltipClose: { fontSize: 14, color: theme.colors.textSecondary, paddingHorizontal: 4 },

  legend: {
    flexDirection: 'row', alignItems: 'center',
    gap: 4, marginTop: 10,
  },
  legendLabel: { fontSize: 9, color: theme.colors.textSecondary },
  legendSub: { fontSize: 9, color: theme.colors.textSecondary, marginLeft: 2 },
});
