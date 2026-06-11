import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Zap } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { EmptyHint } from './common';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { predictRaceTimes, formatRaceTime, RacePrediction } from '../utils/performance';
import { useStore } from '../store/useStore';

const CONFIDENCE_COLOR: Record<RacePrediction['confidence'], string> = {
  high: theme.colors.success,
  medium: theme.colors.warning,
  low: theme.colors.textSecondary,
};

/**
 * Riegel race-time projections seeded from real best efforts (10K > 5K > 1K),
 * with an honest confidence chip per distance. Replaces the old widget that
 * extrapolated from the single fastest average pace of any run.
 */
export const RacePredictorWidget = memo(function RacePredictorWidget() {
  const bestEfforts = useStore((s) => s.bestEfforts);

  const result = useMemo(() => predictRaceTimes(bestEfforts), [bestEfforts]);
  const accent = familyStyle('records').accent;

  return (
    <WidgetCard
      family={WIDGET_FAMILY['RacePredictor']}
      title={WIDGET_TITLES['RacePredictor']}
      icon={Zap}
      caption={result ? `Based on your ${result.basis.label} best` : undefined}
    >
      {!result ? (
        <EmptyHint
          icon={Zap}
          family="records"
          text="Run a 1K, 5K or 10K effort and we'll project your race times from it."
        />
      ) : (
        result.predictions.map((p, i) => {
          const confColor = CONFIDENCE_COLOR[p.confidence];
          return (
            <View
              key={p.label}
              style={[styles.row, i === result.predictions.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={[styles.distPill, { backgroundColor: withAlpha(accent, 'tint') }]}>
                <Typography style={[styles.distTxt, { color: accent }]} numberOfLines={1}>
                  {p.label}
                </Typography>
              </View>
              <View style={{ flex: 1 }}>
                <Typography style={styles.time}>{formatRaceTime(p.seconds)}</Typography>
                <Typography style={styles.pace}>{p.pace}/km</Typography>
              </View>
              <View style={[styles.confChip, { backgroundColor: withAlpha(confColor, 'tint') }]}>
                <Typography style={[styles.confTxt, { color: confColor }]}>
                  {p.confidence}
                </Typography>
              </View>
            </View>
          );
        })
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.divider,
  },
  distPill: {
    minWidth: 58,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  distTxt: {
    ...theme.typography.caption,
  },
  time: {
    ...theme.typography.numericSm,
    color: theme.colors.text,
  },
  pace: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  confChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
  },
  confTxt: {
    ...theme.typography.micro,
    textTransform: 'uppercase',
  },
});
