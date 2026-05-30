import React, { useMemo, useState, useDeferredValue, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { Typography } from '../components/Typography';
import { LineChart, BarChart, PieChart } from 'react-native-gifted-charts';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  interpolate,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useStore } from '../store/useStore';
import { format, parseISO, startOfWeek, endOfWeek, eachWeekOfInterval, subWeeks } from 'date-fns';
import {
  Heart,
  BarChart3,
  Zap,
  Activity,
  Settings2,
  Footprints,
  Clock,
  TrendingUp,
  TrendingDown,
  Mountain,
  Flame,
} from 'lucide-react-native';
import { Icon } from '../components/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { chartBase, barProps, lineProps, pieProps, pointerConfig } from '../utils/chartTheme';
import { INSIGHT_FAMILY, familyStyle } from '../utils/widgetFamilies';
import { WidgetCard } from '../components/WidgetCard';
import { BottomSheet } from '../components/BottomSheet';
import { SectionLabel } from '../components/SheetUI';
import { SkeletonChart } from '../components/SkeletonPresets';
import { PressableScale } from '../components/PressableScale';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { ProgressBar } from '../components/ProgressBar';
import { Toggle } from '../components/Toggle';

type Range = '30d' | '3m' | '6m' | '1y' | 'all';
const RANGE_LABELS: Record<Range, string> = { '30d': '30D', '3m': '3M', '6m': '6M', '1y': '1Y', all: 'All' };
const RANGE_KEYS: Range[] = ['30d', '3m', '6m', '1y', 'all'];
const RANGE_DAYS: Record<Range, number> = { '30d': 30, '3m': 90, '6m': 180, '1y': 365, all: Infinity };
const RANGE_WEEKS: Record<Range, number> = { '30d': 4, '3m': 12, '6m': 26, '1y': 52, all: 104 };

const { width: SCREEN_W } = Dimensions.get('window');
// scroll padding 16*2 + widget-card body padding 14*2 + gifted-charts yAxis ~44 = ~104
const CHART_W = SCREEN_W - 108;

type Tab = 'pace' | 'volume' | 'heart' | 'elevation' | 'steps' | 'time' | 'calories' | 'power' | 'cadence' | 'mix';
const ALL_TABS: { key: Tab; label: string }[] = [
  { key: 'steps',     label: 'Steps'     },
  { key: 'time',      label: 'Time'      },
  { key: 'volume',    label: 'Volume'    },
  { key: 'pace',      label: 'Pace'      },
  { key: 'heart',     label: 'HR Zones'  },
  { key: 'cadence',   label: 'Cadence'   },
  { key: 'mix',       label: 'Activity Mix' },
  { key: 'elevation', label: 'Elevation' },
  { key: 'calories',  label: 'Calories'  },
  { key: 'power',     label: 'Power'     },
];

// Each tab maps to a lucide icon that surfaces inside the widget card header.
const TAB_ICON: Record<Tab, React.ComponentType<{ size?: number; color?: string }>> = {
  steps:     Footprints,
  time:      Clock,
  volume:    TrendingUp,
  pace:      Zap,
  heart:     Heart,
  cadence:   Activity,
  mix:       BarChart3,
  elevation: Mountain,
  calories:  Flame,
  power:     Zap,
};

// Short caption shown under each row label in the Manage Graphs sheet —
// describes what the graph plots so the toggle is self-explanatory.
const TAB_DESCRIPTION: Record<Tab, string> = {
  steps:     'Weekly step counts and trend',
  time:      'Active hours per week',
  volume:    'Weekly distance and trend',
  pace:      'Average run pace over time',
  heart:     'Heart-rate zone distribution',
  cadence:   'Steps-per-minute trend',
  mix:       'Activity-type breakdown',
  elevation: 'Elevation gained per week',
  calories:  'Estimated calories burned',
  power:     'Power output per ride',
};

// % change between the latest half of a numeric series and the earlier half.
// Returns null when there's too little data to be meaningful.
function computeTrend(values: number[]): number | null {
  const filtered = values.filter((v) => Number.isFinite(v));
  if (filtered.length < 4) return null;
  const mid = Math.floor(filtered.length / 2);
  const earlier = filtered.slice(0, mid);
  const later = filtered.slice(mid);
  const avg = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  const a = avg(earlier);
  const b = avg(later);
  if (!a) return null;
  return Math.round(((b - a) / a) * 100);
}

