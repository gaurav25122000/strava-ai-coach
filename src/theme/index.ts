// Hex alpha suffixes — the app-wide opacity system. Use `withAlpha(hex, 'tint')`
// instead of ad-hoc string math like `accent + '22'` so levels stay consistent.
export const alpha = {
  faint: '0A',   // 4%  — hairlines, barely-there fills
  soft: '14',    // 8%  — resting tints, dividers on dark
  tint: '22',    // 13% — family tints, pill backgrounds
  medium: '33',  // 20% — active tints, selected states
  strong: '55',  // 33% — emphasised fills, gradients tails
  heavy: '88',   // 53% — overlays, pressed scrims
} as const;

export type AlphaLevel = keyof typeof alpha;

/** `#RRGGBB` + named opacity level → `#RRGGBBAA`. */
export const withAlpha = (hex: string, level: AlphaLevel) => hex + alpha[level];

export const theme = {
  colors: {
    background: '#1A1A24',
    surface: '#252636',
    surfaceElevated: '#2A2C40',
    surfaceMuted: '#1F2030',
    surfaceGlass: 'rgba(42,44,64,0.65)',
    primary: '#F97316', // Orange
    primaryMuted: '#F9731622',
    secondary: '#10B981', // Green
    accent: '#8B5CF6', // Purple
    text: '#FFFFFF',
    textSecondary: '#9CA3AF',
    /** Text/icons sitting on a family gradient or accent fill. */
    onAccent: '#FFFFFF',
    border: '#374151',
    divider: 'rgba(255,255,255,0.06)',
    scrim: 'rgba(10,10,16,0.6)',
    error: '#EF4444',
    success: '#22C55E',
    warning: '#F59E0B',
    info: '#3B82F6',
    strava: '#FC4C02',
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
  // Sora (loaded in App.tsx) carries the headline + numeric identity. RN does
  // not synthesise weights for custom fonts, so each weight is its own family
  // and we name it explicitly per token. Body/caption stay on the system font
  // for crisp small-size legibility and zero extra load cost.
  fonts: {
    display: 'Sora_800ExtraBold',
    bold: 'Sora_700Bold',
    semibold: 'Sora_600SemiBold',
    medium: 'Sora_500Medium',
    regular: 'Sora_400Regular',
  },
  typography: {
    display: { fontSize: 34, fontWeight: '800' as const, lineHeight: 40, letterSpacing: -0.8, fontFamily: 'Sora_800ExtraBold' },
    title: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28, letterSpacing: -0.4, fontFamily: 'Sora_700Bold' },
    heading: { fontSize: 19, fontWeight: '700' as const, lineHeight: 24, letterSpacing: -0.3, fontFamily: 'Sora_700Bold' },
    subtitle: { fontSize: 17, fontWeight: '600' as const, lineHeight: 22, letterSpacing: -0.2, fontFamily: 'Sora_600SemiBold' },
    body: { fontSize: 15, fontWeight: '500' as const, lineHeight: 20 },
    footnote: { fontSize: 13, fontWeight: '500' as const, lineHeight: 18 },
    caption: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16, letterSpacing: 0.3 },
    /** Uppercase section labels / chips — callers apply textTransform. */
    label: { fontSize: 11, fontWeight: '700' as const, lineHeight: 14, letterSpacing: 0.8 },
    micro: { fontSize: 10, fontWeight: '600' as const, lineHeight: 13, letterSpacing: 0.4 },
    numeric: { fontSize: 28, fontWeight: '800' as const, lineHeight: 34, letterSpacing: -0.5, fontVariant: ['tabular-nums' as const], fontFamily: 'Sora_700Bold' },
    numericSm: { fontSize: 20, fontWeight: '700' as const, lineHeight: 25, letterSpacing: -0.3, fontVariant: ['tabular-nums' as const], fontFamily: 'Sora_700Bold' },
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
    /** Press feedback, toggles, small UI — matches PressableScale. */
    springSnappy: { damping: 18, stiffness: 320, mass: 0.6 },
    /** Sheets, large surfaces. */
    springGentle: { damping: 22, stiffness: 160, mass: 1 },
  },
  opacity: {
    disabled: 0.45,
    pressed: 0.7,
  },
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
};
