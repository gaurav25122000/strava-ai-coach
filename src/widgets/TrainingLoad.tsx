import React, { memo, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Flame, Info, Zap } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Sheet } from '../components/Sheet';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Typography } from '../components/Typography';
import { PressableScale } from '../components/PressableScale';
import { ChartBars, ChartLine } from '../components/charts';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { activityDayKey, localDateStr, mondayOf, weekKey } from '../utils/dates';
import { computeTrainingLoadSeries } from '../services/milestones';
import { sourceCapabilities, sourceLabel, useActivitySource } from '../services/activitySource';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';
import { bigStat, StatChip } from './_shared';

// Form (TSB) bands: above FRESH → race-ready, below STRAINED → fatigued,
// in between → productive training zone. Same thresholds the old dashboard
// used — tune here if the coaching logic evolves.
const TSB_FRESH_THRESHOLD = 5;
const TSB_STRAINED_THRESHOLD = -10;

/** Days of ATL/CTL history shown in the load chart. */
const LOAD_WINDOW_DAYS = 56;
/** Weeks of suffer-score history in the "Weekly effort" view. */
const EFFORT_WEEKS = 8;

const INFO_ROWS = [
  {
    label: 'ATL — Fatigue',
    desc: '7-day rolling average of suffer scores. High = you have been training hard recently.',
  },
  {
    label: 'CTL — Fitness',
    desc: '42-day rolling average. Higher CTL = more base fitness built over months of consistent training.',
  },
  {
    label: 'TSB — Form',
    desc: 'CTL minus ATL. Positive = fresh and ready to race. Negative = fatigued. Aim for +5 to +15 on race day.',
  },
] as const;

