export const theme = {
  colors: {
    background: '#12121A', // Dark navy/black background
    cardBackground: '#1C1C26', // Slightly lighter card background
    textPrimary: '#FFFFFF',
    textSecondary: '#8A8A93',
    primaryOrange: '#FF6B00', // Overview tab and main actions
    primaryGreen: '#00D084', // Half Marathon goal, Longest run
    primaryRed: '#FF453A', // Hyrox goal
    primaryBlue: '#3A82F6', // Total Runs, Pace trend
    primaryPurple: '#9D4EDD', // Fast 5K goal, Best Pace
    border: '#2C2C36',
    tabBackground: '#1A1A24',
    tabInactive: '#666675',
    skeletonBackground: '#262633',
    skeletonHighlight: '#333342',
    heatmapLevels: {
      0: '#2C2C36', // Empty
      1: '#5E3A21', // Low
      2: '#8E4A15', // Med-Low
      3: '#CC5A00', // Med-High
      4: '#FF6B00', // High
    }
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    round: 9999,
  },
  typography: {
    h1: { fontSize: 32, fontWeight: '700' as const },
    h2: { fontSize: 24, fontWeight: '700' as const },
    h3: { fontSize: 20, fontWeight: '600' as const },
    body: { fontSize: 16, fontWeight: '400' as const },
    caption: { fontSize: 14, fontWeight: '400' as const },
    small: { fontSize: 12, fontWeight: '400' as const },
  }
};
