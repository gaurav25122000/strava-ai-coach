import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { Check, Clock, Heart, MapPin, X } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { Typography } from '../Typography';
import { theme } from '../../theme';
import { CheckIn, DailyPrescription, WorkoutKind } from '../../store/useStore';
import { REST_LABELS, WORKOUT_COLORS, WORKOUT_LABELS, workoutIcon } from '../../utils/workoutKinds';
import { styles } from './styles';

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

  if (!day) return null;

  const presc = day.prescription;
  const kind: WorkoutKind = presc?.kind || 'REST';
  const color = WORKOUT_COLORS[kind];
  const ci = day.existingCheckIn;
  const dayName = format(parseISO(day.date), 'EEEE, MMM d');

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior="padding">
        <View style={styles.sheet}>
          <View style={styles.dragHandle} />

          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.kindBadge, { backgroundColor: color }]}>
                {workoutIcon(kind, 14, '#fff')}
              </View>
              <View>
                <Typography variant="h3">{dayName}</Typography>
                <Typography variant="caption" style={{ color: theme.colors.textSecondary, marginTop: 1 }}>
                  {WORKOUT_LABELS[kind]} day
                </Typography>
              </View>
            </View>
            <TouchableOpacity onPress={onClose}>
              <X size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

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
                      <MapPin size={11} color={theme.colors.textSecondary} />
                      <Typography style={styles.prescMetaText}>{presc.distanceKm} km</Typography>
                    </View>
                  )}
                  {typeof presc.durationMin === 'number' && (
                    <View style={styles.prescMetaPill}>
                      <Clock size={11} color={theme.colors.textSecondary} />
                      <Typography style={styles.prescMetaText}>{presc.durationMin} min</Typography>
                    </View>
                  )}
                  {presc.intensity && (
                    <View style={[styles.prescMetaPill, { backgroundColor: color + '22' }]}>
                      <Heart size={11} color={color} />
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

            {ci?.source === 'STRAVA' && (
              <View style={styles.autoMatched}>
                <Check size={12} color={theme.colors.success} />
                <Typography variant="caption" style={{ color: theme.colors.success, marginLeft: 6 }}>
                  Auto-matched from Strava activity {ci.activityId?.slice(0, 8)}…
                </Typography>
              </View>
            )}

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

          <View style={styles.ctaRow}>
            <TouchableOpacity
              style={[styles.cta, { backgroundColor: theme.colors.surfaceElevated }]}
              onPress={() => onCheckIn(day, { completed: false, notes: notes.trim(), rpe })}
            >
              <Typography weight="bold" color={theme.colors.text}>Skipped</Typography>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cta, { backgroundColor: color }]}
              onPress={() => onCheckIn(day, { completed: true, notes: notes.trim(), rpe })}
            >
              <Check size={16} color="#fff" />
              <Typography weight="bold" color="#fff" style={{ marginLeft: 6 }}>Mark Done</Typography>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
