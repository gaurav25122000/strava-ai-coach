import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OverviewScreen } from './src/screens/OverviewScreen';
import { InsightsScreen } from './src/screens/InsightsScreen';
import { GoalsScreen } from './src/screens/GoalsScreen';
import { CustomTabBar } from './src/components/CustomTabBar';
import { useStore } from './src/store/useStore';
import { View, Text } from 'react-native';

const Tab = createBottomTabNavigator();

// Placeholder for Training Screen (not requested in detail, but part of tabs)
const TrainingScreen = () => (
  <View style={{ flex: 1, backgroundColor: '#12121A', justifyContent: 'center', alignItems: 'center' }}>
    <Text style={{ color: 'white' }}>Training Screen</Text>
  </View>
);

export default function App() {
  const loginToStrava = useStore(state => state.loginToStrava);

  useEffect(() => {
    loginToStrava();
  }, [loginToStrava]);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Tab.Navigator
          tabBar={props => <CustomTabBar {...props} />}
          screenOptions={{ headerShown: false }}
        >
          <Tab.Screen name="Overview" component={OverviewScreen} />
          <Tab.Screen name="Insights" component={InsightsScreen} />
          <Tab.Screen name="Training" component={TrainingScreen} />
          <Tab.Screen name="Goals" component={GoalsScreen} />
        </Tab.Navigator>
      </NavigationContainer>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
