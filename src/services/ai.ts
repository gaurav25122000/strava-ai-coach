import axios from 'axios';
import { Activity, BestEffort, Goal, Phase, PlanWeek, UserProfile } from '../store/useStore';
import { activityDayKey, formatPace, localDateStr, mondayIndex } from '../utils/dates';
import { prescriptionForDate, prescriptionSummary } from './planSchedule';

// ── Providers ────────────────────────────────────────────────────────────────
// Pinned model ids — floating aliases (gemini-flash-latest) silently changed
// behaviour under us. BYO-key app: the user supplies the key in Settings.

const MODELS = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o',
  anthropic: 'claude-opus-4-8',
} as const;

const PLAN_TIMEOUT_MS = 120_000;
const CHAT_TIMEOUT_MS = 60_000;

type Provider = 'openai' | 'anthropic' | 'gemini';

const WORKOUT_KINDS = ['EASY', 'TEMPO', 'INTERVALS', 'LONG', 'RECOVERY', 'CROSS', 'STRENGTH', 'REST'];
const REST_KINDS = ['COMPLETE', 'ACTIVE_WALK', 'MOBILITY', 'CROSS_LOW'];
const INTENSITIES = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];

// ── Plan schema (shared by all three providers) ──────────────────────────────
// v2: each phase carries `weeks` — one 7-day schedule PER CALENDAR WEEK, so
// the model can express real week-over-week progression instead of one
// template repeated for a month (which contradicted its own 10% rule).

const DAY_SCHEMA = {
  type: 'object',
  properties: {
    dayOfWeek:   { type: 'integer' },     // 0 = Monday, 6 = Sunday
    kind:        { type: 'string', enum: WORKOUT_KINDS },
    title:       { type: 'string' },      // ≤ 6 words
    description: { type: 'string' },      // 1-2 sentences max
    distanceKm:  { type: 'number' },
    durationMin: { type: 'number' },
    intensity:   { type: 'string', enum: INTENSITIES },
    rest: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: REST_KINDS },
        note: { type: 'string' },
      },
      required: ['kind', 'note'],
    },
  },
  required: ['dayOfWeek', 'kind', 'title', 'description'],
};

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    phases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name:               { type: 'string' },
          description:        { type: 'string' },
          weeklyVolumeTarget: { type: 'number' },   // km, peak week of the phase
          longRunTarget:      { type: 'number' },   // km
          keyWorkout:         { type: 'string' },
          weekStart:          { type: 'string' },   // ISO Monday the phase starts
          weekEnd:            { type: 'string' },   // ISO Sunday the phase ends
          weeks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                weekStart: { type: 'string' },      // ISO Monday of this week
                volumeKm:  { type: 'number' },      // planned km this week
                schedule:  { type: 'array', items: DAY_SCHEMA },
              },
              required: ['weekStart', 'schedule'],
            },
          },
        },
        required: ['name', 'description', 'weeklyVolumeTarget', 'longRunTarget', 'keyWorkout', 'weekStart', 'weekEnd', 'weeks'],
      },
    },
  },
  required: ['phases'],
};

// ── Prompts ──────────────────────────────────────────────────────────────────

function buildSystemPrompt(personality: string): string {
  return `You are an elite, world-class running coach with a ${personality} coaching style. You create detailed, safe, physiologically sound training plans.

Core Coaching Rules you MUST follow:
1. Progression: week-over-week volume grows at most 10-15%. Insert a recovery week (volume −20%) every 3rd or 4th week. Taper before the event (final 1-3 weeks depending on distance).
2. 80/20 Rule: roughly 80% of weekly volume easy/aerobic (Z1-Z2), 20% quality (Z3-Z5).
3. Safety First: if the timeline is too short for the goal, prioritise arriving uninjured over an arbitrary time target — and say so in the first phase description.
4. Precision: key workouts include exact warmup, intervals, recoveries and cooldown, with both pace/zone AND RPE (1-10).

Structure rules (MANDATORY):
- Every phase covers a date window (weekStart Monday → weekEnd Sunday) and contains a "weeks" array with ONE entry per calendar week in that window — consecutive Mondays, no gaps, no overlap with other phases.
- Each week: "weekStart" (that Monday, ISO YYYY-MM-DD), "volumeKm" (planned km — this is where progression must be visible week to week), and "schedule" with EXACTLY 7 entries, dayOfWeek 0..6 (0 = Monday). No gaps, no duplicates.
- Each entry: title ≤ 6 words; description 1-2 sentences, specific (distance, pace/zone, RPE) — readable in under 10 seconds.
- REST days ALWAYS include the "rest" object (kind: COMPLETE / ACTIVE_WALK / MOBILITY / CROSS_LOW + a one-sentence note on how to rest well).
- intensity uses Z1-Z5 (Z1-Z2 easy aerobic, Z3 tempo, Z4 threshold, Z5 VO2max).

Format example (fictional, shows shape only — your plan will have many weeks):
{"phases":[{"name":"Base","description":"...","weeklyVolumeTarget":32,"longRunTarget":12,"keyWorkout":"Long run 12k Z2: 2k warmup, 8k steady RPE 4, 2k cooldown","weekStart":"2026-01-05","weekEnd":"2026-01-18","weeks":[{"weekStart":"2026-01-05","volumeKm":28,"schedule":[{"dayOfWeek":0,"kind":"EASY","title":"Easy 5k","description":"5 km conversational, Z2, RPE 3.","distanceKm":5,"intensity":"Z2"},{"dayOfWeek":1,"kind":"REST","title":"Rest","description":"Full rest day.","rest":{"kind":"MOBILITY","note":"10-min hips + calves after work."}}, …5 more days…]},{"weekStart":"2026-01-12","volumeKm":31,"schedule":[…7 days…]}]}]}

Tone for descriptions: short, declarative, second-person. Say "do" or "skip", never "you should consider". Do not repeat the athlete's stats back. Output nothing outside the JSON.`;
}

