import React from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronRight, Flame, Footprints, LucideIcon, Settings, User,
} from 'lucide-react-native';
import { Typography } from '../components/Typography';
import { PressableScale } from '../components/PressableScale';
import { StaggerItem } from '../components/Stagger';
import { theme, withAlpha } from '../theme';
import { familyStyle, WidgetFamily } from '../utils/widgetFamilies';
import { useStore } from '../store/useStore';

interface MenuItemDef {
  key: string;
  title: string;
  sub: string;
  icon: LucideIcon;
  family: WidgetFamily;
  screen: string;
}

const ITEMS: MenuItemDef[] = [
  { key: 'calories', title: 'Calorie Tracker', sub: 'Log meals, snap photos, track energy balance', icon: Flame,      family: 'health',   screen: 'CalorieTracker' },
  { key: 'gear',     title: 'Gear Health',     sub: 'Shoes, mileage and injury log',                icon: Footprints, family: 'activity', screen: 'GearHealth' },
  { key: 'settings', title: 'Settings',        sub: 'Strava, AI provider and preferences',          icon: Settings,   family: 'recovery', screen: 'Settings' },
];

const recordsFam = familyStyle('records');

/**
 * Hub screen behind the last tab: profile hero on top, then the app's
 * tool screens as rows. Every destination here is also reachable from the
 * dashboard Shortcuts widget.
 */
export default function MenuScreen({ navigation }: any) {
  const userProfile = useStore((s) => s.userProfile);
  const athleteStats = useStore((s) => s.athleteStats);

  const avatarUrl: string | undefined = athleteStats?.athlete?.profile;
  const hasAvatar = typeof avatarUrl === 'string'
    && /^https?:\/\//.test(avatarUrl)
    && !avatarUrl.includes('avatar/athlete');
  const initials = (userProfile.name || '')
    .split(' ')
    .map((p: string) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Typography style={styles.heading}>Menu</Typography>
        <Typography style={styles.caption}>Profile, tools and settings</Typography>

        {/* Profile hero — the "Profile" menu entry. */}
        <StaggerItem index={0}>
          <PressableScale
            onPress={() => navigation.navigate('ProfileMain')}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            <View style={styles.hero}>
              <View style={styles.avatarRing}>
                {hasAvatar ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatarFallback}>
                    {initials
                      ? <Typography style={styles.avatarInitials}>{initials}</Typography>
                      : <User size={26} color={recordsFam.accent} />}
                  </View>
                )}
              </View>
              <View style={styles.heroBody}>
                <Typography style={styles.heroName} numberOfLines={1}>
                  {userProfile.name || 'Your Profile'}
                </Typography>
                <Typography style={styles.heroSub}>Athlete details & training profile</Typography>
              </View>
              <ChevronRight size={20} color={theme.colors.textSecondary} />
            </View>
          </PressableScale>
        </StaggerItem>

        {ITEMS.map((item, i) => {
          const fam = familyStyle(item.family);
          return (
            <StaggerItem key={item.key} index={i + 1}>
              <PressableScale
                onPress={() => navigation.navigate(item.screen)}
                style={[styles.row, { borderColor: withAlpha(fam.accent, 'strong') }]}
                accessibilityRole="button"
                accessibilityLabel={item.title}
              >
                <LinearGradient
                  colors={fam.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.rowIcon}
                >
                  <item.icon size={19} color={theme.colors.onAccent} />
                </LinearGradient>
                <View style={styles.rowBody}>
                  <Typography style={styles.rowTitle}>{item.title}</Typography>
                  <Typography style={styles.rowSub} numberOfLines={1}>{item.sub}</Typography>
                </View>
                <ChevronRight size={18} color={theme.colors.textSecondary} />
              </PressableScale>
            </StaggerItem>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    padding: 16,
    paddingBottom: 130,
    gap: 12,
  },
  heading: {
    ...theme.typography.title,
    color: theme.colors.text,
    marginTop: 6,
  },
  caption: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
    marginBottom: 10,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    padding: 16,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: withAlpha(recordsFam.accent, 'strong'),
  },
  avatarRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: recordsFam.accent,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(recordsFam.accent, 'tint'),
  },
  avatarInitials: {
    ...theme.typography.heading,
    color: recordsFam.accent,
  },
  heroBody: {
    flex: 1,
  },
  heroName: {
    ...theme.typography.subtitle,
    color: theme.colors.text,
  },
  heroSub: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: theme.colors.surfaceElevated,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    ...theme.typography.subtitle,
    color: theme.colors.text,
  },
  rowSub: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
});
