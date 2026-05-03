import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { theme } from '../theme';
import ActivitiesScreen from '../screens/ActivitiesScreen';
import { ActivityDetailScreen } from '../screens/ActivityDetailScreen';
import { Activity } from '../store/useStore';

export type ActivitiesStackParamList = {
  ActivitiesList: undefined;
  ActivityDetail: { activity: Activity };
};

const Stack = createNativeStackNavigator<ActivitiesStackParamList>();

// Stable wrapper — avoids inline function warning
function ActivityDetailWrapper({ route, navigation }: any) {
  return (
    <ActivityDetailScreen
      activity={route.params.activity}
      onClose={() => navigation.goBack()}
    />
  );
}

export default function ActivitiesStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="ActivitiesList" component={ActivitiesScreen} />
      <Stack.Screen name="ActivityDetail" component={ActivityDetailWrapper} />
    </Stack.Navigator>
  );
}
