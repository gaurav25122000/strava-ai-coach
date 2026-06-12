import React, { useEffect, useRef, useState } from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';
import { Check, Clock, Heart, MapPin, SkipForward } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { Icon } from '../Icon';
import { Sheet } from '../Sheet';
import { Button } from '../Button';
import { PressableScale } from '../PressableScale';
import { Typography } from '../Typography';
import { theme, withAlpha } from '../../theme';
import { Activity, CheckIn, DailyPrescription, WorkoutKind } from '../../store/useStore';
import { activityDayKey, localDateStr } from '../../utils/dates';
import { healthSourceLabel } from '../../services/activitySource';
import { isHealthActivityId } from '../../services/healthActivities';
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
  rpe?: number;
  /** Manually linked activity (overrides the auto-match). */
  activityId?: string;
}

interface Props {
  day: DayContext | null;
  /** All synced activities — filtered to the sheet's local day for linking. */
  activities: Activity[];
  onClose: () => void;
  onCheckIn: (day: DayContext, payload: DayCheckInPayload) => void;
}

const VERDICT_META: Record<NonNullable<CheckIn['matchVerdict']>, { label: string; color: string }> = {
  matched:  { label: 'Matched',  color: theme.colors.success },
  partial:  { label: 'Partial',  color: theme.colors.warning },
  mismatch: { label: 'Mismatch', color: theme.colors.error },
};

/**
 * Day check-in sheet: the day's prescription, the auto-match verdict for
 * Strava-derived check-ins, manual activity linking, and a Done/Skipped
 * check-in form (RPE appears only after choosing Done). The parent owns
 * persistence — this collects intent and calls `onCheckIn`.
 */
