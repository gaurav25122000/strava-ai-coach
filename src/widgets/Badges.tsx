import React, { memo, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { PressableScale } from '../components/PressableScale';
import { Sheet } from '../components/Sheet';
import { BadgeMedal } from '../components/BadgeMedal';
import { BadgeProgressRing, ringBoxSize } from './_badgeProgressRing';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { computeMilestoneProgress, getAllMilestoneDefs, MilestoneDef } from '../services/milestones';
import { useStore } from '../store/useStore';

const MEDAL_SIZE = 64;
const NEW_WINDOW_MS = 7 * 86400000;

/**
 * Earned-first badge strip: earned medals (newest first, NEW pip inside the
 * last 7 days), then locked medals wearing a thin progress ring fed by
 * computeMilestoneProgress. Tapping a badge opens a compact detail sheet
 * with earned date or live progress plus a "next up" nudge.
 */
export const BadgesWidget = memo(function BadgesWidget() {
  const milestones = useStore((s) => s.milestones);
  const activities = useStore((s) => s.activities);
  const [selected, setSelected] = useState<MilestoneDef | null>(null);

  const defs = getAllMilestoneDefs();
  const accent = familyStyle('records').accent;

  const progress = useMemo(() => computeMilestoneProgress(activities), [activities]);

  const earnedById = useMemo(
    () => new Map(milestones.map((m) => [m.id, m])),
    [milestones],
  );

  // Earned first (newest unlock first), then locked closest-to-earned first.
  const ordered = useMemo(() => {
    const earned = defs.filter((d) => earnedById.has(d.id));
    const locked = defs.filter((d) => !earnedById.has(d.id));
    earned.sort((a, b) => {
      const ta = new Date(earnedById.get(a.id)!.earnedAt).getTime();
      const tb = new Date(earnedById.get(b.id)!.earnedAt).getTime();
      return tb - ta;
    });
    locked.sort((a, b) => (progress[b.id]?.pct ?? 0) - (progress[a.id]?.pct ?? 0));
    return [...earned, ...locked];
  }, [defs, earnedById, progress]);

  // Closest unearned milestone by pct — the "next up" nudge in the sheet.
  const nextUp = useMemo(() => {
    let best: { def: MilestoneDef; pct: number } | null = null;
    for (const def of defs) {
      if (earnedById.has(def.id)) continue;
      const p = progress[def.id];
      if (!p) continue;
      if (!best || p.pct > best.pct) best = { def, pct: p.pct };
    }
    return best;
  }, [defs, earnedById, progress]);

  const selectedEarned = selected ? earnedById.get(selected.id) : undefined;
  const selectedProgress = selected ? progress[selected.id] : undefined;

  return (
    <WidgetCard
      family={WIDGET_FAMILY['Badges']}
      title={WIDGET_TITLES['Badges']}
      icon={Trophy}
      action={
        <View style={[styles.countChip, { backgroundColor: withAlpha(accent, 'tint') }]}>
          <Typography style={[styles.countTxt, { color: accent }]}>
            {milestones.length}/{defs.length} earned
          </Typography>
        </View>
      }
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {ordered.map((def) => {
          const earned = earnedById.get(def.id);
          const prog = progress[def.id];
          const isNew =
            !!earned && Date.now() - new Date(earned.earnedAt).getTime() < NEW_WINDOW_MS;
          const medal = (
            <BadgeMedal
              milestone={{
                title: def.title,
                description: def.description,
                icon: def.icon,
                category: def.category,
                earnedAt: earned?.earnedAt ?? null,
              }}
              size={MEDAL_SIZE}
              unlocked={!!earned}
              hideLabel
            />
          );
          return (
            <PressableScale key={def.id} onPress={() => setSelected(def)} style={styles.cell}>
              <View style={styles.medalBox}>
                {earned || !prog ? (
                  medal
                ) : (
                  <BadgeProgressRing
                    size={MEDAL_SIZE}
                    pct={prog.pct}
                    color={accent}
                    trackColor={theme.colors.surface}
                  >
                    {medal}
                  </BadgeProgressRing>
                )}
                {isNew && <View style={[styles.newPip, { backgroundColor: accent }]} />}
              </View>
              <Typography style={[styles.cellTitle, !earned && styles.cellTitleLocked]} numberOfLines={2}>
                {def.title}
              </Typography>
              <Typography style={styles.cellSub}>
                {earned
                  ? format(parseISO(earned.earnedAt), 'MMM yyyy')
                  : prog
                    ? `${Math.round(prog.pct * 100)}%`
                    : 'Locked'}
              </Typography>
            </PressableScale>
          );
        })}
      </ScrollView>

      <Sheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title}
        caption={selected?.description}
      >
        {selected && (
          <View style={styles.sheetBody}>
            <BadgeMedal
              milestone={{
                title: selected.title,
                description: selected.description,
                icon: selected.icon,
                category: selected.category,
                earnedAt: selectedEarned?.earnedAt ?? null,
              }}
              size={84}
              unlocked={!!selectedEarned}
              hideLabel
            />
            <Typography style={styles.sheetStatus}>
              {selectedEarned
                ? `Earned ${format(parseISO(selectedEarned.earnedAt), 'd MMM yyyy')}`
                : selectedProgress
                  ? selectedProgress.label
                  : 'Not yet earned — keep going!'}
            </Typography>
            {nextUp && nextUp.def.id !== selected.id && (
              <Typography style={styles.sheetNextUp}>
                Next up: {nextUp.def.title} — {Math.round(nextUp.pct * 100)}% there
              </Typography>
            )}
          </View>
        )}
      </Sheet>
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  countChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9,
  },
  countTxt: {
    ...theme.typography.micro,
  },
  strip: {
    gap: 14,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  cell: {
    alignItems: 'center',
    width: MEDAL_SIZE + 20,
  },
  medalBox: {
    width: ringBoxSize(MEDAL_SIZE),
    height: ringBoxSize(MEDAL_SIZE),
    alignItems: 'center',
    justifyContent: 'center',
  },
  newPip: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  cellTitle: {
    ...theme.typography.micro,
    color: theme.colors.text,
    textAlign: 'center',
    marginTop: 6,
  },
  cellTitleLocked: {
    color: theme.colors.textSecondary,
  },
  cellSub: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  sheetBody: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  sheetStatus: {
    ...theme.typography.footnote,
    color: theme.colors.text,
    textAlign: 'center',
  },
  sheetNextUp: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
