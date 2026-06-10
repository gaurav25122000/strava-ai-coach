import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CalendarDays, Target } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { PressableScale } from '../components/PressableScale';
import { DonutRing } from '../components/DonutRing';
import { Typography } from '../components/Typography';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';

/** Goals within two weeks of target get the urgent (error-coloured) chip. */
const URGENT_DAYS_OUT = 14;

/**
 * Per-goal rows: title, current phase, days-out chip, and a progress ring.
 * Tapping any row jumps to the Goals tab.
 */
export const ActiveGoalsWidget = memo(function ActiveGoalsWidget() {
  const goals = useStore((s) => s.goals);
  const navigation = useNavigation<any>();

  const fam = familyStyle(WIDGET_FAMILY.ActiveGoals);

  const rows = useMemo(
    () =>
      goals.map((goal) => ({
        id: goal.id,
        title: goal.title,
        phase: goal.phase.split('\n')[0],
        daysOut: Math.max(
          0,
          Math.round((new Date(goal.targetDate).getTime() - Date.now()) / 86400000),
        ),
        pct: Math.max(0, Math.min(1, goal.progress / 100)),
      })),
    [goals],
  );

  return (
    <WidgetCard
      family={WIDGET_FAMILY.ActiveGoals}
      title={WIDGET_TITLES.ActiveGoals}
      icon={Target}
    >
      {rows.length === 0 ? (
        <EmptyHint
          icon={Target}
          family={WIDGET_FAMILY.ActiveGoals}
          text="No goals yet — create one in the Goals tab and progress shows up here."
        />
      ) : (
        rows.map((row) => {
          const urgent = row.daysOut <= URGENT_DAYS_OUT;
          const chipColor = urgent ? theme.colors.error : fam.accent;
          return (
            <PressableScale
              key={row.id}
              onPress={() => navigation.navigate('Goals')}
              haptic="light"
              style={styles.goalRow}
              accessibilityRole="button"
              accessibilityLabel={`Open goal ${row.title}`}
            >
              <View style={styles.goalBody}>
                <Typography style={styles.goalTitle} numberOfLines={1}>
                  {row.title}
                </Typography>
                <Typography style={styles.goalSub} numberOfLines={1}>
                  {row.phase}
                </Typography>
                <View
                  style={[
                    styles.daysChip,
                    {
                      backgroundColor: withAlpha(chipColor, 'tint'),
                      borderColor: withAlpha(chipColor, 'strong'),
                    },
                  ]}
                >
                  <CalendarDays color={chipColor} size={10} />
                  <Typography style={[styles.daysChipTxt, { color: chipColor }]}>
                    {row.daysOut} days out
                  </Typography>
                </View>
              </View>
              <DonutRing
                size={64}
                stroke={7}
                progress={row.pct}
                color={fam.accent}
                gradient={fam.gradient}
                trackColor={theme.colors.background}
              >
                <Typography style={[styles.ringNum, { color: fam.accent }]}>
                  {Math.round(row.pct * 100)}
                </Typography>
                <Typography style={styles.ringLbl}>%</Typography>
              </DonutRing>
            </PressableScale>
          );
        })
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  goalBody: {
    flex: 1,
    marginRight: 12,
  },
  goalTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.2,
  },
  goalSub: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
    marginBottom: 6,
  },
  daysChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  daysChipTxt: {
    fontSize: 10,
    fontWeight: '800',
  },
  ringNum: {
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 16,
    letterSpacing: -0.4,
  },
  ringLbl: {
    fontSize: 9,
    color: theme.colors.textSecondary,
    fontWeight: '700',
  },
});
