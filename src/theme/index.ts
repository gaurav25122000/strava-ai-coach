export const theme = {
  colors: {
    background: '#1A1A24',
    surface: '#252636',
    surfaceElevated: '#2A2C40',
    surfaceMuted: '#1F2030',
    primary: '#F97316', // Orange
    primaryMuted: '#F9731622',
    secondary: '#10B981', // Green
    accent: '#8B5CF6', // Purple
    text: '#FFFFFF',
    textSecondary: '#9CA3AF',
    border: '#374151',
    divider: 'rgba(255,255,255,0.06)',
    error: '#EF4444',
    success: '#22C55E',
    warning: '#F59E0B',
    info: '#3B82F6',
    heatmapLevels: {
      0: '#252636', // Empty
      1: '#431407', // Very low
      2: '#7c2d12', // Low
      3: '#c2410c', // Medium
      4: '#f97316', // High
    },
    gradients: {
      primary: ['#F97316', '#FB923C'] as [string, string],
      accent: ['#8B5CF6', '#A78BFA'] as [string, string],
      success: ['#10B981', '#34D399'] as [string, string],
      danger: ['#EF4444', '#F87171'] as [string, string],
      surface: ['#2A2C40', '#1F2030'] as [string, string],
      hero: ['#F97316', '#8B5CF6'] as [string, string],
    },
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
    full: 9999,
  },
  typography: {
    display: { fontSize: 34, fontWeight: '800' as const, lineHeight: 40, letterSpacing: -0.5 },
    title: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
    subtitle: { fontSize: 17, fontWeight: '600' as const, lineHeight: 22 },
    body: { fontSize: 15, fontWeight: '500' as const, lineHeight: 20 },
    caption: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16, letterSpacing: 0.3 },
    numeric: { fontSize: 28, fontWeight: '800' as const, lineHeight: 32, fontVariant: ['tabular-nums' as const] },
  },
  shadows: {
    sm: { shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 2 },
    md: { shadowColor: '#000', shadowOpacity: 0.35, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, elevation: 6 },
    lg: { shadowColor: '#000', shadowOpacity: 0.45, shadowOffset: { width: 0, height: 12 }, shadowRadius: 24, elevation: 12 },
    glow: (hex: string) => ({
      shadowColor: hex,
      shadowOpacity: 0.45,
      shadowOffset: { width: 0, height: 0 },
      shadowRadius: 16,
      elevation: 8,
    }),
  },
  motion: {
    fast: 180,
    base: 280,
    slow: 460,
    spring: { damping: 18, stiffness: 220, mass: 0.9 },
  },
};
