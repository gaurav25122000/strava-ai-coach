import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import {
  Activity,
  AlertTriangle,
  Check,
  Clock,
  Coffee,
  Dumbbell,
  Heart,
  MapPin,
  Moon,
  Mountain,
  PersonStanding,
  Wind,
  Zap as ZapIcon,
  LucideIcon,
} from 'lucide-react-native';
import { Icon } from '../Icon';
import { BottomSheet } from '../BottomSheet';
import { format, parseISO } from 'date-fns';
import { Typography } from '../Typography';
import { theme } from '../../theme';
import { CheckIn, DailyPrescription, WorkoutKind } from '../../store/useStore';
import { REST_LABELS, WORKOUT_COLORS, WORKOUT_LABELS } from '../../utils/workoutKinds';
import { styles } from './styles';

// Map a workout kind to its lucide glyph component (BottomSheet's `icon` prop
// wants the component, not a rendered element — so this mirrors workoutIcon()
// from workoutKinds without owning that file).
const KIND_ICON: Record<WorkoutKind, LucideIcon> = {
  LONG: Mountain,
  INTERVALS: ZapIcon,
  TEMPO: Wind,
  STRENGTH: Dumbbell,
  CROSS: Activity,
  RECOVERY: Coffee,
  REST: Moon,
  EASY: PersonStanding,
};

export interface DayContext {
  goalId: string;
  date: string;                               // YYYY-MM-DD
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  prescription?: DailyPrescription;
  existingCheckIn?: CheckIn;
}

export interface DayCheckInPayload {
  completed: boolean;
  notes: string;
  rpe: number;
}

interface Props {
  day: DayContext | null;
  onClose: () => void;
  onCheckIn: (day: DayContext, payload: DayCheckInPayload) => void;
}

// Rest day default RPE is mid-scale; an actual session would override this.
const DEFAULT_RPE = 7;

/**
 * Bottom-sheet modal showing the day's prescription and capturing manual
 * completion (mark done / skipped + notes + RPE). The parent owns persistence
 * — this component only collects intent and calls `onCheckIn`.
 */
