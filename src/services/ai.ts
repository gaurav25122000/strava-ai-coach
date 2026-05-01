import { Goal, Activity } from '../store/useStore';
import axios from 'axios';

export const AIService = {
  generateTrainingPlan: async (
    goalTitle: string,
    targetDate: string,
    activities: Activity[],
    provider: 'openai' | 'anthropic' | 'gemini',
    apiKey: string
  ): Promise<Partial<Goal>> => {

    if (!apiKey) {
        throw new Error('API Key is missing');
    }

    const recentDistance = activities.slice(0, 14).reduce((sum, act) => sum + (act.distance / 1000), 0);

    const prompt = `
      Act as an elite running coach. I have a user aiming for a goal: "${goalTitle}" by the date ${targetDate}.
      Over the last 14 days, they have run ${recentDistance.toFixed(2)} km.
      Generate a training plan structured exactly in this JSON format without any markdown wrappers or additional text:
      {
        "phase": "Phase Name\\nPhase Description",
        "weeklyVolumeTarget": 40,
        "longRunTarget": 15,
        "keyWorkout": "Workout Title\\nWorkout Description"
      }
    `;

    try {
        if (provider === 'openai') {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-4-turbo-preview',
                    response_format: { type: "json_object" },
                    messages: [{ role: 'user', content: prompt }]
                },
                { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
            );

            const result = JSON.parse(response.data.choices[0].message.content);
            return {
                phase: result.phase,
                weeklyVolume: { current: 0, target: result.weeklyVolumeTarget },
                longRun: { current: 0, target: result.longRunTarget },
                keyWorkout: result.keyWorkout
            };
        } else if (provider === 'anthropic') {
             const response = await axios.post(
                'https://api.anthropic.com/v1/messages',
                {
                    model: 'claude-3-opus-20240229',
                    max_tokens: 1024,
                    messages: [{ role: 'user', content: prompt }]
                },
                { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } }
            );

            const result = JSON.parse(response.data.content[0].text);
             return {
                phase: result.phase,
                weeklyVolume: { current: 0, target: result.weeklyVolumeTarget },
                longRun: { current: 0, target: result.longRunTarget },
                keyWorkout: result.keyWorkout
            };
        } else {
             // Google Gemini API Integration
             const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`,
                {
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                },
                { headers: { 'Content-Type': 'application/json' } }
            );

            const contentString = response.data.candidates[0].content.parts[0].text;
            const result = JSON.parse(contentString);

            return {
                phase: result.phase,
                weeklyVolume: { current: 0, target: result.weeklyVolumeTarget },
                longRun: { current: 0, target: result.longRunTarget },
                keyWorkout: result.keyWorkout
            };
        }

    } catch (error) {
        console.error('Error generating AI plan:', error);
        throw error;
    }
  },

  getMotivationalInsight: (): string => {
    const insights = [
      "Your pace trend is improving! Keep up the good work.",
      "You've maintained a great streak, remember to rest.",
      "Your elevation gain is impressive this week.",
      "Consistency is key. You're on track for your goal."
    ];
    return insights[Math.floor(Math.random() * insights.length)];
  }
};
