import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Image, Platform } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { theme, withAlpha } from '../theme';
import { Typography } from '../components/Typography';
import { useStore, UserProfile } from '../store/useStore';
import { BadgeMedal } from '../components/BadgeMedal';
import { WidgetCard } from '../components/WidgetCard';
import { familyStyle, WidgetFamily } from '../utils/widgetFamilies';
import { HeatmapCalendar } from '../components/HeatmapCalendar';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { FieldBlock, SegmentedControl, SectionLabel } from '../components/SheetUI';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { PressableScale } from '../components/PressableScale';
import { StaggerItem } from '../components/Stagger';
import { localDateStr } from '../utils/dates';
import { useNavigation } from '@react-navigation/native';
import {
  User, Award, Activity, CalendarDays, Weight,
  Heart, HeartPulse, Target, Moon, Utensils, Zap, Check,
  Pencil, Flame, Trophy, Ruler,
  ChevronLeft, Clock, Mountain, Timer,
  type LucideIcon,
} from 'lucide-react-native';
import { Icon } from '../components/Icon';
import { getAllMilestoneDefs } from '../services/milestones';

const successHaptic = () => {
  if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

// ── Field config ──────────────────────────────────────────────────────────
// One array drives BOTH the read-only display cards and the edit sheet, so
// the two can never drift apart. Each field knows its section, icon, label,
// and how it's edited (text / bounded number / date / segmented choice).
type SectionKey = 'personal' | 'athletic' | 'lifestyle';

const SECTIONS: Record<SectionKey, { title: string; family: WidgetFamily; icon: LucideIcon }> = {
  personal:  { title: 'Personal',           family: 'records',  icon: User },
  athletic:  { title: 'Athletic Profile',   family: 'health',   icon: Heart },
  lifestyle: { title: 'Lifestyle & Habits', family: 'recovery', icon: Moon },
};
const SECTION_ORDER: SectionKey[] = ['personal', 'athletic', 'lifestyle'];

type FieldDef = {
  key: keyof UserProfile;
  icon: LucideIcon;
  label: string;
  section: SectionKey;
  placeholder?: string;
} & (
  | { kind: 'text'; multiline?: boolean; autoCapitalize?: 'words' | 'sentences' }
  | { kind: 'number'; min?: number; max?: number; unit?: string; decimal?: boolean }
  | { kind: 'date' }
  | { kind: 'segment'; options: readonly string[]; numeric?: boolean }
);

const PROFILE_FIELDS: FieldDef[] = [
  { key: 'name',      icon: User,         label: 'Name',          section: 'personal', kind: 'text', placeholder: 'Your name', autoCapitalize: 'words' },
  { key: 'dob',       icon: CalendarDays, label: 'Date of Birth', section: 'personal', kind: 'date', placeholder: 'Tap to choose' },
  { key: 'weight',    icon: Weight,       label: 'Weight',        section: 'personal', kind: 'number', placeholder: 'e.g. 70',  min: 30,  max: 200, unit: 'kg' },
  { key: 'height',    icon: Ruler,        label: 'Height',        section: 'personal', kind: 'number', placeholder: 'e.g. 175', min: 100, max: 250, unit: 'cm' },
  { key: 'restingHR', icon: Heart,        label: 'Resting HR',    section: 'athletic', kind: 'number', placeholder: 'e.g. 52',  min: 25,  max: 230, unit: 'bpm' },
  { key: 'maxHR',     icon: HeartPulse,   label: 'Max HR',        section: 'athletic', kind: 'number', placeholder: 'e.g. 188', min: 25,  max: 230, unit: 'bpm' },
  { key: 'weeklyGoalKm', icon: Target,    label: 'Weekly Goal',   section: 'athletic', kind: 'number', placeholder: 'e.g. 40', unit: 'km / week' },
  { key: 'trainingDaysPerWeek', icon: CalendarDays, label: 'Training Days / Week', section: 'athletic', kind: 'segment', options: ['3', '4', '5', '6', '7'], numeric: true },
  { key: 'fitnessLevel',     icon: Zap,      label: 'Fitness Level',     section: 'athletic', kind: 'segment', options: ['Beginner', 'Intermediate', 'Advanced'] },
  { key: 'preferredTerrain', icon: Activity, label: 'Preferred Terrain', section: 'athletic', kind: 'segment', options: ['Road', 'Trail', 'Track', 'Mixed'] },
  { key: 'sleepHours',     icon: Moon,     label: 'Sleep',           section: 'lifestyle', kind: 'number', placeholder: 'e.g. 7.5', unit: 'hrs / night', decimal: true },
  { key: 'nutritionNotes', icon: Utensils, label: 'Nutrition Notes', section: 'lifestyle', kind: 'text', multiline: true, placeholder: 'Diet, supplements, etc.', autoCapitalize: 'sentences' },
  { key: 'injuries',       icon: Award,    label: 'Known Injuries / Niggles', section: 'lifestyle', kind: 'text', multiline: true, placeholder: 'So the AI coach can adjust', autoCapitalize: 'sentences' },
];

// Draft holds every field as a string so TextInputs can be empty mid-edit.
type Draft = Record<string, string>;

function draftFromProfile(p: UserProfile): Draft {
  const d: Draft = {};
  for (const f of PROFILE_FIELDS) {
    const v = p[f.key];
    d[f.key] = f.kind === 'number' ? (v ? String(v) : '') : String(v ?? '');
  }
  return d;
}

function numberError(f: Extract<FieldDef, { kind: 'number' }>, raw: string): string | undefined {
  if (!raw.trim()) return undefined; // empty = unset, always allowed
  const n = Number(raw);
  if (!Number.isFinite(n)) return 'Enter a number';
  if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) {
    return `Must be ${f.min}–${f.max}${f.unit ? ` ${f.unit}` : ''}`;
  }
  return undefined;
}

