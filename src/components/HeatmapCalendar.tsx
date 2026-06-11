import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { Footprints, Bike, Waves, Flame, Zap, Circle, LucideIcon } from 'lucide-react-native';
import { Typography } from './Typography';
import { AnimatedNumber } from './AnimatedNumber';
import { theme, withAlpha } from '../theme';

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
const DOW_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAY_LABELS = ['M', '', 'W', '', 'F', '', 'S'];

// 16 weeks fits the card without horizontal scrolling, which means the cells
// get to be REAL cells (15px, rounded) instead of a year of pixels.
const NUM_WEEKS = 16;
const CELL = 15;
const GAP = 3;
const CELL_STEP = CELL + GAP;

function getTypeIcon(type?: string): { Glyph: LucideIcon; color: string } {
  if (!type) return { Glyph: Circle, color: theme.colors.textSecondary };
  if (type === 'Run' || type === 'TrailRun' || type === 'Walk' || type === 'Hike')
    return { Glyph: Footprints, color: theme.colors.families.activity.accent };
  if (type === 'Ride' || type === 'VirtualRide')
    return { Glyph: Bike, color: theme.colors.families.progress.accent };
  if (type === 'Swim')
    return { Glyph: Waves, color: theme.colors.families.recovery.accent };
  return { Glyph: Zap, color: theme.colors.families.records.accent };
}

const LEVEL_LABELS = ['Rest day', 'Short · under 5 km', 'Moderate · 5–10 km', 'Long · 10–20 km', 'Epic · 20+ km'];

interface SelectedState {
  dateStr: string;
  level: 0 | 1 | 2 | 3 | 4;
  type?: string;
  km?: number;
  hasActivity: boolean;
}

/**
 * 16-week training calendar: airy rounded cells (rest days are hairline
 * outlines, training days glow through the distance heat ramp), today ringed,
 * tap any day for its story. Streak/consistency stats ride on top.
 */
