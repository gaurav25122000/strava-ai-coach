import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Image, Platform, Animated as RNAnimated, RefreshControl,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { LineChart } from 'react-native-gifted-charts';
import { theme } from '../theme';
import { Typography } from '../components/Typography';
import { StaggerItem } from '../components/Stagger';
import { PressableScale } from '../components/PressableScale';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { WidgetCard } from '../components/WidgetCard';
import { SkeletonHero, SkeletonChart, SkeletonStatGrid } from '../components/SkeletonPresets';
import { Activity, useStore, HRZone } from '../store/useStore';
import { StravaService } from '../services/strava';
import { decodePolyline } from '../utils/polyline';
import { familyStyle, WidgetFamily } from '../utils/widgetFamilies';
import { chartBase, lineProps, pointerConfig } from '../utils/chartTheme';
import { sportIcon } from '../utils/sportIcon';
import { Icon } from '../components/Icon';
import {
  ArrowLeft, Clock, Heart, Zap, Mountain,
  Footprints, Flame, TrendingUp, Wind, MapPin, Trophy,
  ThumbsUp, MessageCircle, Award, Cpu, Bike, Shirt,
  Star, Navigation, BarChart2, Pause, Gauge, Users,
  Image as ImageIcon, Briefcase, Lock, Edit3, Cog,
  Thermometer, Medal, RefreshCw, CheckCircle2, AlertCircle, type LucideIcon,
} from 'lucide-react-native';
import { format, parseISO } from 'date-fns';

const { width } = Dimensions.get('window');
const MAP_H = 320;
const MAP_W = width;
const CHART_W = width - 40;

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

// Pick the right family for a given sport.
function familyForType(type: string): WidgetFamily {
  if (type === 'Workout') return 'records';
  return 'activity';
}

