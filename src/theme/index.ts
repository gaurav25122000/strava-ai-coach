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
      // Widget-family gradient pairs — mirror the families table below so a
      // gradient hero card can carry the same identity as a flat accent pill.
      activity:    ['#F97316', '#EA580C'] as [string, string],
      health:      ['#EF4444', '#DC2626'] as [string, string],
      progress:    ['#0EA5E9', '#0284C7'] as [string, string],
      records:     ['#FCD34D', '#F59E0B'] as [string, string],
      plan:        ['#8B5CF6', '#7C3AED'] as [string, string],
      recovery:    ['#22D3EE', '#0EA5E9'] as [string, string],
      social:      ['#EC4899', '#DB2777'] as [string, string],
    },
    // Widget families drive the cross-cutting colour identity of every
    // dashboard widget, insight card, badge ring, and goal chip. Pick one
    // family per visual unit so the user can read the screen at a glance.
    families: {
      activity: { accent: '#F97316', tint: 'rgba(249,115,22,0.12)', label: 'Activity'  },
      health:   { accent: '#EF4444', tint: 'rgba(239,68,68,0.12)',  label: 'Health'    },
      progress: { accent: '#0EA5E9', tint: 'rgba(14,165,233,0.12)', label: 'Progress'  },
      records:  { accent: '#FCD34D', tint: 'rgba(252,211,77,0.14)', label: 'Records'   },
      plan:     { accent: '#8B5CF6', tint: 'rgba(139,92,246,0.14)', label: 'Plan'      },
      recovery: { accent: '#22D3EE', tint: 'rgba(34,211,238,0.12)', label: 'Recovery'  },
      social:   { accent: '#EC4899', tint: 'rgba(236,72,153,0.12)', label: 'Social'    },
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
