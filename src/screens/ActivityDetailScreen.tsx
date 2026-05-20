import React, { useEffect, useMemo, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { theme } from '../theme';
import { Typography } from '../components/Typography';
import { Card } from '../components/Card';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Activity, useStore, HRZone } from '../store/useStore';
import { StravaService } from '../services/strava';
import { decodePolyline } from '../utils/polyline';
import {
  ArrowLeft, Clock, Heart, Zap, Mountain,
  Footprints, Flame, TrendingUp, Wind, MapPin, Trophy,
  ThumbsUp, MessageCircle, Award, Cpu, Bike, Shirt,
  Star, Navigation, BarChart2, Pause, Gauge, Users,
  Image as ImageIcon, Briefcase, Lock, Edit3, Cog,
  Thermometer,
} from 'lucide-react-native';
import { format, parseISO } from 'date-fns';

const { width } = Dimensions.get('window');
const CHART_W = width - 48;
const MAP_H = 210;
const MAP_W = width - 64; // card margin 16*2 + card padding 16*2

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
function formatRest(elapsed: number, moving: number): string {
  const diff = Math.max(0, elapsed - moving);
  if (diff < 60) return `${diff}s`;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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

// Projects geo coords into an SVG view box, preserving aspect ratio
function projectRoute(
  coords: { latitude: number; longitude: number }[],
  vw: number,
  vh: number,
  padding = 16,
) {
  if (!coords.length) return { d: '', points: [] as { x: number; y: number }[] };
  let minLat = coords[0].latitude;
  let maxLat = coords[0].latitude;
  let minLng = coords[0].longitude;
  let maxLng = coords[0].longitude;
  for (const c of coords) {
    if (c.latitude < minLat) minLat = c.latitude;
    if (c.latitude > maxLat) maxLat = c.latitude;
    if (c.longitude < minLng) minLng = c.longitude;
    if (c.longitude > maxLng) maxLng = c.longitude;
  }
  const latRange = Math.max(maxLat - minLat, 1e-6);
  const lngRange = Math.max(maxLng - minLng, 1e-6);
  const xScale = (vw - 2 * padding) / lngRange;
  const yScale = (vh - 2 * padding) / latRange;
  const scale = Math.min(xScale, yScale);
  const renderedW = lngRange * scale;
  const renderedH = latRange * scale;
  const xOffset = (vw - renderedW) / 2;
  const yOffset = (vh - renderedH) / 2;
  const points = coords.map(c => ({
    x: xOffset + (c.longitude - minLng) * scale,
    y: yOffset + (maxLat - c.latitude) * scale, // invert Y so north is up
  }));
  let d = '';
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    d += `${i === 0 ? 'M' : ' L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }
  return { d, points };
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatBox({ label, value, sub, color = '#fff', animated, decimals = 0 }: { label: string; value: string | number; sub?: string; color?: string; animated?: boolean; decimals?: number }) {
  return (
    <View style={sc.statBox}>
      {animated && typeof value === 'number'
        ? <AnimatedNumber value={value} decimals={decimals} style={[sc.statVal, { color }]} />
        : <Typography style={[sc.statVal, { color }]}>{value}</Typography>}
      <Typography style={sc.statLabel}>{label}</Typography>
      {sub ? <Typography style={sc.statSub}>{sub}</Typography> : null}
    </View>
  );
}

function SectionTitle({ title, icon, action }: { title: string; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <View style={sc.sectionRow}>
      <View style={sc.sectionIconWrap}>{icon}</View>
      <Typography style={sc.sectionTitle}>{title}</Typography>
      {action ? <View style={{ marginLeft: 'auto' }}>{action}</View> : null}
    </View>
  );
}

function Badge({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <View style={[sc.badge, { backgroundColor: color + '18', borderColor: color + '55' }]}>
      {icon}
      <Typography style={[sc.badgeText, { color }]}>{label}</Typography>
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

  const fallback = FALLBACK_MINS;
  const mins = zones.length >= 5 ? zones.map(z => z.min) : fallback;
  const maxes = zones.length >= 5
    ? zones.map((_, i) => zones[i + 1] ? zones[i + 1].min - 1 : 999)
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
function PaceSplitsChart({ splits, isRide }: { splits: any[]; isRide?: boolean }) {
  if (!splits?.length) return null;

  const paces = splits.map(s => s.moving_time && s.distance ? s.moving_time / (s.distance / 1000) : 0).filter(Boolean);
  if (!paces.length) return null;

  const maxPace = Math.max(...paces);
  const minPace = Math.min(...paces);
  const avgPace = paces.reduce((a, b) => a + b, 0) / paces.length;

  const BAR_H = 100;

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: BAR_H + 20, gap: 4, paddingBottom: 20 }}>
        {splits.slice(0, 20).map((s, i) => {
          const pace = s.moving_time && s.distance ? s.moving_time / (s.distance / 1000) : 0;
          if (!pace) return null;
          // For runs: slower = taller; for rides: slower = shorter (inverted)
          const pct = (pace - minPace) / ((maxPace - minPace) || 1);
          const barH = Math.max(8, BAR_H * (0.3 + (isRide ? 1 - pct : pct) * 0.7));
          const isFast = pace <= avgPace;
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <LinearGradient
                colors={isFast ? ['#6366f1', '#8b5cf6'] : ['#475569', '#64748b']}
                style={{
                  width: '100%',
                  height: barH,
                  borderRadius: 4,
                }}
              />
              <Typography style={{ fontSize: 9, color: theme.colors.textSecondary, marginTop: 4 }}>{i + 1}</Typography>
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <View style={{ width: 20, height: 2, backgroundColor: '#f59e0b' }} />
        <Typography style={{ fontSize: 11, color: theme.colors.textSecondary }}>
          Avg: {secsToMMSS(Math.round(avgPace))} /km
        </Typography>
      </View>
    </View>
  );
}

// ─── Per-Distance Splits Table ────────────────────────────────────────────────
function SplitsTable({ splits, unit }: { splits: any[]; unit: 'km' | 'mi' }) {
  if (!splits?.length) return null;
  const factor = unit === 'mi' ? 1609.34 : 1000;
  const unitLabel = unit === 'mi' ? 'MI' : 'KM';
  const avgPace = splits.reduce((a, s) => {
    const p = s.moving_time && s.distance ? s.moving_time / (s.distance / factor) : 0;
    return a + p;
  }, 0) / splits.length;

  return (
    <View>
      <View style={sc.splitHeader}>
        <Typography style={[sc.splitHCell, { flex: 0.5 }]}>{unitLabel}</Typography>
        <Typography style={[sc.splitHCell, { flex: 1 }]}>Pace</Typography>
        <Typography style={[sc.splitHCell, { flex: 2 }]}></Typography>
        <Typography style={[sc.splitHCell, { flex: 0.8, textAlign: 'right' }]}>Elev</Typography>
        <Typography style={[sc.splitHCell, { flex: 0.8, textAlign: 'right' }]}>HR</Typography>
      </View>
      {splits.slice(0, 30).map((s, i) => {
        const pace = s.moving_time && s.distance ? s.moving_time / (s.distance / factor) : 0;
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

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function ActivityDetailScreen({ activity: act, onClose }: Props) {
  const { hrZones, activities } = useStore();
  const [detail, setDetail] = useState<any>(null);
  const [, setStreams] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [splitUnit, setSplitUnit] = useState<'km' | 'mi'>('km');

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
  const splitsImperial: any[] = detail?.splits_standard || [];
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
  const workoutLabel = workoutType === 1 ? 'Race' : workoutType === 2 ? 'Long Run' : workoutType === 3 ? 'Workout' : null;
  const workoutIcon = workoutType === 1 ? <Flame size={11} color="#ef4444" /> : workoutType === 2 ? <Footprints size={11} color="#3b82f6" /> : workoutType === 3 ? <Zap size={11} color="#f59e0b" /> : null;
  const workoutColor = workoutType === 1 ? '#ef4444' : workoutType === 2 ? '#3b82f6' : workoutType === 3 ? '#f59e0b' : '#94a3b8';

  // Flags
  const isCommute = !!detail?.commute;
  const isManual = !!detail?.manual;
  const isPrivate = !!detail?.private;
  const isTrainer = !!detail?.trainer;

  // Group / photos
  const athleteCount = detail?.athlete_count ?? 1;
  const photoCount = detail?.total_photo_count ?? detail?.photo_count ?? 0;
  const photoUrl = detail?.photos?.primary?.urls?.['600'] || detail?.photos?.primary?.urls?.['100'] || null;

  // Calories
  const calories = detail?.calories ?? act.calories;
  // Power
  const avgWatts = detail?.average_watts ?? act.averageWatts;
  const weightedWatts = detail?.weighted_average_watts;
  const maxWatts = detail?.max_watts;
  const kilojoules = detail?.kilojoules;
  const hasPower = !!(avgWatts || weightedWatts);
  // Speed
  const maxSpeed = detail?.max_speed ?? act.maxSpeed; // m/s
  const avgSpeedKmh = act.averageSpeed ? act.averageSpeed * 3.6 : 0;
  const maxSpeedKmh = maxSpeed ? maxSpeed * 3.6 : 0;
  const isRide = act.type === 'Ride';
  // Weather / temp
  const weatherTemp = detail?.weather_temp;
  const weatherHumidity = detail?.weather_humidity;
  const weatherWindspeed = detail?.weather_windspeed;
  const weatherCondition = detail?.weather_condition;
  const deviceTemp = detail?.average_temp; // sensor-reported, °C
  const hasWeather = weatherTemp != null || weatherCondition || deviceTemp != null;
  // RPE
  const perceivedExertion = detail?.perceived_exertion;
  // Pace analysis from splits
  const splitPaces = splits.map(s => s.moving_time && s.distance ? s.moving_time / (s.distance / 1000) : 0).filter(Boolean);
  const minSplitPace = splitPaces.length ? Math.min(...splitPaces) : 0;
  const maxSplitPace = splitPaces.length ? Math.max(...splitPaces) : 0;

  // Rest / pause
  const hasRest = act.elapsedTime > act.movingTime + 30;
  const restLabel = formatRest(act.elapsedTime, act.movingTime);

  // Mini-map polyline
  const polylineStr: string = detail?.map?.summary_polyline || detail?.map?.polyline || '';
  const coords = useMemo(() => decodePolyline(polylineStr), [polylineStr]);
  const projected = useMemo(() => projectRoute(coords, MAP_W, MAP_H, 18), [coords]);

  // Similar activities: same type, ±15% distance, exclude self
  const similarActivities = useMemo(() => {
    const lower = act.distance * 0.85;
    const upper = act.distance * 1.15;
    return activities.filter(a => a.id !== act.id && a.type === act.type && a.distance >= lower && a.distance <= upper);
  }, [activities, act.id, act.type, act.distance]);
  const similarFasterCount = useMemo(() => {
    if (!act.averageSpeed) return 0;
    return similarActivities.filter(a => (a.averageSpeed || 0) > act.averageSpeed).length;
  }, [similarActivities, act.averageSpeed]);
  const rankPercentile = similarActivities.length > 0
    ? Math.round((1 - similarFasterCount / (similarActivities.length + 1)) * 100)
    : null;

  // Are imperial splits a different list? Useful only if Strava returned them.
  const canSwitchUnit = splitsImperial.length > 0;

  let stagger = 0;
  const next = () => stagger++;

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
          <Typography style={sc.actDate}>{format(parseISO(act.startDate), 'EEEE, MMMM d, yyyy · h:mm a')}</Typography>

          {/* Status badges */}
          {(workoutLabel || isCommute || isManual || isPrivate || isTrainer || athleteCount > 1) && (
            <View style={sc.badgeRow}>
              {workoutLabel && <Badge icon={workoutIcon} label={workoutLabel} color={workoutColor} />}
              {athleteCount > 1 && <Badge icon={<Users size={11} color="#a78bfa" />} label={`Group (${athleteCount})`} color="#a78bfa" />}
              {isCommute && <Badge icon={<Briefcase size={11} color="#60a5fa" />} label="Commute" color="#60a5fa" />}
              {isTrainer && <Badge icon={<Cog size={11} color="#fbbf24" />} label="Trainer" color="#fbbf24" />}
              {isManual && <Badge icon={<Edit3 size={11} color="#f87171" />} label="Manual entry" color="#f87171" />}
              {isPrivate && <Badge icon={<Lock size={11} color="#9ca3af" />} label="Private" color="#9ca3af" />}
            </View>
          )}

          {/* 3 hero stats with animated counters */}
          <View style={sc.heroRow}>
            <StatBox label="km" value={Number(km.toFixed(2))} animated decimals={2} />
            <View style={sc.heroDivider} />
            <StatBox label={isRide ? 'km/h avg' : '/km pace'} value={isRide ? avgSpeedKmh.toFixed(1) : formatPace(act.averageSpeed)} />
            <View style={sc.heroDivider} />
            <StatBox label="moving" value={formatDuration(act.movingTime)} />
          </View>

          {/* Rank pill if we have similar activities to compare */}
          {rankPercentile != null && similarActivities.length >= 3 && (
            <View style={sc.rankPill}>
              <Trophy size={12} color="#fbbf24" />
              <Typography style={sc.rankText}>
                Top {100 - rankPercentile}% of your last {similarActivities.length + 1} similar {act.type.toLowerCase()}s
              </Typography>
            </View>
          )}
        </LinearGradient>

        {loading && (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} size="large" />
            <Typography style={{ color: theme.colors.textSecondary, marginTop: 12 }}>Loading full details…</Typography>
          </View>
        )}

        {/* Route Map */}
        {projected.points.length > 1 && (
          <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
            <Card variant="elevated" style={sc.card}>
              <SectionTitle title="Route" icon={<MapPin color={gradColors[0]} size={15} style={{ marginRight: 6 }} />} />
              <View style={sc.mapWrap}>
                <LinearGradient
                  colors={['#1f2030', '#11131f']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <Svg width={MAP_W} height={MAP_H}>
                  <Defs>
                    <SvgLinearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0" stopColor={gradColors[0]} stopOpacity="1" />
                      <Stop offset="1" stopColor={gradColors[1]} stopOpacity="1" />
                    </SvgLinearGradient>
                  </Defs>
                  {/* Soft glow underlay */}
                  <Path
                    d={projected.d}
                    stroke={gradColors[0]}
                    strokeOpacity={0.25}
                    strokeWidth={8}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Main route */}
                  <Path
                    d={projected.d}
                    stroke="url(#routeGrad)"
                    strokeWidth={3.5}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Start marker (green) */}
                  <Circle
                    cx={projected.points[0].x}
                    cy={projected.points[0].y}
                    r={5}
                    fill="#10b981"
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                  {/* End marker (red) */}
                  <Circle
                    cx={projected.points[projected.points.length - 1].x}
                    cy={projected.points[projected.points.length - 1].y}
                    r={5}
                    fill="#ef4444"
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                </Svg>
                <View style={sc.mapLegend}>
                  <View style={sc.legendItem}>
                    <View style={[sc.legendDot, { backgroundColor: '#10b981' }]} />
                    <Typography style={sc.legendText}>Start</Typography>
                  </View>
                  <View style={sc.legendItem}>
                    <View style={[sc.legendDot, { backgroundColor: '#ef4444' }]} />
                    <Typography style={sc.legendText}>End</Typography>
                  </View>
                </View>
              </View>
            </Card>
          </Animated.View>
        )}

        {/* Photo */}
        {photoUrl && (
          <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
            <Card variant="elevated" style={sc.card}>
              <SectionTitle title={photoCount > 1 ? `Photos (${photoCount})` : 'Photo'} icon={<ImageIcon color="#8b5cf6" size={15} style={{ marginRight: 6 }} />} />
              <Image source={{ uri: photoUrl }} style={sc.photo} resizeMode="cover" />
            </Card>
          </Animated.View>
        )}

        {/* Averages Grid */}
        <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
          <Card variant="elevated" style={sc.card}>
            <SectionTitle title="Averages" icon={<TrendingUp color={theme.colors.primary} size={15} style={{ marginRight: 6 }} />} />
            <View style={sc.grid}>
              {[
                { icon: <MapPin color="#0ea5e9" size={16} />, val: `${km.toFixed(2)}`, unit: 'km', lbl: 'Distance', bg: '#0ea5e9' },
                { icon: <Clock color="#f59e0b" size={16} />, val: formatDuration(act.movingTime), lbl: 'Moving', bg: '#f59e0b' },
                ...(hasRest ? [{ icon: <Pause color="#94a3b8" size={16} />, val: restLabel, lbl: 'Paused', bg: '#94a3b8' }] : []),
                { icon: <TrendingUp color="#6366f1" size={16} />, val: isRide ? avgSpeedKmh.toFixed(1) : formatPace(act.averageSpeed), unit: isRide ? 'km/h' : '/km', lbl: isRide ? 'Avg Speed' : 'Avg Pace', bg: '#6366f1' },
                ...(maxSpeedKmh > 0 ? [{ icon: <Gauge color="#10b981" size={16} />, val: maxSpeedKmh.toFixed(1), unit: 'km/h', lbl: 'Max Speed', bg: '#10b981' }] : []),
                ...(act.averageHeartRate ? [{ icon: <Heart color="#ef4444" size={16} />, val: `${Math.round(act.averageHeartRate)}`, unit: 'bpm', lbl: 'Avg HR', bg: '#ef4444' }] : []),
                ...(act.maxHeartRate ? [{ icon: <Heart color="#f97316" size={16} />, val: `${Math.round(act.maxHeartRate)}`, unit: 'bpm', lbl: 'Max HR', bg: '#f97316' }] : []),
                ...(calories ? [{ icon: <Flame color="#ef4444" size={16} />, val: `${Math.round(calories)}`, unit: 'kcal', lbl: 'Calories', bg: '#ef4444' }] : []),
                { icon: <Mountain color="#f59e0b" size={16} />, val: `${Math.round(act.totalElevationGain)}`, unit: 'm', lbl: 'Elevation', bg: '#f59e0b' },
                ...(act.averageCadence ? [{ icon: <Footprints color="#10b981" size={16} />, val: `${Math.round(act.averageCadence * (act.type === 'Run' ? 2 : 1))}`, unit: 'spm', lbl: 'Cadence', bg: '#10b981' }] : []),
                ...(avgWatts ? [{ icon: <Zap color="#f97316" size={16} />, val: `${Math.round(avgWatts)}`, unit: 'W', lbl: 'Avg Power', bg: '#f97316' }] : []),
                ...(act.sufferScore != null ? [{ icon: <Zap color="#ec4899" size={16} />, val: `${act.sufferScore}`, lbl: 'Suffer Score', bg: '#ec4899' }] : []),
                ...(kilojoules ? [{ icon: <Flame color="#f97316" size={16} />, val: `${Math.round(kilojoules)}`, unit: 'kJ', lbl: 'Energy', bg: '#f97316' }] : []),
                ...(deviceTemp != null ? [{ icon: <Thermometer color="#fb923c" size={16} />, val: `${deviceTemp}°C`, lbl: 'Sensor Temp', bg: '#fb923c' }] : []),
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
        </Animated.View>

        {/* HR Zones */}
        {splits.length > 0 && act.averageHeartRate ? (
          <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
            <Card variant="elevated" style={sc.card}>
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
          </Animated.View>
        ) : null}

        {/* Pace splits chart */}
        {splits.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
            <Card variant="elevated" style={sc.card}>
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
              <PaceSplitsChart splits={splits} isRide={isRide} />
            </Card>
          </Animated.View>
        ) : null}

        {/* Per-KM/MI splits table — toggleable */}
        {splits.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
            <Card variant="elevated" style={sc.card}>
              <SectionTitle
                title="Splits"
                icon={<Wind color={theme.colors.primary} size={15} style={{ marginRight: 6 }} />}
                action={
                  canSwitchUnit ? (
                    <View style={sc.unitToggle}>
                      {(['km', 'mi'] as const).map(u => (
                        <TouchableOpacity
                          key={u}
                          onPress={() => setSplitUnit(u)}
                          style={[sc.unitOpt, splitUnit === u && sc.unitOptActive]}
                        >
                          <Typography style={[sc.unitOptText, splitUnit === u && sc.unitOptTextActive]}>{u.toUpperCase()}</Typography>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null
                }
              />
              <SplitsTable splits={splitUnit === 'mi' && splitsImperial.length ? splitsImperial : splits} unit={splitUnit} />
            </Card>
          </Animated.View>
        ) : null}

        {/* Laps */}
        {laps.length > 1 ? (
          <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
            <Card variant="elevated" style={sc.card}>
              <SectionTitle title={`Laps (${laps.length})`} icon={<Navigation color="#10b981" size={15} style={{ marginRight: 6 }} />} />
              <LapsTable laps={laps} type={act.type} />
            </Card>
          </Animated.View>
        ) : null}

        {/* Best Efforts */}
        {bestEfforts.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
            <Card variant="elevated" style={sc.card}>
              <SectionTitle title="Best Efforts" icon={<Trophy color="#f59e0b" size={15} style={{ marginRight: 6 }} />} />
              <BestEffortsSection efforts={bestEfforts} />
            </Card>
          </Animated.View>
        ) : null}

        {/* Power Deep-Dive */}
        {hasPower && (
          <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
            <Card variant="elevated" style={sc.card}>
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
          </Animated.View>
        )}

        {/* Relative Effort + Perceived Exertion */}
        {(act.sufferScore != null || perceivedExertion != null) && (
          <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
            <Card variant="elevated" style={sc.card}>
              <SectionTitle title="Effort & Exertion" icon={<Flame color="#ec4899" size={15} style={{ marginRight: 6 }} />} />
              <View style={{ flexDirection: 'row', gap: 16 }}>
                {act.sufferScore != null && (
                  <View style={{ flex: 1, alignItems: 'center', padding: 12, backgroundColor: '#ec489910', borderRadius: 12 }}>
                    <AnimatedNumber value={act.sufferScore} style={{ fontSize: 32, fontWeight: '900', color: '#ec4899' }} />
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
          </Animated.View>
        )}

        {/* Weather */}
        {hasWeather && (
          <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
            <Card variant="elevated" style={sc.card}>
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
          </Animated.View>
        )}

        {/* Social Stats */}
        {(kudos > 0 || achievements > 0 || photoCount > 0 || athleteCount > 1) && (
          <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
            <Card variant="elevated" style={sc.card}>
              <SectionTitle title="Activity Stats" icon={<Star color="#f59e0b" size={15} style={{ marginRight: 6 }} />} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <View style={sc.socialItem}>
                  <ThumbsUp color="#6366f1" size={20} />
                  <AnimatedNumber value={kudos} style={[sc.socialVal, { color: '#6366f1' }]} />
                  <Typography style={sc.socialLbl}>Kudos</Typography>
                </View>
                <View style={sc.socialItem}>
                  <MessageCircle color="#10b981" size={20} />
                  <AnimatedNumber value={comments} style={[sc.socialVal, { color: '#10b981' }]} />
                  <Typography style={sc.socialLbl}>Comments</Typography>
                </View>
                <View style={sc.socialItem}>
                  <Award color="#f59e0b" size={20} />
                  <AnimatedNumber value={achievements} style={[sc.socialVal, { color: '#f59e0b' }]} />
                  <Typography style={sc.socialLbl}>Achievements</Typography>
                </View>
                <View style={sc.socialItem}>
                  <Trophy color="#ef4444" size={20} />
                  <AnimatedNumber value={prCount} style={[sc.socialVal, { color: '#ef4444' }]} />
                  <Typography style={sc.socialLbl}>PRs</Typography>
                </View>
                {photoCount > 0 && (
                  <View style={sc.socialItem}>
                    <ImageIcon color="#8b5cf6" size={20} />
                    <AnimatedNumber value={photoCount} style={[sc.socialVal, { color: '#8b5cf6' }]} />
                    <Typography style={sc.socialLbl}>Photos</Typography>
                  </View>
                )}
                {athleteCount > 1 && (
                  <View style={sc.socialItem}>
                    <Users color="#a78bfa" size={20} />
                    <AnimatedNumber value={athleteCount} style={[sc.socialVal, { color: '#a78bfa' }]} />
                    <Typography style={sc.socialLbl}>Athletes</Typography>
                  </View>
                )}
              </View>
            </Card>
          </Animated.View>
        )}

        {/* Elevation Profile */}
        {(elevHigh != null && elevLow != null) && (
          <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
            <Card variant="elevated" style={sc.card}>
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
          </Animated.View>
        )}

        {/* Similar activities */}
        {similarActivities.length >= 3 && (
          <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
            <Card variant="elevated" style={sc.card}>
              <SectionTitle title="Similar Activities" icon={<BarChart2 color="#a78bfa" size={15} style={{ marginRight: 6 }} />} />
              <Typography style={{ fontSize: 13, color: theme.colors.textSecondary, marginBottom: 8 }}>
                {similarActivities.length + 1} {act.type.toLowerCase()}s with similar distance ({(act.distance / 1000 * 0.85).toFixed(1)}–{(act.distance / 1000 * 1.15).toFixed(1)} km)
              </Typography>
              {rankPercentile != null && (
                <View style={sc.percentileBar}>
                  <View style={[sc.percentileFill, { width: `${rankPercentile}%` }]}>
                    <LinearGradient
                      colors={['#10b981', '#6366f1']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ flex: 1 }}
                    />
                  </View>
                </View>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Typography style={{ fontSize: 11, color: theme.colors.textSecondary }}>Slowest</Typography>
                <Typography style={{ fontSize: 12, fontWeight: '700', color: '#10b981' }}>You: top {100 - (rankPercentile ?? 0)}%</Typography>
                <Typography style={{ fontSize: 11, color: theme.colors.textSecondary }}>Fastest</Typography>
              </View>
            </Card>
          </Animated.View>
        )}

        {/* Top Segments */}
        {segments.length > 0 && (
          <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
            <Card variant="elevated" style={sc.card}>
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
          </Animated.View>
        )}

        {/* Gear */}
        {gear && (
          <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
            <Card variant="elevated" style={sc.card}>
              <SectionTitle title="Gear" icon={<Shirt color="#8b5cf6" size={15} style={{ marginRight: 6 }} />} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {act.type === 'Ride' ? <Bike color="#8b5cf6" size={24} /> : <Footprints color="#8b5cf6" size={24} />}
                <View style={{ flex: 1 }}>
                  <Typography style={{ fontSize: 15, fontWeight: '700', color: theme.colors.text }}>{gear.name}</Typography>
                  <Typography style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 }}>{Math.round((gear.distance || 0) / 1000)} km on this gear</Typography>
                </View>
              </View>
            </Card>
          </Animated.View>
        )}

        {/* Device & Notes */}
        {(deviceName || description) && (
          <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
            <Card variant="elevated" style={sc.card}>
              <SectionTitle title="Details" icon={<Cpu color="#64748b" size={15} style={{ marginRight: 6 }} />} />
              {deviceName ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: description ? 10 : 0 }}>
                  <Cpu color={theme.colors.textSecondary} size={14} />
                  <Typography style={sc.detailText}>{deviceName}</Typography>
                </View>
              ) : null}
              {description ? <Typography style={[sc.detailText, { lineHeight: 20 }]}>{description}</Typography> : null}
            </Card>
          </Animated.View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const sc = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  hero: { padding: 20, paddingTop: 10, paddingBottom: 24 },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center',
    justifyContent: 'center', marginBottom: 14,
  },
  actType: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 },
  actName: { fontSize: 24, color: '#fff', fontWeight: '800', marginBottom: 4 },
  actDate: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 14 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 10, borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  heroRow: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 16, padding: 18 },
  heroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 4 },
  statBox: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 22, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: '600', marginTop: 3 },
  statSub: { fontSize: 9, color: 'rgba(255,255,255,0.45)' },

  rankPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', marginTop: 14,
    backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  rankText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.92)' },

  card: { margin: 16, marginTop: 0, marginBottom: 14 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sectionIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.3 },

  mapWrap: {
    height: MAP_H,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1f2030',
  },
  mapLegend: {
    position: 'absolute', top: 10, left: 12,
    flexDirection: 'row', gap: 12,
    backgroundColor: 'rgba(20,21,32,0.6)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: '700' },
  photo: { width: '100%', height: 220, borderRadius: 14 },

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

  unitToggle: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 2 },
  unitOpt: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  unitOptActive: { backgroundColor: theme.colors.primary },
  unitOptText: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary },
  unitOptTextActive: { color: '#fff' },

  effortRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  effortLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  effortTime: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginRight: 4 },
  effortPace: { fontSize: 12, color: theme.colors.textSecondary },
  prBadge: { backgroundColor: '#f59e0b22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 6 },
  prText: { fontSize: 10, fontWeight: '800', color: '#f59e0b' },

  socialItem: { alignItems: 'center', gap: 6, paddingVertical: 12, flexBasis: '31%', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, marginHorizontal: 3, marginBottom: 6 },
  socialVal: { fontSize: 22, fontWeight: '800' },
  socialLbl: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: '600' },

  percentileBar: { height: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' },
  percentileFill: { height: '100%', borderRadius: 4 },

  segRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  segName: { fontSize: 13, fontWeight: '700', color: theme.colors.text, flex: 1 },
  segMeta: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 3 },
  segTime: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  segRank: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },

  detailText: { fontSize: 13, color: theme.colors.text, fontWeight: '500' },
});
