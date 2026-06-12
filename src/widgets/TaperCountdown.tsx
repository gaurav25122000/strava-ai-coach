import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { CheckCircle2, Circle, Flag } from 'lucide-react-native';
import { format } from 'date-fns';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { PressableScale } from '../components/PressableScale';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { theme } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { TAPER_CHECKLIST, taperState } from '../services/taper';
import { useStore } from '../store/useStore';
import { bigStat } from './_shared';

/**
 * Days-to-race countdown with taper advice and a pre-race checklist. Lives in
 * the default layout but renders nothing at all outside the 21-day window of
 * a Race goal — the deliberate exception to the no-null widget rule.
 */
export const TaperCountdownWidget = memo(function TaperCountdownWidget() {
  const goals = useStore((s) => s.goals);
  const taperChecks = useStore((s) => s.taperChecks);
  const toggleTaperCheck = useStore((s) => s.toggleTaperCheck);

  const state = useMemo(() => taperState(goals), [goals]);

  if (!state) return null;

  const { goal, daysToRace, weekPhase, volumeAdvice } = state;
  const family = WIDGET_FAMILY.TaperCountdown;
  const accent = familyStyle(family).accent;
  const checked = taperChecks[goal.id] ?? [];
  const raceDay = goal.targetDate.split('T')[0];

  return (
    <WidgetCard family={family} title={WIDGET_TITLES.TaperCountdown} icon={Flag} caption={weekPhase}>
      <View style={bigStat.row}>
        <View style={bigStat.numWrap}>
          <AnimatedNumber value={daysToRace} style={[bigStat.num, { color: accent }] as any} />
          <Typography style={bigStat.unit}>{daysToRace === 1 ? 'day to race' : 'days to race'}</Typography>
        </View>
      </View>

      <Typography style={styles.raceTitle} numberOfLines={1}>
        {goal.title}
      </Typography>
      <Typography style={styles.raceDate}>
        {format(new Date(`${raceDay}T00:00:00`), 'EEEE, MMM d')}
      </Typography>
      <Typography style={styles.advice}>{volumeAdvice}</Typography>

      {TAPER_CHECKLIST.map((item) => {
        const done = checked.includes(item.id);
        return (
          <PressableScale
            key={item.id}
            onPress={() => toggleTaperCheck(goal.id, item.id)}
            style={styles.checkRow}
            hitSlop={theme.hitSlop}
          >
            {done ? (
              <CheckCircle2 size={18} color={theme.colors.success} />
            ) : (
              <Circle size={18} color={theme.colors.textSecondary} />
            )}
            <Typography style={[styles.checkTxt, done && styles.checkTxtDone]}>
              {item.label}
            </Typography>
          </PressableScale>
        );
      })}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  raceTitle: {
    ...theme.typography.subtitle,
    color: theme.colors.text,
  },
  raceDate: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  advice: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
    marginTop: 8,
    marginBottom: 10,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
  },
  checkTxt: {
    ...theme.typography.footnote,
    color: theme.colors.text,
  },
  checkTxtDone: {
    color: theme.colors.textSecondary,
    textDecorationLine: 'line-through',
  },
});
