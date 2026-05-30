import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { theme } from '../theme';

interface StaggerItemProps {
  /** Render position. Drives the cascade so the reveal follows the screen
   *  top-to-bottom regardless of any user-customised order. */
  index?: number;
  /** Milliseconds added per index. Default 55 — tight enough to feel like one
   *  motion, loose enough to read as a cascade. */
  step?: number;
  /** Base delay before the cascade starts. */
  base?: number;
  /** Cap on the multiplied index so deep items (widget #25) don't lag a second
   *  behind. Default 8 — after the 8th item everything lands together. */
  maxIndex?: number;
  /** Attach a springy LinearTransition so reorder/insert/remove animates
   *  instead of snapping. Default true. */
  animateLayout?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * The app's single entrance choreography. Wrap any section / list row / widget
 * in `<StaggerItem index={i}>` and it fades+rises into place on mount with the
 * shared spring curve from `theme.motion.spring`. Centralising this means the
 * whole app reveals as one authored motion system rather than ~90 hand-tuned
 * `FadeInDown.delay(magicNumber)` call sites that drift out of sync.
 */
export function StaggerItem({
  index = 0,
  step = 55,
  base = 0,
  maxIndex = 8,
  animateLayout = true,
  style,
  children,
}: StaggerItemProps) {
  const delay = base + Math.min(index, maxIndex) * step;
  const entering = FadeInDown.delay(delay)
    .springify()
    .damping(theme.motion.spring.damping)
    .stiffness(theme.motion.spring.stiffness)
    .mass(theme.motion.spring.mass);

  // The entrance (which animates opacity) and the layout animation must live on
  // DIFFERENT nodes — on the same node Reanimated warns the layout animation
  // can overwrite the entrance opacity. The caller's `style` always stays on the
  // node that directly wraps the children, so any flex layout it defines (e.g.
  // a `flexDirection: 'row'` row) is preserved; the layout animation goes on a
  // bare outer wrapper.
  if (!animateLayout) {
    return (
      <Animated.View entering={entering} style={style}>
        {children}
      </Animated.View>
    );
  }

  return (
    <Animated.View layout={LinearTransition.springify().damping(20).stiffness(180)}>
      <Animated.View entering={entering} style={style}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}
