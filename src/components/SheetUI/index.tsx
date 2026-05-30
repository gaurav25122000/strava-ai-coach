import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { LucideIcon } from 'lucide-react-native';
import { Icon } from '../Icon';
import { theme } from '../../theme';
import { Typography } from '../Typography';
import { familyStyle, WidgetFamily } from '../../utils/widgetFamilies';
import { sheetStyles as s } from './styles';

// ── SectionLabel ───────────────────────────────────────────────────────
// Tiny uppercase header with a family-coloured dot. Use to group related
// FieldBlocks or RowBlocks inside a sheet body.
export function SectionLabel({
  children,
  family,
  style,
}: {
  children: React.ReactNode;
  family: WidgetFamily;
  style?: StyleProp<ViewStyle>;
}) {
  const fam = familyStyle(family);
  return (
    <View style={[s.sectionLabelRow, style]}>
      <View style={[s.sectionLabelDot, { backgroundColor: fam.accent }]} />
      <Text style={[s.sectionLabelText, { color: fam.accent }]}>{children}</Text>
    </View>
  );
}

// ── FieldBlock ─────────────────────────────────────────────────────────
// Floating-label input block — tinted bg, family-accent label inside, big
// text input below. Pass `multiline` for taller inputs. If `value`/`onChangeText`
// is omitted (e.g. for a date row), render `right` and pass `onPress`.
interface FieldBlockProps {
  label: string;
  family: WidgetFamily;
  value?: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  helper?: string;
  error?: string;
  multiline?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoFocus?: boolean;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  maxLength?: number;
  /** When provided, the block renders as a tappable row instead of an input. */
  onPress?: () => void;
  /** Optional right-side adornment (chevron, icon). Used with `onPress`. */
  right?: React.ReactNode;
  /** When tabular numerics make sense (mileage, target). */
  numeric?: boolean;
}

export function FieldBlock({
  label,
  family,
  value,
  onChangeText,
  placeholder,
  helper,
  error,
  multiline,
  keyboardType,
  autoFocus,
  autoCapitalize,
  maxLength,
  onPress,
  right,
  numeric,
}: FieldBlockProps) {
  const fam = familyStyle(family);
  // Static styling — we used to toggle border/glow on focus, but updating the
  // wrapper view on focus would tear down the native TextInput and lose focus
  // immediately on iOS. Keep the visual identity, drop the focus state.
  const containerStyle: StyleProp<ViewStyle> = [
    s.fieldOuter,
    {
      backgroundColor: fam.tint,
      borderColor: fam.accent + '55',
    },
  ];

  // Tappable variant — used for date pickers and other non-text fields.
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [
        containerStyle,
        pressed ? { transform: [{ scale: 0.99 }] } : null,
      ]}>
        <Text style={[s.fieldLabel, { color: fam.accent }]}>
          {label.toUpperCase()}
        </Text>
        <View style={s.fieldRow}>
          <Text
            style={[
              s.fieldValueText,
              !value ? s.fieldValuePlaceholder : null,
              { flex: 1 },
            ]}
            numberOfLines={1}
          >
            {value || placeholder || 'Tap to select'}
          </Text>
          {right}
        </View>
        {(helper || error) && (
          <Text style={[s.fieldHelper, error ? s.fieldHelperError : null]}>
            {error || helper}
          </Text>
        )}
      </Pressable>
    );
  }

  return (
    <View style={containerStyle}>
      <Text style={[s.fieldLabel, { color: fam.accent }]}>
        {label.toUpperCase()}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textSecondary}
        multiline={multiline}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
        style={[
          s.fieldInput,
          multiline ? s.fieldInputMultiline : null,
          numeric ? { fontVariant: ['tabular-nums'] } : null,
        ]}
      />
      {(helper || error) && (
        <Text style={[s.fieldHelper, error ? s.fieldHelperError : null]}>
          {error || helper}
        </Text>
      )}
    </View>
  );
}

