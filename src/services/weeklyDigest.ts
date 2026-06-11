import { AIService } from './ai';
import { secureSettingsStorage, useStore } from '../store/useStore';
import { activityDayKey, localDateStr, mondayOf, weekKey } from '../utils/dates';
import { formatPace } from '../utils/dates';

// One generation in flight at a time; weekKey guard makes reruns no-ops.
let inFlight = false;

function sumKm(acts: { distance: number }[]): number {
  return Math.round(acts.reduce((s, a) => s + a.distance / 1000, 0) * 10) / 10;
}

/**
 * Generate the AI weekly digest for the last COMPLETED Mon–Sun week, once
 * per week, fire-and-forget. Cheap to call from dashboard upkeep: bails
 * unless a new week rolled over, there was training to recap, and a key is
 * configured. Failures only warn — the widget keeps last week's card.
 */
export async function maybeGenerateWeeklyDigest(): Promise<void> {
  if (inFlight) return;
  const { activities, weeklyDigest, settings, foodLog, calorieGoal } = useStore.getState();
  if (!activities.length) return;

  const thisMonday = mondayOf(new Date());
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(lastMonday.getDate() - 7);
  const key = weekKey(lastMonday);
  if (weeklyDigest?.weekKey === key) return;

  const start = localDateStr(lastMonday);
  const endDate = new Date(thisMonday);
  endDate.setDate(endDate.getDate() - 1);
  const end = localDateStr(endDate);

  const inWeek = (d: string) => d >= start && d <= end;
  const weekActs = activities.filter((a) => inWeek(activityDayKey(a)));
  if (!weekActs.length) return;

  const apiKey = settings.llmApiKey || (await secureSettingsStorage.getSecret('llmApiKey')) || '';
  if (!apiKey) return;

  // Previous week, for trend framing.
  const prevMonday = new Date(lastMonday);
  prevMonday.setDate(prevMonday.getDate() - 7);
  const prevStart = localDateStr(prevMonday);
  const prevActs = activities.filter((a) => {
    const d = activityDayKey(a);
    return d >= prevStart && d < start;
  });

  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const lines = weekActs
    .slice()
    .sort((a, b) => activityDayKey(a).localeCompare(activityDayKey(b)))
    .map((a) => {
      const d = new Date(`${activityDayKey(a)}T00:00:00`);
      const idx = (d.getDay() + 6) % 7;
      const bits = [`${dow[idx]}: ${a.type} ${(a.distance / 1000).toFixed(1)} km`];
      if (a.averageSpeed > 0 && a.type === 'Run') bits.push(`@ ${formatPace(1000 / a.averageSpeed / 60)}/km`);
      if (a.averageHeartRate) bits.push(`HR ${Math.round(a.averageHeartRate)}`);
      return bits.join(', ');
    });

  const activeDays = new Set(weekActs.map((a) => activityDayKey(a))).size;

  // Week's nutrition, if the athlete logs food.
  const weekFood = foodLog.filter((e) => inWeek(e.date));
  let nutritionBlock = '';
  if (weekFood.length) {
    const days = new Set(weekFood.map((e) => e.date));
    const eaten = weekFood.reduce((s, e) => s + e.calories, 0);
    const burned = weekActs.reduce((s, a) => s + (a.calories ?? 0), 0);
    nutritionBlock = `\nNUTRITION (calorie tracker): ${days.size}/7 days logged, ${Math.round(eaten / days.size)} kcal/day average eaten (goal ${calorieGoal}), ${Math.round(burned)} kcal total active burn over the week.`;
  }

  const context = `Write the weekly digest for the week ${start} → ${end}.

TRAINING LOG:
${lines.join('\n')}

TOTALS: ${sumKm(weekActs)} km across ${weekActs.length} activities on ${activeDays} days.
PREVIOUS WEEK: ${prevActs.length ? `${sumKm(prevActs)} km / ${prevActs.length} activities` : 'nothing logged'}.${nutritionBlock}`;

  inFlight = true;
  try {
    const digest = await AIService.generateWeeklyDigest(context, settings.llmProvider, apiKey);
    useStore.getState().setWeeklyDigest({
      weekKey: key,
      generatedAt: new Date().toISOString(),
      ...digest,
    });
  } catch (e) {
    console.warn('[WeeklyDigest] generation failed:', e);
  } finally {
    inFlight = false;
  }
}
