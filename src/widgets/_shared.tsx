import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LucideIcon } from 'lucide-react-native';
import { Typography } from '../components/Typography';
import { theme, withAlpha } from '../theme';

// Shared bits for the health/activity widget extraction. Underscore-prefixed
// so the filename can never collide with a widget id.

/** Big number + unit + right-aligned chip — the standard widget stat header. */
export const bigStat = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  numWrap: { flexDirection: 'row', alignItems: 'baseline' },
  num: {
    fontSize: 36,
    fontWeight: '900',
    lineHeight: 40,
    color: theme.colors.text,
    letterSpacing: -1,
  },
  unit: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '700',
    marginLeft: 6,
  },
});

/** Tinted pill chip with an optional icon, used beside the big stat number. */
export function StatChip({
  color,
  icon: Icon,
  label,
}: {
  color: string;
  icon?: LucideIcon;
  label: string;
}) {
  return (
    <View style={[chipStyles.chip, { backgroundColor: withAlpha(color, 'tint') }]}>
      {Icon ? <Icon color={color} size={11} /> : null}
      <Typography style={[chipStyles.txt, { color }]}>{label}</Typography>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  txt: { fontSize: 11, fontWeight: '800' },
});

export interface ZoneColumn {
  label: string;
  /** Share of total (0..1). */
  pct: number;
  color: string;
}

/**
 * Row of vertical gradient bars — the HR / power zone histogram. Bars scale
 * relative to the busiest zone; empty zones keep a 4px stub so the axis reads.
 */
export function ZoneHistogram({ zones, barArea = 60 }: { zones: ZoneColumn[]; barArea?: number }) {
  const maxPct = Math.max(...zones.map((z) => z.pct), 0.01);
  return (
    <View style={histStyles.row}>
      {zones.map((z) => {
        const h = z.pct > 0 ? Math.max(8, (z.pct / maxPct) * barArea) : 4;
        return (
          <View key={z.label} style={histStyles.col}>
            <Typography
              style={[histStyles.pct, { color: z.pct > 0 ? z.color : theme.colors.textSecondary }]}
            >
              {Math.round(z.pct * 100)}%
            </Typography>
            <View style={{ height: barArea, justifyContent: 'flex-end', width: '100%', alignItems: 'center' }}>
              <LinearGradient
                colors={[z.color, withAlpha(z.color, 'strong')]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={{ width: '70%', height: h, borderRadius: 4 }}
              />
            </View>
            <Typography style={[histStyles.lbl, { color: z.color }]}>{z.label}</Typography>
          </View>
        );
      })}
    </View>
  );
}

const histStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 4,
  },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  pct: { fontSize: 10, fontWeight: '800', marginBottom: 4 },
  lbl: { fontSize: 10, fontWeight: '800', marginTop: 4 },
});

/** Strava ride-ish sport_types — shared by TrainerRatio and PowerZones. */
export const RIDE_TYPES = new Set([
  'Ride',
  'VirtualRide',
  'GravelRide',
  'MountainBikeRide',
  'EBikeRide',
  'EMountainBikeRide',
]);

/**
 * Deterministic sport → colour mapping built from theme tokens (no hex
 * literals in widgets). Known sports keep their app-wide colours; anything
 * else cycles a distinct accent palette in the order given.
 */
export function assignSportColors(types: string[]): Record<string, string> {
  const fam = theme.colors.families;
  const known: Record<string, string> = {
    Run: theme.colors.primary,
    Ride: theme.colors.info,
    Walk: theme.colors.secondary,
    Hike: theme.colors.success,
    Swim: fam.recovery.accent,
  };
  const fallback = [
    theme.colors.accent,
    fam.social.accent,
    fam.records.accent,
    fam.progress.accent,
    theme.colors.warning,
    theme.colors.error,
  ];
  const out: Record<string, string> = {};
  let i = 0;
  for (const t of types) {
    out[t] = known[t] ?? fallback[i++ % fallback.length];
  }
  return out;
}
