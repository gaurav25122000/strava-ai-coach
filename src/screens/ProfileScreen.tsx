import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { theme } from '../constants/theme';
import { useStore } from '../store/useStore';
import { ArrowLeft, MapPin, Award, Activity } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { StatCard } from '../components/StatCard';

export const ProfileScreen = () => {
  const { totalRuns, totalKm, bestPace, topElevation, activities } = useStore();
  const navigation = useNavigation();

  // Basic stats
  const totalDurationSecs = activities.reduce((sum, act) => sum + act.duration, 0);
  const totalHours = Math.floor(totalDurationSecs / 3600);

  // Dynamically calculate achievements based on real data
  const achievements = [];
  if (totalKm >= 21.1) {
      achievements.push({ id: 1, title: 'Half Marathon Finisher', date: 'Earned', icon: Award, color: theme.colors.primaryOrange });
  }
  if (totalKm >= 42.2) {
      achievements.push({ id: 2, title: 'Marathon Finisher', date: 'Earned', icon: Award, color: theme.colors.primaryRed });
  }
  if (activities.length >= 10) {
      achievements.push({ id: 3, title: '10 Runs Completed', date: 'Earned', icon: Activity, color: theme.colors.primaryGreen });
  }
  if (activities.length >= 50) {
      achievements.push({ id: 4, title: '50 Runs Completed', date: 'Earned', icon: Activity, color: theme.colors.primaryBlue });
  }


  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft color={theme.colors.textPrimary} size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Profile Info */}
        <View style={styles.profileSection}>
          <Image
            source={{ uri: 'https://i.pravatar.cc/150?img=11' }}
            style={styles.avatar}
          />
          <Text style={styles.name}>Alex Runner</Text>
          <View style={styles.locationRow}>
            <MapPin size={14} color={theme.colors.textSecondary} />
            <Text style={styles.locationText}>San Francisco, CA</Text>
          </View>
        </View>

        {/* Stats Grid */}
        <Text style={styles.sectionTitle}>Lifetime Stats</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statsRow}>
            <StatCard label="TOTAL RUNS" value={totalRuns} colorName="primaryBlue" />
            <StatCard label="TOTAL KM" value={totalKm} unit="km" colorName="primaryOrange" />
          </View>
          <View style={[styles.statsRow, { marginTop: theme.spacing.sm }]}>
            <StatCard label="TIME ON FEET" value={totalHours} unit="h" colorName="primaryGreen" />
            <StatCard label="BEST PACE" value={bestPace} colorName="primaryPurple" />
          </View>
        </View>

        {/* Achievements */}
        <Text style={[styles.sectionTitle, { marginTop: theme.spacing.xl }]}>Achievements</Text>
        <View style={styles.achievementsContainer}>
          {achievements.map((achieve) => (
            <View key={achieve.id} style={styles.achievementCard}>
              <View style={[styles.iconContainer, { backgroundColor: achieve.color + '20' }]}>
                <achieve.icon size={24} color={achieve.color} />
              </View>
              <View style={styles.achievementInfo}>
                <Text style={styles.achievementTitle}>{achieve.title}</Text>
                <Text style={styles.achievementDate}>{achieve.date}</Text>
              </View>
            </View>
          ))}
        </View>

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingTop: 60,
    paddingBottom: theme.spacing.md,
  },
  backButton: {
    padding: theme.spacing.xs,
  },
  headerTitle: {
    ...theme.typography.h3,
    color: theme.colors.textPrimary,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: theme.spacing.md,
  },
  name: {
    ...theme.typography.h2,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  sectionTitle: {
    ...theme.typography.h3,
    color: theme.colors.textPrimary,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  statsGrid: {
    paddingHorizontal: theme.spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  achievementsContainer: {
    paddingHorizontal: theme.spacing.md,
  },
  achievementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.cardBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
  },
  iconContainer: {
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.round,
    marginRight: theme.spacing.md,
  },
  achievementInfo: {
    flex: 1,
  },
  achievementTitle: {
    ...theme.typography.body,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  achievementDate: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  }
});
