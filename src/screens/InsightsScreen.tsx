import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import {
  Activity as ActivityIcon,
  BarChart3,
  Clock,
  Flame,
  Footprints,
  Heart,
  Mountain,
  Settings2,
  TrendingDown,
  TrendingUp,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { theme, withAlpha } from '../theme';
import { Typography } from '../components/Typography';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { SectionLabel } from '../components/SheetUI';
import { WidgetCard } from '../components/WidgetCard';
import { SkeletonChart } from '../components/SkeletonPresets';
import { PressableScale } from '../components/PressableScale';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { ProgressBar } from '../components/ProgressBar';
import { Toggle } from '../components/Toggle';
import { ChartBars, ChartDonut, ChartLine, type LinePoint } from '../components/charts';
import { INSIGHT_FAMILY, familyStyle, type WidgetFamily } from '../utils/widgetFamilies';
import { activityDayKey, formatPace, localDateStr, mondayOf, weekKey } from '../utils/dates';
import { resolveHrZones, zoneOf, ZONE_LABELS, type ResolvedZones } from '../utils/hrZones';
import { useStore, type Activity as StravaActivity } from '../store/useStore';

// ── Ranges ─────────────────────────────────────────────────────────────
type Range = '30d' | '3m' | '6m' | '1y' | 'all';
const RANGE_KEYS: Range[] = ['30d', '3m', '6m', '1y', 'all'];
const RANGE_LABELS: Record<Range, string> = { '30d': '30D', '3m': '3M', '6m': '6M', '1y': '1Y', all: 'All' };
const RANGE_DAYS: Record<Range, number> = { '30d': 30, '3m': 90, '6m': 180, '1y': 365, all: Infinity };

/** Bucket size for the aggregate (bars) tabs — adapts to the range so the
 *  chart never squeezes 100+ bars: 30d → daily, 3m/6m/1y → weekly, all-time →
 *  weekly while short, monthly once the history outgrows 26 weekly buckets. */
type Granularity = 'day' | 'week' | 'month';

// ── Tabs ───────────────────────────────────────────────────────────────
type Tab = 'pace' | 'volume' | 'heart' | 'elevation' | 'steps' | 'time' | 'calories' | 'power' | 'cadence' | 'mix';
interface TabDef { key: Tab; label: string }
const ALL_TABS: TabDef[] = [
  { key: 'steps',     label: 'Steps'        },
  { key: 'time',      label: 'Time'         },
  { key: 'volume',    label: 'Volume'       },
  { key: 'pace',      label: 'Pace'         },
  { key: 'heart',     label: 'HR Zones'     },
  { key: 'cadence',   label: 'Cadence'      },
  { key: 'mix',       label: 'Activity Mix' },
  { key: 'elevation', label: 'Elevation'    },
  { key: 'calories',  label: 'Calories'     },
  { key: 'power',     label: 'Power'        },
];

const TAB_ICON: Record<Tab, LucideIcon> = {
  steps:     Footprints,
  time:      Clock,
  volume:    TrendingUp,
  pace:      Zap,
  heart:     Heart,
  cadence:   ActivityIcon,
  mix:       BarChart3,
  elevation: Mountain,
  calories:  Flame,
  power:     Zap,
};

// Short caption under each row label in the Manage Graphs sheet.
const TAB_DESCRIPTION: Record<Tab, string> = {
  steps:     'Step counts from your activities',
  time:      'Active hours over time',
  volume:    'Distance totals and trend',
  pace:      'Average run pace over time',
  heart:     'Heart-rate zone distribution',
  cadence:   'Steps-per-minute trend',
  mix:       'Activity-type breakdown',
  elevation: 'Elevation gained over time',
  calories:  'Energy burned over time',
  power:     'Power output per activity',
};

const DEFAULT_GRAPHS: Tab[] = ['steps', 'time', 'volume', 'pace', 'heart'];

// Z1..Z5 — cool → hot, from the theme palette.
const ZONE_COLORS = [
  theme.colors.info,
  theme.colors.success,
  theme.colors.warning,
  theme.colors.primary,
  theme.colors.error,
];

// Sport-split palette: family accents, assigned by frequency rank.
const MIX_PALETTE = [
  theme.colors.families.activity.accent,
  theme.colors.families.plan.accent,
  theme.colors.families.progress.accent,
  theme.colors.families.social.accent,
  theme.colors.families.recovery.accent,
  theme.colors.families.records.accent,
  theme.colors.families.health.accent,
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Pure helpers (module level — no per-render identities) ─────────────

/** % change between the later and earlier half of a series; null if sparse. */
function computeTrend(values: number[]): number | null {
  const filtered = values.filter((v) => Number.isFinite(v));
  if (filtered.length < 4) return null;
  const mid = Math.floor(filtered.length / 2);
  const avg = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  const a = avg(filtered.slice(0, mid));
  const b = avg(filtered.slice(mid));
  if (!a) return null;
  return Math.round(((b - a) / a) * 100);
}

/** Local Date from a YYYY-MM-DD key (never via `new Date(string)` — UTC shift). */
function dateOfDayKey(key: string): Date {
  return new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
}

function dayLabelOf(dayKey: string): string {
  return `${MONTHS[Number(dayKey.slice(5, 7)) - 1]} ${Number(dayKey.slice(8, 10))}`;
}

function monthLabelOf(monthKey: string): string {
  return `${MONTHS[Number(monthKey.slice(5, 7)) - 1]} '${monthKey.slice(2, 4)}`;
}

function bucketLabel(key: string, granularity: Granularity): string {
  return granularity === 'month' ? monthLabelOf(key) : dayLabelOf(key);
}

/** Seconds → "3h 24m" / "48m". */
function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

// Stable axis/pill formatters for the bar charts.
const fmtStepsAxis = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`);
const fmtHoursAxis = (v: number) => `${v >= 10 ? Math.round(v) : Number(v.toFixed(1))}h`;
const fmtKmAxis = (v: number) => `${Math.round(v)} km`;
const fmtCalsAxis = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);
const fmtSpm = (v: number) => `${Math.round(v)} spm`;
const fmtMetres = (v: number) => `${Math.round(v)} m`;
const fmtWatts = (v: number) => `${Math.round(v)} W`;
const fmtBpm = (v: number) => `${Math.round(v)}`;
const fmtCount = (v: number) => `${Math.round(v)}`;

// ── Aggregation ────────────────────────────────────────────────────────

interface BucketRow { key: string; label: string; km: number; hours: number; steps: number; cals: number }
interface BucketData {
  granularity: Granularity;
  rows: BucketRow[];
  /** Buckets in the range that had zero activity (trimmed from the chart). */
  hidden: number;
  /** Any calories in range came from our MET estimate, not the recording. */
  estimatedCals: boolean;
}

/** One pass over activities → adaptive volume/time/steps/calories buckets.
 *  Day-keyed via activityDayKey (no per-activity ISO parsing); steps come from
 *  stored a.steps only — no stride-length fabrication. */
function buildBuckets(activities: StravaActivity[], range: Range): BucketData {
  const days = RANGE_DAYS[range];
  const todayKey = localDateStr(new Date());
  const cutoffKey = days === Infinity ? '' : localDateStr(new Date(Date.now() - (days - 1) * 86400000));

  let earliestDay = todayKey;
  if (range === 'all') {
    for (const a of activities) {
      const k = activityDayKey(a);
      if (k < earliestDay) earliestDay = k;
    }
  }

  let granularity: Granularity;
  if (range === '30d') {
    granularity = 'day';
  } else if (range === 'all') {
    const spanWeeks = (dateOfDayKey(todayKey).getTime() - dateOfDayKey(earliestDay).getTime()) / (7 * 86400000);
    granularity = spanWeeks > 26 ? 'month' : 'week';
  } else {
    granularity = 'week';
  }

  // dayKey → weekKey memo so each distinct day is parsed at most once.
  const weekOfDay = new Map<string, string>();
  const sums = new Map<string, { km: number; hours: number; steps: number; cals: number }>();
  let estimatedCals = false;

  for (const a of activities) {
    const dk = activityDayKey(a);
    if (cutoffKey && dk < cutoffKey) continue;
    let bk: string;
    if (granularity === 'day') {
      bk = dk;
    } else if (granularity === 'month') {
      bk = dk.slice(0, 7);
    } else {
      let wk = weekOfDay.get(dk);
      if (!wk) {
        wk = weekKey(dateOfDayKey(dk));
        weekOfDay.set(dk, wk);
      }
      bk = wk;
    }
    const s = sums.get(bk) ?? { km: 0, hours: 0, steps: 0, cals: 0 };
    s.km += a.distance / 1000;
    s.hours += a.movingTime / 3600;
    if (a.steps) s.steps += a.steps;
    if (a.calories) {
      s.cals += a.calories;
      if (a.caloriesEstimated) estimatedCals = true;
    }
    sums.set(bk, s);
  }

  // Full bucket timeline for the range — only to order rows + count hidden.
  const keys: string[] = [];
  if (granularity === 'day') {
    const d = dateOfDayKey(cutoffKey);
    for (let k = localDateStr(d); k <= todayKey; d.setDate(d.getDate() + 1), k = localDateStr(d)) keys.push(k);
  } else if (granularity === 'week') {
    const start = mondayOf(dateOfDayKey(cutoffKey || earliestDay));
    const end = mondayOf(new Date()).getTime();
    for (const d = start; d.getTime() <= end; d.setDate(d.getDate() + 7)) keys.push(localDateStr(d));
  } else {
    const now = new Date();
    let y = Number(earliestDay.slice(0, 4));
    let m = Number(earliestDay.slice(5, 7));
    while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
      keys.push(`${y}-${String(m).padStart(2, '0')}`);
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
  }

  const rows: BucketRow[] = [];
  for (const key of keys) {
    const s = sums.get(key);
    if (!s) continue;
    rows.push({
      key,
      label: bucketLabel(key, granularity),
      km: Number(s.km.toFixed(1)),
      hours: Number(s.hours.toFixed(1)),
      steps: Math.round(s.steps),
      cals: Math.round(s.cals),
    });
  }

  return { granularity, rows, hidden: keys.length - rows.length, estimatedCals };
}

interface PacePoint { label: string; value: number; hr: number }
interface LineSeries {
  pace: PacePoint[];
  cadence: LinePoint[];
  elevation: LinePoint[];
  power: LinePoint[];
}

/** Per-activity line series — one honest point per activity, no back-fill.
 *  ChartLine's own maxPoints (LTTB) caps long series. */
function buildLines(windowed: StravaActivity[]): LineSeries {
  const sorted = [...windowed].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  const pace: PacePoint[] = [];
  const cadence: LinePoint[] = [];
  const elevation: LinePoint[] = [];
  const power: LinePoint[] = [];
  for (const a of sorted) {
    const label = dayLabelOf(activityDayKey(a));
    if (a.type === 'Run' && a.averageSpeed > 0) {
      pace.push({ label, value: 1000 / a.averageSpeed / 60, hr: a.averageHeartRate || 0 });
    }
    if ((a.averageCadence || 0) > 0) cadence.push({ label, value: Math.round((a.averageCadence || 0) * 2) });
    elevation.push({ label, value: Math.round(a.totalElevationGain || 0) });
    if ((a.averageWatts || 0) > 0) power.push({ label, value: Math.round(a.averageWatts || 0) });
  }
  return { pace, cadence, elevation, power };
}

interface ZoneAgg {
  /** 'time' = real Strava time-in-zone seconds; 'sessions' = avg-HR fallback. */
  mode: 'time' | 'sessions';
  values: number[]; // Z1..Z5
  total: number;
}

/** Aggregate real cached time-in-zone across the range; fall back to counting
 *  sessions by which zone their average HR lands in. */
function buildZoneAgg(windowed: StravaActivity[], resolved: ResolvedZones): ZoneAgg {
  const time = [0, 0, 0, 0, 0];
  let timeTotal = 0;
  for (const a of windowed) {
    const buckets = a.zones?.find((z) => z.type === 'heartrate')?.buckets;
    if (!buckets?.length) continue;
    buckets.slice(0, 5).forEach((b, i) => {
      const t = Number.isFinite(b.time) ? b.time : 0;
      time[i] += t;
      timeTotal += t;
    });
  }
  if (timeTotal > 0) return { mode: 'time', values: time, total: timeTotal };

  const counts = [0, 0, 0, 0, 0];
  let n = 0;
  for (const a of windowed) {
    const hr = a.averageHeartRate || 0;
    if (hr <= 0) continue;
    counts[zoneOf(hr, resolved) - 1] += 1;
    n += 1;
  }
  return { mode: 'sessions', values: counts, total: n };
}

interface MixEntry { type: string; count: number; pct: number; color: string }

function buildMix(windowed: StravaActivity[]): MixEntry[] {
  const counts = new Map<string, number>();
  for (const a of windowed) counts.set(a.type, (counts.get(a.type) || 0) + 1);
  const total = windowed.length || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count], i) => ({
      type,
      count,
      pct: Math.round((count / total) * 100),
      color: MIX_PALETTE[i % MIX_PALETTE.length],
    }));
}

// ── Per-tab hero metric + honest caption + trend ───────────────────────

interface TabMeta {
  title: string;
  caption: string;
  stat: string;
  statValue?: number;
  statSuffix?: string;
  statDecimals?: number;
  statUnit: string;
  trend: number | null;
  insight?: string;
}

function buildMeta(buckets: BucketData, lines: LineSeries, zones: ZoneAgg, mix: MixEntry[]): Record<Tab, TabMeta> {
  const per = buckets.granularity === 'day' ? 'day' : buckets.granularity === 'week' ? 'week' : 'month';
  const rows = buckets.rows;
  const avg = (vals: number[]) => (vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0);

  const stepVals = rows.map((r) => r.steps);
  const hourVals = rows.map((r) => r.hours);
  const kmVals = rows.map((r) => r.km);
  const calVals = rows.map((r) => r.cals);
  const avgSteps = Math.round(avg(stepVals));
  const avgHours = avg(hourVals);
  const peakKm = kmVals.length ? Math.max(...kmVals) : 0;
  const totalKm = kmVals.reduce((s, v) => s + v, 0);
  const avgCals = Math.round(avg(calVals));

  const paceVals = lines.pace.map((p) => p.value);
  const bestPace = paceVals.length ? Math.min(...paceVals) : 0;
  const avgPace = avg(paceVals);
  const cadVals = lines.cadence.map((p) => p.value);
  const avgCad = Math.round(avg(cadVals));
  const elevVals = lines.elevation.map((p) => p.value);
  const totalElev = Math.round(elevVals.reduce((s, v) => s + v, 0));
  const maxElev = elevVals.length ? Math.max(...elevVals) : 0;
  const powVals = lines.power.map((p) => p.value);
  const avgPow = Math.round(avg(powVals));
  const mixTotal = mix.reduce((s, e) => s + e.count, 0);

  const paceTrendRaw = computeTrend(paceVals);
  const isZoneTime = zones.mode === 'time';
  const easyPct = zones.total > 0 ? Math.round(((zones.values[0] + zones.values[1]) / zones.total) * 100) : 0;

  const stepsTarget = per === 'day' ? ' — 10,000/day is the classic target' : per === 'week' ? ' — 10,000/day ≈ 70,000/week' : '';
  const whoLine = per === 'week' ? ' — WHO recommends 2.5 hrs of moderate activity weekly' : '';

  return {
    steps: {
      title: 'Steps',
      caption: 'Steps recorded on your activities',
      stat: avgSteps > 0 ? `${avgSteps}` : '—',
      statValue: avgSteps >= 1000 ? Math.round(avgSteps / 1000) : avgSteps || undefined,
      statSuffix: avgSteps >= 1000 ? 'k' : undefined,
      statUnit: `avg / ${per}`,
      trend: computeTrend(stepVals),
      insight: avgSteps > 0 ? `${avgSteps.toLocaleString()} avg steps/${per}${stepsTarget}` : undefined,
    },
    time: {
      title: 'Active Time',
      caption: 'Hours of movement',
      stat: avgHours > 0 ? avgHours.toFixed(1) : '—',
      statValue: avgHours > 0 ? Number(avgHours.toFixed(1)) : undefined,
      statDecimals: 1,
      statUnit: `hrs / ${per}`,
      trend: computeTrend(hourVals),
      insight: avgHours > 0 ? `${avgHours.toFixed(1)} hrs/${per} of movement${whoLine}` : undefined,
    },
    volume: {
      title: 'Volume',
      caption: 'Distance across all activities',
      stat: peakKm > 0 ? peakKm.toFixed(0) : '—',
      statValue: peakKm > 0 ? Math.round(peakKm) : undefined,
      statUnit: `km peak ${per}`,
      trend: computeTrend(kmVals),
      insight: totalKm > 0 ? `${totalKm.toFixed(0)} km total · increase no more than 10%/week to avoid injury` : undefined,
    },
    pace: {
      title: 'Running Pace',
      caption: `Min/km · ${paceVals.length} run${paceVals.length === 1 ? '' : 's'} in range`,
      stat: bestPace ? formatPace(bestPace) : '—',
      statUnit: 'min/km best',
      // Pace is inverted — lower is better, so negate for the trend chip.
      trend: paceTrendRaw === null ? null : -paceTrendRaw,
      insight: paceVals.length >= 2
        ? `Avg ${formatPace(avgPace)}/km · best ${formatPace(bestPace)}/km · ${paceVals.length} runs`
        : undefined,
    },
    heart: {
      title: 'HR Zones',
      caption: isZoneTime ? 'Real time-in-zone across the range' : 'Sessions by average HR',
      stat: zones.total > 0 ? (isZoneTime ? fmtDuration(zones.total) : `${zones.total}`) : '—',
      statValue: !isZoneTime && zones.total > 0 ? zones.total : undefined,
      statUnit: isZoneTime ? 'in HR zones' : 'sessions with HR',
      trend: null,
      insight: zones.total > 0
        ? `${easyPct}% easy effort — elite endurance training targets ~80% in Z1–Z2`
        : undefined,
    },
    cadence: {
      title: 'Running Cadence',
      caption: 'Steps per minute',
      stat: avgCad ? `${avgCad}` : '—',
      statValue: avgCad || undefined,
      statUnit: 'spm average',
      trend: computeTrend(cadVals),
      insight: cadVals.length >= 2 && avgCad > 0
        ? `Target 170–180 spm. Your avg ${avgCad} spm — ${avgCad < 165 ? 'try shortening your stride' : avgCad >= 170 ? 'great cadence!' : 'close to optimal'}`
        : undefined,
    },
    mix: {
      title: 'Activity Mix',
      caption: 'Breakdown by sport in range',
      stat: mixTotal ? `${mixTotal}` : '—',
      statValue: mixTotal || undefined,
      statUnit: 'activities',
      trend: null,
    },
    elevation: {
      title: 'Elevation Gain',
      caption: 'Metres climbed per activity',
      stat: totalElev > 0 ? totalElev.toLocaleString() : '—',
      statUnit: 'm total',
      trend: computeTrend(elevVals),
      insight: elevVals.length >= 2 && totalElev > 0
        ? `${totalElev.toLocaleString()} m total climbed · peak activity ${Math.round(maxElev)} m`
        : undefined,
    },
    calories: {
      title: 'Calories Burned',
      caption: buckets.estimatedCals ? '~ includes estimates' : 'kcal from recorded activities',
      stat: avgCals ? `${avgCals}` : '—',
      statValue: avgCals || undefined,
      statUnit: `kcal / ${per} avg`,
      trend: computeTrend(calVals),
      insight: avgCals > 0
        ? `${avgCals.toLocaleString()} kcal/${per} avg${per === 'week' ? ` — roughly ${Math.round(avgCals / 7)} kcal/day from exercise` : ''}`
        : undefined,
    },
    power: {
      title: 'Average Power',
      caption: 'Watts per activity',
      stat: avgPow ? `${avgPow}` : '—',
      statValue: avgPow || undefined,
      statUnit: 'W average',
      trend: computeTrend(powVals),
      insight: powVals.length >= 2 && avgPow > 0 ? `${avgPow} W avg power across ${powVals.length} sessions` : undefined,
    },
  };
}

interface InsightsData {
  buckets: BucketData;
  lines: LineSeries;
  zones: ZoneAgg;
  resolved: ResolvedZones;
  mix: MixEntry[];
  meta: Record<Tab, TabMeta>;
}

// ── Module-level subcomponents (stable identities across renders) ──────

function BigStat({ meta }: { meta: TabMeta }) {
  const up = (meta.trend ?? 0) >= 0;
  const trendColor = up ? theme.colors.success : theme.colors.error;
  return (
    <View style={st.bigStatRow}>
      <View>
        {meta.statValue !== undefined ? (
          <AnimatedNumber
            value={meta.statValue}
            decimals={meta.statDecimals ?? 0}
            suffix={meta.statSuffix ?? ''}
            duration={theme.motion.slow}
            style={st.bigStat}
          />
        ) : (
          <Typography style={st.bigStat}>{meta.stat}</Typography>
        )}
        <Typography style={st.bigStatUnit}>{meta.statUnit}</Typography>
      </View>
      {meta.trend !== null && (
        <View style={[st.trendChip, { backgroundColor: withAlpha(trendColor, 'tint'), borderColor: trendColor }]}>
          <Icon icon={up ? TrendingUp : TrendingDown} variant="plain" size="xs" color={trendColor} />
          <Typography style={[st.trendText, { color: trendColor }]}>{Math.abs(meta.trend)}%</Typography>
        </View>
      )}
    </View>
  );
}

function Insight({ text, color }: { text: string; color: string }) {
  return (
    <View style={[st.insightBar, { borderLeftColor: color, backgroundColor: withAlpha(color, 'soft') }]}>
      <Icon icon={Zap} variant="plain" size="xs" color={color} />
      <Typography style={[st.insightText, { color }]}>{text}</Typography>
    </View>
  );
}

function EmptyRow({
  icon,
  headline,
  msg,
  color,
  cta,
}: {
  icon: LucideIcon;
  headline: string;
  msg: string;
  color: string;
  cta?: { label: string; onPress: () => void };
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(theme.motion.base)}
      style={[st.emptyBox, { borderColor: withAlpha(color, 'strong') }]}
    >
      <View style={[st.emptyIconWrap, { backgroundColor: withAlpha(color, 'tint'), borderColor: withAlpha(color, 'strong') }]}>
        <Icon icon={icon} variant="plain" size="md" color={color} />
      </View>
      <Typography style={st.emptyHeadline}>{headline}</Typography>
      <Typography style={st.emptyCaption}>{msg}</Typography>
      {cta && <Button title={cta.label} variant="secondary" size="sm" onPress={cta.onPress} style={st.emptyCtaBtn} />}
    </Animated.View>
  );
}

/** Honest note when zero-activity buckets were trimmed from a bar chart. */
function InactiveCaption({ count, granularity }: { count: number; granularity: Granularity }) {
  if (count <= 0) return null;
  const unit = granularity === 'day' ? 'day' : granularity === 'week' ? 'week' : 'month';
  return (
    <Typography style={st.inactiveCaption}>
      {count} {unit}{count === 1 ? '' : 's'} hidden — no activity recorded
    </Typography>
  );
}

function BarsBlock({
  buckets,
  field,
  family,
  accent,
  format,
  emptyIcon,
  emptyHeadline,
  emptyMsg,
}: {
  buckets: BucketData;
  field: 'km' | 'hours' | 'steps' | 'cals';
  family: WidgetFamily;
  accent: string;
  format: (v: number) => string;
  emptyIcon: LucideIcon;
  emptyHeadline: string;
  emptyMsg: string;
}) {
  const points = useMemo(
    () => buckets.rows.map((r) => ({ label: r.label, value: r[field] })),
    [buckets, field],
  );
  if (!points.some((p) => p.value > 0)) {
    return <EmptyRow icon={emptyIcon} headline={emptyHeadline} msg={emptyMsg} color={accent} />;
  }
  return (
    <View style={st.chartWrap}>
      <ChartBars data={points} height={190} family={family} formatValue={format} />
      <InactiveCaption count={buckets.hidden} granularity={buckets.granularity} />
    </View>
  );
}

function LineBlock({
  points,
  family,
  accent,
  format,
  emptyIcon,
  emptyHeadline,
  emptyMsg,
}: {
  points: LinePoint[];
  family: WidgetFamily;
  accent: string;
  format: (v: number) => string;
  emptyIcon: LucideIcon;
  emptyHeadline: string;
  emptyMsg: string;
}) {
  if (points.length < 2) {
    return <EmptyRow icon={emptyIcon} headline={emptyHeadline} msg={emptyMsg} color={accent} />;
  }
  return (
    <View style={st.chartWrap}>
      <ChartLine data={points} height={190} family={family} formatValue={format} fromZero={false} />
    </View>
  );
}

/** Pace card body. compareHR is local state here so toggling it re-renders
 *  ONLY this card, not the whole list. HR renders as its own small chart —
 *  bpm and min/km share no scale, so overlaying them on one axis would
 *  flatten the pace line into noise. */
function PaceBody({ pace, family, insight }: { pace: PacePoint[]; family: WidgetFamily; insight?: string }) {
  const [compareHR, setCompareHR] = useState(false);
  const accent = familyStyle(family).accent;
  const health = familyStyle('health').accent;
  const pacePoints = useMemo(() => pace.map((p) => ({ label: p.label, value: p.value })), [pace]);
  const hrPoints = useMemo(
    () => pace.filter((p) => p.hr > 0).map((p) => ({ label: p.label, value: p.hr })),
    [pace],
  );

  if (pace.length < 2) {
    return <EmptyRow icon={Zap} headline="Not enough runs" msg="Need 2+ runs in this range to plot pace" color={accent} />;
  }

  return (
    <>
      {hrPoints.length >= 2 && (
        <PressableScale
          scaleTo={0.94}
          haptic="selection"
          onPress={() => setCompareHR((v) => !v)}
          style={[st.compareChip, compareHR && { backgroundColor: withAlpha(health, 'tint'), borderColor: health }]}
          accessibilityRole="button"
          accessibilityLabel="Compare heart rate"
          accessibilityState={{ selected: compareHR }}
        >
          <Icon icon={Heart} variant="plain" size="xs" color={compareHR ? health : theme.colors.textSecondary} />
          <Typography style={[st.compareChipText, { color: compareHR ? health : theme.colors.textSecondary }]}>
            {compareHR ? 'Comparing HR' : 'Compare HR'}
          </Typography>
        </PressableScale>
      )}
      <View style={st.chartWrap}>
        <ChartLine data={pacePoints} height={190} family={family} formatValue={formatPace} fromZero={false} />
      </View>
      {compareHR && (
        <View style={st.hrOverlayWrap}>
          <Typography style={st.hrOverlayLabel}>Avg HR per run (bpm)</Typography>
          <ChartLine data={hrPoints} height={110} family="health" formatValue={fmtBpm} fromZero={false} />
        </View>
      )}
      {insight && <Insight color={accent} text={insight} />}
    </>
  );
}

function ZonesBody({ zones, resolved, insight }: { zones: ZoneAgg; resolved: ResolvedZones; insight?: string }) {
  const accent = familyStyle('health').accent;
  if (zones.total <= 0) {
    return (
      <EmptyRow
        icon={Heart}
        headline="No heart-rate data"
        msg="No HR recorded in this range — enable heart rate on your watch"
        color={accent}
      />
    );
  }
  const isTime = zones.mode === 'time';
  const fmt = isTime ? fmtDuration : fmtCount;
  const slices = ZONE_LABELS.map((label, i) => ({ label, value: zones.values[i], color: ZONE_COLORS[i] }));
  const sourceNote =
    resolved.source === 'estimated' ? ' · zones estimated from age'
    : resolved.source === 'profile' ? ' · zones from your max HR'
    : '';

  return (
    <>
      <View style={st.donutWrap}>
        <ChartDonut data={slices} legend={false} size={150} formatValue={fmt}>
          <Icon icon={Heart} variant="plain" size="md" color={accent} />
          <Typography style={st.donutCenterCaption}>
            {isTime ? fmtDuration(zones.total) : `${zones.total} sessions`}
          </Typography>
        </ChartDonut>
      </View>
      <View style={st.zoneRows}>
        {ZONE_LABELS.map((label, i) => {
          const v = zones.values[i];
          const pct = Math.round((v / zones.total) * 100);
          const lo = resolved.bounds[i];
          const bpm = i < 4 ? `${lo}–${resolved.bounds[i + 1] - 1} bpm` : `${lo}+ bpm`;
          return (
            <View key={label} style={st.zoneRow}>
              <View style={[st.zoneDot, { backgroundColor: ZONE_COLORS[i] }]} />
              <View style={{ flex: 1 }}>
                <View style={st.zoneLabelRow}>
                  <Typography style={st.zoneLabel}>{label}</Typography>
                  <Typography style={st.zoneBpm}>{bpm}</Typography>
                </View>
                <ProgressBar progress={pct} color={ZONE_COLORS[i]} height={5} />
              </View>
              <Typography style={[st.zonePct, { color: ZONE_COLORS[i] }]}>{pct}%</Typography>
            </View>
          );
        })}
      </View>
      <Typography style={st.sourceCaption}>
        {isTime
          ? `Time in zone from your recorded activities${sourceNote}`
          : `Sessions by avg HR (open activities to cache true zones)${sourceNote}`}
      </Typography>
      {insight && <Insight color={accent} text={insight} />}
    </>
  );
}

function MixBody({ mix }: { mix: MixEntry[] }) {
  const accent = familyStyle('activity').accent;
  const total = mix.reduce((s, e) => s + e.count, 0);
  if (!total) {
    return <EmptyRow icon={BarChart3} headline="No activity mix" msg="Nothing recorded in this range" color={accent} />;
  }
  return (
    <View style={st.donutWrap}>
      <ChartDonut
        data={mix.map((e) => ({ label: e.type, value: e.count, color: e.color }))}
        size={140}
        formatValue={fmtCount}
      >
        <Typography style={st.donutCenterValue}>{total}</Typography>
        <Typography style={st.donutCenterCaption}>activities</Typography>
      </ChartDonut>
    </View>
  );
}

function CardBody({ tab, d }: { tab: Tab; d: InsightsData }) {
  const family = INSIGHT_FAMILY[tab] || 'activity';
  const accent = familyStyle(family).accent;
  const m = d.meta[tab];

  switch (tab) {
    case 'steps':
      return (
        <>
          <BarsBlock buckets={d.buckets} field="steps" family={family} accent={accent} format={fmtStepsAxis}
            emptyIcon={Footprints} emptyHeadline="No steps tracked" emptyMsg="No activities with step data in this range" />
          {m.insight && <Insight color={accent} text={m.insight} />}
        </>
      );
    case 'time':
      return (
        <>
          <BarsBlock buckets={d.buckets} field="hours" family={family} accent={accent} format={fmtHoursAxis}
            emptyIcon={Clock} emptyHeadline="No active time" emptyMsg="No time logged in this range" />
          {m.insight && <Insight color={accent} text={m.insight} />}
        </>
      );
    case 'volume':
      return (
        <>
          <BarsBlock buckets={d.buckets} field="km" family={family} accent={accent} format={fmtKmAxis}
            emptyIcon={TrendingUp} emptyHeadline="No kilometres" emptyMsg="No distance recorded in this range" />
          {m.insight && <Insight color={accent} text={m.insight} />}
        </>
      );
    case 'calories':
      return (
        <>
          <BarsBlock buckets={d.buckets} field="cals" family={family} accent={accent} format={fmtCalsAxis}
            emptyIcon={Flame} emptyHeadline="No calories burned" emptyMsg="No calorie data in this range" />
          {m.insight && <Insight color={accent} text={m.insight} />}
        </>
      );
    case 'pace':
      return <PaceBody pace={d.lines.pace} family={family} insight={m.insight} />;
    case 'cadence':
      return (
        <>
          <LineBlock points={d.lines.cadence} family={family} accent={accent} format={fmtSpm}
            emptyIcon={ActivityIcon} emptyHeadline="No cadence yet" emptyMsg="No cadence data in this range" />
          {m.insight && <Insight color={accent} text={m.insight} />}
        </>
      );
    case 'elevation':
      return (
        <>
          <LineBlock points={d.lines.elevation} family={family} accent={accent} format={fmtMetres}
            emptyIcon={Mountain} emptyHeadline="No climbs yet" emptyMsg="No elevation data in this range" />
          {m.insight && <Insight color={accent} text={m.insight} />}
        </>
      );
    case 'power':
      return (
        <>
          <LineBlock points={d.lines.power} family={family} accent={accent} format={fmtWatts}
            emptyIcon={Zap} emptyHeadline="No power data" emptyMsg="Requires a power meter or smart trainer" />
          {m.insight && <Insight color={accent} text={m.insight} />}
        </>
      );
    case 'heart':
      return <ZonesBody zones={d.zones} resolved={d.resolved} insight={m.insight} />;
    case 'mix':
      return <MixBody mix={d.mix} />;
  }
}

// ── Manage Graphs sheet — drafts locally, persists ONCE on close ───────

function ManageSheet({
  visible,
  activeKeys,
  onCommit,
}: {
  visible: boolean;
  activeKeys: string[];
  onCommit: (keys: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(activeKeys);

  useEffect(() => {
    if (visible) setDraft(activeKeys);
  }, [visible, activeKeys]);

  const toggle = (key: Tab) =>
    setDraft((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]));

  return (
    <Sheet
      visible={visible}
      onClose={() => onCommit(draft)}
      title="Manage Graphs"
      caption="Choose which insights appear on this screen"
      scrollable
    >
      <SectionLabel family="activity">Visible graphs</SectionLabel>
      {ALL_TABS.map((t) => {
        const fam = INSIGHT_FAMILY[t.key] || 'activity';
        const famStyle = familyStyle(fam);
        const active = draft.includes(t.key);
        return (
          <View key={t.key} style={st.manageRowBlock}>
            <Icon icon={TAB_ICON[t.key]} family={fam} variant="gradient" size="md" />
            <View style={{ flex: 1 }}>
              <Typography style={st.manageRowLabel}>{t.label}</Typography>
              <Typography style={st.manageRowCaption}>{TAB_DESCRIPTION[t.key]}</Typography>
            </View>
            <Toggle
              value={active}
              onValueChange={() => toggle(t.key)}
              accent={famStyle.accent}
              accessibilityLabel={`${active ? 'Hide' : 'Show'} ${t.label} graph`}
            />
          </View>
        );
      })}
    </Sheet>
  );
}

// ── Sliding-pill range selector ────────────────────────────────────────

function RangeSelector({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  const [containerW, setContainerW] = useState(0);
  const idx = RANGE_KEYS.indexOf(range);
  const translateX = useSharedValue(0);
  const segW = containerW > 0 ? containerW / RANGE_KEYS.length : 0;
  // Skip the spring on first layout so the pill doesn't twitch in from seg 0.
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
          <Animated.View style={[st.rangeIndicator, { width: segW }, indicatorStyle]} />
        )}
        {RANGE_KEYS.map((r, i) => (
          <RangeSegment
            key={r}
            label={RANGE_LABELS[r]}
            index={i}
            selected={r === range}
            segW={segW}
            translateX={translateX}
            onPress={() => onChange(r)}
          />
        ))}
      </View>
    </View>
  );
}

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
  // Label brightens as the pill arrives under it, not the instant of the tap.
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
          style={[st.rangeSegmentText, { color: selected ? theme.colors.primary : theme.colors.textSecondary }]}
        >
          {label}
        </Typography>
      </Animated.View>
    </PressableScale>
  );
}

const keyExtractor = (t: TabDef) => t.key;

// ── Screen ─────────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const activities = useStore((s) => s.activities);
  const activeGraphs = useStore((s) => s.settings.activeGraphs);
  const updateSettings = useStore((s) => s.updateSettings);
  const hrZones = useStore((s) => s.hrZones);
  const userProfile = useStore((s) => s.userProfile);

  const activeKeys = (activeGraphs as Tab[] | undefined) ?? DEFAULT_GRAPHS;
  const [showManage, setShowManage] = useState(false);
  const [range, setRange] = useState<Range>('3m');

  // Deferred range keeps the pills snappy while heavy memos recompute lazily.
  const deferredRange = useDeferredValue(range);
  const rangePending = range !== deferredRange;

  const windowed = useMemo(() => {
    const days = RANGE_DAYS[deferredRange];
    if (days === Infinity) return activities;
    const cutoff = Date.now() - days * 86400000;
    return activities.filter((a) => new Date(a.startDate).getTime() >= cutoff);
  }, [activities, deferredRange]);

  const resolved = useMemo(() => resolveHrZones(hrZones, userProfile), [hrZones, userProfile]);
  const buckets = useMemo(() => buildBuckets(activities, deferredRange), [activities, deferredRange]);
  const lines = useMemo(() => buildLines(windowed), [windowed]);
  const zones = useMemo(() => buildZoneAgg(windowed, resolved), [windowed, resolved]);
  const mix = useMemo(() => buildMix(windowed), [windowed]);
  const meta = useMemo(() => buildMeta(buckets, lines, zones, mix), [buckets, lines, zones, mix]);

  const data: InsightsData = useMemo(
    () => ({ buckets, lines, zones, resolved, mix, meta }),
    [buckets, lines, zones, resolved, mix, meta],
  );

  const visibleTabs = useMemo(() => ALL_TABS.filter((t) => activeKeys.includes(t.key)), [activeKeys]);

  const openManage = useCallback(() => setShowManage(true), []);

  const commitGraphs = useCallback(
    (keys: string[]) => {
      setShowManage(false);
      const changed = keys.length !== activeKeys.length || keys.some((k) => !activeKeys.includes(k as Tab));
      if (changed) updateSettings({ activeGraphs: keys });
    },
    [activeKeys, updateSettings],
  );

  const renderCard = useCallback(
    ({ item, index }: { item: TabDef; index: number }) => {
      const tab = item.key;
      const family = INSIGHT_FAMILY[tab] || 'activity';
      const m = data.meta[tab];
      return (
        <Animated.View entering={FadeInDown.duration(theme.motion.base).delay(Math.min(index * 40, 240))}>
          <WidgetCard family={family} title={m.title} caption={m.caption} icon={TAB_ICON[tab]} style={st.widgetCard}>
            <BigStat meta={m} />
            {rangePending ? <SkeletonChart height={190} /> : <CardBody tab={tab} d={data} />}
          </WidgetCard>
        </Animated.View>
      );
    },
    [data, rangePending],
  );

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Typography style={st.pageTitle}>Insights</Typography>
          <View style={st.pageSubRow}>
            <Icon icon={ActivityIcon} variant="plain" size="xs" color={theme.colors.textSecondary} />
            <Typography style={st.pageSub}>{activities.length} activities analysed</Typography>
          </View>
        </View>
        <Button title="Manage" icon={Settings2} size="sm" onPress={openManage} />
      </View>

      <RangeSelector range={range} onChange={setRange} />

      <FlatList
        data={visibleTabs}
        keyExtractor={keyExtractor}
        renderItem={renderCard}
        contentContainerStyle={st.scroll}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={2}
        maxToRenderPerBatch={1}
        windowSize={3}
        ListEmptyComponent={
          <View style={st.listEmpty}>
            <Icon icon={BarChart3} variant="plain" size="hero" color={theme.colors.textSecondary} />
            <Typography style={st.listEmptyTitle}>No graphs enabled</Typography>
            <Typography style={st.listEmptyMsg}>
              Turn on the insights you care about and they will appear here.
            </Typography>
            <Button title="Manage graphs" icon={Settings2} size="sm" onPress={openManage} style={st.listEmptyBtn} />
          </View>
        }
      />

      <ManageSheet visible={showManage} activeKeys={activeKeys} onCommit={commitGraphs} />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { padding: 16, paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  pageTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: theme.fonts.display,
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  pageSubRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  pageSub: { ...theme.typography.micro, color: theme.colors.textSecondary },

  // FlatList already pads horizontally — kill WidgetCard's own margin.
  widgetCard: { marginHorizontal: 0, marginBottom: 14 },

  bigStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  bigStat: { ...theme.typography.numeric, color: theme.colors.text },
  bigStatUnit: {
    ...theme.typography.label,
    color: theme.colors.textSecondary,
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
  trendText: { ...theme.typography.label },

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
  insightText: { ...theme.typography.caption, flex: 1, lineHeight: 18 },

  chartWrap: { marginTop: 4 },

  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 190,
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
  emptyHeadline: { ...theme.typography.footnote, fontFamily: theme.fonts.semibold, color: theme.colors.text },
  emptyCaption: { ...theme.typography.caption, color: theme.colors.textSecondary, textAlign: 'center' },
  emptyCtaBtn: { alignSelf: 'center', marginTop: 6 },

  inactiveCaption: { ...theme.typography.micro, color: theme.colors.textSecondary, marginTop: 8, marginLeft: 4 },

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
    marginBottom: 6,
  },
  compareChipText: { ...theme.typography.label },
  hrOverlayWrap: { marginTop: 12 },
  hrOverlayLabel: { ...theme.typography.micro, color: theme.colors.textSecondary, marginBottom: 4 },

  donutWrap: { alignItems: 'center', marginVertical: 12 },
  donutCenterValue: { ...theme.typography.numericSm, color: theme.colors.text },
  donutCenterCaption: { ...theme.typography.micro, color: theme.colors.textSecondary, marginTop: 2 },

  zoneRows: { gap: 8, marginTop: 4 },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  zoneDot: { width: 10, height: 10, borderRadius: 5 },
  zoneLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  zoneLabel: { ...theme.typography.caption, color: theme.colors.text },
  zoneBpm: { ...theme.typography.micro, color: theme.colors.textSecondary },
  zonePct: { ...theme.typography.caption, width: 40, textAlign: 'right' },
  sourceCaption: { ...theme.typography.micro, color: theme.colors.textSecondary, marginTop: 12 },

  rangeOuter: { paddingHorizontal: 16, paddingBottom: 12 },
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
    backgroundColor: withAlpha(theme.colors.primary, 'tint'),
    borderRadius: 10,
    borderWidth: 1,
    borderColor: withAlpha(theme.colors.primary, 'heavy'),
  },
  rangeSegment: { flex: 1, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  rangeSegmentText: { ...theme.typography.caption, letterSpacing: 0.3 },

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
  manageRowLabel: { ...theme.typography.body, fontFamily: theme.fonts.semibold, color: theme.colors.text },
  manageRowCaption: { ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 2 },

  listEmpty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  listEmptyTitle: { ...theme.typography.subtitle, color: theme.colors.text, marginTop: 16 },
  listEmptyMsg: { ...theme.typography.footnote, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 6 },
  listEmptyBtn: { alignSelf: 'center', marginTop: 14 },
});