// ── SegmentedControl ───────────────────────────────────────────────────
// Equal-width pill row with a sliding accent fill. Spring-animated indicator
// tracks the selected segment.
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  family,
}: {
  segments: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  family: WidgetFamily;
}) {
  const fam = familyStyle(family);
  const [containerW, setContainerW] = useState(0);
  const idx = Math.max(0, segments.findIndex((seg) => seg.value === value));
  const translateX = useSharedValue(0);

  useEffect(() => {
    if (containerW > 0) {
      // Account for the 4px outer padding on each side so the indicator
      // aligns with the segment cell, not the border.
      const usable = containerW - 8;
      translateX.value = withSpring(idx * (usable / segments.length), {
        damping: 20,
        stiffness: 220,
        mass: 0.9,
      });
    }
  }, [idx, containerW, segments.length, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      style={s.segmentedOuter}
      onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
    >
      {containerW > 0 && (
        <Animated.View
          style={[
            s.segmentedIndicator,
            { left: 4, width: (containerW - 8) / segments.length },
            indicatorStyle,
          ]}
        >
          <LinearGradient
            colors={fam.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1, borderRadius: 9 }}
          />
        </Animated.View>
      )}
      {segments.map((seg) => {
        const active = seg.value === value;
        return (
          <TouchableOpacity
            key={seg.value}
            activeOpacity={0.85}
            onPress={() => onChange(seg.value)}
            style={s.segmentedSegment}
          >
            <Text style={active ? s.segmentedTextActive : s.segmentedTextInactive}>
              {seg.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── RowBlock ───────────────────────────────────────────────────────────
// Toggle / select / value row with a family-tinted gradient icon pill, body
// (label + caption), and a right-side adornment (Switch, chevron, value).
export function RowBlock({
  icon,
  label,
  caption,
  family,
  right,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  caption?: string;
  family: WidgetFamily;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const body = (
    <>
      <Icon icon={icon} family={family} variant="gradient" size="md" style={s.rowIconPill} />
      <View style={s.rowBody}>
        <Text style={s.rowLabel}>{label}</Text>
        {caption && <Text style={s.rowCaption}>{caption}</Text>}
      </View>
      {right}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          s.rowBlock,
          pressed ? { transform: [{ scale: 0.99 }] } : null,
        ]}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={s.rowBlock}>{body}</View>;
}

// ── HelperRow ──────────────────────────────────────────────────────────
// Used inside info sheets — family-tinted icon circle, bold label, soft
// description, separator below.
export function HelperRow({
  icon,
  label,
  description,
  family,
  isLast,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  family: WidgetFamily;
  isLast?: boolean;
}) {
  return (
    <View
      style={[
        s.helperRow,
        {
          borderBottomColor: isLast ? 'transparent' : theme.colors.border + '44',
        },
      ]}
    >
      <Icon icon={icon} family={family} variant="pill" size="md" style={s.helperIconPill} />
      <View style={s.helperBody}>
        <Text style={s.helperLabel}>{label}</Text>
        <Text style={s.helperDesc}>{description}</Text>
      </View>
    </View>
  );
}

// ── SheetCTA ───────────────────────────────────────────────────────────
// Full-width 54-tall gradient submit button. Pass `loading` for a spinner.
// Disabled state collapses to a muted surface block with secondary text.
export function SheetCTA({
  label,
  onPress,
  family,
  icon,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  family: WidgetFamily;
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
}) {
  const fam = familyStyle(family);
  const blocked = disabled || loading;

  if (blocked) {
    return (
      <View style={[s.ctaOuter, s.ctaDisabled]}>
        <View style={s.ctaGradient}>
          {loading ? (
            <ActivityIndicator color={theme.colors.textSecondary} />
          ) : (
            <>
              {icon && <Icon icon={icon} variant="plain" size="md" color={theme.colors.textSecondary} />}
              <Text style={[s.ctaText, s.ctaTextDisabled]}>{label}</Text>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={[s.ctaOuter, theme.shadows.glow(fam.accent)]}
    >
      <LinearGradient
        colors={fam.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={s.ctaGradient}
      >
        {icon && <Icon icon={icon} variant="plain" size="md" color="#fff" />}
        <Text style={s.ctaText}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// Re-export styles so call sites can compose if they need to.
export { sheetStyles } from './styles';

// Silence unused-import warning for Typography while preserving export shape
// expected by some consumers in tests.
export const __Typography = Typography;
