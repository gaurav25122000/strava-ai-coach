# Strava AI Coach — Full Revamp Plan

## Goals (from user)
1. **UX/UI overhaul** — functionality unchanged, push important & engaging info upfront, user keeps widget control.
2. **Charts must skip dates with no recorded data** (no empty visual gaps).
3. **Feel like "$1B code"** — premium polish across motion, density, hierarchy, micro-interactions.
4. **AI goal flow revamp** — per-day workouts, prescribed rest (when + how), detailed but not overwhelming.
5. **AI goal progress tracking** — both manual check-in AND automated Strava sync match-up.

## Current State (one-paragraph summary)
React Native + Expo 54, dark mode only, Zustand store, `react-native-gifted-charts`, lucide icons, reanimated. 6 tabs (Overview/Activities/Insights/Goals/Chat/Profile). `OverviewScreen` is a 2874-line 27-widget canvas the user can toggle/reorder via `settings.widgetLayout`. `InsightsScreen` has 10 graph tabs; 4 of them (Volume/Time/Steps/Calories) bucketed weekly and previously rendered zero-height bars for inactive weeks. Goals split into AI plans (LLM-generated phases via `services/ai.ts`) and Simple goals (frequency/distance/HR). AI goals carry only one `keyWorkout` string per phase and have **no progress computation** — `weeklyVolume.current`/`longRun.current` are hardcoded to 0 on creation. Strava sync stores activities; nothing matches activities back to goals.

---

## Plan

### Phase 1 — Foundation fixes (small, surgical, ship now)
- **[DONE]** Chart empty-week fix in `src/screens/InsightsScreen.tsx::weeklyBuckets` — filter weeks with no activity before label assignment, so Volume/Time/Steps/Calories charts only render bars for active weeks.
- **[TODO]** Add an "Inactive weeks: N" subtitle under affected charts so the dropped weeks are still legible (transparency without empty space).
- **[TODO]** Add `lastSyncedAt` to store + small "Synced 2 min ago" pill at the top of Overview (premium-feel cue).

### Phase 2 — AI Goal v2 (schema + prompt + parsing)
**Files:** `src/services/ai.ts`, `src/store/useStore.ts`

Extend `Phase` and `Goal`:
```ts
type WorkoutKind = 'EASY' | 'TEMPO' | 'INTERVALS' | 'LONG' | 'RECOVERY' | 'CROSS' | 'STRENGTH' | 'REST';
type RestKind = 'COMPLETE' | 'ACTIVE_WALK' | 'MOBILITY' | 'CROSS_LOW';

interface DailyPrescription {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // Mon=0
  kind: WorkoutKind;
  title: string;             // "Tempo 5k @ threshold"
  distanceKm?: number;
  durationMin?: number;
  intensity?: 'Z1'|'Z2'|'Z3'|'Z4'|'Z5';
  description: string;       // 1–2 sentences, plain English
  rest?: { kind: RestKind; note: string };
}

interface Phase {
  // existing fields kept for back-compat
  name: string;
  description: string;
  weeklyVolumeTarget: number;
  longRunTarget: number;
  keyWorkout: string;
  // NEW
  weekStart: string;         // ISO date
  weekEnd: string;           // ISO date
  schedule: DailyPrescription[]; // exactly 7 entries
}
```

Update `PLAN_SCHEMA` JSON schema + `buildSystemPrompt()` to instruct the model: per-day prescriptions, explicit rest kind, intensity zone, max 2 sentences per day, hard cap on words per phase to prevent overwhelm. Update `parsePhases()` to read the new fields and fall back gracefully if model returns old shape.

### Phase 3 — AI Goal Progress
**Files:** `src/store/useStore.ts`, `src/services/goalProgress.ts` (new), `src/services/backgroundSync.ts`, `src/screens/GoalsScreen.tsx`, `src/services/notifications.ts`

Add to `Goal`:
```ts
checkIns: Array<{
  date: string;           // ISO date
  dayOfWeek: 0..6;
  source: 'MANUAL' | 'STRAVA';
  workoutKind: WorkoutKind;
  completed: boolean;
  activityId?: string;    // if STRAVA
  notes?: string;         // if MANUAL
  perceivedEffort?: 1..10;// if MANUAL
}>;
weeklyVolume.current  // recomputed every sync
longRun.current       // recomputed every sync
```

New `src/services/goalProgress.ts`:
- `matchActivityToPrescription(activity, schedule)` — match by date within phase window + workoutKind heuristic (LONG = longest run of week; INTERVALS = high HR + short distance; etc.).
- `computeProgress(goal, activities)` — populates `checkIns` from Strava, computes weeklyVolume/longRun, sets `progress%` from days-completed vs days-prescribed up to today.

