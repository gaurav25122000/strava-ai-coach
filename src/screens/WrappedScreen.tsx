import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Share2, Sparkles } from 'lucide-react-native';
import { useCanvasRef } from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Typography } from '../components/Typography';
import { PressableScale } from '../components/PressableScale';
import { Button } from '../components/Button';
import { WrappedCard, WRAPPED_CARD_COUNT, useWrappedFonts } from '../components/WrappedCards';
import { EmptyHint } from '../widgets/common';
import { theme, withAlpha } from '../theme';
import { familyStyle } from '../utils/widgetFamilies';
import { monthStats, monthTitle, monthsWithData } from '../services/wrapped';
import { useStore } from '../store/useStore';

// Width of the offscreen card rendered just for the share snapshot — sharper
// than the on-screen size without the memory cost of a full 1080×1920 surface.
const SHARE_W = 720;

const fam = familyStyle('records');

/**
 * Monthly Wrapped: three Skia-rendered 9:16 story cards (volume, highlights,
 * records) per month, swipeable and shareable as PNGs.
 */
export default function WrappedScreen({ navigation }: any) {
  const activities = useStore((s) => s.activities);
  const milestones = useStore((s) => s.milestones);

  const months = useMemo(() => monthsWithData(activities), [activities]);
  const [month, setMonth] = useState<string | undefined>(months[0]);
  const [page, setPage] = useState(0);
  const [sharing, setSharing] = useState(false);
  const shareRef = useCanvasRef();
  // Cards render a blank placeholder until the Skia fonts resolve — sharing
  // before then would snapshot nothing, so the button stays disabled.
  const fontsReady = useWrappedFonts() !== null;

  // A re-sync can change the month list under us — keep the selection valid.
  useEffect(() => {
    if (!month || !months.includes(month)) setMonth(months[0]);
  }, [months, month]);

  const stats = useMemo(
    () => (month ? monthStats(activities, milestones, month) : null),
    [activities, milestones, month],
  );

  const win = useWindowDimensions();
  // Cap the 9:16 card to what's left after header + chips + dots + share
  // button + floating tab bar so the whole card is always visible.
  const maxH = Math.max(280, win.height - 330);
  const cardW = Math.min(win.width - theme.spacing.lg * 2, (maxH * 9) / 16);

  // The visible card is snapshotted from an OFFSCREEN high-res copy rendered
  // only while sharing — the on-screen canvases never pay the SHARE_W cost.
  useEffect(() => {
    if (!sharing) return;
    let cancelled = false;
    (async () => {
      try {
        // The offscreen Canvas mounts (and its fonts resolve) asynchronously,
        // so poll for a snapshot instead of trusting a fixed frame count.
        let image = shareRef.current?.makeImageSnapshot();
        for (let attempt = 0; !image && attempt < 20 && !cancelled; attempt += 1) {
          await new Promise<void>((resolve) => setTimeout(resolve, 50));
          image = shareRef.current?.makeImageSnapshot();
        }
        if (cancelled) return;
        if (!image) throw new Error('snapshot failed');
        const base64 = image.encodeToBase64();
        const fileUri = `${FileSystem.cacheDirectory}wrapped-${month}-card${page + 1}.png`;
        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: 'image/png' });
        } else {
          useStore.getState().setToast({
            title: 'Error',
            message: 'Sharing is not available on this device',
            type: 'error',
          });
        }
      } catch {
        if (!cancelled) {
          useStore.getState().setToast({
            title: 'Share failed',
            message: 'Could not render the card image.',
            type: 'error',
          });
        }
      } finally {
        if (!cancelled) setSharing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sharing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <PressableScale
          onPress={() => {
            // Cross-tab deep links can land here with nothing beneath us.
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.navigate('MenuHome');
          }}
          hitSlop={theme.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={24} color={theme.colors.text} />
        </PressableScale>
        <Typography style={styles.headerTitle}>Monthly Wrapped</Typography>
        <View style={{ width: 24 }} />
      </View>

      {!months.length || !month || !stats ? (
        <View style={styles.emptyWrap}>
          <EmptyHint
            icon={Sparkles}
            family="records"
            text="Sync some activities and your month becomes shareable story cards."
          />
        </View>
      ) : (
        <>
          {/* Month chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            style={styles.chipScroll}
          >
            {months.map((m) => {
              const selected = m === month;
              return (
                <PressableScale
                  key={m}
                  onPress={() => setMonth(m)}
                  style={[
                    styles.chip,
                    selected && { backgroundColor: fam.tint, borderColor: withAlpha(fam.accent, 'heavy') },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Typography style={[styles.chipText, selected && { color: fam.accent }]}>
                    {monthTitle(m, true)}
                  </Typography>
                </PressableScale>
              );
            })}
          </ScrollView>

          {/* Card pager */}
          <FlatList
            data={Array.from({ length: WRAPPED_CARD_COUNT }, (_, i) => i)}
            keyExtractor={(i) => String(i)}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) =>
              setPage(
                Math.max(
                  0,
                  Math.min(
                    WRAPPED_CARD_COUNT - 1,
                    Math.round(e.nativeEvent.contentOffset.x / win.width),
                  ),
                ),
              )
            }
            renderItem={({ item }) => (
              <View style={[styles.pageWrap, { width: win.width }]}>
                <WrappedCard page={item} month={month} stats={stats} width={cardW} />
              </View>
            )}
          />

          {/* Page dots */}
          <View style={styles.dotsRow}>
            {Array.from({ length: WRAPPED_CARD_COUNT }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === page && { backgroundColor: fam.accent, width: 18 },
                ]}
              />
            ))}
          </View>

          <View style={styles.shareRow}>
            <Button
              title="Share this card"
              icon={Share2}
              family="records"
              loading={sharing}
              disabled={!fontsReady}
              fullWidth
              onPress={() => setSharing(true)}
            />
          </View>

          {/* Offscreen high-res copy of the visible card, mounted only while
              sharing so makeImageSnapshot has something crisp to capture. */}
          {sharing && (
            <View style={styles.offscreen} pointerEvents="none">
              <WrappedCard page={page} month={month} stats={stats} width={SHARE_W} canvasRef={shareRef} />
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  headerTitle: {
    ...theme.typography.heading,
    color: theme.colors.text,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: 130,
  },
  chipScroll: {
    flexGrow: 0,
  },
  chipRow: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  pageWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: theme.spacing.sm,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: theme.borderRadius.full,
    backgroundColor: withAlpha('#FFFFFF', 'medium'),
  },
  shareRow: {
    paddingHorizontal: theme.spacing.lg,
    // Clears the floating tab bar, matching pushed-screen bottom padding.
    paddingBottom: 110,
  },
  offscreen: {
    position: 'absolute',
    left: -SHARE_W * 2,
    top: 0,
  },
});
