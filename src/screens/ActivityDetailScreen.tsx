import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Dimensions, Image, Platform, Animated as RNAnimated, RefreshControl,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { theme, withAlpha } from '../theme';
import { Typography } from '../components/Typography';
import { StaggerItem } from '../components/Stagger';
import { PressableScale } from '../components/PressableScale';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { WidgetCard } from '../components/WidgetCard';
import { ChartLine } from '../components/charts';
import { SkeletonHero, SkeletonChart, SkeletonStatGrid } from '../components/SkeletonPresets';
import { Activity, BestEffort, RpeEntry, useStore } from '../store/useStore';
import { StravaService } from '../services/strava';
import { decodePolyline } from '../utils/polyline';
import { familyStyle, WidgetFamily } from '../utils/widgetFamilies';
import { resolveHrZones, zoneOf, ZONE_LABELS, ResolvedZones } from '../utils/hrZones';
import { formatPace as formatPaceMinKm } from '../utils/dates';
import { sportIcon } from '../utils/sportIcon';
import { Icon } from '../components/Icon';
import {
  ArrowLeft, Clock, Heart, Zap, Mountain,
  Footprints, Flame, TrendingUp, Wind, MapPin, Trophy,
  ThumbsUp, MessageCircle, Award, Cpu, Bike, Shirt,
  Star, Navigation, BarChart2, Pause, Gauge, Users,
  Image as ImageIcon, Briefcase, Lock, Edit3, Cog,
  Thermometer, Medal, RefreshCw, CheckCircle2, AlertCircle, Smile, type LucideIcon,
} from 'lucide-react-native';
import { format, parseISO } from 'date-fns';

const { width } = Dimensions.get('window');
const MAP_H = 320;
const MAP_W = width;

// ─── Formatters ───────────────────────────────────────────────────────────────
function formatPace(speed: number): string {
  if (!speed) return '--';
  return formatPaceMinKm(1000 / speed / 60);
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

// Z1..Z5 palette from theme tokens (cyan → green → amber → orange → red).
const ZONE_COLORS = [
  familyStyle('recovery').accent,
  theme.colors.success,
  theme.colors.warning,
  theme.colors.primary,
  theme.colors.error,
];

// Pick the right family for a given sport.
function familyForType(type: string): WidgetFamily {
  if (type === 'Workout') return 'records';
  return 'activity';
}

// Mood scale 1–5 for the post-activity check-in.
const MOOD_EMOJI = ['😖', '😕', '🙂', '😄', '🤩'];
const RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

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

// ─── Colour helpers ───────────────────────────────────────────────────────────
function hexToRgb(hex: string) {
  const m = hex.replace('#', '');
  return {
    r: parseInt(m.slice(0, 2), 16),
    g: parseInt(m.slice(2, 4), 16),
    b: parseInt(m.slice(4, 6), 16),
  };
}

/** Lerp two token hexes; returns rgb parts so callers can build rgba tints. */
function mixHex(hexA: string, hexB: string, t: number) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

const rgba = (c: { r: number; g: number; b: number }, a = 1) => `rgba(${c.r},${c.g},${c.b},${a})`;

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
        <Icon size={16} color={theme.colors.onAccent} />
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
    <View style={[sc.secChip, { backgroundColor: withAlpha(accent, 'soft'), borderColor: withAlpha(accent, 'strong') }]}>
      <Icon size={12} color={accent} />
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <Typography style={[sc.secChipVal, { color: theme.colors.text }]}>{value}</Typography>
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
        <Icon size={12} color={theme.colors.onAccent} />
        <Typography style={sc.medalVal}>{value}</Typography>
        <Typography style={sc.medalLbl}>{label}</Typography>
      </LinearGradient>
    </PressableScale>
  );
}

function Badge({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <View style={[sc.badge, { backgroundColor: withAlpha(color, 'soft'), borderColor: withAlpha(color, 'strong') }]}>
      {icon}
      <Typography style={[sc.badgeText, { color }]}>{label}</Typography>
    </View>
  );
}

