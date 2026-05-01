import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';
import { Typography } from '../components/Typography';
import { Card } from '../components/Card';
import { Activity } from '../store/useStore';
import {
  ArrowLeft, MapPin, Clock, Heart, Zap, Mountain,
  Footprints, Flame, Activity as ActivityIcon, TrendingUp, Wind
} from 'lucide-react-native';
import { format, parseISO } from 'date-fns';

interface Props {
  activity: Activity;
  onClose: () => void;
}

function formatPace(speed: number): string {
  if (!speed) return '--';
  const mPerK = 1000 / speed / 60;
  const mins = Math.floor(mPerK);
  const secs = Math.round((mPerK - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function StatRow({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <View style={styles.statRow}>
      <View style={[styles.statIcon, { backgroundColor: (color ?? '#6366f1') + '22' }]}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Typography style={styles.statLabel}>{label}</Typography>
        {sub && <Typography style={styles.statSub}>{sub}</Typography>}
      </View>
      <Typography style={[styles.statValue, color ? { color } : {}]}>{value}</Typography>
    </View>
  );
}

function getTypeGradient(type: string): [string, string] {
  switch (type) {
    case 'Run': return ['#6366f1', '#8b5cf6'];
    case 'Walk': return ['#10b981', '#059669'];
    case 'Ride': return ['#0ea5e9', '#0284c7'];
    default: return ['#f59e0b', '#d97706'];
  }
}

export function ActivityDetailScreen({ activity: act, onClose }: Props) {
  const km = act.distance / 1000;
  const gradColors = getTypeGradient(act.type);
  const sufferLabel = !act.sufferScore ? 'No HR data'
    : act.sufferScore < 25 ? 'Easy'
    : act.sufferScore < 50 ? 'Moderate'
    : act.sufferScore < 75 ? 'Hard'
    : act.sufferScore < 100 ? 'Very Hard'
    : 'Maximum Effort';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Hero */}
        <LinearGradient colors={gradColors} style={styles.hero}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <ArrowLeft color="#fff" size={22} />
          </TouchableOpacity>
          <Typography style={styles.actType}>{act.type}</Typography>
          <Typography style={styles.actName} numberOfLines={2}>{act.name || act.type}</Typography>
          <Typography style={styles.actDate}>
            {format(parseISO(act.startDate), 'EEEE, MMMM d, yyyy')}
          </Typography>

          {/* Key stats hero row */}
          <View style={styles.heroRow}>
            <View style={styles.heroStat}>
              <Typography style={styles.heroStatVal}>{km.toFixed(2)}</Typography>
              <Typography style={styles.heroStatLbl}>km</Typography>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStat}>
              <Typography style={styles.heroStatVal}>{formatPace(act.averageSpeed)}</Typography>
              <Typography style={styles.heroStatLbl}>/km pace</Typography>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStat}>
              <Typography style={styles.heroStatVal}>{formatDuration(act.movingTime)}</Typography>
              <Typography style={styles.heroStatLbl}>moving</Typography>
            </View>
          </View>
        </LinearGradient>

        {/* Performance */}
        <Card style={styles.card}>
          <Typography style={styles.section}>Performance</Typography>
          <StatRow icon={<MapPin color="#0ea5e9" size={16}/>} label="Distance" value={`${km.toFixed(2)} km`} color="#0ea5e9" />
          <StatRow icon={<Clock color="#f59e0b" size={16}/>} label="Moving Time" value={formatDuration(act.movingTime)} color="#f59e0b" />
          <StatRow icon={<Clock color="#94a3b8" size={16}/>} label="Elapsed Time" value={formatDuration(act.elapsedTime)} sub="includes stops" color="#94a3b8" />
          <StatRow icon={<TrendingUp color="#6366f1" size={16}/>} label="Avg Pace" value={`${formatPace(act.averageSpeed)} /km`} color="#6366f1" />
          <StatRow icon={<Wind color="#8b5cf6" size={16}/>} label="Max Speed" value={`${formatPace(act.maxSpeed)} /km`} sub="fastest km" color="#8b5cf6" />
        </Card>

        {/* Heart Rate */}
        {(act.averageHeartRate || act.maxHeartRate) ? (
          <Card style={styles.card}>
            <Typography style={styles.section}>Heart Rate</Typography>
            {act.averageHeartRate ? <StatRow icon={<Heart color="#ef4444" size={16}/>} label="Average HR" value={`${Math.round(act.averageHeartRate)} bpm`} color="#ef4444" /> : null}
            {act.maxHeartRate ? <StatRow icon={<Zap color="#f97316" size={16}/>} label="Max HR" value={`${Math.round(act.maxHeartRate)} bpm`} color="#f97316" /> : null}
            {act.sufferScore != null ? (
              <StatRow
                icon={<ActivityIcon color="#ec4899" size={16}/>}
                label="Suffer Score"
                value={`${act.sufferScore} · ${sufferLabel}`}
                sub="HR-based training load"
                color="#ec4899"
              />
            ) : null}
          </Card>
        ) : null}

        {/* Elevation & Cadence */}
        <Card style={styles.card}>
          <Typography style={styles.section}>Terrain & Form</Typography>
          <StatRow icon={<Mountain color="#f59e0b" size={16}/>} label="Elevation Gain" value={`${Math.round(act.totalElevationGain)} m`} color="#f59e0b" />
          {act.averageCadence ? (
            <StatRow
              icon={<Footprints color="#10b981" size={16}/>}
              label="Cadence"
              value={`${Math.round(act.averageCadence * (act.type === 'Run' ? 2 : 1))} spm`}
              sub={act.type === 'Run' ? 'steps/min (both feet)' : 'steps/min'}
              color="#10b981"
            />
          ) : null}
          {act.steps ? (
            <StatRow icon={<Footprints color="#14b8a6" size={16}/>} label="Est. Steps" value={act.steps.toLocaleString()} color="#14b8a6" />
          ) : null}
        </Card>

        {/* Energy */}
        {(act.calories || act.averageWatts) ? (
          <Card style={styles.card}>
            <Typography style={styles.section}>Energy</Typography>
            {act.calories ? <StatRow icon={<Flame color="#ef4444" size={16}/>} label="Calories Burned" value={`${act.calories} kcal`} color="#ef4444" /> : null}
            {act.averageWatts ? <StatRow icon={<Zap color="#f97316" size={16}/>} label="Average Power" value={`${Math.round(act.averageWatts)} W`} color="#f97316" /> : null}
          </Card>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  hero: { padding: 20, paddingTop: 10, paddingBottom: 28 },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center',
    justifyContent: 'center', marginBottom: 12,
  },
  actType: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  actName: { fontSize: 22, color: '#fff', fontWeight: '800', marginBottom: 4 },
  actDate: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 20 },
  heroRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 16 },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatVal: { fontSize: 20, fontWeight: '800', color: '#fff' },
  heroStatLbl: { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginTop: 2 },
  heroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.3)' },

  card: { margin: 16, marginTop: 0, marginBottom: 12 },
  section: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },

  statRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  statIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  statLabel: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },
  statSub: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 1 },
  statValue: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
});
