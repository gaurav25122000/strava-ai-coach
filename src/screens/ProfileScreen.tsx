import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
  Modal,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { Typography } from '../components/Typography';
import { useStore } from '../store/useStore';
import { Card } from '../components/Card';
import {
  User, Award, Activity, Share, CalendarDays, Weight,
  Heart, Target, Moon, Utensils, Zap, ChevronRight, Check,
} from 'lucide-react-native';

const TERRAIN_OPTIONS = ['Road', 'Trail', 'Track', 'Mixed'] as const;
const FITNESS_OPTIONS = ['Beginner', 'Intermediate', 'Advanced'] as const;

function SectionLabel({ label }: { label: string }) {
  return (
    <Typography style={styles.sectionLabel}>{label}</Typography>
  );
}

function FieldRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldIcon}>{icon}</View>
      <View style={styles.fieldContent}>
        <Typography style={styles.fieldLabel}>{label}</Typography>
        {children}
      </View>
    </View>
  );
}

function ChipSelector<T extends string>({
  options,
  value,
  onChange,
  color = theme.colors.primary,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  color?: string;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map(opt => {
        const active = opt === value;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => onChange(opt)}
            style={[styles.chip, active && { backgroundColor: color, borderColor: color }]}
          >
            {active && <Check size={11} color="#fff" style={{ marginRight: 3 }} />}
            <Typography style={[styles.chipText, active && { color: '#fff', fontWeight: '700' }]}>{opt}</Typography>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function ProfileScreen() {
  const { userStats, userProfile, updateUserProfile, settings } = useStore();
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Profile Hero ── */}
        <View style={styles.hero}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <User size={44} color={theme.colors.primary} />
            </View>
          </View>
          {userProfile.name ? (
            <Typography style={styles.heroName}>{userProfile.name}</Typography>
          ) : (
            <Typography style={styles.heroNamePlaceholder}>Tap Edit to set your name</Typography>
          )}
          <View style={styles.heroPills}>
            {age !== null && (
              <View style={styles.heroPill}><Typography style={styles.heroPillText}>{age} yrs</Typography></View>
            )}
            {userProfile.fitnessLevel ? (
              <View style={[styles.heroPill, { backgroundColor: theme.colors.primary + '33', borderColor: theme.colors.primary }]}>
                <Typography style={[styles.heroPillText, { color: theme.colors.primary }]}>{userProfile.fitnessLevel}</Typography>
              </View>
            ) : null}
            {userProfile.preferredTerrain ? (
              <View style={styles.heroPill}><Typography style={styles.heroPillText}>{userProfile.preferredTerrain}</Typography></View>
            ) : null}
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(e => !e)}>
            <Typography style={styles.editBtnText}>{editing ? 'Done' : 'Edit Profile'}</Typography>
          </TouchableOpacity>
        </View>

        {/* ── Lifetime Stats ── */}
        <SectionLabel label="LIFETIME STATS" />
        <View style={styles.statsGrid}>
          <Card style={styles.statCard}>
            <Activity color={theme.colors.secondary} size={22} />
            <Typography style={styles.statValue}>{userStats.totalRuns}</Typography>
            <Typography style={styles.statLbl}>Activities</Typography>
          </Card>
          <Card style={styles.statCard}>
            <Award color="#FBBF24" size={22} />
            <Typography style={styles.statValue}>{userStats.bestStreak}</Typography>
            <Typography style={styles.statLbl}>Best Streak</Typography>
          </Card>
          <Card style={styles.statCard}>
            <Target color={theme.colors.primary} size={22} />
            <Typography style={styles.statValue}>{totalKmDisplay}</Typography>
            <Typography style={styles.statLbl}>Distance</Typography>
          </Card>
        </View>

        {/* ── Personal Info (always shown) ── */}
        <SectionLabel label="PERSONAL" />
        <Card style={styles.sectionCard}>
          <FieldRow icon={<User color={theme.colors.primary} size={16} />} label="Name">
            {editing ? (
              <TextInput
                style={styles.input}
                value={userProfile.name}
                onChangeText={v => updateUserProfile({ name: v })}
                placeholder="Your name"
                placeholderTextColor={theme.colors.textSecondary}
              />
            ) : (
              <Typography style={styles.fieldValue}>{userProfile.name || '—'}</Typography>
            )}
          </FieldRow>

          <FieldRow icon={<CalendarDays color={theme.colors.accent} size={16} />} label="Date of Birth">
            {editing ? (
              <TouchableOpacity onPress={() => setShowDobPicker(true)} activeOpacity={0.7}>
                <View style={[styles.input, styles.dateInput]}>
                  <Typography style={{ color: userProfile.dob ? theme.colors.text : theme.colors.textSecondary, fontSize: 14 }}>
                    {userProfile.dob || 'Tap to select date'}
                  </Typography>
                  {age !== null && <Typography style={{ fontSize: 12, color: theme.colors.textSecondary, marginLeft: 8 }}>({age} yrs)</Typography>}
                </View>
              </TouchableOpacity>
            ) : (
              <Typography style={styles.fieldValue}>{userProfile.dob || '—'}{age !== null ? `  (${age} yrs)` : ''}</Typography>
            )}

            {/* iOS modal picker */}
            {showDobPicker && Platform.OS === 'ios' && (
              <Modal transparent animationType="slide" visible={showDobPicker}>
                <View style={styles.pickerOverlay}>
                  <View style={styles.pickerSheet}>
                    <View style={styles.pickerHeader}>
                      <TouchableOpacity onPress={() => setShowDobPicker(false)}>
                        <Typography style={{ color: theme.colors.primary, fontWeight: '700' }}>Done</Typography>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={dobDate}
                      mode="date"
                      display="spinner"
                      maximumDate={new Date()}
                      onChange={onDobChange}
                      textColor={theme.colors.text}
                    />
                  </View>
                </View>
              </Modal>
            )}
            {/* Android inline picker */}
            {showDobPicker && Platform.OS === 'android' && (
              <DateTimePicker
                value={dobDate}
                mode="date"
                display="default"
                maximumDate={new Date()}
                onChange={onDobChange}
              />
            )}
          </FieldRow>

          <FieldRow icon={<Weight color="#FBBF24" size={16} />} label="Weight (kg)">
            {editing ? (
              <TextInput
                style={styles.input}
                value={userProfile.weight ? String(userProfile.weight) : ''}
                onChangeText={v => updateUserProfile({ weight: Number(v) })}
                placeholder="e.g. 70"
                placeholderTextColor={theme.colors.textSecondary}
                keyboardType="numeric"
              />
            ) : (
              <Typography style={styles.fieldValue}>{userProfile.weight || '—'} kg</Typography>
            )}
          </FieldRow>

          <FieldRow icon={<Zap color={theme.colors.secondary} size={16} />} label="Height (cm)">
            {editing ? (
              <TextInput
                style={styles.input}
                value={userProfile.height ? String(userProfile.height) : ''}
                onChangeText={v => updateUserProfile({ height: Number(v) })}
                placeholder="e.g. 175"
                placeholderTextColor={theme.colors.textSecondary}
                keyboardType="numeric"
              />
            ) : (
              <Typography style={styles.fieldValue}>{userProfile.height || '—'} cm</Typography>
            )}
          </FieldRow>
        </Card>

        {/* ── Athletic Profile ── */}
        <SectionLabel label="ATHLETIC PROFILE" />
        <Card style={styles.sectionCard}>
          <FieldRow icon={<Heart color="#EF4444" size={16} />} label="Resting HR (bpm)">
            {editing ? (
              <TextInput
                style={styles.input}
                value={userProfile.restingHR ? String(userProfile.restingHR) : ''}
                onChangeText={v => updateUserProfile({ restingHR: Number(v) })}
                placeholder="e.g. 55"
                placeholderTextColor={theme.colors.textSecondary}
                keyboardType="numeric"
              />
            ) : (
              <Typography style={styles.fieldValue}>{userProfile.restingHR || '—'} bpm</Typography>
            )}
          </FieldRow>

          <FieldRow icon={<Heart color="#F97316" size={16} />} label="Max HR (bpm)">
            {editing ? (
              <TextInput
                style={styles.input}
                value={userProfile.maxHR ? String(userProfile.maxHR) : ''}
                onChangeText={v => updateUserProfile({ maxHR: Number(v) })}
                placeholder="e.g. 185"
                placeholderTextColor={theme.colors.textSecondary}
                keyboardType="numeric"
              />
            ) : (
              <Typography style={styles.fieldValue}>{userProfile.maxHR || '—'} bpm</Typography>
            )}
          </FieldRow>

          <FieldRow icon={<Target color={theme.colors.primary} size={16} />} label="Weekly Goal (km)">
            {editing ? (
              <TextInput
                style={styles.input}
                value={userProfile.weeklyGoalKm ? String(userProfile.weeklyGoalKm) : ''}
                onChangeText={v => updateUserProfile({ weeklyGoalKm: Number(v) })}
                placeholder="e.g. 40"
                placeholderTextColor={theme.colors.textSecondary}
                keyboardType="numeric"
              />
            ) : (
              <Typography style={styles.fieldValue}>{userProfile.weeklyGoalKm} km / week</Typography>
            )}
          </FieldRow>

          <FieldRow icon={<CalendarDays color={theme.colors.secondary} size={16} />} label="Training Days / Week">
            {editing ? (
              <ChipSelector
                options={['3', '4', '5', '6', '7'] as any}
                value={String(userProfile.trainingDaysPerWeek) as any}
                onChange={(v: any) => updateUserProfile({ trainingDaysPerWeek: Number(v) })}
                color={theme.colors.secondary}
              />
            ) : (
              <Typography style={styles.fieldValue}>{userProfile.trainingDaysPerWeek} days</Typography>
            )}
          </FieldRow>

          <FieldRow icon={<Zap color="#FBBF24" size={16} />} label="Fitness Level">
            {editing ? (
              <ChipSelector options={FITNESS_OPTIONS} value={userProfile.fitnessLevel} onChange={v => updateUserProfile({ fitnessLevel: v })} />
            ) : (
              <Typography style={styles.fieldValue}>{userProfile.fitnessLevel}</Typography>
            )}
          </FieldRow>

          <FieldRow icon={<Activity color={theme.colors.accent} size={16} />} label="Preferred Terrain">
            {editing ? (
              <ChipSelector options={TERRAIN_OPTIONS} value={userProfile.preferredTerrain} onChange={v => updateUserProfile({ preferredTerrain: v })} color={theme.colors.accent} />
            ) : (
              <Typography style={styles.fieldValue}>{userProfile.preferredTerrain}</Typography>
            )}
          </FieldRow>
        </Card>

        {/* ── Lifestyle ── */}
        <SectionLabel label="LIFESTYLE & HABITS" />
        <Card style={styles.sectionCard}>
          <FieldRow icon={<Moon color={theme.colors.accent} size={16} />} label="Sleep (hrs / night)">
            {editing ? (
              <TextInput
                style={styles.input}
                value={userProfile.sleepHours ? String(userProfile.sleepHours) : ''}
                onChangeText={v => updateUserProfile({ sleepHours: Number(v) })}
                placeholder="e.g. 7.5"
                placeholderTextColor={theme.colors.textSecondary}
                keyboardType="decimal-pad"
              />
            ) : (
              <Typography style={styles.fieldValue}>{userProfile.sleepHours} hrs</Typography>
            )}
          </FieldRow>

          <FieldRow icon={<Utensils color={theme.colors.secondary} size={16} />} label="Nutrition Notes">
            {editing ? (
              <TextInput
                style={[styles.input, styles.textArea]}
                value={userProfile.nutritionNotes}
                onChangeText={v => updateUserProfile({ nutritionNotes: v })}
                placeholder="e.g. Plant-based, no dairy, high protein..."
                placeholderTextColor={theme.colors.textSecondary}
                multiline
                numberOfLines={3}
              />
            ) : (
              <Typography style={styles.fieldValue}>{userProfile.nutritionNotes || '—'}</Typography>
            )}
          </FieldRow>

          <FieldRow icon={<Award color="#EF4444" size={16} />} label="Known Injuries / Niggles">
            {editing ? (
              <TextInput
                style={[styles.input, styles.textArea]}
                value={userProfile.injuries}
                onChangeText={v => updateUserProfile({ injuries: v })}
                placeholder="e.g. Left knee tendinitis, tight hamstrings..."
                placeholderTextColor={theme.colors.textSecondary}
                multiline
                numberOfLines={3}
              />
            ) : (
              <Typography style={styles.fieldValue}>{userProfile.injuries || '—'}</Typography>
            )}
          </FieldRow>
        </Card>

        {/* ── LLM Context Note ── */}
        <Card style={styles.llmNote}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Zap color={theme.colors.primary} size={16} />
            <Typography style={styles.llmNoteTitle}>Sent to AI Coach</Typography>
          </View>
          <Typography style={styles.llmNoteBody}>
            All fields above are included in every AI coaching prompt — the more you fill in, the more personalised your plans become.
          </Typography>
        </Card>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { padding: 16, paddingBottom: 40 },

  hero: { alignItems: 'center', marginBottom: 24, paddingTop: 8 },
  avatarRing: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 2.5, borderColor: theme.colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: theme.colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  heroName: { fontSize: 22, fontWeight: '800', color: theme.colors.text, marginBottom: 8 },
  heroNamePlaceholder: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 8 },
  heroPills: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 12 },
  heroPill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
  },
  heroPillText: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '600' },
  editBtn: {
    backgroundColor: theme.colors.primary, paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 20,
  },
  editBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  statCard: { flex: 1, alignItems: 'center', padding: 12, gap: 4 },
  statValue: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginTop: 4 },
  statLbl: { fontSize: 10, color: theme.colors.textSecondary, textAlign: 'center' },

  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: theme.colors.textSecondary,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, marginLeft: 2,
  },
  sectionCard: { padding: 0, overflow: 'hidden', marginBottom: 16 },

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

  llmNote: {
    marginBottom: 16, padding: 14,
    borderLeftWidth: 3, borderLeftColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '11',
  },
  llmNoteTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  llmNoteBody: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18 },
});
