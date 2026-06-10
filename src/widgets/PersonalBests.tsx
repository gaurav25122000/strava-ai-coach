import React, { memo, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowRight, Clock, Footprints, Mountain, TrendingUp, Trophy } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { PressableScale } from '../components/PressableScale';
import { Sheet } from '../components/Sheet';
import { EmptyHint } from './common';
import { formatDuration } from './_format';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { formatPace } from '../utils/dates';
import { formatRaceTime } from '../utils/performance';
import { useStore } from '../store/useStore';

const PB_DISTANCES: { meters: number; label: string }[] = [
  { meters: 1000, label: '1K' },
  { meters: 5000, label: '5K' },
  { meters: 10000, label: '10K' },
];

/**
 * 1K / 5K / 10K PB tiles from the bestEfforts store plus longest-run /
 * longest-walk / fastest-pace chips. "View all" opens a compact sheet
 * listing every record in one place.
 */
export const PersonalBestsWidget = memo(function PersonalBestsWidget() {
  const activities = useStore((s) => s.activities);
  const bestEfforts = useStore((s) => s.bestEfforts);
  const totalWalks = useStore((s) => s.userStats.totalWalks);
  const [sheetOpen, setSheetOpen] = useState(false);

  const personalBests = useMemo(() => {
    let longestRun = 0;
    let longestWalk = 0;
    let fastestPace = Infinity;
    let mostElevation = 0;
    let longestTime = 0;
    for (const a of activities) {
      if (a.type === 'Run') {
        if (a.distance > longestRun) longestRun = a.distance;
        if (a.averageSpeed > 0) {
          const pace = 1000 / a.averageSpeed / 60;
          if (pace < fastestPace) fastestPace = pace;
        }
      }
      if (a.type === 'Walk' && a.distance > longestWalk) longestWalk = a.distance;
      if (a.totalElevationGain > mostElevation) mostElevation = a.totalElevationGain;
      if (a.movingTime > longestTime) longestTime = a.movingTime;
    }
    return { longestRun, longestWalk, fastestPace, mostElevation, longestTime };
  }, [activities]);

  const accent = familyStyle('records').accent;
  const hasAnything =
    Object.keys(bestEfforts).length > 0 || personalBests.longestRun > 0 || personalBests.longestWalk > 0;

  const pbTiles = PB_DISTANCES.map((d) => {
    const e = bestEfforts[d.meters];
    return {
      label: d.label,
      time: e ? formatRaceTime(e.time) : '--',
      date: e?.date ?? '',
    };
  });

  return (
    <WidgetCard family={WIDGET_FAMILY['PersonalBests']} title={WIDGET_TITLES['PersonalBests']} icon={Trophy}>
      {!hasAnything ? (
        <EmptyHint
          icon={Trophy}
          family="records"
          text="Log some runs and your personal bests will start stacking up here."
        />
      ) : (
        <>
          <View style={styles.pbGrid}>
            {pbTiles.map((t) => (
              <View key={t.label} style={styles.pbTile}>
                <Typography style={[styles.pbTileDist, { color: accent }]}>{t.label}</Typography>
                <Typography style={styles.pbTileTime}>{t.time}</Typography>
                <Typography style={styles.pbTileDate} numberOfLines={1}>
                  {t.date || '—'}
                </Typography>
              </View>
            ))}
          </View>

          <View style={styles.chipRow}>
            <View style={styles.chip}>
              <Footprints color={accent} size={11} />
              <Typography style={styles.chipTxt}>
                Longest run {(personalBests.longestRun / 1000).toFixed(1)} km
              </Typography>
            </View>
            <View style={styles.chip}>
              <Mountain color={accent} size={11} />
              <Typography style={styles.chipTxt}>
                Peak elev {Math.round(personalBests.mostElevation)} m
              </Typography>
            </View>
          </View>
          {isFinite(personalBests.fastestPace) ? (
            <View style={styles.chipRow}>
              <View style={styles.chip}>
                <TrendingUp color={accent} size={11} />
                <Typography style={styles.chipTxt}>
                  Fastest pace {formatPace(personalBests.fastestPace)}/km
                </Typography>
              </View>
              <View style={styles.chip}>
                <Clock color={accent} size={11} />
                <Typography style={styles.chipTxt}>
                  Longest {formatDuration(personalBests.longestTime)}
                </Typography>
              </View>
            </View>
          ) : null}
          {personalBests.longestWalk > 0 ? (
            <View style={styles.chipRow}>
              <View style={styles.chip}>
                <Footprints color={theme.colors.secondary} size={11} />
                <Typography style={styles.chipTxt}>
                  Longest walk {(personalBests.longestWalk / 1000).toFixed(1)} km
                </Typography>
              </View>
              <View style={styles.chip}>
                <Footprints color={theme.colors.textSecondary} size={11} />
                <Typography style={styles.chipTxt}>{totalWalks || 0} walks</Typography>
              </View>
            </View>
          ) : null}

          <PressableScale onPress={() => setSheetOpen(true)} style={styles.viewAll}>
            <Typography style={[styles.viewAllTxt, { color: accent }]}>View all PBs</Typography>
            <ArrowRight color={accent} size={13} />
          </PressableScale>
        </>
      )}

      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Personal Bests"
        caption="Estimated from the average pace of your fastest matching runs"
        scrollable
      >
        {PB_DISTANCES.map((d) => {
          const e = bestEfforts[d.meters];
          return (
            <View key={d.meters} style={styles.sheetRow}>
              <View style={[styles.sheetPill, { backgroundColor: withAlpha(accent, 'tint') }]}>
                <Typography style={[styles.sheetPillTxt, { color: accent }]}>{d.label}</Typography>
              </View>
              <View style={{ flex: 1 }}>
                <Typography style={styles.sheetRowVal}>
                  {e ? formatRaceTime(e.time) : 'No effort yet'}
                </Typography>
                <Typography style={styles.sheetRowSub}>
                  {e ? `${formatPace(e.pace)}/km · ${e.date}` : 'Run this distance to set a time'}
                </Typography>
              </View>
            </View>
          );
        })}
        {[
          { label: 'Longest run', value: `${(personalBests.longestRun / 1000).toFixed(1)} km` },
          { label: 'Longest walk', value: `${(personalBests.longestWalk / 1000).toFixed(1)} km` },
          {
            label: 'Fastest pace',
            value: isFinite(personalBests.fastestPace) ? `${formatPace(personalBests.fastestPace)}/km` : '—',
          },
          { label: 'Peak elevation', value: `${Math.round(personalBests.mostElevation)} m` },
          { label: 'Longest session', value: formatDuration(personalBests.longestTime) },
        ].map((r) => (
          <View key={r.label} style={styles.sheetStatRow}>
            <Typography style={styles.sheetStatLbl}>{r.label}</Typography>
            <Typography style={styles.sheetStatVal}>{r.value}</Typography>
          </View>
        ))}
      </Sheet>
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  pbGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  pbTile: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 2,
  },
  pbTileDist: {
    ...theme.typography.label,
    textTransform: 'uppercase',
  },
  pbTileTime: {
    ...theme.typography.numericSm,
    color: theme.colors.text,
  },
  pbTileDate: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  chipTxt: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    flexShrink: 1,
  },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingVertical: 4,
  },
  viewAllTxt: {
    ...theme.typography.caption,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.divider,
  },
  sheetPill: {
    width: 44,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
  },
  sheetPillTxt: {
    ...theme.typography.caption,
  },
  sheetRowVal: {
    ...theme.typography.subtitle,
    color: theme.colors.text,
  },
  sheetRowSub: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  sheetStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.divider,
  },
  sheetStatLbl: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
  },
  sheetStatVal: {
    ...theme.typography.footnote,
    color: theme.colors.text,
    fontFamily: theme.fonts.semibold,
  },
});