// Compact per-run log line: "Mon 05-18: Run 8.2 km @ 5:42/km, HR 148, +85 m"
function runLogLines(activities: Activity[], days: number, max: number): string[] {
  const cutoff = Date.now() - days * 86400000;
  const recent = activities
    .filter((a) => new Date(a.startDate).getTime() >= cutoff)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
    .slice(0, max);
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return recent.map((a) => {
    const day = activityDayKey(a);
    const d = new Date(day);
    const bits = [`${dow[mondayIndex(d)]} ${day.slice(5)}: ${a.type} ${(a.distance / 1000).toFixed(1)} km`];
    if (a.averageSpeed > 0) bits.push(`@ ${formatPace(1000 / a.averageSpeed / 60)}/km`);
    if (a.averageHeartRate) bits.push(`HR ${Math.round(a.averageHeartRate)}`);
    if (a.totalElevationGain > 20) bits.push(`+${Math.round(a.totalElevationGain)} m`);
    return bits.join(', ');
  });
}

const RUNNISH = new Set(['Run', 'TrailRun', 'VirtualRun']);

interface TrainingSnapshot {
  avgWeeklyRunKm: number;
  runsLast28: number;
  longestRecentRunKm: number;
  avgHR: number | null;
  prLines: string[];
}

// Run-only aggregates — the old version summed rides into "weekly run volume"
// and called the fastest GPS blip a "threshold pace".
function trainingSnapshot(activities: Activity[], bestEfforts?: Record<number, BestEffort>): TrainingSnapshot {
  const now = Date.now();
  const runs = activities.filter((a) => RUNNISH.has(a.type));
  const runs28 = runs.filter((a) => (now - new Date(a.startDate).getTime()) / 86400000 <= 28);
  const runs60 = runs.filter((a) => (now - new Date(a.startDate).getTime()) / 86400000 <= 60);
  const avgWeeklyRunKm = runs28.reduce((s, a) => s + a.distance / 1000, 0) / 4;
  const longestRecentRunKm = runs60.reduce((m, a) => Math.max(m, a.distance / 1000), 0);
  const withHR = runs28.filter((a) => a.averageHeartRate);
  const avgHR = withHR.length
    ? Math.round(withHR.reduce((s, a) => s + (a.averageHeartRate || 0), 0) / withHR.length)
    : null;

  const prLines: string[] = [];
  if (bestEfforts) {
    for (const dist of [1000, 5000, 10000]) {
      const be = bestEfforts[dist];
      if (be) prLines.push(`${dist / 1000}K best: ${formatPace(be.pace)}/km (${be.date})`);
    }
  }
  return { avgWeeklyRunKm, runsLast28: runs28.length, longestRecentRunKm, avgHR, prLines };
}

export interface PlanExtras {
  bestEfforts?: Record<number, BestEffort>;
  targetFinishTime?: string;
  unit?: 'metric' | 'imperial';
}

