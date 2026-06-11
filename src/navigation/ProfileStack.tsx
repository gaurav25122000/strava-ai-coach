import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MenuScreen from '../screens/MenuScreen';
import ProfileScreen from '../screens/ProfileScreen';
import GearHealthScreen from '../screens/GearHealthScreen';
import SettingsScreen from '../screens/SettingsScreen';
import CalorieTrackerScreen from '../screens/CalorieTrackerScreen';
import AddFoodScreen from '../screens/AddFoodScreen';
import { theme } from '../theme';

const Stack = createNativeStackNavigator();

/** The Menu tab's stack: hub root, then profile/settings/gear/calorie tools. */
export default function ProfileStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="MenuHome" component={MenuScreen} />
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen name="GearHealth" component={GearHealthScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="CalorieTracker" component={CalorieTrackerScreen} />
      <Stack.Screen name="AddFood" component={AddFoodScreen} />
    </Stack.Navigator>
  );
}
