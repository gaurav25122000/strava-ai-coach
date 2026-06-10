import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertTriangle, ThumbsUp } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { theme, withAlpha } from '../theme';
import { WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';

export const InjuryAlertWidget = memo(function InjuryAlertWidget() {
  const injuries = useStore((s) => s.injuries);

  return (
    <WidgetCard
      family={WIDGET_FAMILY.InjuryAlert}
      title={WIDGET_TITLES.InjuryAlert}
      icon={AlertTriangle}
    >
      {injuries.length === 0 ? (
        <EmptyHint
          icon={ThumbsUp}
          family={WIDGET_FAMILY.InjuryAlert}
          text="No active injuries — log niggles in Gear & Health"
        />
      ) : (
        <View style={styles.band}>
          <AlertTriangle color={theme.colors.warning} size={20} />
          <View style={styles.textCol}>
            <Typography style={styles.title}>
              {injuries.length} active issue{injuries.length > 1 ? 's' : ''}
            </Typography>
            <Typography style={styles.body}>
              Prioritize active recovery and don't push through sharp pain.
            </Typography>
          </View>
          <View style={styles.countBubble}>
            <Typography style={styles.countNum}>{injuries.length}</Typography>
          </View>
        </View>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: withAlpha(theme.colors.warning, 'soft'),
    borderColor: withAlpha(theme.colors.warning, 'strong'),
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    padding: 12,
  },
  textCol: { flex: 1 },
  title: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginBottom: 2 },
  body: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 17 },
  countBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: withAlpha(theme.colors.warning, 'medium'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  countNum: { fontSize: 13, fontWeight: '900', color: theme.colors.warning },
});
