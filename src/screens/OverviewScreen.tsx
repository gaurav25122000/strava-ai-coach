import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Platform, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SlidersHorizontal } from 'lucide-react-native';
import { Milestone, useStore } from '../store/useStore';
import { WIDGET_REGISTRY } from '../widgets/registry';
import { WidgetCatalog } from '../components/WidgetCatalog';
import { Celebration } from '../components/Celebration';
import { PressableScale } from '../components/PressableScale';
import { Typography } from '../components/Typography';
import { theme, withAlpha } from '../theme';
import { StravaService } from '../services/strava';
import { performStravaSync } from '../services/syncRunner';
import { computeBestEfforts, computeMilestones } from '../services/milestones';
import { NotificationService } from '../services/notifications';

// One dashboard slot. memo + registry component (each widget is itself memoised
// with narrow selectors) means a slot only re-renders when ITS data changes.
const WidgetSlot = memo(function WidgetSlot({ id }: { id: string }) {
  const Widget = WIDGET_REGISTRY[id];
  if (!Widget) return null;
  return (
    <Animated.View entering={FadeInDown.duration(theme.motion.base)}>
      <Widget />
    </Animated.View>
  );
});

/**
 * Background data upkeep that belongs to the dashboard as a whole:
 * milestones/best-efforts derivation (+ unlock celebration), HR zones,
 * shoes, starred segments. Widgets that need one-off fetches (athlete stats,
 * photos, power zones) own those themselves.
 */
function useDashboardUpkeep(onNewMilestone: (m: Milestone) => void) {
  const activities = useStore((s) => s.activities);
  const lastSyncedAt = useStore((s) => s.lastSyncedAt);
  // Tracks ids we've already celebrated this session so a re-derivation
  // doesn't replay the confetti.
  const celebrated = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!activities.length) return;
    const { milestones, userStats, setMilestones, setBestEfforts, bestEfforts } = useStore.getState();
    const computed = computeMilestones(activities, milestones, {
      totalKm: userStats.totalKm,
      currentStreak: userStats.currentStreak,
      bestStreak: userStats.bestStreak,
    });

    if (celebrated.current === null) {
      // First run after launch: whatever exists is old news.
      celebrated.current = new Set(computed.map((m) => m.id));
      if (computed.length !== milestones.length) setMilestones(computed);
    } else if (computed.length !== milestones.length) {
      setMilestones(computed);
      const fresh = computed.filter((m) => !celebrated.current!.has(m.id));
      for (const m of fresh) celebrated.current!.add(m.id);
      if (fresh.length) {
        onNewMilestone(fresh[0]);
        NotificationService.notifyMilestone(fresh[0].icon, fresh[0].title, fresh[0].description).catch(() => {});
      }
    }

    // Best efforts: only write when something actually changed — the old
    // unconditional set caused a guaranteed extra full-screen render pass.
    const efforts = computeBestEfforts(activities);
    const changed =
      Object.keys(efforts).length !== Object.keys(bestEfforts).length ||
      Object.entries(efforts).some(([d, e]) => bestEfforts[Number(d)]?.time !== e.time);
    if (changed) setBestEfforts(efforts);
  }, [activities, onNewMilestone]);

  // Auxiliary Strava data that several widgets read (zones for HR widgets,
  // shoes for ShoeTracker, starred segments). Fetch once when connected and
  // missing; pull-to-refresh re-fetches.
  useEffect(() => {
    let alive = true;
    (async () => {
      await StravaService.initialize();
      if (!alive || !StravaService.isAuthenticated()) return;
      const { hrZones, starredSegments } = useStore.getState();
      if (!hrZones.length) {
        StravaService.fetchZones()
          .then((z) => { if (alive && z.length) useStore.getState().setHRZones(z); })
          .catch(() => {});
      }
      if (!starredSegments.length) {
        StravaService.fetchStarredSegments(10)
          .then((segs) => { if (alive && segs) useStore.getState().setStarredSegments(segs); })
          .catch(() => {});
      }
    })();
    return () => { alive = false; };
  }, [lastSyncedAt]);
}

// Refresh side-cars: lifetime stats + shoes + starred segments. Separate from
// performStravaSync because they're dashboard concerns, not core sync.
async function refreshAuxiliaryData() {
  if (!StravaService.isAuthenticated()) return;
  const store = useStore.getState();
  try {
    const { stats, athlete } = await StravaService.fetchAthleteStats();
    store.setLifetimeStats(stats);
    store.setAthleteStats({ stats, athlete });
    if (Array.isArray(athlete?.shoes)) {
      const prev = new Map(store.shoes.map((s) => [s.id, s]));
      store.setShoes(
        athlete.shoes.map((s: any) => ({
          // Preserve locally-edited fields (e.g. custom lifespan) across syncs.
          ...(prev.get(s.id) ?? {}),
          id: s.id,
          name: s.name,
          brand: prev.get(s.id)?.brand ?? '',
          distance: Math.round((s.distance || 0) / 1000),
        })),
      );
    }
  } catch (e) {
    console.warn('Could not fetch athlete stats:', e);
  }
  try {
    const zones = await StravaService.fetchZones();
    if (zones.length) store.setHRZones(zones);
  } catch {}
  try {
    const segs = await StravaService.fetchStarredSegments(10);
    if (segs) store.setStarredSegments(segs);
  } catch {}
}

export default function OverviewScreen() {
  const widgetLayout = useStore((s) => s.settings.widgetLayout);
  const updateSettings = useStore((s) => s.updateSettings);
  const setToast = useStore((s) => s.setToast);

  const [refreshing, setRefreshing] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [celebrating, setCelebrating] = useState<Milestone | null>(null);

  useDashboardUpkeep(setCelebrating);

  const layout = widgetLayout ?? [];

  const onRefresh = useCallback(async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRefreshing(true);
    try {
      const result = await performStravaSync({ force: true });
      await refreshAuxiliaryData();
      if (result === null && !StravaService.isAuthenticated()) {
        setToast({ title: 'Strava not connected', message: 'Connect in Settings to sync activities.', type: 'info' });
      }
    } catch (e: any) {
      setToast({ title: 'Sync failed', message: e?.message ?? 'Try again in a minute.', type: 'error' });
    } finally {
      setRefreshing(false);
    }
  }, [setToast]);

  const saveLayout = useCallback(
    (ids: string[]) => {
      updateSettings({ widgetLayout: ids });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [updateSettings],
  );

  const renderItem = useCallback(({ item }: { item: string }) => <WidgetSlot id={item} />, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <Typography style={styles.brand}>Coach</Typography>
        <PressableScale
          onPress={() => setCustomizing(true)}
          style={styles.customizeBtn}
          hitSlop={theme.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Customise dashboard"
        >
          <SlidersHorizontal size={17} color={theme.colors.textSecondary} />
        </PressableScale>
      </View>

      <FlatList
        data={layout}
        keyExtractor={(id) => id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        initialNumToRender={5}
        maxToRenderPerBatch={4}
        windowSize={7}
        contentContainerStyle={styles.listContent}
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

      <WidgetCatalog
        visible={customizing}
        activeIds={layout}
        onClose={() => setCustomizing(false)}
        onSave={saveLayout}
      />

      <Celebration milestone={celebrating} onDone={() => setCelebrating(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 6,
    paddingBottom: 4,
  },
  brand: {
    ...theme.typography.title,
    color: theme.colors.text,
  },
  customizeBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(theme.colors.border, 'strong'),
  },
  listContent: {
    paddingTop: theme.spacing.sm,
    paddingBottom: 120,
  },
});
