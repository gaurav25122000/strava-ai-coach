import React, { useState } from 'react';
import {
  View, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Platform, Modal,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';
import { Typography } from '../components/Typography';
import { useStore } from '../store/useStore';
import { Card } from '../components/Card';
import {
  User, Award, Activity, CalendarDays, Weight,
  Heart, Target, Moon, Utensils, Zap, Check,
  Pencil, TrendingUp, Footprints, Flame, Trophy,
} from 'lucide-react-native';
import { getAllMilestoneDefs } from '../services/milestones';

const TERRAIN_OPTIONS = ['Road', 'Trail', 'Track', 'Mixed'] as const;
const FITNESS_OPTIONS = ['Beginner', 'Intermediate', 'Advanced'] as const;

function ChipSelector<T extends string>({
  options, value, onChange, color = theme.colors.primary,
}: { options: readonly T[]; value: T; onChange: (v: T) => void; color?: string }) {
  return (
    <View style={st.chipRow}>
      {options.map(opt => {
        const active = opt === value;
        return (
          <TouchableOpacity
            key={opt} onPress={() => onChange(opt)}
            style={[st.chip, active && { backgroundColor: color, borderColor: color }]}
          >
            {active && <Check size={11} color="#fff" style={{ marginRight: 3 }} />}
            <Typography style={[st.chipText, active && { color: '#fff', fontWeight: '700' }]}>{opt}</Typography>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function FieldRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <View style={st.fieldRow}>
      <View style={st.fieldIcon}>{icon}</View>
      <View style={st.fieldContent}>
        <Typography style={st.fieldLabel}>{label}</Typography>
        {children}
      </View>
    </View>
  );
}

function GradientStat({ colors, icon, value, label }: { colors: [string, string]; icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.statCard}>
      {icon}
      <Typography style={st.statValue}>{value}</Typography>
      <Typography style={st.statLabel}>{label}</Typography>
    </LinearGradient>
  );
}

export default function ProfileScreen() {
  const { userStats, userProfile, updateUserProfile, settings, milestones, bestEfforts } = useStore();
  const [editing, setEditing] = useState(false);
  const [showDobPicker, setShowDobPicker] = useState(false);

  const dobDate = userProfile.dob ? new Date(userProfile.dob) : new Date(1990, 0, 1);
  const onDobChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowDobPicker(false);
    if (selected) updateUserProfile({ dob: selected.toISOString().split('T')[0] });
  };
  const age = userProfile.dob
    ? Math.floor((Date.now() - new Date(userProfile.dob).getTime()) / (365.25 * 86400000))
    : null;

  const totalKmDisplay = settings.unit === 'metric'
    ? `${userStats.totalKm} km`
    : `${(userStats.totalKm * 0.621371).toFixed(1)} mi`;

  const earnedCount = milestones.length;
  const totalBadges = getAllMilestoneDefs().length;

  // Best 5km for profile
  const best5k = bestEfforts[5000];
  const best5kStr = best5k
    ? `${Math.floor(best5k.time / 60)}:${String(best5k.time % 60).padStart(2, '0')}`
    : null;

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll}>

        {/* ── Hero Banner ── */}
        <LinearGradient
          colors={['#6366f1', '#8b5cf6', '#ec4899']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={st.heroBanner}
        >
          {/* Edit button top-right */}
          <TouchableOpacity
            style={st.editFab}
            onPress={() => setEditing(e => !e)}
          >
            {editing
              ? <Check size={18} color="#fff" />
              : <Pencil size={18} color="#fff" />
            }
          </TouchableOpacity>

          {/* Avatar */}
          <View style={st.avatarRing}>
            <View style={st.avatar}>
              <User size={40} color="#fff" />
            </View>
          </View>

          <Typography style={st.heroName}>
            {userProfile.name || 'Tap ✏️ to set your name'}
          </Typography>

          {/* Pills */}
          <View style={st.heroPills}>
            {age !== null && (
              <View style={st.heroPill}><Typography style={st.heroPillText}>{age} yrs</Typography></View>
            )}
            {userProfile.fitnessLevel ? (
              <View style={[st.heroPill, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                <Typography style={st.heroPillText}>{userProfile.fitnessLevel}</Typography>
              </View>
            ) : null}
            {userProfile.preferredTerrain ? (
              <View style={st.heroPill}><Typography style={st.heroPillText}>{userProfile.preferredTerrain}</Typography></View>
            ) : null}
          </View>

          {/* Hero mini stats */}
          <View style={st.heroRow}>
            <View style={st.heroStat}>
              <Typography style={st.heroStatNum}>{userStats.currentStreak}</Typography>
              <Typography style={st.heroStatLbl}>day streak</Typography>
            </View>
            <View style={st.heroDiv} />
            <View style={st.heroStat}>
              <Typography style={st.heroStatNum}>{earnedCount}/{totalBadges}</Typography>
              <Typography style={st.heroStatLbl}>badges</Typography>
            </View>
            <View style={st.heroDiv} />
            <View style={st.heroStat}>
              <Typography style={st.heroStatNum}>{best5kStr ?? '--'}</Typography>
              <Typography style={st.heroStatLbl}>5 km PR</Typography>
            </View>
          </View>
        </LinearGradient>

        {/* ── Lifetime Stats ── */}
        <View style={st.statsRow}>
          <GradientStat
            colors={['#6366f1', '#4f46e5']}
            icon={<Activity color="#fff" size={20} />}
            value={userStats.totalRuns + userStats.totalWalks}
            label="Activities"
          />
          <GradientStat
            colors={['#0ea5e9', '#0284c7']}
            icon={<TrendingUp color="#fff" size={20} />}
            value={totalKmDisplay}
            label="Distance"
          />
          <GradientStat
            colors={['#f59e0b', '#d97706']}
            icon={<Award color="#fff" size={20} />}
            value={`${userStats.bestStreak}d`}
            label="Best Streak"
          />
        </View>

        {/* ── Personal Info ── */}
        <Typography style={st.sectionLabel}>PERSONAL</Typography>
        <Card style={st.sectionCard}>
          <FieldRow icon={<User color={theme.colors.primary} size={16} />} label="Name">
            {editing
              ? <TextInput style={st.input} value={userProfile.name} onChangeText={v => updateUserProfile({ name: v })} placeholder="Your name" placeholderTextColor={theme.colors.textSecondary} />
              : <Typography style={st.fieldValue}>{userProfile.name || '—'}</Typography>
            }
          </FieldRow>

          <FieldRow icon={<CalendarDays color={theme.colors.accent} size={16} />} label="Date of Birth">
            {editing ? (
              <TouchableOpacity onPress={() => setShowDobPicker(true)} activeOpacity={0.7}>
                <View style={[st.input, st.dateInput]}>
                  <Typography style={{ color: userProfile.dob ? theme.colors.text : theme.colors.textSecondary, fontSize: 14 }}>
                    {userProfile.dob || 'Tap to select'}
                  </Typography>
                  {age !== null && <Typography style={{ fontSize: 12, color: theme.colors.textSecondary, marginLeft: 8 }}>({age} yrs)</Typography>}
                </View>
              </TouchableOpacity>
            ) : (
              <Typography style={st.fieldValue}>{userProfile.dob || '—'}{age !== null ? `  (${age} yrs)` : ''}</Typography>
            )}
            {showDobPicker && Platform.OS === 'ios' && (
              <Modal transparent animationType="slide" visible>
                <View style={st.pickerOverlay}>
                  <View style={st.pickerSheet}>
                    <View style={st.pickerHeader}>
                      <TouchableOpacity onPress={() => setShowDobPicker(false)}>
                        <Typography style={{ color: theme.colors.primary, fontWeight: '700' }}>Done</Typography>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker value={dobDate} mode="date" display="spinner" maximumDate={new Date()} onChange={onDobChange} textColor={theme.colors.text} />
                  </View>
                </View>
              </Modal>
            )}
            {showDobPicker && Platform.OS === 'android' && (
              <DateTimePicker value={dobDate} mode="date" display="default" maximumDate={new Date()} onChange={onDobChange} />
            )}
          </FieldRow>

          <FieldRow icon={<Weight color="#FBBF24" size={16} />} label="Weight (kg)">
            {editing
              ? <TextInput style={st.input} value={userProfile.weight ? String(userProfile.weight) : ''} onChangeText={v => updateUserProfile({ weight: Number(v) })} placeholder="e.g. 70" placeholderTextColor={theme.colors.textSecondary} keyboardType="numeric" />
              : <Typography style={st.fieldValue}>{userProfile.weight || '—'} kg</Typography>
            }
          </FieldRow>

          <FieldRow icon={<Zap color={theme.colors.secondary} size={16} />} label="Height (cm)">
            {editing
              ? <TextInput style={st.input} value={userProfile.height ? String(userProfile.height) : ''} onChangeText={v => updateUserProfile({ height: Number(v) })} placeholder="e.g. 175" placeholderTextColor={theme.colors.textSecondary} keyboardType="numeric" />
              : <Typography style={st.fieldValue}>{userProfile.height || '—'} cm</Typography>
            }
          </FieldRow>
        </Card>

        {/* ── Athletic Profile ── */}
        <Typography style={st.sectionLabel}>ATHLETIC PROFILE</Typography>
        <Card style={st.sectionCard}>
          <FieldRow icon={<Heart color="#EF4444" size={16} />} label="Resting HR (bpm)">
            {editing
              ? <TextInput style={st.input} value={userProfile.restingHR ? String(userProfile.restingHR) : ''} onChangeText={v => updateUserProfile({ restingHR: Number(v) })} placeholder="e.g. 55" placeholderTextColor={theme.colors.textSecondary} keyboardType="numeric" />
              : <Typography style={st.fieldValue}>{userProfile.restingHR || '—'} bpm</Typography>
            }
          </FieldRow>

          <FieldRow icon={<Heart color="#F97316" size={16} />} label="Max HR (bpm)">
            {editing
              ? <TextInput style={st.input} value={userProfile.maxHR ? String(userProfile.maxHR) : ''} onChangeText={v => updateUserProfile({ maxHR: Number(v) })} placeholder="e.g. 185" placeholderTextColor={theme.colors.textSecondary} keyboardType="numeric" />
              : <Typography style={st.fieldValue}>{userProfile.maxHR || '—'} bpm</Typography>
            }
          </FieldRow>

          <FieldRow icon={<Target color={theme.colors.primary} size={16} />} label="Weekly Goal (km)">
            {editing
              ? <TextInput style={st.input} value={userProfile.weeklyGoalKm ? String(userProfile.weeklyGoalKm) : ''} onChangeText={v => updateUserProfile({ weeklyGoalKm: Number(v) })} placeholder="e.g. 40" placeholderTextColor={theme.colors.textSecondary} keyboardType="numeric" />
              : <Typography style={st.fieldValue}>{userProfile.weeklyGoalKm} km / week</Typography>
            }
          </FieldRow>

          <FieldRow icon={<CalendarDays color={theme.colors.secondary} size={16} />} label="Training Days / Week">
            {editing
              ? <ChipSelector options={['3', '4', '5', '6', '7'] as any} value={String(userProfile.trainingDaysPerWeek) as any} onChange={(v: any) => updateUserProfile({ trainingDaysPerWeek: Number(v) })} color={theme.colors.secondary} />
              : <Typography style={st.fieldValue}>{userProfile.trainingDaysPerWeek} days</Typography>
            }
          </FieldRow>

          <FieldRow icon={<Zap color="#FBBF24" size={16} />} label="Fitness Level">
            {editing
              ? <ChipSelector options={FITNESS_OPTIONS} value={userProfile.fitnessLevel} onChange={v => updateUserProfile({ fitnessLevel: v })} />
              : <Typography style={st.fieldValue}>{userProfile.fitnessLevel}</Typography>
            }
          </FieldRow>

          <FieldRow icon={<Activity color={theme.colors.accent} size={16} />} label="Preferred Terrain">
            {editing
              ? <ChipSelector options={TERRAIN_OPTIONS} value={userProfile.preferredTerrain} onChange={v => updateUserProfile({ preferredTerrain: v })} color={theme.colors.accent} />
              : <Typography style={st.fieldValue}>{userProfile.preferredTerrain}</Typography>
            }
          </FieldRow>
        </Card>

        {/* ── Lifestyle ── */}
        <Typography style={st.sectionLabel}>LIFESTYLE & HABITS</Typography>
        <Card style={st.sectionCard}>
          <FieldRow icon={<Moon color={theme.colors.accent} size={16} />} label="Sleep (hrs / night)">
            {editing
              ? <TextInput style={st.input} value={userProfile.sleepHours ? String(userProfile.sleepHours) : ''} onChangeText={v => updateUserProfile({ sleepHours: Number(v) })} placeholder="e.g. 7.5" placeholderTextColor={theme.colors.textSecondary} keyboardType="decimal-pad" />
              : <Typography style={st.fieldValue}>{userProfile.sleepHours} hrs</Typography>
            }
          </FieldRow>

          <FieldRow icon={<Utensils color={theme.colors.secondary} size={16} />} label="Nutrition Notes">
            {editing
              ? <TextInput style={[st.input, st.textArea]} value={userProfile.nutritionNotes} onChangeText={v => updateUserProfile({ nutritionNotes: v })} placeholder="e.g. Plant-based, high protein..." placeholderTextColor={theme.colors.textSecondary} multiline numberOfLines={3} />
              : <Typography style={st.fieldValue}>{userProfile.nutritionNotes || '—'}</Typography>
            }
          </FieldRow>

          <FieldRow icon={<Award color="#EF4444" size={16} />} label="Known Injuries / Niggles">
            {editing
              ? <TextInput style={[st.input, st.textArea]} value={userProfile.injuries} onChangeText={v => updateUserProfile({ injuries: v })} placeholder="e.g. Left knee tendinitis..." placeholderTextColor={theme.colors.textSecondary} multiline numberOfLines={3} />
              : <Typography style={st.fieldValue}>{userProfile.injuries || '—'}</Typography>
            }
          </FieldRow>
        </Card>

        {/* ── Badges quick strip ── */}
        <Typography style={st.sectionLabel}>BADGES  {earnedCount}/{totalBadges} UNLOCKED</Typography>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
          {[...getAllMilestoneDefs()]
            .sort((a, b) => (milestones.some(m => m.id === a.id) ? 0 : 1) - (milestones.some(m => m.id === b.id) ? 0 : 1))
            .map(def => {
              const earned = milestones.find(m => m.id === def.id);
              return (
                <View key={def.id} style={[st.badgeCard, !earned && { opacity: 0.35 }]}>
                  <Typography style={{ fontSize: 26 }}>{earned ? def.icon : '🔒'}</Typography>
                  <Typography style={st.badgeTitle} numberOfLines={2}>{def.title}</Typography>
                </View>
              );
            })}
        </ScrollView>

        {/* ── AI context note ── */}
        <Card style={st.llmNote}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Zap color={theme.colors.primary} size={16} />
            <Typography style={st.llmNoteTitle}>Sent to AI Coach</Typography>
          </View>
          <Typography style={st.llmNoteBody}>
            All fields above are included in every AI coaching prompt — the more you fill in, the more personalised your plans become.
          </Typography>
        </Card>

      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { paddingBottom: 40 },

  // Hero
  heroBanner: { paddingTop: 20, paddingBottom: 24, paddingHorizontal: 20, alignItems: 'center', marginBottom: 16 },
  editFab: {
    position: 'absolute', top: 16, right: 16,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarRing: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  avatar: {
    width: 78, height: 78, borderRadius: 39,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroName: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 8, textAlign: 'center' },
  heroPills: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 16 },
  heroPill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  heroPillText: { fontSize: 11, color: '#fff', fontWeight: '600' },
  heroRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 20, width: '100%' },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatNum: { fontSize: 18, fontWeight: '800', color: '#fff' },
  heroStatLbl: { fontSize: 10, color: 'rgba(255,255,255,0.75)', fontWeight: '600', marginTop: 2 },
  heroDiv: { width: 1, backgroundColor: 'rgba(255,255,255,0.3)' },

  // Stats row
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 20 },
  statCard: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', gap: 6, overflow: 'hidden' },
  statValue: { fontSize: 16, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.8)', fontWeight: '600', textAlign: 'center' },

  // Section
  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: theme.colors.textSecondary,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8,
    marginLeft: 16, marginTop: 4,
  },
  sectionCard: { padding: 0, overflow: 'hidden', marginBottom: 16, marginHorizontal: 16 },

  // Field rows
  fieldRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  fieldIcon: { marginRight: 12, marginTop: 2, width: 20, alignItems: 'center' },
  fieldContent: { flex: 1 },
  fieldLabel: { fontSize: 11, color: theme.colors.textSecondary, marginBottom: 4, fontWeight: '600' },
  fieldValue: { fontSize: 15, color: theme.colors.text, fontWeight: '500' },

  input: {
    backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 8, padding: 8, color: theme.colors.text, fontSize: 14,
  },
  textArea: { minHeight: 64, textAlignVertical: 'top' },
  dateInput: { flexDirection: 'row', alignItems: 'center', minHeight: 38 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'flex-end', padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.background,
  },
  chipText: { fontSize: 12, color: theme.colors.textSecondary },

  // Badges strip
  badgeCard: {
    alignItems: 'center', backgroundColor: theme.colors.surface,
    borderRadius: 12, padding: 12, marginLeft: 16, marginBottom: 4,
    minWidth: 72, borderWidth: 1, borderColor: theme.colors.border,
  },
  badgeTitle: { fontSize: 10, fontWeight: '600', color: theme.colors.text, marginTop: 6, textAlign: 'center', maxWidth: 64 },

  llmNote: {
    marginHorizontal: 16, marginBottom: 16, padding: 14,
    borderLeftWidth: 3, borderLeftColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '11',
  },
  llmNoteTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  llmNoteBody: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18 },
});
