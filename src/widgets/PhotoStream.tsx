import React, { memo, useEffect, useMemo, useState } from 'react';
import { Image, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Image as ImageIcon } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { PressableScale } from '../components/PressableScale';
import { Skeleton } from '../components/Skeleton';
import { theme } from '../theme';
import { WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { useStore } from '../store/useStore';
import { StravaService } from '../services/strava';
import { EmptyHint } from './common';

// At most this many recent photo-bearing activities are fetched. The widget
// only mounts when visible (FlatList dashboard), so this is the lazy cap —
// the old screen fired 10 sequential fetches on Overview mount regardless.
const MAX_PHOTO_ACTIVITIES = 6;

export const PhotoStreamWidget = memo(function PhotoStreamWidget() {
  const activities = useStore((s) => s.activities);

  // Only activities Strava says actually carry photos are worth a fetch.
  const photoActivities = useMemo(
    () =>
      activities
        .filter((a) => (a.photoCount ?? 0) > 0)
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
        .slice(0, MAX_PHOTO_ACTIVITIES),
    [activities],
  );

  // Thumb URLs cached per activity id, in local state — Strava image URLs
  // expire, so they must never reach persistence.
  const [thumbsById, setThumbsById] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const missing = photoActivities.filter((a) => thumbsById[a.id] === undefined);
    if (!missing.length) return;
    let alive = true;
    setLoading(true);
    StravaService.initialize()
      .then(() => {
        if (!StravaService.isAuthenticated()) return null;
        return Promise.all(
          missing.map((a) =>
            StravaService.fetchActivityPhotos(a.id)
              .then(
                (photos) =>
                  [a.id, (photos || []).map((p) => p.urls?.['600'] || '').filter(Boolean)] as const,
              )
              .catch(() => [a.id, []] as const),
          ),
        );
      })
      .then((entries) => {
        if (alive && entries) {
          setThumbsById((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [photoActivities, thumbsById]);

  const thumbs = useMemo(
    () =>
      photoActivities.flatMap((a) =>
        (thumbsById[a.id] ?? []).map((url) => ({ url, activityId: a.id })),
      ),
    [photoActivities, thumbsById],
  );

  return (
    <WidgetCard
      family={WIDGET_FAMILY.PhotoStream}
      title={WIDGET_TITLES.PhotoStream}
      icon={ImageIcon}
    >
      {photoActivities.length === 0 ? (
        <EmptyHint
          icon={ImageIcon}
          family={WIDGET_FAMILY.PhotoStream}
          text="Photos you attach on Strava show up here"
        />
      ) : loading && thumbs.length === 0 ? (
        <View style={styles.skeletonRow}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width={110} height={110} radius={12} />
          ))}
        </View>
      ) : thumbs.length === 0 ? (
        <EmptyHint
          icon={ImageIcon}
          family={WIDGET_FAMILY.PhotoStream}
          text="Photos you attach on Strava show up here"
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbRow}
        >
          {thumbs.map((p, i) => (
            <PressableScale
              key={`${p.activityId}-${i}`}
              onPress={() =>
                Linking.openURL(`https://www.strava.com/activities/${p.activityId}`).catch(() => {})
              }
            >
              <Image source={{ uri: p.url }} style={styles.photoThumb} resizeMode="cover" />
            </PressableScale>
          ))}
        </ScrollView>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  skeletonRow: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  thumbRow: { gap: 10, paddingVertical: 4 },
  photoThumb: {
    width: 110,
    height: 110,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background,
  },
});
