import React, { memo, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Crown, Info, Trophy } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { Sheet } from '../components/Sheet';
import { EmptyHint } from './common';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { formatRaceTime } from '../utils/performance';
import { useStore } from '../store/useStore';

const METHOD_ROWS = [
  { label: '1 km', desc: 'Best average pace from any run ≥ 1 km, extrapolated to 1 km time.' },
  { label: '5 km', desc: 'Best average pace from runs ≥ 4.25 km, extrapolated to 5 km time.' },
  { label: '10 km', desc: 'Best average pace from runs ≥ 8.5 km, extrapolated to 10 km time.' },
];

/**
 * Top-3 estimated best efforts. The crown/PR chip is computed per distance
 * (rank-1 only) instead of the old hardcoded "PR on every row", and each row
 * is honest about being an estimate from average pace.
 */
export const BestEffortsWidget = memo(function BestEffortsWidget() {
  const bestEfforts = useStore((s) => s.bestEfforts);
  const [infoOpen, setInfoOpen] = useState(false);

  const rows = useMemo(() => {
    const entries = Object.entries(bestEfforts)
      .map(([dist, e]) => ({ dist: Number(dist), ...e }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3);
    // Rank-1 per distance: only the fastest entry for a distance is the PR.
    const bestTimeByDist = new Map<number, number>();
    for (const e of entries) {
      const cur = bestTimeByDist.get(e.dist);
      if (cur === undefined || e.time < cur) bestTimeByDist.set(e.dist, e.time);
    }
    return entries.map((e) => ({ ...e, isPR: bestTimeByDist.get(e.dist) === e.time }));
  }, [bestEfforts]);

  const accent = familyStyle('records').accent;

  return (
    <WidgetCard
      family={WIDGET_FAMILY['BestEfforts']}
      title={WIDGET_TITLES['BestEfforts']}
      icon={Trophy}
      action={
        <TouchableOpacity activeOpacity={0.7} onPress={() => setInfoOpen(true)} hitSlop={theme.hitSlop}>
          <Info size={14} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      }
    >
      {rows.length === 0 ? (
        <EmptyHint
          icon={Trophy}
          family="records"
          text="Run at least 1 km and your estimated best efforts will appear here."
        />
      ) : (
        rows.map((e, i) => {
          const distLabel = e.dist >= 1000 ? `${e.dist / 1000}K` : `${e.dist}m`;
          return (
            <View key={e.dist} style={[styles.row, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
              <View
                style={[
                  styles.pill,
                  { backgroundColor: withAlpha(accent, 'tint'), borderColor: withAlpha(accent, 'strong') },
                ]}
              >
                <Trophy color={accent} size={13} />
                <Typography style={[styles.pillTxt, { color: accent }]}>{distLabel}</Typography>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Typography style={styles.time}>{formatRaceTime(e.time)}</Typography>
                <Typography style={styles.sub} numberOfLines={1}>
                  {e.date} · estimated from avg pace
                </Typography>
              </View>
              {e.isPR && (
                <View style={[styles.prChip, { backgroundColor: withAlpha(theme.colors.success, 'tint') }]}>
                  <Crown color={theme.colors.success} size={11} />
                  <Typography style={[styles.prTxt, { color: theme.colors.success }]}>PR</Typography>
                </View>
              )}
            </View>
          );
        })
      )}

      <Sheet
        visible={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="Best Efforts"
        caption="Fastest estimated times per distance, derived from the average pace of your best matching runs."
      >
        {METHOD_ROWS.map((r) => (
          <View key={r.label} style={styles.methodRow}>
            <Typography style={[styles.methodLbl, { color: accent }]}>{r.label}</Typography>
            <Typography style={styles.methodDesc}>{r.desc}</Typography>
          </View>
        ))}
      </Sheet>
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.divider,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  pillTxt: {
    ...theme.typography.caption,
  },
  time: {
    ...theme.typography.numericSm,
    color: theme.colors.text,
  },
  sub: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  prChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  prTxt: {
    ...theme.typography.micro,
  },
  methodRow: {
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.divider,
  },
  methodLbl: {
    ...theme.typography.caption,
    marginBottom: 2,
  },
  methodDesc: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
  },
});