// ─── Type defs ────────────────────────────────────────────────────────────────
interface Props {
  activity: Activity;
  onClose: () => void;
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
    y: yOffset + (maxLat - c.latitude) * scale,
  }));
  let d = '';
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    d += `${i === 0 ? 'M' : ' L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }
  return { d, points };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Primary stat tile — full-bleed grid cell, no card chrome. Big bold value,
// family-accent uppercase label, gradient icon pill top-left. Pass
// `numericValue` so the number rolls in via AnimatedNumber instead of
// snapping; falls back to a static `value` string for formatted compounds.
function StatTile({
  icon: Icon, value, unit, label, accent, gradient, numericValue, decimals,
}: {
  icon: LucideIcon; value: string; unit?: string; label: string;
  accent: string; gradient: [string, string];
  numericValue?: number; decimals?: number;
}) {
  return (
    <View style={sc.statTile}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[sc.statTileIcon, theme.shadows.glow(accent)]}
      >
        <Icon size={16} color="#fff" />
      </LinearGradient>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 12 }}>
        {numericValue !== undefined ? (
          <AnimatedNumber value={numericValue} decimals={decimals ?? 0} style={sc.statTileVal} />
        ) : (
          <Typography style={sc.statTileVal}>{value}</Typography>
        )}
        {unit ? <Typography style={sc.statTileUnit}>{unit}</Typography> : null}
      </View>
      <Typography style={[sc.statTileLbl, { color: accent }]}>{label}</Typography>
    </View>
  );
}

// Secondary stat chip — horizontal-scroll row chip.
function SecondaryChip({
  icon: Icon, value, unit, label, accent,
}: {
  icon: LucideIcon; value: string; unit?: string; label: string; accent: string;
}) {
  return (
    <View style={[sc.secChip, { backgroundColor: accent + '14', borderColor: accent + '44' }]}>
      <Icon size={12} color={accent} />
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <Typography style={[sc.secChipVal, { color: '#fff' }]}>{value}</Typography>
        {unit ? <Typography style={[sc.secChipUnit, { color: accent }]}>{unit}</Typography> : null}
      </View>
      <Typography style={[sc.secChipLbl, { color: accent }]}>{label}</Typography>
    </View>
  );
}

// Achievement medal pill — gradient backdrop per medal type.
function MedalPill({
  icon: Icon, label, value, gradient,
}: { icon: LucideIcon; label: string; value: number | string; gradient: [string, string] }) {
  return (
    <PressableScale
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={sc.medalPill}
      >
        <Icon size={12} color="#fff" />
        <Typography style={sc.medalVal}>{value}</Typography>
        <Typography style={sc.medalLbl}>{label}</Typography>
      </LinearGradient>
    </PressableScale>
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
function HRZonesChart({
  splits,
  zones,
  activityZones,
}: {
  splits: any[];
  zones: HRZone[];
  activityZones?: Array<{ min: number; max: number; time: number }> | null;
}) {
  const usingStrava = Array.isArray(activityZones) && activityZones.length >= 5;
  const zoneSecs = [0, 0, 0, 0, 0];

  if (usingStrava) {
    activityZones!.slice(0, 5).forEach((b, i) => { zoneSecs[i] = b.time || 0; });
  } else {
    splits.forEach(s => {
      if (s.average_heartrate) {
        const z = getZoneIndex(s.average_heartrate, zones);
        zoneSecs[z] += s.moving_time || 0;
      }
    });
  }

  const total = zoneSecs.reduce((a, b) => a + b, 0) || 1;

  const fallback = FALLBACK_MINS;
  const mins = usingStrava
    ? activityZones!.slice(0, 5).map(b => b.min)
    : (zones.length >= 5 ? zones.map(z => z.min) : fallback);
  const maxes = usingStrava
    ? activityZones!.slice(0, 5).map(b => b.max > 0 ? b.max : 999)
    : (zones.length >= 5
      ? zones.map((_, i) => zones[i + 1] ? zones[i + 1].min - 1 : 999)
      : [114, 134, 154, 169, 999]);

  return (
    <View style={{ marginTop: 4 }}>
      {zoneSecs.map((secs, i) => {
        const pct = secs / total;
        const rangeLabel = maxes[i] < 999 ? `${mins[i]}–${maxes[i]} bpm` : `${mins[i]}+ bpm`;
        const c = ZONE_COLORS[i];
        return (
          <View key={i} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c }} />
                <Typography style={sc.zoneLabel}>{ZONE_LABELS[i]}</Typography>
                <Typography style={sc.zoneRange}>{rangeLabel}</Typography>
              </View>
              <Typography style={sc.zoneTime}>
                {secsToMMSS(secs)} ({Math.round(pct * 100)}%)
              </Typography>
            </View>
            <View style={{ height: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 7, overflow: 'hidden' }}>
              <LinearGradient
                colors={[c, c + 'CC']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ width: `${pct * 100}%`, height: '100%', borderRadius: 7 }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Km-by-Km Splits Visual ───────────────────────────────────────────────────
function SplitsVisual({
  splits, unit, family,
}: { splits: any[]; unit: 'km' | 'mi'; family: WidgetFamily }) {
  if (!splits?.length) return null;
  const fam = familyStyle(family);
  const factor = unit === 'mi' ? 1609.34 : 1000;
  const paces = splits.map(s => s.moving_time && s.distance
    ? s.moving_time / (s.distance / factor) : 0);
  const valid = paces.filter(Boolean);
  if (!valid.length) return null;

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = Math.max(max - min, 1);

  function colorFor(pace: number): string {
    if (!pace) return theme.colors.border;
    const t = (pace - min) / range;
    const a = hexToRgb(fam.accent);
    const b = hexToRgb('#EF4444');
    const r = Math.round(a.r + (b.r - a.r) * t);
    const g = Math.round(a.g + (b.g - a.g) * t);
    const bl = Math.round(a.b + (b.b - a.b) * t);
    return `rgb(${r},${g},${bl})`;
  }

  return (
    <View>
      {splits.slice(0, 30).map((s, i) => {
        const pace = paces[i];
        if (!pace) {
          return (
            <PressableScale key={i} haptic="selection" style={sc.splitVizRow} accessibilityLabel={`Split ${i + 1}`}>
              <View style={[sc.splitVizIdxBox, { backgroundColor: fam.tint, borderColor: fam.accent + '55' }]}>
                <Typography style={[sc.splitVizIdx, { color: fam.accent }]}>{i + 1}</Typography>
              </View>
              <Typography style={[sc.splitVizPace, { color: theme.colors.textSecondary }]}>--</Typography>
            </PressableScale>
          );
        }
        const t = (pace - min) / range;
        const widthPct = 35 + (1 - t) * 65;
        const c = colorFor(pace);
        return (
          <PressableScale key={i} haptic="selection" style={sc.splitVizRow} accessibilityLabel={`Split ${i + 1}, ${secsToMMSS(Math.round(pace))} per ${unit}`}>
            <View style={[sc.splitVizIdxBox, { backgroundColor: fam.tint, borderColor: fam.accent + '55' }]}>
              <Typography style={[sc.splitVizIdx, { color: fam.accent }]}>{i + 1}</Typography>
            </View>
            <View style={sc.splitVizBarWrap}>
              <LinearGradient
                colors={[c, c + 'AA']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[sc.splitVizBar, { width: `${widthPct}%` }]}
              />
            </View>
            <View style={sc.splitVizMetrics}>
              <Typography style={[sc.splitVizPace, { color: c }]}>
                {secsToMMSS(Math.round(pace))}
              </Typography>
              {s.average_heartrate ? (
                <View style={sc.splitVizHrChip}>
                  <Icon icon={Heart} variant="plain" size="xs" color="#EF4444" />
                  <Typography style={sc.splitVizHr}>{Math.round(s.average_heartrate)}</Typography>
                </View>
              ) : null}
              {s.elevation_difference != null ? (
                <Typography style={sc.splitVizElev}>
                  {s.elevation_difference > 0 ? '+' : ''}{Math.round(s.elevation_difference)}m
                </Typography>
              ) : null}
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

function hexToRgb(hex: string) {
  const m = hex.replace('#', '');
  return {
    r: parseInt(m.slice(0, 2), 16),
    g: parseInt(m.slice(2, 4), 16),
    b: parseInt(m.slice(4, 6), 16),
  };
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
      {shown.map((e, i) => {
        const isPR = e.pr_rank === 1;
        const MedalIcon = isPR ? Trophy : Star;
        const medalColor = isPR ? '#FCD34D' : theme.colors.textSecondary;
        const paceStr = e.elapsed_time && e.distance
          ? `${secsToMMSS(Math.round(e.elapsed_time / (e.distance / 1000)))} /km`
          : '';
        return (
          <PressableScale key={i} haptic="selection" style={sc.effortRow} accessibilityLabel={`${DIST_LABELS[e.distance]} best effort`}>
            <View style={[sc.effortMedal, { backgroundColor: medalColor + '22', borderColor: medalColor + '66' }]}>
              <Icon icon={MedalIcon} variant="plain" size="md" color={medalColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Typography style={sc.effortLabel}>
                {DIST_LABELS[e.distance] || `${(e.distance / 1000).toFixed(1)}K`}
              </Typography>
              {paceStr ? <Typography style={sc.effortPace}>{paceStr}</Typography> : null}
            </View>
            <Typography style={sc.effortTime}>{secsToMMSS(e.elapsed_time)}</Typography>
            {isPR && (
              <View style={[sc.deltaChip, { backgroundColor: '#10B98122', borderColor: '#10B98166' }]}>
                <Typography style={[sc.deltaChipText, { color: '#10B981' }]}>PR</Typography>
              </View>
            )}
          </PressableScale>
        );
      })}
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
          <PressableScale key={i} haptic="selection" style={sc.splitRow} accessibilityLabel={`Lap ${i + 1}`}>
            <Typography style={[sc.splitCell, { flex: 0.4 }]}>{i + 1}</Typography>
            <Typography style={[sc.splitCell, { flex: 1.2, color: isFast ? theme.colors.primary : theme.colors.text }]}>
              {isRide ? `${speedKmh} km/h` : (pace ? secsToMMSS(Math.round(pace)) + ' /km' : '--')}
            </Typography>
            <Typography style={[sc.splitCell, { flex: 0.8, color: theme.colors.textSecondary }]}>
              {l.distance ? (l.distance / 1000).toFixed(2) : '--'} km
            </Typography>
            <Typography style={[sc.splitCell, { flex: 0.7, color: '#EF4444' }]}>
              {l.average_heartrate ? Math.round(l.average_heartrate) : '--'}
            </Typography>
            <Typography style={[sc.splitCell, { flex: 0.7, textAlign: 'right', color: theme.colors.textSecondary }]}>
              {l.total_elevation_gain != null ? `+${Math.round(l.total_elevation_gain)}m` : '-'}
            </Typography>
          </PressableScale>
        );
      })}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function ActivityDetailScreen({ activity: act, onClose }: Props) {
  const { hrZones, activities, setActivityZones } = useStore();
  const [detail, setDetail] = useState<any>(null);
  const [streams, setStreams] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [splitUnit, setSplitUnit] = useState<'km' | 'mi'>('km');
  const scrollY = useMemo(() => new RNAnimated.Value(0), []);
  const spin = useMemo(() => new RNAnimated.Value(0), []);

  const liveAct = useMemo(
    () => activities.find(a => a.id === act.id) ?? act,
    [activities, act],
  );
  const activityHrZones = liveAct.zones?.find(z => z.type === 'heartrate')?.buckets ?? null;

  // Light tactile cue on landing — this screen is the most "rewarding" arrival.
  useEffect(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, []);

  // Spin the nav refresh icon while a fetch is in flight so the disabled state
  // reads as in-progress rather than dead.
  useEffect(() => {
    if (refreshing || loading) {
      const loop = RNAnimated.loop(
        RNAnimated.timing(spin, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      );
      loop.start();
      return () => { loop.stop(); spin.setValue(0); };
    }
  }, [refreshing, loading, spin]);
  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const loadFromStrava = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([
        StravaService.fetchActivityDetail(act.id),
        StravaService.fetchActivityStreams(act.id),
      ]);
      setDetail(d);
      setStreams(s);
      setFetchStatus('ok');
      setFetchedAt(new Date().toISOString());
    } catch {
      setDetail(null);
      setFetchStatus('error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }

    // Zones fetch is independent — silent failure is acceptable since the
    // primary detail/streams fetch already drives the visible status.
    try {
      const res = await StravaService.fetchActivityZones(act.id);
      if (Array.isArray(res)) {
        const mapped = res
          .filter(z => z.type === 'heartrate' || z.type === 'power')
          .map(z => ({
            type: z.type,
            buckets: (z.distribution_buckets ?? []).map(b => ({ min: b.min, max: b.max, time: b.time })),
            fetchedAt: new Date().toISOString(),
          }));
        if (mapped.length > 0) setActivityZones(act.id, mapped);
      }
    } catch {
      // ignore — zones are optional
    }
  }, [act.id, setActivityZones]);

  useEffect(() => {
    setLoading(true);
    setFetchStatus('idle');
    loadFromStrava();
  }, [act.id, loadFromStrava]);

  const onRefresh = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    setRefreshing(true);
    setFetchStatus('idle');
    loadFromStrava();
  }, [loadFromStrava]);

  const km = act.distance / 1000;
  const family = familyForType(act.type);
  const fam = familyStyle(family);
  const isRide = act.type === 'Ride';

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
  const locationName = detail?.location_city || detail?.location_state || detail?.location_country || '';
  const workoutType = detail?.workout_type;
  const workoutLabel = workoutType === 1 ? 'Race' : workoutType === 2 ? 'Long Run' : workoutType === 3 ? 'Workout' : null;
  const workoutIcon = workoutType === 1
    ? <Icon icon={Flame} variant="plain" size="xs" color="#EF4444" />
    : workoutType === 2
      ? <Icon icon={Footprints} variant="plain" size="xs" color="#3B82F6" />
      : workoutType === 3
        ? <Icon icon={Zap} variant="plain" size="xs" color="#F59E0B" />
        : null;
  const workoutColor = workoutType === 1 ? '#EF4444' : workoutType === 2 ? '#3B82F6' : workoutType === 3 ? '#F59E0B' : '#94A3B8';

  const isCommute = !!detail?.commute;
  const isManual = !!detail?.manual;
  const isPrivate = !!detail?.private;
  const isTrainer = !!detail?.trainer;

  const athleteCount = detail?.athlete_count ?? 1;
  const photoCount = detail?.total_photo_count ?? detail?.photo_count ?? 0;
  const photoUrl = detail?.photos?.primary?.urls?.['600'] || detail?.photos?.primary?.urls?.['100'] || null;

  const calories = detail?.calories ?? act.calories;
  const avgWatts = detail?.average_watts ?? act.averageWatts;
  const weightedWatts = detail?.weighted_average_watts;
  const maxWatts = detail?.max_watts;
  const kilojoules = detail?.kilojoules;
  const hasPower = !!(avgWatts || weightedWatts);
  const maxSpeed = detail?.max_speed ?? act.maxSpeed;
  const avgSpeedKmh = act.averageSpeed ? act.averageSpeed * 3.6 : 0;
  const maxSpeedKmh = maxSpeed ? maxSpeed * 3.6 : 0;
  const weatherTemp = detail?.weather_temp;
  const weatherHumidity = detail?.weather_humidity;
  const weatherWindspeed = detail?.weather_windspeed;
  const weatherCondition = detail?.weather_condition;
  const deviceTemp = detail?.average_temp;
  const hasWeather = weatherTemp != null || weatherCondition || deviceTemp != null;
  const perceivedExertion = detail?.perceived_exertion;
  const splitPaces = splits.map(s => s.moving_time && s.distance ? s.moving_time / (s.distance / 1000) : 0).filter(Boolean);
  const minSplitPace = splitPaces.length ? Math.min(...splitPaces) : 0;
  const maxSplitPace = splitPaces.length ? Math.max(...splitPaces) : 0;

  const hasRest = act.elapsedTime > act.movingTime + 30;
  const restLabel = formatRest(act.elapsedTime, act.movingTime);

  const polylineStr: string = detail?.map?.summary_polyline || detail?.map?.polyline || '';
  const coords = useMemo(() => decodePolyline(polylineStr), [polylineStr]);
  const projected = useMemo(() => projectRoute(coords, MAP_W, MAP_H, 24), [coords]);

  const hrChartData = useMemo(() => {
    const arr: number[] | undefined = streams?.heartrate?.data;
    if (!arr?.length) return [];
    const target = 80;
    const step = Math.max(1, Math.floor(arr.length / target));
    const out: { value: number; label?: string }[] = [];
    for (let i = 0; i < arr.length; i += step) {
      out.push({ value: arr[i] });
    }
    return out;
  }, [streams]);

  const elevChartData = useMemo(() => {
    const arr: number[] | undefined = streams?.altitude?.data;
    if (!arr?.length) return [];
    const target = 80;
    const step = Math.max(1, Math.floor(arr.length / target));
    const out: { value: number }[] = [];
    for (let i = 0; i < arr.length; i += step) {
      out.push({ value: Math.round(arr[i]) });
    }
    return out;
  }, [streams]);

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

  const canSwitchUnit = splitsImperial.length > 0;

  const navOpacity = scrollY.interpolate({
    inputRange: [MAP_H - 120, MAP_H - 40],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const navTitleOpacity = scrollY.interpolate({
    inputRange: [MAP_H - 80, MAP_H - 20],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Hero parallax — driven entirely by the existing scrollY value (no new
  // listener). Translates the map at ~0.5x as content scrolls up, and scales
  // it up on pull-down overscroll so the route zooms toward the user.
  const heroTranslateY = scrollY.interpolate({
    inputRange: [-MAP_H, 0, MAP_H],
    outputRange: [MAP_H / 2, 0, -MAP_H / 3],
    extrapolate: 'clamp',
  });
  const heroScale = scrollY.interpolate({
    inputRange: [-MAP_H, 0],
    outputRange: [1.6, 1],
    extrapolate: 'clamp',
  });

  // Deterministic stagger order — increments only for sections that actually
  // render, so a missing section never leaves a gap in the cascade rhythm.
  let stagger = 0;
  const next = () => stagger++;

  // ─── Pre-compute primary stat tiles so we always render 2x3 grid ────────
  const primaryStats: Array<{ icon: LucideIcon; value: string; unit?: string; label: string; accent: string; gradient: [string, string]; numericValue?: number; decimals?: number }> = [
    {
      icon: MapPin, value: km.toFixed(2), unit: 'KM',
      numericValue: km, decimals: 2,
      label: 'DISTANCE', accent: fam.accent, gradient: fam.gradient,
    },
    {
      icon: Clock, value: formatDuration(act.movingTime),
      label: 'MOVING', accent: fam.accent, gradient: fam.gradient,
    },
    {
      icon: TrendingUp,
      value: isRide ? avgSpeedKmh.toFixed(1) : formatPace(act.averageSpeed),
      unit: isRide ? 'KM/H' : '/KM',
      // Pace is a "mm:ss" compound — leave it static. Speed is numeric, so
      // roll the number when the activity is a ride.
      numericValue: isRide ? avgSpeedKmh : undefined,
      decimals: 1,
      label: isRide ? 'AVG SPEED' : 'AVG PACE',
      accent: '#FCD34D', gradient: theme.colors.gradients.records,
    },
    {
      icon: Heart,
      value: act.averageHeartRate ? `${Math.round(act.averageHeartRate)}` : '--',
      numericValue: act.averageHeartRate ? Math.round(act.averageHeartRate) : undefined,
      unit: act.averageHeartRate ? 'BPM' : undefined,
      label: 'AVG HR', accent: '#EF4444', gradient: theme.colors.gradients.health,
    },
    {
      icon: Flame,
      value: calories ? `${Math.round(calories)}` : '--',
      numericValue: calories ? Math.round(calories) : undefined,
      unit: calories ? 'KCAL' : undefined,
      label: 'CALORIES', accent: '#EF4444', gradient: theme.colors.gradients.health,
    },
    {
      icon: Mountain,
      value: `${Math.round(act.totalElevationGain)}`,
      numericValue: Math.round(act.totalElevationGain),
      unit: 'M', label: 'ELEVATION', accent: fam.accent, gradient: fam.gradient,
    },
  ];

  // ─── Secondary chips list ───────────────────────────────────────────────
  const secondaryChips: Array<{ icon: LucideIcon; value: string; unit?: string; label: string; accent: string; show: boolean }> = [
    { icon: Pause, value: restLabel, label: 'PAUSED', accent: '#94A3B8', show: hasRest },
    { icon: Gauge, value: maxSpeedKmh.toFixed(1), unit: 'KM/H', label: 'MAX SPEED', accent: '#10B981', show: maxSpeedKmh > 0 },
    { icon: Heart, value: act.maxHeartRate ? `${Math.round(act.maxHeartRate)}` : '', unit: 'BPM', label: 'MAX HR', accent: '#F97316', show: !!act.maxHeartRate },
    {
      icon: Footprints,
      value: act.averageCadence ? `${Math.round(act.averageCadence * (act.type === 'Run' ? 2 : 1))}` : '',
      unit: 'SPM', label: 'CADENCE', accent: '#10B981', show: !!act.averageCadence,
    },
    { icon: Zap, value: avgWatts ? `${Math.round(avgWatts)}` : '', unit: 'W', label: 'AVG POWER', accent: '#F97316', show: !!avgWatts },
    { icon: Flame, value: act.sufferScore != null ? `${act.sufferScore}` : '', label: 'SUFFER', accent: '#EC4899', show: act.sufferScore != null },
    { icon: Flame, value: kilojoules ? `${Math.round(kilojoules)}` : '', unit: 'KJ', label: 'ENERGY', accent: '#F97316', show: !!kilojoules },
    { icon: Thermometer, value: deviceTemp != null ? `${deviceTemp}°C` : '', label: 'SENSOR TEMP', accent: '#FB923C', show: deviceTemp != null },
  ];
  const visibleSecondary = secondaryChips.filter(c => c.show);

  return (
    <View style={sc.container}>
      {/* Sticky nav — fades in on scroll */}
      <RNAnimated.View style={[sc.navBar, { opacity: navOpacity }]} pointerEvents="none">
        <LinearGradient
          colors={['rgba(15,16,24,0.92)', 'rgba(15,16,24,0.78)']}
          style={StyleSheet.absoluteFillObject}
        />
      </RNAnimated.View>
      <SafeAreaView style={sc.navSafeArea} edges={['top']} pointerEvents="box-none">
        <View style={sc.navRow} pointerEvents="box-none">
          <TouchableOpacity
            onPress={onClose}
            style={sc.navBackBtn}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={6}
          >
            <Icon icon={ArrowLeft} variant="plain" size="md" color="#fff" />
          </TouchableOpacity>
          <RNAnimated.View style={{ opacity: navTitleOpacity, flex: 1 }} pointerEvents="none">
            <Typography style={sc.navTitle} numberOfLines={1}>
              {act.name || act.type}
            </Typography>
          </RNAnimated.View>
          <TouchableOpacity
            onPress={onRefresh}
            style={sc.navBackBtn}
            activeOpacity={0.8}
            disabled={refreshing || loading}
            accessibilityRole="button"
            accessibilityLabel="Refresh activity"
            accessibilityState={{ busy: refreshing || loading }}
            hitSlop={6}
          >
            <RNAnimated.View style={{ transform: [{ rotate: spinDeg }] }}>
              <Icon
                icon={RefreshCw}
                variant="plain"
                size="md"
                color={refreshing || loading ? 'rgba(255,255,255,0.4)' : '#fff'}
              />
            </RNAnimated.View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <RNAnimated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 48 }}
        onScroll={RNAnimated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={fam.accent}
            colors={[fam.accent]}
          />
        }
      >
        {/* ── Hero: full-bleed map + strong overlay + bold title ──────────── */}
        <View style={sc.heroWrap}>
          <RNAnimated.View
            style={{
              transform: [{ translateY: heroTranslateY }, { scale: heroScale }],
            }}
          >
          {projected.points.length > 1 ? (
            <View style={{ width: MAP_W, height: MAP_H }}>
              <LinearGradient
                colors={[theme.colors.surfaceMuted, theme.colors.background]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <Svg width={MAP_W} height={MAP_H}>
                <Defs>
                  <SvgLinearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={fam.gradient[0]} stopOpacity="1" />
                    <Stop offset="1" stopColor={fam.gradient[1]} stopOpacity="1" />
                  </SvgLinearGradient>
                </Defs>
                <Path
                  d={projected.d}
                  stroke={fam.accent}
                  strokeOpacity={0.28}
                  strokeWidth={10}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Path
                  d={projected.d}
                  stroke="url(#routeGrad)"
                  strokeWidth={4}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Circle
                  cx={projected.points[0].x}
                  cy={projected.points[0].y}
                  r={6}
                  fill="#10B981"
                  stroke="#fff"
                  strokeWidth={2}
                />
                <Circle
                  cx={projected.points[projected.points.length - 1].x}
                  cy={projected.points[projected.points.length - 1].y}
                  r={6}
                  fill="#EF4444"
                  stroke="#fff"
                  strokeWidth={2}
                />
              </Svg>
            </View>
          ) : (
            <LinearGradient
              colors={fam.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ width: MAP_W, height: MAP_H, alignItems: 'center', justifyContent: 'center' }}
            >
              {/* No-GPS hero (treadmill / manual): centred low-opacity sport
                  glyph so the fallback reads as intentional, not broken. */}
              <View style={{ opacity: 0.18 }}>
                {sportIcon(act.type, 120, '#fff')}
              </View>
            </LinearGradient>
          )}
          </RNAnimated.View>

          {/* Strong dark overlay bottom-up */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.95)']}
            locations={[0, 0.55, 1]}
            style={sc.heroOverlay}
            pointerEvents="none"
          />

          {/* Top-left: sport pill */}
          <SafeAreaView style={sc.heroTopOverlay} edges={['top']} pointerEvents="box-none">
            <View style={sc.heroTopRow} pointerEvents="box-none">
              <View style={{ width: 44 }} />
              <LinearGradient
                colors={fam.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[sc.sportPillBig, theme.shadows.glow(fam.accent)]}
              >
                {sportIcon(act.type, 14, '#fff')}
                <Typography style={sc.sportPillBigText}>{act.type.toUpperCase()}</Typography>
              </LinearGradient>

              {/* Top-right medal counts compact */}
              <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }}>
                {prCount > 0 && (
                  <View style={[sc.medalCount, { backgroundColor: 'rgba(252,211,77,0.18)', borderColor: 'rgba(252,211,77,0.55)' }]}>
                    <Icon icon={Trophy} variant="plain" size="xs" color="#FCD34D" />
                    <Typography style={[sc.medalCountText, { color: '#FCD34D' }]}>{prCount}</Typography>
                  </View>
                )}
                {achievements > 0 && (
                  <View style={[sc.medalCount, { backgroundColor: 'rgba(249,115,22,0.18)', borderColor: 'rgba(249,115,22,0.55)' }]}>
                    <Icon icon={Award} variant="plain" size="xs" color="#F97316" />
                    <Typography style={[sc.medalCountText, { color: '#F97316' }]}>{achievements}</Typography>
                  </View>
                )}
                {kudos > 0 && (
                  <View style={[sc.medalCount, { backgroundColor: 'rgba(236,72,153,0.18)', borderColor: 'rgba(236,72,153,0.55)' }]}>
                    <Icon icon={ThumbsUp} variant="plain" size="xs" color="#EC4899" />
                    <Typography style={[sc.medalCountText, { color: '#EC4899' }]}>{kudos}</Typography>
                  </View>
                )}
              </View>
            </View>
          </SafeAreaView>

          {/* Hero text — bottom-left */}
          <View style={sc.heroContent} pointerEvents="none">
            <Typography style={sc.heroName} numberOfLines={2}>
              {act.name || act.type}
            </Typography>
            <View style={sc.heroDateRow}>
              {locationName ? (
                <>
                  <Icon icon={MapPin} variant="plain" size="xs" color="rgba(255,255,255,0.85)" />
                  <Typography style={sc.heroDate}>{locationName.toUpperCase()}</Typography>
                  <View style={[sc.metaDot, { backgroundColor: 'rgba(255,255,255,0.4)' }]} />
                </>
              ) : null}
              <Typography style={sc.heroDate}>
                {format(parseISO(act.startDate), 'EEE, MMM d · h:mm a').toUpperCase()}
              </Typography>
            </View>
          </View>
        </View>

        {/* Status badges */}
        {(workoutLabel || isCommute || isManual || isPrivate || isTrainer || athleteCount > 1) && (
          <View style={sc.badgeRow}>
            {workoutLabel && <Badge icon={workoutIcon} label={workoutLabel} color={workoutColor} />}
            {athleteCount > 1 && <Badge icon={<Icon icon={Users} variant="plain" size="xs" color="#A78BFA" />} label={`Group (${athleteCount})`} color="#A78BFA" />}
            {isCommute && <Badge icon={<Icon icon={Briefcase} variant="plain" size="xs" color="#60A5FA" />} label="Commute" color="#60A5FA" />}
            {isTrainer && <Badge icon={<Icon icon={Cog} variant="plain" size="xs" color="#FBBF24" />} label="Trainer" color="#FBBF24" />}
            {isManual && <Badge icon={<Icon icon={Edit3} variant="plain" size="xs" color="#F87171" />} label="Manual entry" color="#F87171" />}
            {isPrivate && <Badge icon={<Icon icon={Lock} variant="plain" size="xs" color="#9CA3AF" />} label="Private" color="#9CA3AF" />}
          </View>
        )}

        {/* Medal row (PRs / Achievements / Kudos / etc.) full-width below hero */}
        {(achievements > 0 || prCount > 0 || kudos > 0 || comments > 0) && (
          <StaggerItem index={next()}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={sc.medalRow}
            >
              {prCount > 0 && (
                <MedalPill icon={Trophy} label="PRs" value={prCount} gradient={theme.colors.gradients.records} />
              )}
              {achievements > 0 && (
                <MedalPill icon={Award} label="Achievements" value={achievements} gradient={theme.colors.gradients.activity} />
              )}
              {kudos > 0 && (
                <MedalPill icon={ThumbsUp} label="Kudos" value={kudos} gradient={theme.colors.gradients.social} />
              )}
              {comments > 0 && (
                <MedalPill icon={MessageCircle} label="Comments" value={comments} gradient={theme.colors.gradients.recovery} />
              )}
              {rankPercentile != null && similarActivities.length >= 3 && (
                <MedalPill
                  icon={Medal}
                  label={`Top ${100 - rankPercentile}%`}
                  value={`${act.type}s`}
                  gradient={theme.colors.gradients.plan}
                />
              )}
            </ScrollView>
          </StaggerItem>
        )}

        {/* ── Primary stat grid (full-bleed 2x3) ──────────────────────────── */}
        <StaggerItem index={next()}>
          <View style={sc.primaryGrid}>
            {primaryStats.map((stat, i) => (
              <View
                key={i}
                style={[
                  sc.primaryGridCell,
                  // Right divider on left column (i % 2 === 0)
                  i % 2 === 0 ? sc.primaryGridCellRightDiv : null,
                  // Bottom divider except last row (i < 4)
                  i < 4 ? sc.primaryGridCellBottomDiv : null,
                ]}
              >
                <StatTile
                  icon={stat.icon}
                  value={stat.value}
                  unit={stat.unit}
                  label={stat.label}
                  accent={stat.accent}
                  gradient={stat.gradient}
                  numericValue={stat.numericValue}
                  decimals={stat.decimals}
                />
              </View>
            ))}
          </View>
        </StaggerItem>

        {/* ── Secondary stats: horizontal-scroll chip row ─────────────────── */}
        {visibleSecondary.length > 0 && (
          <StaggerItem index={next()}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={sc.secScroll}
              style={{ marginTop: 18 }}
            >
              {visibleSecondary.map((c, i) => (
                <SecondaryChip
                  key={i}
                  icon={c.icon}
                  value={c.value}
                  unit={c.unit}
                  label={c.label}
                  accent={c.accent}
                />
              ))}
            </ScrollView>
          </StaggerItem>
        )}

        {/* Strava sync status pill — shows whether detail/streams were
            fetched, when, or that it failed. Refresh from the nav button
            or pull-to-refresh. */}
        {!loading && fetchStatus !== 'idle' && (
          <View style={sc.syncStatusRow}>
            <View
              style={[
                sc.syncStatusPill,
                {
                  backgroundColor:
                    fetchStatus === 'ok' ? '#10B98122' : '#EF444422',
                  borderColor:
                    fetchStatus === 'ok' ? '#10B98166' : '#EF444466',
                },
              ]}
            >
              <Icon
                icon={fetchStatus === 'ok' ? CheckCircle2 : AlertCircle}
                variant="plain"
                size="xs"
                color={fetchStatus === 'ok' ? '#10B981' : '#EF4444'}
              />
              <Typography
                style={[
                  sc.syncStatusText,
                  { color: fetchStatus === 'ok' ? '#10B981' : '#EF4444' },
                ]}
              >
                {fetchStatus === 'ok'
                  ? `Strava details synced${fetchedAt ? ` · ${format(parseISO(fetchedAt), 'h:mm a')}` : ''}`
                  : 'Strava sync failed — tap refresh to retry'}
              </Typography>
            </View>
          </View>
        )}

        {/* Loading skeleton when detail/streams still loading */}
        {loading && (
          <View style={{ marginTop: 28, gap: 24 }}>
            <SkeletonHero />
            <SkeletonStatGrid rows={2} cols={3} />
            <SkeletonChart height={180} />
            <SkeletonChart height={180} />
          </View>
        )}

        {/* Spacer before the first widget card */}
        {!loading && <View style={{ height: 18 }} />}

        {/* ── Photo ──────────────────────────────────────────────────────── */}
        {photoUrl && (
          <StaggerItem index={next()} style={sc.widgetGap}>
            <WidgetCard
              family="social"
              title={photoCount > 1 ? `Photos (${photoCount})` : 'Photo'}
              icon={ImageIcon}
            >
              <Image source={{ uri: photoUrl }} style={sc.photo} resizeMode="cover" />
            </WidgetCard>
          </StaggerItem>
        )}

        {/* ── HR Chart from stream ───────────────────────────────────────── */}
        {hrChartData.length > 1 && (
          <StaggerItem index={next()} style={sc.widgetGap}>
            <WidgetCard
              family="health"
              title="Heart Rate"
              caption={act.averageHeartRate ? `Avg ${Math.round(act.averageHeartRate)} bpm` : undefined}
              icon={Heart}
            >
              <View style={{ overflow: 'hidden', marginTop: 4 }}>
                <LineChart
                  {...lineProps('health')}
                  thickness={4}
                  data={hrChartData}
                  height={180}
                  width={CHART_W}
                  initialSpacing={4}
                  endSpacing={4}
                  spacing={Math.max(CHART_W / hrChartData.length, 3)}
                  maxValue={Math.ceil(Math.max(...hrChartData.map(d => d.value)) * 1.1)}
                  pointerConfig={pointerConfig('bpm', 'health')}
                  showReferenceLine1={!!act.maxHeartRate}
                  referenceLine1Position={act.maxHeartRate}
                  referenceLine1Config={{
                    color: '#EF4444',
                    dashWidth: 4,
                    dashGap: 4,
                    thickness: 1.5,
                    labelText: 'MAX',
                    labelTextStyle: { color: '#EF4444', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
                  }}
                  {...chartBase({ family: 'health' })}
                />
              </View>
            </WidgetCard>
          </StaggerItem>
        )}

        {/* ── HR Zones ───────────────────────────────────────────────────── */}
        {splits.length > 0 && act.averageHeartRate ? (
          <StaggerItem index={next()} style={sc.widgetGap}>
            <WidgetCard
              family="health"
              title="Heart Rate Zones"
              icon={Heart}
            >
              <View style={{ flexDirection: 'row', gap: 14, marginBottom: 18 }}>
                <View style={sc.hrStat}>
                  <Typography style={[sc.hrStatVal, { color: '#EF4444' }]}>{Math.round(act.averageHeartRate)}</Typography>
                  <Typography style={sc.hrStatUnit}>BPM</Typography>
                  <Typography style={sc.hrStatLbl}>AVG</Typography>
                </View>
                {act.maxHeartRate ? (
                  <View style={sc.hrStat}>
                    <Typography style={[sc.hrStatVal, { color: '#F97316' }]}>{Math.round(act.maxHeartRate)}</Typography>
                    <Typography style={sc.hrStatUnit}>BPM</Typography>
                    <Typography style={sc.hrStatLbl}>PEAK</Typography>
                  </View>
                ) : null}
              </View>
              <HRZonesChart splits={splits} zones={hrZones} activityZones={activityHrZones} />
              {activityHrZones && (
                <View style={sc.liveStravaPill}>
                  <Icon icon={Zap} variant="plain" size="xs" color="#FB923C" />
                  <Typography style={sc.liveStravaText}>LIVE FROM STRAVA</Typography>
                </View>
              )}
            </WidgetCard>
          </StaggerItem>
        ) : null}

        {/* ── Elevation Chart from stream ────────────────────────────────── */}
        {elevChartData.length > 1 && (
          <StaggerItem index={next()} style={sc.widgetGap}>
            <WidgetCard
              family="activity"
              title="Elevation"
              caption={elevHigh != null && elevLow != null
                ? `${Math.round(elevHigh - (elevLow ?? 0))}m gain · Peak ${Math.round(elevHigh)}m`
                : undefined}
              icon={Mountain}
            >
              <View style={{ overflow: 'hidden', marginTop: 4 }}>
                <LineChart
                  {...lineProps('activity')}
                  thickness={4}
                  startOpacity={0.7}
                  endOpacity={0.05}
                  data={elevChartData}
                  height={180}
                  width={CHART_W}
                  initialSpacing={4}
                  endSpacing={4}
                  spacing={Math.max(CHART_W / elevChartData.length, 3)}
                  maxValue={Math.ceil(Math.max(...elevChartData.map(d => d.value)) * 1.05)}
                  pointerConfig={pointerConfig('m', 'activity')}
                  {...chartBase({ family: 'activity' })}
                />
              </View>
              {elevHigh != null && elevLow != null && (
                <View style={sc.elevChipRow}>
                  <View style={[sc.elevChip, { backgroundColor: '#F59E0B22', borderColor: '#F59E0B66' }]}>
                    <Typography style={[sc.elevChipVal, { color: '#F59E0B' }]}>{Math.round(elevHigh)}m</Typography>
                    <Typography style={sc.elevChipLbl}>PEAK</Typography>
                  </View>
                  <View style={[sc.elevChip, { backgroundColor: '#10B98122', borderColor: '#10B98166' }]}>
                    <Typography style={[sc.elevChipVal, { color: '#10B981' }]}>{Math.round(elevLow)}m</Typography>
                    <Typography style={sc.elevChipLbl}>LOW</Typography>
                  </View>
                  <View style={[sc.elevChip, { backgroundColor: fam.accent + '22', borderColor: fam.accent + '66' }]}>
                    <Typography style={[sc.elevChipVal, { color: fam.accent }]}>{Math.round((elevHigh ?? 0) - (elevLow ?? 0))}m</Typography>
                    <Typography style={sc.elevChipLbl}>NET GAIN</Typography>
                  </View>
                </View>
              )}
            </WidgetCard>
          </StaggerItem>
        )}

        {/* Elevation summary card — only when we DON'T have a stream */}
        {(elevHigh != null && elevLow != null && elevChartData.length <= 1) && (
          <StaggerItem index={next()} style={sc.widgetGap}>
            <WidgetCard family="activity" title="Elevation" icon={Mountain}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                <View style={sc.miniStat}>
                  <Typography style={[sc.miniStatVal, { color: '#F59E0B' }]}>{Math.round(elevHigh)}m</Typography>
                  <Typography style={sc.miniStatLbl}>Peak</Typography>
                </View>
                <View style={sc.miniStat}>
                  <Typography style={[sc.miniStatVal, { color: '#10B981' }]}>{Math.round(elevLow)}m</Typography>
                  <Typography style={sc.miniStatLbl}>Lowest</Typography>
                </View>
                <View style={sc.miniStat}>
                  <Typography style={[sc.miniStatVal, { color: fam.accent }]}>{Math.round((elevHigh ?? 0) - (elevLow ?? 0))}m</Typography>
                  <Typography style={sc.miniStatLbl}>Net Gain</Typography>
                </View>
              </View>
            </WidgetCard>
          </StaggerItem>
        )}

        {/* ── Splits ─────────────────────────────────────────────────────── */}
        {splits.length > 0 ? (
          <StaggerItem index={next()} style={sc.widgetGap}>
            <WidgetCard
              family="activity"
              title="Splits"
              icon={Wind}
              caption={splitPaces.length > 0
                ? `Best ${secsToMMSS(Math.round(minSplitPace))} · Slowest ${secsToMMSS(Math.round(maxSplitPace))}`
                : undefined}
              action={
                canSwitchUnit ? (
                  <View style={sc.unitToggle}>
                    {(['km', 'mi'] as const).map(u => (
                      <PressableScale
                        key={u}
                        haptic="selection"
                        onPress={() => setSplitUnit(u)}
                        accessibilityRole="button"
                        accessibilityLabel={`Show splits in ${u === 'km' ? 'kilometres' : 'miles'}`}
                        accessibilityState={{ selected: splitUnit === u }}
                        style={[sc.unitOpt, splitUnit === u && sc.unitOptActive]}
                      >
                        <Typography style={[sc.unitOptText, splitUnit === u && sc.unitOptTextActive]}>
                          {u.toUpperCase()}
                        </Typography>
                      </PressableScale>
                    ))}
                  </View>
                ) : null
              }
            >
              <SplitsVisual
                splits={splitUnit === 'mi' && splitsImperial.length ? splitsImperial : splits}
                unit={splitUnit}
                family={family}
              />
            </WidgetCard>
          </StaggerItem>
        ) : null}

        {/* ── Laps ───────────────────────────────────────────────────────── */}
        {laps.length > 1 ? (
          <StaggerItem index={next()} style={sc.widgetGap}>
            <WidgetCard
              family="activity"
              title={`Laps (${laps.length})`}
              icon={Navigation}
            >
              <LapsTable laps={laps} type={act.type} />
            </WidgetCard>
          </StaggerItem>
        ) : null}

        {/* ── Best Efforts ───────────────────────────────────────────────── */}
        {bestEfforts.length > 0 ? (
          <StaggerItem index={next()} style={sc.widgetGap}>
            <WidgetCard
              family="records"
              title="Best Efforts"
              icon={Trophy}
            >
              <BestEffortsSection efforts={bestEfforts} />
            </WidgetCard>
          </StaggerItem>
        ) : null}

        {/* ── Power ──────────────────────────────────────────────────────── */}
        {hasPower && (
          <StaggerItem index={next()} style={sc.widgetGap}>
            <WidgetCard family="health" title="Power" icon={Zap}>
              <View style={sc.miniStatGrid}>
                {avgWatts ? (
                  <View style={sc.miniStat}>
                    <Typography style={[sc.miniStatVal, { color: '#F97316' }]}>{Math.round(avgWatts)} W</Typography>
                    <Typography style={sc.miniStatLbl}>Avg Power</Typography>
                  </View>
                ) : null}
                {weightedWatts ? (
                  <View style={sc.miniStat}>
                    <Typography style={[sc.miniStatVal, { color: '#F59E0B' }]}>{Math.round(weightedWatts)} W</Typography>
                    <Typography style={sc.miniStatLbl}>Weighted (NP)</Typography>
                  </View>
                ) : null}
                {maxWatts ? (
                  <View style={sc.miniStat}>
                    <Typography style={[sc.miniStatVal, { color: '#EF4444' }]}>{Math.round(maxWatts)} W</Typography>
                    <Typography style={sc.miniStatLbl}>Peak Power</Typography>
                  </View>
                ) : null}
                {kilojoules ? (
                  <View style={sc.miniStat}>
                    <Typography style={[sc.miniStatVal, { color: '#10B981' }]}>{Math.round(kilojoules)} kJ</Typography>
                    <Typography style={sc.miniStatLbl}>Total Work</Typography>
                  </View>
                ) : null}
              </View>
            </WidgetCard>
          </StaggerItem>
        )}

        {/* ── Effort & Exertion ──────────────────────────────────────────── */}
        {(act.sufferScore != null || perceivedExertion != null) && (
          <StaggerItem index={next()} style={sc.widgetGap}>
            <WidgetCard family="recovery" title="Effort & Exertion" icon={Flame}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {act.sufferScore != null && (
                  <View style={[sc.effortBlock, { backgroundColor: '#EC489910' }]}>
                    <AnimatedNumber value={act.sufferScore} style={{ fontSize: 32, fontWeight: '900', color: '#EC4899', letterSpacing: -0.8 }} />
                    <Typography style={sc.effortBlockLbl}>Relative Effort</Typography>
                    <Typography style={[sc.effortBlockTag, { color: '#EC4899' }]}>
                      {act.sufferScore < 25 ? 'Easy' : act.sufferScore < 50 ? 'Moderate' : act.sufferScore < 75 ? 'Hard' : act.sufferScore < 100 ? 'Very Hard' : 'Maximum'}
                    </Typography>
                  </View>
                )}
                {perceivedExertion != null && (
                  <View style={[sc.effortBlock, { backgroundColor: '#F9731610' }]}>
                    <Typography style={{ fontSize: 32, fontWeight: '900', color: '#F97316', letterSpacing: -0.8 }}>{perceivedExertion}/10</Typography>
                    <Typography style={sc.effortBlockLbl}>Perceived Exertion</Typography>
                    <Typography style={[sc.effortBlockTag, { color: '#F97316' }]}>
                      {perceivedExertion <= 3 ? 'Easy' : perceivedExertion <= 5 ? 'Moderate' : perceivedExertion <= 7 ? 'Hard' : perceivedExertion <= 9 ? 'Very Hard' : 'Max'}
                    </Typography>
                  </View>
                )}
              </View>
            </WidgetCard>
          </StaggerItem>
        )}

        {/* ── Weather ────────────────────────────────────────────────────── */}
        {hasWeather && (
          <StaggerItem index={next()} style={sc.widgetGap}>
            <WidgetCard family="recovery" title="Weather" icon={Wind}>
              <View style={sc.miniStatGrid}>
                {weatherTemp != null && (
                  <View style={sc.miniStat}>
                    <Typography style={[sc.miniStatVal, { color: '#0EA5E9' }]}>{weatherTemp}°C</Typography>
                    <Typography style={sc.miniStatLbl}>Temperature</Typography>
                  </View>
                )}
                {weatherHumidity != null && (
                  <View style={sc.miniStat}>
                    <Typography style={[sc.miniStatVal, { color: '#10B981' }]}>{weatherHumidity}%</Typography>
                    <Typography style={sc.miniStatLbl}>Humidity</Typography>
                  </View>
                )}
                {weatherWindspeed != null && (
                  <View style={sc.miniStat}>
                    <Typography style={[sc.miniStatVal, { color: '#6366F1' }]}>{Math.round(weatherWindspeed)} km/h</Typography>
                    <Typography style={sc.miniStatLbl}>Wind</Typography>
                  </View>
                )}
                {weatherCondition && (
                  <View style={sc.miniStat}>
                    <Typography style={[sc.miniStatVal, { color: theme.colors.text, fontSize: 14 }]}>{weatherCondition}</Typography>
                    <Typography style={sc.miniStatLbl}>Condition</Typography>
                  </View>
                )}
              </View>
            </WidgetCard>
          </StaggerItem>
        )}

        {/* ── Social Stats ───────────────────────────────────────────────── */}
        {(kudos > 0 || achievements > 0 || photoCount > 0 || athleteCount > 1) && (
          <StaggerItem index={next()} style={sc.widgetGap}>
            <WidgetCard family="social" title="Activity Stats" icon={Star}>
              <View style={sc.miniStatGrid}>
                <View style={sc.miniStat}>
                  <Icon icon={ThumbsUp} variant="plain" size="md" color="#EC4899" />
                  <AnimatedNumber value={kudos} style={[sc.miniStatVal, { color: '#EC4899' }]} />
                  <Typography style={sc.miniStatLbl}>Kudos</Typography>
                </View>
                <View style={sc.miniStat}>
                  <Icon icon={MessageCircle} variant="plain" size="md" color="#10B981" />
                  <AnimatedNumber value={comments} style={[sc.miniStatVal, { color: '#10B981' }]} />
                  <Typography style={sc.miniStatLbl}>Comments</Typography>
                </View>
                <View style={sc.miniStat}>
                  <Icon icon={Award} variant="plain" size="md" color="#F59E0B" />
                  <AnimatedNumber value={achievements} style={[sc.miniStatVal, { color: '#F59E0B' }]} />
                  <Typography style={sc.miniStatLbl}>Achievements</Typography>
                </View>
                <View style={sc.miniStat}>
                  <Icon icon={Trophy} variant="plain" size="md" color="#EF4444" />
                  <AnimatedNumber value={prCount} style={[sc.miniStatVal, { color: '#EF4444' }]} />
                  <Typography style={sc.miniStatLbl}>PRs</Typography>
                </View>
                {photoCount > 0 && (
                  <View style={sc.miniStat}>
                    <Icon icon={ImageIcon} variant="plain" size="md" color="#8B5CF6" />
                    <AnimatedNumber value={photoCount} style={[sc.miniStatVal, { color: '#8B5CF6' }]} />
                    <Typography style={sc.miniStatLbl}>Photos</Typography>
                  </View>
                )}
                {athleteCount > 1 && (
                  <View style={sc.miniStat}>
                    <Icon icon={Users} variant="plain" size="md" color="#A78BFA" />
                    <AnimatedNumber value={athleteCount} style={[sc.miniStatVal, { color: '#A78BFA' }]} />
                    <Typography style={sc.miniStatLbl}>Athletes</Typography>
                  </View>
                )}
              </View>
            </WidgetCard>
          </StaggerItem>
        )}

        {/* ── Similar activities ─────────────────────────────────────────── */}
        {similarActivities.length >= 3 && (
          <StaggerItem index={next()} style={sc.widgetGap}>
            <WidgetCard family="progress" title="Similar Activities" icon={BarChart2}>
              <Typography style={{ fontSize: 13, color: theme.colors.text, marginBottom: 12, fontWeight: '500' }}>
                {similarActivities.length + 1} {act.type.toLowerCase()}s with similar distance ({(act.distance / 1000 * 0.85).toFixed(1)}–{(act.distance / 1000 * 1.15).toFixed(1)} km)
              </Typography>
              {rankPercentile != null && (
                <View style={sc.percentileBar}>
                  <LinearGradient
                    colors={['#10B981', fam.accent]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[sc.percentileFill, { width: `${rankPercentile}%` }]}
                  />
                </View>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Typography style={{ fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' }}>Slowest</Typography>
                <Typography style={{ fontSize: 13, fontWeight: '900', color: '#10B981', letterSpacing: -0.2 }}>
                  You: top {100 - (rankPercentile ?? 0)}%
                </Typography>
                <Typography style={{ fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' }}>Fastest</Typography>
              </View>
            </WidgetCard>
          </StaggerItem>
        )}

        {/* ── Segments ───────────────────────────────────────────────────── */}
        {segments.length > 0 && (
          <StaggerItem index={next()} style={sc.widgetGap}>
            <WidgetCard family="records" title="Segment Efforts" icon={BarChart2}>
              {segments.slice(0, 5).map((seg: any, i: number) => {
                const isPR = seg.pr_rank === 1;
                const isTop10 = seg.kom_rank != null && seg.kom_rank <= 10;
                return (
                  <PressableScale key={i} haptic="selection" style={sc.segRow} accessibilityLabel={`Segment ${seg.name}`}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Typography style={sc.segName} numberOfLines={1}>{seg.name}</Typography>
                        {isPR && <View style={sc.prBadge}><Typography style={sc.prText}>PR</Typography></View>}
                        {isTop10 && !isPR && (
                          <View style={[sc.prBadge, { backgroundColor: '#6366F118' }]}>
                            <Typography style={[sc.prText, { color: '#6366F1' }]}>Top 10</Typography>
                          </View>
                        )}
                      </View>
                      <Typography style={sc.segMeta}>
                        {(seg.distance / 1000).toFixed(1)} km · {Math.round(seg.segment?.average_grade || 0)}% grade
                      </Typography>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Typography style={sc.segTime}>{secsToMMSS(seg.moving_time)}</Typography>
                      {seg.pr_rank && <Typography style={sc.segRank}>#{seg.pr_rank} all-time</Typography>}
                    </View>
                  </PressableScale>
                );
              })}
            </WidgetCard>
          </StaggerItem>
        )}

        {/* ── Gear ───────────────────────────────────────────────────────── */}
        {gear && (
          <StaggerItem index={next()} style={sc.widgetGap}>
            <WidgetCard family="activity" title="Gear" icon={Shirt}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {act.type === 'Ride'
                  ? <Icon icon={Bike} variant="plain" size="lg" color={fam.accent} />
                  : <Icon icon={Footprints} variant="plain" size="lg" color={fam.accent} />}
                <View style={{ flex: 1 }}>
                  <Typography style={{ fontSize: 15, fontWeight: '800', color: theme.colors.text }}>{gear.name}</Typography>
                  <Typography style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 }}>
                    {Math.round((gear.distance || 0) / 1000)} km on this gear
                  </Typography>
                </View>
              </View>
            </WidgetCard>
          </StaggerItem>
        )}

        {/* ── Device & Notes ─────────────────────────────────────────────── */}
        {(deviceName || description) && (
          <StaggerItem index={next()} style={sc.widgetGap}>
            <WidgetCard family="plan" title="Details" icon={Cpu}>
              {deviceName ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: description ? 10 : 0 }}>
                  <Icon icon={Cpu} variant="plain" size="sm" color={theme.colors.textSecondary} />
                  <Typography style={sc.detailText}>{deviceName}</Typography>
                </View>
              ) : null}
              {description ? <Typography style={[sc.detailText, { lineHeight: 20 }]}>{description}</Typography> : null}
            </WidgetCard>
          </StaggerItem>
        )}

      </RNAnimated.ScrollView>
    </View>
  );
}

const sc = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  // Sticky nav
  navBar: {
    position: 'absolute', left: 0, right: 0, top: 0, height: 100,
    zIndex: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  navSafeArea: {
    position: 'absolute', left: 0, right: 0, top: 0,
    zIndex: 10,
  },
  navRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  navBackBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  navTitle: { fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: -0.2 },

  // ── Hero ───────────────────────────────────────────────────────────────
  heroWrap: { position: 'relative', backgroundColor: theme.colors.surfaceMuted },
  heroOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
  },
  heroTopOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0,
  },
  heroTopRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8,
  },
  sportPillBig: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
  },
  sportPillBigText: {
    fontSize: 11, fontWeight: '900', color: '#fff',
    letterSpacing: 1.2,
  },
  medalCount: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999,
    borderWidth: 1,
  },
  medalCountText: { fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },

  heroContent: {
    position: 'absolute', left: 20, right: 20, bottom: 18,
  },
  heroName: {
    fontSize: 30, color: '#fff', fontWeight: '900',
    marginBottom: 8, letterSpacing: -0.8,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  heroDateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    flexWrap: 'wrap',
  },
  heroDate: {
    fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  metaDot: { width: 3, height: 3, borderRadius: 1.5 },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingTop: 14 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 10, borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },

  medalRow: { paddingHorizontal: 16, paddingTop: 14, gap: 8 },
  medalPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 999,
  },
  medalVal: { color: '#fff', fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  medalLbl: { color: 'rgba(255,255,255,0.95)', fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },

  // ── Primary stat grid (full-bleed, no card chrome) ─────────────────────
  primaryGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    marginTop: 18, marginHorizontal: 16,
  },
  primaryGridCell: {
    width: '50%',
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  primaryGridCellRightDiv: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(255,255,255,0.08)',
  },
  primaryGridCellBottomDiv: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  statTile: { alignItems: 'flex-start', paddingHorizontal: 8 },
  statTileIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  statTileVal: {
    fontSize: 32, fontWeight: '900', color: '#fff',
    letterSpacing: -0.8, fontVariant: ['tabular-nums'],
    lineHeight: 34,
  },
  statTileUnit: {
    fontSize: 12, color: theme.colors.textSecondary,
    fontWeight: '800', letterSpacing: 0.6,
  },
  statTileLbl: {
    fontSize: 10, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 1.2,
    marginTop: 4,
  },

  // ── Secondary chip row ────────────────────────────────────────────────
  secScroll: { paddingHorizontal: 16, gap: 8 },
  syncStatusRow: {
    paddingHorizontal: 16, marginTop: 14,
    flexDirection: 'row', alignItems: 'center',
  },
  syncStatusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1,
  },
  syncStatusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  secChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1,
  },
  secChipVal: { fontSize: 13, fontWeight: '900', letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
  secChipUnit: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  secChipLbl: { fontSize: 9, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },

  // Widget vertical rhythm — snapped to the 8pt grid (md token).
  widgetGap: { marginTop: theme.spacing.md },

  // Mini-stat grid (used inside WidgetCard for power/weather/social/etc.)
  miniStatGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  miniStat: {
    width: '50%', alignItems: 'center', gap: 4, paddingVertical: 10,
  },
  miniStatVal: { fontSize: 20, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.4 },
  miniStatLbl: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '700', letterSpacing: 0.3 },

  photo: { width: '100%', height: 220, borderRadius: 12 },

  // HR Zones inner stats — big hero numbers
  hrStat: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14, paddingVertical: 16, gap: 2,
  },
  hrStatVal: {
    fontSize: 36, fontWeight: '900',
    letterSpacing: -1, fontVariant: ['tabular-nums'], lineHeight: 38,
  },
  hrStatUnit: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '800', letterSpacing: 0.8 },
  hrStatLbl: {
    fontSize: 10, color: theme.colors.textSecondary,
    fontWeight: '900', letterSpacing: 1.4, marginTop: 4,
  },

  // Zone bars
  zoneLabel: { fontSize: 13, color: '#fff', fontWeight: '800' },
  zoneRange: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '600' },
  zoneTime: {
    fontSize: 13, color: '#fff', fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },

  // Live-from-Strava pill
  liveStravaPill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    gap: 5, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(251,146,60,0.15)',
    borderWidth: 1, borderColor: 'rgba(251,146,60,0.45)',
    marginTop: 12,
  },
  liveStravaText: {
    fontSize: 10, fontWeight: '900', color: '#FB923C',
    letterSpacing: 1.1,
  },

  // Elev chip row
  elevChipRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  elevChip: {
    flexDirection: 'row', alignItems: 'baseline', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1,
  },
  elevChipVal: { fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  elevChipLbl: { fontSize: 10, fontWeight: '800', color: theme.colors.textSecondary, letterSpacing: 1 },

  // Splits visual
  splitVizRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
  },
  splitVizIdxBox: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  splitVizIdx: {
    fontSize: 16, fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  splitVizBarWrap: { flex: 1, height: 16, justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8 },
  splitVizBar: { height: 16, borderRadius: 8 },
  splitVizMetrics: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  splitVizPace: {
    minWidth: 50, textAlign: 'right',
    fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'],
  },
  splitVizHrChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  splitVizHr: { fontSize: 11, color: '#EF4444', fontWeight: '900', fontVariant: ['tabular-nums'] },
  splitVizElev: {
    fontSize: 11, color: theme.colors.textSecondary, fontWeight: '800',
    fontVariant: ['tabular-nums'], minWidth: 36, textAlign: 'right',
  },

  // Splits unit toggle
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 9,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  unitOpt: { minWidth: 32, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, alignItems: 'center' },
  unitOptActive: { backgroundColor: theme.colors.primary + '33', borderWidth: 1, borderColor: theme.colors.primary },
  unitOptText: { fontSize: 11, fontWeight: '800', color: theme.colors.textSecondary, letterSpacing: 0.8 },
  unitOptTextActive: { color: theme.colors.primary },

  // Laps / shared table chrome
  splitHeader: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderColor: theme.colors.border, marginBottom: 4 },
  splitHCell: { fontSize: 10, fontWeight: '800', color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  splitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  splitCell: { fontSize: 13, color: theme.colors.text, fontWeight: '600', fontVariant: ['tabular-nums'] },

  // Effort blocks
  effortBlock: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 14 },
  effortBlockLbl: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 4, fontWeight: '700' },
  effortBlockTag: { fontSize: 12, fontWeight: '900', marginTop: 6, letterSpacing: 0.5 },

  // Best efforts rows
  effortRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
  },
  effortMedal: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  effortLabel: { fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: -0.2 },
  effortPace: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] },
  effortTime: { fontSize: 16, fontWeight: '900', color: '#fff', fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
  deltaChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1,
  },
  deltaChipText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  prBadge: { backgroundColor: '#FCD34D22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 6 },
  prText: { fontSize: 10, fontWeight: '900', color: '#FCD34D', letterSpacing: 0.4 },

  percentileBar: { height: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, overflow: 'hidden' },
  percentileFill: { height: '100%', borderRadius: 6 },

  // Segments
  segRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  segName: { fontSize: 14, fontWeight: '800', color: theme.colors.text, flex: 1 },
  segMeta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 3, fontWeight: '600' },
  segTime: { fontSize: 14, fontWeight: '900', color: theme.colors.text, fontVariant: ['tabular-nums'] },
  segRank: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2, fontWeight: '700' },

  detailText: { fontSize: 14, color: theme.colors.text, fontWeight: '500' },
});
