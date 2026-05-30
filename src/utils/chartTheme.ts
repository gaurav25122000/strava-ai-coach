import React from 'react';
import { View } from 'react-native';
import { Typography } from '../components/Typography';
import { theme } from '../theme';
import { familyStyle, WidgetFamily } from './widgetFamilies';

/**
 * Single source of truth for chart chrome. Components import these helpers
 * instead of inlining `yAxisColor`/`rulesType`/etc. so every chart in the app
 * shares one visual language (premium dark + family accent).
 */

export interface ChartBaseOpts {
  family?: WidgetFamily;
  /** Hide the y-axis tick labels entirely (used for sparkline-style charts). */
  hideYAxis?: boolean;
  /** Grow bars from the baseline / draw lines left-to-right on mount + range
   *  change. Default true. Set false for tiny sparklines that shouldn't move. */
  animated?: boolean;
}

export function chartBase({ family, hideYAxis, animated = true }: ChartBaseOpts = {}) {
  const accent = family ? familyStyle(family).accent : theme.colors.primary;
  return {
    yAxisColor: 'transparent' as const,
    xAxisColor: theme.colors.border,
    yAxisTextStyle: hideYAxis
      ? { color: 'transparent', fontSize: 0 }
      : { color: theme.colors.textSecondary, fontSize: 10, fontWeight: '600' as const },
    xAxisLabelTextStyle: { color: theme.colors.textSecondary, fontSize: 10, fontWeight: '700' as const },
    noOfSections: 4,
    rulesColor: accent + '22',
    rulesType: 'dashed' as const,
    dashWidth: 3,
    dashGap: 5,
    isAnimated: animated,
    animationDuration: theme.motion.base,
    yAxisThickness: 0,
    xAxisThickness: 1,
  };
}

/**
 * Premium bar preset — gradient body, rounded top, family colour.
 * Spread after data props.
 */
export function barProps(family: WidgetFamily) {
  const accent = familyStyle(family).accent;
  return {
    roundedTop: true,
    showGradient: true,
    gradientColor: accent,
    frontColor: accent + '66',
    barBorderRadius: 6,
  };
}

/**
 * Premium line preset — thick curved area, family-tinted gradient fill.
 */
export function lineProps(family: WidgetFamily) {
  const accent = familyStyle(family).accent;
  return {
    thickness: 3,
    color: accent,
    curved: true,
    areaChart: true,
    hideDataPoints: true,
    startFillColor: accent,
    endFillColor: theme.colors.background,
    startOpacity: 0.5,
    endOpacity: 0,
  };
}

/**
 * Donut preset — premium dark-theme look:
 * - Transparent inner circle (no jarring white hole on dark surfaces)
 * - Subtle inner border so the centre still reads as separate from the ring
 * - Tighter slice text in bold white
 * Centre label content is the caller's responsibility (centerLabelComponent).
 */
export function pieProps() {
  return {
    donut: true,
    // Inline % labels on slices overflow tiny rings and duplicate the legend
    // below. Suppress them — the legend carries the breakdown.
    showText: false,
    textColor: '#fff',
    textSize: 11 as const,
    radius: 100 as const,
    innerRadius: 60 as const,
    innerCircleColor: theme.colors.surface,
    innerCircleBorderWidth: 1,
    innerCircleBorderColor: theme.colors.border,
    strokeColor: theme.colors.background,
    strokeWidth: 2,
    showValuesAsLabels: false,
  };
}

/**
 * Pointer tooltip — premium pill with family colour. Drop-in for the existing
 * `getPointerConfig` callsites.
 */
export function pointerConfig(unit: string, family: WidgetFamily) {
  const accent = familyStyle(family).accent;
  return {
    pointerStripHeight: 160,
    pointerStripColor: accent + 'AA',
    pointerStripWidth: 2,
    pointerColor: accent,
    radius: 6,
    pointerLabelWidth: 92,
    pointerLabelHeight: 34,
    activatePointersOnLongPress: false,
    activatePointersDelay: 0,
    autoAdjustPointerLabelPosition: true,
    pointerLabelComponent: (items: any) => {
      if (!items || !items[0]) return null;
      const val = items[0].value;
      let formatted = String(val) + unit;
      if (unit === '/km') {
        const n = parseFloat(val);
        const m = Math.floor(n);
        const s = Math.round((n - m) * 60);
        formatted = `${m}:${s.toString().padStart(2, '0')} /km`;
      }
      return React.createElement(
        View,
        {
          style: {
            height: 34,
            width: 92,
            backgroundColor: theme.colors.surface,
            borderRadius: 10,
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: accent + '66',
            shadowColor: accent,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 6,
            elevation: 6,
            marginTop: -34,
            marginLeft: -46,
          },
        },
        React.createElement(
          Typography,
          { style: { color: theme.colors.text, fontSize: 12, fontWeight: '800' } },
          formatted,
        ),
      );
    },
  };
}