export const TrainingLoadWidget = memo(function TrainingLoadWidget() {
  const activities = useStore((s) => s.activities);
  const [mode, setMode] = useState<'load' | 'weekly'>('load');
  const [infoOpen, setInfoOpen] = useState(false);

  // "Weekly effort" is strictly Strava Relative Effort — without suffer
  // scores (health source) the toggle hides and the ATL/CTL view stays.
  const hasSufferScore = sourceCapabilities(useActivitySource()).sufferScore;
  const shownMode = hasSufferScore ? mode : 'load';

  // ONE pass over the activity list for the whole ATL/CTL window — the old
  // screen recomputed the full EWMA per visible day.
  const series = useMemo(
    () => computeTrainingLoadSeries(activities, LOAD_WINDOW_DAYS),
    [activities],
  );

  const loadData = useMemo(
    () =>
      series.labels.map((label, i) => ({
        label,
        value: series.atl[i],
        value2: series.ctl[i],
      })),
    [series],
  );

  // Weekly average suffer score over the last 8 weeks (absorbed from the
  // retired SufferTrend widget). Only real Strava Relative Effort counts here
  // — no distance proxy — so the bars stay honest.
  const weekly = useMemo(() => {
    const byWeek = new Map<string, { sum: number; count: number }>();
    for (const a of activities) {
      const suffer = a.sufferScore || 0;
      if (suffer <= 0) continue;
      const wk = weekKey(new Date(activityDayKey(a)));
      const cur = byWeek.get(wk) ?? { sum: 0, count: 0 };
      cur.sum += suffer;
      cur.count += 1;
      byWeek.set(wk, cur);
    }
    const thisMonday = mondayOf(new Date());
    const bars: { label: string; value: number }[] = [];
    let sessionsThisWeek = 0;
    for (let i = EFFORT_WEEKS - 1; i >= 0; i--) {
      const ws = new Date(thisMonday);
      ws.setDate(ws.getDate() - i * 7);
      const bucket = byWeek.get(localDateStr(ws));
      bars.push({
        label: `${ws.getMonth() + 1}/${ws.getDate()}`,
        value: bucket ? Math.round(bucket.sum / bucket.count) : 0,
      });
      if (i === 0) sessionsThisWeek = bucket?.count ?? 0;
    }
    return { bars, sessionsThisWeek, hasData: bars.some((b) => b.value > 0) };
  }, [activities]);

  const accent = familyStyle('recovery').accent;
  const { atl, ctl, tsb } = series.current;
  const form =
    tsb > TSB_FRESH_THRESHOLD
      ? { label: 'Fresh', color: theme.colors.success }
      : tsb < TSB_STRAINED_THRESHOLD
        ? { label: 'Strained', color: theme.colors.error }
        : { label: 'Optimal', color: familyStyle('progress').accent };

  // Today's call, absorbed from the retired Recovery Advisor widget.
  const advice =
    tsb < -15
      ? { status: 'Take a rest day', desc: 'Form is deeply negative — rest up to avoid overtraining.', color: theme.colors.error }
      : tsb < -5
        ? { status: 'Active recovery', desc: 'You carry some fatigue. Keep today easy.', color: theme.colors.accent }
        : { status: 'Ready to push', desc: 'You are fresh — a hard workout lands well today.', color: theme.colors.success };

  const openInfo = () => setInfoOpen(true);

  return (
    <>
      <WidgetCard
        family={WIDGET_FAMILY.TrainingLoad}
        title={WIDGET_TITLES.TrainingLoad}
        icon={Zap}
        onPress={openInfo}
        action={
          <PressableScale onPress={openInfo} hitSlop={theme.hitSlop}>
            <Info size={14} color={theme.colors.textSecondary} />
          </PressableScale>
        }
      >
        {activities.length === 0 ? (
          <EmptyHint
            icon={Zap}
            family={WIDGET_FAMILY.TrainingLoad}
            text={`No training data yet — sync ${sourceLabel()} activities to track fitness (CTL), fatigue (ATL) and form (TSB).`}
          />
        ) : (
          <>
            <View style={bigStat.row}>
              <View style={bigStat.numWrap}>
                <AnimatedNumber value={tsb} style={[bigStat.num, { color: form.color }] as any} />
                <Typography style={bigStat.unit}>TSB</Typography>
              </View>
              <StatChip color={form.color} label={form.label} />
            </View>

            <View style={[styles.adviceRow, { backgroundColor: withAlpha(advice.color, 'faint'), borderColor: withAlpha(advice.color, 'medium') }]}>
              <Typography style={[styles.adviceStatus, { color: advice.color }]}>{advice.status}</Typography>
              <Typography style={styles.adviceDesc}>{advice.desc}</Typography>
            </View>

            {hasSufferScore && (
              <View style={styles.toggleRow}>
                {(
                  [
                    { key: 'load', label: 'Load (ATL/CTL)' },
                    { key: 'weekly', label: 'Weekly effort' },
                  ] as const
                ).map((t) => {
                  const active = mode === t.key;
                  return (
                    <PressableScale
                      key={t.key}
                      onPress={() => setMode(t.key)}
                      style={[styles.toggleChip, active && { backgroundColor: withAlpha(accent, 'tint') }]}
                    >
                      <Typography
                        style={[styles.toggleTxt, active && { color: accent }]}
                      >
                        {t.label}
                      </Typography>
                    </PressableScale>
                  );
                })}
              </View>
            )}

            {shownMode === 'load' ? (
              <>
                <ChartLine
                  data={loadData}
                  height={160}
                  family="recovery"
                  color={accent}
                />
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: accent }]} />
                    <Typography style={styles.legendLbl}>ATL</Typography>
                    <Typography style={styles.legendVal}>{atl}</Typography>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: theme.colors.textSecondary }]} />
                    <Typography style={styles.legendLbl}>CTL</Typography>
                    <Typography style={styles.legendVal}>{ctl}</Typography>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: form.color }]} />
                    <Typography style={styles.legendLbl}>TSB</Typography>
                    <Typography style={[styles.legendVal, { color: form.color }]}>{tsb}</Typography>
                  </View>
                </View>
              </>
            ) : weekly.hasData ? (
              <>
                <ChartBars data={weekly.bars} height={150} family="recovery" />
                <Typography style={styles.footnote}>
                  Last {EFFORT_WEEKS} weeks · {weekly.sessionsThisWeek} session
                  {weekly.sessionsThisWeek === 1 ? '' : 's'} this week
                </Typography>
              </>
            ) : (
              <EmptyHint
                icon={Flame}
                family={WIDGET_FAMILY.TrainingLoad}
                text="No Relative Effort yet — record activities with heart rate so Strava can score weekly effort."
              />
            )}
          </>
        )}
      </WidgetCard>

      <Sheet
        visible={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="Training Load"
        caption={hasSufferScore
          ? 'Based on your Strava Suffer Scores, these three numbers track your fitness and fatigue like elite coaches do.'
          : 'Based on your training load, these three numbers track your fitness and fatigue like elite coaches do.'}
      >
        {INFO_ROWS.map((row) => (
          <View key={row.label} style={styles.infoRow}>
            <Typography style={[styles.infoLabel, { color: accent }]}>{row.label}</Typography>
            <Typography style={styles.infoDesc}>{row.desc}</Typography>
          </View>
        ))}
      </Sheet>
    </>
  );
});

const styles = StyleSheet.create({
  adviceRow: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  adviceStatus: {
    fontSize: 13,
    fontWeight: '900',
  },
  adviceDesc: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  toggleChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceMuted,
  },
  toggleTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.textSecondary,
  },
  legendRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 10 },
  legendItem: { alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 4 },
  legendLbl: {
    fontSize: 9,
    color: theme.colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  legendVal: { fontSize: 16, fontWeight: '900', color: theme.colors.text, marginTop: 1, letterSpacing: -0.3 },
  footnote: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 8,
  },
  infoRow: { marginBottom: 14 },
  infoLabel: { fontSize: 13, fontWeight: '800', marginBottom: 3 },
  infoDesc: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 19 },
});
