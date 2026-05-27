import React from 'react';
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
import { Platform, View } from 'react-native';

const Tab = createBottomTabNavigator();

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

// Triggers a soft tactile click when the user taps a tab. Pulled out so the
// listener block per tab stays terse and impossible to forget.
function selectionHaptic() {
  if (Platform.OS !== 'web') Haptics.selectionAsync();
}

// Render the active-state pill behind the icon. Each tab passes its own colour
// through `tabBarIcon`, so the pill matches the tab's accent on press.
function ActivePill({ children, color, focused }: { children: React.ReactNode; color: string; focused: boolean }) {
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        width: 56,
        height: 32,
        borderRadius: 16,
        backgroundColor: focused ? color + '22' : 'transparent',
      }}
    >
      {children}
    </View>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 0.5,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          paddingTop: 8,
        },
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarLabelStyle: { fontWeight: '700', fontSize: 10, marginTop: 2 },
        tabBarHideOnKeyboard: true,
      }}
      screenListeners={{ tabPress: selectionHaptic }}
    >
      <Tab.Screen
        name="Overview"
        component={OverviewScreen}
        options={{
          tabBarActiveTintColor: TAB_COLORS.Overview,
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
