import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, StyleSheet,
  TextInput, ScrollView, SectionList, RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { theme, withAlpha } from '../theme';
import { Typography } from '../components/Typography';
import { Skeleton } from '../components/Skeleton';
import { SkeletonHero, SkeletonActivityRow } from '../components/SkeletonPresets';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { PressableScale } from '../components/PressableScale';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { useStore, Activity } from '../store/useStore';
import { StravaService } from '../services/strava';
import { performStravaSync } from '../services/syncRunner';
import { familyStyle } from '../utils/widgetFamilies';
import { formatPace as formatPaceMinKm, activityDayKey, mondayOf } from '../utils/dates';
import { sportIcon } from '../utils/sportIcon';
import { Icon } from '../components/Icon';
import {
  Search, SlidersHorizontal, Activity as ActivityIcon,
  Flame, Link as LinkIcon, Check, ArrowLeftRight,
} from 'lucide-react-native';
import {
  format, parseISO, isToday, isYesterday, isThisWeek, isThisYear,
  startOfMonth, isSameMonth,
} from 'date-fns';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type ActivitiesStackParamList = {
  ActivitiesList: undefined;
  ActivityDetail: { activity: Activity };
  CompareActivities: { ids: [string, string] };
};

const TYPES = ['All', 'Run', 'Ride', 'Walk', 'Workout'];

type SortKey = 'date' | 'distance' | 'pace';
const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'date', label: 'Most recent' },
  { key: 'distance', label: 'Longest distance' },
  { key: 'pace', label: 'Fastest pace' },
];

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

// Bucket title for a given activity date. Today → Yesterday → This Week →
// Earlier in {Month} → {Month YYYY}.
function bucketTitle(date: Date, now: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  if (isThisWeek(date, { weekStartsOn: 1 })) return 'This Week';
  if (isSameMonth(date, now)) return `Earlier in ${format(date, 'MMMM')}`;
  if (isThisYear(date)) return format(date, 'MMMM');
  return format(date, 'MMMM yyyy');
}

// Short relative date used inside the row meta line.
function shortRelDate(date: Date): string {
  if (isToday(date)) return 'TODAY';
  if (isYesterday(date)) return 'YESTERDAY';
  if (isThisWeek(date, { weekStartsOn: 1 })) return format(date, 'EEE').toUpperCase();
  if (isThisYear(date)) return format(date, 'MMM d').toUpperCase();
  return format(date, 'MMM d, yyyy').toUpperCase();
}

// Map activity type → widget family.
function familyForType(type: string): 'activity' | 'records' | 'health' {
  if (type === 'Workout') return 'records';
  return 'activity';
}

type Nav = NativeStackNavigationProp<ActivitiesStackParamList, 'ActivitiesList'>;

