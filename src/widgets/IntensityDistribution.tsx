import React, { memo, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Activity, Info } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Sheet } from '../components/Sheet';
import { PressableScale } from '../components/PressableScale';
import { Typography } from '../components/Typography';
import { theme, withAlpha } from '../theme';
import { WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { intensityBucket, resolveHrZones, zoneOf } from '../utils/hrZones';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';
import { bigStat, StatChip } from './_shared';

export const IntensityDistributionWidget = memo(function IntensityDistributionWidget() {
  const activities = useStore((s) => s.activities);
  const hrZones = useStore((s) => s.hrZones);
  const userProfile = useStore((s) => s.userProfile);
  const [infoOpen, setInfoOpen] = useState(false);

  const resolved = useMemo(() => resolveHrZones(hrZones, userProfile), [hrZones, userProfile]);

  const dist = useMemo(() => {
    let easy = 0;
    let moderate = 0;
    let hard = 0;
    let usedZones = false;
    for (const a of activities) {
      const buckets = a.zones?.find((z) => z.type === 'heartrate')?.buckets;
      if (buckets && buckets.length) {
        // Strava's own time-in-zone (seconds): Z1-Z2 easy, Z3 moderate, Z4+ hard.
        usedZones = true;
        buckets.forEach((b, i) => {
          const t = Number.isFinite(b.time) ? b.time : 0;
          if (i <= 1) easy += t;
          else if (i === 2) moderate += t;
          else hard += t;
        });
      } else if ((a.averageHeartRate || 0) > 0) {
        // No cached zone data: weight the whole session by moving time, banded
        // by which resolved zone its average HR lands in.
        const t = a.movingTime || 0;
        const bucket = intensityBucket(zoneOf(a.averageHeartRate as number, resolved));
        if (bucket === 'easy') easy += t;
        else if (bucket === 'moderate') moderate += t;
        else hard += t;
      }
    }
    const total = easy + moderate + hard;
    if (total <= 0) return null;
    const easyPct = Math.round((easy / total) * 100);
    const hardPct = Math.round((hard / total) * 100);
    // Moderate takes the remainder so the three bands always sum to exactly 100.
    const moderatePct = Math.max(0, 100 - easyPct - hardPct);
    return { easyPct, moderatePct, hardPct, usedZones };
  }, [activities, resolved]);

  const family = WIDGET_FAMILY.IntensityDistribution;

  // Assess against the polarized 80/20 target, not a single easy %: the worst
  // pattern is too much MODERATE (gray-zone "junk miles"), then too little
  // easy, then no real hard stimulus.
  const status = useMemo(() => {
    if (!dist) return null;
    const { easyPct, moderatePct, hardPct } = dist;
    if (moderatePct >= 30) return { label: 'Too much gray zone', color: theme.colors.error };
    if (easyPct < 70) return { label: 'Easy days too hard', color: theme.colors.error };
    if (hardPct < 8 && easyPct >= 88) return { label: 'Add some intensity', color: theme.colors.warning };
    if (easyPct >= 75 && moderatePct <= 22) return { label: 'Nicely polarized', color: theme.colors.success };
    return { label: 'Build more polarization', color: theme.colors.warning };
  }, [dist]);

  const z3Lower = resolved.bounds[2];
  const z4Lower = resolved.bounds[3];

  return (
    <>
      <WidgetCard
        family={family}
        title={WIDGET_TITLES.IntensityDistribution}
        icon={Activity}
        onPress={dist ? () => setInfoOpen(true) : undefined}
        action={
          <PressableScale onPress={() => setInfoOpen(true)} hitSlop={theme.hitSlop}>
            <Info size={14} color={theme.colors.textSecondary} />
          </PressableScale>
        }
      >
        {!dist || !status ? (
          <EmptyHint
            icon={Activity}
            family={family}
            text="No heart-rate time yet — sync activities recorded with an HR monitor to see your easy/moderate/hard balance."
          />
        ) : (
          <>
            <View style={bigStat.row}>
              <View style={bigStat.numWrap}>
                <Typography style={[bigStat.num, { color: theme.colors.success }]}>
                  {dist.easyPct}
                </Typography>
                <Typography style={bigStat.unit}>% easy</Typography>
              </View>
              <StatChip color={status.color} label={status.label} />
            </View>
            <View style={styles.barTrack}>
              {dist.easyPct > 0 && (
                <View style={{ width: `${dist.easyPct}%`, backgroundColor: theme.colors.success }} />
              )}
              {dist.moderatePct > 0 && (
                <View style={{ width: `${dist.moderatePct}%`, backgroundColor: theme.colors.warning }} />
              )}
              {dist.hardPct > 0 && (
                <View style={{ width: `${dist.hardPct}%`, backgroundColor: theme.colors.error }} />
              )}
            </View>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: theme.colors.success }]} />
                <Typography style={styles.legendTxt}>{dist.easyPct}% easy</Typography>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: theme.colors.warning }]} />
                <Typography style={styles.legendTxt}>{dist.moderatePct}% mod</Typography>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: theme.colors.error }]} />
                <Typography style={styles.legendTxt}>{dist.hardPct}% hard</Typography>
              </View>
            </View>
          </>
        )}
      </WidgetCard>

      <Sheet
        visible={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="The 80/20 rule"
        caption={
          dist?.usedZones
            ? 'Weighted by Strava heart-rate zones'
            : 'Estimated from each activity’s average HR'
        }
      >
        <Typography style={styles.sheetBody}>
          Polarized training keeps ~80% of your time easy and most of the rest
          genuinely hard. The moderate "gray zone" should stay small — too much
          of it is the classic junk-miles mistake.
        </Typography>
        {[
          { color: theme.colors.success, label: 'Easy (Z1–Z2)', desc: `Below ${z3Lower} bpm · ~80% of training` },
          { color: theme.colors.warning, label: 'Moderate (Z3)', desc: `${z3Lower}–${z4Lower} bpm · keep this small` },
          { color: theme.colors.error, label: 'Hard (Z4–Z5)', desc: `Above ${z4Lower} bpm · the other ~15–20%` },
        ].map((row) => (
          <View key={row.label} style={[styles.sheetRow, { backgroundColor: withAlpha(row.color, 'soft') }]}>
            <View style={[styles.dot, { backgroundColor: row.color }]} />
            <View style={styles.sheetRowText}>
              <Typography style={[styles.sheetRowLabel, { color: row.color }]}>{row.label}</Typography>
              <Typography style={styles.sheetRowDesc}>{row.desc}</Typography>
            </View>
          </View>
        ))}
      </Sheet>
    </>
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
  sheetBody: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textSecondary,
    marginBottom: 14,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  sheetRowText: { flex: 1 },
  sheetRowLabel: { fontSize: 13, fontWeight: '800' },
  sheetRowDesc: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '600', marginTop: 1 },
});
