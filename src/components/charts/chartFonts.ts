import { useFont } from '@shopify/react-native-skia';

// Skia draws axis labels itself, so it needs the raw ttf — the RN font
// registry (useFonts in App.tsx) is invisible to it. Sora Medium keeps chart
// labels on-brand without the weight of the display cuts.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SORA_MEDIUM = require('@expo-google-fonts/sora/500Medium/Sora_500Medium.ttf');

export function useChartFont(size = 10) {
  return useFont(SORA_MEDIUM, size);
}
