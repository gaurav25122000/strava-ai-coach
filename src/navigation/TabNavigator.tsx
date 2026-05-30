import React, { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, BarChart2, Target, MessageCircle, User, List } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import OverviewScreen from '../screens/OverviewScreen';
import InsightsScreen from '../screens/InsightsScreen';
import GoalsScreen from '../screens/GoalsScreen';
import ChatScreen from '../screens/ChatScreen';
import ProfileStack from './ProfileStack';
import ActivitiesStack from './ActivitiesStack';
import { theme } from '../theme';
import { Platform, View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';

const Tab = createBottomTabNavigator();

// Frosted-glass tab bar material. A real blur layer (iOS chrome material;
// Android via the experimental blur method) under a translucent surface tint,
// so the bar reads as a premium app-shell surface rather than a flat fill.
function TabBarBackground() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView
        tint="dark"
        intensity={Platform.OS === 'ios' ? 55 : 24}
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(31,32,48,0.62)' }]} />
    </View>
  );
}

// Per-tab accent colour. Drives the icon tint and the thin pill background
// behind the active tab cell. Aligned with the widget-family palette in
// `src/utils/widgetFamilies.ts` so accents repeat across the app.
const TAB_COLORS = {
  Overview:   '#f97316',
  Activities: '#e11d48',
  Insights:   '#6366f1',
  Goals:      '#10b981',
  Chat:       '#ec4899',
  Profile:    '#8b5cf6',
} as const;

// Soft tactile click on tab change — but only when actually switching tabs.
// Re-tapping the already-focused tab is a no-op, so the buzz would be noise.
function tabPressHaptic({ navigation }: { navigation: { isFocused: () => boolean } }) {
  return {
    tabPress: () => {
      if (Platform.OS !== 'web' && !navigation.isFocused()) Haptics.selectionAsync();
    },
  };
}

// Render the active-state pill behind the icon. Each tab passes its own colour
// through `tabBarIcon`, so the pill matches the tab's accent on press. The pill
// springs with a brief over-shoot when it becomes focused, and the icon scales
// 0.85 → 1.0 to give the active tab a sense of arrival.
function ActivePill({ children, color, focused }: { children: React.ReactNode; color: string; focused: boolean }) {
  const pillScale = useSharedValue(focused ? 1 : 0.9);
  const iconScale = useSharedValue(focused ? 1 : 0.85);

  useEffect(() => {
    // Settle on the shared motion token so the tab bar shares the app's spring
    // signature; the first sequence step bumps stiffness for a brief overshoot.
    if (focused) {
      pillScale.value = withSequence(
        withSpring(1.08, { ...theme.motion.spring, damping: 12, stiffness: 320 }),
        withSpring(1, theme.motion.spring),
      );
      iconScale.value = withSpring(1, theme.motion.spring);
    } else {
      pillScale.value = withSpring(0.9, theme.motion.spring);
      iconScale.value = withSpring(0.85, theme.motion.spring);
    }
  }, [focused, pillScale, iconScale]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pillScale.value }],
  }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          alignItems: 'center',
          justifyContent: 'center',
          width: 56,
          height: 32,
          borderRadius: 16,
          backgroundColor: focused ? color + '22' : 'transparent',
        },
        pillStyle,
      ]}
    >
      <Animated.View style={iconStyle}>{children}</Animated.View>
    </Animated.View>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarBackground: () => <TabBarBackground />,
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopColor: theme.colors.divider,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          paddingTop: 8,
        },
        tabBarInactiveTintColor: theme.colors.textSecondary,
        // System font at 10px keeps all six labels on one line — Sora + 11px
        // was wide enough to clip "Activities". Allow shrink as a safety net.
        tabBarLabelStyle: { fontWeight: '700', fontSize: 10, marginTop: 2 },
        tabBarItemStyle: { paddingHorizontal: 0 },
        tabBarHideOnKeyboard: true,
      }}
      screenListeners={tabPressHaptic}
    >
      <Tab.Screen
        name="Overview"
        component={OverviewScreen}
        options={{
          tabBarActiveTintColor: TAB_COLORS.Overview,
          tabBarAccessibilityLabel: "Overview tab",
          tabBarIcon: ({ color, size, focused }) => (
            <ActivePill color={TAB_COLORS.Overview} focused={focused}>
              <Home color={color} size={size - 1} />
            </ActivePill>
          ),
        }}
      />
      <Tab.Screen
        name="Activities"
        component={ActivitiesStack}
        options={{
          tabBarActiveTintColor: TAB_COLORS.Activities,
          tabBarAccessibilityLabel: "Activities tab",
          tabBarIcon: ({ color, size, focused }) => (
            <ActivePill color={TAB_COLORS.Activities} focused={focused}>
              <List color={color} size={size - 1} />
            </ActivePill>
          ),
        }}
      />
      <Tab.Screen
        name="Insights"
        component={InsightsScreen}
        options={{
          tabBarActiveTintColor: TAB_COLORS.Insights,
          tabBarAccessibilityLabel: "Insights tab",
          tabBarIcon: ({ color, size, focused }) => (
            <ActivePill color={TAB_COLORS.Insights} focused={focused}>
              <BarChart2 color={color} size={size - 1} />
            </ActivePill>
          ),
        }}
      />
      <Tab.Screen
        name="Goals"
        component={GoalsScreen}
        options={{
          tabBarActiveTintColor: TAB_COLORS.Goals,
          tabBarAccessibilityLabel: "Goals tab",
          tabBarIcon: ({ color, size, focused }) => (
            <ActivePill color={TAB_COLORS.Goals} focused={focused}>
              <Target color={color} size={size - 1} />
            </ActivePill>
          ),
        }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          tabBarActiveTintColor: TAB_COLORS.Chat,
          tabBarAccessibilityLabel: "Coach chat tab",
          tabBarIcon: ({ color, size, focused }) => (
            <ActivePill color={TAB_COLORS.Chat} focused={focused}>
              <MessageCircle color={color} size={size - 1} />
            </ActivePill>
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{
          tabBarActiveTintColor: TAB_COLORS.Profile,
          tabBarAccessibilityLabel: "Profile tab",
          tabBarIcon: ({ color, size, focused }) => (
            <ActivePill color={TAB_COLORS.Profile} focused={focused}>
              <User color={color} size={size - 1} />
            </ActivePill>
          ),
        }}
      />
    </Tab.Navigator>
  );
}