function buildUserPrompt(
  goalTitle: string,
  targetDate: string,
  activities: Activity[],
  injuries: any[],
  userProfile: Partial<UserProfile>,
  extras: PlanExtras = {},
): string {
  const snap = trainingSnapshot(activities, extras.bestEfforts);
  const daysToGoal = Math.round((new Date(targetDate).getTime() - Date.now()) / 86400000);
  const weeks = Math.floor(daysToGoal / 7);

  const injuryContext = injuries.length > 0
    ? `INJURIES / NIGGLES: ${injuries.map((i: any) => `${i.type}${i.severity ? ` (${i.severity}${i.date ? `, since ${i.date}` : ''})` : ''}`).join('; ')}. Prioritise recovery and low-impact alternatives.`
    : 'No current injuries reported.';

  const age = userProfile.dob
    ? Math.floor((Date.now() - new Date(userProfile.dob).getTime()) / (365.25 * 86400000))
    : null;

  const profileLines = [
    age                             ? `Age: ${age} years`                                       : null,
    userProfile.weight              ? `Weight: ${userProfile.weight} kg`                        : null,
    userProfile.height              ? `Height: ${userProfile.height} cm`                        : null,
    userProfile.fitnessLevel        ? `Fitness level: ${userProfile.fitnessLevel}`              : null,
    userProfile.restingHR           ? `Resting HR: ${userProfile.restingHR} bpm`               : null,
    userProfile.maxHR               ? `Max HR: ${userProfile.maxHR} bpm`                       : null,
    userProfile.weeklyGoalKm        ? `Weekly km goal: ${userProfile.weeklyGoalKm} km`         : null,
    userProfile.trainingDaysPerWeek ? `Preferred training days/week: ${userProfile.trainingDaysPerWeek}` : null,
    userProfile.preferredTerrain    ? `Preferred terrain: ${userProfile.preferredTerrain}`      : null,
    userProfile.sleepHours          ? `Average sleep: ${userProfile.sleepHours} hrs/night`     : null,
    userProfile.nutritionNotes      ? `Nutrition notes: ${userProfile.nutritionNotes}`          : null,
    userProfile.injuries            ? `Injury history: ${userProfile.injuries}`                 : null,
  ].filter(Boolean).join('\n');

  const log = runLogLines(activities, 28, 28);
  const today = new Date();

  return `## ATHLETE PROFILE
Name: ${userProfile.name || 'Athlete'}
${profileLines || 'No additional profile data provided.'}
${injuryContext}

## TRAINING SNAPSHOT
- Runs in last 28 days: ${snap.runsLast28}
- Average weekly RUN volume (last 4 weeks): ${snap.avgWeeklyRunKm.toFixed(1)} km/week
- Longest run (last 60 days): ${snap.longestRecentRunKm.toFixed(1)} km
- Average run HR (28d): ${snap.avgHR ? `${snap.avgHR} bpm` : 'Not available'}
${snap.prLines.length ? snap.prLines.map((l) => `- ${l}`).join('\n') : '- No reliable PRs yet — anchor intensity to HR zones and RPE, not pace targets.'}

## RECENT TRAINING LOG (newest first)
${log.length ? log.join('\n') : 'No activities recorded in the last 28 days.'}

## GOAL
Target Event: "${goalTitle}"
Target Date: ${targetDate} — ${daysToGoal} days away (${weeks} weeks)
${extras.targetFinishTime ? `Target finish time: ${extras.targetFinishTime}` : 'No target finish time — completion and consistency are the goal.'}
Distances in numeric fields are km. Athlete's display preference: ${extras.unit || 'metric'}.

## INSTRUCTIONS
Today is ${localDateStr(today)} (${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][mondayIndex(today)]}). Generate a multi-phase plan covering the ${daysToGoal} days remaining.

Phase count — pick what fits the timeline. NEVER ship a single phase for a multi-month plan:
- ≤ 6 weeks: 2 phases (Build → Race-prep/Taper).
- 7-12 weeks: 3 phases (Base → Build → Peak/Taper).
- 13-24 weeks: 4 phases (Base → Build → Peak → Taper).
- > 24 weeks: 5-6 phases (Foundation → Base → Build → Peak → Race-prep → Taper).
For ${daysToGoal} days (${weeks} weeks), aim for ${
    daysToGoal <= 42 ? 2 : daysToGoal <= 84 ? 3 : daysToGoal <= 168 ? 4 : daysToGoal <= 280 ? 5 : 6
  } phases minimum.

Calendar:
- Phase 1 weekStart = the Monday of the CURRENT week. The final phase's weekEnd lands on or just after the target date.
- Every calendar week between phase 1 weekStart and the final weekEnd appears exactly once in exactly one phase's weeks array.
- Week 1's schedule is what the athlete does THIS week; respect preferred training days/week (${userProfile.trainingDaysPerWeek || 4}) — excess days are REST with a real rest prescription.
- volumeKm across consecutive weeks must show the progression rules (10-15% growth, recovery weeks, taper).
- description per phase: 3-5 sentences of physiological focus relative to THIS athlete's current fitness; name the exact weeks covered ("Weeks 1-4").
- keyWorkout per phase: the single most important session, fully specified.`;
}