export const HeatmapCalendar = ({ data }: HeatmapCalendarProps) => {
  const [selected, setSelected] = useState<SelectedState | null>(null);

  const { weeks, monthLabelPositions, totalActiveDays, activeLast30, streak, todayStr } = useMemo(() => {
    const dateMap = new Map<string, HeatmapEntry>();
    data.forEach((d) => dateMap.set(d.date.split('T')[0], d));

    const today = new Date();
    const todayDow = (today.getDay() + 6) % 7; // Mon=0
    const daysFromTopLeft = (NUM_WEEKS - 1) * 7 + todayDow;

    const wks: { dateStr: string; level: number; isFuture: boolean; entry?: HeatmapEntry }[][] = [];
    const monthLabels: { col: number; label: string }[] = [];
    for (let w = 0; w < NUM_WEEKS; w++) {
      const week: (typeof wks)[0] = [];
      for (let d = 0; d < 7; d++) {
        const daysAgo = daysFromTopLeft - (w * 7 + d);
        const cellDate = new Date(today);
        cellDate.setDate(cellDate.getDate() - daysAgo);
        const dateStr = localDateStr(cellDate);
        const isFuture = daysAgo < 0;
        const entry = dateMap.get(dateStr);
        week.push({ dateStr, level: isFuture ? 0 : (entry?.level ?? 0), isFuture, entry });
        if (d === 0 && !isFuture && cellDate.getDate() <= 7) {
          monthLabels.push({ col: w, label: MONTH_NAMES[cellDate.getMonth()] });
        }
      }
      wks.push(week);
    }

    const last30 = data.filter((d) => {
      const daysAgo = Math.round((today.getTime() - new Date(d.date).getTime()) / 86400000);
      return daysAgo <= 30;
    }).length;

    let strk = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (dateMap.has(localDateStr(d))) strk++;
      else if (i > 0) break; // today may still be coming
    }

    return {
      weeks: wks,
      monthLabelPositions: monthLabels,
      totalActiveDays: data.length,
      activeLast30: last30,
      streak: strk,
      todayStr: localDateStr(today),
    };
  }, [data]);

  const COLORS = theme.colors.heatmapLevels;
  const accent = theme.colors.families.activity.accent;

  const friendlyDate = (dateStr: string) => {
    const d = new Date(`${dateStr}T12:00:00`);
    return `${DOW_NAMES[(d.getDay() + 6) % 7]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
  };

  return (
    <View>
      {/* Stats strip */}
      <View style={styles.statsRow}>
        <View style={[styles.statChip, streak > 0 && { borderColor: withAlpha(accent, 'strong'), backgroundColor: withAlpha(accent, 'faint') }]}>
          <Flame
            size={15}
            color={streak > 0 ? accent : theme.colors.textSecondary}
            fill={streak > 0 ? accent : 'transparent'}
            strokeWidth={2.5}
          />
          <AnimatedNumber value={streak} style={[styles.statValue, streak > 0 && { color: accent }] as any} />
          <Typography style={styles.statLabel}>streak</Typography>
        </View>
        <View style={styles.statChip}>
          <AnimatedNumber value={activeLast30} style={styles.statValue as any} />
          <Typography style={styles.statLabel}>of last 30d</Typography>
        </View>
        <View style={styles.statChip}>
          <AnimatedNumber value={totalActiveDays} style={styles.statValue as any} />
          <Typography style={styles.statLabel}>days ever</Typography>
        </View>
      </View>

      {/* Month labels */}
      <View style={[styles.monthRow, { width: NUM_WEEKS * CELL_STEP }]}>
        {monthLabelPositions.map((mp, i) => (
          <Typography key={i} style={[styles.monthLabel, { left: mp.col * CELL_STEP }]}>
            {mp.label}
          </Typography>
        ))}
      </View>

      {/* Grid */}
      <View style={styles.gridRow}>
        <View style={styles.dowCol}>
          {DAY_LABELS.map((label, i) => (
            <Typography key={i} style={styles.dowLabel}>{label}</Typography>
          ))}
        </View>
        <View style={styles.grid}>
          {weeks.map((week, wIndex) => (
            <View key={wIndex} style={styles.weekCol}>
              {week.map((cell, dIndex) => {
                const isToday = cell.dateStr === todayStr;
                const isSelected = selected?.dateStr === cell.dateStr;
                const rest = !cell.isFuture && cell.level === 0;
                return (
                  <Pressable
                    key={`${wIndex}-${dIndex}`}
                    disabled={cell.isFuture}
                    onPress={() =>
                      setSelected(
                        isSelected
                          ? null
                          : {
                              dateStr: cell.dateStr,
                              level: cell.level as 0 | 1 | 2 | 3 | 4,
                              type: cell.entry?.type,
                              km: cell.entry?.km,
                              hasActivity: !!cell.entry,
                            },
                      )
                    }
                  >
                    <View
                      style={[
                        styles.cell,
                        cell.isFuture
                          ? styles.futureCell
                          : rest
                            ? styles.restCell
                            : { backgroundColor: COLORS[cell.level as keyof typeof COLORS] },
                        cell.level >= 3 && styles.hotCell,
                        isToday && [styles.todayCell, { borderColor: accent }],
                        isSelected && styles.selectedCell,
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <Typography style={styles.legendLabel}>Rest</Typography>
        <View style={[styles.legendCell, styles.restCell]} />
        {([1, 2, 3, 4] as const).map((level) => (
          <View key={level} style={[styles.legendCell, { backgroundColor: COLORS[level] }]} />
        ))}
        <Typography style={styles.legendLabel}>20 km+</Typography>
        <Typography style={styles.legendSub}>last {NUM_WEEKS} weeks · heat = distance</Typography>
      </View>

      {/* Day detail */}
      {selected && (() => {
        const { Glyph, color } = getTypeIcon(selected.type);
        return (
          <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOut.duration(120)} style={styles.detail}>
            <View style={[styles.detailIcon, { backgroundColor: withAlpha(selected.hasActivity ? color : theme.colors.textSecondary, 'tint') }]}>
              <Glyph size={16} color={selected.hasActivity ? color : theme.colors.textSecondary} strokeWidth={2.4} />
            </View>
            <View style={{ flex: 1 }}>
              <Typography style={styles.detailDate}>{friendlyDate(selected.dateStr)}</Typography>
              <Typography style={styles.detailLine}>
                {selected.hasActivity
                  ? `${selected.type ?? 'Activity'} · ${selected.km?.toFixed(1) ?? '?'} km · ${LEVEL_LABELS[selected.level]}`
                  : 'Rest day'}
              </Typography>
            </View>
          </Animated.View>
        );
      })()}
    </View>
  );
};

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  statChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 9,
    paddingHorizontal: 6,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  statLabel: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },

  monthRow: { height: 15, position: 'relative', marginLeft: 22, marginBottom: 3 },
  monthLabel: {
    position: 'absolute',
    fontSize: 9,
    color: theme.colors.textSecondary,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  gridRow: { flexDirection: 'row' },
  dowCol: { width: 20, gap: GAP, paddingTop: 1 },
  dowLabel: {
    height: CELL,
    fontSize: 8,
    color: theme.colors.textSecondary,
    lineHeight: CELL,
    textAlign: 'center',
    paddingRight: 6,
  },
  grid: { flexDirection: 'row', gap: GAP },
  weekCol: { gap: GAP },

  cell: { width: CELL, height: CELL, borderRadius: 4.5 },
  restCell: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: withAlpha(theme.colors.border, 'heavy'),
  },
  futureCell: { backgroundColor: 'transparent' },
  // The hottest days glow a little — the eye finds the big sessions first.
  hotCell: theme.shadows.glow(theme.colors.primary),
  todayCell: { borderWidth: 2 },
  selectedCell: {
    borderWidth: 2,
    borderColor: theme.colors.text,
    transform: [{ scale: 1.2 }],
  },

  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
  },
  legendCell: { width: 11, height: 11, borderRadius: 3.5 },
  legendLabel: { fontSize: 9, color: theme.colors.textSecondary, fontWeight: '600' },
  legendSub: { fontSize: 9, color: theme.colors.textSecondary, marginLeft: 'auto' },

  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 10,
    marginTop: 10,
  },
  detailIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailDate: {
    ...theme.typography.caption,
    color: theme.colors.text,
  },
  detailLine: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
});
