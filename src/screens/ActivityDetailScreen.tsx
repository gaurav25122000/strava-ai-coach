import React, { useEffect, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';
import { Typography } from '../components/Typography';
import { Card } from '../components/Card';
import { Activity, useStore, HRZone } from '../store/useStore';
import { StravaService } from '../services/strava';
import {
  ArrowLeft, Clock, Heart, Zap, Mountain,
  Footprints, Flame, TrendingUp, Wind, MapPin, Trophy,
  ThumbsUp, MessageCircle, Award, Cpu, Bike, Shirt,
  Star, Navigation, BarChart2,
} from 'lucide-react-native';
import { format, parseISO } from 'date-fns';

const { width } = Dimensions.get('window');
const CHART_W = width - 48;

// ─── Formatters ───────────────────────────────────────────────────────────────
function formatPace(speed: number): string {
  if (!speed) return '--';
  const mPerK = 1000 / speed / 60;
  const mins = Math.floor(mPerK);
  const secs = Math.round((mPerK - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
function secsToMMSS(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${secs % 60}s`;
}
function paceSpeed(paceMinsPerKm: number): number {
  return 1000 / (paceMinsPerKm * 60);
}

const ZONE_COLORS = ['#22d3ee', '#22c55e', '#f59e0b', '#f97316', '#ef4444'];
const ZONE_LABELS = ['Z1 Recovery', 'Z2 Aerobic', 'Z3 Tempo', 'Z4 Threshold', 'Z5 Max'];

// Fallback boundaries (bpm) if Strava zones not yet fetched
const FALLBACK_MINS = [0, 115, 135, 155, 170];

function getZoneIndex(bpm: number, zones: HRZone[]): number {
  const mins = zones.length >= 5 ? zones.map(z => z.min) : FALLBACK_MINS;
  let z = 0;
  for (let i = 0; i < mins.length; i++) {
    if (bpm >= mins[i]) z = i;
  }
  return z;
}

// ─── Type defs ────────────────────────────────────────────────────────────────
interface Props {
  activity: Activity;
  onClose: () => void;
}

function getTypeGradient(type: string): [string, string] {
  switch (type) {
    case 'Run': return ['#6366f1', '#8b5cf6'];
    case 'Walk': return ['#10b981', '#059669'];
    case 'Ride': return ['#0ea5e9', '#0284c7'];
    default: return ['#f59e0b', '#d97706'];
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatBox({ label, value, sub, color = '#fff' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={sc.statBox}>
      <Typography style={[sc.statVal, { color }]}>{value}</Typography>
      <Typography style={sc.statLabel}>{label}</Typography>
      {sub ? <Typography style={sc.statSub}>{sub}</Typography> : null}
    </View>
  );
}

function SectionTitle({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return (
    <View style={sc.sectionRow}>
      <View style={sc.sectionIconWrap}>{icon}</View>
      <Typography style={sc.sectionTitle}>{title}</Typography>
    </View>
  );
}

// ─── HR Zones Bar Chart ───────────────────────────────────────────────────────
function HRZonesChart({ splits, zones }: { splits: any[]; zones: HRZone[] }) {
  const zoneSecs = [0, 0, 0, 0, 0];
  splits.forEach(s => {
    if (s.average_heartrate) {
      const z = getZoneIndex(s.average_heartrate, zones);
      zoneSecs[z] += s.moving_time || 0;
    }
  });
  const total = zoneSecs.reduce((a, b) => a + b, 0) || 1;

  // Build zone boundary labels from Strava data
  const fallback = FALLBACK_MINS;
  const mins = zones.length >= 5 ? zones.map(z => z.min) : fallback;
  const maxes = zones.length >= 5
    ? zones.map((z, i) => zones[i + 1] ? zones[i + 1].min - 1 : 999)
    : [114, 134, 154, 169, 999];

  return (
    <View style={{ marginTop: 8 }}>
      {zoneSecs.map((secs, i) => {
        const pct = secs / total;
        const rangeLabel = maxes[i] < 999 ? `${mins[i]}–${maxes[i]} bpm` : `${mins[i]}+ bpm`;
        return (
          <View key={i} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ZONE_COLORS[i] }} />
                <Typography style={{ fontSize: 12, color: theme.colors.text }}>{ZONE_LABELS[i]}</Typography>
                <Typography style={{ fontSize: 10, color: theme.colors.textSecondary }}>({rangeLabel})</Typography>
              </View>
              <Typography style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                {secsToMMSS(secs)} ({Math.round(pct * 100)}%)
              </Typography>
            </View>
            <View style={{ height: 8, backgroundColor: theme.colors.border, borderRadius: 4, overflow: 'hidden' }}>
              <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: ZONE_COLORS[i], borderRadius: 4 }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Pace Splits Bar Chart ────────────────────────────────────────────────────
function PaceSplitsChart({ splits }: { splits: any[] }) {
  if (!splits?.length) return null;

  const paces = splits.map(s => s.moving_time && s.distance ? s.moving_time / (s.distance / 1000) : 0).filter(Boolean);
  if (!paces.length) return null;

  const maxPace = Math.max(...paces);
  const minPace = Math.min(...paces);
  const avgPace = paces.reduce((a, b) => a + b, 0) / paces.length;

  const BAR_H = 100;

  return (
    <View>
      {/* Bar chart */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: BAR_H + 20, gap: 4, paddingBottom: 20 }}>
        {splits.slice(0, 20).map((s, i) => {
          const pace = s.moving_time && s.distance ? s.moving_time / (s.distance / 1000) : 0;
          if (!pace) return null;
          // Slower pace = taller bar (inverted for running)
          const pct = (pace - minPace) / ((maxPace - minPace) || 1);
          const barH = Math.max(8, BAR_H * (0.3 + pct * 0.7));
          const isFast = pace <= avgPace;
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <View
                style={{
                  width: '100%',
                  height: barH,
                  backgroundColor: isFast ? '#6366f1' : '#94a3b8',
                  borderRadius: 4,
                  borderTopLeftRadius: 4,
                  borderTopRightRadius: 4,
                }}
              />
              <Typography style={{ fontSize: 9, color: theme.colors.textSecondary, marginTop: 4 }}>{i + 1}</Typography>
            </View>
          );
        })}
      </View>

      {/* Avg pace line label */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <View style={{ width: 20, height: 2, backgroundColor: '#f59e0b' }} />
        <Typography style={{ fontSize: 11, color: theme.colors.textSecondary }}>
          Avg: {secsToMMSS(Math.round(avgPace))} /km
        </Typography>
      </View>
    </View>
  );
}

// ─── Per-KM Splits Table ──────────────────────────────────────────────────────
function SplitsTable({ splits }: { splits: any[] }) {
  if (!splits?.length) return null;
  const avgPace = splits.reduce((a, s) => {
    const p = s.moving_time && s.distance ? s.moving_time / (s.distance / 1000) : 0;
    return a + p;
  }, 0) / splits.length;

  return (
    <View>
      {/* Header */}
      <View style={sc.splitHeader}>
        <Typography style={[sc.splitHCell, { flex: 0.5 }]}>KM</Typography>
        <Typography style={[sc.splitHCell, { flex: 1 }]}>Pace</Typography>
        <Typography style={[sc.splitHCell, { flex: 2 }]}></Typography>
        <Typography style={[sc.splitHCell, { flex: 0.8, textAlign: 'right' }]}>Elev</Typography>
        <Typography style={[sc.splitHCell, { flex: 0.8, textAlign: 'right' }]}>HR</Typography>
      </View>
      {splits.slice(0, 30).map((s, i) => {
        const pace = s.moving_time && s.distance ? s.moving_time / (s.distance / 1000) : 0;
        const barPct = Math.min(pace / (avgPace * 1.5), 1);
        const isFast = pace > 0 && pace <= avgPace;
        return (
          <View key={i} style={sc.splitRow}>
            <Typography style={[sc.splitCell, { flex: 0.5 }]}>{i + 1}</Typography>
            <Typography style={[sc.splitCell, { flex: 1, color: isFast ? '#6366f1' : theme.colors.text }]}>
              {pace ? secsToMMSS(Math.round(pace)) : '--'}
            </Typography>
            <View style={{ flex: 2, justifyContent: 'center' }}>
              <View style={{ height: 6, backgroundColor: theme.colors.border, borderRadius: 3, overflow: 'hidden' }}>
                <View style={{
                  width: `${barPct * 100}%`, height: '100%',
                  backgroundColor: isFast ? '#6366f1' : '#94a3b8', borderRadius: 3,
                }} />
              </View>
            </View>
            <Typography style={[sc.splitCell, { flex: 0.8, textAlign: 'right', color: theme.colors.textSecondary }]}>
              {s.elevation_difference != null ? `${s.elevation_difference > 0 ? '+' : ''}${Math.round(s.elevation_difference)}` : '-'}
            </Typography>
            <Typography style={[sc.splitCell, { flex: 0.8, textAlign: 'right', color: '#ef4444' }]}>
              {s.average_heartrate ? Math.round(s.average_heartrate) : '--'}
            </Typography>
          </View>
        );
      })}
    </View>
  );
}

// ─── Best Efforts ─────────────────────────────────────────────────────────────
function BestEffortsSection({ efforts }: { efforts: any[] }) {
  if (!efforts?.length) return null;
  const DIST_LABELS: Record<number, string> = {
    400: '400m', 1000: '1K', 1609: '1 Mile', 5000: '5K', 10000: '10K', 21097: 'Half', 42195: 'Marathon',
  };
  const shown = efforts.filter(e => DIST_LABELS[e.distance]);
  if (!shown.length) return null;
  return (
    <View>
      {shown.map((e, i) => (
        <View key={i} style={sc.effortRow}>
          {e.pr_rank === 1 ? (
            <Trophy color="#f59e0b" size={14} style={{ marginRight: 6 }} />
          ) : (
            <View style={{ width: 20 }} />
          )}
          <Typography style={[sc.effortLabel, { flex: 1 }]}>
            {DIST_LABELS[e.distance] || `${(e.distance / 1000).toFixed(1)}K`}
          </Typography>
          <Typography style={sc.effortTime}>{secsToMMSS(e.elapsed_time)}</Typography>
          <Typography style={sc.effortPace}>
            {e.elapsed_time && e.distance
              ? `  ${secsToMMSS(Math.round(e.elapsed_time / (e.distance / 1000)))} /km`
              : ''}
          </Typography>
          {e.pr_rank === 1 && (
            <View style={sc.prBadge}><Typography style={sc.prText}>PR</Typography></View>
          )}
        </View>
      ))}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
// ─── Laps Table ───────────────────────────────────────────────────────────────
function LapsTable({ laps, type }: { laps: any[]; type: string }) {
  if (!laps?.length) return null;
  const isRide = type === 'Ride';
  const avgLapPace = laps.reduce((a, l) => {
    const p = l.moving_time && l.distance ? l.moving_time / (l.distance / 1000) : 0;
    return a + p;
  }, 0) / laps.length;
  return (
    <View>
      <View style={sc.splitHeader}>
        <Typography style={[sc.splitHCell, { flex: 0.4 }]}>#</Typography>
        <Typography style={[sc.splitHCell, { flex: 1.2 }]}>{isRide ? 'Speed' : 'Pace'}</Typography>
        <Typography style={[sc.splitHCell, { flex: 0.8 }]}>Dist</Typography>
        <Typography style={[sc.splitHCell, { flex: 0.7 }]}>HR</Typography>
        <Typography style={[sc.splitHCell, { flex: 0.7, textAlign: 'right' }]}>Elev</Typography>
      </View>
      {laps.map((l, i) => {
        const pace = l.moving_time && l.distance ? l.moving_time / (l.distance / 1000) : 0;
        const isFast = pace > 0 && pace <= avgLapPace;
        const speedKmh = l.average_speed ? (l.average_speed * 3.6).toFixed(1) : '--';
        return (
          <View key={i} style={sc.splitRow}>
            <Typography style={[sc.splitCell, { flex: 0.4 }]}>{i + 1}</Typography>
            <Typography style={[sc.splitCell, { flex: 1.2, color: isFast ? '#6366f1' : theme.colors.text }]}>
              {isRide ? `${speedKmh} km/h` : (pace ? secsToMMSS(Math.round(pace)) + ' /km' : '--')}
            </Typography>
            <Typography style={[sc.splitCell, { flex: 0.8, color: theme.colors.textSecondary }]}>
              {l.distance ? (l.distance / 1000).toFixed(2) : '--'} km
            </Typography>
            <Typography style={[sc.splitCell, { flex: 0.7, color: '#ef4444' }]}>
              {l.average_heartrate ? Math.round(l.average_heartrate) : '--'}
            </Typography>
            <Typography style={[sc.splitCell, { flex: 0.7, textAlign: 'right', color: theme.colors.textSecondary }]}>
              {l.total_elevation_gain != null ? `+${Math.round(l.total_elevation_gain)}m` : '-'}
            </Typography>
          </View>
        );
      })}
    </View>
  );
}

export function ActivityDetailScreen({ activity: act, onClose }: Props) {
  const { hrZones } = useStore();
  const [detail, setDetail] = useState<any>(null);
  const [streams, setStreams] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      StravaService.fetchActivityDetail(act.id),
      StravaService.fetchActivityStreams(act.id),
    ])
      .then(([d, s]) => { setDetail(d); setStreams(s); })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [act.id]);

  const km = act.distance / 1000;
  const gradColors = getTypeGradient(act.type);
  const splits: any[] = detail?.splits_metric || [];
  const bestEfforts: any[] = detail?.best_efforts || [];
  const laps: any[] = detail?.laps || [];
  const segments: any[] = detail?.segment_efforts || [];
  const gear = detail?.gear;
  const kudos = detail?.kudos_count ?? 0;
  const comments = detail?.comment_count ?? 0;
  const achievements = detail?.achievement_count ?? 0;
  const prCount = detail?.pr_count ?? 0;
  const deviceName = detail?.device_name || '';
  const description = detail?.description || '';
  const elevHigh = detail?.elev_high;
  const elevLow = detail?.elev_low;
  const workoutType = detail?.workout_type;
  const workoutLabel = workoutType === 1 ? '🏁 Race' : workoutType === 2 ? '🏃 Long Run' : workoutType === 3 ? '⚡ Workout' : null;

  // Calories: list API never returns this — use detail
  const calories = detail?.calories ?? act.calories;
  // Power (rides + some runs with power meter)
  const avgWatts = detail?.average_watts ?? act.averageWatts;
  const weightedWatts = detail?.weighted_average_watts;
  const maxWatts = detail?.max_watts;
  const kilojoules = detail?.kilojoules;
  const hasPower = !!(avgWatts || weightedWatts);
  // Weather
  const weatherTemp = detail?.weather_temp; // °C integer or null
  const weatherHumidity = detail?.weather_humidity;
  const weatherWindspeed = detail?.weather_windspeed; // km/h
  const weatherCondition = detail?.weather_condition; // e.g. "Clear"
  const hasWeather = weatherTemp != null || weatherCondition;
  // Perceived exertion
  const perceivedExertion = detail?.perceived_exertion; // 1–10 RPE
  // Pace analysis from splits
  const splitPaces = splits.map(s => s.moving_time && s.distance ? s.moving_time / (s.distance / 1000) : 0).filter(Boolean);
  const minSplitPace = splitPaces.length ? Math.min(...splitPaces) : 0;
  const maxSplitPace = splitPaces.length ? Math.max(...splitPaces) : 0;

  return (
    <SafeAreaView style={sc.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Hero */}
        <LinearGradient colors={gradColors} style={sc.hero}>
          <TouchableOpacity onPress={onClose} style={sc.backBtn}>
            <ArrowLeft color="#fff" size={22} />
          </TouchableOpacity>
          <Typography style={sc.actType}>{act.type}</Typography>
          <Typography style={sc.actName} numberOfLines={2}>{act.name || act.type}</Typography>
          <Typography style={sc.actDate}>{format(parseISO(act.startDate), 'EEEE, MMMM d, yyyy')}</Typography>

          {/* 3 hero stats */}
          <View style={sc.heroRow}>
            <StatBox label="km" value={km.toFixed(2)} />
            <View style={sc.heroDivider} />
            <StatBox label="/km pace" value={formatPace(act.averageSpeed)} />
            <View style={sc.heroDivider} />
            <StatBox label="moving" value={formatDuration(act.movingTime)} />
          </View>
        </LinearGradient>

        {loading && (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} size="large" />
            <Typography style={{ color: theme.colors.textSecondary, marginTop: 12 }}>Loading full details…</Typography>
          </View>
        )}

        {/* Averages Grid */}
        <Card style={sc.card}>
          <SectionTitle title="Averages" icon={<TrendingUp color={theme.colors.primary} size={15} style={{ marginRight: 6 }} />} />
          <View style={sc.grid}>
            {[
              { icon: <MapPin color="#0ea5e9" size={16} />, val: `${km.toFixed(2)}`, unit: 'km', lbl: 'Distance', bg: '#0ea5e9' },
              { icon: <Clock color="#f59e0b" size={16} />, val: formatDuration(act.movingTime), lbl: 'Time', bg: '#f59e0b' },
              { icon: <TrendingUp color="#6366f1" size={16} />, val: formatPace(act.averageSpeed), unit: '/km', lbl: 'Avg Pace', bg: '#6366f1' },
              { icon: <Heart color="#ef4444" size={16} />, val: act.averageHeartRate ? `${Math.round(act.averageHeartRate)}` : '--', unit: 'bpm', lbl: 'Avg HR', bg: '#ef4444' },
              { icon: <Flame color="#ef4444" size={16} />, val: calories ? `${Math.round(calories)}` : '--', unit: 'kcal', lbl: 'Calories', bg: '#ef4444' },
              { icon: <Mountain color="#f59e0b" size={16} />, val: `${Math.round(act.totalElevationGain)}`, unit: 'm', lbl: 'Elevation', bg: '#f59e0b' },
              ...(act.averageCadence ? [{ icon: <Footprints color="#10b981" size={16} />, val: `${Math.round(act.averageCadence * (act.type === 'Run' ? 2 : 1))}`, unit: 'spm', lbl: 'Cadence', bg: '#10b981' }] : []),
              ...(avgWatts ? [{ icon: <Zap color="#f97316" size={16} />, val: `${Math.round(avgWatts)}`, unit: 'W', lbl: 'Avg Power', bg: '#f97316' }] : []),
              ...(act.sufferScore != null ? [{ icon: <Zap color="#ec4899" size={16} />, val: `${act.sufferScore}`, lbl: 'Suffer Score', bg: '#ec4899' }] : []),
              ...(kilojoules ? [{ icon: <Flame color="#f97316" size={16} />, val: `${Math.round(kilojoules)}`, unit: 'kJ', lbl: 'Energy', bg: '#f97316' }] : []),
            ].map((item, i) => (
              <View key={i} style={sc.gridItem}>
                <View style={[sc.gridIcon, { backgroundColor: item.bg + '15' }]}>{item.icon}</View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2, marginTop: 6 }}>
                  <Typography style={sc.gridVal}>{item.val}</Typography>
                  {item.unit ? <Typography style={sc.gridUnit}>{item.unit}</Typography> : null}
                </View>
                <Typography style={sc.gridLbl}>{item.lbl}</Typography>
              </View>
            ))}
          </View>
        </Card>

        {/* HR Zones */}
        {splits.length > 0 && act.averageHeartRate ? (
          <Card style={sc.card}>
            <SectionTitle title="Heart Rate Zones" icon={<Heart color="#ef4444" size={15} style={{ marginRight: 6 }} />} />
            <View style={{ flexDirection: 'row', gap: 16, marginBottom: 12 }}>
              <View style={sc.hrStat}>
                <Typography style={[sc.hrStatVal, { color: '#ef4444' }]}>{Math.round(act.averageHeartRate)} bpm</Typography>
                <Typography style={sc.hrStatLbl}>Average</Typography>
              </View>
              {act.maxHeartRate ? (
                <View style={sc.hrStat}>
                  <Typography style={[sc.hrStatVal, { color: '#f97316' }]}>{Math.round(act.maxHeartRate)} bpm</Typography>
                  <Typography style={sc.hrStatLbl}>Peak</Typography>
                </View>
              ) : null}
            </View>
            <HRZonesChart splits={splits} zones={hrZones} />
          </Card>
        ) : null}

        {/* Pace splits chart */}
        {splits.length > 0 ? (
          <Card style={sc.card}>
            <SectionTitle title="Pace Analysis" icon={<TrendingUp color="#6366f1" size={15} style={{ marginRight: 6 }} />} />
            {splitPaces.length > 0 ? (
              <View style={{ flexDirection: 'row', gap: 20, marginBottom: 12 }}>
                <View>
                  <Typography style={{ fontSize: 13, fontWeight: '700', color: '#6366f1' }}>{secsToMMSS(Math.round(minSplitPace))}</Typography>
                  <Typography style={{ fontSize: 10, color: theme.colors.textSecondary }}>Best KM</Typography>
                </View>
                <View>
                  <Typography style={{ fontSize: 13, fontWeight: '700', color: '#94a3b8' }}>{secsToMMSS(Math.round(maxSplitPace))}</Typography>
                  <Typography style={{ fontSize: 10, color: theme.colors.textSecondary }}>Slowest KM</Typography>
                </View>
              </View>
            ) : null}
            <PaceSplitsChart splits={splits} />
          </Card>
        ) : null}

        {/* Per-KM splits table */}
        {splits.length > 0 ? (
          <Card style={sc.card}>
            <SectionTitle title="Splits" icon={<Wind color={theme.colors.primary} size={15} style={{ marginRight: 6 }} />} />
            <SplitsTable splits={splits} />
          </Card>
        ) : null}

        {/* Laps */}
        {laps.length > 1 ? (
          <Card style={sc.card}>
            <SectionTitle title={`Laps (${laps.length})`} icon={<Navigation color="#10b981" size={15} style={{ marginRight: 6 }} />} />
            <LapsTable laps={laps} type={act.type} />
          </Card>
        ) : null}

        {/* Best Efforts */}
        {bestEfforts.length > 0 ? (
          <Card style={sc.card}>
            <SectionTitle title="Best Efforts" icon={<Trophy color="#f59e0b" size={15} style={{ marginRight: 6 }} />} />
            <BestEffortsSection efforts={bestEfforts} />
          </Card>
        ) : null}

        {/* Power Deep-Dive (rides / power meter runs) */}
        {hasPower && (
          <Card style={sc.card}>
            <SectionTitle title="Power" icon={<Zap color="#f97316" size={15} style={{ marginRight: 6 }} />} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 0 }}>
              {avgWatts ? (
                <View style={sc.gridItem}>
                  <Typography style={[sc.gridVal, { color: '#f97316' }]}>{Math.round(avgWatts)} W</Typography>
                  <Typography style={sc.gridLbl}>Avg Power</Typography>
                </View>
              ) : null}
              {weightedWatts ? (
                <View style={sc.gridItem}>
                  <Typography style={[sc.gridVal, { color: '#f59e0b' }]}>{Math.round(weightedWatts)} W</Typography>
                  <Typography style={sc.gridLbl}>Weighted (NP)</Typography>
                </View>
              ) : null}
              {maxWatts ? (
                <View style={sc.gridItem}>
                  <Typography style={[sc.gridVal, { color: '#ef4444' }]}>{Math.round(maxWatts)} W</Typography>
                  <Typography style={sc.gridLbl}>Peak Power</Typography>
                </View>
              ) : null}
              {kilojoules ? (
                <View style={sc.gridItem}>
                  <Typography style={[sc.gridVal, { color: '#10b981' }]}>{Math.round(kilojoules)} kJ</Typography>
                  <Typography style={sc.gridLbl}>Total Work</Typography>
                </View>
              ) : null}
            </View>
          </Card>
        )}

        {/* Relative Effort + Perceived Exertion */}
        {(act.sufferScore != null || perceivedExertion != null) && (
          <Card style={sc.card}>
            <SectionTitle title="Effort & Exertion" icon={<Flame color="#ec4899" size={15} style={{ marginRight: 6 }} />} />
            <View style={{ flexDirection: 'row', gap: 16 }}>
              {act.sufferScore != null && (
                <View style={{ flex: 1, alignItems: 'center', padding: 12, backgroundColor: '#ec489910', borderRadius: 12 }}>
                  <Typography style={{ fontSize: 32, fontWeight: '900', color: '#ec4899' }}>{act.sufferScore}</Typography>
                  <Typography style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 }}>Relative Effort</Typography>
                  <Typography style={{ fontSize: 12, fontWeight: '700', color: '#ec4899', marginTop: 4 }}>
                    {act.sufferScore < 25 ? 'Easy' : act.sufferScore < 50 ? 'Moderate' : act.sufferScore < 75 ? 'Hard' : act.sufferScore < 100 ? 'Very Hard' : 'Maximum'}
                  </Typography>
                </View>
              )}
              {perceivedExertion != null && (
                <View style={{ flex: 1, alignItems: 'center', padding: 12, backgroundColor: '#f97316' + '10', borderRadius: 12 }}>
                  <Typography style={{ fontSize: 32, fontWeight: '900', color: '#f97316' }}>{perceivedExertion}/10</Typography>
                  <Typography style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 }}>Perceived Exertion</Typography>
                  <Typography style={{ fontSize: 12, fontWeight: '700', color: '#f97316', marginTop: 4 }}>
                    {perceivedExertion <= 3 ? 'Easy' : perceivedExertion <= 5 ? 'Moderate' : perceivedExertion <= 7 ? 'Hard' : perceivedExertion <= 9 ? 'Very Hard' : 'Max'}
                  </Typography>
                </View>
              )}
            </View>
          </Card>
        )}

        {/* Weather */}
        {hasWeather && (
          <Card style={sc.card}>
            <SectionTitle title="Weather" icon={<Wind color="#0ea5e9" size={15} style={{ marginRight: 6 }} />} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 0 }}>
              {weatherTemp != null && (
                <View style={sc.gridItem}>
                  <Typography style={[sc.gridVal, { color: '#0ea5e9' }]}>{weatherTemp}°C</Typography>
                  <Typography style={sc.gridLbl}>Temperature</Typography>
                </View>
              )}
              {weatherHumidity != null && (
                <View style={sc.gridItem}>
                  <Typography style={[sc.gridVal, { color: '#10b981' }]}>{weatherHumidity}%</Typography>
                  <Typography style={sc.gridLbl}>Humidity</Typography>
                </View>
              )}
              {weatherWindspeed != null && (
                <View style={sc.gridItem}>
                  <Typography style={[sc.gridVal, { color: '#6366f1' }]}>{Math.round(weatherWindspeed)} km/h</Typography>
                  <Typography style={sc.gridLbl}>Wind</Typography>
                </View>
              )}
              {weatherCondition && (
                <View style={sc.gridItem}>
                  <Typography style={[sc.gridVal, { color: theme.colors.text, fontSize: 14 }]}>{weatherCondition}</Typography>
                  <Typography style={sc.gridLbl}>Condition</Typography>
                </View>
              )}
            </View>
          </Card>
        )}

        {/* Social Stats */}
        {(kudos > 0 || achievements > 0) && (
          <Card style={sc.card}>
            <SectionTitle title="Activity Stats" icon={<Star color="#f59e0b" size={15} style={{ marginRight: 6 }} />} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <View style={sc.socialItem}>
                <ThumbsUp color="#6366f1" size={20} />
                <Typography style={[sc.socialVal, { color: '#6366f1' }]}>{kudos}</Typography>
                <Typography style={sc.socialLbl}>Kudos</Typography>
              </View>
              <View style={sc.socialItem}>
                <MessageCircle color="#10b981" size={20} />
                <Typography style={[sc.socialVal, { color: '#10b981' }]}>{comments}</Typography>
                <Typography style={sc.socialLbl}>Comments</Typography>
              </View>
              <View style={sc.socialItem}>
                <Award color="#f59e0b" size={20} />
                <Typography style={[sc.socialVal, { color: '#f59e0b' }]}>{achievements}</Typography>
                <Typography style={sc.socialLbl}>Achievements</Typography>
              </View>
              <View style={sc.socialItem}>
                <Trophy color="#ef4444" size={20} />
                <Typography style={[sc.socialVal, { color: '#ef4444' }]}>{prCount}</Typography>
                <Typography style={sc.socialLbl}>PRs</Typography>
              </View>
            </View>
          </Card>
        )}

        {/* Elevation Profile */}
        {(elevHigh != null && elevLow != null) && (
          <Card style={sc.card}>
            <SectionTitle title="Elevation" icon={<Mountain color="#f59e0b" size={15} style={{ marginRight: 6 }} />} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <View style={sc.socialItem}>
                <Typography style={[sc.socialVal, { color: '#f59e0b' }]}>{Math.round(elevHigh)}m</Typography>
                <Typography style={sc.socialLbl}>Peak</Typography>
              </View>
              <View style={sc.socialItem}>
                <Typography style={[sc.socialVal, { color: '#10b981' }]}>{Math.round(elevLow)}m</Typography>
                <Typography style={sc.socialLbl}>Lowest</Typography>
              </View>
              <View style={sc.socialItem}>
                <Typography style={[sc.socialVal, { color: '#6366f1' }]}>{Math.round((elevHigh ?? 0) - (elevLow ?? 0))}m</Typography>
                <Typography style={sc.socialLbl}>Net Gain</Typography>
              </View>
            </View>
          </Card>
        )}

        {/* Top Segments */}
        {segments.length > 0 && (
          <Card style={sc.card}>
            <SectionTitle title="Segment Efforts" icon={<BarChart2 color="#6366f1" size={15} style={{ marginRight: 6 }} />} />
            {segments.slice(0, 5).map((seg: any, i: number) => {
              const isPR = seg.pr_rank === 1;
              const isTop10 = seg.kom_rank != null && seg.kom_rank <= 10;
              return (
                <View key={i} style={sc.segRow}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Typography style={sc.segName} numberOfLines={1}>{seg.name}</Typography>
                      {isPR && <View style={sc.prBadge}><Typography style={sc.prText}>PR</Typography></View>}
                      {isTop10 && !isPR && <View style={[sc.prBadge, { backgroundColor: '#6366f118' }]}><Typography style={[sc.prText, { color: '#6366f1' }]}>Top 10</Typography></View>}
                    </View>
                    <Typography style={sc.segMeta}>{(seg.distance / 1000).toFixed(1)} km · {Math.round(seg.segment?.average_grade || 0)}% grade</Typography>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Typography style={sc.segTime}>{secsToMMSS(seg.moving_time)}</Typography>
                    {seg.pr_rank && <Typography style={sc.segRank}>#{seg.pr_rank} all-time</Typography>}
                  </View>
                </View>
              );
            })}
          </Card>
        )}

        {/* Gear */}
        {gear && (
          <Card style={sc.card}>
            <SectionTitle title="Gear" icon={<Shirt color="#8b5cf6" size={15} style={{ marginRight: 6 }} />} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {act.type === 'Ride' ? <Bike color="#8b5cf6" size={24} /> : <Footprints color="#8b5cf6" size={24} />}
              <View>
                <Typography style={{ fontSize: 15, fontWeight: '700', color: theme.colors.text }}>{gear.name}</Typography>
                <Typography style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 }}>{Math.round((gear.distance || 0) / 1000)} km on this gear</Typography>
              </View>
            </View>
          </Card>
        )}

        {/* Device & Notes */}
        {(deviceName || description || workoutLabel) && (
          <Card style={sc.card}>
            <SectionTitle title="Details" icon={<Cpu color="#64748b" size={15} style={{ marginRight: 6 }} />} />
            {workoutLabel && (
              <View style={[sc.prBadge, { alignSelf: 'flex-start', marginBottom: 10, paddingHorizontal: 10, paddingVertical: 5 }]}>
                <Typography style={[sc.prText, { fontSize: 13 }]}>{workoutLabel}</Typography>
              </View>
            )}
            {deviceName ? <Typography style={sc.detailText}>📱 {deviceName}</Typography> : null}
            {description ? <Typography style={[sc.detailText, { marginTop: 6, lineHeight: 20 }]}>{description}</Typography> : null}
          </Card>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const sc = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  hero: { padding: 20, paddingTop: 10, paddingBottom: 28 },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center',
    justifyContent: 'center', marginBottom: 14,
  },
  actType: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 },
  actName: { fontSize: 24, color: '#fff', fontWeight: '800', marginBottom: 4 },
  actDate: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 22 },
  heroRow: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 16, padding: 18 },
  heroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 4 },
  statBox: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 22, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '600', marginTop: 3 },
  statSub: { fontSize: 9, color: 'rgba(255,255,255,0.45)' },

  card: { margin: 16, marginTop: 0, marginBottom: 14 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sectionIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.3 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridItem: { width: '31%', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12 },
  gridIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  gridVal: { fontSize: 17, fontWeight: '800', color: theme.colors.text },
  gridUnit: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary },
  gridLbl: { fontSize: 10, color: theme.colors.textSecondary, marginTop: 3, fontWeight: '500' },

  hrStat: { alignItems: 'center', flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, paddingVertical: 12 },
  hrStatVal: { fontSize: 22, fontWeight: '800' },
  hrStatLbl: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 3 },

  splitHeader: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderColor: theme.colors.border, marginBottom: 4 },
  splitHCell: { fontSize: 10, fontWeight: '700', color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  splitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  splitCell: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },

  effortRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  effortLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  effortTime: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginRight: 4 },
  effortPace: { fontSize: 12, color: theme.colors.textSecondary },
  prBadge: { backgroundColor: '#f59e0b22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 6 },
  prText: { fontSize: 10, fontWeight: '800', color: '#f59e0b' },

  socialItem: { alignItems: 'center', gap: 6, paddingVertical: 12, flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, marginHorizontal: 3 },
  socialVal: { fontSize: 22, fontWeight: '800' },
  socialLbl: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: '600' },

  segRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  segName: { fontSize: 13, fontWeight: '700', color: theme.colors.text, flex: 1 },
  segMeta: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 3 },
  segTime: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  segRank: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },

  detailText: { fontSize: 13, color: theme.colors.text, fontWeight: '500', lineHeight: 20 },
});