// ── Normalisation + validation ───────────────────────────────────────────────

function normaliseDay(d: any): any | null {
  if (typeof d?.dayOfWeek !== 'number' || !d?.kind || !d?.title || !d?.description) return null;
  return {
    dayOfWeek: Math.max(0, Math.min(6, Math.round(d.dayOfWeek))),
    kind: WORKOUT_KINDS.includes(d.kind) ? d.kind : 'EASY',
    title: String(d.title).slice(0, 60),
    description: String(d.description).slice(0, 280),
    distanceKm:  typeof d.distanceKm  === 'number' ? d.distanceKm  : undefined,
    durationMin: typeof d.durationMin === 'number' ? d.durationMin : undefined,
    intensity:   INTENSITIES.includes(d.intensity) ? d.intensity : undefined,
    rest: d.rest
      ? { kind: REST_KINDS.includes(d.rest.kind) ? d.rest.kind : 'COMPLETE', note: String(d.rest.note || '').slice(0, 200) }
      : undefined,
  };
}

function normaliseWeek(raw: any): PlanWeek | null {
  if (!raw?.weekStart || !Array.isArray(raw?.schedule)) return null;
  const days = raw.schedule.map(normaliseDay).filter(Boolean);
  // Pad any missing weekday as a rest day so the UI always has 7 entries.
  const have = new Set(days.map((d: any) => d.dayOfWeek));
  for (let dow = 0; dow < 7; dow++) {
    if (!have.has(dow)) {
      days.push({
        dayOfWeek: dow,
        kind: 'REST',
        title: 'Rest',
        description: 'Rest day.',
        rest: { kind: 'COMPLETE', note: 'Take the day fully off.' },
      });
    }
  }
  days.sort((a: any, b: any) => a.dayOfWeek - b.dayOfWeek);
  return {
    weekStart: String(raw.weekStart).slice(0, 10),
    volumeKm: typeof raw.volumeKm === 'number' ? raw.volumeKm : undefined,
    schedule: days.slice(0, 7),
  };
}

// Normalises an LLM phase payload into the in-store Phase shape. Tolerates
// the older shape (no weeks) so historic goals still load; mirrors weeks[0]
// into `schedule` for legacy consumers.
function normalisePhase(raw: any): Phase {
  const weeks = Array.isArray(raw?.weeks)
    ? (raw.weeks.map(normaliseWeek).filter(Boolean) as PlanWeek[]).sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    : undefined;
  const legacySchedule = Array.isArray(raw?.schedule)
    ? raw.schedule.map(normaliseDay).filter(Boolean)
    : undefined;
  return {
    name: raw?.name || '',
    description: raw?.description || '',
    weeklyVolumeTarget: Number(raw?.weeklyVolumeTarget) || 0,
    longRunTarget: Number(raw?.longRunTarget) || 0,
    keyWorkout: raw?.keyWorkout || '',
    weekStart: raw?.weekStart || weeks?.[0]?.weekStart || undefined,
    weekEnd: raw?.weekEnd || undefined,
    schedule: weeks?.[0]?.schedule ?? legacySchedule,
    weeks,
  };
}

/** Structural validation. Returns human-readable problems (empty = valid). */
export function validatePlan(phases: Phase[], targetDate?: string): string[] {
  const errors: string[] = [];
  if (!phases.length) return ['Plan contains no phases.'];

  for (const [i, p] of phases.entries()) {
    const tag = `Phase ${i + 1} ("${p.name || 'unnamed'}")`;
    if (!p.name) errors.push(`${tag}: missing name.`);
    if (!p.weekStart || !p.weekEnd) errors.push(`${tag}: missing weekStart/weekEnd dates.`);
    if (!p.weeks?.length) {
      errors.push(`${tag}: missing weeks array (one entry per calendar week).`);
      continue;
    }
    let prevMonday: string | null = null;
    for (const w of p.weeks) {
      const d = new Date(w.weekStart);
      if (isNaN(d.getTime()) || mondayIndex(d) !== 0) {
        errors.push(`${tag}: week "${w.weekStart}" does not start on a Monday.`);
      }
      if (prevMonday) {
        const gap = (d.getTime() - new Date(prevMonday).getTime()) / 86400000;
        if (gap !== 7) errors.push(`${tag}: weeks ${prevMonday} → ${w.weekStart} are not consecutive Mondays.`);
      }
      prevMonday = w.weekStart;
      if (w.schedule.length !== 7) errors.push(`${tag}: week ${w.weekStart} has ${w.schedule.length} days, needs exactly 7.`);
      const dows = new Set(w.schedule.map((s) => s.dayOfWeek));
      if (dows.size !== w.schedule.length) errors.push(`${tag}: week ${w.weekStart} has duplicate dayOfWeek entries.`);
      for (const s of w.schedule) {
        if (s.kind === 'REST' && !s.rest) errors.push(`${tag}: week ${w.weekStart} dayOfWeek ${s.dayOfWeek} is REST without a rest prescription.`);
      }
    }
  }

  // Phases ordered + plan reaches the event.
  const sorted = [...phases].every((p, i, arr) => i === 0 || String(arr[i - 1].weekStart) <= String(p.weekStart));
  if (!sorted) errors.push('Phases are not in chronological order.');
  if (targetDate) {
    const last = phases[phases.length - 1];
    if (last.weekEnd) {
      const slack = (new Date(targetDate).getTime() - new Date(last.weekEnd).getTime()) / 86400000;
      if (slack > 10) errors.push(`Plan ends ${last.weekEnd}, ${Math.round(slack)} days before the ${targetDate} event — cover the full timeline.`);
    }
  }
  return errors.slice(0, 12);
}

