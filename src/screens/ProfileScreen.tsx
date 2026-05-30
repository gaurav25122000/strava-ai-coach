import React, { useState, useMemo, useEffect } from 'react';
import {
  View, StyleSheet, ScrollView,
  TouchableOpacity, Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';
import { Typography } from '../components/Typography';
import { useStore } from '../store/useStore';
import { BadgeMedal } from '../components/BadgeMedal';
import { WidgetCard } from '../components/WidgetCard';
import { familyStyle, WidgetFamily } from '../utils/widgetFamilies';
import { HeatmapCalendar } from '../components/HeatmapCalendar';
import { BottomSheet } from '../components/BottomSheet';
import { FieldBlock, SegmentedControl, SectionLabel, SheetCTA } from '../components/SheetUI';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { PressableScale } from '../components/PressableScale';
import { StaggerItem } from '../components/Stagger';
import { useNavigation } from '@react-navigation/native';
import {
  User, Award, Activity, CalendarDays, Weight,
  Heart, Target, Moon, Utensils, Zap, Check,
  Pencil, Flame, Trophy,
  Settings, ActivitySquare, Clock, Mountain, Timer,
  type LucideIcon,
} from 'lucide-react-native';
import { Icon } from '../components/Icon';
import { getAllMilestoneDefs } from '../services/milestones';

// Local row primitive for the polished read-only display cards. A family-tinted
// pill icon on the left, label + value stacked on the right. Bottom hairline
// divider is provided by the parent card row layout (`isLast` removes it).
function ReadOnlyField({
  icon, label, value, family, isLast,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  family: WidgetFamily;
  isLast?: boolean;
}) {
  return (
    <View style={[st.roField, isLast && { borderBottomWidth: 0 }]}>
      <Icon icon={icon} variant="pill" family={family} size="md" />
      <View style={st.roBody}>
        <Typography style={st.roLabel}>{label}</Typography>
        <Typography style={st.roValue} numberOfLines={2}>
          {value && value.trim().length ? value : '— not set'}
        </Typography>
      </View>
    </View>
  );
}

// Lifetime-stat tile used in the 2×3 grid. Family-tinted icon + label + big
// number. Local because the shared StatTile component has a different layout
// (delta row, numeric variant) that doesn't suit a square gridded display.
// Pass `numericValue` to render an AnimatedNumber that rolls in; otherwise
// `value` is rendered as a static label (useful for "h m" / "x/y" compounds).
function StatTile({
  family, icon, value, label, numericValue, suffix, decimals, onPress,
}: {
  family: WidgetFamily;
  icon: LucideIcon;
  value: string;
  label: string;
  numericValue?: number;
  suffix?: string;
  decimals?: number;
  onPress?: () => void;
}) {
  const fam = familyStyle(family);
  return (
    <PressableScale
      style={[st.statTile, { borderColor: fam.accent + '33' }]}
      scaleTo={0.97}
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <Icon icon={icon} family={family} variant="pill" size="md" />

      {numericValue !== undefined ? (
        <AnimatedNumber
          value={numericValue}
          decimals={decimals ?? 0}
          suffix={suffix ?? ''}
          style={st.statTileValue}
          numberOfLines={1}
        />
      ) : (
        <Typography style={st.statTileValue} numberOfLines={1}>{value}</Typography>
      )}
      <Typography style={st.statTileLabel} numberOfLines={1}>{label}</Typography>
    </PressableScale>
  );
}

function formatDuration(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec <= 0) return '0h';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h >= 100) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatPBTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ProfileScreen() {
  const { userStats, userProfile, updateUserProfile, settings, milestones, bestEfforts, activities, setToast } = useStore();
  const navigation = useNavigation<any>();

  // Sheet-driven edit flow. `draft` mirrors userProfile so cancelling discards
  // unsaved input; opening the sheet re-seeds the draft from current profile.
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(userProfile);
  useEffect(() => {
    if (editOpen) setDraft(userProfile);
  }, [editOpen, userProfile]);

  const [showDobPicker, setShowDobPicker] = useState(false);

  const dobDate = draft.dob ? new Date(draft.dob) : new Date(1990, 0, 1);
  const onDobChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowDobPicker(false);
    if (selected) {
      const iso = selected.toISOString().split('T')[0];
      setDraft(d => ({ ...d, dob: iso }));
    }
  };
  const age = userProfile.dob
    ? Math.floor((Date.now() - new Date(userProfile.dob).getTime()) / (365.25 * 86400000))
    : null;

  const handleSave = () => {
    updateUserProfile(draft);
    setEditOpen(false);
    setToast({ title: 'Profile updated', message: 'Saved.', type: 'success' });
  };

  // Derived lifetime metrics. Distance/elevation come straight from userStats;
  // time + activity-count are summed across the loaded activity list so the
  // grid still works when only partial Strava data is cached.
  const totalKmDisplay = settings.unit === 'metric'
    ? `${userStats.totalKm}`
    : `${(userStats.totalKm * 0.621371).toFixed(0)}`;
  const totalKmUnit = settings.unit === 'metric' ? 'km' : 'mi';

  const totalTimeSec = useMemo(
    () => activities.reduce((s, a) => s + (a.movingTime || 0), 0),
    [activities],
  );
  const totalElevation = useMemo(
    () => Math.max(userStats.topElev || 0, Math.round(activities.reduce((s, a) => s + (a.totalElevationGain || 0), 0))),
    [activities, userStats.topElev],
  );
  const activitiesCount = useMemo(() => activities.length || (userStats.totalRuns + userStats.totalWalks), [activities, userStats]);

  // Derive HR fields from Strava activity stream. Max HR is the highest
  // max_heartrate observed; resting HR is approximated as the lowest average
  // HR seen across activities (true resting HR is lower, but Strava's free API
  // doesn't expose it, and this is the closest signal available).
  const stravaMaxHR = useMemo(() => {
    let m = 0;
    for (const a of activities) if (a.maxHeartRate && a.maxHeartRate > m) m = a.maxHeartRate;
    return Math.round(m);
  }, [activities]);
  const stravaRestingHR = useMemo(() => {
    let m = Infinity;
    for (const a of activities) {
      if (a.averageHeartRate && a.averageHeartRate > 0 && a.averageHeartRate < m) m = a.averageHeartRate;
    }
    return Number.isFinite(m) ? Math.round(m) : 0;
  }, [activities]);

  const earnedCount = milestones.length;
  const totalBadges = getAllMilestoneDefs().length;

  // Personal-bests list: 1k / 5k / 10k from bestEfforts. Filter out absent
  // distances so the card collapses gracefully on a fresh account.
  const pbRows = useMemo(() => {
    const distances: Array<{ m: number; label: string }> = [
      { m: 1000, label: '1 km' },
      { m: 5000, label: '5 km' },
      { m: 10000, label: '10 km' },
    ];
    return distances
      .map(d => ({ ...d, effort: bestEfforts[d.m] }))
      .filter(d => !!d.effort);
  }, [bestEfforts]);

  // Heatmap data — re-use the shared dashboard mapper so the visual is
  // identical to Overview.
  const heatmapData = useMemo(() => {
    return activities.map((act) => {
      const km = act.distance / 1000;
      let level: 0 | 1 | 2 | 3 | 4 = 0;
      if (km > 0) level = 1;
      if (km > 5) level = 2;
      if (km > 10) level = 3;
      if (km > 20) level = 4;
      return { date: act.startDate, level, type: act.type, km };
    });
  }, [activities]);

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={st.scroll}
        scrollEventThrottle={16}
      >

        {/* ── Hero Banner ── */}
        <View style={st.heroWrap}>
          <LinearGradient
            colors={theme.colors.gradients.records}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={st.heroBanner}
          >
            {/* Top-left utility icons — quick access to settings / gear */}
            <View style={st.heroIconRow}>
              <TouchableOpacity
                onPress={() => navigation.navigate('Settings')}
                activeOpacity={0.85}
                style={st.heroIconBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Open settings"
              >
                <Icon icon={Settings} variant="plain" size="md" color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.navigate('GearHealth')}
                activeOpacity={0.85}
                style={st.heroIconBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Gear and health"
              >
                <Icon icon={ActivitySquare} variant="plain" size="md" color="#fff" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setEditOpen(true)}
              activeOpacity={0.85}
              style={st.editFab}
            >
              <Icon icon={Pencil} variant="plain" size="sm" color="#fff" />
              <Typography style={st.editFabText}>Edit Profile</Typography>
            </TouchableOpacity>
          </LinearGradient>

          {/* Avatar overlaps the banner bottom edge */}
          <View style={st.avatarWrap} pointerEvents="none">
            <View style={st.avatarRing}>
              <LinearGradient
                colors={['#1F2030', '#2A2C40']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={st.avatar}
              >
                {userProfile.name
                  ? <Typography style={st.avatarInitials}>
                      {userProfile.name
                        .trim()
                        .split(/\s+/)
                        .slice(0, 2)
                        .map(p => p[0]?.toUpperCase() || '')
                        .join('')}
                    </Typography>
                  : <Icon icon={User} variant="plain" size="xl" color={theme.colors.text} />}
              </LinearGradient>
            </View>
          </View>

          {/* Name block under the avatar */}
          <View style={st.nameBlock}>
            <Typography style={st.heroName}>
              {userProfile.name || 'Set your name'}
            </Typography>
            <View style={st.handleRow}>
              <Typography style={st.heroHandle}>
                {userProfile.name
                  ? `@${userProfile.name.trim().toLowerCase().replace(/\s+/g, '')}`
                  : '@athlete'}
              </Typography>
            </View>
            <View style={st.heroPills}>
              {age !== null && (
                <View style={st.heroPill}><Typography style={st.heroPillText}>{age} yrs</Typography></View>
              )}
              {userProfile.fitnessLevel ? (
                <View style={st.heroPill}>
                  <Typography style={st.heroPillText}>{userProfile.fitnessLevel}</Typography>
                </View>
              ) : null}
              {userProfile.preferredTerrain ? (
                <View style={st.heroPill}><Typography style={st.heroPillText}>{userProfile.preferredTerrain}</Typography></View>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── Lifetime Stats Grid (2×3) ── */}
        <StaggerItem index={0}>
          <View style={st.gridRow}>
            <StatTile family="activity" icon={Activity}     value={totalKmDisplay}        numericValue={Number(totalKmDisplay)} label={`Total ${totalKmUnit}`} />
            <StatTile family="activity" icon={Clock}        value={formatDuration(totalTimeSec)} label="Total time" />
            <StatTile family="activity" icon={Mountain}     value={`${totalElevation}`}   numericValue={totalElevation} label="Elev. m" />
          </View>
          <View style={st.gridRow}>
            <StatTile family="activity" icon={Timer}        value={`${activitiesCount}`}  numericValue={activitiesCount} label="Activities" />
            <StatTile family="recovery" icon={Flame}        value={`${userStats.bestStreak}d`} numericValue={userStats.bestStreak} suffix="d" label="Best streak" />
            <StatTile family="records"  icon={Trophy}       value={`${earnedCount}/${totalBadges}`} label="Badges" />
          </View>
        </StaggerItem>

        {/* ── Personal Bests ── */}
        <StaggerItem index={1}>
          <WidgetCard family="records" title="Personal Bests" icon={Trophy} caption={pbRows.length ? `${pbRows.length} efforts` : undefined}>
            {pbRows.length === 0 ? (
              <View style={st.pbEmpty}>
                <Typography style={st.pbEmptyText}>
                  Sync activities to unlock your PBs.
                </Typography>
              </View>
            ) : (
              pbRows.map((row, i) => (
                <View key={row.m} style={[st.pbRow, i === pbRows.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={[st.pbDistanceChip, { backgroundColor: familyStyle('records').tint, borderColor: familyStyle('records').accent + '55' }]}>
                    <Typography style={[st.pbDistance, { color: familyStyle('records').accent }]}>{row.label}</Typography>
                  </View>
                  <Typography style={st.pbTime}>{formatPBTime(row.effort!.time)}</Typography>
                  <Typography style={st.pbDate}>{row.effort!.date}</Typography>
                </View>
              ))
            )}
          </WidgetCard>
        </StaggerItem>

        {/* ── Milestones & Badges ── */}
        <StaggerItem index={2}>
          <WidgetCard
            family="records"
            title="Milestones & Badges"
            icon={Award}
            caption={`${earnedCount}/${totalBadges} unlocked`}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={st.badgesRow}
            >
              {[...getAllMilestoneDefs()]
                .sort((a, b) => (milestones.some(m => m.id === a.id) ? 0 : 1) - (milestones.some(m => m.id === b.id) ? 0 : 1))
                .map(def => {
                  const earned = milestones.find(m => m.id === def.id);
                  return (
                    <BadgeMedal
                      key={def.id}
                      milestone={{
                        title: def.title,
                        description: def.description,
                        icon: def.icon,
                        category: def.category,
                        earnedAt: earned?.earnedAt || null,
                      }}
                      size={68}
                      unlocked={!!earned}
                    />
                  );
                })}
            </ScrollView>
          </WidgetCard>
        </StaggerItem>

        {/* ── Activity Heatmap ── */}
        {activities.length > 0 && (
          <StaggerItem index={3}>
            <WidgetCard family="activity" title="Activity Heatmap" icon={Activity} caption="last 26 weeks">
              <HeatmapCalendar data={heatmapData} />
            </WidgetCard>
          </StaggerItem>
        )}

        {/* ── Personal Info (read-only display) ── */}
        <StaggerItem index={4}>
          <WidgetCard family="records" title="Personal" icon={User}>
            <View style={st.roList}>
              <ReadOnlyField icon={User}         label="Name"          value={userProfile.name}                                                family="records" />
              <ReadOnlyField icon={CalendarDays} label="Date of Birth" value={userProfile.dob ? `${userProfile.dob}${age !== null ? `  (${age} yrs)` : ''}` : ''} family="records" />
              <ReadOnlyField icon={Weight}       label="Weight"        value={userProfile.weight ? `${userProfile.weight} kg` : ''}            family="records" />
              <ReadOnlyField icon={Zap}          label="Height"        value={userProfile.height ? `${userProfile.height} cm` : ''}            family="records" isLast />
            </View>
          </WidgetCard>
        </StaggerItem>

        {/* ── Athletic Profile (read-only display) ── */}
        <StaggerItem index={5}>
          <WidgetCard family="health" title="Athletic Profile" icon={Heart}>
            <View style={st.roList}>
              <ReadOnlyField icon={Heart}        label="Resting HR"          value={stravaRestingHR ? `${stravaRestingHR} bpm  · from Strava` : ''} family="health" />
              <ReadOnlyField icon={Heart}        label="Max HR"              value={stravaMaxHR ? `${stravaMaxHR} bpm  · from Strava` : ''}         family="health" />
              <ReadOnlyField icon={Target}       label="Weekly Goal"         value={userProfile.weeklyGoalKm ? `${userProfile.weeklyGoalKm} km / week` : ''} family="health" />
              <ReadOnlyField icon={CalendarDays} label="Training Days / Week" value={userProfile.trainingDaysPerWeek ? `${userProfile.trainingDaysPerWeek} days` : ''} family="health" />
              <ReadOnlyField icon={Zap}          label="Fitness Level"       value={userProfile.fitnessLevel}                                          family="health" />
              <ReadOnlyField icon={Activity}     label="Preferred Terrain"   value={userProfile.preferredTerrain}                                      family="health" isLast />
            </View>
          </WidgetCard>
        </StaggerItem>

        {/* ── Lifestyle (read-only display) ── */}
        <StaggerItem index={6}>
          <WidgetCard family="recovery" title="Lifestyle & Habits" icon={Moon}>
            <View style={st.roList}>
              <ReadOnlyField icon={Moon}     label="Sleep"               value={userProfile.sleepHours ? `${userProfile.sleepHours} hrs / night` : ''} family="recovery" />
              <ReadOnlyField icon={Utensils} label="Nutrition Notes"     value={userProfile.nutritionNotes}                                            family="recovery" />
              <ReadOnlyField icon={Award}    label="Known Injuries / Niggles" value={userProfile.injuries}                                              family="recovery" isLast />
            </View>
          </WidgetCard>
        </StaggerItem>

        {/* ── AI context note ── */}
        <StaggerItem index={7}>
          <View style={st.llmNote}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Icon icon={Zap} variant="plain" size="sm" color={theme.colors.primary} />
              <Typography style={st.llmNoteTitle}>Sent to AI Coach</Typography>
            </View>
            <Typography style={st.llmNoteBody}>
              All fields above are included in every AI coaching prompt — the more you fill in, the more personalised your plans become.
            </Typography>
          </View>
        </StaggerItem>

      </ScrollView>

      {/* ── Edit Profile BottomSheet ── */}
      <BottomSheet
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Profile"
        subtitle="Update your details — Save when ready"
        icon={Pencil}
        family="records"
      >
        <SectionLabel family="records">Personal</SectionLabel>
        <FieldBlock
          family="records"
          label="Name"
          value={draft.name}
          onChangeText={(v) => setDraft(d => ({ ...d, name: v }))}
          placeholder="Your name"
          autoCapitalize="words"
        />
        <FieldBlock
          family="records"
          label="Date of Birth"
          value={draft.dob || ''}
          onPress={() => setShowDobPicker(v => !v)}
          placeholder="Tap to choose"
        />
        {showDobPicker && Platform.OS === 'ios' && (
          <View style={{ marginBottom: 12 }}>
            <DateTimePicker
              value={dobDate}
              mode="date"
              display="spinner"
              maximumDate={new Date()}
              onChange={onDobChange}
              textColor={theme.colors.text}
            />
          </View>
        )}
        <FieldBlock
          family="records"
          label="Weight (kg)"
          value={draft.weight ? String(draft.weight) : ''}
          onChangeText={(v) => setDraft(d => ({ ...d, weight: Number(v) || 0 }))}
          placeholder="e.g. 70"
          keyboardType="numeric"
          numeric
        />
        <FieldBlock
          family="records"
          label="Height (cm)"
          value={draft.height ? String(draft.height) : ''}
          onChangeText={(v) => setDraft(d => ({ ...d, height: Number(v) || 0 }))}
          placeholder="e.g. 175"
          keyboardType="numeric"
          numeric
        />

        <SectionLabel family="health" style={{ marginTop: 18 }}>Athletic Profile</SectionLabel>
        <FieldBlock
          family="health"
          label="Weekly Goal (km)"
          value={draft.weeklyGoalKm ? String(draft.weeklyGoalKm) : ''}
          onChangeText={(v) => setDraft(d => ({ ...d, weeklyGoalKm: Number(v) || 0 }))}
          placeholder="e.g. 40"
          keyboardType="numeric"
          numeric
        />

        <SectionLabel family="health" style={{ marginTop: 12 }}>Training Days / Week</SectionLabel>
        <SegmentedControl<string>
          family="health"
          segments={[
            { value: '3', label: '3' },
            { value: '4', label: '4' },
            { value: '5', label: '5' },
            { value: '6', label: '6' },
            { value: '7', label: '7' },
          ]}
          value={String(draft.trainingDaysPerWeek)}
          onChange={(v) => setDraft(d => ({ ...d, trainingDaysPerWeek: Number(v) || 0 }))}
        />

        <SectionLabel family="health" style={{ marginTop: 12 }}>Fitness Level</SectionLabel>
        <SegmentedControl<'Beginner' | 'Intermediate' | 'Advanced'>
          family="health"
          segments={[
            { value: 'Beginner',     label: 'Beginner' },
            { value: 'Intermediate', label: 'Intermediate' },
            { value: 'Advanced',     label: 'Advanced' },
          ]}
          value={draft.fitnessLevel}
          onChange={(v) => setDraft(d => ({ ...d, fitnessLevel: v }))}
        />

        <SectionLabel family="health" style={{ marginTop: 12 }}>Preferred Terrain</SectionLabel>
        <SegmentedControl<'Road' | 'Trail' | 'Track' | 'Mixed'>
          family="health"
          segments={[
            { value: 'Road',  label: 'Road' },
            { value: 'Trail', label: 'Trail' },
            { value: 'Track', label: 'Track' },
            { value: 'Mixed', label: 'Mixed' },
          ]}
          value={draft.preferredTerrain}
          onChange={(v) => setDraft(d => ({ ...d, preferredTerrain: v }))}
        />

        <SectionLabel family="recovery" style={{ marginTop: 18 }}>Lifestyle</SectionLabel>
        <FieldBlock
          family="recovery"
          label="Sleep (hours / night)"
          value={draft.sleepHours ? String(draft.sleepHours) : ''}
          onChangeText={(v) => setDraft(d => ({ ...d, sleepHours: Number(v) || 0 }))}
          placeholder="e.g. 7.5"
          keyboardType="decimal-pad"
          numeric
        />
        <FieldBlock
          family="recovery"
          label="Nutrition Notes"
          value={draft.nutritionNotes || ''}
          onChangeText={(v) => setDraft(d => ({ ...d, nutritionNotes: v }))}
          placeholder="Diet, supplements, etc."
          multiline
        />
        <FieldBlock
          family="recovery"
          label="Injuries / Niggles"
          value={draft.injuries || ''}
          onChangeText={(v) => setDraft(d => ({ ...d, injuries: v }))}
          placeholder="So the AI coach can adjust"
          multiline
        />

        <View style={{ height: 8 }} />
        <SheetCTA label="Save Changes" family="records" icon={Check} onPress={handleSave} />
        <View style={{ height: 12 }} />
      </BottomSheet>

      {/* Android renders the date picker as the platform native dialog. */}
      {showDobPicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={dobDate}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={onDobChange}
        />
      )}
    </SafeAreaView>
  );
}

const HERO_HEIGHT = 160;
const AVATAR_SIZE = 96;

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { paddingBottom: 120 },

  // Hero
  heroWrap: { marginBottom: 12 },
  heroBanner: {
    height: HERO_HEIGHT,
    paddingHorizontal: 20,
    justifyContent: 'flex-start',
  },
  editFab: {
    position: 'absolute', top: 14, right: 14,
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
    ...theme.shadows.md,
  },
  editFabText: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' },
  heroIconRow: {
    position: 'absolute', top: 14, left: 14,
    flexDirection: 'row', gap: 8,
  },
  heroIconBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    // Dark scrim (not white tint) so the white glyph stays legible on the
    // bright gold hero gradient — white-on-light washed the icons out.
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)',
    ...theme.shadows.md,
  },
  avatarWrap: {
    position: 'absolute',
    top: HERO_HEIGHT - AVATAR_SIZE / 2,
    left: 0, right: 0,
    alignItems: 'center',
  },
  avatarRing: {
    width: AVATAR_SIZE + 8, height: AVATAR_SIZE + 8,
    borderRadius: (AVATAR_SIZE + 8) / 2,
    backgroundColor: theme.colors.background,
    alignItems: 'center', justifyContent: 'center',
    ...theme.shadows.lg,
  },
  avatar: {
    width: AVATAR_SIZE, height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.08)',
  },
  avatarInitials: { fontSize: 32, fontFamily: theme.fonts.display, color: theme.colors.text, letterSpacing: -1 },

  // Name block — pushed below the avatar (which overlaps the banner bottom edge
  // by AVATAR_SIZE/2 and would otherwise overlap the name text).
  nameBlock: { alignItems: 'center', marginTop: AVATAR_SIZE / 2 + 16, paddingHorizontal: 16 },
  heroName: { fontSize: 26, fontFamily: theme.fonts.display, color: theme.colors.text, letterSpacing: -0.5 },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  heroHandle: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },
  heroPills: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 },
  heroPill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  heroPillText: { fontSize: 11, color: theme.colors.text, fontWeight: '700', letterSpacing: 0.3 },

  // Stats grid
  gridRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 10 },
  statTile: {
    flex: 1,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 14,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: 12,
    borderWidth: 1,
    gap: 6,
    ...theme.shadows.sm,
  },
  statTileValue: { fontSize: 19, fontFamily: theme.fonts.bold, color: theme.colors.text, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  statTileLabel: { fontSize: 10, fontWeight: '700', color: theme.colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' },

  // Personal bests rows
  pbEmpty: { paddingVertical: 14, alignItems: 'center' },
  pbEmptyText: { fontSize: 13, color: theme.colors.textSecondary },
  pbRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: theme.colors.divider,
    gap: 12,
  },
  pbDistanceChip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9,
    borderWidth: 1,
  },
  pbDistance: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  pbTime: { fontSize: 18, fontFamily: theme.fonts.bold, color: theme.colors.text, fontVariant: ['tabular-nums'], flex: 1 },
  pbDate: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '600' },

  // Badges
  badgesRow: { gap: 12, paddingVertical: 4 },

  // Read-only display rows are normally inset by the WidgetCard body padding.
  // Negate that so dividers run edge-to-edge while the rows keep their own
  // internal 20px gutter (matches the row icon-to-text rhythm in other lists).
  roList: { marginHorizontal: -theme.spacing.lg },
  roField: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: theme.spacing.lg, paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  roBody: { flex: 1 },
  roLabel: {
    fontSize: 10, color: theme.colors.textSecondary,
    fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase',
    marginBottom: 2,
  },
  roValue: { fontSize: 15, color: theme.colors.text, fontWeight: '600' },

  llmNote: {
    marginHorizontal: 16, marginBottom: 16, padding: 14,
    borderLeftWidth: 3, borderLeftColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '11',
  },
  llmNoteTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  llmNoteBody: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18 },
});
