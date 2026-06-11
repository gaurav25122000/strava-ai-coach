import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Compass, Flame, Footprints, Settings, User, LucideIcon, ChevronRight } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { PressableScale } from '../components/PressableScale';
import { theme, withAlpha } from '../theme';
import { familyStyle, WidgetFamily, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';

interface ShortcutDef {
  key: string;
  title: string;
  sub: string;
  icon: LucideIcon;
  family: WidgetFamily;
  /** Screen inside the Menu tab's stack. */
  screen: string;
}

const SHORTCUTS: ShortcutDef[] = [
  { key: 'calories', title: 'Calorie Tracker', sub: 'Log meals & balance', icon: Flame,      family: 'health',   screen: 'CalorieTracker' },
  { key: 'gear',     title: 'Gear Health',     sub: 'Shoes & injuries',    icon: Footprints, family: 'activity', screen: 'GearHealth' },
  { key: 'profile',  title: 'Profile',         sub: 'Athlete details',     icon: User,       family: 'records',  screen: 'ProfileMain' },
  { key: 'settings', title: 'Settings',        sub: 'App & AI provider',   icon: Settings,   family: 'recovery', screen: 'Settings' },
];

/**
 * 2×2 grid of jump-off tiles into the Menu tab's sub-screens, so the most
 * used destinations are one tap from the dashboard.
 */
export const QuickNavWidget = memo(function QuickNavWidget() {
  const navigation = useNavigation<any>();

  return (
    <WidgetCard family={WIDGET_FAMILY['QuickNav']} title={WIDGET_TITLES['QuickNav']} icon={Compass}>
      <View style={styles.grid}>
        {SHORTCUTS.map((s) => {
          const fam = familyStyle(s.family);
          return (
            <PressableScale
              key={s.key}
              style={[styles.tile, { borderColor: withAlpha(fam.accent, 'strong') }]}
              // initial:false keeps MenuHome under the pushed screen — without
              // it a lazy-mounted Menu stack opens with the target as its only
              // route and back/popToTop dead-end there.
              onPress={() => navigation.navigate('Menu', { screen: s.screen, initial: false })}
              accessibilityRole="button"
              accessibilityLabel={s.title}
            >
              <LinearGradient
                colors={fam.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.tileIcon}
              >
                <s.icon size={16} color={theme.colors.onAccent} />
              </LinearGradient>
              <View style={styles.tileBody}>
                <Typography style={styles.tileTitle} numberOfLines={1}>{s.title}</Typography>
                <Typography style={styles.tileSub} numberOfLines={1}>{s.sub}</Typography>
              </View>
              <ChevronRight size={14} color={theme.colors.textSecondary} />
            </PressableScale>
          );
        })}
      </View>
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 11,
    paddingHorizontal: 11,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: theme.colors.surface,
  },
  tileIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBody: {
    flex: 1,
  },
  tileTitle: {
    ...theme.typography.footnote,
    fontFamily: theme.fonts.bold,
    color: theme.colors.text,
  },
  tileSub: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
});
