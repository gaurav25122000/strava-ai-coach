import React, { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StackActions } from '@react-navigation/native';
import { Home, BarChart2, Target, MessageCircle, User, List } from 'lucide-react-native';
import OverviewScreen from '../screens/OverviewScreen';
import InsightsScreen from '../screens/InsightsScreen';
import GoalsScreen from '../screens/GoalsScreen';
import ChatScreen from '../screens/ChatScreen';
import ProfileStack from './ProfileStack';
import ActivitiesStack from './ActivitiesStack';
import { theme } from '../theme';
import { Platform, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
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

// Per-tab accent colour, drawn from the widget-family palette so the tab bar
// speaks the same colour language as the dashboard (the old map invented two
// colours that existed nowhere else in the app).
const FAM = theme.colors.families;
const TAB_COLORS = {
  Overview:   FAM.activity.accent,
  Activities: FAM.health.accent,
  Insights:   FAM.progress.accent,
  Goals:      FAM.plan.accent,
  Chat:       FAM.social.accent,
  Profile:    FAM.recovery.accent,
} as const;

function tabScreenListeners({ navigation, route }: { navigation: any; route: any }) {
  return {
    // Reset nested stacks when leaving their tab so a detail screen pushed
    // cross-tab (e.g. from a dashboard widget) doesn't park the tab on it.
    // bottom-tabs' popToTopOnBlur only fires after its transition animation
    // reports finished, which is unreliable — dispatch the pop directly.
    blur: () => {
      const target = navigation.getState().routes.find((r: any) => r.key === route.key);
      if (target?.state?.type === 'stack' && target.state.routes.length > 1) {
        navigation.dispatch({ ...StackActions.popToTop(), target: target.state.key });
      }
    },
  };
}

// Active tab = gradient pill with a glow on the family colour; inactive tabs
// are quiet icons. The pill scales in with the app's spring signature so
// switching tabs feels like the dock is alive, not a template.
function DockItem({
  color,
  gradient,
  focused,
  children,
}: {
  color: string;
  gradient: readonly [string, string];
  focused: boolean;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(focused ? 1 : 0.92);

  useEffect(() => {
    if (focused) {
      scale.value = withSequence(
        withSpring(1.06, { ...theme.motion.spring, damping: 12, stiffness: 320 }),
        withSpring(1, theme.motion.spring),
      );
    } else {
      scale.value = withSpring(0.92, theme.motion.spring);
    }
  }, [focused, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (!focused) {
    return <Animated.View style={[dockStyles.idle, animStyle]}>{children}</Animated.View>;
  }
  return (
    <Animated.View style={animStyle}>
      <LinearGradient
        colors={gradient as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[dockStyles.pill, theme.shadows.glow(color)]}
      >
        {children}
      </LinearGradient>
    </Animated.View>
  );
}

const dockStyles = StyleSheet.create({
  idle: {
    width: 48,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    width: 48,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default function TabNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarBackground: () => <TabBarBackground />,
        // Floating dock: detached, rounded, blurred — content scrolls under it.
        tabBarStyle: {
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: Math.max(insets.bottom, 12),
          height: 62,
          borderRadius: 31,
          overflow: 'hidden',
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: theme.colors.divider,
          borderTopColor: theme.colors.divider,
          borderTopWidth: 1,
          elevation: 0,
          paddingBottom: 0,
          paddingTop: 0,
        },
        tabBarShowLabel: false,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        // Let the icon container own centering — explicit item heights fight
        // the 1px dock border and shift everything off-axis.
        tabBarItemStyle: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
        tabBarIconStyle: { flex: 1, marginTop: 0, marginBottom: 0, alignItems: 'center', justifyContent: 'center' },
        tabBarHideOnKeyboard: true,
      }}
      screenListeners={tabScreenListeners}
    >
      <Tab.Screen
        name="Overview"
        component={OverviewScreen}
        options={{
          tabBarActiveTintColor: TAB_COLORS.Overview,
          tabBarAccessibilityLabel: "Overview tab",
          tabBarIcon: ({ color, size, focused }) => (
            <DockItem color={TAB_COLORS.Overview} gradient={theme.colors.gradients.activity} focused={focused}>
              <Home color={focused ? theme.colors.onAccent : color} size={size - 2} />
            </DockItem>
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
            <DockItem color={TAB_COLORS.Activities} gradient={theme.colors.gradients.health} focused={focused}>
              <List color={focused ? theme.colors.onAccent : color} size={size - 2} />
            </DockItem>
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
            <DockItem color={TAB_COLORS.Insights} gradient={theme.colors.gradients.progress} focused={focused}>
              <BarChart2 color={focused ? theme.colors.onAccent : color} size={size - 2} />
            </DockItem>
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
            <DockItem color={TAB_COLORS.Goals} gradient={theme.colors.gradients.plan} focused={focused}>
              <Target color={focused ? theme.colors.onAccent : color} size={size - 2} />
            </DockItem>
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
            <DockItem color={TAB_COLORS.Chat} gradient={theme.colors.gradients.social} focused={focused}>
              <MessageCircle color={focused ? theme.colors.onAccent : color} size={size - 2} />
            </DockItem>
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
            <DockItem color={TAB_COLORS.Profile} gradient={theme.colors.gradients.recovery} focused={focused}>
              <User color={focused ? theme.colors.onAccent : color} size={size - 2} />
            </DockItem>
          ),
        }}
      />
    </Tab.Navigator>
  );
}
