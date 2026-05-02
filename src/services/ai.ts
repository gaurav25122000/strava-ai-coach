import { Goal, Activity, UserProfile } from '../store/useStore';
import axios from 'axios';

// Gemini response_schema for structured output
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    phases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name:                { type: 'string' },
          description:         { type: 'string' },
          weeklyVolumeTarget:  { type: 'number' },
          longRunTarget:       { type: 'number' },
          keyWorkout:          { type: 'string' },
        },
        required: ['name', 'description', 'weeklyVolumeTarget', 'longRunTarget', 'keyWorkout'],
      },
    },
  },
  required: ['phases'],
};

function buildSystemPrompt(personality: string): string {
  return `You are an elite, world-class running coach with a ${personality} coaching style. Your objective is to create highly detailed, safe, and physiologically sound training plans.

Core Coaching Rules you MUST follow:
1. The 10% Rule: Never increase weekly volume by more than 10-15% from the previous week's baseline.
2. 80/20 Rule: Ensure roughly 80% of the prescribed volume is easy/aerobic, and 20% is high intensity.
3. Safety First: If the target date is too close for the target distance given the athlete's current volume, prioritize getting them to the finish line uninjured rather than hitting an arbitrary time goal.
4. Precision: When prescribing key workouts, provide exact warmups, intervals, recoveries (time or distance), and cooldowns. Use Perceived Exertion (RPE 1-10) alongside pace targets.`;
}

function buildUserPrompt(
  goalTitle: string,
  targetDate: string,
  activities: Activity[],
  injuries: any[],
  userProfile: Partial<UserProfile>
): string {
  const runs = activities.filter(a => a.type === 'Run');
  const last4Weeks = activities.filter(a => {
    const daysAgo = (Date.now() - new Date(a.startDate).getTime()) / 86400000;
    return daysAgo <= 28;
  });
  const avgWeeklyKm = last4Weeks.reduce((s, a) => s + a.distance / 1000, 0) / 4;
  const longestRun = runs.reduce((max, a) => a.distance > max ? a.distance : max, 0) / 1000;
  const daysToGoal = Math.round((new Date(targetDate).getTime() - Date.now()) / 86400000);

  // Threshold pace: fastest recent run pace (best effort proxy)
  const recentRuns = runs
    .filter(a => a.averageSpeed > 0)
    .sort((a, b) => b.averageSpeed - a.averageSpeed);
  const fastestPaceRaw = recentRuns.length ? 1000 / recentRuns[0].averageSpeed / 60 : 0;
  const fastestPaceFmt = fastestPaceRaw
    ? `${Math.floor(fastestPaceRaw)}:${Math.round((fastestPaceRaw % 1) * 60).toString().padStart(2, '0')} min/km`
    : null;

  const avgHR = runs.filter(a => a.averageHeartRate).length
    ? Math.round(runs.filter(a => a.averageHeartRate).reduce((s, a) => s + (a.averageHeartRate || 0), 0) / runs.filter(a => a.averageHeartRate).length)
    : null;
  const totalElevation = activities.reduce((s, a) => s + a.totalElevationGain, 0);

  const injuryContext = injuries.length > 0
    ? `INJURIES / NIGGLES: ${injuries.map((i: any) => i.type).join(', ')}. Prioritise recovery and low-impact alternatives.`
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

  return `## ATHLETE PROFILE
Name: ${userProfile.name || 'Athlete'}
${profileLines || 'No additional profile data provided.'}
${injuryContext}

## TRAINING HISTORY (Last 28 Days)
- Total runs: ${runs.filter(a => { const d = (Date.now() - new Date(a.startDate).getTime()) / 86400000; return d <= 28; }).length}
- Average weekly volume: ${avgWeeklyKm.toFixed(1)} km/week
- Longest recent run: ${longestRun.toFixed(1)} km
- Fastest recent pace (estimated threshold): ${fastestPaceFmt || 'Not available — use HR zones or RPE for intensity guidance'}
- Average heart rate: ${avgHR ? avgHR + ' bpm' : 'Not available'}
- Total elevation gain (all time): ${Math.round(totalElevation)} m

## MACRO GOAL
Target Event: "${goalTitle}"
Days to Event: ${daysToGoal} days (${Math.floor(daysToGoal / 7)} weeks)

## INSTRUCTIONS
Based on the athlete's history and goal, generate a multi-phase training plan structured specifically for the ${daysToGoal} days remaining.

For each phase:
- Specify the exact weeks covered (e.g., "Weeks 1-4").
- Provide a detailed 3-5 sentence physiological focus, explaining the types of runs and pacing guidance relative to their current fitness.
- Define a highly precise keyWorkout for the phase, including exact distances, times, and RPE/Pace guidance.`;
}

