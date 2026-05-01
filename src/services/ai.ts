import { Goal, Activity, UserProfile } from '../store/useStore';
import axios from 'axios';

function buildPrompt(
  goalTitle: string,
  targetDate: string,
  activities: Activity[],
  personality: string,
  injuries: any[],
  userProfile: Partial<UserProfile>
): string {
  // ── Recent training context ───────────────────────────────────────────
  const runs = activities.filter(a => a.type === 'Run');
  const last14Km = activities.slice(0, 14).reduce((s, a) => s + a.distance / 1000, 0);
  const last4Weeks = activities.filter(a => {
    const daysAgo = (Date.now() - new Date(a.startDate).getTime()) / 86400000;
    return daysAgo <= 28;
  });
  const avgWeeklyKm = last4Weeks.reduce((s, a) => s + a.distance / 1000, 0) / 4;
  const longestRun = runs.reduce((max, a) => a.distance > max ? a.distance : max, 0) / 1000;
  const avgPaceRaw = runs.length
    ? runs.reduce((s, a) => s + (a.averageSpeed > 0 ? 1000 / a.averageSpeed / 60 : 0), 0) / runs.length
    : 0;
  const avgPaceFmt = avgPaceRaw
    ? `${Math.floor(avgPaceRaw)}:${Math.round((avgPaceRaw % 1) * 60).toString().padStart(2, '0')} min/km`
    : 'unknown';
  const avgHR = runs.filter(a => a.averageHeartRate).length
    ? Math.round(runs.filter(a => a.averageHeartRate).reduce((s, a) => s + (a.averageHeartRate || 0), 0) / runs.filter(a => a.averageHeartRate).length)
    : null;
  const totalElevation = activities.reduce((s, a) => s + a.totalElevationGain, 0);
  const daysToGoal = Math.round((new Date(targetDate).getTime() - Date.now()) / 86400000);

  // ── Injury context ────────────────────────────────────────────────────
  const injuryContext = injuries.length > 0
    ? `INJURIES / NIGGLES: ${injuries.map((i: any) => i.type).join(', ')}. Prioritise recovery and low-impact alternatives.`
    : 'No current injuries reported.';

  // ── User profile context ──────────────────────────────────────────────
  const age = userProfile.dob
    ? Math.floor((Date.now() - new Date(userProfile.dob).getTime()) / (365.25 * 86400000))
    : null;

  const profileLines = [
    age                          ? `Age: ${age} years`                                 : null,
    userProfile.weight           ? `Weight: ${userProfile.weight} kg`                  : null,
    userProfile.height           ? `Height: ${userProfile.height} cm`                  : null,
    userProfile.fitnessLevel     ? `Fitness level: ${userProfile.fitnessLevel}`         : null,
    userProfile.restingHR        ? `Resting HR: ${userProfile.restingHR} bpm`           : null,
    userProfile.maxHR            ? `Max HR: ${userProfile.maxHR} bpm`                   : null,
    userProfile.weeklyGoalKm     ? `Weekly km goal: ${userProfile.weeklyGoalKm} km`     : null,
    userProfile.trainingDaysPerWeek ? `Preferred training days/week: ${userProfile.trainingDaysPerWeek}` : null,
    userProfile.preferredTerrain ? `Preferred terrain: ${userProfile.preferredTerrain}` : null,
    userProfile.sleepHours       ? `Average sleep: ${userProfile.sleepHours} hrs/night` : null,
    userProfile.nutritionNotes   ? `Nutrition notes: ${userProfile.nutritionNotes}`     : null,
    userProfile.injuries        ? `Injury history: ${userProfile.injuries}`           : null,
  ].filter(Boolean).join('\n      ');

  return `
    You are an elite running coach with a "${personality}" coaching style.

    ## ATHLETE PROFILE
    Name: ${userProfile.name || 'Athlete'}
    ${profileLines || 'No additional profile data provided.'}

    ## TRAINING HISTORY (last 28 days)
    - Total activities: ${last4Weeks.length} (${runs.filter(a => { const d = (Date.now() - new Date(a.startDate).getTime()) / 86400000; return d <= 28; }).length} runs)
    - Average weekly volume: ${avgWeeklyKm.toFixed(1)} km/week
    - Last 14 days distance: ${last14Km.toFixed(1)} km
    - Longest recent run: ${longestRun.toFixed(1)} km
    - Average running pace: ${avgPaceFmt}
    - Average heart rate: ${avgHR ? `${avgHR} bpm` : 'not available'}
    - Total elevation gain (all time): ${Math.round(totalElevation)} m

    ## GOAL
    Target: "${goalTitle}"
    Target date: ${targetDate} (${daysToGoal} days away)

    ## HEALTH & LIFESTYLE
    ${injuryContext}

    ## INSTRUCTIONS
    Using all the above context, write a highly personalised training plan.
    Tailor the tone, weekly targets, and recovery guidance to the athlete's fitness level, age, and training history.
    If the athlete is a beginner, be conservative. If advanced, be ambitious.
    Account for injury history in your plan.

    Respond ONLY with valid JSON — no markdown, no extra text:
    {
      "phase": "Phase Name\\nPhase description (2-3 sentences in your coaching persona)",
      "weeklyVolumeTarget": <number in km>,
      "longRunTarget": <number in km>,
      "keyWorkout": "Workout Title\\nDetailed workout description (sets, paces, recovery)"
    }
  `;
}

export const AIService = {
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

    const prompt = buildPrompt(goalTitle, targetDate, activities, personality, injuries, userProfile);

    try {
      if (provider === 'openai') {
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4o',
            response_format: { type: 'json_object' },
            messages: [{ role: 'user', content: prompt }],
          },
          { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
        );
        const result = JSON.parse(response.data.choices[0].message.content);
        return {
          phase: result.phase,
          weeklyVolume: { current: 0, target: result.weeklyVolumeTarget },
          longRun: { current: 0, target: result.longRunTarget },
          keyWorkout: result.keyWorkout,
        };

      } else if (provider === 'anthropic') {
        const response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: 'claude-opus-4-5',
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }],
          },
          { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } }
        );
        const result = JSON.parse(response.data.content[0].text);
        return {
          phase: result.phase,
          weeklyVolume: { current: 0, target: result.weeklyVolumeTarget },
          longRun: { current: 0, target: result.longRunTarget },
          keyWorkout: result.keyWorkout,
        };

      } else {
        // Gemini
        const response = await axios.post(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          },
          { headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey } }
        );
        const result = JSON.parse(response.data.candidates[0].content.parts[0].text);
        return {
          phase: result.phase,
          weeklyVolume: { current: 0, target: result.weeklyVolumeTarget },
          longRun: { current: 0, target: result.longRunTarget },
          keyWorkout: result.keyWorkout,
        };
      }
    } catch (error) {
      console.error('Error generating AI plan:', error);
      throw error;
    }
  },

  getMotivationalInsight: (): string => {
    const insights = [
      'Your pace trend is improving — keep the consistency.',
      "You've maintained a great streak. Don't forget to rest.",
      'Your elevation gain is impressive this week.',
      'Consistency is key. You\'re on track for your goal.',
      'Remember: easy days make the hard days possible.',
      'Your long run is the foundation — protect it.',
    ];
    return insights[Math.floor(Math.random() * insights.length)];
  },
};
