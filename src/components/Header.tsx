import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../constants/theme';
import { Settings, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

interface HeaderProps {
  title?: string;
  showProfile?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ title, showProfile = false }) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  return (
    <View style={[styles.container, { paddingTop: insets.top + theme.spacing.sm }]}>
      {showProfile ? (
        <View style={styles.profileContainer}>
          <TouchableOpacity style={styles.avatarPlaceholder} onPress={() => navigation.navigate('Profile')}>
             <User size={20} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.greeting}>Eva Sarin</Text>
        </View>
      ) : (
        <Text style={styles.title}>{title}</Text>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.iconButton}>
          <Settings size={24} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  profileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  greeting: {
    ...theme.typography.h3,
    color: theme.colors.textPrimary,
  },
  title: {
    ...theme.typography.h2,
    color: theme.colors.textPrimary,
  },
  actions: {
    flexDirection: 'row',
  },
  iconButton: {
    padding: theme.spacing.xs,
  },
});
