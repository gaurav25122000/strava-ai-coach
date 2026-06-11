import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Droplet, Droplets } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { PressableScale } from '../components/PressableScale';
import { theme, withAlpha } from '../theme';
import { WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { useStore } from '../store/useStore';
import { localDateStr } from '../utils/dates';

const GOAL = 8;
const MAX_GLASSES = 20;
const FILLED = '#38BDF8';

/**
 * Today's hydration as eight tappable droplets. Tapping droplet i sets the
 * count to i+1; tapping the last filled droplet takes it back off, and the
 * +1 chip keeps counting past the row (capped at 20 in the store).
 */
export const WaterTrackerWidget = memo(function WaterTrackerWidget() {
  const waterLog = useStore((s) => s.waterLog);
  const setWater = useStore((s) => s.setWater);

  const today = localDateStr(new Date());
  const glasses = waterLog[today] ?? 0;
  const emptyColor = withAlpha(theme.colors.border, 'heavy');

  return (
    <WidgetCard
      family={WIDGET_FAMILY['WaterTracker']}
      title={WIDGET_TITLES['WaterTracker']}
      icon={Droplets}
      caption="tap to log · goal 8"
    >
      <View style={styles.row}>
        {Array.from({ length: GOAL }, (_, i) => {
          const filled = i < glasses;
          return (
            <PressableScale
              key={i}
              haptic="selection"
              hitSlop={theme.hitSlop}
              onPress={() => setWater(today, i + 1 === glasses ? i : i + 1)}
              accessibilityRole="button"
              accessibilityLabel={`Set water to ${i + 1 === glasses ? i : i + 1} glasses`}
            >
              <Droplet
                size={24}
                color={filled ? FILLED : emptyColor}
                fill={filled ? FILLED : 'transparent'}
              />
            </PressableScale>
          );
        })}
        <PressableScale
          haptic="selection"
          hitSlop={theme.hitSlop}
          onPress={() => setWater(today, Math.min(MAX_GLASSES, glasses + 1))}
          style={styles.plusChip}
          accessibilityRole="button"
          accessibilityLabel="Add one glass of water"
        >
          <Typography style={styles.plusTxt}>+1</Typography>
        </PressableScale>
      </View>
      <View style={styles.footer}>
        <Typography style={styles.countTxt}>
          {glasses} of {GOAL} glasses
        </Typography>
        {glasses >= GOAL && (
          <Typography style={styles.doneTxt}>Hydrated ✓</Typography>
        )}
      </View>
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  plusChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: withAlpha(FILLED, 'tint'),
  },
  plusTxt: {
    ...theme.typography.caption,
    fontFamily: theme.fonts.bold,
    color: FILLED,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  countTxt: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
  doneTxt: {
    ...theme.typography.micro,
    fontFamily: theme.fonts.bold,
    color: theme.colors.success,
  },
});
