import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_URL = 'https://api.openai.com/v1/chat/completions';

export interface UserStats {
  recentPace: string;
  weeklyVolume: number;
  longestRun: number;
  personality?: string;
  weatherContextEnabled?: boolean;
}

export interface TrainingGoal {
  name: string;
  targetDate: string;
  targetMetric?: string;
}

export const generateTrainingPlan = async (stats: UserStats, goal: TrainingGoal) => {
  try {
    const apiKey = await SecureStore.getItemAsync('llmApiKey');

    if (!apiKey) {
      console.warn("LLM API Key not found in Settings. Skipping AI recommendation.");
      return null;
    }

    const prompt = `
      You are an expert AI running coach with a ${stats.personality || 'Encouraging'} personality.
      User's current stats: Recent pace is ${stats.recentPace} min/km, weekly volume is ${stats.weeklyVolume} km, longest run is ${stats.longestRun} km.
      User's goal: ${goal.name} on ${goal.targetDate} with a target of ${goal.targetMetric || 'finishing'}.
      ${stats.weatherContextEnabled ? 'Please also consider typical weather adjustments for outdoor running if applicable.' : ''}

      Generate a training plan recommendation for the current week, including:
      1. Target weekly volume (km)
      2. Target long run distance (km)
      3. Key workout description (e.g., "Hyrox simulation: 4 rounds...")
      4. Current training phase name (e.g., "Specific", "Base")
      5. Short description of the phase focus.

      Return the response STRICTLY as a JSON object with exactly these keys: targetVolume (number), targetLongRun (number), keyWorkoutTitle (string), keyWorkoutDesc (string), phaseName (string), phaseDesc (string).
    `;

    const response = await axios.post(
      API_URL,
      {
        model: 'gpt-4o', // or gpt-3.5-turbo if you prefer lower cost
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        response_format: { type: "json_object" }
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = JSON.parse(response.data.choices[0].message.content);
    return data;

  } catch (error) {
    console.error("Error generating training plan via LLM:", error);
    return null;
  }
};