function parsePhases(result: any): Partial<Goal> {
  const firstPhase = result.phases?.[0] || result;
  return {
    phase: firstPhase.name ? `${firstPhase.name}\n${firstPhase.description}` : result.phase || '',
    weeklyVolume: { current: 0, target: firstPhase.weeklyVolumeTarget || 0 },
    longRun: { current: 0, target: firstPhase.longRunTarget || 0 },
    keyWorkout: firstPhase.keyWorkout || '',
    phases: result.phases || [],
  };
}

// Build Gemini-style contents array from stored chat history + new user message
function buildChatContents(
  history: Array<{ role: 'user' | 'model'; text: string }>,
  newMessage: string
) {
  return [
    ...history.map(h => ({
      role: h.role,
      parts: [{ text: h.text }],
    })),
    { role: 'user', parts: [{ text: newMessage }] },
  ];
}

export const AIService = {
  // Continue an existing AI plan as a stateful multi-turn chat (Gemini only for now)
  continueTrainingPlan: async (
    existingGoal: Goal,
    userMessage: string,
    provider: 'openai' | 'anthropic' | 'gemini',
    apiKey: string,
    personality: string
  ): Promise<{ plan: Partial<Goal>; updatedHistory: Array<{ role: 'user' | 'model'; text: string }> }> => {
    const systemPrompt = buildSystemPrompt(personality);
    const history = existingGoal.chatHistory || [];

    // Seed history with the original plan if this is the first edit
    const seedHistory: Array<{ role: 'user' | 'model'; text: string }> = history.length === 0
      ? [{ role: 'model', text: JSON.stringify({ phases: existingGoal.phases || [] }) }]
      : history;

    const contents = buildChatContents(seedHistory, userMessage);

    let result: any;
    if (provider === 'gemini') {
      const response = await axios.post(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
        {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { responseMimeType: 'application/json', responseSchema: PLAN_SCHEMA },
        },
        { headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey } }
      );
      result = JSON.parse(response.data.candidates[0].content.parts[0].text);
    } else if (provider === 'openai') {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            ...seedHistory.map(h => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.text })),
            { role: 'user', content: userMessage },
          ],
        },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
      );
      result = JSON.parse(response.data.choices[0].message.content);
    } else {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-opus-4-5',
          max_tokens: 2048,
          system: systemPrompt,
          messages: [
            ...seedHistory.map(h => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.text })),
            { role: 'user', content: userMessage },
          ],
        },
        { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } }
      );
      result = JSON.parse(response.data.content[0].text);
    }

    const modelReply = JSON.stringify(result);
    const updatedHistory: Array<{ role: 'user' | 'model'; text: string }> = [
      ...seedHistory,
      { role: 'user', text: userMessage },
      { role: 'model', text: modelReply },
    ];

    return { plan: parsePhases(result), updatedHistory };
  },


  generateTrainingPlan: async (
    goalTitle: string,
    targetDate: string,
    activities: Activity[],
    provider: 'openai' | 'anthropic' | 'gemini',
    apiKey: string,
    personality: string = 'Encouraging Supporter',
    injuries: any[] = [],
    userProfile: Partial<UserProfile> = {}
  ): Promise<Partial<Goal>> => {

    if (!apiKey) throw new Error('API Key is missing');

    const systemPrompt = buildSystemPrompt(personality);
    const userPrompt = buildUserPrompt(goalTitle, targetDate, activities, injuries, userProfile);

    try {
      if (provider === 'openai') {
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4o',
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          },
          { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
        );
        return parsePhases(JSON.parse(response.data.choices[0].message.content));

      } else if (provider === 'anthropic') {
        const response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: 'claude-opus-4-5',
            max_tokens: 2048,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          },
          { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } }
        );
        return parsePhases(JSON.parse(response.data.content[0].text));

      } else {
        // Gemini — structured outputs via response_schema
        const response = await axios.post(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
          {
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: PLAN_SCHEMA,
            },
          },
          { headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey } }
        );
        return parsePhases(JSON.parse(response.data.candidates[0].content.parts[0].text));
      }
    } catch (error) {
      console.error('Error generating AI plan:', error);
      throw error;
    }
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

