import React, { useEffect } from 'react';
import { TextStyle, TextProps } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const AnimatedTextInputBase = Animated.createAnimatedComponent(
  require('react-native').TextInput,
) as any;

interface Props extends TextProps {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  style?: TextStyle | TextStyle[];
}

// Smoothly counts to `value` whenever it changes. Uses TextInput under the hood
// so the worklet can update the displayed string off the JS thread.
export const AnimatedNumber = ({
  value,
  decimals = 0,
  duration = 900,
  prefix = '',
  suffix = '',
  style,
  ...rest
}: Props) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const progress = useSharedValue(safeValue);

  useEffect(() => {
    progress.value = withTiming(safeValue, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [safeValue, duration]);

  const animatedProps = useAnimatedProps(() => {
    const v = progress.value;
    const fixed = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toString();
    return { text: `${prefix}${fixed}${suffix}`, defaultValue: `${prefix}${fixed}${suffix}` } as any;
  });

  return (
    <AnimatedTextInputBase
      editable={false}
      underlineColorAndroid="transparent"
      animatedProps={animatedProps}
      style={[{ padding: 0, margin: 0 }, style]}
      {...rest}
    />
  );
};
