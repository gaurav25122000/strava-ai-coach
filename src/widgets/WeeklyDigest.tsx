import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Lightbulb, Star, Zap } from 'lucide-react-native';
import { format } from 'date-fns';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';

/**
 * AI-generated weekly digest: summary, highlight, and tip rows. The old
 * dashboard only showed `tip || summary`; surfacing all three keeps the
 * generation cost honest.
 */
// weekKey is the Monday of the recapped week (YYYY-MM-DD) — render it as a
// human label rather than a bare ISO date.
function digestCaption(weekKey?: string): string | undefined {
  if (!weekKey) return undefined;
  const d = new Date(`${weekKey}T00:00:00`);
  if (isNaN(d.getTime())) return weekKey;
  return `week of ${format(d, 'd MMM')}`;
}

export const WeeklyDigestWidget = memo(function WeeklyDigestWidget() {
  const weeklyDigest = useStore((s) => s.weeklyDigest);

  const accent = familyStyle(WIDGET_FAMILY.WeeklyDigest).accent;

  const rows = weeklyDigest
    ? [
        { key: 'summary', label: 'Summary', icon: Zap, text: weeklyDigest.summary },
        { key: 'highlight', label: 'Highlight', icon: Star, text: weeklyDigest.highlight },
        { key: 'tip', label: 'Tip', icon: Lightbulb, text: weeklyDigest.tip },
      ].filter((r) => !!r.text)
    : [];

  return (
    <WidgetCard
      family={WIDGET_FAMILY.WeeklyDigest}
      title={WIDGET_TITLES.WeeklyDigest}
      icon={Zap}
      caption={digestCaption(weeklyDigest?.weekKey)}
    >
      {rows.length === 0 ? (
        <EmptyHint
          icon={Zap}
          family={WIDGET_FAMILY.WeeklyDigest}
          text="Digest generates after your first synced week — sync Strava and check back on Monday."
        />
      ) : (
        <View style={styles.rows}>
          {rows.map(({ key, label, icon: Icon, text }) => (
            <View key={key} style={styles.row}>
              <View style={[styles.iconPill, { backgroundColor: withAlpha(accent, 'tint') }]}>
                <Icon size={13} color={accent} />
              </View>
              <View style={styles.rowBody}>
                <Typography style={[styles.rowLabel, { color: accent }]}>{label}</Typography>
                <Typography style={styles.rowText}>{text}</Typography>
              </View>
            </View>
          ))}
        </View>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  rows: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  iconPill: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    ...theme.typography.micro,
    textTransform: 'uppercase',
  },
  rowText: {
    ...theme.typography.body,
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.text,
  },
});
