import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Award } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { DonutRing } from '../components/DonutRing';
import { EmptyHint } from './common';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import {
  computeMilestoneProgress,
  getAllMilestoneDefs,
  MilestoneDef,
  MilestoneProgress,
} from '../services/milestones';
import { useStore } from '../store/useStore';

/** "2.3 km to go" / "0:12 /km to shave off" — one motivational line. */
function motivationLine(p: MilestoneProgress): string {
  if (p.unit === 'min/km') {
    if (!isFinite(p.current)) return 'Log an activity to set your pace baseline';
    const gap = p.current - p.target;
    if (gap <= 0) return 'Almost there!';
    const m = Math.floor(gap);
    const s = Math.round((gap - m) * 60);
    return `${m}:${String(s).padStart(2, '0')} /km to shave off`;
  }
  const remaining = Math.max(0, p.target - p.current);
  const v = remaining >= 100 ? Math.round(remaining) : Math.round(remaining * 10) / 10;
  return `${v} ${p.unit} to go`;
}

/**
 * The single closest unearned milestone (by progress pct) as a big ring.
 * Binary badges (early bird, cyclist…) carry no progress spec and are
 * automatically absent from the progress map, so they never surface here.
 */
export const NextBadgeWidget = memo(function NextBadgeWidget() {
  const activities = useStore((s) => s.activities);
  const milestones = useStore((s) => s.milestones);

  const next = useMemo(() => {
    const progress = computeMilestoneProgress(activities);
    const earned = new Set(milestones.map((m) => m.id));
    let best: { def: MilestoneDef; prog: MilestoneProgress } | null = null;
    for (const def of getAllMilestoneDefs()) {
      if (earned.has(def.id)) continue;
      const p = progress[def.id];
      if (!p) continue;
      if (!best || p.pct > best.prog.pct) best = { def, prog: p };
    }
    return best;
  }, [activities, milestones]);

  const fam = familyStyle('records');

  return (
    <WidgetCard family={WIDGET_FAMILY['NextBadge']} title={WIDGET_TITLES['NextBadge']} icon={Award}>
      {!next ? (
        <EmptyHint
          icon={Award}
          family="records"
          text="Every trackable badge is earned — incredible. New milestones will appear here."
        />
      ) : (
        <View style={styles.row}>
          <DonutRing
            size={110}
            stroke={10}
            progress={next.prog.pct}
            color={fam.accent}
            gradient={fam.gradient}
            trackColor={withAlpha(fam.accent, 'soft')}
          >
            <Typography style={styles.ringIcon}>{next.def.icon}</Typography>
            <Typography style={[styles.ringPct, { color: fam.accent }]}>
              {Math.round(next.prog.pct * 100)}%
            </Typography>
          </DonutRing>
          <View style={styles.info}>
            <Typography style={styles.title} numberOfLines={1}>
              {next.def.title}
            </Typography>
            <Typography style={styles.desc} numberOfLines={2}>
              {next.def.description}
            </Typography>
            <Typography style={styles.progressLabel}>{next.prog.label}</Typography>
            <Typography style={[styles.motivation, { color: fam.accent }]}>
              {motivationLine(next.prog)}
            </Typography>
          </View>
        </View>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  ringIcon: {
    fontSize: 28,
    lineHeight: 34,
  },
  ringPct: {
    ...theme.typography.caption,
    marginTop: 1,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  title: {
    ...theme.typography.subtitle,
    color: theme.colors.text,
  },
  desc: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
  },
  progressLabel: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 3,
  },
  motivation: {
    ...theme.typography.caption,
    marginTop: 1,
  },
});