export function DayDetailSheet({ day, activities, onClose, onCheckIn }: Props) {
  const [choice, setChoice] = useState<'done' | 'skipped' | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [activityId, setActivityId] = useState<string | undefined>(undefined);

  // Re-seed local form state whenever a different day is opened. STRAVA
  // check-in notes are auto-match reasons, not the athlete's words — never
  // seed those into the editable notes field.
  useEffect(() => {
    if (!day) return;
    const ci = day.existingCheckIn;
    setChoice(ci ? (ci.completed ? 'done' : 'skipped') : null);
    setRpe(ci?.perceivedEffort ?? null);
    setNotes(ci && ci.source === 'MANUAL' && !ci.auto ? ci.notes || '' : '');
    setActivityId(ci?.activityId);
  }, [day]);

  // Retain the last opened day so the dismiss animation plays over real
  // content after `day` is cleared to null.
  const lastDay = useRef<DayContext | null>(day);
  if (day) lastDay.current = day;
  const active = day ?? lastDay.current;

  if (!active) return null;

  const presc = active.prescription;
  const kind: WorkoutKind = presc?.kind || 'REST';
  const color = WORKOUT_COLORS[kind];
  const ci = active.existingCheckIn;
  const isFuture = active.date > localDateStr(new Date());
  const dayActivities = activities.filter((a) => activityDayKey(a) === active.date);

  const save = () => {
    if (!choice) return;
    onCheckIn(active, {
      completed: choice === 'done',
      notes: notes.trim(),
      rpe: choice === 'done' && rpe != null ? rpe : undefined,
      activityId: choice === 'done' ? activityId : undefined,
    });
  };

  return (
    <Sheet
      visible={!!day}
      onClose={onClose}
      title={format(parseISO(active.date), 'EEEE, MMM d')}
      caption={`${WORKOUT_LABELS[kind]} day`}
      scrollable
    >
      {/* Prescription */}
      {presc ? (
        <View style={[styles.prescBox, { borderLeftColor: color }]}>
          <View style={styles.prescKindRow}>
            <View style={[styles.kindChip, { backgroundColor: withAlpha(color, 'tint'), borderColor: withAlpha(color, 'strong') }]}>
              {workoutIcon(presc.kind, 12, color)}
              <Typography style={[styles.kindChipText, { color }]}>{WORKOUT_LABELS[presc.kind]}</Typography>
            </View>
          </View>
          <Typography variant="subtitle" style={{ marginBottom: 4 }}>{presc.title}</Typography>
          <Typography variant="caption" style={styles.prescDesc}>{presc.description}</Typography>
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
              <View style={[styles.prescMetaPill, { backgroundColor: withAlpha(color, 'tint') }]}>
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

      {/* Auto-match verdict */}
      {ci?.source === 'STRAVA' && ci.matchVerdict && (
        <View style={[styles.verdictRow, { backgroundColor: withAlpha(VERDICT_META[ci.matchVerdict].color, 'soft') }]}>
          <View style={[styles.verdictChip, { backgroundColor: withAlpha(VERDICT_META[ci.matchVerdict].color, 'tint') }]}>
            <Typography style={[styles.verdictChipText, { color: VERDICT_META[ci.matchVerdict].color }]}>
              {VERDICT_META[ci.matchVerdict].label}
            </Typography>
          </View>
          <Typography variant="caption" style={styles.verdictText}>
            {/* The matched activity's own id says which source it came from —
                the active source may have changed since the check-in. */}
            {ci.notes || `Auto-matched from ${ci.activityId && isHealthActivityId(ci.activityId) ? healthSourceLabel() : 'Strava'}`}
          </Typography>
        </View>
      )}

      {isFuture ? (
        <Typography variant="caption" style={styles.futureHint}>
          Check-in opens on the workout's date.
        </Typography>
      ) : (
        <>
          {/* Manual activity link */}
          {dayActivities.length > 0 && (
            <>
              <Typography variant="label" style={styles.sectionLabel}>USE A DIFFERENT ACTIVITY</Typography>
              {dayActivities.map((a) => {
                const selected = activityId === a.id;
                return (
                  <PressableScale
                    key={a.id}
                    onPress={() => { setActivityId(a.id); setChoice('done'); }}
                    style={[styles.activityRow, selected && styles.activityRowSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <View style={{ flex: 1 }}>
                      <Typography style={styles.activityName} numberOfLines={1}>{a.name || a.type}</Typography>
                      <Typography style={styles.activityMeta}>
                        {(a.distance / 1000).toFixed(1)} km · {Math.round(a.movingTime / 60)} min
                      </Typography>
                    </View>
                    {selected && <Icon icon={Check} variant="plain" size="sm" color={theme.colors.success} />}
                  </PressableScale>
                );
              })}
            </>
          )}

          {/* Done / Skipped choice */}
          <Typography variant="label" style={styles.sectionLabel}>CHECK-IN</Typography>
          <View style={styles.choiceRow}>
            <Button
              title={kind === 'REST' ? 'Done resting' : 'Mark done'}
              variant={choice === 'done' ? 'primary' : 'outline'}
              family="plan"
              size="sm"
              icon={Check}
              onPress={() => setChoice('done')}
              style={{ flex: 1 }}
            />
            <Button
              title="Skipped"
              variant={choice === 'skipped' ? 'secondary' : 'ghost'}
              family="plan"
              size="sm"
              icon={SkipForward}
              onPress={() => { setChoice('skipped'); setActivityId(undefined); }}
              style={{ flex: 1 }}
            />
          </View>

          {/* RPE — only once the session is marked done */}
          {choice === 'done' && (
            <>
              <Typography variant="label" style={styles.sectionLabel}>HOW DID IT FEEL?</Typography>
              <View style={styles.rpeRow}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <TouchableOpacity
                    key={n}
                    onPress={() => setRpe(n)}
                    style={[styles.rpePill, rpe === n && { backgroundColor: color, borderColor: color }]}
                  >
                    <Typography style={[styles.rpeText, rpe === n && { color: theme.colors.onAccent }]}>{n}</Typography>
                  </TouchableOpacity>
                ))}
              </View>
              <Typography variant="caption" style={styles.rpeHint}>
                RPE 1 (very easy) → 10 (all-out)
              </Typography>
            </>
          )}

          <Typography variant="label" style={styles.sectionLabel}>NOTES (OPTIONAL)</Typography>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Form, weather, niggles — anything worth remembering."
            placeholderTextColor={theme.colors.textSecondary}
          />

          <Button
            title="Save check-in"
            family="plan"
            icon={Check}
            fullWidth
            disabled={!choice}
            onPress={save}
            style={{ marginTop: 16 }}
          />
        </>
      )}
    </Sheet>
  );
}