export default function InsightsScreen() {
  const { activities, settings, updateSettings, hrZones } = useStore();
  const activeKeys = settings.activeGraphs || ['steps', 'time', 'volume', 'pace', 'heart'];
  const [showManageModal, setShowManageModal] = useState(false);
  const [range, setRange] = useState<Range>('3m');
  const [compareHR, setCompareHR] = useState(false);

  // Deferred range — keeps the pills snappy while heavy memos recompute lazily
  const deferredRange = useDeferredValue(range);
  const rangeDays = RANGE_DAYS[deferredRange];
  const rangeWeeks = RANGE_WEEKS[deferredRange];

  // ── Window of activities for the selected range (per-activity charts) ──
  const windowedActivities = useMemo(() => {
    if (rangeDays === Infinity) return activities;
    const cutoff = Date.now() - rangeDays * 86400000;
    return activities.filter((a) => new Date(a.startDate).getTime() >= cutoff);
  }, [activities, rangeDays]);

  // ── Single weekly bucket pass — feeds volume / time / steps / calories ──
  // Only emits weeks that had at least one activity, so charts don't render
  // empty columns for inactive weeks.
  const weeklyBuckets = useMemo(() => {
    const now = new Date();
    const start = subWeeks(startOfWeek(now, { weekStartsOn: 1 }), rangeWeeks - 1);
    const end = endOfWeek(now, { weekStartsOn: 1 });
    const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }).slice(-rangeWeeks);
    const raw = weeks.map((ws) => {
      const we = endOfWeek(ws, { weekStartsOn: 1 });
      let km = 0, hours = 0, steps = 0, cals = 0;
      for (const a of activities) {
        const d = parseISO(a.startDate);
        if (d < ws || d > we) continue;
        km += a.distance / 1000;
        hours += a.movingTime / 3600;
        if (a.steps) steps += a.steps;
        else if (a.type === 'Run') steps += a.distance / 1.0;
        else if (a.type === 'Walk') steps += a.distance / 0.75;
        cals += a.calories || 0;
      }
      return { ws, km, hours, steps: Math.round(steps), cals: Math.round(cals) };
    });
    const active = raw.filter(b => b.km > 0 || b.hours > 0 || b.steps > 0 || b.cals > 0);
    const labelStep = Math.max(1, Math.ceil(active.length / 6));
    return active.map((b, i, arr) => {
      const showLabel = (arr.length - 1 - i) % labelStep === 0;
      const labelComponent = showLabel
        ? () => (
            <View style={{ width: 45, transform: [{ translateX: -10 }] }}>
              <Typography style={{ color: theme.colors.textSecondary, fontSize: 9, fontWeight: '700', textAlign: 'center' }}>
                {format(b.ws, 'MMM d')}
              </Typography>
            </View>
          )
        : undefined;
      return { ...b, labelComponent };
    });
  }, [activities, rangeWeeks]);

  // Derived chart data (cheap — just maps existing buckets)
  const volumeData = useMemo(
    () => weeklyBuckets.map(b => ({
      value: Number(b.km.toFixed(1)),
      labelComponent: b.labelComponent,
      frontColor: b.km > 0 ? theme.colors.primary : theme.colors.border,
    })),
    [weeklyBuckets]
  );
  const timeData = useMemo(
    () => weeklyBuckets.map(b => ({
      value: Number(b.hours.toFixed(1)),
      labelComponent: b.labelComponent,
      frontColor: b.hours > 0 ? '#8B5CF6' : theme.colors.border,
    })),
    [weeklyBuckets]
  );
  const stepsData = useMemo(
    () => weeklyBuckets.map(b => ({
      value: b.steps,
      labelComponent: b.labelComponent,
      frontColor: b.steps > 0 ? theme.colors.success : theme.colors.border,
    })),
    [weeklyBuckets]
  );
  const caloriesData = useMemo(
    () => weeklyBuckets.map(b => ({
      value: b.cals,
      labelComponent: b.labelComponent,
      frontColor: b.cals > 0 ? '#EF4444' : theme.colors.border,
    })),
    [weeklyBuckets]
  );

  const toggleGraph = (key: Tab) => {
    let newKeys = [...activeKeys];
    if (newKeys.includes(key)) newKeys = newKeys.filter(k => k !== key);
    else newKeys.push(key);
    updateSettings({ activeGraphs: newKeys });
  };

  const fmtPace = (v: number) => {
    const m = Math.floor(v); const s = Math.round((v - m) * 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── Pace ──────────────────────────────────────────────────────────
  const paceRuns = useMemo(
    () =>
      [...windowedActivities]
        .filter((a) => a.type === 'Run' && a.averageSpeed > 0)
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
    [windowedActivities],
  );

  const paceData = useMemo(() => {
    return paceRuns.map((act, i, arr) => {
      const minPerKm = 1000 / act.averageSpeed / 60;
      const isLast = i === arr.length - 1;
      const step = Math.max(1, Math.ceil(arr.length / 5));
      return {
        value: Number(minPerKm.toFixed(2)),
        labelComponent:
          i % step === 0 || isLast
            ? () => (
                <View style={{ width: 40, transform: [{ translateX: -10 }] }}>
                  <Typography style={{ color: theme.colors.textSecondary, fontSize: 10, fontWeight: '700', textAlign: 'center' }}>
                    {format(parseISO(act.startDate), 'MMM d')}
                  </Typography>
                </View>
              )
            : undefined,
      };
    });
  }, [paceRuns]);

  const paceHRData = useMemo(() => {
    if (!paceRuns.length) return [] as { value: number }[];
    const hrVals = paceRuns.map((a) => a.averageHeartRate || 0);
    if (!hrVals.some((v) => v > 0)) return [];
    return hrVals.map((v) => ({ value: v }));
  }, [paceRuns]);

  const bestPace = paceData.length ? Math.min(...paceData.map((d) => d.value)) : 0;
  const avgPace = paceData.length ? paceData.reduce((s, d) => s + d.value, 0) / paceData.length : 0;

  // How many calendar weeks in the selected range had no logged activity at
  // all — surfaced as a small caption under the bar charts so the user knows
  // we trimmed them (instead of silently dropping data).
  const inactiveWeeks = Math.max(0, rangeWeeks - weeklyBuckets.length);

  // Volume / time / steps / calories aggregates
  const maxWeekVol = volumeData.length ? Math.max(...volumeData.map(d => d.value), 1) : 1;
  const totalVol   = volumeData.reduce((s, d) => s + d.value, 0).toFixed(0);
  const BAR_SPACING = Math.max(CHART_W / Math.max(volumeData.length * 2.2, 1), 10);
  const BAR_W       = Math.max(BAR_SPACING * 0.8, 12);
  const maxSteps = stepsData.length ? Math.max(...stepsData.map(d => d.value), 1) : 1;
  const avgSteps = stepsData.length ? Math.round(stepsData.reduce((s,d) => s + d.value, 0) / stepsData.length) : 0;
  const avgTime = timeData.length ? (timeData.reduce((s,d) => s + d.value, 0) / timeData.length).toFixed(1) : '0';
  const avgCalories = caloriesData.length ? Math.round(caloriesData.reduce((s,d) => s + d.value, 0) / caloriesData.length) : 0;

  // ── HR Zones ──────────────────────────────────────────────────────
  const { pieData, zoneStats } = useMemo(() => {
    const boundaries: number[] = hrZones.length >= 5
      ? hrZones.map(z => z.min)
      : [0, 115, 135, 155, 170];

    const counts = [0, 0, 0, 0, 0];
    activities.forEach(a => {
      const hr = a.averageHeartRate || 0;
      if (hr <= 0) return;
      let z = 0;
      for (let i = 0; i < boundaries.length; i++) {
        if (hr >= boundaries[i]) z = i;
      }
      counts[z]++;
    });
    const total = counts.reduce((a, b) => a + b, 0);
    if (!total) return { pieData: [] as any[], zoneStats: [] as any[] };
    const ZONE_DEFS = [
      { label: 'Z1 Recovery',  color: '#60A5FA' },
      { label: 'Z2 Aerobic',   color: '#34D399' },
      { label: 'Z3 Tempo',     color: '#FBBF24' },
      { label: 'Z4 Threshold', color: '#F97316' },
      { label: 'Z5 Max',       color: '#EF4444' },
    ];
    const zones = ZONE_DEFS.map((d, i) => ({ ...d, value: counts[i] })).filter(z => z.value > 0);
    return {
      pieData:   zones.map(z => ({ value: z.value, color: z.color, text: `${Math.round(z.value / total * 100)}%` })),
      zoneStats: zones.map(z => ({ ...z, pct: Math.round(z.value / total * 100) })),
    };
  }, [activities, hrZones]);

  // ── Elevation ─────────────────────────────────────────────────────
  const elevData = useMemo(() => {
    if (!windowedActivities.length) return [];
    return [...windowedActivities]
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .map(a => ({ value: a.totalElevationGain || 0 }));
  }, [windowedActivities]);

  const totalElev = Math.round(windowedActivities.reduce((s, a) => s + a.totalElevationGain, 0));
  const maxElev   = windowedActivities.length ? Math.max(...windowedActivities.map(a => a.totalElevationGain), 1) : 1;

  // ── Power ─────────────────────────────────────────────────────────
  const powerData = useMemo(() => {
    const items = [...windowedActivities]
      .filter((a) => a.averageWatts && a.averageWatts > 0)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    const step = Math.max(1, Math.ceil(items.length / 5));
    return items.map((act, i, arr) => {
      const isLast = i === arr.length - 1;
      return {
        value: Math.round(act.averageWatts || 0),
        labelComponent:
          i % step === 0 || isLast
            ? () => (
                <View style={{ width: 40, transform: [{ translateX: -10 }] }}>
                  <Typography style={{ color: theme.colors.textSecondary, fontSize: 10, fontWeight: '700', textAlign: 'center' }}>
                    {format(parseISO(act.startDate), 'MMM d')}
                  </Typography>
                </View>
              )
            : undefined,
      };
    });
  }, [windowedActivities]);
  const avgPower = powerData.length ? Math.round(powerData.reduce((s,d) => s + d.value, 0) / powerData.length) : 0;

  // ── Cadence ───────────────────────────────────────────────────────
  const cadenceData = useMemo(() => {
    const items = [...windowedActivities]
      .filter((a) => (a.averageCadence || 0) > 0)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    const step = Math.max(1, Math.ceil(items.length / 5));
    return items.map((act, i, arr) => ({
      value: Math.round((act.averageCadence || 0) * 2),
      labelComponent:
        i % step === 0 || i === arr.length - 1
          ? () => (
              <View style={{ width: 40, transform: [{ translateX: -10 }] }}>
                <Typography style={{ color: theme.colors.textSecondary, fontSize: 10, fontWeight: '700', textAlign: 'center' }}>
                  {format(parseISO(act.startDate), 'MMM d')}
                </Typography>
              </View>
            )
          : undefined,
    }));
  }, [windowedActivities]);
  const avgCadence = cadenceData.length ? Math.round(cadenceData.reduce((s, d) => s + d.value, 0) / cadenceData.length) : 0;
  const maxCadence = cadenceData.length ? Math.max(...cadenceData.map(d => d.value), 1) : 200;

  // ── Activity Mix ──────────────────────────────────────────────────
  const { mixPieData, mixStats } = useMemo(() => {
    const counts: Record<string, number> = {};
    activities.forEach(a => { counts[a.type] = (counts[a.type] || 0) + 1; });
    const palette: Record<string, string> = { Run: '#f97316', Walk: '#10b981', Ride: '#6366f1', Workout: '#ec4899' };
    const total = Object.values(counts).reduce((s, v) => s + v, 0) || 1;
    const entries = Object.entries(counts).map(([type, count]) => ({
      type, count, color: palette[type] || '#8b5cf6',
      pct: Math.round(count / total * 100),
    }));
    return {
      mixPieData: entries.map(e => ({ value: e.count, color: e.color, text: `${e.pct}%` })),
      mixStats: entries,
    };
  }, [activities]);

  const paceYLabel = (v: string) => {
    const n = parseFloat(v);
    if (isNaN(n)) return v;
    const m = Math.floor(n); const s = Math.round((n - m) * 60);
    return `${m}:${s.toString().padStart(2,'0')}`;
  };

  // ── Premium empty placeholder for charts with no data — dashed border at
  // the chart height so the layout stays the same regardless of data state.
  const EmptyRow = ({
    icon,
    msg,
    color,
    headline,
    cta,
  }: {
    icon: React.ReactNode;
    msg: string;
    color: string;
    headline?: string;
    cta?: { label: string; onPress: () => void };
  }) => (
    <Animated.View
      entering={FadeIn.duration(theme.motion.base)}
      style={[st.emptyBox, { borderColor: color + '55' }]}
    >
      <View style={[st.emptyIconWrap, { backgroundColor: color + '18', borderColor: color + '55' }]}>
        {icon}
      </View>
      <Typography style={[st.emptyHeadline, { color: theme.colors.text }]}>
        {headline ?? 'No data yet'}
      </Typography>
      <Typography style={[st.emptyCaption, { color: theme.colors.textSecondary }]}>{msg}</Typography>
      {cta && (
        <PressableScale
          scaleTo={0.94}
          haptic="light"
          onPress={cta.onPress}
          style={[st.emptyCta, { backgroundColor: color + '18', borderColor: color + '88' }]}
          accessibilityRole="button"
          accessibilityLabel={cta.label}
        >
          <Typography style={[st.emptyCtaText, { color }]}>{cta.label}</Typography>
        </PressableScale>
      )}
    </Animated.View>
  );

  const Insight = ({ text, color }: { text: string; color: string }) => (
    <View style={[st.insightBar, { borderLeftColor: color, backgroundColor: color + '14' }]}>
      <Icon icon={Zap} variant="plain" size="xs" color={color} />
      <Typography style={[st.insightText, { color }]}>{text}</Typography>
    </View>
  );

  // Big stat row above each chart — primary metric + signed trend chip.
  // When `statValue` (a number) is supplied the hero figure counts up via
  // AnimatedNumber so it tweens on range change; the '—' / formatted-pace
  // (m:ss) cases keep the plain Typography render since they aren't a single
  // number to interpolate.
  const BigStat = ({
    stat,
    statValue,
    statSuffix,
    statDecimals,
    statUnit,
    trend,
  }: {
    stat: string | number;
    statValue?: number;
    statSuffix?: string;
    statDecimals?: number;
    statUnit: string;
    trend: number | null;
  }) => (
    <View style={st.bigStatRow}>
      <View>
        {statValue !== undefined ? (
          <AnimatedNumber
            value={statValue}
            decimals={statDecimals ?? 0}
            suffix={statSuffix ?? ''}
            duration={theme.motion.slow}
            style={st.bigStat}
          />
        ) : (
          <Typography style={st.bigStat}>{stat}</Typography>
        )}
        <Typography style={st.bigStatUnit}>{statUnit}</Typography>
      </View>
      {trend !== null && (
        <View
          style={[
            st.trendChip,
            {
              backgroundColor: trend >= 0 ? '#22c55e22' : '#ef444422',
              borderColor: trend >= 0 ? '#22c55e' : '#ef4444',
            },
          ]}
        >
          {trend >= 0
            ? <Icon icon={TrendingUp} variant="plain" size="xs" color="#22c55e" />
            : <Icon icon={TrendingDown} variant="plain" size="xs" color="#ef4444" />}
          <Typography style={{ fontSize: 11, fontWeight: '800', color: trend >= 0 ? '#22c55e' : '#ef4444' }}>
            {Math.abs(trend)}%
          </Typography>
        </View>
      )}
    </View>
  );

  const visibleTabs = useMemo(
    () => ALL_TABS.filter(t => activeKeys.includes(t.key)),
    [activeKeys]
  );

  // Small caption shown under bar charts when calendar weeks with no activity
  // were filtered out of `weeklyBuckets`. Honest > silently trimming.
  const InactiveCaption = inactiveWeeks > 0
    ? () => (
        <Typography style={st.inactiveCaption}>
          {inactiveWeeks} {inactiveWeeks === 1 ? 'week' : 'weeks'} hidden — no activity recorded
        </Typography>
      )
    : () => null;

  const renderCard = useCallback(({ item: t, index }: { item: { key: Tab; label: string }; index: number }) => {
    const family = INSIGHT_FAMILY[t.key] || 'activity';
    const fam = familyStyle(family);
    const accent = fam.accent;
    const TabIcon = TAB_ICON[t.key];

    // Per-tab "primary metric" + trend series. Pie tabs get a null trend.
    const primary = (() => {
      switch (t.key) {
        case 'steps':
          return {
            title: 'Weekly Steps',
            caption: 'Estimated from run & walk distance',
            stat: avgSteps > 0 ? `${Math.round(avgSteps / 1000)}k` : '—',
            statValue: avgSteps > 0 ? Math.round(avgSteps / 1000) : undefined,
            statSuffix: 'k',
            statUnit: 'avg / week',
            trend: computeTrend(stepsData.map(d => d.value)),
          };
        case 'time':
          return {
            title: 'Active Time',
            caption: 'Hours of movement per week',
            stat: Number(avgTime) > 0 ? avgTime : '—',
            statValue: Number(avgTime) > 0 ? Number(avgTime) : undefined,
            statDecimals: 1,
            statUnit: 'hrs / week',
            trend: computeTrend(timeData.map(d => d.value)),
          };
        case 'volume':
          return {
            title: 'Weekly Volume',
            caption: 'Kilometres across all activities',
            stat: maxWeekVol > 0 ? maxWeekVol.toFixed(0) : '—',
            statValue: maxWeekVol > 0 ? maxWeekVol : undefined,
            statUnit: 'km peak week',
            trend: computeTrend(volumeData.map(d => d.value)),
          };
        case 'pace':
          return {
            title: 'Running Pace',
            caption: `Min/km trend · ${paceData.length} runs in window`,
            stat: bestPace ? fmtPace(bestPace) : '—',
            statUnit: 'min/km best',
            // Pace is inverted — lower is better. Negate so the chip's colour
            // reflects "improvement" instead of raw delta.
            trend: paceData.length ? (() => {
              const t = computeTrend(paceData.map(d => d.value));
              return t === null ? null : -t;
            })() : null,
          };
        case 'heart':
          return {
            title: 'HR Zone Distribution',
            caption: 'Where you spend your effort',
            stat: zoneStats.length ? `${zoneStats.reduce((s, z) => s + z.value, 0)}` : '—',
            statValue: zoneStats.length ? zoneStats.reduce((s, z) => s + z.value, 0) : undefined,
            statUnit: 'sessions',
            trend: null,
          };
        case 'cadence':
          return {
            title: 'Running Cadence',
            caption: 'Steps per minute',
            stat: avgCadence || '—',
            statValue: avgCadence || undefined,
            statUnit: 'spm average',
            trend: computeTrend(cadenceData.map(d => d.value)),
          };
        case 'mix':
          return {
            title: 'Activity Mix',
            caption: 'All-time breakdown by sport',
            stat: mixStats.length ? mixStats.reduce((s, e) => s + e.count, 0) : '—',
            statValue: mixStats.length ? mixStats.reduce((s, e) => s + e.count, 0) : undefined,
            statUnit: 'activities',
            trend: null,
          };
        case 'elevation':
          return {
            title: 'Elevation Gain',
            caption: 'Metres climbed per activity',
            stat: totalElev > 0 ? totalElev.toLocaleString() : '—',
            statUnit: 'm total',
            trend: computeTrend(elevData.map(d => d.value)),
          };
        case 'calories':
          return {
            title: 'Calories Burned',
            caption: 'Weekly kcal from Strava',
            stat: avgCalories || '—',
            statValue: avgCalories || undefined,
            statUnit: 'kcal / wk avg',
            trend: computeTrend(caloriesData.map(d => d.value)),
          };
        case 'power':
          return {
            title: 'Average Power',
            caption: 'Watts from power meter',
            stat: avgPower || '—',
            statValue: avgPower || undefined,
            statUnit: 'W average',
            trend: computeTrend(powerData.map(d => d.value)),
          };
      }
    })();

    // While the deferred range hasn't caught up to the active range, the heavy
    // memos are still recomputing in the background. Surface a skeleton in the
    // chart slot so the card doesn't flicker the prior range's data.
    const rangePending = range !== deferredRange;

    return (
      <Animated.View entering={FadeInDown.delay(Math.min(index * 40, 280)).springify()}>
        <WidgetCard
          family={family}
          title={primary.title}
          caption={primary.caption}
          icon={TabIcon as any}
          style={st.widgetCard}
        >
          <BigStat
            stat={primary.stat}
            statValue={(primary as any).statValue}
            statSuffix={(primary as any).statSuffix}
            statDecimals={(primary as any).statDecimals}
            statUnit={primary.statUnit}
            trend={primary.trend}
          />

          {rangePending && <SkeletonChart height={180} />}

          {!rangePending && t.key === 'steps' && (
            <>
              {stepsData.some(d => d.value > 0) ? (
                <View style={{ overflow: 'hidden', marginTop: 4 }}>
                  <BarChart data={stepsData} height={180} width={CHART_W} barWidth={BAR_W}
                    maxValue={Math.ceil(maxSteps * 1.25)}
                    initialSpacing={BAR_SPACING} spacing={BAR_SPACING}
                    yAxisLabelTexts={Array.from({length:5},(_,i)=>Math.round(maxSteps*1.25*i/4/1000)+'k')}
                    {...barProps(family)}
                    pointerConfig={pointerConfig(' steps', family)}
                    {...chartBase({ family })} />
                </View>
              ) : (
                <EmptyRow icon={<Icon icon={Footprints} variant="plain" size="md" color={accent} />} msg="No steps in this range" color={accent} headline="No steps tracked" />
              )}
              {avgSteps > 0 && <Insight color={accent} text={`${Math.round(avgSteps).toLocaleString()} avg steps/week — 10,000/day target = 70,000/week`} />}
            </>
          )}

          {!rangePending && t.key === 'time' && (
            <>
              {timeData.some(d => d.value > 0) ? (
                <View style={{ overflow: 'hidden', marginTop: 4 }}>
                  <BarChart data={timeData} height={180} width={CHART_W} barWidth={BAR_W}
                    maxValue={Math.ceil(Math.max(...timeData.map(d=>d.value),1) * 1.3)}
                    initialSpacing={BAR_SPACING} spacing={BAR_SPACING}
                    {...barProps(family)}
                    pointerConfig={pointerConfig(' hrs', family)}
                    {...chartBase({ family })} />
                  <InactiveCaption />
                </View>
              ) : (
                <EmptyRow icon={<Icon icon={Clock} variant="plain" size="md" color={accent} />} msg="No time logged in this range" color={accent} headline="No active time" />
              )}
              {Number(avgTime) > 0 && <Insight color={accent} text={`${avgTime} hrs/wk avg — WHO recommends 2.5 hrs moderate activity weekly`} />}
            </>
          )}

          {!rangePending && t.key === 'volume' && (
            <>
              {volumeData.some(d=>d.value>0) ? (
                <View style={{ overflow: 'hidden', marginTop: 4 }}>
                  <BarChart data={volumeData} height={180} width={CHART_W} barWidth={BAR_W}
                    maxValue={Math.ceil(maxWeekVol * 1.35)}
                    initialSpacing={BAR_SPACING} spacing={BAR_SPACING}
                    {...barProps(family)}
                    pointerConfig={pointerConfig(' km', family)}
                    {...chartBase({ family })} />
                  <InactiveCaption />
                </View>
              ) : (
                <EmptyRow icon={<Icon icon={TrendingUp} variant="plain" size="md" color={accent} />} msg="No volume in this range" color={accent} headline="No kilometres" />
              )}
              {Number(totalVol) > 0 && <Insight color={accent} text={`${totalVol} km total · increase no more than 10%/week to avoid injury`} />}
            </>
          )}

          {!rangePending && t.key === 'pace' && (
            <>
              {paceHRData.length > 0 && (
                <PressableScale
                  scaleTo={0.94}
                  haptic="selection"
                  onPress={() => setCompareHR(v => !v)}
                  style={[st.compareChip, compareHR && { backgroundColor: '#EF444422', borderColor: '#EF4444' }]}
                  accessibilityRole="button"
                  accessibilityLabel="Compare heart rate"
                  accessibilityState={{ selected: compareHR }}
                >
                  <Icon icon={Heart} variant="plain" size="xs" color={compareHR ? '#EF4444' : theme.colors.textSecondary} />
                  <Typography style={{ fontSize: 11, fontWeight: '700', color: compareHR ? '#EF4444' : theme.colors.textSecondary }}>
                    {compareHR ? 'Comparing HR' : 'Compare HR'}
                  </Typography>
                </PressableScale>
              )}
              {paceData.length > 1 ? (
                <View style={{ overflow: 'hidden', marginTop: 4 }}>
                  <LineChart {...lineProps(family)} data={paceData}
                    {...(compareHR && paceHRData.length === paceData.length ? { data2: paceHRData, color2: '#EF4444', secondaryYAxis: { yAxisColor: 'transparent', yAxisTextStyle: { color: '#EF4444', fontSize: 10, fontWeight: '700' } } } : {})}
                    height={180} width={CHART_W}
                    maxValue={Math.ceil(Math.max(...paceData.map(d=>d.value)) * 1.15)}
                    initialSpacing={12}
                    spacing={Math.max((CHART_W-12)/Math.max(paceData.length-1,1),18)}
                    yAxisLabelTexts={Array.from({length:5},(_,i)=>{const mx=Math.ceil(Math.max(...paceData.map(d=>d.value))*1.15);const mn=Math.floor(Math.min(...paceData.map(d=>d.value))*0.9);return paceYLabel((mn+(mx-mn)*i/4).toFixed(2));})}
                    pointerConfig={pointerConfig('/km', family)}
                    {...chartBase({ family })} />
                </View>
              ) : (
                <EmptyRow icon={<Icon icon={Zap} variant="plain" size="md" color={accent} />} msg="Need 2+ runs in this range to plot pace" color={accent} headline="Not enough runs" />
              )}
              {avgPace > 0 && <Insight color={accent} text={`Avg ${fmtPace(avgPace)}/km · Best ${bestPace ? fmtPace(bestPace) : '--'}/km · ${paceData.length} runs`} />}
            </>
          )}

          {!rangePending && t.key === 'heart' && (
            <>
              {zoneStats.length > 0 ? (
                <>
                  <View style={{ alignItems: 'center', marginVertical: 16 }}>
                    <PieChart data={pieData} {...pieProps()}
                      centerLabelComponent={() => (
                        <View style={{ alignItems: 'center' }}>
                          <Icon icon={Heart} variant="plain" size="md" color="#EF4444" />
                          <Typography style={{ fontSize: 9, color: theme.colors.textSecondary, marginTop: 2 }}>zones</Typography>
                        </View>
                      )} />
                  </View>
                  <View style={{ gap: 8 }}>
                    {zoneStats.map((z) => {
                      const boundaries: number[] = hrZones.length >= 5
                        ? hrZones.map(hz => hz.min)
                        : [0, 115, 135, 155, 170];
                      const maxBounds = hrZones.length >= 5
                        ? hrZones.map((_, j) => hrZones[j + 1] ? hrZones[j + 1].min - 1 : 999)
                        : [114, 134, 154, 169, 999];
                      const zoneIdx = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'].findIndex(zl => z.label.includes(zl));
                      const bpmRange = zoneIdx >= 0
                        ? (maxBounds[zoneIdx] < 999 ? `${boundaries[zoneIdx]}–${maxBounds[zoneIdx]} bpm` : `${boundaries[zoneIdx]}+ bpm`)
                        : '';
                      return (
                        <View key={z.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: z.color }} />
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <Typography style={{ fontSize: 11, color: theme.colors.text, fontWeight: '600' }}>{z.label}</Typography>
                              <Typography style={{ fontSize: 10, color: theme.colors.textSecondary }}>({bpmRange})</Typography>
                            </View>
                            <ProgressBar progress={z.pct} color={z.color} height={5} />
                          </View>
                          <Typography style={{ fontSize: 12, fontWeight: '700', color: z.color, width: 36, textAlign: 'right' }}>{z.pct}%</Typography>
                        </View>
                      );
                    })}
                  </View>
                  {(() => { const ez=(zoneStats.find(z=>z.label.includes('Z1'))?.pct||0)+(zoneStats.find(z=>z.label.includes('Z2'))?.pct||0); return <Insight color="#ef4444" text={`${ez}% easy effort. Elite runners target 80% in Z1–Z2 for aerobic base building.`} />; })()}
                </>
              ) : (
                <EmptyRow icon={<Icon icon={Heart} variant="plain" size="md" color="#ef4444" />} msg="No HR data — enable heart rate recording on Strava" color="#ef4444" headline="No heart-rate data" />
              )}
            </>
          )}

          {!rangePending && t.key === 'cadence' && (
            <>
              {cadenceData.length > 1 ? (
                <View style={{ overflow: 'hidden', marginTop: 4 }}>
                  <LineChart {...lineProps(family)} data={cadenceData} height={180} width={CHART_W}
                    maxValue={Math.max(maxCadence + 10, 200)}
                    initialSpacing={12}
                    spacing={Math.max((CHART_W-12)/Math.max(cadenceData.length-1,1),18)}
                    yAxisLabelSuffix=" spm"
                    pointerConfig={pointerConfig(' spm', family)}
                    {...chartBase({ family })} />
                </View>
              ) : (
                <EmptyRow icon={<Icon icon={Activity} variant="plain" size="md" color={accent} />} msg="No cadence data in this range" color={accent} headline="No cadence yet" />
              )}
              {avgCadence > 0 && <Insight color={accent} text={`Target 170–180 spm. Your avg ${avgCadence} spm — ${avgCadence < 165 ? 'try shortening your stride' : avgCadence >= 170 ? 'great cadence!' : 'close to optimal'}`} />}
            </>
          )}

          {!rangePending && t.key === 'mix' && (
            <>
              {mixStats.length > 0 ? (
                <>
                  <View style={{ alignItems: 'center', marginVertical: 16 }}>
                    <PieChart data={mixPieData} {...pieProps()}
                      centerLabelComponent={() => (
                        <View style={{ alignItems: 'center' }}>
                          <Icon icon={Activity} variant="plain" size="md" color={theme.colors.primary} />
                          <Typography style={{ fontSize: 9, color: theme.colors.textSecondary, marginTop: 2 }}>mix</Typography>
                        </View>
                      )} />
                  </View>
                  <View style={{ gap: 10 }}>
                    {mixStats.map(e => (
                      <View key={e.type} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: e.color }} />
                        <View style={{ flex: 1 }}>
                          <Typography style={{ fontSize: 11, color: theme.colors.textSecondary, marginBottom: 3 }}>{e.type} — {e.count} activities</Typography>
                          <ProgressBar progress={e.pct} color={e.color} height={5} />
                        </View>
                        <Typography style={{ fontSize: 12, fontWeight: '700', color: e.color, width: 36, textAlign: 'right' }}>{e.pct}%</Typography>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <EmptyRow icon={<Icon icon={BarChart3} variant="plain" size="md" color={accent} />} msg="No activities synced yet" color={accent} headline="No activity mix" cta={{ label: 'Manage graphs', onPress: () => setShowManageModal(true) }} />
              )}
            </>
          )}

          {!rangePending && t.key === 'elevation' && (
            <>
              {elevData.length > 1 ? (
                <View style={{ overflow: 'hidden', marginTop: 4 }}>
                  <LineChart {...lineProps(family)} data={elevData} height={180} width={CHART_W}
                    initialSpacing={0}
                    spacing={Math.max(CHART_W/Math.max(elevData.length-1,1),4)}
                    yAxisLabelSuffix=" m"
                    pointerConfig={pointerConfig('m', family)}
                    {...chartBase({ family })} />
                </View>
              ) : (
                <EmptyRow icon={<Icon icon={Mountain} variant="plain" size="md" color={accent} />} msg="No elevation data in this range" color={accent} headline="No climbs yet" />
              )}
              {totalElev > 0 && <Insight color={accent} text={`${totalElev.toLocaleString()}m total climbed · Peak single activity: ${Math.round(maxElev)}m`} />}
            </>
          )}

          {!rangePending && t.key === 'calories' && (
            <>
              {caloriesData.some(d=>d.value>0) ? (
                <View style={{ overflow: 'hidden', marginTop: 4 }}>
                  <BarChart data={caloriesData} height={180} width={CHART_W} barWidth={BAR_W}
                    maxValue={Math.ceil(Math.max(...caloriesData.map(d=>d.value),1) * 1.25)}
                    initialSpacing={BAR_SPACING} spacing={BAR_SPACING}
                    {...barProps(family)}
                    pointerConfig={pointerConfig(' kcal', family)}
                    {...chartBase({ family })} />
                  <InactiveCaption />
                </View>
              ) : (
                <EmptyRow icon={<Icon icon={Flame} variant="plain" size="md" color={accent} />} msg="No calorie data in this range" color={accent} headline="No calories burned" />
              )}
              {avgCalories > 0 && <Insight color={accent} text={`${avgCalories.toLocaleString()} kcal/wk avg — roughly ${Math.round(avgCalories / 7)} kcal/day from exercise`} />}
            </>
          )}

          {!rangePending && t.key === 'power' && (
            <>
              {powerData.length > 1 ? (
                <View style={{ overflow: 'hidden', marginTop: 4 }}>
                  <LineChart {...lineProps(family)} data={powerData} height={180} width={CHART_W}
                    initialSpacing={12}
                    spacing={Math.max((CHART_W-12)/Math.max(powerData.length-1,1),18)}
                    yAxisLabelSuffix=" W"
                    pointerConfig={pointerConfig('W', family)}
                    {...chartBase({ family })} />
                </View>
              ) : (
                <EmptyRow icon={<Icon icon={Zap} variant="plain" size="md" color={accent} />} msg="No power data — requires a power meter" color={accent} headline="No power data" />
              )}
              {avgPower > 0 && <Insight color={accent} text={`${avgPower}W avg power across ${powerData.length} sessions`} />}
            </>
          )}

        </WidgetCard>
      </Animated.View>
    );
    // ESLint exhaustive-deps would over-list; rely on closure semantics. Range is the dominant trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    range, deferredRange, compareHR,
    paceData, paceHRData, volumeData, timeData, stepsData, caloriesData,
    elevData, powerData, cadenceData,
    zoneStats, pieData, mixPieData, mixStats,
    avgSteps, avgTime, avgPace, bestPace, totalVol, maxWeekVol,
    avgPower, avgCadence, totalElev, avgCalories, maxSteps,
  ]);

  return (
    <SafeAreaView style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Typography style={st.pageTitle}>Insights</Typography>
          <View style={st.pageSubRow}>
            <Icon icon={Activity} variant="plain" size="xs" color={theme.colors.textSecondary} />
            <Typography style={st.pageSub}>{activities.length} activities analysed</Typography>
          </View>
        </View>
        <PressableScale
          onPress={() => setShowManageModal(true)}
          style={st.manageBtnWrap}
          accessibilityRole="button"
          accessibilityLabel="Manage graphs"
        >
          <LinearGradient
            colors={theme.colors.gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={st.manageBtn}
          >
            <Icon icon={Settings2} variant="plain" size="xs" color="#FFFFFF" />
            <Typography style={st.manageBtnText}>Manage</Typography>
          </LinearGradient>
        </PressableScale>
      </View>

      {/* Range selector — sliding pill (PressableScale segments fire the
          selection haptic on press-in, so no extra haptic here) */}
      <RangeSelector range={range} onChange={setRange} />

      <FlatList
        data={visibleTabs}
        keyExtractor={t => t.key}
        renderItem={renderCard}
        contentContainerStyle={st.scroll}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={2}
        maxToRenderPerBatch={1}
        windowSize={3}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Icon icon={BarChart3} variant="plain" size="hero" color={theme.colors.textSecondary} />
            <Typography style={{ color: theme.colors.textSecondary, marginTop: 16, fontSize: 15 }}>No graphs enabled</Typography>
            <TouchableOpacity style={{ marginTop: 12 }} onPress={() => setShowManageModal(true)}>
              <Typography style={{ color: theme.colors.primary, fontWeight: '700' }}>Tap Manage to add some →</Typography>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Manage modal — premium bottom sheet */}
      <BottomSheet
        visible={showManageModal}
        onClose={() => setShowManageModal(false)}
        title="Manage Graphs"
        subtitle="Choose which insights appear on this screen"
        icon={Settings2}
        family="activity"
      >
        <SectionLabel family="activity">On the dashboard</SectionLabel>
        {ALL_TABS.map(t => {
          const fam = INSIGHT_FAMILY[t.key] || 'activity';
          const famStyle = familyStyle(fam);
          const TabIcon = TAB_ICON[t.key];
          const active = activeKeys.includes(t.key);
          return (
            <View key={t.key} style={st.manageRowBlock}>
              <Icon icon={TabIcon as any} family={fam} variant="gradient" size="md" />
              <View style={{ flex: 1 }}>
                <Typography style={st.manageRowLabel}>{t.label}</Typography>
                <Typography style={st.manageRowCaption}>{TAB_DESCRIPTION[t.key]}</Typography>
              </View>
              <Toggle
                value={active}
                onValueChange={() => toggleGraph(t.key)}
                accent={famStyle.accent}
                accessibilityLabel={`${active ? 'Hide' : 'Show'} ${t.label} graph`}
              />
            </View>
          );
        })}
      </BottomSheet>

    </SafeAreaView>
  );
}

// ── Sliding-pill range selector ────────────────────────────────────────
// One rounded container, 5 equal segments, an animated background that
// springs between segments as the user taps. Width is measured via onLayout
// so the indicator stays accurate across orientations and screen sizes.
function RangeSelector({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  const [containerW, setContainerW] = useState(0);
  const idx = RANGE_KEYS.indexOf(range);
  const translateX = useSharedValue(0);
  const segW = containerW > 0 ? containerW / RANGE_KEYS.length : 0;
  // Skip the spring on the very first measured layout so the indicator appears
  // already under the default range instead of twitching in from segment 0.
  const hasLaidOut = useRef(false);

  useEffect(() => {
    if (segW > 0) {
      const target = idx * segW;
      if (!hasLaidOut.current) {
        translateX.value = target;
        hasLaidOut.current = true;
      } else {
        translateX.value = withSpring(target, theme.motion.spring);
      }
    }
  }, [idx, segW, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={st.rangeOuter}>
      <View
        style={st.rangeBar}
        accessibilityRole="tablist"
        onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
      >
        {containerW > 0 && (
          <Animated.View
            style={[st.rangeIndicator, { width: segW }, indicatorStyle]}
          />
        )}
        {RANGE_KEYS.map((r, i) => {
          const selected = r === range;
          return (
            <RangeSegment
              key={r}
              label={RANGE_LABELS[r]}
              index={i}
              selected={selected}
              segW={segW}
              translateX={translateX}
              onPress={() => onChange(r)}
            />
          );
        })}
      </View>
    </View>
  );
}

// One range segment. The active label colour/opacity is derived from the shared
// indicator position so the text brightens as the pill arrives under it, rather
// than snapping the instant `selected` flips.
function RangeSegment({
  label,
  index,
  selected,
  segW,
  translateX,
  onPress,
}: {
  label: string;
  index: number;
  selected: boolean;
  segW: number;
  translateX: SharedValue<number>;
  onPress: () => void;
}) {
  // Distance (in segment-widths) from the indicator's current centre to this
  // segment's centre — 0 when the pill is fully under us, 1+ when it's away.
  const proximity = useDerivedValue(() => {
    if (segW <= 0) return selected ? 0 : 1;
    return Math.abs(translateX.value - index * segW) / segW;
  });

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(proximity.value, [0, 1], [1, 0.55], 'clamp'),
  }));

  return (
    <PressableScale
      scaleTo={0.94}
      haptic="selection"
      onPress={onPress}
      style={st.rangeSegment}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} range`}
    >
      <Animated.View style={labelStyle}>
        <Typography
          style={[
            st.rangeSegmentText,
            { color: selected ? theme.colors.primary : theme.colors.textSecondary },
          ]}
        >
          {label}
        </Typography>
      </Animated.View>
    </PressableScale>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll:    { padding: 16, paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  pageTitle: { fontSize: 28, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.5 },
  pageSubRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  pageSub:   { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '600', letterSpacing: 0.2 },
  manageBtnWrap: { borderRadius: 20, overflow: 'hidden', ...theme.shadows.glow(theme.colors.primary) },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  manageBtnText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.2 },

  // WidgetCard override — the FlatList already provides horizontal padding,
  // so we kill the WidgetCard's own marginHorizontal to avoid double-margins.
  widgetCard: { marginHorizontal: 0, marginBottom: 14 },

  bigStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  bigStat: {
    fontSize: 30,
    fontWeight: '900',
    fontFamily: theme.fonts.display,
    color: theme.colors.text,
    letterSpacing: -0.8,
    lineHeight: 34,
    fontVariant: ['tabular-nums'],
  },
  bigStatUnit: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  trendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
  },

  insightBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderLeftWidth: 3,
  },
  insightText: { fontSize: 12, flex: 1, lineHeight: 18, fontWeight: '700' },

  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 180,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingHorizontal: 16,
    gap: 8,
  },
  emptyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emptyHeadline: { fontSize: 13, fontWeight: '800', letterSpacing: -0.1 },
  emptyCaption: { fontSize: 11, fontWeight: '600', textAlign: 'center', lineHeight: 16 },
  emptyCta: {
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
  },
  emptyCtaText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },

  rangeOuter: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  rangeBar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  rangeIndicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    backgroundColor: theme.colors.primary + '22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.primary + '88',
  },
  rangeSegment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeSegmentText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  inactiveCaption: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginTop: 6,
    marginLeft: 4,
    letterSpacing: 0.2,
  },
  compareChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: 4,
  },

  manageRowBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 8,
  },
  manageRowLabel: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  manageRowCaption: { fontSize: 12, fontWeight: '500', color: theme.colors.textSecondary, marginTop: 2 },
});
