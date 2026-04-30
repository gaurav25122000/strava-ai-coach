import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../constants/theme';
import { Home, BarChart2, Target, Dumbbell } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

export const CustomTabBar = ({ state, descriptors, navigation }: any) => {
  return (
    <View style={styles.tabBarContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
              ? options.title
              : route.name;

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate(route.name);
            }
          };

          const getIcon = () => {
            const color = isFocused ? theme.colors.textPrimary : theme.colors.tabInactive;
            switch (route.name) {
              case 'Overview':
                return <Home size={18} color={color} />;
              case 'Insights':
                return <BarChart2 size={18} color={color} />;
              case 'Training':
                return <Dumbbell size={18} color={color} />;
              case 'Goals':
                return <Target size={18} color={color} />;
              default:
                return null;
            }
          };

          return (
            <TouchableOpacity
              key={index}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarTestID}
              onPress={onPress}
              style={[
                styles.tabItem,
                isFocused && styles.tabItemFocused
              ]}
            >
              <View style={styles.tabContent}>
                {getIcon()}
                <Text style={[
                  styles.tabLabel,
                  { color: isFocused ? theme.colors.textPrimary : theme.colors.tabInactive },
                  isFocused && styles.tabLabelFocused
                ]}>
                  {label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  tabBarContainer: {
    backgroundColor: theme.colors.background,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabItem: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginRight: theme.spacing.sm,
    borderRadius: theme.borderRadius.round,
    backgroundColor: theme.colors.cardBackground,
  },
  tabItemFocused: {
    backgroundColor: theme.colors.primaryOrange,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabLabel: {
    ...theme.typography.caption,
    fontWeight: '500',
  },
  tabLabelFocused: {
    fontWeight: 'bold',
  }
});