export function DayDetailSheet({ day, onClose, onCheckIn }: Props) {
  const [notes, setNotes] = useState('');
  const [rpe, setRpe] = useState(DEFAULT_RPE);

  // Re-seed local form state whenever a different day is opened.
  useEffect(() => {
    if (!day) return;
    setNotes(day.existingCheckIn?.notes || '');
    setRpe(day.existingCheckIn?.perceivedEffort || DEFAULT_RPE);
  }, [day]);

  // Retain the last opened day so the sheet's exit animation can play out the
  // existing content after `day` is cleared to null on close.
  const lastDay = useRef<DayContext | null>(day);
  if (day) lastDay.current = day;
  const active = day ?? lastDay.current;

  if (!active) return null;

  const presc = active.prescription;
  const kind: WorkoutKind = presc?.kind || 'REST';
  const color = WORKOUT_COLORS[kind];
  const ci = active.existingCheckIn;
  const dayName = format(parseISO(active.date), 'EEEE, MMM d');
  // Future workouts cannot be checked in — you can't truthfully say a session
  // is done before its date. The CTAs are disabled and a hint replaces them.
  const todayIso = format(new Date(), 'yyyy-MM-dd');
  const isFuture = active.date > todayIso;

  return (
    <BottomSheet
      visible={!!day}
      onClose={onClose}
      family="plan"
      icon={KIND_ICON[kind]}
      title={dayName}
      subtitle={`${WORKOUT_LABELS[kind]} day`}
      scrollable={false}
      edgeToEdge
      // Non-scrollable sheets only get a maxHeight, but this body uses a flex
      // column (scrollable middle + pinned CTA footer) that needs a DEFINITE
      // height to fill — without it the flex children collapse and only the
      // header shows. Pin the sheet to a concrete height.
      style={{ height: '82%' }}
    >
      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {presc ? (
              <View style={[styles.prescBox, { borderLeftColor: color }]}>
                <Typography variant="h3" style={{ marginBottom: 4 }}>{presc.title}</Typography>
                <Typography variant="caption" style={{ lineHeight: 18, marginBottom: 10 }}>
                  {presc.description}
                </Typography>
                <View style={styles.prescMetaRow}>
                  {typeof presc.distanceKm === 'number' && (
                    <View style={styles.prescMetaPill}>
                      <Icon icon={MapPin} variant="plain" size="xs" color={theme.colors.textSecondary} />
                      <Typography style={styles.prescMetaText}>{presc.distanceKm} km</Typography>
                    </View>
                  )}
                  {typeof presc.durationMin === 'number' && (
                    <View style={styles.prescMetaPill}>
                      <Icon icon={Clock} variant="plain" size="xs" color={theme.colors.textSecondary} />
                      <Typography style={styles.prescMetaText}>{presc.durationMin} min</Typography>
                    </View>
                  )}
                  {presc.intensity && (
                    <View style={[styles.prescMetaPill, { backgroundColor: color + '22' }]}>
                      <Icon icon={Heart} variant="plain" size="xs" color={color} />
                      <Typography style={[styles.prescMetaText, { color }]}>{presc.intensity}</Typography>
                    </View>
                  )}
                </View>
                {presc.rest && (
                  <View style={styles.restBox}>
                    <Typography variant="label" style={{ marginBottom: 4 }}>
                      REST · {REST_LABELS[presc.rest.kind] || presc.rest.kind}
                    </Typography>
                    <Typography variant="caption" style={{ lineHeight: 18 }}>{presc.rest.note}</Typography>
                  </View>
                )}
              </View>
            ) : (
              <View style={[styles.prescBox, { borderLeftColor: theme.colors.border }]}>
                <Typography variant="caption">No prescription for this day. Log it anyway if you trained.</Typography>
              </View>
            )}

            {ci?.source === 'STRAVA' && (() => {
              const matched = ci.matchVerdict === 'matched' || ci.matchVerdict === undefined;
              const tone = matched ? theme.colors.success : theme.colors.warning;
              return (
                <View style={[styles.autoMatched, !matched && { backgroundColor: 'rgba(245,158,11,0.10)' }]}>
                  <Icon icon={matched ? Check : AlertTriangle} variant="plain" size="xs" color={tone} />
                  <Typography variant="caption" style={{ color: tone, marginLeft: 6, flex: 1 }}>
                    {ci.notes || `Auto-matched from Strava activity ${ci.activityId?.slice(0, 8)}…`}
                  </Typography>
                </View>
              );
            })()}

            <Typography variant="label" style={{ marginTop: 18, marginBottom: 8 }}>HOW DID IT FEEL?</Typography>
            <View style={styles.rpeRow}>
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setRpe(n)}
                  style={[
                    styles.rpePill,
                    rpe === n && { backgroundColor: color, borderColor: color },
                  ]}
                >
                  <Typography style={[styles.rpeText, rpe === n && { color: '#fff' }]}>{n}</Typography>
                </TouchableOpacity>
              ))}
            </View>
            <Typography variant="caption" style={{ marginTop: 6, color: theme.colors.textSecondary }}>
              RPE 1 (very easy) → 10 (all-out)
            </Typography>

            <Typography variant="label" style={{ marginTop: 18, marginBottom: 8 }}>NOTES (OPTIONAL)</Typography>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Form, weather, niggles — anything worth remembering."
              placeholderTextColor={theme.colors.textSecondary}
            />
          </ScrollView>

          {isFuture ? (
            <View style={[styles.ctaRow, { justifyContent: 'center' }]}>
              <Typography variant="caption" style={{ color: theme.colors.textSecondary, textAlign: 'center' }}>
                Check-in opens on the workout's date.
              </Typography>
            </View>
          ) : (
            <View style={styles.ctaRow}>
              <TouchableOpacity
                style={[styles.cta, { backgroundColor: theme.colors.surfaceElevated }]}
                onPress={() => onCheckIn(active, { completed: false, notes: notes.trim(), rpe })}
              >
                <Typography weight="bold" color={theme.colors.text}>Skipped</Typography>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cta, { backgroundColor: color }]}
                onPress={() => onCheckIn(active, { completed: true, notes: notes.trim(), rpe })}
              >
                <Icon icon={Check} variant="plain" size="sm" color="#fff" />
                <Typography weight="bold" color="#fff" style={{ marginLeft: 6 }}>Mark Done</Typography>
              </TouchableOpacity>
            </View>
          )}
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}
