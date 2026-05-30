import React, { useEffect, useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { theme } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface DonutRingProps {
  /** Total diameter in px. */
  size?: number;
  /** Stroke width in px. */
  stroke?: number;
  /** 0-1 progress value. Values outside the range are clamped. */
  progress: number;
  /** Solid stroke colour for the filled arc. Used as the gradient end-stop
   *  when `gradient` is provided. Either `color` or `gradient` must be set. */
  color: string;
  /** Optional two-stop gradient for a richer, premium look. */
  gradient?: [string, string];
  /** Stroke colour for the unfilled track. */
  trackColor: string;
  /** Render a soft outer glow behind the progress arc. Defaults to true when
   *  a gradient is supplied. Disable for very small rings. */
  glow?: boolean;
  /** Sweep the arc in from empty on mount and tween on value changes. Default
   *  true. Set false for static sparkline-style rings. */
  animate?: boolean;
  /** Sweep duration. Defaults to theme.motion.slow (460ms). */
  duration?: number;
  /** Optional content rendered in the centre of the ring. */
  children?: React.ReactNode;
}

/**
 * Premium progress ring built on react-native-svg. Centralised here so any
 * dashboard widget (shoe wear, weekly km, year-to-date, wellness, etc.) can
 * drop a ring in without re-implementing the dasharray maths.
 *
 * The arc sweeps in from empty on mount and tweens whenever `progress`
 * changes, so the ring fills in lockstep with the AnimatedNumber count-ups it
 * usually sits next to. Pass `gradient` for a two-stop stroke; a soft outer
 * glow paints underneath for depth.
 */
export function DonutRing({
  size = 80,
  stroke = 8,
  progress,
  color,
  gradient,
  trackColor,
  glow,
  animate = true,
  duration = theme.motion.slow,
  children,
}: DonutRingProps) {
  const id = useId().replace(/:/g, '_');
  const gradId = `donut-grad-${id}`;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Guard against NaN/Infinity progress (e.g. a 0/0 ratio upstream) — an
  // invalid strokeDashoffset spams CoreGraphics "invalid numeric value" errors.
  const safeProgress = Number.isFinite(progress) ? progress : 0;
  const clamped = Math.max(0, Math.min(1, safeProgress));
  const offset = c * (1 - clamped);
  const showGlow = glow ?? !!gradient;
  const strokePaint = gradient ? `url(#${gradId})` : color;

  // Start empty (offset = circumference) and sweep to the target offset.
  const dashOffset = useSharedValue(animate ? c : offset);

  useEffect(() => {
    if (animate) {
      dashOffset.value = withTiming(offset, { duration, easing: Easing.out(Easing.cubic) });
    } else {
      dashOffset.value = offset;
    }
  }, [offset, animate, duration, dashOffset]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: dashOffset.value }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {gradient && (
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={gradient[0]} />
              <Stop offset="100%" stopColor={gradient[1]} />
            </LinearGradient>
          </Defs>
        )}
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        {/* Soft outer glow — fatter stroke at low opacity behind the arc */}
        {showGlow && clamped > 0 && (
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={gradient ? gradient[1] : color}
            strokeWidth={stroke + 6}
            strokeOpacity={0.18}
            fill="none"
            strokeDasharray={c}
            animatedProps={animatedProps}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        {/* Progress arc */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={strokePaint}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          animatedProps={animatedProps}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children ? <View style={{ alignItems: 'center', justifyContent: 'center' }}>{children}</View> : null}
    </View>
  );
}