function parsePhases(result: any): Partial<Goal> {
  const phases = Array.isArray(result?.phases) ? result.phases.map(normalisePhase) : [];
  const firstPhase = phases[0] || ({} as Phase);
  return {
    phase: firstPhase.name ? `${firstPhase.name}\n${firstPhase.description}` : result?.phase || '',
    weeklyVolume: { current: 0, target: firstPhase.weeklyVolumeTarget || 0 },
    longRun: { current: 0, target: firstPhase.longRunTarget || 0 },
    keyWorkout: firstPhase.keyWorkout || '',
    phases,
  };
}

// ── Provider transport ───────────────────────────────────────────────────────

type Turn = { role: 'user' | 'model'; text: string };

function providerError(provider: Provider, e: any): Error {
  const detail =
    e?.response?.data?.error?.message ||
    e?.response?.data?.error?.code ||
    (e?.code === 'ECONNABORTED' ? 'request timed out' : null) ||
    e?.message ||
    'unknown error';
  return new Error(`${provider} request failed: ${detail}`);
}

/**
 * One structured-plan request. Every provider is held to the SAME schema:
 * Gemini via responseSchema, OpenAI via json_schema response_format,
 * Anthropic via a forced tool call (tool input IS the parsed plan — no
 * fence-stripping or JSON.parse of prose).
 */