// ─── HR Zones Bar Chart ───────────────────────────────────────────────────────
function HRZonesChart({
  splits,
  resolved,
  activityZones,
}: {
  splits: any[];
  /** Canonical athlete zones from resolveHrZones — the local fallback. */
  resolved: ResolvedZones;
  /** Strava's own per-activity time-in-zone buckets, when cached. */
  activityZones?: Array<{ min: number; max: number; time: number }> | null;
}) {
  const usingStrava = Array.isArray(activityZones) && activityZones.length >= 5;
  const zoneSecs = [0, 0, 0, 0, 0];

  if (usingStrava) {
    activityZones!.slice(0, 5).forEach((b, i) => { zoneSecs[i] = b.time || 0; });
  } else {
    splits.forEach(s => {
      if (s.average_heartrate) {
        zoneSecs[zoneOf(s.average_heartrate, resolved) - 1] += s.moving_time || 0;
      }
    });
  }

  const total = zoneSecs.reduce((a, b) => a + b, 0) || 1;

  const mins = usingStrava
    ? activityZones!.slice(0, 5).map(b => b.min)
    : resolved.bounds;
  const maxes = usingStrava
    ? activityZones!.slice(0, 5).map(b => (b.max > 0 ? b.max : 999))
    : [resolved.bounds[1] - 1, resolved.bounds[2] - 1, resolved.bounds[3] - 1, resolved.bounds[4] - 1, 999];

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
            <View style={{ height: 14, backgroundColor: withAlpha(theme.colors.text, 'faint'), borderRadius: 7, overflow: 'hidden' }}>
              <LinearGradient
                colors={[c, withAlpha(c, 'heavy')]}
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

  return (
    <View>
      {splits.slice(0, 30).map((s, i) => {
        const pace = paces[i];
        if (!pace) {
          return (
            <PressableScale key={i} haptic="selection" style={sc.splitVizRow} accessibilityLabel={`Split ${i + 1}`}>
              <View style={[sc.splitVizIdxBox, { backgroundColor: fam.tint, borderColor: withAlpha(fam.accent, 'strong') }]}>
                <Typography style={[sc.splitVizIdx, { color: fam.accent }]}>{i + 1}</Typography>
              </View>
              <Typography style={[sc.splitVizPace, { color: theme.colors.textSecondary }]}>--</Typography>
            </PressableScale>
          );
        }
        const t = (pace - min) / range;
        const widthPct = 35 + (1 - t) * 65;
        const mix = mixHex(fam.accent, theme.colors.error, t);
        const c = rgba(mix);
        return (
          <PressableScale key={i} haptic="selection" style={sc.splitVizRow} accessibilityLabel={`Split ${i + 1}, ${secsToMMSS(Math.round(pace))} per ${unit}`}>
            <View style={[sc.splitVizIdxBox, { backgroundColor: fam.tint, borderColor: withAlpha(fam.accent, 'strong') }]}>
              <Typography style={[sc.splitVizIdx, { color: fam.accent }]}>{i + 1}</Typography>
            </View>
            <View style={sc.splitVizBarWrap}>
              <LinearGradient
                colors={[c, rgba(mix, 0.67)]}
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
                  <Icon icon={Heart} variant="plain" size="xs" color={theme.colors.error} />
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

// ─── Best Efforts ─────────────────────────────────────────────────────────────
function BestEffortsSection({ efforts }: { efforts: any[] }) {
  if (!efforts?.length) return null;
  const DIST_LABELS: Record<number, string> = {
    400: '400m', 1000: '1K', 1609: '1 Mile', 5000: '5K', 10000: '10K', 21097: 'Half', 42195: 'Marathon',
  };
  const shown = efforts.filter(e => DIST_LABELS[e.distance]);
  if (!shown.length) return null;
  const recordsAccent = familyStyle('records').accent;
  return (
    <View>
      {shown.map((e, i) => {
        const isPR = e.pr_rank === 1;
        const MedalIcon = isPR ? Trophy : Star;
        const medalColor = isPR ? recordsAccent : theme.colors.textSecondary;
        const paceStr = e.elapsed_time && e.distance
          ? `${secsToMMSS(Math.round(e.elapsed_time / (e.distance / 1000)))} /km`
          : '';
        return (
          <PressableScale key={i} haptic="selection" style={sc.effortRow} accessibilityLabel={`${DIST_LABELS[e.distance]} best effort`}>
            <View style={[sc.effortMedal, { backgroundColor: withAlpha(medalColor, 'tint'), borderColor: withAlpha(medalColor, 'strong') }]}>
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
              <View style={[sc.deltaChip, { backgroundColor: withAlpha(theme.colors.secondary, 'tint'), borderColor: withAlpha(theme.colors.secondary, 'strong') }]}>
                <Typography style={[sc.deltaChipText, { color: theme.colors.secondary }]}>PR</Typography>
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
            <Typography style={[sc.splitCell, { flex: 0.7, color: theme.colors.error }]}>
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

// Best-effort distances we track as app-wide records.
const RECORD_DISTANCES = [1000, 5000, 10000] as const;

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function ActivityDetailScreen({ activity: act, onClose }: Props) {
  const hrZones = useStore(st => st.hrZones);
  const activities = useStore(st => st.activities);
  const userProfile = useStore(st => st.userProfile);
  const setActivityZones = useStore(st => st.setActivityZones);
  const enrichActivity = useStore(st => st.enrichActivity);
  const setBestEfforts = useStore(st => st.setBestEfforts);
  const rpeEntry = useStore(st => st.rpeLog[act.id]);
  const setRpe = useStore(st => st.setRpe);
  const [detail, setDetail] = useState<any>(null);
  const [streams, setStreams] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [splitUnit, setSplitUnit] = useState<'km' | 'mi'>('km');
  const scrollY = useMemo(() => new RNAnimated.Value(0), []);
  const spin = useMemo(() => new RNAnimated.Value(0), []);

  const liveAct = useMemo(
    () => activities.find(a => a.id === act.id) ?? act,
    [activities, act],
  );
  const activityHrZones = liveAct.zones?.find(z => z.type === 'heartrate')?.buckets ?? null;
  const resolvedZones = useMemo(() => resolveHrZones(hrZones, userProfile), [hrZones, userProfile]);

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

  // Merge real best-effort chips into the app-wide records when a real time
  // beats the stored (often estimated) one — shorter time wins per distance.
  const mergeBestEfforts = useCallback((efforts: any[]) => {
    if (!efforts?.length) return;
    const current = useStore.getState().bestEfforts;
    const updates: Record<number, BestEffort> = {};
    for (const dist of RECORD_DISTANCES) {
      const e = efforts.find(x => x.distance === dist && x.elapsed_time > 0);
      if (!e) continue;
      const existing = current[dist];
      if (!existing || e.elapsed_time < existing.time) {
        updates[dist] = {
          distance: dist,
          time: e.elapsed_time,
          pace: (e.elapsed_time / 60) / (dist / 1000),
          date: act.startDate,
          activityName: act.name,
        };
      }
    }
    if (Object.keys(updates).length) setBestEfforts({ ...current, ...updates });
  }, [act.startDate, act.name, setBestEfforts]);

  const loadFromStrava = useCallback(async (opts?: { allowCacheSkip?: boolean }) => {
    // Cache hit (real calories + polyline already enriched into the store row)
    // → skip the detail fetch entirely so a revisit opens instantly. The nav
    // refresh / pull-to-refresh always forces the full fetch.
    const row = useStore.getState().activities.find(a => a.id === act.id);
    const cacheHit = !!(row && row.calories != null && row.caloriesEstimated === false && row.polyline);
    const skipDetail = !!opts?.allowCacheSkip && cacheHit;

    try {
      const [d, s] = await Promise.all([
        skipDetail ? Promise.resolve(null) : StravaService.fetchActivityDetail(act.id),
        StravaService.fetchActivityStreams(act.id, 'heartrate,altitude,time,distance'),
      ]);
      setDetail(d);
      setStreams(s);
      setFetchStatus('ok');
      setFetchedAt(new Date().toISOString());
      setFromCache(skipDetail);

      if (d) {
        // Persist enrichment back to the store so the next open is a cache hit
        // and list-level widgets get real calories / full polyline / gear.
        const patch: Partial<Activity> = {};
        if (d.calories != null) {
          patch.calories = d.calories;
          patch.caloriesEstimated = false;
        }
        const fullPolyline = d.map?.polyline || d.map?.summary_polyline;
        if (fullPolyline) patch.polyline = fullPolyline;
        if (d.gear_id) patch.gearId = d.gear_id;
        if (d.device_watts != null) patch.deviceWatts = !!d.device_watts;
        const watts = d.weighted_average_watts ?? d.average_watts;
        if (watts) patch.averageWatts = watts;
        if (Object.keys(patch).length) enrichActivity(act.id, patch);

        mergeBestEfforts(d.best_efforts || []);
      }
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
  }, [act.id, setActivityZones, enrichActivity, mergeBestEfforts]);

  useEffect(() => {
    setLoading(true);
    setFetchStatus('idle');
    loadFromStrava({ allowCacheSkip: true });
  }, [act.id, loadFromStrava]);

  const onRefresh = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    setRefreshing(true);
    setFetchStatus('idle');
    loadFromStrava();
  }, [loadFromStrava]);

  // Autosave the check-in on every change, merging into the existing entry.
  // Clearing every field deletes the entry entirely (null), so the log never
  // accumulates empty rows.
  const commitRpe = useCallback((patch: Partial<RpeEntry>) => {
    const cur = useStore.getState().rpeLog[act.id];
    const merged = { ...cur, ...patch };
    if (merged.rpe == null && merged.mood == null && !merged.note?.trim()) {
      setRpe(act.id, null);
    } else {
      setRpe(act.id, { ...merged, loggedAt: new Date().toISOString() });
    }
  }, [act.id, setRpe]);

  // The note is kept in local state while typing — every set() on the
  // persisted store serialises the full blob, so we only commit on blur.
  const [noteDraft, setNoteDraft] = useState(rpeEntry?.note ?? '');
  useEffect(() => {
    setNoteDraft(rpeEntry?.note ?? '');
  }, [rpeEntry?.note]);
  const commitNote = useCallback(() => {
    if (noteDraft === (rpeEntry?.note ?? '')) return;
    commitRpe({ note: noteDraft || undefined });
  }, [noteDraft, rpeEntry?.note, commitRpe]);

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
    ? <Icon icon={Flame} variant="plain" size="xs" color={theme.colors.error} />
    : workoutType === 2
      ? <Icon icon={Footprints} variant="plain" size="xs" color={theme.colors.info} />
      : workoutType === 3
        ? <Icon icon={Zap} variant="plain" size="xs" color={theme.colors.warning} />
        : null;
  const workoutColor = workoutType === 1 ? theme.colors.error
    : workoutType === 2 ? theme.colors.info
    : workoutType === 3 ? theme.colors.warning
    : theme.colors.textSecondary;

  const isCommute = !!detail?.commute;
  const isManual = !!detail?.manual;
  const isPrivate = !!detail?.private;
  const isTrainer = !!detail?.trainer;

  const athleteCount = detail?.athlete_count ?? 1;
  const photoCount = detail?.total_photo_count ?? detail?.photo_count ?? 0;
  const photoUrl = detail?.photos?.primary?.urls?.['600'] || detail?.photos?.primary?.urls?.['100'] || null;

  const calories = detail?.calories ?? liveAct.calories;
  const avgWatts = detail?.average_watts ?? liveAct.averageWatts;
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

  // Prefer the full polyline from the detail payload, fall back to whatever
  // the store row carries (full after enrichment, summary from list sync) so
  // cache-hit opens still draw the route instantly.
  const polylineStr: string = detail?.map?.polyline || detail?.map?.summary_polyline || liveAct.polyline || '';
  const coords = useMemo(() => decodePolyline(polylineStr), [polylineStr]);
  const projected = useMemo(() => projectRoute(coords, MAP_W, MAP_H, 24), [coords]);

  // Streams arrive at ~1Hz — downsample to ~80 points and label each point
  // with its distance (or elapsed time) so the scrub pill reads naturally.
  const hrChartData = useMemo(() => {
    const arr: number[] | undefined = streams?.heartrate?.data;
    if (!arr?.length) return [];
    const dist: number[] | undefined = streams?.distance?.data;
    const time: number[] | undefined = streams?.time?.data;
    const target = 80;
    const step = Math.max(1, Math.floor(arr.length / target));
    const out: { label: string; value: number }[] = [];
    for (let i = 0; i < arr.length; i += step) {
      const label = dist?.[i] != null
        ? `${(dist[i] / 1000).toFixed(1)} km`
        : time?.[i] != null ? secsToMMSS(Math.round(time[i])) : `${i}`;
      out.push({ label, value: arr[i] });
    }
    return out;
  }, [streams]);

  const elevChartData = useMemo(() => {
    const arr: number[] | undefined = streams?.altitude?.data;
    if (!arr?.length) return [];
    const dist: number[] | undefined = streams?.distance?.data;
    const time: number[] | undefined = streams?.time?.data;
    const target = 80;
    const step = Math.max(1, Math.floor(arr.length / target));
    const out: { label: string; value: number }[] = [];
    for (let i = 0; i < arr.length; i += step) {
      const label = dist?.[i] != null
        ? `${(dist[i] / 1000).toFixed(1)} km`
        : time?.[i] != null ? secsToMMSS(Math.round(time[i])) : `${i}`;
      out.push({ label, value: Math.round(arr[i]) });
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

  const recordsAccent = familyStyle('records').accent;
  const socialAccent = familyStyle('social').accent;
  const recoveryAccent = familyStyle('recovery').accent;

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
      accent: recordsAccent, gradient: theme.colors.gradients.records,
    },
    {
      icon: Heart,
      value: act.averageHeartRate ? `${Math.round(act.averageHeartRate)}` : '--',
      numericValue: act.averageHeartRate ? Math.round(act.averageHeartRate) : undefined,
      unit: act.averageHeartRate ? 'BPM' : undefined,
      label: 'AVG HR', accent: theme.colors.error, gradient: theme.colors.gradients.health,
    },
    {
      icon: Flame,
      value: calories ? `${Math.round(calories)}` : '--',
      numericValue: calories ? Math.round(calories) : undefined,
      unit: calories ? 'KCAL' : undefined,
      label: 'CALORIES', accent: theme.colors.error, gradient: theme.colors.gradients.health,
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
    { icon: Pause, value: restLabel, label: 'PAUSED', accent: theme.colors.textSecondary, show: hasRest },
    { icon: Gauge, value: maxSpeedKmh.toFixed(1), unit: 'KM/H', label: 'MAX SPEED', accent: theme.colors.secondary, show: maxSpeedKmh > 0 },
    { icon: Heart, value: act.maxHeartRate ? `${Math.round(act.maxHeartRate)}` : '', unit: 'BPM', label: 'MAX HR', accent: theme.colors.primary, show: !!act.maxHeartRate },
    {
      icon: Footprints,
      value: act.averageCadence ? `${Math.round(act.averageCadence * (act.type === 'Run' ? 2 : 1))}` : '',
      unit: 'SPM', label: 'CADENCE', accent: theme.colors.secondary, show: !!act.averageCadence,
    },
    { icon: Zap, value: avgWatts ? `${Math.round(avgWatts)}` : '', unit: 'W', label: 'AVG POWER', accent: theme.colors.primary, show: !!avgWatts },
    { icon: Flame, value: act.sufferScore != null ? `${act.sufferScore}` : '', label: 'SUFFER', accent: socialAccent, show: act.sufferScore != null },
    { icon: Flame, value: kilojoules ? `${Math.round(kilojoules)}` : '', unit: 'KJ', label: 'ENERGY', accent: theme.colors.primary, show: !!kilojoules },
    { icon: Thermometer, value: deviceTemp != null ? `${deviceTemp}°C` : '', label: 'SENSOR TEMP', accent: theme.colors.gradients.primary[1], show: deviceTemp != null },
  ];
  const visibleSecondary = secondaryChips.filter(c => c.show);

  return (
    <View style={sc.container}>
      {/* Sticky nav — fades in on scroll */}
      <RNAnimated.View style={[sc.navBar, { opacity: navOpacity }]} pointerEvents="none">
        <LinearGradient
          colors={[theme.colors.background, withAlpha(theme.colors.background, 'heavy')]}
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
            <Icon icon={ArrowLeft} variant="plain" size="md" color={theme.colors.text} />
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
                color={refreshing || loading ? withAlpha(theme.colors.text, 'strong') : theme.colors.text}
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
                  fill={theme.colors.secondary}
                  stroke={theme.colors.onAccent}
                  strokeWidth={2}
                />
                <Circle
                  cx={projected.points[projected.points.length - 1].x}
                  cy={projected.points[projected.points.length - 1].y}
                  r={6}
                  fill={theme.colors.error}
                  stroke={theme.colors.onAccent}
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
                {sportIcon(act.type, 120, theme.colors.onAccent)}
              </View>
            </LinearGradient>
          )}
          </RNAnimated.View>

          {/* Strong dark overlay bottom-up */}
          <LinearGradient
            colors={['transparent', theme.colors.scrim, theme.colors.background]}
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
                {sportIcon(act.type, 14, theme.colors.onAccent)}
                <Typography style={sc.sportPillBigText}>{act.type.toUpperCase()}</Typography>
              </LinearGradient>

              {/* Top-right medal counts compact */}
              <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }}>
                {prCount > 0 && (
                  <View style={[sc.medalCount, { backgroundColor: withAlpha(recordsAccent, 'tint'), borderColor: withAlpha(recordsAccent, 'strong') }]}>
                    <Icon icon={Trophy} variant="plain" size="xs" color={recordsAccent} />
                    <Typography style={[sc.medalCountText, { color: recordsAccent }]}>{prCount}</Typography>
                  </View>
                )}
                {achievements > 0 && (
                  <View style={[sc.medalCount, { backgroundColor: withAlpha(theme.colors.primary, 'tint'), borderColor: withAlpha(theme.colors.primary, 'strong') }]}>
                    <Icon icon={Award} variant="plain" size="xs" color={theme.colors.primary} />
                    <Typography style={[sc.medalCountText, { color: theme.colors.primary }]}>{achievements}</Typography>
                  </View>
                )}
                {kudos > 0 && (
                  <View style={[sc.medalCount, { backgroundColor: withAlpha(socialAccent, 'tint'), borderColor: withAlpha(socialAccent, 'strong') }]}>
                    <Icon icon={ThumbsUp} variant="plain" size="xs" color={socialAccent} />
                    <Typography style={[sc.medalCountText, { color: socialAccent }]}>{kudos}</Typography>
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
                  <Icon icon={MapPin} variant="plain" size="xs" color={withAlpha(theme.colors.onAccent, 'heavy')} />
                  <Typography style={sc.heroDate}>{locationName.toUpperCase()}</Typography>
                  <View style={[sc.metaDot, { backgroundColor: withAlpha(theme.colors.onAccent, 'strong') }]} />
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
            {athleteCount > 1 && <Badge icon={<Icon icon={Users} variant="plain" size="xs" color={theme.colors.gradients.accent[1]} />} label={`Group (${athleteCount})`} color={theme.colors.gradients.accent[1]} />}
            {isCommute && <Badge icon={<Icon icon={Briefcase} variant="plain" size="xs" color={theme.colors.info} />} label="Commute" color={theme.colors.info} />}
            {isTrainer && <Badge icon={<Icon icon={Cog} variant="plain" size="xs" color={theme.colors.warning} />} label="Trainer" color={theme.colors.warning} />}
            {isManual && <Badge icon={<Icon icon={Edit3} variant="plain" size="xs" color={theme.colors.gradients.danger[1]} />} label="Manual entry" color={theme.colors.gradients.danger[1]} />}
            {isPrivate && <Badge icon={<Icon icon={Lock} variant="plain" size="xs" color={theme.colors.textSecondary} />} label="Private" color={theme.colors.textSecondary} />}
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
            fetched, when, that we opened straight from cache, or that the
            fetch failed. Refresh from the nav button or pull-to-refresh. */}
        {!loading && fetchStatus !== 'idle' && (
          <View style={sc.syncStatusRow}>
            <View
              style={[
                sc.syncStatusPill,
                {
                  backgroundColor:
                    fetchStatus === 'ok' ? withAlpha(theme.colors.success, 'tint') : withAlpha(theme.colors.error, 'tint'),
                  borderColor:
                    fetchStatus === 'ok' ? withAlpha(theme.colors.success, 'strong') : withAlpha(theme.colors.error, 'strong'),
                },
              ]}
            >
              <Icon
                icon={fetchStatus === 'ok' ? CheckCircle2 : AlertCircle}
                variant="plain"
                size="xs"
                color={fetchStatus === 'ok' ? theme.colors.success : theme.colors.error}
              />
              <Typography
                style={[
                  sc.syncStatusText,
                  { color: fetchStatus === 'ok' ? theme.colors.success : theme.colors.error },
                ]}
              >
                {fetchStatus === 'ok'
                  ? fromCache
                    ? 'Opened from cache — refresh for splits & laps'
                    : `Strava details synced${fetchedAt ? ` · ${format(parseISO(fetchedAt), 'h:mm a')}` : ''}`
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

        {/* ── How did it feel? (RPE / mood check-in) ─────────────────────── */}
        <StaggerItem index={next()} style={sc.widgetGap}>
          <WidgetCard
            family="recovery"
            title="How did it feel?"
            caption="Rate it while it's fresh"
            icon={Smile}
          >
            <Typography style={sc.rpeSectionLbl}>EFFORT (RPE 1–10)</Typography>
            <View style={sc.rpeChipRow}>
              {RPE_VALUES.map(n => {
                const active = rpeEntry?.rpe === n;
                return (
                  <PressableScale
                    key={n}
                    haptic="selection"
                    accessibilityRole="button"
                    accessibilityLabel={`Effort ${n} out of 10`}
                    accessibilityState={{ selected: active }}
                    style={[
                      sc.rpeChip,
                      active && { backgroundColor: recoveryAccent, borderColor: recoveryAccent },
                    ]}
                    onPress={() => commitRpe({ rpe: active ? undefined : n })}
                  >
                    <Typography style={[sc.rpeChipText, active && { color: theme.colors.onAccent }]}>
                      {n}
                    </Typography>
                  </PressableScale>
                );
              })}
            </View>

            <Typography style={[sc.rpeSectionLbl, { marginTop: 16 }]}>MOOD</Typography>
            <View style={sc.moodRow}>
              {MOOD_EMOJI.map((emo, i) => {
                const val = (i + 1) as 1 | 2 | 3 | 4 | 5;
                const active = rpeEntry?.mood === val;
                return (
                  <PressableScale
                    key={val}
                    haptic="selection"
                    accessibilityRole="button"
                    accessibilityLabel={`Mood ${val} out of 5`}
                    accessibilityState={{ selected: active }}
                    style={[
                      sc.moodBtn,
                      active && {
                        backgroundColor: withAlpha(recoveryAccent, 'tint'),
                        borderColor: recoveryAccent,
                      },
                    ]}
                    onPress={() => commitRpe({ mood: active ? undefined : val })}
                  >
                    <Typography
                      style={[
                        sc.moodEmoji,
                        rpeEntry?.mood != null && !active && { opacity: 0.4 },
                      ]}
                    >
                      {emo}
                    </Typography>
                  </PressableScale>
                );
              })}
            </View>

            <TextInput
              style={sc.rpeNoteInput}
              placeholder="Add a note (optional)"
              placeholderTextColor={theme.colors.textSecondary}
              value={noteDraft}
              onChangeText={setNoteDraft}
              onBlur={commitNote}
              maxLength={120}
              returnKeyType="done"
              accessibilityLabel="Check-in note"
            />
          </WidgetCard>
        </StaggerItem>

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
              caption={[
                act.averageHeartRate ? `Avg ${Math.round(act.averageHeartRate)} bpm` : null,
                act.maxHeartRate ? `Max ${Math.round(act.maxHeartRate)} bpm` : null,
              ].filter(Boolean).join(' · ') || undefined}
              icon={Heart}
            >
              <ChartLine
                data={hrChartData}
                height={180}
                family="health"
                scrub
                fromZero={false}
                formatValue={(v) => `${Math.round(v)} bpm`}
              />
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
                  <Typography style={[sc.hrStatVal, { color: theme.colors.error }]}>{Math.round(act.averageHeartRate)}</Typography>
                  <Typography style={sc.hrStatUnit}>BPM</Typography>
                  <Typography style={sc.hrStatLbl}>AVG</Typography>
                </View>
                {act.maxHeartRate ? (
                  <View style={sc.hrStat}>
                    <Typography style={[sc.hrStatVal, { color: theme.colors.primary }]}>{Math.round(act.maxHeartRate)}</Typography>
                    <Typography style={sc.hrStatUnit}>BPM</Typography>
                    <Typography style={sc.hrStatLbl}>PEAK</Typography>
                  </View>
                ) : null}
              </View>
              <HRZonesChart splits={splits} resolved={resolvedZones} activityZones={activityHrZones} />
              {activityHrZones && (
                <View style={sc.liveStravaPill}>
                  <Icon icon={Zap} variant="plain" size="xs" color={theme.colors.gradients.primary[1]} />
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
              <ChartLine
                data={elevChartData}
                height={180}
                family="activity"
                scrub
                fromZero={false}
                formatValue={(v) => `${Math.round(v)} m`}
              />
              {elevHigh != null && elevLow != null && (
                <View style={sc.elevChipRow}>
                  <View style={[sc.elevChip, { backgroundColor: withAlpha(theme.colors.warning, 'tint'), borderColor: withAlpha(theme.colors.warning, 'strong') }]}>
                    <Typography style={[sc.elevChipVal, { color: theme.colors.warning }]}>{Math.round(elevHigh)}m</Typography>
                    <Typography style={sc.elevChipLbl}>PEAK</Typography>
                  </View>
                  <View style={[sc.elevChip, { backgroundColor: withAlpha(theme.colors.secondary, 'tint'), borderColor: withAlpha(theme.colors.secondary, 'strong') }]}>
                    <Typography style={[sc.elevChipVal, { color: theme.colors.secondary }]}>{Math.round(elevLow)}m</Typography>
                    <Typography style={sc.elevChipLbl}>LOW</Typography>
                  </View>
                  <View style={[sc.elevChip, { backgroundColor: withAlpha(fam.accent, 'tint'), borderColor: withAlpha(fam.accent, 'strong') }]}>
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
                  <Typography style={[sc.miniStatVal, { color: theme.colors.warning }]}>{Math.round(elevHigh)}m</Typography>
                  <Typography style={sc.miniStatLbl}>Peak</Typography>
                </View>
                <View style={sc.miniStat}>
                  <Typography style={[sc.miniStatVal, { color: theme.colors.secondary }]}>{Math.round(elevLow)}m</Typography>
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
                    <Typography style={[sc.miniStatVal, { color: theme.colors.primary }]}>{Math.round(avgWatts)} W</Typography>
                    <Typography style={sc.miniStatLbl}>Avg Power</Typography>
                  </View>
                ) : null}
                {weightedWatts ? (
                  <View style={sc.miniStat}>
                    <Typography style={[sc.miniStatVal, { color: theme.colors.warning }]}>{Math.round(weightedWatts)} W</Typography>
                    <Typography style={sc.miniStatLbl}>Weighted (NP)</Typography>
                  </View>
                ) : null}
                {maxWatts ? (
                  <View style={sc.miniStat}>
                    <Typography style={[sc.miniStatVal, { color: theme.colors.error }]}>{Math.round(maxWatts)} W</Typography>
                    <Typography style={sc.miniStatLbl}>Peak Power</Typography>
                  </View>
                ) : null}
                {kilojoules ? (
                  <View style={sc.miniStat}>
                    <Typography style={[sc.miniStatVal, { color: theme.colors.secondary }]}>{Math.round(kilojoules)} kJ</Typography>
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
                  <View style={[sc.effortBlock, { backgroundColor: withAlpha(socialAccent, 'faint') }]}>
                    <AnimatedNumber value={act.sufferScore} style={[sc.effortBlockVal, { color: socialAccent }]} />
                    <Typography style={sc.effortBlockLbl}>Relative Effort</Typography>
                    <Typography style={[sc.effortBlockTag, { color: socialAccent }]}>
                      {act.sufferScore < 25 ? 'Easy' : act.sufferScore < 50 ? 'Moderate' : act.sufferScore < 75 ? 'Hard' : act.sufferScore < 100 ? 'Very Hard' : 'Maximum'}
                    </Typography>
                  </View>
                )}
                {perceivedExertion != null && (
                  <View style={[sc.effortBlock, { backgroundColor: withAlpha(theme.colors.primary, 'faint') }]}>
                    <Typography style={[sc.effortBlockVal, { color: theme.colors.primary }]}>{perceivedExertion}/10</Typography>
                    <Typography style={sc.effortBlockLbl}>Perceived Exertion</Typography>
                    <Typography style={[sc.effortBlockTag, { color: theme.colors.primary }]}>
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
                    <Typography style={[sc.miniStatVal, { color: familyStyle('progress').accent }]}>{weatherTemp}°C</Typography>
                    <Typography style={sc.miniStatLbl}>Temperature</Typography>
                  </View>
                )}
                {weatherHumidity != null && (
                  <View style={sc.miniStat}>
                    <Typography style={[sc.miniStatVal, { color: theme.colors.secondary }]}>{weatherHumidity}%</Typography>
                    <Typography style={sc.miniStatLbl}>Humidity</Typography>
                  </View>
                )}
                {weatherWindspeed != null && (
                  <View style={sc.miniStat}>
                    <Typography style={[sc.miniStatVal, { color: theme.colors.info }]}>{Math.round(weatherWindspeed)} km/h</Typography>
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
                  <Icon icon={ThumbsUp} variant="plain" size="md" color={socialAccent} />
                  <AnimatedNumber value={kudos} style={[sc.miniStatVal, { color: socialAccent }]} />
                  <Typography style={sc.miniStatLbl}>Kudos</Typography>
                </View>
                <View style={sc.miniStat}>
                  <Icon icon={MessageCircle} variant="plain" size="md" color={theme.colors.secondary} />
                  <AnimatedNumber value={comments} style={[sc.miniStatVal, { color: theme.colors.secondary }]} />
                  <Typography style={sc.miniStatLbl}>Comments</Typography>
                </View>
                <View style={sc.miniStat}>
                  <Icon icon={Award} variant="plain" size="md" color={theme.colors.warning} />
                  <AnimatedNumber value={achievements} style={[sc.miniStatVal, { color: theme.colors.warning }]} />
                  <Typography style={sc.miniStatLbl}>Achievements</Typography>
                </View>
                <View style={sc.miniStat}>
                  <Icon icon={Trophy} variant="plain" size="md" color={theme.colors.error} />
                  <AnimatedNumber value={prCount} style={[sc.miniStatVal, { color: theme.colors.error }]} />
                  <Typography style={sc.miniStatLbl}>PRs</Typography>
                </View>
                {photoCount > 0 && (
                  <View style={sc.miniStat}>
                    <Icon icon={ImageIcon} variant="plain" size="md" color={theme.colors.accent} />
                    <AnimatedNumber value={photoCount} style={[sc.miniStatVal, { color: theme.colors.accent }]} />
                    <Typography style={sc.miniStatLbl}>Photos</Typography>
                  </View>
                )}
                {athleteCount > 1 && (
                  <View style={sc.miniStat}>
                    <Icon icon={Users} variant="plain" size="md" color={theme.colors.gradients.accent[1]} />
                    <AnimatedNumber value={athleteCount} style={[sc.miniStatVal, { color: theme.colors.gradients.accent[1] }]} />
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
                    colors={[theme.colors.secondary, fam.accent]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[sc.percentileFill, { width: `${rankPercentile}%` }]}
                  />
                </View>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Typography style={{ fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' }}>Slowest</Typography>
                <Typography style={{ fontSize: 13, fontWeight: '900', color: theme.colors.secondary, letterSpacing: -0.2 }}>
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
                          <View style={[sc.prBadge, { backgroundColor: withAlpha(theme.colors.accent, 'soft') }]}>
                            <Typography style={[sc.prText, { color: theme.colors.accent }]}>Top 10</Typography>
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
    zIndex: 9, borderBottomWidth: 1, borderBottomColor: theme.colors.divider,
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
    backgroundColor: theme.colors.scrim,
    alignItems: 'center', justifyContent: 'center',
  },
  navTitle: { fontSize: 15, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.2 },

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
    fontSize: 11, fontWeight: '900', color: theme.colors.onAccent,
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
    fontSize: 30, color: theme.colors.onAccent, fontWeight: '900',
    marginBottom: 8, letterSpacing: -0.8,
    textShadowColor: theme.colors.scrim,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  heroDateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    flexWrap: 'wrap',
  },
  heroDate: {
    fontSize: 13, color: withAlpha(theme.colors.onAccent, 'heavy'), fontWeight: '700',
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
  medalVal: { color: theme.colors.onAccent, fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  medalLbl: { color: withAlpha(theme.colors.onAccent, 'heavy'), fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },

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
    borderRightColor: theme.colors.divider,
  },
  primaryGridCellBottomDiv: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.divider,
  },
  statTile: { alignItems: 'flex-start', paddingHorizontal: 8 },
  statTileIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  statTileVal: {
    fontSize: 32, fontWeight: '900', color: theme.colors.text,
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
    backgroundColor: withAlpha(theme.colors.text, 'faint'),
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
  zoneLabel: { fontSize: 13, color: theme.colors.text, fontWeight: '800' },
  zoneRange: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '600' },
  zoneTime: {
    fontSize: 13, color: theme.colors.text, fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },

  // Live-from-Strava pill
  liveStravaPill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    gap: 5, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: withAlpha(theme.colors.gradients.primary[1], 'tint'),
    borderWidth: 1, borderColor: withAlpha(theme.colors.gradients.primary[1], 'strong'),
    marginTop: 12,
  },
  liveStravaText: {
    fontSize: 10, fontWeight: '900', color: theme.colors.gradients.primary[1],
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
    paddingVertical: 10, borderBottomWidth: 1, borderColor: theme.colors.divider,
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
    backgroundColor: withAlpha(theme.colors.text, 'faint'), borderRadius: 8 },
  splitVizBar: { height: 16, borderRadius: 8 },
  splitVizMetrics: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  splitVizPace: {
    minWidth: 50, textAlign: 'right',
    fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'],
  },
  splitVizHrChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
    backgroundColor: withAlpha(theme.colors.error, 'soft'),
  },
  splitVizHr: { fontSize: 11, color: theme.colors.error, fontWeight: '900', fontVariant: ['tabular-nums'] },
  splitVizElev: {
    fontSize: 11, color: theme.colors.textSecondary, fontWeight: '800',
    fontVariant: ['tabular-nums'], minWidth: 36, textAlign: 'right',
  },

  // Splits unit toggle
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: withAlpha(theme.colors.text, 'faint'),
    borderRadius: 9,
    padding: 3,
    borderWidth: 1,
    borderColor: theme.colors.divider,
  },
  unitOpt: { minWidth: 32, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, alignItems: 'center' },
  unitOptActive: { backgroundColor: withAlpha(theme.colors.primary, 'medium'), borderWidth: 1, borderColor: theme.colors.primary },
  unitOptText: { fontSize: 11, fontWeight: '800', color: theme.colors.textSecondary, letterSpacing: 0.8 },
  unitOptTextActive: { color: theme.colors.primary },

  // Laps / shared table chrome
  splitHeader: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderColor: theme.colors.border, marginBottom: 4 },
  splitHCell: { fontSize: 10, fontWeight: '800', color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  splitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: theme.colors.divider },
  splitCell: { fontSize: 13, color: theme.colors.text, fontWeight: '600', fontVariant: ['tabular-nums'] },

  // How did it feel? — RPE / mood check-in
  rpeSectionLbl: {
    fontSize: 10, fontWeight: '800', color: theme.colors.textSecondary,
    letterSpacing: 1.2, marginBottom: 8,
  },
  rpeChipRow: { flexDirection: 'row', gap: 5 },
  rpeChip: {
    flex: 1, height: 34, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: withAlpha(theme.colors.text, 'faint'),
    borderWidth: 1, borderColor: theme.colors.divider,
  },
  rpeChipText: {
    fontSize: 13, fontWeight: '900', color: theme.colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  moodRow: { flexDirection: 'row', gap: 8 },
  moodBtn: {
    flex: 1, height: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: withAlpha(theme.colors.text, 'faint'),
    borderWidth: 1, borderColor: theme.colors.divider,
  },
  moodEmoji: { fontSize: 22, lineHeight: 28 },
  rpeNoteInput: {
    marginTop: 16,
    backgroundColor: withAlpha(theme.colors.text, 'faint'),
    borderRadius: 12, borderWidth: 1, borderColor: theme.colors.divider,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: theme.colors.text, fontWeight: '600',
  },

  // Effort blocks
  effortBlock: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 14 },
  effortBlockVal: { fontSize: 32, fontWeight: '900', letterSpacing: -0.8 },
  effortBlockLbl: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 4, fontWeight: '700' },
  effortBlockTag: { fontSize: 12, fontWeight: '900', marginTop: 6, letterSpacing: 0.5 },

  // Best efforts rows
  effortRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.colors.divider,
  },
  effortMedal: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  effortLabel: { fontSize: 15, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.2 },
  effortPace: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] },
  effortTime: { fontSize: 16, fontWeight: '900', color: theme.colors.text, fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
  deltaChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1,
  },
  deltaChipText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  prBadge: { backgroundColor: withAlpha(theme.colors.families.records.accent, 'tint'), borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 6 },
  prText: { fontSize: 10, fontWeight: '900', color: theme.colors.families.records.accent, letterSpacing: 0.4 },

  percentileBar: { height: 12, backgroundColor: withAlpha(theme.colors.text, 'soft'), borderRadius: 6, overflow: 'hidden' },
  percentileFill: { height: '100%', borderRadius: 6 },

  // Segments
  segRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.colors.divider },
  segName: { fontSize: 14, fontWeight: '800', color: theme.colors.text, flex: 1 },
  segMeta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 3, fontWeight: '600' },
  segTime: { fontSize: 14, fontWeight: '900', color: theme.colors.text, fontVariant: ['tabular-nums'] },
  segRank: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2, fontWeight: '700' },

  detailText: { fontSize: 14, color: theme.colors.text, fontWeight: '500' },
});
