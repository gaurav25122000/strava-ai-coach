import React, { useCallback, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, Heart } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { theme, withAlpha } from '../theme';
import { Typography } from '../components/Typography';
import { PressableScale } from '../components/PressableScale';
import { WidgetCard } from '../components/WidgetCard';
import { ChartDonut, type DonutSlice } from '../components/charts';
import { useStore, Activity } from '../store/useStore';
import { familyStyle } from '../utils/widgetFamilies';
import { formatPace as formatPaceMinKm } from '../utils/dates';
import { sportIcon } from '../utils/sportIcon';
import type { ActivitiesStackParamList } from '../navigation/ActivitiesStack';

type Nav = NativeStackNavigationProp<ActivitiesStackParamList, 'CompareActivities'>;

// Column accents — fixed (not family-based) so the two sides always read as
// distinct even when both activities share a sport.
const COL_A = theme.colors.secondary;
const COL_B = theme.colors.primary;

// Z1..Z5 palette — same tokens as the detail screen's zone chart.
const ZONE_COLORS = [
  familyStyle('recovery').accent,
  theme.colors.success,
  theme.colors.warning,
  theme.colors.primary,
  theme.colors.error,
];

const MOOD_EMOJI = ['😖', '😕', '🙂', '😄', '🤩'];

// ─── Formatters ───────────────────────────────────────────────────────────────
function formatPace(speed: number): string {
  if (!speed) return '--';
  return formatPaceMinKm(1000 / speed / 60);
}
function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function familyForType(type: string): 'activity' | 'records' {
  if (type === 'Workout') return 'records';
  return 'activity';
}

// ─── Stat rows ────────────────────────────────────────────────────────────────
interface StatRowDef {
  label: string;
  a: string;
  b: string;
  /** 0 → left wins, 1 → right wins, null → no highlight. */
  better: 0 | 1 | null;
}

/** Pick the winner; skip the highlight when either side is missing or tied. */
function winner(
  av: number | null | undefined,
  bv: number | null | undefined,
  dir: 'high' | 'low',
): 0 | 1 | null {
  if (av == null || bv == null || av === bv) return null;
  const aWins = dir === 'high' ? av > bv : av < bv;
  return aWins ? 0 : 1;
}

function buildRows(a: Activity, b: Activity): StatRowDef[] {
  const bothRide = a.type === 'Ride' && b.type === 'Ride';
  const paceStr = (x: Activity) => {
    if (bothRide) return `${(x.averageSpeed * 3.6).toFixed(1)} km/h`;
    const p = formatPace(x.averageSpeed);
    return p === '--' ? p : `${p} /km`;
  };
  const cadence = (x: Activity) =>
    x.averageCadence != null ? Math.round(x.averageCadence * (x.type === 'Run' ? 2 : 1)) : null;

  const rows: Array<StatRowDef | null> = [
    {
      label: 'Distance',
      a: `${(a.distance / 1000).toFixed(2)} km`,
      b: `${(b.distance / 1000).toFixed(2)} km`,
      better: winner(a.distance, b.distance, 'high'),
    },
    {
      label: 'Moving time',
      a: formatDuration(a.movingTime),
      b: formatDuration(b.movingTime),
      better: null,
    },
    {
      label: bothRide ? 'Avg speed' : 'Avg pace',
      a: paceStr(a),
      b: paceStr(b),
      better: winner(a.averageSpeed || null, b.averageSpeed || null, 'high'),
    },
    optRow('Avg HR', a.averageHeartRate, b.averageHeartRate, v => `${Math.round(v)} bpm`,
      winner(a.averageHeartRate, b.averageHeartRate, 'low')),
    optRow('Max HR', a.maxHeartRate, b.maxHeartRate, v => `${Math.round(v)} bpm`, null),
    optRow('Cadence', cadence(a), cadence(b), v => `${v} spm`, null),
    {
      label: 'Elevation',
      a: `${Math.round(a.totalElevationGain)} m`,
      b: `${Math.round(b.totalElevationGain)} m`,
      better: winner(a.totalElevationGain, b.totalElevationGain, 'high'),
    },
    optRow('Calories', a.calories, b.calories, v => `${Math.round(v)} kcal`, null),
    optRow('Suffer score', a.sufferScore, b.sufferScore, v => `${v}`, null),
    optRow('Kudos', a.kudosCount, b.kudosCount, v => `${v}`, null),
  ];
  return rows.filter((r): r is StatRowDef => r != null);
}

