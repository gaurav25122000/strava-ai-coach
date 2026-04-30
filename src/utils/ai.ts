import axios from 'axios';

const OPENAI_API_KEY = 'YOUR_OPENAI_API_KEY'; // Replace with your actual key
const API_URL = 'https://api.openai.com/v1/chat/completions';

export interface UserStats {
  recentPace: string;
  weeklyVolume: number;
  longestRun: number;
}

export interface TrainingGoal {
  name: string;
  targetDate: string;
  targetMetric?: string;
}

export const generateTrainingPlan = async (stats: UserStats, goal: TrainingGoal) => {
  try {
    const prompt = `
      You are an expert AI running coach.
      User's current stats: Recent pace is ${stats.recentPace} min/km, weekly volume is ${stats.weeklyVolume} km, longest run is ${stats.longestRun} km.
      User's goal: ${goal.name} on ${goal.targetDate} with a target of ${goal.targetMetric || 'finishing'}.

      Generate a training plan recommendation for the current week, including:
      1. Target weekly volume (km)
      2. Target long run distance (km)
      3. Key workout description (e.g., "Hyrox simulation: 4 rounds...")
      4. Current training phase name (e.g., "Specific", "Base")
      5. Short description of the phase focus.

      Return the response STRICTLY as a JSON object with keys: targetVolume, targetLongRun, keyWorkoutTitle, keyWorkoutDesc, phaseName, phaseDesc.
    `;

    // Real API Implementation
    /*
    const response = await axios.post(
      API_URL,
      {
        model: 'gpt-4o', // or gpt-3.5-turbo
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        response_format: { type: "json_object" }
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = JSON.parse(response.data.choices[0].message.content);
    return data;
    */

    console.log("Simulating LLM call for training plan...");

    // Mock response matching the visual design
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          targetVolume: 30,
          targetLongRun: 10,
          keyWorkoutTitle: 'Hyrox simulation: 4 rounds of 1km run + 2 stations',
          keyWorkoutDesc: 'Aim for 4 runs/week',
          phaseName: 'Specific',
          phaseDesc: 'Progressive overload. Add intensity weekly.'
        });
      }, 1500);
    });

  } catch (error) {
    console.error("Error generating training plan:", error);
    throw error;
  }
};
