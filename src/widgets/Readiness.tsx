import React, { memo, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BatteryCharging, HeartPulse, Minus, Moon, Plus } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { PressableScale } from '../components/PressableScale';
import { DonutRing } from '../components/DonutRing';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Sheet } from '../components/Sheet';
import { EmptyHint } from './common';
import { StatChip } from './_shared';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { localDateStr } from '../utils/dates';
import { ReadinessLabel, readinessScore } from '../services/readiness';
import { importLastNightSleep } from '../services/health';
import { useStore } from '../store/useStore';

const LABEL_COLORS: Record<ReadinessLabel, string> = {
  Primed: theme.colors.success,
  Ready: theme.colors.families.recovery.accent,
  Steady: theme.colors.families.progress.accent,
  Tired: theme.colors.warning,
  'Run down': theme.colors.error,
};

const QUALITY_OPTIONS = [
  { value: 1, label: 'Rough' },
  { value: 2, label: 'Okay' },
  { value: 3, label: 'Great' },
] as const;

/** Sub-score (0–100) → chip colour: green ok, amber strained, red in trouble. */
function partColor(part: number | null): string {
  if (part === null) return theme.colors.textSecondary;
  if (part >= 80) return theme.colors.success;
  if (part >= 50) return theme.colors.warning;
  return theme.colors.error;
}

/**
 * Morning readiness: sleep (45%) + acute:chronic load (35%) + yesterday's
 * strain (20%) blended into one 0–100 ring with a coaching line. Sleep is
 * logged from the sheet — manually or imported from HealthKit/Health Connect.
 */