/** Row for an optional stat — omitted when both sides are missing. */
function optRow(
  label: string,
  av: number | null | undefined,
  bv: number | null | undefined,
  fmt: (v: number) => string,
  better: 0 | 1 | null,
): StatRowDef | null {
  if (av == null && bv == null) return null;
  return {
    label,
    a: av != null ? fmt(av) : '--',
    b: bv != null ? fmt(bv) : '--',
    better,
  };
}

function StatRow({ row }: { row: StatRowDef }) {
  return (
    <View style={s.statRow}>
      <Typography style={[s.statVal, { textAlign: 'left' }, row.better === 0 && { color: COL_A }]}>
        {row.a}
      </Typography>
      <Typography style={s.statLbl}>{row.label}</Typography>
      <Typography style={[s.statVal, { textAlign: 'right' }, row.better === 1 && { color: COL_B }]}>
        {row.b}
      </Typography>
    </View>
  );
}

// ─── Column header ────────────────────────────────────────────────────────────
function ColHead({ act, accent }: { act: Activity; accent: string }) {
  return (
    <View style={s.colHead}>
      <View style={[s.colIcon, { backgroundColor: withAlpha(accent, 'tint'), borderColor: withAlpha(accent, 'strong') }]}>
        {sportIcon(act.type, 20, accent)}
      </View>
      <Typography style={s.colName} numberOfLines={2}>{act.name || act.type}</Typography>
      <Typography style={[s.colDate, { color: accent }]}>
        {format(parseISO(act.startDate), 'MMM d, yyyy').toUpperCase()}
      </Typography>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function CompareActivitiesScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<ActivitiesStackParamList, 'CompareActivities'>>();
  const activities = useStore(st => st.activities);
  const rpeLog = useStore(st => st.rpeLog);

  const [idA, idB] = route.params.ids;
  const a = activities.find(x => x.id === idA);
  const b = activities.find(x => x.id === idB);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ActivitiesList');
  }, [navigation]);

  // Guard: either activity gone from the store (e.g. pruned by a sync) → bail.
  useEffect(() => {
    if (!a || !b) goBack();
  }, [a, b, goBack]);
  if (!a || !b) return null;

  const rows = buildRows(a, b);

  // HR-zone donuts — only when BOTH sides have a cached heartrate distribution.
  const buckets = (x: Activity) => x.zones?.find(z => z.type === 'heartrate')?.buckets ?? null;
  const donutData = (bks: { time: number }[]): DonutSlice[] =>
    bks.slice(0, 5)
      .map((bk, i) => ({ label: `Z${i + 1}`, value: bk.time, color: ZONE_COLORS[i] }))
      .filter(d => d.value > 0);
  const za = buckets(a);
  const zb = buckets(b);
  const dataA = za ? donutData(za) : [];
  const dataB = zb ? donutData(zb) : [];
  const showZones = dataA.length > 0 && dataB.length > 0;

  // Per-zone legend rows: share + minutes for each side, zones with time only.
  const zoneTime = (bks: { time: number }[] | null, i: number) => bks?.[i]?.time ?? 0;
  const totalA = za ? za.slice(0, 5).reduce((sum, bk) => sum + bk.time, 0) : 0;
  const totalB = zb ? zb.slice(0, 5).reduce((sum, bk) => sum + bk.time, 0) : 0;
  const zoneShare = (t: number, total: number) =>
    total > 0 ? `${Math.round((t / total) * 100)}% · ${Math.round(t / 60)}m` : '—';
  const zoneRows = showZones
    ? [0, 1, 2, 3, 4].filter(i => zoneTime(za, i) > 0 || zoneTime(zb, i) > 0)
    : [];

  // RPE check-ins — shown only when both activities have one logged.
  const rpeA = rpeLog[a.id];
  const rpeB = rpeLog[b.id];
  const rpeStr = (e: typeof rpeA) =>
    [e?.rpe != null ? `${e.rpe}/10` : null, e?.mood != null ? MOOD_EMOJI[e.mood - 1] : null]
      .filter(Boolean).join(' ');
  const showRpe = !!(rpeA && rpeB && (rpeStr(rpeA) && rpeStr(rpeB)));

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <PressableScale
          onPress={goBack}
          hitSlop={theme.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={24} color={theme.colors.text} />
        </PressableScale>
        <Typography style={s.headerTitle}>Compare</Typography>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {/* Column headers + stat rows */}
        <View style={s.card}>
          <View style={s.headRow}>
            <ColHead act={a} accent={COL_A} />
            <Typography style={s.vsText}>VS</Typography>
            <ColHead act={b} accent={COL_B} />
          </View>
          <View style={s.headDivider} />
          {rows.map(row => <StatRow key={row.label} row={row} />)}
          {showRpe && (
            <StatRow row={{ label: 'How it felt', a: rpeStr(rpeA), b: rpeStr(rpeB), better: null }} />
          )}
        </View>

        {/* Side-by-side HR-zone donuts */}
        {showZones && (
          <WidgetCard family="health" title="Time in HR Zones" icon={Heart}>
            <View style={s.donutRow}>
              <ChartDonut data={dataA} size={116} legend={false}>
                <Typography style={[s.donutCenter, { color: COL_A }]}>A</Typography>
              </ChartDonut>
              <ChartDonut data={dataB} size={116} legend={false}>
                <Typography style={[s.donutCenter, { color: COL_B }]}>B</Typography>
              </ChartDonut>
            </View>
            <View style={s.zoneRows}>
              {zoneRows.map(i => (
                <View key={i} style={s.zoneRow}>
                  <View style={s.zoneRowLabel}>
                    <View style={[s.zoneLegendDot, { backgroundColor: ZONE_COLORS[i] }]} />
                    <Typography style={s.zoneLegendText}>Z{i + 1}</Typography>
                  </View>
                  <Typography style={s.zoneVal}>{zoneShare(zoneTime(za, i), totalA)}</Typography>
                  <Typography style={s.zoneVal}>{zoneShare(zoneTime(zb, i), totalB)}</Typography>
                </View>
              ))}
            </View>
          </WidgetCard>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerTitle: {
    ...theme.typography.heading,
    color: theme.colors.text,
  },
  scroll: {
    padding: 16,
    paddingTop: 6,
    paddingBottom: 130,
    gap: 12,
  },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    ...theme.shadows.sm,
  },

  // Column headers
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  colHead: { flex: 1, alignItems: 'center', gap: 6 },
  colIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  colName: {
    fontSize: 13, fontWeight: '800', color: theme.colors.text,
    textAlign: 'center', letterSpacing: -0.2,
  },
  colDate: {
    fontSize: 10, fontWeight: '800', letterSpacing: 0.8,
  },
  vsText: {
    fontSize: 11, fontWeight: '900', color: theme.colors.textSecondary,
    letterSpacing: 1.2, marginTop: 12,
  },
  headDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.divider,
    marginTop: 14, marginBottom: 4,
  },

  // Stat rows
  statRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.divider,
  },
  statVal: {
    flex: 1, fontSize: 14, fontWeight: '900', color: theme.colors.text,
    letterSpacing: -0.2, fontVariant: ['tabular-nums'],
  },
  statLbl: {
    width: 110, textAlign: 'center',
    fontSize: 10, fontWeight: '800', color: theme.colors.textSecondary,
    letterSpacing: 1, textTransform: 'uppercase',
  },

  // Zone donuts
  donutRow: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
  },
  donutCenter: { fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  zoneRows: { marginTop: 14, gap: 7 },
  zoneRow: { flexDirection: 'row', alignItems: 'center' },
  zoneRowLabel: { flexDirection: 'row', alignItems: 'center', gap: 5, width: 46 },
  // One value column centered under each donut.
  zoneVal: {
    flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700',
    color: theme.colors.textSecondary, fontVariant: ['tabular-nums'],
  },
  zoneLegendDot: { width: 8, height: 8, borderRadius: 4 },
  zoneLegendText: {
    fontSize: 10, fontWeight: '800', color: theme.colors.textSecondary,
    letterSpacing: 0.6,
  },
});
