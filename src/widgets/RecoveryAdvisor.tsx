import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Heart } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { DonutRing } from '../components/DonutRing';
import { Typography } from '../components/Typography';
import { theme } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { computeTrainingLoadSeries } from '../services/milestones';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';

// TSB (training stress balance) bands: below REST → deeply fatigued, rest up;
// below EASY → carrying fatigue, keep it easy; otherwise fresh. Same
// thresholds the old dashboard used — tune here if the coaching logic evolves.
const TSB_REST_THRESHOLD = -15;
const TSB_EASY_THRESHOLD = -5;

export const RecoveryAdvisorWidget = memo(function RecoveryAdvisorWidget() {
  const activities = useStore((s) => s.activities);

  // ONE pass over the activity list — the old screen recomputed the full EWMA
  // per visible day.
  const tsb = useMemo(
    () => computeTrainingLoadSeries(activities, 14).current.tsb,
    [activities],
  );

  const score = useMemo(() => {
    if (tsb === 0) return null;
    if (tsb < TSB_REST_THRESHOLD)
      return {
        status: 'Take a Rest Day',
        desc: 'Your form is deeply negative. Rest up to avoid overtraining.',
        color: theme.colors.error,
      };
    if (tsb < TSB_EASY_THRESHOLD)
      return {
        status: 'Active Recovery',
        desc: 'You carry some fatigue. Keep it easy today.',
        color: theme.colors.accent,
      };
    return {
      status: 'Ready to Push',
      desc: 'You are fresh and ready for a hard workout.',
      color: theme.colors.success,
    };
  }, [tsb]);

  // Map the TSB band to a 0-1 ring score: very tired → 0, fresh → 1.
  const tsbRatio = Math.max(0, Math.min(1, (tsb + 25) / 40));

  return (
    <WidgetCard
      family={WIDGET_FAMILY.RecoveryAdvisor}
      title={WIDGET_TITLES.RecoveryAdvisor}
      icon={Heart}
    >
      {!score ? (
        <EmptyHint
          icon={Heart}
          family={WIDGET_FAMILY.RecoveryAdvisor}
          text="No training-load data yet — sync Strava activities with heart rate so Relative Effort can gauge your recovery."
        />
      ) : (
        <View style={styles.row}>
          <DonutRing
            size={88}
            stroke={9}
            progress={tsbRatio}
            color={score.color}
            gradient={[score.color, familyStyle('recovery').accent]}
            trackColor={theme.colors.background}
          >
            <Typography style={[styles.ringNum, { color: score.color }]}>
              {tsb > 0 ? '+' : ''}
              {tsb}
            </Typography>
            <Typography style={styles.ringLbl}>TSB</Typography>
          </DonutRing>
          <View style={styles.textCol}>
            <Typography style={[styles.status, { color: score.color }]}>
              {score.status}
            </Typography>
            <Typography style={styles.desc}>{score.desc}</Typography>
          </View>
        </View>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  textCol: { flex: 1, marginLeft: 14 },
  ringNum: { fontSize: 18, fontWeight: '900', lineHeight: 20, letterSpacing: -0.4 },
  ringLbl: { fontSize: 9, color: theme.colors.textSecondary, fontWeight: '700', marginTop: 1 },
  status: { fontSize: 16, fontWeight: '900', letterSpacing: -0.3, marginBottom: 4 },
  desc: { fontSize: 12, color: theme.colors.text, lineHeight: 17 },
});