async function requestPlan(provider: Provider, apiKey: string, system: string, turns: Turn[]): Promise<any> {
  try {
    if (provider === 'gemini') {
      const resp = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent`,
        {
          system_instruction: { parts: [{ text: system }] },
          contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: PLAN_SCHEMA,
            maxOutputTokens: 32768,
          },
        },
        { headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey }, timeout: PLAN_TIMEOUT_MS },
      );
      return JSON.parse(resp.data.candidates[0].content.parts[0].text);
    }

    if (provider === 'openai') {
      const resp = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: MODELS.openai,
          max_completion_tokens: 16384,
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'training_plan', schema: PLAN_SCHEMA },
          },
          messages: [
            { role: 'system', content: system },
            ...turns.map((t) => ({ role: t.role === 'model' ? 'assistant' : 'user', content: t.text })),
          ],
        },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: PLAN_TIMEOUT_MS },
      );
      return JSON.parse(resp.data.choices[0].message.content);
    }

    // Anthropic — forced tool use; the validated tool input is the plan.
    const resp = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: MODELS.anthropic,
        max_tokens: 16000,
        system,
        tools: [{
          name: 'submit_training_plan',
          description: 'Submit the completed multi-phase training plan.',
          input_schema: PLAN_SCHEMA,
        }],
        tool_choice: { type: 'tool', name: 'submit_training_plan' },
        messages: turns.map((t) => ({ role: t.role === 'model' ? 'assistant' : 'user', content: t.text })),
      },
      { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: PLAN_TIMEOUT_MS },
    );
    if (resp.data.stop_reason === 'max_tokens') {
      throw new Error('anthropic: plan truncated at max_tokens — try a shorter timeline or retry');
    }
    const toolUse = (resp.data.content || []).find((b: any) => b.type === 'tool_use');
    if (!toolUse?.input) throw new Error('anthropic: no structured plan returned');
    return toolUse.input;
  } catch (e: any) {
    if (e?.message?.startsWith(provider)) throw e;
    throw providerError(provider, e);
  }
}

// ── Plan summaries (compact context instead of full-JSON history bloat) ─────

function planSummaryText(phases: Phase[] | undefined): string {
  if (!phases?.length) return '(no phases)';
  return phases.map((p, i) => {
    const weekVols = p.weeks?.map((w) => w.volumeKm ?? '?').join('/');
    const week1 = (p.weeks?.[0]?.schedule ?? p.schedule ?? [])
      .map((d) => `${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d.dayOfWeek]} ${d.kind}${d.distanceKm ? ` ${d.distanceKm}k` : ''}`)
      .join(', ');
    return [
      `Phase ${i + 1} "${p.name}" ${p.weekStart || '?'}→${p.weekEnd || '?'}: peak ${p.weeklyVolumeTarget} km/wk, long run ${p.longRunTarget} km.`,
      weekVols ? `  Weekly volumes: ${weekVols} km.` : null,
      `  Key workout: ${p.keyWorkout}`,
      week1 ? `  First week: ${week1}` : null,
    ].filter(Boolean).join('\n');
  }).join('\n');
}

function adherenceSummary(goal: Goal): string {
  const checkIns = goal.checkIns || [];
  if (!checkIns.length) return 'No check-ins logged yet.';
  const cutoff = localDateStr(new Date(Date.now() - 21 * 86400000));
  const recent = checkIns.filter((c) => c.date >= cutoff);
  const done = recent.filter((c) => c.completed).length;
  const skipped = recent.filter((c) => !c.completed).length;
  const partial = recent.filter((c) => c.matchVerdict === 'partial').length;
  const rpes = recent.filter((c) => c.perceivedEffort).map((c) => c.perceivedEffort as number);
  const avgRpe = rpes.length ? (rpes.reduce((s, r) => s + r, 0) / rpes.length).toFixed(1) : null;
  return `Last 21 days: ${done} sessions completed, ${skipped} skipped/missed${partial ? `, ${partial} partial` : ''}${avgRpe ? `, avg RPE ${avgRpe}` : ''}.`;
}

// Old goals persisted full plan JSON as model turns — cap and replace those
// so edit requests stop growing linearly in tokens.
function compactHistory(history: Turn[]): Turn[] {
  return history
    .slice(-8)
    .map((h) => (h.role === 'model' && h.text.length > 1500 ? { ...h, text: '[previous revision applied]' } : h));
}

export type ChatMessage = { role: 'user' | 'assistant'; text: string };

export interface ChatExtras {
  bestEfforts?: Record<number, BestEffort>;
  unit?: 'metric' | 'imperial';
}

export const AIService = {
  chatWithCoach: async (
    messages: ChatMessage[],
    provider: Provider,
    apiKey: string,
    personality: string,
    userProfile: Partial<UserProfile>,
    activities: Activity[],
    goal?: Goal,
    extras: ChatExtras = {},
  ): Promise<string> => {
    const snap = trainingSnapshot(activities, extras.bestEfforts);
    const age = userProfile.dob ? Math.floor((Date.now() - new Date(userProfile.dob).getTime()) / (365.25 * 86400000)) : null;
    const today = new Date();
    const log = runLogLines(activities, 14, 14);

    let goalContext = '';
    if (goal) {
      const daysRemaining = Math.max(0, Math.round((new Date(goal.targetDate).getTime() - Date.now()) / 86400000));
      const todayP = prescriptionForDate(goal, today);
      const tomorrowP = prescriptionForDate(goal, new Date(today.getTime() + 86400000));
      goalContext = `
ACTIVE TRAINING GOAL:
- "${goal.title}" — target date ${goal.targetDate} (${daysRemaining} days away)${goal.targetFinishTime ? `, target time ${goal.targetFinishTime}` : ''}
${goal.phases?.length
  ? goal.phases.map((p, i) => `- Phase ${i + 1}: ${p.name} (${p.weekStart || '?'}→${p.weekEnd || '?'}) — peak ${p.weeklyVolumeTarget} km/wk, long run ${p.longRunTarget} km`).join('\n')
  : `- Current phase: ${goal.phase}`}
- Today's prescribed workout: ${todayP ? prescriptionSummary(todayP) : 'nothing scheduled today'}
- Tomorrow: ${tomorrowP ? prescriptionSummary(tomorrowP) : 'nothing scheduled'}
- Adherence: ${adherenceSummary(goal)}`;
    }

    const system = `You are an elite running coach with a ${personality} style. Today is ${localDateStr(today)} (${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][mondayIndex(today)]}). The athlete context below is everything you can see — if something isn't listed, say you don't have it rather than inventing it.

ATHLETE CONTEXT:
${[
  age ? `Age: ${age}` : null,
  userProfile.fitnessLevel ? `Fitness: ${userProfile.fitnessLevel}` : null,
  userProfile.weight ? `Weight: ${userProfile.weight} kg` : null,
  userProfile.restingHR ? `Resting HR: ${userProfile.restingHR} bpm` : null,
  userProfile.maxHR ? `Max HR: ${userProfile.maxHR} bpm` : null,
  userProfile.trainingDaysPerWeek ? `Training days/week: ${userProfile.trainingDaysPerWeek}` : null,
  userProfile.injuries ? `Injury history: ${userProfile.injuries}` : null,
].filter(Boolean).join('\n')}
Avg weekly RUN km (last 4 weeks): ${snap.avgWeeklyRunKm.toFixed(1)} km
Longest run (60d): ${snap.longestRecentRunKm.toFixed(1)} km
${snap.prLines.length ? snap.prLines.join('\n') : 'No PRs recorded yet.'}

RECENT LOG (14 days, newest first):
${log.length ? log.join('\n') : 'No recent activities.'}
${goalContext}

Units: athlete prefers ${extras.unit || 'metric'}. Answer concisely in markdown. Be direct, specific, and data-driven; reference the actual log when relevant.`;

    try {
      if (provider === 'gemini') {
        const contents = messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.text }],
        }));
        const resp = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent`,
          { system_instruction: { parts: [{ text: system }] }, contents },
          { headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey }, timeout: CHAT_TIMEOUT_MS },
        );
        return resp.data.candidates[0].content.parts[0].text;
      }
      if (provider === 'openai') {
        const resp = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: MODELS.openai,
            messages: [
              { role: 'system', content: system },
              ...messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text })),
            ],
          },
          { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: CHAT_TIMEOUT_MS },
        );
        return resp.data.choices[0].message.content;
      }
      const resp = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: MODELS.anthropic,
          max_tokens: 2048,
          system,
          messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text })),
        },
        { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: CHAT_TIMEOUT_MS },
      );
      return resp.data.content[0].text;
    } catch (e: any) {
      throw providerError(provider, e);
    }
  },

  // Continue an existing AI plan as a stateful multi-turn edit conversation.
  continueTrainingPlan: async (
    existingGoal: Goal,
    userMessage: string,
    provider: Provider,
    apiKey: string,
    personality: string,
  ): Promise<{ plan: Partial<Goal>; updatedHistory: Turn[] }> => {
    const systemPrompt = buildSystemPrompt(personality);

    // Compact context: plan summary + adherence, never the full plan JSON.
    const seed: Turn = {
      role: 'user',
      text: `CURRENT PLAN (summary):\n${planSummaryText(existingGoal.phases)}\n\nADHERENCE:\n${adherenceSummary(existingGoal)}\n\nToday is ${localDateStr(new Date())}. Target date: ${existingGoal.targetDate}. I will send edit requests; each time, return the FULL revised plan (all phases, all weeks) through the structured output.`,
    };
    const history = compactHistory(existingGoal.chatHistory || []);
    const turns: Turn[] = [seed, ...history, { role: 'user', text: userMessage }];

    let raw = await requestPlan(provider, apiKey, systemPrompt, turns);
    let parsed = parsePhases(raw);
    let errors = validatePlan(parsed.phases || [], existingGoal.targetDate);
    if (errors.length) {
      const retryTurns: Turn[] = [
        ...turns,
        { role: 'model', text: JSON.stringify(raw).slice(0, 6000) },
        { role: 'user', text: `That plan failed validation:\n- ${errors.join('\n- ')}\nFix every issue and resubmit the FULL corrected plan.` },
      ];
      raw = await requestPlan(provider, apiKey, systemPrompt, retryTurns);
      parsed = parsePhases(raw);
      errors = validatePlan(parsed.phases || [], existingGoal.targetDate);
      if (errors.length) throw new Error(`Plan failed validation: ${errors[0]}`);
    }

    const updatedHistory: Turn[] = [
      ...history,
      { role: 'user', text: userMessage },
      { role: 'model', text: `[Plan revised]\n${planSummaryText(parsed.phases)}` },
    ];
    return { plan: parsed, updatedHistory };
  },

  generateTrainingPlan: async (
    goalTitle: string,
    targetDate: string,
    activities: Activity[],
    provider: Provider,
    apiKey: string,
    personality: string = 'Encouraging Supporter',
    injuries: any[] = [],
    userProfile: Partial<UserProfile> = {},
    extras: PlanExtras = {},
  ): Promise<Partial<Goal>> => {
    if (!apiKey) throw new Error('API Key is missing');

    const systemPrompt = buildSystemPrompt(personality);
    const userPrompt = buildUserPrompt(goalTitle, targetDate, activities, injuries, userProfile, extras);

    let raw = await requestPlan(provider, apiKey, systemPrompt, [{ role: 'user', text: userPrompt }]);
    let parsed = parsePhases(raw);
    let errors = validatePlan(parsed.phases || [], targetDate);
    if (errors.length) {
      // One self-repair round: feed the validator's complaints back.
      const retryTurns: Turn[] = [
        { role: 'user', text: userPrompt },
        { role: 'model', text: JSON.stringify(raw).slice(0, 6000) },
        { role: 'user', text: `That plan failed validation:\n- ${errors.join('\n- ')}\nFix every issue and resubmit the FULL corrected plan.` },
      ];
      raw = await requestPlan(provider, apiKey, systemPrompt, retryTurns);
      parsed = parsePhases(raw);
      errors = validatePlan(parsed.phases || [], targetDate);
      if (errors.length) throw new Error(`Plan failed validation: ${errors[0]}`);
    }
    return parsed;
  },

  getMotivationalInsight: (
    activities: Activity[],
    userStats: { currentStreak: number; totalKm: number; bestPace: string }
  ): { text: string; label: string; emoji: string } => {
    const now = Date.now();
    const runs = activities.filter(a => a.type === 'Run' && a.averageSpeed > 0);
    const last7 = runs.filter(a => (now - new Date(a.startDate).getTime()) / 86400000 <= 7);
    const prev7 = runs.filter(a => {
      const d = (now - new Date(a.startDate).getTime()) / 86400000;
      return d > 7 && d <= 14;
    });

    const avgPace = (arr: typeof runs) =>
      arr.length ? arr.reduce((s, a) => s + 1000 / a.averageSpeed / 60, 0) / arr.length : 0;

    const thisWeekKm = last7.reduce((s, a) => s + a.distance / 1000, 0);
    const lastWeekKm = prev7.reduce((s, a) => s + a.distance / 1000, 0);
    const thisPace = avgPace(last7);
    const prevPace = avgPace(prev7);

    const daysSinceRun = runs.length
      ? (now - new Date(runs.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0].startDate).getTime()) / 86400000
      : 99;

    const avgHR = last7.filter(a => a.averageHeartRate).length
      ? last7.filter(a => a.averageHeartRate).reduce((s, a) => s + (a.averageHeartRate || 0), 0) / last7.filter(a => a.averageHeartRate).length
      : 0;

    const longestRun = Math.max(...runs.slice(0, 10).map(a => a.distance / 1000), 0);

    // Pick the most relevant insight
    if (daysSinceRun > 4) {
      return { emoji: '😴', label: 'Rest Alert', text: `${Math.round(daysSinceRun)} days since your last run. Your body is rested — time to lace up.` };
    }
    if (userStats.currentStreak >= 7) {
      return { emoji: '🔥', label: 'Streak', text: `${userStats.currentStreak}-day active streak! Consistency is your superpower right now.` };
    }
    if (thisPace > 0 && prevPace > 0 && thisPace < prevPace - 0.1) {
      const diff = ((prevPace - thisPace) * 60).toFixed(0);
      return { emoji: '⚡', label: 'Pace Improving', text: `Your pace is ${diff}s/km faster than last week. Form and fitness are clicking.` };
    }
    if (thisWeekKm > 0 && lastWeekKm > 0 && thisWeekKm > lastWeekKm * 1.1) {
      return { emoji: '📈', label: 'Volume Up', text: `${thisWeekKm.toFixed(1)} km this week vs ${lastWeekKm.toFixed(1)} km last week. Volume is trending up.` };
    }
    if (thisWeekKm > 0 && lastWeekKm > 0 && thisWeekKm < lastWeekKm * 0.8) {
      return { emoji: '🔻', label: 'Volume Dip', text: `Volume is down this week. A planned down-week is fine — unplanned fatigue needs attention.` };
    }
    if (avgHR > 0 && avgHR > 165) {
      return { emoji: '❤️', label: 'High HR', text: `Average HR this week is ${Math.round(avgHR)} bpm. Consider adding an easy aerobic day to recover.` };
    }
    if (longestRun >= 20) {
      return { emoji: '🏃', label: 'Long Run', text: `${longestRun.toFixed(1)} km long run in your recent log. Your endurance base is building nicely.` };
    }
    if (thisWeekKm > 0) {
      return { emoji: '✅', label: 'On Track', text: `${thisWeekKm.toFixed(1)} km logged this week. Keep the momentum — small actions compound.` };
    }
    return { emoji: '💡', label: 'Tip', text: 'Easy days make hard days possible. 80% of your volume should feel comfortable.' };
  },
};
