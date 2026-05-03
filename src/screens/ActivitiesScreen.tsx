import React, { useState, useMemo } from 'react';
import {
  View, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';
import { Typography } from '../components/Typography';
import { Card } from '../components/Card';
import { useStore, Activity } from '../store/useStore';
import {
  Footprints, Wind, Zap, Heart, TrendingUp,
  Mountain, Clock, Search, SlidersHorizontal,
} from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type ActivitiesStackParamList = {
  ActivitiesList: undefined;
  ActivityDetail: { activity: Activity };
};

const TYPES = ['All', 'Run', 'Ride', 'Walk', 'Workout'];
const TYPE_COLORS: Record<string, string> = {
  Run: '#6366f1', Ride: '#3b82f6', Walk: '#10b981',
  Workout: '#f59e0b', All: theme.colors.primary,
};

function formatPace(speed: number): string {
  if (!speed) return '--';
  const mPerK = 1000 / speed / 60;
  const mins = Math.floor(mPerK);
  const secs = Math.round((mPerK - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
function getIcon(type: string, color: string) {
  switch (type) {
    case 'Run': return <Footprints color={color} size={20} />;
    case 'Ride': return <Wind color={color} size={20} />;
    case 'Walk': return <Footprints color={color} size={20} />;
    default: return <Zap color={color} size={20} />;
  }
}

type Nav = NativeStackNavigationProp<ActivitiesStackParamList, 'ActivitiesList'>;

export default function ActivitiesScreen() {
  const { activities } = useStore();
  const navigation = useNavigation<Nav>();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [sort, setSort] = useState<'date' | 'distance' | 'pace'>('date');
  const [showSort, setShowSort] = useState(false);

  const sorted = useMemo(() => {
    let list = [...activities];
    if (filter !== 'All') list = list.filter(a => a.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a => (a.name || a.type).toLowerCase().includes(q));
    }
    switch (sort) {
      case 'distance': list.sort((a, b) => b.distance - a.distance); break;
      case 'pace': list.sort((a, b) => (b.averageSpeed || 0) - (a.averageSpeed || 0)); break;
      default: list.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    }
    return list;
  }, [activities, filter, search, sort]);

  const stats = useMemo(() => {
    const runs = activities.filter(a => a.type === 'Run');
    const totalKm = activities.reduce((s, a) => s + a.distance / 1000, 0);
    return { total: activities.length, runs: runs.length, totalKm: Math.round(totalKm) };
  }, [activities]);

  function openDetail(act: Activity) {
    navigation.navigate('ActivityDetail', { activity: act });
  }

  const renderItem = ({ item: act }: { item: Activity }) => {
    const color = TYPE_COLORS[act.type] || theme.colors.primary;
    const km = (act.distance / 1000).toFixed(2);
    return (
      <TouchableOpacity onPress={() => openDetail(act)} activeOpacity={0.8}>
        <Card style={[s.actCard, { borderLeftColor: color, borderLeftWidth: 3 }]}>
          <View style={s.actRow}>
            <View style={[s.iconWrap, { backgroundColor: color + '22' }]}>
              {getIcon(act.type, color)}
            </View>
            <View style={s.actInfo}>
              <Typography style={s.actName} numberOfLines={1}>
                {act.name || act.type}
              </Typography>
              <Typography style={s.actDate}>
                {format(parseISO(act.startDate), 'EEE, MMM d yyyy')}
              </Typography>
              {/* stat pills */}
              <View style={s.pills}>
                <View style={[s.pill, { backgroundColor: color + '18' }]}>
                  <TrendingUp color={color} size={10} />
                  <Typography style={[s.pillText, { color }]}>{km} km</Typography>
                </View>
                <View style={[s.pill, { backgroundColor: '#f59e0b18' }]}>
                  <Clock color="#f59e0b" size={10} />
                  <Typography style={[s.pillText, { color: '#f59e0b' }]}>{formatDuration(act.movingTime)}</Typography>
                </View>
                <View style={[s.pill, { backgroundColor: '#6366f118' }]}>
                  <Typography style={[s.pillText, { color: '#6366f1' }]}>{formatPace(act.averageSpeed)} /km</Typography>
                </View>
                {act.averageHeartRate ? (
                  <View style={[s.pill, { backgroundColor: '#ef444418' }]}>
                    <Heart color="#ef4444" size={10} />
                    <Typography style={[s.pillText, { color: '#ef4444' }]}>{Math.round(act.averageHeartRate)}</Typography>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={s.actRight}>
              <Typography style={[s.actKm, { color }]}>{km}</Typography>
              <Typography style={s.actKmLbl}>km</Typography>
              {act.totalElevationGain > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 2 }}>
                  <Mountain color={theme.colors.textSecondary} size={10} />
                  <Typography style={s.elevText}>{Math.round(act.totalElevationGain)}m</Typography>
                </View>
              ) : null}
            </View>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <LinearGradient colors={['#1a1a2e', '#16213e']} style={s.header}>
        <Typography style={s.title}>Activities</Typography>
        <View style={s.statRow}>
          <View style={s.headerStat}>
            <Typography style={s.headerStatVal}>{stats.total}</Typography>
            <Typography style={s.headerStatLbl}>Total</Typography>
          </View>
          <View style={s.headerDivider} />
          <View style={s.headerStat}>
            <Typography style={s.headerStatVal}>{stats.runs}</Typography>
            <Typography style={s.headerStatLbl}>Runs</Typography>
          </View>
          <View style={s.headerDivider} />
          <View style={s.headerStat}>
            <Typography style={s.headerStatVal}>{stats.totalKm}</Typography>
            <Typography style={s.headerStatLbl}>km Total</Typography>
          </View>
        </View>
      </LinearGradient>

      {/* Search + Sort */}
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Search color={theme.colors.textSecondary} size={14} />
          <TextInput
            style={s.searchInput}
            placeholder="Search activities…"
            placeholderTextColor={theme.colors.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity
          style={[s.sortBtn, showSort && { backgroundColor: theme.colors.primary + '22' }]}
          onPress={() => setShowSort(v => !v)}
        >
          <SlidersHorizontal color={showSort ? theme.colors.primary : theme.colors.textSecondary} size={16} />
        </TouchableOpacity>
      </View>

      {/* Sort options */}
      {showSort && (
        <View style={s.sortRow}>
          {(['date', 'distance', 'pace'] as const).map(opt => (
            <TouchableOpacity
              key={opt}
              style={[s.sortOpt, sort === opt && s.sortOptActive]}
              onPress={() => { setSort(opt); setShowSort(false); }}
            >
              <Typography style={[s.sortOptText, sort === opt && s.sortOptTextActive]}>
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </Typography>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Type filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chipList}
        style={s.chipRow}
      >
        {TYPES.map(t => {
          const active = filter === t;
          return (
            <TouchableOpacity
              key={t}
              style={[s.chip, active && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
              onPress={() => setFilter(t)}
            >
              <Typography style={[s.chipText, active && { color: '#fff' }]}>{t}</Typography>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Count */}
      <Typography style={s.countText}>{sorted.length} activities</Typography>

      {/* List */}
      <FlatList
        style={{ flex: 1 }}
        data={sorted}
        keyExtractor={a => a.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Card style={s.emptyCard}>
            <Typography style={s.emptyText}>No activities — sync Strava in Settings</Typography>
          </Card>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
  title: { fontSize: 26, fontWeight: '900', color: '#fff', marginBottom: 14 },
  statRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 14 },
  headerStat: { flex: 1, alignItems: 'center' },
  headerStatVal: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerStatLbl: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  headerDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },

  searchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.surface, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: theme.colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text },
  sortBtn: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },

  sortRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  sortOpt: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
  },
  sortOptActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  sortOptText: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },
  sortOptTextActive: { color: '#fff' },

  chipRow: { height: 50, marginVertical: 4, flexGrow: 0, flexShrink: 0 },
  chipList: { paddingHorizontal: 16, gap: 10, alignItems: 'center' },
  chip: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    justifyContent: 'center', alignItems: 'center', minHeight: 36,
  },
  chipText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },

  countText: { fontSize: 11, color: theme.colors.textSecondary, paddingHorizontal: 16, paddingVertical: 6 },

  actCard: { marginBottom: 10 },
  actRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actInfo: { flex: 1 },
  actName: { fontSize: 14, fontWeight: '700', color: theme.colors.text, marginBottom: 2 },
  actDate: { fontSize: 11, color: theme.colors.textSecondary, marginBottom: 6 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  pillText: { fontSize: 11, fontWeight: '700' },
  actRight: { alignItems: 'flex-end', minWidth: 48 },
  actKm: { fontSize: 18, fontWeight: '800' },
  actKmLbl: { fontSize: 10, color: theme.colors.textSecondary },
  elevText: { fontSize: 10, color: theme.colors.textSecondary },

  emptyCard: { margin: 16 },
  emptyText: { textAlign: 'center', color: theme.colors.textSecondary, fontSize: 14, paddingVertical: 12 },
});
