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
      // canGoBack guard: a double-tap during the dismiss animation, or the
      // tab-blur popToTop having already removed this route, would otherwise
      // dispatch GO_BACK with nothing to pop.
      onClose={() => { if (navigation.canGoBack()) navigation.goBack(); }}
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
      <Stack.Screen
        name="ActivityDetail"
        component={ActivityDetailWrapper}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
    </Stack.Navigator>
  );
}
