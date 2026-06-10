import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

/** Gap between the medal edge and the ring, plus the ring stroke itself. */
const STROKE = 3;
const GAP = 2;

/** Outer box a ring around a `size`-dp medal needs. Exported so grids can
 *  reserve the same footprint for ringless (earned) medals. */
export function ringBoxSize(medalSize: number): number {
  return medalSize + 2 * (STROKE + GAP);
}

/**
 * Thin static progress ring drawn just outside a BadgeMedal disc. Static SVG
 * (no animation) on purpose — dozens render inside the Badges strip.
 */
export function BadgeProgressRing({
  size,
  pct,
  color,
  trackColor,
  children,
}: {
  /** Diameter of the medal being wrapped. */
  size: number;
  /** 0..1 progress; clamped. */
  pct: number;
  color: string;
  trackColor: string;
  children: React.ReactNode;
}) {
  const box = ringBoxSize(size);
  const r = (box - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, Number.isFinite(pct) ? pct : 0));

  return (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={box} height={box} style={{ position: 'absolute' }}>
        <Circle cx={box / 2} cy={box / 2} r={r} stroke={trackColor} strokeWidth={STROKE} fill="none" />
        {clamped > 0 && (
          <Circle
            cx={box / 2}
            cy={box / 2}
            r={r}
            stroke={color}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - clamped)}
            strokeLinecap="round"
            transform={`rotate(-90 ${box / 2} ${box / 2})`}
          />
        )}
      </Svg>
      {children}
    </View>
  );
}
