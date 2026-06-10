import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Bike, Home } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { theme } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';
import { bigStat, RIDE_TYPES, StatChip } from './_shared';

export const TrainerRatioWidget = memo(function TrainerRatioWidget() {
  const activities = useStore((s) => s.activities);

  const ratio = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    const rides = activities.filter(
      (a) => RIDE_TYPES.has(a.type) && new Date(a.startDate).getTime() >= cutoff,
    );
    if (!rides.length) return null;
    // VirtualRide is indoor by definition even when the trainer flag is unset.
    const trainerCount = rides.filter((a) => a.trainer === true || a.type === 'VirtualRide').length;
    const outdoorCount = rides.length - trainerCount;
    return {
      total: rides.length,
      trainerCount,
      outdoorCount,
      trainerPct: Math.round((trainerCount / rides.length) * 100),
      outdoorPct: Math.round((outdoorCount / rides.length) * 100),
    };
  }, [activities]);

  const family = WIDGET_FAMILY.TrainerRatio;
  const accent = familyStyle(family).accent;

  return (
    <WidgetCard
      family={family}
      title={WIDGET_TITLES.TrainerRatio}
      icon={Bike}
      caption="Last 30 days"
    >
      {!ratio ? (
        <EmptyHint
          icon={Bike}
          family={family}
          text="No rides in the last 30 days — log outdoor or trainer rides to compare where your saddle time goes."
        />
      ) : (
        <>
          <View style={bigStat.row}>
            <View style={bigStat.numWrap}>
              <Typography style={[bigStat.num, { color: accent }]}>
                {ratio.outdoorPct}
              </Typography>
              <Typography style={bigStat.unit}>% outdoor</Typography>
            </View>
            <StatChip
              color={accent}
              icon={Bike}
              label={`${ratio.total} ride${ratio.total === 1 ? '' : 's'}`}
            />
          </View>
          <View style={styles.barTrack}>
            {ratio.outdoorPct > 0 && (
              <View style={{ width: `${ratio.outdoorPct}%`, backgroundColor: accent }} />
            )}
            {ratio.trainerPct > 0 && (
              <View style={{ width: `${ratio.trainerPct}%`, backgroundColor: theme.colors.textSecondary }} />
            )}
          </View>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: accent }]} />
              <Typography style={styles.legendTxt}>{ratio.outdoorCount} outdoor</Typography>
            </View>
            <View style={styles.legendItem}>
              <Typography style={styles.legendTxt}>{ratio.trainerCount} trainer</Typography>
              <Home size={10} color={theme.colors.textSecondary} />
            </View>
          </View>
        </>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  barTrack: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    marginBottom: 10,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendTxt: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
