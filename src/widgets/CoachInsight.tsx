import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Zap } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { AIService } from '../services/ai';
import { useStore } from '../store/useStore';

/**
 * One-line coach take on the athlete's week — a pure heuristic over recent
 * activities (pace delta, volume trend, streaks, HR). Always renders: the
 * service falls back to a general training tip when there's no data.
 */
export const CoachInsightWidget = memo(function CoachInsightWidget() {
  const activities = useStore((s) => s.activities);
  const userStats = useStore((s) => s.userStats);

  const insight = useMemo(
    () => AIService.getMotivationalInsight(activities, userStats),
    [activities, userStats],
  );

  const accent = familyStyle(WIDGET_FAMILY.CoachInsight).accent;

  return (
    <WidgetCard
      family={WIDGET_FAMILY.CoachInsight}
      title={WIDGET_TITLES.CoachInsight}
      icon={Zap}
    >
      <View
        style={[
          styles.panel,
          {
            backgroundColor: withAlpha(accent, 'soft'),
            borderColor: withAlpha(accent, 'tint'),
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={[styles.emojiPill, { backgroundColor: withAlpha(accent, 'tint') }]}>
            <Typography style={styles.emoji}>{insight.emoji}</Typography>
          </View>
          <Typography style={[styles.label, { color: accent }]}>{insight.label}</Typography>
        </View>
        <Typography style={styles.text}>{insight.text}</Typography>
      </View>
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  panel: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emojiPill: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 14,
    lineHeight: 18,
  },
  label: {
    ...theme.typography.label,
    textTransform: 'uppercase',
  },
  text: {
    ...theme.typography.body,
    fontSize: 14,
    lineHeight: 22,
    color: theme.colors.text,
  },
});