Wire `computeProgress` into:
- `services/backgroundSync.ts` after `syncActivities()` — re-derives all goals.
- `GoalsScreen.tsx` on focus.
- `notifyWorkoutDue(goal, day, time)` in `notifications.ts` (morning-of reminder).

UI in `GoalsScreen.tsx`:
- AI goal card gains a 7-day strip (Mon–Sun chips, color by `WorkoutKind`, ✓ when checkIn exists).
- Tap day → bottom-sheet with the prescription + "Mark Complete" + notes input + RPE slider.
- "Sync from Strava" CTA at top of the card → triggers `computeProgress` and shows what was auto-matched.

### Phase 4 — UI/UX overhaul ("$1B feel")
This is the largest chunk and the only one where direction is taste-driven.

**Cross-cutting:**
- New theme variant `theme/v2.ts` with two surfaces (base + elevated), one accent ramp, semantic color tokens (success/warning/danger/info), motion tokens already exist (keep).
- **Semantic typography layer** — `<Stat>`, `<Eyebrow>`, `<MetricLabel>` components on top of `Typography` so screens stop overriding `fontSize` inline (392 instances today).
- **Glass card** — single `<Card variant="elevated">` style across the app; remove ad-hoc inline gradients.
- **Skeleton loaders** — every conditional widget gets a 1-line skeleton instead of pop-in.
- **Haptics** — every primary CTA + tab change uses `Haptics.selectionAsync()` (Strava-grade feel).
- **Reanimated entrance** — replace ad-hoc `FadeInDown.delay(i*60)` with a `<Stagger>` wrapper so cascade timing survives widget reorder.

**Overview — "front page":**
Above-the-fold (visible without scroll) becomes a curated **3-block hero**:
1. **Today block** — date, streak flame, today's prescribed workout (if AI goal exists) + "Mark Done" / "Skip" + tiny weather/temp pill (later).
2. **This Week ring** — km vs goal, days active, suffer score; ring fills as week progresses.
3. **Coach insight** — single one-line message from `AIService.getMotivationalInsight`, with a small "why" expand.

Below the fold: existing 27 widgets, BUT:
- New widget catalog modal — search, group by category (Activity / Health / Progress / Records), drag-to-reorder (gesture handler), show preview on long-press.
- Default layout reordered for new users: hero blocks → ActivityMap → WeeklyGoalTracker → RecoveryAdvisor → IntensityDistribution → PaceTrend → PersonalBests → RecentActivities → rest.

**Insights:**
- Range pill row gets a sliding active-state indicator.
- Each chart card gets a top-right "•••" menu — Toggle, Compare, Export.
- Empty state per chart with a CTA ("Connect Strava" or "Log activity") instead of just an icon.

**Goals:**
- Two big tiles at top — "AI Plan" and "Simple Goal" — both with empty state CTAs that open the new creation flow.
- AI goal hero replaces the current grey card: gradient blade with title, phase name, days-left ring, "Today" prescription line.
- The 7-day strip from Phase 3 lives here.
- Chat opens in a full-screen sheet instead of modal-over-modal.

**Profile:** keep structure, tighten spacing, replace pill bag with one row of stat tiles + dividers.

**Bottom nav:**
- Reduce to 5 tabs by merging **Chat** into Goals as a chat icon on the AI card (chat is per-goal anyway).
- Pill-style active indicator, no icon color swap.

### Phase 5 — Quality
- `react-native-reanimated` shared transitions for activity card → ActivityDetail.
- Replace 392 inline-style violations with theme tokens (one PR per screen).
- Add a `__tests__/` jest setup for `services/goalProgress.ts` (the only piece with non-trivial logic).

---

## Verification
- **Phase 1:** open Insights tab on a sparse range — confirm no zero-bar gaps. Manually verify on a range with 12 weeks / 4 active.
- **Phase 2:** generate a new AI goal, inspect store — `phase.schedule` has 7 entries, each with `kind`, `description`, optional `rest`.
- **Phase 3:** sync activities; AI goal's `checkIns` populates; tap a day; manual check-in persists; progress % advances.
- **Phase 4:** above-the-fold of Overview shows Today / This Week / Coach insight without scroll on a Pixel 7 / iPhone 14 viewport. All four screens reachable via 5-tab nav.

## Sequencing
- Ship Phase 1 today (chart fix done; sync pill in next pass).
- Phase 2 + 3 together — they share types and the UI lives in GoalsScreen.
- Phase 4 in screen-sized chunks: theme v2 + Overview hero first, then per-screen.