export const ReadinessWidget = memo(function ReadinessWidget() {
  const activities = useStore((s) => s.activities);
  const sleepLog = useStore((s) => s.sleepLog);
  const dailyHealth = useStore((s) => s.dailyHealth);
  const setSleep = useStore((s) => s.setSleep);
  const setToast = useStore((s) => s.setToast);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [hours, setHours] = useState(8);
  const [quality, setQuality] = useState<1 | 2 | 3 | undefined>(undefined);
  const [importing, setImporting] = useState(false);

  const result = useMemo(() => readinessScore({ sleepLog, activities, dailyHealth }), [sleepLog, activities, dailyHealth]);

  const todayKey = localDateStr(new Date());
  const todayEntry = sleepLog[todayKey];
  const fam = familyStyle('recovery');
  const color = LABEL_COLORS[result.label];

  const openSheet = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const prior = todayEntry ?? sleepLog[localDateStr(yesterday)];
    setHours(prior?.hours ?? 8);
    setQuality(todayEntry?.quality);
    setSheetOpen(true);
  };

  const step = (delta: number) =>
    setHours((h) => Math.min(14, Math.max(0, Math.round((h + delta) * 2) / 2)));

  const save = () => {
    setSleep(todayKey, { hours, quality });
    setSheetOpen(false);
  };

  const importFromHealth = async () => {
    setImporting(true);
    try {
      const res = await importLastNightSleep();
      if (res === 'unavailable') {
        setToast({ title: 'Update needed', message: 'Health import needs the latest app build.', type: 'error' });
      } else if (res === null) {
        setToast({ title: 'No sleep data found', message: 'Nothing recorded for last night in Health.', type: 'info' });
      } else {
        setHours(res.hours);
        setSleep(res.day, { hours: res.hours, quality });
        setToast({ title: 'Sleep imported', message: `${res.hours} h from last night.`, type: 'success' });
      }
    } finally {
      setImporting(false);
    }
  };

  const strainWord =
    result.parts.strain >= 80 ? 'ok' : result.parts.strain >= 50 ? 'high' : 'heavy';

  return (
    <>
      <WidgetCard
        family={WIDGET_FAMILY['Readiness']}
        title={WIDGET_TITLES['Readiness']}
        icon={BatteryCharging}
        action={
          <PressableScale
            onPress={openSheet}
            hitSlop={theme.hitSlop}
            accessibilityRole="button"
            accessibilityLabel="Log sleep"
            style={[styles.logChip, { backgroundColor: withAlpha(fam.accent, 'tint') }]}
          >
            <Moon size={12} color={fam.accent} />
            <Typography style={[styles.logChipTxt, { color: fam.accent }]}>Log sleep</Typography>
          </PressableScale>
        }
      >
        {activities.length === 0 ? (
          <EmptyHint
            icon={BatteryCharging}
            family="recovery"
            text="Sync Strava activities to unlock your readiness score."
          />
        ) : (
          <>
            <View style={styles.row}>
              <DonutRing
                size={112}
                stroke={11}
                progress={result.score / 100}
                color={color}
                trackColor={withAlpha(color, 'soft')}
              >
                <AnimatedNumber value={result.score} style={styles.ringNum as any} />
                <Typography style={styles.ringUnit}>/ 100</Typography>
              </DonutRing>
              <View style={styles.info}>
                <Typography style={[styles.label, { color }]}>{result.label}</Typography>
                <Typography style={styles.advice}>{result.advice}</Typography>
              </View>
            </View>
            <View style={styles.chipRow}>
              <StatChip
                color={partColor(result.parts.sleep)}
                label={todayEntry ? `Sleep ${todayEntry.hours}h` : 'Sleep —'}
              />
              <StatChip color={partColor(result.parts.load)} label={`Load ${result.loadRatio.toFixed(1)}`} />
              <StatChip color={partColor(result.parts.strain)} label={`Strain ${strainWord}`} />
              {result.parts.recovery !== null && (
                <StatChip color={partColor(result.parts.recovery)} label={`Recovery ${Math.round(result.parts.recovery)}`} />
              )}
            </View>
          </>
        )}
      </WidgetCard>

      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Log sleep"
        caption="How long did you sleep last night?"
      >
        <View style={styles.stepperRow}>
          <PressableScale
            onPress={() => step(-0.5)}
            hitSlop={theme.hitSlop}
            accessibilityRole="button"
            accessibilityLabel="Less sleep"
            style={styles.stepBtn}
          >
            <Minus size={18} color={theme.colors.text} />
          </PressableScale>
          <View style={styles.hoursWrap}>
            <Typography style={styles.hoursNum}>{hours}</Typography>
            <Typography style={styles.hoursUnit}>hours</Typography>
          </View>
          <PressableScale
            onPress={() => step(0.5)}
            hitSlop={theme.hitSlop}
            accessibilityRole="button"
            accessibilityLabel="More sleep"
            style={styles.stepBtn}
          >
            <Plus size={18} color={theme.colors.text} />
          </PressableScale>
        </View>

        <View style={styles.qualityRow}>
          {QUALITY_OPTIONS.map((opt) => {
            const active = quality === opt.value;
            return (
              <PressableScale
                key={opt.value}
                onPress={() => setQuality(active ? undefined : opt.value)}
                style={[
                  styles.qualityChip,
                  active && { backgroundColor: withAlpha(fam.accent, 'tint'), borderColor: fam.accent },
                ]}
              >
                <Typography style={[styles.qualityTxt, active && { color: fam.accent }]}>
                  {opt.label}
                </Typography>
              </PressableScale>
            );
          })}
        </View>

        <PressableScale onPress={importFromHealth} disabled={importing} style={styles.importBtn}>
          <HeartPulse size={14} color={theme.colors.textSecondary} />
          <Typography style={styles.importTxt}>
            {importing ? 'Importing…' : 'Import from Health'}
          </Typography>
        </PressableScale>

        <PressableScale onPress={save} style={[styles.saveBtn, { backgroundColor: fam.accent }]}>
          <Typography style={styles.saveTxt}>Save</Typography>
        </PressableScale>
      </Sheet>
    </>
  );
});

const styles = StyleSheet.create({
  logChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.borderRadius.full,
  },
  logChipTxt: {
    fontSize: 11,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  ringNum: {
    ...theme.typography.title,
    color: theme.colors.text,
  },
  ringUnit: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  label: {
    fontSize: 17,
    fontWeight: '900',
  },
  advice: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hoursWrap: {
    alignItems: 'center',
  },
  hoursNum: {
    ...theme.typography.numeric,
    color: theme.colors.text,
  },
  hoursUnit: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
  },
  qualityRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  qualityChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  qualityTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 10,
  },
  importTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  saveBtn: {
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: theme.borderRadius.md,
  },
  saveTxt: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.onAccent,
  },
});