// ── Local row primitives ──────────────────────────────────────────────────
// Read-only display row: family-tinted pill icon, label + value stacked.
function ReadOnlyField({
  icon, label, value, caption, family, isLast,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  /** Muted note under the value (e.g. "approximated from Strava"). */
  caption?: string;
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
        {caption ? <Typography style={st.roCaption}>{caption}</Typography> : null}
      </View>
    </View>
  );
}

// Lifetime-stat tile used in the 2×3 grid. Local because the shared StatTile
// component has a different layout (delta row) that doesn't suit a square grid.
function StatTile({
  family, icon, value, label, numericValue, suffix, decimals,
}: {
  family: WidgetFamily;
  icon: LucideIcon;
  value: string;
  label: string;
  numericValue?: number;
  suffix?: string;
  decimals?: number;
}) {
  const fam = familyStyle(family);
  return (
    <PressableScale
      style={[st.statTile, { borderColor: withAlpha(fam.accent, 'medium') }]}
      scaleTo={0.97}
      haptic="selection"
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
  const userStats = useStore(s => s.userStats);
  const userProfile = useStore(s => s.userProfile);
  const updateUserProfile = useStore(s => s.updateUserProfile);
  const settings = useStore(s => s.settings);
  const milestones = useStore(s => s.milestones);
  const bestEfforts = useStore(s => s.bestEfforts);
  const activities = useStore(s => s.activities);
  const athleteStats = useStore(s => s.athleteStats);
  const setToast = useStore(s => s.setToast);
  const navigation = useNavigation<any>();

  // Sheet-driven edit flow. `draft` mirrors userProfile (as strings) so
  // cancelling discards unsaved input; opening re-seeds from current profile.
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFromProfile(userProfile));
  useEffect(() => {
    if (editOpen) setDraft(draftFromProfile(userProfile));
  }, [editOpen, userProfile]);

  const [showDobPicker, setShowDobPicker] = useState(false);

  const dobDate = draft.dob ? new Date(draft.dob) : new Date(1990, 0, 1);
  const onDobChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowDobPicker(false);
    if (selected) setDraft(d => ({ ...d, dob: localDateStr(selected) }));
  };
  const age = userProfile.dob
    ? Math.floor((Date.now() - new Date(userProfile.dob).getTime()) / (365.25 * 86400000))
    : null;

  // Per-field bounds validation — surfaced inline via FieldBlock's error prop
  // and blocking Save while any error exists.
  const errors = useMemo(() => {
    const e: Partial<Record<string, string>> = {};
    for (const f of PROFILE_FIELDS) {
      if (f.kind === 'number') e[f.key] = numberError(f, draft[f.key] ?? '');
    }
    return e;
  }, [draft]);
  const hasErrors = Object.values(errors).some(Boolean);

  const handleSave = () => {
    if (hasErrors) return;
    const patch: Partial<UserProfile> = {};
    for (const f of PROFILE_FIELDS) {
      const raw = draft[f.key] ?? '';
      if (f.kind === 'number' || (f.kind === 'segment' && f.numeric)) {
        (patch as any)[f.key] = Number(raw) || 0;
      } else if (f.kind === 'text') {
        (patch as any)[f.key] = raw.trim();
      } else {
        (patch as any)[f.key] = raw;
      }
    }
    updateUserProfile(patch);
    setEditOpen(false);
    successHaptic();
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

  // Derive HR fields from Strava activity data when the user hasn't set their
  // own. Max HR is the highest max_heartrate observed; resting HR is
  // approximated as the lowest average HR seen across activities (the closest
  // signal Strava's free API exposes).
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

  // Fallback values + captions for fields the user hasn't filled in but we can
  // approximate from Strava data.
  const derivedValues: Partial<Record<string, { value: string; caption: string }>> = useMemo(() => ({
    ...(!userProfile.restingHR && stravaRestingHR
      ? { restingHR: { value: `${stravaRestingHR} bpm`, caption: 'Approximated from your easiest runs' } }
      : {}),
    ...(!userProfile.maxHR && stravaMaxHR
      ? { maxHR: { value: `${stravaMaxHR} bpm`, caption: 'Highest heart rate seen in your activities' } }
      : {}),
  }), [userProfile.restingHR, userProfile.maxHR, stravaRestingHR, stravaMaxHR]);

  const readValue = (f: FieldDef): string => {
    const v = userProfile[f.key];
    if (f.kind === 'number') return v ? `${v}${f.unit ? ` ${f.unit}` : ''}` : '';
    if (f.kind === 'date') return v ? `${v}${age !== null ? `  (${age} yrs)` : ''}` : '';
    return v ? String(v) : '';
  };

  // Strava avatar — the raw athlete payload carries `profile` (124px avatar
  // URL). Strava returns a placeholder path for accounts without a photo, so
  // only treat real http(s) image URLs as usable.
  const avatarUrl: string | undefined = athleteStats?.athlete?.profile;
  const hasAvatar = typeof avatarUrl === 'string'
    && /^https?:\/\//.test(avatarUrl)
    && !avatarUrl.includes('avatar/athlete');

  const initials = userProfile.name
    ? userProfile.name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('')
    : '';

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

  const recordsFam = familyStyle('records');

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
            {/* Top-left back button — Settings/Gear now live in the Menu hub */}
            <View style={st.heroIconRow}>
              <PressableScale
                onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MenuHome'))}
                style={st.heroIconBtn}
                hitSlop={theme.hitSlop}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Icon icon={ChevronLeft} variant="plain" size="md" color={theme.colors.onAccent} />
              </PressableScale>
            </View>
          </LinearGradient>

          {/* Avatar overlaps the banner bottom edge */}
          <View style={st.avatarWrap} pointerEvents="none">
            <View style={st.avatarRing}>
              {hasAvatar ? (
                <Image source={{ uri: avatarUrl }} style={st.avatarImg} />
              ) : (
                <LinearGradient
                  colors={theme.colors.gradients.surface}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={st.avatar}
                >
                  {initials
                    ? <Typography style={st.avatarInitials}>{initials}</Typography>
                    : <Icon icon={User} variant="plain" size="xl" color={theme.colors.text} />}
                </LinearGradient>
              )}
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
            <Button
              title="Edit Profile"
              icon={Pencil}
              size="sm"
              variant="secondary"
              family="records"
              onPress={() => setEditOpen(true)}
              style={{ marginTop: 12 }}
            />
          </View>
        </View>

        {/* ── Lifetime Stats Grid (2×3) ── */}
        <StaggerItem index={0}>
          <View style={st.gridRow}>
            <StatTile family="activity" icon={Activity} value={totalKmDisplay} numericValue={Number(totalKmDisplay)} label={`Total ${totalKmUnit}`} />
            <StatTile family="activity" icon={Clock} value={formatDuration(totalTimeSec)} label="Total time" />
            <StatTile family="activity" icon={Mountain} value={`${totalElevation}`} numericValue={totalElevation} label="Elev. m" />
          </View>
          <View style={st.gridRow}>
            <StatTile family="activity" icon={Timer} value={`${activitiesCount}`} numericValue={activitiesCount} label="Activities" />
            <StatTile family="recovery" icon={Flame} value={`${userStats.bestStreak}d`} numericValue={userStats.bestStreak} suffix="d" label="Best streak" />
            <StatTile family="records" icon={Trophy} value={`${earnedCount}/${totalBadges}`} label="Badges" />
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
                  <View style={[st.pbDistanceChip, { backgroundColor: recordsFam.tint, borderColor: withAlpha(recordsFam.accent, 'strong') }]}>
                    <Typography style={[st.pbDistance, { color: recordsFam.accent }]}>{row.label}</Typography>
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

        {/* ── Profile sections (read-only display, config-driven) ── */}
        {SECTION_ORDER.map((sec, i) => {
          const meta = SECTIONS[sec];
          const fields = PROFILE_FIELDS.filter(f => f.section === sec);
          return (
            <StaggerItem index={4 + i} key={sec}>
              <WidgetCard family={meta.family} title={meta.title} icon={meta.icon}>
                <View style={st.roList}>
                  {fields.map((f, idx) => {
                    const own = readValue(f);
                    const derived = !own ? derivedValues[f.key] : undefined;
                    return (
                      <ReadOnlyField
                        key={f.key}
                        icon={f.icon}
                        label={f.label}
                        value={own || derived?.value || ''}
                        caption={derived?.caption}
                        family={meta.family}
                        isLast={idx === fields.length - 1}
                      />
                    );
                  })}
                </View>
              </WidgetCard>
            </StaggerItem>
          );
        })}

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

      {/* ── Edit Profile Sheet (config-driven) ── */}
      <Sheet
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Profile"
        caption="Update your details — save when ready"
        scrollable
      >
        {SECTION_ORDER.map((sec) => {
          const meta = SECTIONS[sec];
          const fields = PROFILE_FIELDS.filter(f => f.section === sec);
          return (
            <React.Fragment key={sec}>
              <SectionLabel family={meta.family} style={sec !== 'personal' ? { marginTop: 18 } : undefined}>
                {meta.title}
              </SectionLabel>
              {fields.map((f) => {
                if (f.kind === 'segment') {
                  return (
                    <View key={f.key} style={{ marginBottom: 12 }}>
                      <SectionLabel family={meta.family} style={{ marginTop: 4 }}>{f.label}</SectionLabel>
                      <SegmentedControl<string>
                        family={meta.family}
                        segments={f.options.map(o => ({ value: o, label: o }))}
                        value={draft[f.key]}
                        onChange={(v) => setDraft(d => ({ ...d, [f.key]: v }))}
                      />
                    </View>
                  );
                }
                if (f.kind === 'date') {
                  return (
                    <React.Fragment key={f.key}>
                      <FieldBlock
                        family={meta.family}
                        label={f.label}
                        value={draft[f.key] || ''}
                        onPress={() => setShowDobPicker(v => !v)}
                        placeholder={f.placeholder}
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
                    </React.Fragment>
                  );
                }
                if (f.kind === 'number') {
                  return (
                    <FieldBlock
                      key={f.key}
                      family={meta.family}
                      label={f.unit ? `${f.label} (${f.unit})` : f.label}
                      value={draft[f.key] || ''}
                      onChangeText={(v) => setDraft(d => ({ ...d, [f.key]: v }))}
                      placeholder={f.placeholder}
                      keyboardType={f.decimal ? 'decimal-pad' : 'numeric'}
                      numeric
                      error={errors[f.key]}
                    />
                  );
                }
                return (
                  <FieldBlock
                    key={f.key}
                    family={meta.family}
                    label={f.label}
                    value={draft[f.key] || ''}
                    onChangeText={(v) => setDraft(d => ({ ...d, [f.key]: v }))}
                    placeholder={f.placeholder}
                    multiline={f.multiline}
                    autoCapitalize={f.autoCapitalize}
                  />
                );
              })}
            </React.Fragment>
          );
        })}

        <Button
          title="Save Changes"
          icon={Check}
          family="records"
          fullWidth
          disabled={hasErrors}
          onPress={handleSave}
          style={{ marginTop: 10 }}
        />
      </Sheet>

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
  heroIconRow: {
    position: 'absolute', top: 14, left: 14,
    flexDirection: 'row', gap: 8,
  },
  heroIconBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    // Dark scrim (not white tint) so the white glyph stays legible on the
    // bright gold hero gradient — white-on-light washed the icons out.
    backgroundColor: theme.colors.scrim,
    borderWidth: 1, borderColor: withAlpha(theme.colors.onAccent, 'strong'),
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
    borderWidth: 2, borderColor: withAlpha(theme.colors.onAccent, 'soft'),
  },
  avatarImg: {
    width: AVATAR_SIZE, height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
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
  roCaption: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 3 },

  llmNote: {
    marginHorizontal: 16, marginBottom: 16, padding: 14,
    borderLeftWidth: 3, borderLeftColor: theme.colors.primary,
    backgroundColor: withAlpha(theme.colors.primary, 'soft'),
  },
  llmNoteTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  llmNoteBody: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18 },
});