// ─── MetricChip ──────────────────────────────────────────────────────────────
// Tiny inline stat block used inside the row "big metric row".
function MetricChip({
  value, label, color,
}: { value: string; label: string; color?: string }) {
  return (
    <View style={s.metricBlock}>
      <Typography style={[s.metricVal, color ? { color } : null]}>{value}</Typography>
      <Typography style={s.metricLbl}>{label}</Typography>
    </View>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────
interface RowProps {
  act: Activity;
  maxDistance: number;
  onPress: () => void;
  /** Per-section local position, used to cap the stagger to the visible window. */
  staggerIndex: number;
  /** Only play the entrance cascade the first time this content appears; a
   *  no-op on scroll recycling, filter, and refresh re-renders. */
  animate: boolean;
  /** Compare select mode: row is one of the (max 2) picked activities. */
  selected?: boolean;
}

function ActivityRow({ act, maxDistance, onPress, staggerIndex, animate, selected }: RowProps) {
  const fam = familyStyle(familyForType(act.type));
  const km = act.distance / 1000;
  const distanceFrac = maxDistance > 0 ? Math.max(0.08, km / maxDistance) : 0.1;
  const rpe = act.sufferScore;

  const date = parseISO(act.startDate);
  const dayDate = parseISO(activityDayKey(act));
  const timeStr = format(date, 'h:mm a');

  // RPE colour interpolation: 0 → fam accent, 100 → error red. The lerp lands
  // in rgb space, so derived tints are rgba (alpha suffixes only work on hex).
  const rpeRgb = rpe != null
    ? (() => {
      const t = Math.min(1, Math.max(0, rpe / 100));
      const a = hexToRgb(fam.accent);
      const b = hexToRgb(theme.colors.error);
      return {
        r: Math.round(a.r + (b.r - a.r) * t),
        g: Math.round(a.g + (b.g - a.g) * t),
        b: Math.round(a.b + (b.b - a.b) * t),
      };
    })()
    : null;
  const rpeColor = rpeRgb ? `rgb(${rpeRgb.r},${rpeRgb.g},${rpeRgb.b})` : null;
  const rpeBg = rpeRgb ? `rgba(${rpeRgb.r},${rpeRgb.g},${rpeRgb.b},0.13)` : undefined;
  const rpeBorder = rpeRgb ? `rgba(${rpeRgb.r},${rpeRgb.g},${rpeRgb.b},0.53)` : undefined;

  const paceOrSpeed = act.type === 'Ride'
    ? `${(act.averageSpeed * 3.6).toFixed(1)}`
    : formatPace(act.averageSpeed);
  const paceLabel = act.type === 'Ride' ? 'KM/H' : '/KM';

  // Cap the cascade to the first ~10 rows of the section so deep lists land
  // together instead of all firing at the 280ms clamp; drive it from the
  // shared spring so the curve matches the rest of the app.
  const entering = animate
    ? FadeInDown.delay(Math.min(staggerIndex, 10) * 55)
        .springify()
        .damping(theme.motion.spring.damping)
        .stiffness(theme.motion.spring.stiffness)
        .mass(theme.motion.spring.mass)
    : undefined;

  return (
    <Animated.View entering={entering}>
      <PressableScale onPress={onPress} style={s.rowCard}>
        {/* Inner top stroke for depth */}
        <View style={s.rowInnerStroke} pointerEvents="none" />

        {/* Left: gradient sport pill */}
        <LinearGradient
          colors={fam.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[s.sportPill, theme.shadows.glow(fam.accent)]}
        >
          <View style={[s.sportPillInner, { borderColor: withAlpha(fam.accent, 'heavy') }]}>
            {sportIcon(act.type, 22, theme.colors.onAccent)}
          </View>
        </LinearGradient>

        {/* Middle */}
        <View style={s.rowMid}>
          <Typography style={s.rowName} numberOfLines={1}>
            {act.name || act.type}
          </Typography>

          <View style={s.metaRow}>
            <Typography style={[s.metaChip, { color: fam.accent }]}>{act.type.toUpperCase()}</Typography>
            <View style={[s.metaDot, { backgroundColor: withAlpha(theme.colors.textSecondary, 'strong') }]} />
            <Typography style={s.metaChip}>{shortRelDate(dayDate)}</Typography>
            <View style={[s.metaDot, { backgroundColor: withAlpha(theme.colors.textSecondary, 'strong') }]} />
            <Typography style={s.metaChip}>{timeStr.toUpperCase()}</Typography>
          </View>

          {/* Big metric row: distance as hero */}
          <View style={s.bigMetricRow}>
            <View style={s.heroMetric}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                <AnimatedNumber value={km} decimals={2} style={s.heroMetricVal} />
                <Typography style={s.heroMetricUnit}>KM</Typography>
              </View>
              <Typography style={[s.metricLbl, { color: fam.accent }]}>DISTANCE</Typography>
            </View>
            <MetricChip value={formatDuration(act.movingTime)} label="TIME" />
            <MetricChip value={paceOrSpeed} label={paceLabel} />
            {act.averageHeartRate ? (
              <MetricChip value={`${Math.round(act.averageHeartRate)}`} label="BPM" color={theme.colors.error} />
            ) : null}
            {act.totalElevationGain > 0 ? (
              <MetricChip value={`${Math.round(act.totalElevationGain)}`} label="ELEV M" />
            ) : null}
          </View>
        </View>

        {/* Right: RPE pill + vertical distance bar */}
        <View style={s.rowRight}>
          {rpe != null && rpeColor ? (
            <View style={[s.rpePill, { backgroundColor: rpeBg, borderColor: rpeBorder }]}>
              <Icon icon={Flame} variant="plain" size="xs" color={rpeColor} />
              <Typography style={[s.rpeText, { color: rpeColor }]}>{rpe}</Typography>
            </View>
          ) : null}
          <View style={s.distanceBarTrack}>
            <LinearGradient
              colors={fam.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[s.distanceBarFill, { height: `${distanceFrac * 100}%` }]}
            />
          </View>
        </View>

        {/* Compare-mode selection overlay */}
        {selected ? (
          <View
            pointerEvents="none"
            style={[s.selectOverlay, { borderColor: fam.accent, backgroundColor: withAlpha(fam.accent, 'soft') }]}
          >
            <View style={[s.selectBadge, { backgroundColor: fam.accent }]}>
              <Icon icon={Check} variant="plain" size="xs" color={theme.colors.onAccent} />
            </View>
          </View>
        ) : null}
      </PressableScale>
    </Animated.View>
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

// ─── Hero pill (this-week totals) ────────────────────────────────────────────
function HeroPill({
  value, label, accent,
}: { value: number | string; label: string; accent: string }) {
  return (
    <View style={[s.heroPill, { borderBottomColor: accent }]}>
      {typeof value === 'number' ? (
        <AnimatedNumber value={value} style={s.heroPillVal} />
      ) : (
        <Typography style={s.heroPillVal}>{value}</Typography>
      )}
      <Typography style={s.heroPillLbl}>{label}</Typography>
    </View>
  );
}

// ─── Empty / Loading ─────────────────────────────────────────────────────────
function EmptyState({ onConnect }: { onConnect: () => void }) {
  const fam = familyStyle('activity');
  return (
    <View style={s.emptyWrap}>
      <LinearGradient
        colors={fam.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.emptyIcon, theme.shadows.glow(fam.accent)]}
      >
        <ActivityIcon color={theme.colors.onAccent} size={56} />
      </LinearGradient>
      <Typography style={s.emptyTitle}>No activities yet</Typography>
      <Typography style={s.emptySub}>
        Connect Strava to pull your runs, rides, and walks into one place.
      </Typography>
      <Button
        title="Connect Strava"
        icon={LinkIcon}
        size="lg"
        onPress={onConnect}
        style={{ marginTop: 14 }}
      />
    </View>
  );
}

function LoadingSkeleton() {
  return (
    <View style={{ paddingTop: 4, flex: 1, backgroundColor: theme.colors.background }}>
      <SkeletonHero />
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 14 }}>
        {[0, 1, 2, 3].map(i => (
          <Skeleton key={i} width={i === 0 ? 48 : 64} height={30} radius={999} />
        ))}
      </View>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <SkeletonActivityRow key={i} />
      ))}
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function ActivitiesScreen() {
  const activities = useStore(st => st.activities);
  const setToast = useStore(st => st.setToast);
  const lastSyncedAt = useStore(st => st.lastSyncedAt);
  const navigation = useNavigation<Nav>();
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [filter, setFilter] = useState('All');
  const [sort, setSort] = useState<SortKey>('date');
  const [showSort, setShowSort] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const before = useStore.getState().activities.length;
      const result = await performStravaSync({ force: true });
      if (result) {
        const added = useStore.getState().activities.length - before;
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setToast?.({
          title: added > 0 ? 'Synced' : 'Up to date',
          message: added > 0 ? `${added} new ${added === 1 ? 'activity' : 'activities'}` : 'Synced just now',
          type: 'success',
        });
      }
    } catch (err: any) {
      setToast?.({ title: 'Sync failed', message: err?.message || 'Try again', type: 'error' });
    } finally {
      setRefreshing(false);
    }
  }, [setToast]);

  const sorted = useMemo(() => {
    let list = [...activities];
    if (filter !== 'All') list = list.filter(a => a.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a => (a.name || a.type).toLowerCase().includes(q));
    }
    switch (sort) {
      case 'distance': list.sort((a, b) => b.distance - a.distance); break;
      case 'pace':     list.sort((a, b) => (b.averageSpeed || 0) - (a.averageSpeed || 0)); break;
      default:         list.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    }
    return list;
  }, [activities, filter, search, sort]);

  const maxDistance = useMemo(
    () => sorted.reduce((m, a) => Math.max(m, a.distance / 1000), 0),
    [sorted],
  );

  // Rows we've already revealed. Keeps the entrance cascade a one-time event:
  // scroll recycling, filter/search and refresh re-renders don't re-fire it.
  // Reset when sort changes so the new ordering choreographs once. The fresh
  // set is computed once per data change here — renderItem stays side-effect
  // free and stable.
  const animatedIds = useRef<Set<string>>(new Set());
  const prevSortRef = useRef(sort);
  const newlyRevealed = useMemo(() => {
    if (prevSortRef.current !== sort) {
      prevSortRef.current = sort;
      animatedIds.current.clear();
    }
    const fresh = new Set<string>();
    for (const a of sorted) {
      if (!animatedIds.current.has(a.id)) {
        fresh.add(a.id);
        animatedIds.current.add(a.id);
      }
    }
    return fresh;
  }, [sorted, sort]);

  // Build date-bucketed sections only when sorting by date.
  const sections = useMemo(() => {
    if (sort !== 'date') {
      return [{ title: '', data: sorted, count: sorted.length, order: 0 }];
    }
    const now = new Date();
    const buckets = new Map<string, { title: string; data: Activity[]; order: number; count: number }>();
    for (const a of sorted) {
      const d = parseISO(activityDayKey(a));
      const title = bucketTitle(d, now);
      const order = isToday(d) ? Number.MAX_SAFE_INTEGER
                  : isYesterday(d) ? Number.MAX_SAFE_INTEGER - 1
                  : isThisWeek(d, { weekStartsOn: 1 }) ? Number.MAX_SAFE_INTEGER - 2
                  : startOfMonth(d).getTime();
      if (!buckets.has(title)) buckets.set(title, { title, data: [], order, count: 0 });
      const b = buckets.get(title)!;
      b.data.push(a);
      b.count += 1;
    }
    return Array.from(buckets.values()).sort((x, y) => y.order - x.order);
  }, [sorted, sort]);

  // Week-to-date totals for hero pills.
  const weekStats = useMemo(() => {
    const monStart = mondayOf(new Date());
    let km = 0;
    let secs = 0;
    let count = 0;
    for (const a of activities) {
      const d = parseISO(a.startDate);
      if (d >= monStart) {
        km += a.distance / 1000;
        secs += a.movingTime;
        count += 1;
      }
    }
    return { km, secs, count };
  }, [activities]);

  const openDetail = useCallback((act: Activity) => {
    navigation.navigate('ActivityDetail', { activity: act });
  }, [navigation]);

  const toggleSelectMode = useCallback(() => {
    setSelectMode(v => !v);
    setSelected([]);
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => prev.includes(id)
      ? prev.filter(x => x !== id)
      : prev.length >= 2 ? prev : [...prev, id]);
  }, []);

  const onCompare = useCallback(() => {
    if (selected.length !== 2) return;
    const ids: [string, string] = [selected[0], selected[1]];
    setSelectMode(false);
    setSelected([]);
    navigation.navigate('CompareActivities', { ids });
  }, [selected, navigation]);

  function openSettings() {
    (navigation as any).getParent()?.navigate('Menu', { screen: 'Settings', initial: false });
  }

  const renderItem = useCallback(({ item, index }: { item: Activity; index: number }) => (
    // `index` from SectionList is local to the section, so the cascade
    // restarts per date bucket and stays in the visible window.
    <ActivityRow
      act={item}
      staggerIndex={index}
      animate={newlyRevealed.has(item.id)}
      maxDistance={maxDistance}
      selected={selectMode && selected.includes(item.id)}
      onPress={() => (selectMode ? toggleSelect(item.id) : openDetail(item))}
    />
  ), [newlyRevealed, maxDistance, openDetail, selectMode, selected, toggleSelect]);

  const isEmpty = !activities.length;
  const fam = familyStyle('activity');

  // While we have no rows yet, prefer skeletons over the empty state if either
  // a sync is in-flight OR we very recently completed one — gives a brief
  // window of "loading" instead of flashing "No activities yet".
  const lastSyncMs = lastSyncedAt ? Date.now() - new Date(lastSyncedAt).getTime() : Infinity;
  // If we have no activities yet, decide between skeleton and EmptyState by
  // whether Strava is connected. Authenticated + empty = first sync still
  // pending; unauthenticated + empty = show the connect CTA.
  const [stravaReady, setStravaReady] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    StravaService.initialize().then(() => {
      if (alive) setStravaReady(StravaService.isAuthenticated());
    });
    return () => { alive = false; };
  }, []);
  const showSkeleton =
    isEmpty &&
    (refreshing || lastSyncMs < 30_000 || (stravaReady === null) || (stravaReady && !lastSyncedAt));

  // Hero rendered as the first ListHeader so it scrolls with the list.
  const HeroHeader = (
    <View style={s.heroOuter}>
      <LinearGradient
        colors={fam.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.heroCard}
      >
        <View style={s.heroTopRow}>
          <View style={{ flex: 1 }}>
            <Typography style={s.heroTitle}>Activities</Typography>
            <Typography style={s.heroSub}>
              {selectMode ? 'Pick 2 activities to compare' : `${activities.length} synced from Strava`}
            </Typography>
          </View>
          {activities.length >= 2 && (
            <PressableScale
              style={s.compareBtn}
              onPress={toggleSelectMode}
              accessibilityRole="button"
              accessibilityLabel={selectMode ? 'Cancel compare' : 'Compare two activities'}
            >
              <Icon icon={ArrowLeftRight} variant="plain" size="xs" color={theme.colors.onAccent} />
              <Typography style={s.compareBtnText}>{selectMode ? 'CANCEL' : 'COMPARE'}</Typography>
            </PressableScale>
          )}
        </View>

        <View style={s.heroPillRow}>
          <HeroPill value={+weekStats.km.toFixed(1)} label="KM THIS WEEK" accent={theme.colors.onAccent} />
          <HeroPill value={formatDuration(weekStats.secs)} label="TIME" accent={theme.colors.onAccent} />
          <HeroPill value={weekStats.count} label="ACTIVITIES" accent={theme.colors.onAccent} />
        </View>
      </LinearGradient>
    </View>
  );

  // Sticky-feel filter bar lives outside the list.
  const FilterBar = (
    <View style={s.filterBar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chipList}
        style={{ flexGrow: 1, flexShrink: 1 }}
      >
        {TYPES.map(t => {
          const active = filter === t;
          const chipColor = t === 'All'
            ? theme.colors.primary
            : familyStyle(familyForType(t)).accent;
          return (
            <PressableScale
              key={t}
              style={[
                s.chip,
                { borderColor: withAlpha(chipColor, 'strong') },
                active && {
                  backgroundColor: chipColor,
                  borderColor: chipColor,
                  ...theme.shadows.glow(chipColor),
                },
              ]}
              onPress={() => setFilter(t)}
            >
              <Typography style={[s.chipText, { color: chipColor }, active && s.chipTextActive]}>
                {t.toUpperCase()}
              </Typography>
            </PressableScale>
          );
        })}
      </ScrollView>

      <PressableScale
        style={[s.toolBtn, showSort && { backgroundColor: withAlpha(fam.accent, 'tint'), borderColor: fam.accent }]}
        onPress={() => setShowSort(true)}
      >
        <Icon
          icon={SlidersHorizontal}
          variant="plain"
          size="sm"
          color={showSort ? fam.accent : theme.colors.textSecondary}
        />
      </PressableScale>
      <PressableScale
        style={[s.toolBtn, showSearch && { backgroundColor: withAlpha(fam.accent, 'tint'), borderColor: fam.accent }]}
        onPress={() => setShowSearch(v => !v)}
      >
        <Icon
          icon={Search}
          variant="plain"
          size="sm"
          color={showSearch ? fam.accent : theme.colors.textSecondary}
        />
      </PressableScale>
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Search input (toggled) */}
      {showSearch && (
        <View style={s.searchRow}>
          <View style={s.searchBox}>
            <Icon icon={Search} variant="plain" size="sm" color={theme.colors.textSecondary} />
            <TextInput
              autoFocus
              style={s.searchInput}
              placeholder="Search activities…"
              placeholderTextColor={theme.colors.textSecondary}
              value={search}
              onChangeText={setSearch}
            />
          </View>
        </View>
      )}

      {/* Body */}
      {isEmpty ? (
        showSkeleton ? <LoadingSkeleton /> : <EmptyState onConnect={openSettings} />
      ) : (
        <SectionList
          style={{ flex: 1 }}
          sections={sections}
          keyExtractor={a => a.id}
          ListHeaderComponent={
            <View>
              {HeroHeader}
              {FilterBar}
            </View>
          }
          renderItem={renderItem}
          renderSectionHeader={({ section }) => {
            const { title, count } = section as any;
            if (!title) return null;
            return (
              <View style={s.sectionHead}>
                <View style={[s.sectionDot, { backgroundColor: fam.accent }]} />
                <Typography style={s.sectionTitle}>{title}</Typography>
                <View style={s.sectionCountChip}>
                  <Typography style={s.sectionCountText}>{count}</Typography>
                </View>
              </View>
            );
          }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130, paddingTop: 0 }}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
              progressBackgroundColor={theme.colors.surface}
            />
          }
        />
      )}

      {/* Floating compare CTA — appears once both slots are picked */}
      {selectMode && selected.length === 2 && (
        <View style={s.compareCtaWrap} pointerEvents="box-none">
          <Button
            title="Compare"
            icon={ArrowLeftRight}
            size="lg"
            fullWidth
            onPress={onCompare}
          />
        </View>
      )}

      {/* Sort options */}
      <Sheet
        visible={showSort}
        onClose={() => setShowSort(false)}
        title="Sort by"
        caption="Order your activity list"
      >
        {SORT_OPTIONS.map((opt, i) => {
          const active = sort === opt.key;
          return (
            <PressableScale
              key={opt.key}
              haptic="selection"
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[s.sortOptRow, i === SORT_OPTIONS.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => { setSort(opt.key); setShowSort(false); }}
            >
              <Typography style={[s.sortOptText, active && { color: fam.accent }]}>
                {opt.label}
              </Typography>
              {active ? <Icon icon={Check} variant="plain" size="sm" color={fam.accent} /> : null}
            </PressableScale>
          );
        })}
      </Sheet>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  // ── Hero ───────────────────────────────────────────────────────────────
  heroOuter: { paddingTop: 4, paddingBottom: 12 },
  heroCard: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    ...theme.shadows.md,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  heroTitle: {
    fontSize: 28, fontWeight: '900', color: theme.colors.onAccent,
    letterSpacing: -0.6,
  },
  heroSub: {
    fontSize: 12, fontWeight: '700', color: withAlpha(theme.colors.onAccent, 'heavy'),
    letterSpacing: 0.4, marginTop: 2,
  },
  heroPillRow: { flexDirection: 'row', gap: 8 },
  heroPill: {
    flex: 1,
    backgroundColor: withAlpha(theme.colors.background, 'medium'),
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 3,
    alignItems: 'flex-start',
  },
  heroPillVal: {
    fontSize: 20, fontWeight: '900', color: theme.colors.onAccent,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
    minWidth: 28,
  },
  heroPillLbl: {
    fontSize: 9, fontWeight: '800', color: withAlpha(theme.colors.onAccent, 'heavy'),
    letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 2,
  },

  // ── Filter bar ─────────────────────────────────────────────────────────
  filterBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8,
  },
  chipList: { gap: 8, paddingRight: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: 1,
    justifyContent: 'center', alignItems: 'center', minHeight: 34,
  },
  chipText: {
    fontSize: 11, fontWeight: '900',
    letterSpacing: 1,
  },
  chipTextActive: { color: theme.colors.onAccent },
  toolBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Search ─────────────────────────────────────────────────────────────
  searchRow: { paddingHorizontal: 16, paddingTop: 8 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.surface, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text, fontWeight: '600' },

  // ── Sort sheet ─────────────────────────────────────────────────────────
  sortOptRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 15, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.divider,
  },
  sortOptText: { ...theme.typography.body, color: theme.colors.text },

  // ── Section heading ────────────────────────────────────────────────────
  sectionHead: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingTop: 18, paddingBottom: 10,
  },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: {
    flex: 1,
    fontSize: 12, fontWeight: '900', color: theme.colors.text,
    textTransform: 'uppercase', letterSpacing: 1.4,
  },
  sectionCountChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  sectionCountText: {
    fontSize: 10, fontWeight: '900', color: theme.colors.textSecondary,
    letterSpacing: 0.6,
  },

  // ── Row ────────────────────────────────────────────────────────────────
  rowCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: theme.colors.surface, borderRadius: 16,
    paddingVertical: 14, paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1, borderColor: theme.colors.border,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  rowInnerStroke: {
    position: 'absolute', left: 0, right: 0, top: 0, height: 0.5,
    backgroundColor: withAlpha(theme.colors.text, 'faint'),
  },
  sportPill: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  sportPillInner: {
    width: '100%', height: '100%', borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  rowMid: { flex: 1, minWidth: 0 },
  rowName: {
    fontSize: 16, fontWeight: '800', color: theme.colors.text,
    letterSpacing: -0.2, marginBottom: 4,
  },

  metaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 10,
  },
  metaChip: {
    fontSize: 11, fontWeight: '800', color: theme.colors.textSecondary,
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  metaDot: { width: 3, height: 3, borderRadius: 1.5 },

  bigMetricRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 14,
    flexWrap: 'wrap',
  },
  heroMetric: { gap: 2 },
  heroMetricVal: {
    fontSize: 22, fontWeight: '900', color: theme.colors.text,
    letterSpacing: -0.6, fontVariant: ['tabular-nums'],
  },
  heroMetricUnit: {
    fontSize: 10, fontWeight: '800', color: theme.colors.textSecondary,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  metricBlock: { gap: 2, alignItems: 'flex-start' },
  metricVal: {
    fontSize: 14, fontWeight: '900', color: theme.colors.text,
    letterSpacing: -0.2, fontVariant: ['tabular-nums'],
  },
  metricLbl: {
    fontSize: 9, fontWeight: '800', color: theme.colors.textSecondary,
    letterSpacing: 1, textTransform: 'uppercase',
  },

  rowRight: { alignItems: 'flex-end', justifyContent: 'space-between', minWidth: 40, height: 90 },
  rpePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    borderWidth: 1,
  },
  rpeText: { fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  distanceBarTrack: {
    width: 4, height: 60, borderRadius: 2,
    backgroundColor: theme.colors.divider, overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  distanceBarFill: { width: '100%', borderRadius: 2 },

  // ── Compare select mode ────────────────────────────────────────────────
  selectOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16, borderWidth: 2,
  },
  selectBadge: {
    position: 'absolute', top: 10, right: 10,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  compareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: withAlpha(theme.colors.background, 'medium'),
  },
  compareBtnText: {
    fontSize: 11, fontWeight: '900', color: theme.colors.onAccent,
    letterSpacing: 1,
  },
  compareCtaWrap: {
    position: 'absolute', left: 16, right: 16, bottom: 104,
  },

  // ── Empty ──────────────────────────────────────────────────────────────
  emptyWrap: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 80, gap: 14 },
  emptyIcon: {
    width: 120, height: 120, borderRadius: 60,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 22, fontWeight: '900', color: theme.colors.text,
    letterSpacing: -0.4, marginTop: 8,
  },
  emptySub: {
    fontSize: 14, fontWeight: '500',
    color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20,
  },
});
